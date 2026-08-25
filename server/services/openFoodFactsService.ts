/**
 * Open Food Facts + Open Beauty Facts integration.
 * Fetches products by category, sorted by scan popularity.
 * License: Open Database License (ODbL) — attribution required.
 * Docs: https://world.openfoodfacts.org/data
 */

import { parseIngredients } from "../utils/ingredientParser.js";

export interface OFFProduct {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  imageUrl: string;
  ingredientsText: string;
  categories: string;
  source: "food" | "beauty";
}

interface OFFApiResponse {
  count: number;
  page: number;
  page_size: number;
  products: OFFApiProduct[];
}

interface OFFApiProduct {
  _id: string;
  product_name?: string;
  product_name_en?: string;    // English product name (when available)
  brands?: string;
  image_front_url?: string;
  ingredients_text?: string;   // local language (may be French, German, etc.)
  ingredients_text_en?: string; // English translation — PREFER THIS
  categories?: string;
  unique_scans_n?: number;
  completeness?: number;
}

const FOOD_API_BASE = "https://world.openfoodfacts.org";
const BEAUTY_API_BASE = "https://world.openbeautyfacts.org";

// Categories to rotate through for daily auto-discovery
const FOOD_CATEGORIES = [
  "en:beverages",
  "en:snacks",
  "en:dairy-products",
  "en:breakfast-cereals",
  "en:condiments",
  "en:sauces",
  "en:soups",
  "en:energy-drinks",
  "en:plant-based-foods",
  "en:fermented-foods",
];

const BEAUTY_CATEGORIES = [
  "en:face-creams",
  "en:sunscreens",
  "en:shampoos",
  "en:body-lotions",
  "en:lip-balms",
  "en:foundations",
  "en:moisturisers",
  "en:serums",
  "en:cleansers",
  "en:toners",
];

// NOTE: the hardcoded India barcode fallback pool was removed 2026-08-20.
// A live audit proved all 30 barcodes returned status:0 "product not found"
// on both OFF hosts (while known-good barcodes resolved fine) — the pool had
// never contributed a product and its failures were silent. Supply now comes
// entirely from budget-bounded category searches.

// NOTE: the former global (EU/US) fallback barcode pool was removed on purpose.
// FirstPledge is an India-context platform: every sourced product must be an
// Indian-market record. When the India search and India barcode pool are both
// exhausted, the correct behavior is to ingest nothing, not to backfill with
// foreign products.

// OFF's countries_tags is crowdsourced and sometimes wrong — foreign-market
// products (e.g. Moroccan dairy) appear under en:india. Brands verified as
// foreign-market during the 2026-07 catalog cleanup are denied at source.
// Indian arms of multinationals (Nestlé India, Kellogg's India, HUL) are NOT
// listed — their India-tagged records are legitimate.
const FOREIGN_BRAND_DENYLIST = /^(jaouda|lilia|hacendado|panzani|poulain|amora|elle\s*&\s*vire|m\.\s*asam|gemey|alpro|eucerin|bird'?s|lotus|barilla|evian|perrier|haribo|kinder|hollandia|chocolove|bragg)\b/i;

// Bare category terms that OFF contributors use as placeholder product names.
// A real product page needs a distinctive name ("Tata Salt", "Chocos"), not
// the category it belongs to.
const GENERIC_PRODUCT_NAME =
  /^(?:lip\s+|face\s+|body\s+|hair\s+)?(?:cleanser|soap|shampoo|conditioner|cream|lotion|balm|serum|toner|moisturi[sz]er|wash|gel|oil|butter|ghee|salt|sugar|milk|curd|yogurt|juice|biscuits?|cookies?|chips|namkeen|snacks?|bread|jam|honey|pickle|tea|coffee|water|oats|muesli|granola|cornflakes|cereals?|ketchup|sauce|noodles?|pasta|atta|flour|rice|dal|paneer|cheese|sunscreen|deodorant|perfume|toothpaste|vinegar|apple\s+cider\s+vinegar)$/i;

export class OpenFoodFactsService {
  private readonly USER_AGENT = "FirstPledgePlatform/1.0 (maitreypatel@getpowerplay.in)";

  /**
   * Fetch with 10s abort timeout. Prevents OFF API hangs from consuming the
   * entire Vercel 60s function budget before any ingredient analysis happens.
   */
  private async fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        headers: { "User-Agent": this.USER_AGENT },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch products for daily cron ingestion. INDIA-ONLY sourcing.
   *
   * OFF's India coverage is shallow, so the strategy is breadth over depth:
   * 1. Search the day's primary source (food/beauty alternating), rotating
   *    through up to 3 categories at shallow pages (1-3), skipping products
   *    already in the DB at search time so top-scanned repeats don't mask
   *    deeper results.
   * 2. If the primary source is dry (Open Beauty Facts India often is), try
   *    the OTHER source the same way — still India-only.
   *
   * Search requests are budgeted (max 8/run, spaced) to respect OFF's
   * ~10 searches/minute rate limit. If everything is dry, returns [] —
   * an empty day beats backfilling with foreign-market products.
   *
   * @param checkExists - optional async fn; returns true if product is already in DB.
   */
  async fetchDailyProducts(
    count: number = 2,
    checkExists?: (name: string, brand: string) => Promise<boolean>
  ): Promise<OFFProduct[]> {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );

    const primary: "food" | "beauty" = dayOfYear % 2 === 0 ? "beauty" : "food";
    const sources: Array<"food" | "beauty"> = [primary, primary === "food" ? "beauty" : "food"];

    // Shallow page cycling (1-3): India-scoped categories rarely have depth
    // beyond a few pages; deeper cycling returns empty pages for weeks.
    const basePage = (Math.floor(dayOfYear / 7) % 3) + 1;

    const collected: OFFProduct[] = [];
    const seenBarcodes = new Set<string>();
    let searchBudget = 8;

    const collect = async (found: OFFProduct[]) => {
      for (const p of found) {
        if (collected.length >= count) return;
        if (seenBarcodes.has(p.barcode)) continue;
        seenBarcodes.add(p.barcode);
        // India baseline: GS1 company prefix 890 = registered in India.
        // OFF's en:india tag also catches imports (US/Korean brands stocked
        // by Indian retailers — observed live: Chocolove, Bragg); those are
        // out of scope for an India-context catalog.
        if (!p.barcode.startsWith("890")) {
          console.log(`[OFF] Skip "${p.name}" (${p.brand}) — non-India barcode ${p.barcode}`);
          continue;
        }
        // Showcase-quality gate: a product without a real brand or name is
        // not catalog material, whatever its data completeness.
        if (!p.brand || /^unknown/i.test(p.brand) || /^unknown/i.test(p.name)) {
          console.log(`[OFF] Skip "${p.name}" — no usable brand`);
          continue;
        }
        // OFF country tags are crowdsourced; verified foreign-market brands
        // are denied even when tagged en:india.
        if (FOREIGN_BRAND_DENYLIST.test(p.brand.trim())) {
          console.log(`[OFF] Skip "${p.name}" (${p.brand}) — verified foreign-market brand`);
          continue;
        }
        // Generic-name gate: a bare category word ("cleanser", "Oats") or an
        // all-lowercase placeholder name ("kissan fresh tomato") signals a
        // half-filled OFF record, not a real product page. Distinctive
        // capitalized names ("Chocos", "Tata Salt") stay eligible.
        const nameTrim = p.name.trim();
        const isGenericName = GENERIC_PRODUCT_NAME.test(nameTrim);
        const isLowercasePlaceholder = /^[a-z][a-z\s-]*$/.test(nameTrim);
        if (isGenericName || isLowercasePlaceholder) {
          console.log(`[OFF] Skip "${p.name}" (${p.brand}) — generic/placeholder product name`);
          continue;
        }
        // Ingredient-list sanity: a 1-item list makes a pointless safety
        // report; a huge list (>35) is almost always multi-language or OCR
        // garbage that starves the analysis budget for days without ever
        // completing.
        const parsedCount = parseIngredients(p.ingredientsText).length;
        if (parsedCount < 2) {
          console.log(`[OFF] Skip "${p.name}" (${p.brand}) — only ${parsedCount} parseable ingredient(s)`);
          continue;
        }
        if (parsedCount > 35) {
          console.log(`[OFF] Skip "${p.name}" (${p.brand}) — ${parsedCount} parsed ingredients, likely garbled label`);
          continue;
        }
        if (checkExists && (await checkExists(p.name, p.brand))) {
          console.log(`[OFF] Skip "${p.name}" — already in DB`);
          continue;
        }
        collected.push(p);
      }
    };

    const sweepCategories = async (source: "food" | "beauty", from: number, to: number) => {
      const categories = source === "beauty" ? BEAUTY_CATEGORIES : FOOD_CATEGORIES;
      for (let c = from; c < to && c < categories.length && collected.length < count && searchBudget > 0; c++) {
        const category = categories[(dayOfYear + c) % categories.length];
        const pages = basePage === 1 ? [1] : [basePage, 1];
        for (const page of pages) {
          if (collected.length >= count || searchBudget <= 0) break;
          searchBudget--;
          try {
            const found = await this.fetchByCategoryAndCountry(category, source, "en:india", count, page);
            await collect(found);
            if (found.length > 0) {
              console.log(`[OFF] India ${source}/${category} page ${page}: ${found.length} usable, ${collected.length}/${count} collected`);
            }
          } catch (err) {
            console.warn(`[OFF] India search failed (${source}/${category} p${page}): ${err}`);
          }
        }
      }
    };

    // Pass 1: 3 categories per source — the primary source must never spend
    // the whole search budget before the cross-source fallback gets a turn.
    for (const source of sources) {
      await sweepCategories(source, 0, 3);
      if (collected.length >= count) break;
    }
    // Pass 2: leftover budget reaches deeper into each source's category list.
    for (const source of sources) {
      if (collected.length >= count || searchBudget <= 0) break;
      await sweepCategories(source, 3, Number.MAX_SAFE_INTEGER);
    }

    if (collected.length === 0) {
      // India-only sourcing: no global fallback. An empty day is preferable
      // to ingesting EU/US-market products into an India-context catalog.
      console.log("[OFF] India sources exhausted — ingesting nothing this run");
    }
    return collected;
  }

  async fetchByCategoryAndCountry(
    category: string,
    source: "food" | "beauty",
    countryTag: string,
    count: number = 5,
    page: number = 1
  ): Promise<OFFProduct[]> {
    const base = source === "beauty" ? BEAUTY_API_BASE : FOOD_API_BASE;
    const params = new URLSearchParams({
      categories_tags: category,
      countries_tags: countryTag,
      fields: "_id,product_name,product_name_en,brands,image_front_url,ingredients_text,ingredients_text_en,categories,unique_scans_n,completeness",
      page_size: String(Math.max(count * 4, 20)),
      page: String(page),
      sort_by: "unique_scans_n",
    });
    const url = `${base}/api/v2/search?${params}`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) throw new Error(`OFF India API ${res.status}: ${category}`);
    const data = await res.json();
    // Return EVERY usable record — do not slice to `count` here. Pages are
    // sorted by scan count, so the top entries are exactly the ones most
    // likely already ingested or placeholder-named; slicing before the
    // caller's quality gates permanently hid eligible products sitting at
    // position count+1 (this starved the cron for days in Aug 2026).
    return (data.products ?? [])
      .filter((p: OFFApiProduct) => this.isUsable(p))
      .map((p: OFFApiProduct) => this.normalize(p, source));
  }

  async fetchByCategory(
    category: string,
    source: "food" | "beauty",
    count: number = 5,
    page: number = 1
  ): Promise<OFFProduct[]> {
    const base = source === "beauty" ? BEAUTY_API_BASE : FOOD_API_BASE;

    const params = new URLSearchParams({
      categories_tags: category,
      fields: "_id,product_name,product_name_en,brands,image_front_url,ingredients_text,ingredients_text_en,categories,unique_scans_n,completeness",
      page_size: String(count * 4),
      page: String(page),
      sort_by: "unique_scans_n",
    });
    const url = `${base}/api/v2/search?${params}`;

    const res = await this.fetchWithTimeout(url);

    if (!res.ok) {
      // Fallback to v1 search on failure
      return this.fetchByCategoryV1(category, source, count, page);
    }

    const data = await res.json();
    const products: OFFApiProduct[] = data.products ?? [];

    return products
      .filter((p) => this.isUsable(p))
      .slice(0, count)
      .map((p) => this.normalize(p, source));
  }

  private async fetchByCategoryV1(
    category: string,
    source: "food" | "beauty",
    count: number,
    page: number
  ): Promise<OFFProduct[]> {
    const base = source === "beauty" ? BEAUTY_API_BASE : FOOD_API_BASE;
    const url = `${base}/cgi/search.pl?action=process&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(category)}&json=1&page_size=${count * 4}&page=${page}&sort_by=unique_scans_n&fields=_id,product_name,product_name_en,brands,image_front_url,ingredients_text,ingredients_text_en,categories`;

    const res = await this.fetchWithTimeout(url);

    if (!res.ok) {
      throw new Error(`OFF API unavailable (${res.status}) for category: ${category}`);
    }

    const data: OFFApiResponse = await res.json();
    return (data.products || [])
      .filter((p) => this.isUsable(p))
      .slice(0, count)
      .map((p) => this.normalize(p, source));
  }

  async fetchByBarcode(barcode: string, source: "food" | "beauty" = "food"): Promise<OFFProduct | null> {
    const base = source === "beauty" ? BEAUTY_API_BASE : FOOD_API_BASE;
    const url = `${base}/api/v0/product/${barcode}.json`;

    const res = await this.fetchWithTimeout(url);

    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const product: OFFApiProduct = { _id: barcode, ...data.product };
    if (!this.isUsable(product)) return null;

    return this.normalize(product, source);
  }

  private isUsable(p: OFFApiProduct): boolean {
    const name = (p.product_name_en || p.product_name)?.trim();
    // Accept if either English or local-language ingredient text is usable
    const textEn = p.ingredients_text_en?.trim();
    const textLocal = p.ingredients_text?.trim();
    const text = textEn || textLocal;
    if (!name || !text || text.length < 15) return false;
    const letterRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    if (letterRatio < 0.4) return false;
    if (!/[,;]/.test(text)) return false;
    return true;
  }

  private normalize(p: OFFApiProduct, source: "food" | "beauty"): OFFProduct {
    // Prefer English ingredient text — avoids French/German ingredient names on display
    const ingredientsText = p.ingredients_text_en?.trim() || p.ingredients_text?.trim() || "";
    // Prefer English product name
    const name = this.cleanName(p.product_name_en?.trim() || p.product_name || "Unknown Product");

    return {
      id: p._id,
      barcode: p._id,
      name,
      brand: this.cleanName(p.brands ?? "Unknown Brand"),
      imageUrl: p.image_front_url ?? "",
      ingredientsText,
      categories: p.categories ?? "",
      source,
    };
  }

  private cleanName(s: string): string {
    // OFF uses comma-separated for multiple brands — take first
    return s.split(",")[0].trim();
  }
}
