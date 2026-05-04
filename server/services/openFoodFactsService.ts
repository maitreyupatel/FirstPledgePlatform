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

// Global fallback barcodes when India-specific search fails
const FALLBACK_BARCODES: Array<{ barcode: string; source: "food" | "beauty" }> = [
  // ── Global food / beverages ────────────────────────────────────────────────
  { barcode: "3017620422003", source: "food" },  // Nutella 400g
  { barcode: "0030000301913", source: "food" },  // Quaker Old Fashioned Oats
  { barcode: "0041196990005", source: "food" },  // Heinz Tomato Ketchup
  { barcode: "0028400028738", source: "food" },  // Lay's Classic
  { barcode: "0048500201282", source: "food" },  // Tropicana Orange Juice
  { barcode: "9002490100070", source: "food" },  // Red Bull Energy Drink
  { barcode: "5449000000996", source: "food" },  // Coca-Cola Original (EU)
  { barcode: "5449000131805", source: "food" },  // Coca-Cola Zero Sugar
  { barcode: "7622300489861", source: "food" },  // Oreo Original
  { barcode: "5000112547580", source: "food" },  // Cadbury Dairy Milk
  { barcode: "3045320094239", source: "food" },  // Kinder Bueno
  { barcode: "4008400500010", source: "food" },  // Haribo Goldbears
  { barcode: "8076809513364", source: "food" },  // Barilla Spaghetti
  { barcode: "3228857000920", source: "food" },  // Evian Natural Mineral Water
  { barcode: "4017100302941", source: "food" },  // Knorr Chicken Bouillon
  { barcode: "5000157024229", source: "food" },  // McVities Digestives
  { barcode: "3155250349793", source: "food" },  // Perrier Sparkling Water
  { barcode: "7613031241316", source: "food" },  // Nestlé Cheerios
  { barcode: "3046920028897", source: "food" },  // Lindt Excellence Dark 70%
  { barcode: "5411188100928", source: "food" },  // Lotus Biscoff
  // ── Global beauty / personal care ─────────────────────────────────────────
  { barcode: "4005808194001", source: "beauty" }, // Nivea Creme
  { barcode: "3574661385624", source: "beauty" }, // Cetaphil Daily Moisturizer
  { barcode: "0079400023780", source: "beauty" }, // Dove Beauty Bar
  { barcode: "3600521826492", source: "beauty" }, // L'Oreal Elvive
  { barcode: "3600524018955", source: "beauty" }, // Garnier Micellar Water
  { barcode: "3474630305083", source: "beauty" }, // L'Oreal Age Perfect
  { barcode: "3600524039691", source: "beauty" }, // Garnier Fructis Shampoo
  { barcode: "5000157030879", source: "beauty" }, // Simple Kind To Skin Cleanser
  { barcode: "3614271010803", source: "beauty" }, // CeraVe Moisturizing Cream
  { barcode: "0075609027440", source: "beauty" }, // Neutrogena Oil-Free Moisturizer
];

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
   * Fetch products for daily cron ingestion.
   *
   * Priority order:
   * 1. India-specific OFF search (countries_tags=en:india) — high scan count
   * 2. India barcode fallback list (known popular Indian brands)
   * 3. Global category search (alternates food/beauty by day)
   * 4. Global barcode fallback list
   *
   * @param checkExists - optional async fn; returns true if product is already in DB.
   *   Used to skip already-ingested barcodes from fallback lists so the pool
   *   never appears exhausted even after all 30+ barcodes have been seen once.
   */
  async fetchDailyProducts(
    count: number = 2,
    checkExists?: (name: string, brand: string) => Promise<boolean>
  ): Promise<OFFProduct[]> {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );

    const useBeauty = dayOfYear % 2 === 0;
    const source = useBeauty ? "beauty" : "food";

    // Cycle through pages weekly so the same category shows different products
    // across the year instead of always returning the same top-N results.
    const page = Math.floor(dayOfYear / 7) % 10 + 1;

    // ── Step 1: India-specific category search ──────────────────────
    const indiaCategories = useBeauty ? BEAUTY_CATEGORIES : FOOD_CATEGORIES;
    const indiaCategory = indiaCategories[dayOfYear % indiaCategories.length];
    try {
      const indiaResults = await this.fetchByCategoryAndCountry(indiaCategory, source, "en:india", count, page);
      if (indiaResults.length >= count) {
        console.log(`[OFF] India search hit: ${indiaResults.length} products in ${indiaCategory} (page ${page})`);
        return indiaResults;
      }
      // Partial results — fill with India barcodes
      if (indiaResults.length > 0) {
        const remaining = count - indiaResults.length;
        const barcodeResults = await this.resolveBarcodeFallbacks(
          INDIA_FALLBACK_BARCODES.filter((b) => b.source === source),
          remaining,
          checkExists
        );
        return [...indiaResults, ...barcodeResults];
      }
    } catch (err) {
      console.warn(`[OFF] India category search failed (${indiaCategory}): ${err}`);
    }

    // ── Step 2: India barcode fallback ─────────────────────────────
    const indiaBarcode = await this.resolveBarcodeFallbacks(
      INDIA_FALLBACK_BARCODES.filter((b) => b.source === source),
      count,
      checkExists
    );
    if (indiaBarcode.length > 0) {
      console.log(`[OFF] India barcode fallback: ${indiaBarcode.length} products`);
      return indiaBarcode;
    }

    // ── Step 3: Global category search ────────────────────────────
    const globalCategory = indiaCategories[(dayOfYear + 3) % indiaCategories.length];
    const globalPage = Math.floor(dayOfYear / 7) % 10 + 1;
    try {
      const globalResults = await this.fetchByCategory(globalCategory, source, count, globalPage);
      if (globalResults.length > 0) {
        console.log(`[OFF] Global search hit: ${globalResults.length} products (page ${globalPage})`);
        return globalResults;
      }
    } catch (err) {
      console.warn(`[OFF] Global category search failed (${globalCategory}): ${err}`);
    }

    // ── Step 4: Global barcode fallback ───────────────────────────
    return this.resolveBarcodeFallbacks(
      FALLBACK_BARCODES.filter((b) => b.source === source),
      count,
      checkExists
    );
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
