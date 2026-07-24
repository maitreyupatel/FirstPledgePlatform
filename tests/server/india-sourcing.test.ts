/**
 * India-only product sourcing tests.
 * Invariants:
 *  1. fetchDailyProducts never issues a category search without the India
 *     country constraint
 *  2. When India search and India barcodes are exhausted, it returns [] —
 *     no global (EU/US) backfill
 *  3. The ingredient parser drops label disclaimers and OCR/split junk that
 *     previously polluted product pages
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenFoodFactsService } from "../../server/services/openFoodFactsService.js";
import { parseIngredients } from "../../server/utils/ingredientParser.js";

describe("OpenFoodFactsService — India-only sourcing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns [] when India sources are exhausted, without any global search", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/v2/search")) {
        return { ok: true, json: async () => ({ products: [] }) };
      }
      // Barcode lookups: product not found
      return { ok: true, json: async () => ({ status: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new OpenFoodFactsService();
    const products = await service.fetchDailyProducts(2);

    expect(products).toEqual([]);

    const urls: string[] = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    const searchUrls = urls.filter((u) => u.includes("/api/v2/search") || u.includes("search.pl"));
    // Every category search must carry the India constraint
    for (const u of searchUrls) {
      expect(u).toContain("countries_tags=en%3Aindia");
    }
    // Any barcode lookups must come from the curated India pool (890x GS1
    // prefix = India), never the old global EU/US pool
    const barcodeUrls = urls.filter((u) => u.includes("/api/v0/product/"));
    for (const u of barcodeUrls) {
      const barcode = u.split("/api/v0/product/")[1].replace(".json", "");
      expect(barcode.startsWith("890")).toBe(true);
    }
  });

  it("returns India search results when available", async () => {
    const indiaProduct = {
      _id: "8901719110672",
      product_name_en: "Parle-G Original Gluco Biscuits",
      brands: "Parle",
      image_front_url: "https://images.openfoodfacts.org/parle-g.jpg",
      ingredients_text_en: "Wheat flour, sugar, refined palm oil, invert sugar syrup, salt",
      categories: "Biscuits",
      unique_scans_n: 5000,
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/v2/search") && url.includes("countries_tags=en%3Aindia")) {
        return { ok: true, json: async () => ({ products: [indiaProduct, indiaProduct] }) };
      }
      return { ok: true, json: async () => ({ products: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new OpenFoodFactsService();
    const products = await service.fetchDailyProducts(2);

    expect(products.length).toBeGreaterThan(0);
    expect(products[0].brand).toBe("Parle");
  });
});

describe("parseIngredients — label-noise hardening", () => {
  it("drops 'contains' allergen disclaimers", () => {
    const out = parseIngredients("Milk solids, sugar, Contains Milk, May contain traces of nuts");
    expect(out).toEqual(["Milk solids", "sugar"]);
  });

  it("strips unmatched trailing parens from comma-split fragments", () => {
    const out = parseIngredients("Mozzarella Cheese (Milk, Microbial cultures and Microbial Rennet), salt");
    // balanced parens are stripped whole; nothing should end with a stray ")"
    for (const ing of out) {
      expect(ing.endsWith(")")).toBe(false);
    }
  });

  it("strips leading stray punctuation from OCR text", () => {
    const out = parseIngredients("aqua, -Butylene Glycol, '3-O-Ethyl Ascorbic Acid");
    expect(out).toContain("Butylene Glycol");
    expect(out.some((i) => i.startsWith("-") || i.startsWith("'"))).toBe(false);
  });

  it("still parses a normal Indian label correctly", () => {
    const out = parseIngredients(
      "Wheat flour, sugar, refined palm oil, invert sugar syrup, iodised salt, raising agents (E503, E500)"
    );
    expect(out).toContain("Wheat flour");
    expect(out).toContain("iodised salt");
    expect(out.length).toBeGreaterThanOrEqual(5);
  });
});
