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

export class OpenFoodFactsService {
  /**
   * Fetch top products from Open Food Facts or Open Beauty Facts.
   * Picks category based on day-of-year to rotate through all categories over time.
   */
  async fetchDailyProducts(count: number = 2): Promise<OFFProduct[]> {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );

    // Alternate between food and beauty each day
    const useBeauty = dayOfYear % 2 === 0;
    const categories = useBeauty ? BEAUTY_CATEGORIES : FOOD_CATEGORIES;
    const category = categories[dayOfYear % categories.length];
    const source = useBeauty ? "beauty" : "food";

    return this.fetchByCategory(category, source, count);
  }

  async fetchByCategory(
    category: string,
    source: "food" | "beauty",
    count: number = 5,
    page: number = 1
  ): Promise<OFFProduct[]> {
    const base = source === "beauty" ? BEAUTY_API_BASE : FOOD_API_BASE;
    const url = `${base}/category/${encodeURIComponent(category)}/${page}.json?fields=_id,product_name,brands,image_front_url,ingredients_text,categories,unique_scans_n,completeness&page_size=${count * 3}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "FirstPledgePlatform/1.0 (maitreypatel@getpowerplay.in)" },
    });

    if (!res.ok) {
      throw new Error(`OFF API error ${res.status}: ${category}`);
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
