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
import {
  parseIngredients,
  looksGarbledIngredientName,
} from "../../server/utils/ingredientParser.js";
import { namesLookAlike } from "../../server/utils/nameSimilarity.js";

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

  it("falls back to the other India source when the primary is dry", async () => {
    const indiaProduct = {
      _id: "8901030700001",
      product_name_en: "Toned Milk",
      brands: "Amul Fresh",
      image_front_url: "https://images.openfoodfacts.org/x.jpg",
      ingredients_text_en: "Toned milk, vitamin A, vitamin D, stabilizer",
      categories: "Dairy",
      unique_scans_n: 900,
    };
    // Only the FOOD host has data; beauty searches and all barcodes are dry.
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("world.openfoodfacts.org/api/v2/search")) {
        return { ok: true, json: async () => ({ products: [indiaProduct] }) };
      }
      if (url.includes("/api/v2/search")) {
        return { ok: true, json: async () => ({ products: [] }) };
      }
      return { ok: true, json: async () => ({ status: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new OpenFoodFactsService();
    const products = await service.fetchDailyProducts(1);

    // Regardless of which source is primary today, the food product is found
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].brand).toBe("Amul Fresh");
    // And every search stayed India-scoped
    const searchUrls = fetchMock.mock.calls.map((c: any[]) => String(c[0])).filter((u) => u.includes("/api/v2/search"));
    for (const u of searchUrls) expect(u).toContain("countries_tags=en%3Aindia");
  });

  it("does not let gated top-of-page products hide eligible ones below them", async () => {
    // Regression for the Aug 2026 dry spell: pages are sorted by scan count,
    // so the top entries are the most likely to be already-ingested or
    // placeholder-named. A pre-gate slice(0, count) permanently hid eligible
    // products at position count+1 (observed live: rom&nd at position 3).
    const mk = (name: string, brand: string, barcode: string) => ({
      _id: barcode,
      product_name_en: name,
      brands: brand,
      image_front_url: "https://images.openfoodfacts.org/x.jpg",
      ingredients_text_en:
        "diisostearyl malate, hydrogenated polyisobutene, phytosteryl macadamiate, polyglyceryl-2 triisostearate, microcrystalline wax",
      categories: "Lip balms",
      unique_scans_n: 100,
    });
    const inDb = mk("Eva Mosturizing Lip Balm Orange", "Eva", "8901111111100");
    const generic = mk("Lip Balm", "himalaya", "8901111111101");
    const eligible = mk("rom&nd Glasting Melting Balm - 06 Kaya Fig", "rom&nd", "8901111111102");
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("world.openbeautyfacts.org/api/v2/search")) {
        return { ok: true, json: async () => ({ products: [inDb, generic, eligible] }) };
      }
      if (url.includes("/api/v2/search")) {
        return { ok: true, json: async () => ({ products: [] }) };
      }
      return { ok: true, json: async () => ({ status: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new OpenFoodFactsService();
    const checkExists = async (name: string) => /^eva mosturizing/i.test(name.trim());
    const products = await service.fetchDailyProducts(2, checkExists);

    expect(products.map((p) => p.name)).toContain(
      "rom&nd Glasting Melting Balm - 06 Kaya Fig"
    );
  });

  it("skips all-lowercase placeholder names of any length and thin ingredient lists", async () => {
    const mk = (name: string, brand: string, barcode: string, ingredients: string) => ({
      _id: barcode,
      product_name_en: name,
      brands: brand,
      image_front_url: "https://images.openfoodfacts.org/x.jpg",
      ingredients_text_en: ingredients,
      categories: "Misc",
      unique_scans_n: 500,
    });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("world.openfoodfacts.org/api/v2/search")) {
        return {
          ok: true,
          json: async () => ({
            products: [
              mk("kissan fresh tomato", "Kissan", "8901111111110", "tomato paste, sugar, salt, spice extracts"),
              mk("Oats", "Pepsico", "8901111111111", "oats"),
              mk("Quaker Oats Masala Magic", "Pepsico", "8901111111112", "oats, salt, sugar, onion powder, turmeric"),
            ],
          }),
        };
      }
      if (url.includes("/api/v2/search")) {
        return { ok: true, json: async () => ({ products: [] }) };
      }
      return { ok: true, json: async () => ({ status: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new OpenFoodFactsService();
    const products = await service.fetchDailyProducts(3);
    const names = products.map((p) => p.name);

    expect(names).toContain("Quaker Oats Masala Magic");
    expect(names).not.toContain("kissan fresh tomato"); // all-lowercase placeholder
    expect(names).not.toContain("Oats"); // bare category word AND 1-ingredient list
  });

  it("skips generic/placeholder product names but keeps distinctive ones", async () => {
    const mk = (name: string, brand: string, barcode: string) => ({
      _id: barcode,
      product_name_en: name,
      brands: brand,
      image_front_url: "https://images.openfoodfacts.org/x.jpg",
      ingredients_text_en: "water, glycerin, salt, sugar, citric acid",
      categories: "Misc",
      unique_scans_n: 500,
    });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("world.openfoodfacts.org/api/v2/search")) {
        return {
          ok: true,
          json: async () => ({
            products: [
              mk("cleanser", "moisoft", "8901111111111"),
              mk("lip balm", "himalaya", "8902222222222"),
              mk("Chocos", "Kellogg's", "8903333333333"),
            ],
          }),
        };
      }
      if (url.includes("/api/v2/search")) {
        return { ok: true, json: async () => ({ products: [] }) };
      }
      return { ok: true, json: async () => ({ status: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new OpenFoodFactsService();
    const products = await service.fetchDailyProducts(3);
    const names = products.map((p) => p.name);

    expect(names).toContain("Chocos");
    expect(names).not.toContain("cleanser");
    expect(names).not.toContain("lip balm");
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

describe("India baseline — GS1 890 barcode gate", () => {
  it("skips imports with non-India barcodes even when tagged en:india", async () => {
    const mk = (name: string, brand: string, barcode: string) => ({
      _id: barcode,
      product_name_en: name,
      brands: brand,
      image_front_url: "https://images.openfoodfacts.org/x.jpg",
      ingredients_text_en: "cocoa liquor, sugar, cocoa butter, crystallized ginger, soy lecithin",
      categories: "Chocolates",
      unique_scans_n: 500,
    });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("world.openfoodfacts.org/api/v2/search")) {
        return {
          ok: true,
          json: async () => ({
            products: [
              mk("Ginger Crystallized In Dark Chocolate", "Chocolove", "0716270051526"), // US barcode
              mk("Organic Apple Cider Vinegar", "Bragg", "0074305001321"), // US barcode
              mk("Bournville Rich Cocoa 70%", "Cadbury India", "8901233037560"), // 890 = India
            ],
          }),
        };
      }
      if (url.includes("/api/v2/search")) {
        return { ok: true, json: async () => ({ products: [] }) };
      }
      return { ok: true, json: async () => ({ status: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new OpenFoodFactsService();
    const products = await service.fetchDailyProducts(3);
    const names = products.map((p) => p.name);

    expect(names).toContain("Bournville Rich Cocoa 70%");
    expect(names).not.toContain("Ginger Crystallized In Dark Chocolate");
    expect(names).not.toContain("Organic Apple Cider Vinegar");
  });
});

describe("looksGarbledIngredientName — dirty label detection", () => {
  it("flags OCR/merge damage observed in production", () => {
    expect(looksGarbledIngredientName("Carrot Flakes . Garlic Bits and Leeks )")).toBe(true);
    expect(looksGarbledIngredientName("Anti caking agent -")).toBe(true);
    expect(looksGarbledIngredientName("Thickener (415")).toBe(true);
    expect(
      looksGarbledIngredientName(
        "Flavours-Nature Identical Flavouring Substances Thickener-415 and other things making this implausibly long"
      )
    ).toBe(true);
  });

  it("passes clean ingredient names", () => {
    expect(looksGarbledIngredientName("Iodised Salt")).toBe(false);
    expect(looksGarbledIngredientName("citric acid")).toBe(false);
    expect(looksGarbledIngredientName("Hydrolyzed Vegetable Protein")).toBe(false);
    expect(looksGarbledIngredientName("acidity regulator ins 296")).toBe(false);
  });
});

describe("namesLookAlike — near-duplicate product names", () => {
  it("catches spelling-variant duplicates", () => {
    expect(namesLookAlike("Amul Pasteurized Butter", "Amul pasteurised butter")).toBe(true);
  });

  it("catches typo + word-order duplicates", () => {
    expect(
      namesLookAlike("chocolate cranberry museli", "Muesli dark chocolate cranberry")
    ).toBe(true);
  });

  it("does not flag different products from the same brand", () => {
    expect(
      namesLookAlike("Amul Masti Spiced Buttermilk 200ml", "Amul pasteurised butter")
    ).toBe(false);
  });

  it("single-token names must match exactly", () => {
    expect(namesLookAlike("kissan", "Kissan Fresh Tomato Ketchup")).toBe(false);
    expect(namesLookAlike("Chocos", "Chocos")).toBe(true);
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

  it("drops bare functional-class words but keeps qualified forms", () => {
    const out = parseIngredients(
      "Sugar, vanilla extract, extract, citric acid, acid, flavour, natural mango flavour, emulsifier"
    );
    expect(out).toContain("Sugar");
    expect(out).toContain("vanilla extract");
    expect(out).toContain("citric acid");
    expect(out).toContain("natural mango flavour");
    expect(out).not.toContain("extract");
    expect(out).not.toContain("acid");
    expect(out).not.toContain("flavour");
    expect(out).not.toContain("emulsifier");
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
