/**
 * Open Food Facts + Open Beauty Facts integration.
 * Fetches products by category, sorted by scan popularity.
 * License: Open Database License (ODbL) — attribution required.
 * Docs: https://world.openfoodfacts.org/data
 */

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

// Popular Indian product barcodes — priority fallback for India-first selection
// Sourced from Open Food Facts India entries with high scan counts
const INDIA_FALLBACK_BARCODES: Array<{ barcode: string; source: "food" | "beauty" }> = [
  // ── Indian food / beverages ────────────────────────────────────────────────
  { barcode: "8901719110672", source: "food" },  // Parle-G Biscuits
  { barcode: "8901030800245", source: "food" },  // Maggi 2-Minute Noodles
  { barcode: "8901396044072", source: "food" },  // Bournvita Health Drink
  { barcode: "8901052003103", source: "food" },  // Haldiram's Bhujia
  { barcode: "8901396025750", source: "food" },  // Horlicks
  { barcode: "8901063053786", source: "food" },  // Britannia Good Day Butter Cookies
  { barcode: "8906002570016", source: "food" },  // Paper Boat Aamras
  { barcode: "8901030800443", source: "food" },  // Maggi Masala Noodles
  { barcode: "8901719116483", source: "food" },  // Parle Krack-Jack
  { barcode: "8901719112157", source: "food" },  // Monaco Biscuits
  { barcode: "8901063149947", source: "food" },  // 50-50 Biscuits
  { barcode: "8904317600052", source: "food" },  // Dabur Honey
  { barcode: "8901526100017", source: "food" },  // MDH Garam Masala
  { barcode: "8906052310007", source: "food" },  // Bournville Dark Chocolate
  { barcode: "8906002570023", source: "food" },  // Paper Boat Jamun
  { barcode: "8904247000024", source: "food" },  // Aashirvaad Atta
  { barcode: "8906060060019", source: "food" },  // Patanjali Amla Juice
  { barcode: "8901058005026", source: "food" },  // Amul Butter Milk
  { barcode: "8901719100017", source: "food" },  // Hide & Seek Biscuits
  // ── Indian beauty / personal care ─────────────────────────────────────────
  { barcode: "8901138523435", source: "beauty" }, // Himalaya Neem Face Wash
  { barcode: "8901030100047", source: "beauty" }, // Pond's Cold Cream
  { barcode: "8901396025590", source: "beauty" }, // Lakme Sun Expert SPF
  { barcode: "8906067260047", source: "beauty" }, // Mamaearth Vitamin C Face Wash
  { barcode: "8906110380018", source: "beauty" }, // WOW Skin Science ACV Shampoo
  { barcode: "8904098100019", source: "beauty" }, // Biotique Bio Cucumber Toner
  { barcode: "8901030501017", source: "beauty" }, // Glow & Lovely Cream
  { barcode: "8901030560137", source: "beauty" }, // Sunsilk Shampoo
  { barcode: "8901554550033", source: "beauty" }, // Johnson's Baby Shampoo
  { barcode: "8901030801075", source: "beauty" }, // Vaseline Intensive Care
];

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
const FOREIGN_BRAND_DENYLIST = /^(jaouda|lilia|hacendado|panzani|poulain|amora|elle\s*&\s*vire|m\.\s*asam|gemey|alpro|eucerin|bird'?s|lotus|barilla|evian|perrier|haribo|kinder|hollandia)\b/i;

// Bare category terms that OFF contributors use as placeholder product names.
// A real product page needs a distinctive name ("Tata Salt", "Chocos"), not
// the category it belongs to.
const GENERIC_PRODUCT_NAME =
  /^(?:lip\s+|face\s+|body\s+|hair\s+)?(?:cleanser|soap|shampoo|conditioner|cream|lotion|balm|serum|toner|moisturi[sz]er|wash|gel|oil|butter|ghee|salt|sugar|milk|curd|yogurt|juice|biscuits?|cookies?|chips|namkeen|snacks?|bread|jam|honey|pickle|tea|coffee|water)$/i;

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
   * 3. India barcode pool (both sources) as the final fallback.
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
        // Generic-name gate: a bare category word ("cleanser", "lip balm") or
        // an all-lowercase placeholder name signals a half-filled OFF record,
        // not a real product page. Distinctive single-word names with
        // capitalization ("Chocos") stay eligible.
        const nameTrim = p.name.trim();
        const isGenericName = GENERIC_PRODUCT_NAME.test(nameTrim);
        const isLowercasePlaceholder =
          /^[a-z][a-z\s-]*$/.test(nameTrim) && nameTrim.split(/\s+/).length <= 2;
        if (isGenericName || isLowercasePlaceholder) {
          console.log(`[OFF] Skip "${p.name}" (${p.brand}) — generic/placeholder product name`);
          continue;
        }
        if (checkExists && (await checkExists(p.name, p.brand))) {
          console.log(`[OFF] Skip "${p.name}" — already in DB`);
          continue;
        }
        collected.push(p);
      }
    };

    for (const source of sources) {
      const categories = source === "beauty" ? BEAUTY_CATEGORIES : FOOD_CATEGORIES;
      for (let c = 0; c < 3 && collected.length < count && searchBudget > 0; c++) {
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
      if (collected.length >= count) break;
    }

    if (collected.length >= count) return collected;

    // ── Final fallback: India barcode pool (both sources, primary first) ──
    const pool = [
      ...INDIA_FALLBACK_BARCODES.filter((b) => b.source === primary),
      ...INDIA_FALLBACK_BARCODES.filter((b) => b.source !== primary),
    ].filter((b) => !seenBarcodes.has(b.barcode));
    const barcodeResults = await this.resolveBarcodeFallbacks(pool, count - collected.length, checkExists);
    collected.push(...barcodeResults);

    if (collected.length === 0) {
      // India-only sourcing: no global fallback. An empty day is preferable
      // to ingesting EU/US-market products into an India-context catalog.
      console.log("[OFF] India sources exhausted — ingesting nothing this run");
    }
    return collected;
  }

  private async resolveBarcodeFallbacks(
    list: Array<{ barcode: string; source: "food" | "beauty" }>,
    count: number,
    checkExists?: (name: string, brand: string) => Promise<boolean>
  ): Promise<OFFProduct[]> {
    const results: OFFProduct[] = [];
    for (const entry of list) {
      if (results.length >= count) break;
      try {
        const p = await this.fetchByBarcode(entry.barcode, entry.source);
        if (!p) continue;
        // Skip if already in DB — avoids returning products the cron will immediately discard
        if (checkExists && await checkExists(p.name, p.brand)) {
          console.log(`[OFF] Barcode ${entry.barcode} skipped — "${p.name}" already in DB`);
          continue;
        }
        results.push(p);
      } catch { continue; }
    }
    return results;
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
      page_size: String(count * 4),
      page: String(page),
      sort_by: "unique_scans_n",
    });
    const url = `${base}/api/v2/search?${params}`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) throw new Error(`OFF India API ${res.status}: ${category}`);
    const data = await res.json();
    return (data.products ?? [])
      .filter((p: OFFApiProduct) => this.isUsable(p))
      .slice(0, count)
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
