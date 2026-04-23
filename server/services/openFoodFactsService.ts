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
  brands?: string;
  image_front_url?: string;
  ingredients_text?: string;
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
  { barcode: "8901719110672", source: "food" },  // Parle-G Biscuits
  { barcode: "8901030800245", source: "food" },  // Maggi 2-Minute Noodles
  { barcode: "8901396044072", source: "food" },  // Bournvita Health Drink
  { barcode: "8901052003103", source: "food" },  // Haldiram's Bhujia
  { barcode: "8901030500101", source: "food" },  // Glow & Lovely Cream
  { barcode: "8901396025750", source: "food" },  // Horlicks
  { barcode: "8901063053786", source: "food" },  // Britannia Good Day Butter Cookies
  { barcode: "8906002570016", source: "food" },  // Paper Boat Aamras
  { barcode: "8901138523435", source: "beauty" }, // Himalaya Neem Face Wash
  { barcode: "8901030100047", source: "beauty" }, // Pond's Cold Cream
  { barcode: "8901396025590", source: "beauty" }, // Lakme Sun Expert SPF
  { barcode: "8906067260047", source: "beauty" }, // Mamaearth Vitamin C Face Wash
  { barcode: "8906110380018", source: "beauty" }, // WOW Skin Science Apple Cider Vinegar Shampoo
  { barcode: "8904098100019", source: "beauty" }, // Biotique Bio Cucumber Toner
];

// Global fallback barcodes when India-specific search fails
const FALLBACK_BARCODES: Array<{ barcode: string; source: "food" | "beauty" }> = [
  { barcode: "0048500201282", source: "food" },  // Tropicana Orange Juice
  { barcode: "3017620422003", source: "food" },  // Nutella
  { barcode: "0030000301913", source: "food" },  // Quaker Old Fashioned Oats
  { barcode: "0041196990005", source: "food" },  // Heinz Tomato Ketchup
  { barcode: "0028400028738", source: "food" },  // Lay's Classic
  { barcode: "4005808194001", source: "beauty" }, // Nivea Creme
  { barcode: "3574661385624", source: "beauty" }, // Cetaphil Daily Moisturizer
  { barcode: "0079400023780", source: "beauty" }, // Dove Beauty Bar
  { barcode: "3600521826492", source: "beauty" }, // L'Oreal Elvive
  { barcode: "5000157024229", source: "beauty" }, // Simple Kind To Skin
];

export class OpenFoodFactsService {
  /**
   * Fetch products for daily cron ingestion.
   *
   * Priority order:
   * 1. India-specific OFF search (countries_tags=en:india) — high scan count
   * 2. India barcode fallback list (known popular Indian brands)
   * 3. Global category search (alternates food/beauty by day)
   * 4. Global barcode fallback list
   *
   * India gets priority because: (a) product is India-focused, (b) Indian
   * consumers are primary audience, (c) Amazon.in / Flipkart bestsellers
   * are a strong proxy for what people actually buy and care about.
   */
  async fetchDailyProducts(count: number = 2): Promise<OFFProduct[]> {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );

    const useBeauty = dayOfYear % 2 === 0;
    const source = useBeauty ? "beauty" : "food";

    // ── Step 1: India-specific category search ──────────────────────
    const indiaCategories = useBeauty ? BEAUTY_CATEGORIES : FOOD_CATEGORIES;
    const indiaCategory = indiaCategories[dayOfYear % indiaCategories.length];
    try {
      const indiaResults = await this.fetchByCategoryAndCountry(indiaCategory, source, "en:india", count);
      if (indiaResults.length >= count) {
        console.log(`[OFF] India search hit: ${indiaResults.length} products in ${indiaCategory}`);
        return indiaResults;
      }
      // Partial results — fill with India barcodes
      if (indiaResults.length > 0) {
        const remaining = count - indiaResults.length;
        const barcodeResults = await this.resolveBarcodeFallbacks(
          INDIA_FALLBACK_BARCODES.filter((b) => b.source === source),
          remaining
        );
        return [...indiaResults, ...barcodeResults];
      }
    } catch (err) {
      console.warn(`[OFF] India category search failed (${indiaCategory}): ${err}`);
    }

    // ── Step 2: India barcode fallback ─────────────────────────────
    const indiaBarcode = await this.resolveBarcodeFallbacks(
      INDIA_FALLBACK_BARCODES.filter((b) => b.source === source),
      count
    );
    if (indiaBarcode.length > 0) {
      console.log(`[OFF] India barcode fallback: ${indiaBarcode.length} products`);
      return indiaBarcode;
    }

    // ── Step 3: Global category search ────────────────────────────
    const globalCategory = indiaCategories[(dayOfYear + 3) % indiaCategories.length];
    try {
      const globalResults = await this.fetchByCategory(globalCategory, source, count);
      if (globalResults.length > 0) {
        console.log(`[OFF] Global search hit: ${globalResults.length} products`);
        return globalResults;
      }
    } catch (err) {
      console.warn(`[OFF] Global category search failed (${globalCategory}): ${err}`);
    }

    // ── Step 4: Global barcode fallback ───────────────────────────
    return this.resolveBarcodeFallbacks(
      FALLBACK_BARCODES.filter((b) => b.source === source),
      count
    );
  }

  private async resolveBarcodeFallbacks(
    list: Array<{ barcode: string; source: "food" | "beauty" }>,
    count: number
  ): Promise<OFFProduct[]> {
    const results: OFFProduct[] = [];
    for (const entry of list) {
      if (results.length >= count) break;
      try {
        const p = await this.fetchByBarcode(entry.barcode, entry.source);
        if (p) results.push(p);
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
      fields: "_id,product_name,brands,image_front_url,ingredients_text,categories,unique_scans_n,completeness",
      page_size: String(count * 4),
      page: String(page),
      sort_by: "unique_scans_n",
    });
    const url = `${base}/api/v2/search?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FirstPledgePlatform/1.0 (maitreypatel@getpowerplay.in)" },
    });
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

    // Use v2 search API — more reliable than category browse endpoint
    const params = new URLSearchParams({
      categories_tags: category,
      fields: "_id,product_name,brands,image_front_url,ingredients_text,categories,unique_scans_n,completeness",
      page_size: String(count * 4),
      page: String(page),
      sort_by: "unique_scans_n",
    });
    const url = `${base}/api/v2/search?${params}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "FirstPledgePlatform/1.0 (maitreypatel@getpowerplay.in)" },
    });

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
    const url = `${base}/cgi/search.pl?action=process&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(category)}&json=1&page_size=${count * 4}&page=${page}&sort_by=unique_scans_n&fields=_id,product_name,brands,image_front_url,ingredients_text,categories`;

    const res = await fetch(url, {
      headers: { "User-Agent": "FirstPledgePlatform/1.0 (maitreypatel@getpowerplay.in)" },
    });

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

    const res = await fetch(url, {
      headers: { "User-Agent": "FirstPledgePlatform/1.0 (maitreypatel@getpowerplay.in)" },
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const product: OFFApiProduct = { _id: barcode, ...data.product };
    if (!this.isUsable(product)) return null;

    return this.normalize(product, source);
  }

  private isUsable(p: OFFApiProduct): boolean {
    const name = p.product_name?.trim();
    const text = p.ingredients_text?.trim();
    if (!name || !text || text.length < 15) return false;
    // Reject if ingredient text is mostly digits/codes (corrupt OFF data)
    const letterRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    if (letterRatio < 0.4) return false;
    // Must have at least one comma or semicolon (real ingredient lists do)
    if (!/[,;]/.test(text)) return false;
    return true;
  }

  private normalize(p: OFFApiProduct, source: "food" | "beauty"): OFFProduct {
    return {
      id: p._id,
      barcode: p._id,
      name: this.cleanName(p.product_name ?? "Unknown Product"),
      brand: this.cleanName(p.brands ?? "Unknown Brand"),
      imageUrl: p.image_front_url ?? "",
      ingredientsText: p.ingredients_text ?? "",
      categories: p.categories ?? "",
      source,
    };
  }

  private cleanName(s: string): string {
    // OFF uses comma-separated for multiple brands — take first
    return s.split(",")[0].trim();
  }
}
