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

// Popular product barcodes as guaranteed fallback when search APIs are down
// Food: globally recognizable, high scan counts on OFF
// Beauty: verified present on Open Beauty Facts
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
   * Fetch top products from Open Food Facts or Open Beauty Facts.
   * Alternates food/beauty daily. Falls back to known barcodes if search is down.
   */
  async fetchDailyProducts(count: number = 2): Promise<OFFProduct[]> {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );

    const useBeauty = dayOfYear % 2 === 0;
    const categories = useBeauty ? BEAUTY_CATEGORIES : FOOD_CATEGORIES;
    const category = categories[dayOfYear % categories.length];
    const source = useBeauty ? "beauty" : "food";

    try {
      const results = await this.fetchByCategory(category, source, count);
      if (results.length > 0) return results;
    } catch (err) {
      console.warn(`[OFF] Category search failed (${category}): ${err}. Using barcode fallback.`);
    }

    // Fallback: look up known popular products by barcode
    const fallbacks = FALLBACK_BARCODES.filter((b) => b.source === source);
    const results: OFFProduct[] = [];
    for (const entry of fallbacks) {
      if (results.length >= count) break;
      try {
        const p = await this.fetchByBarcode(entry.barcode, entry.source);
        if (p) results.push(p);
      } catch { continue; }
    }
    return results;
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
    return !!(
      p.product_name?.trim() &&
      p.ingredients_text?.trim() &&
      p.ingredients_text.length > 10
    );
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
