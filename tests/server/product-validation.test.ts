/**
 * Route-boundary validation tests for product and vetting endpoints.
 * Invariants:
 *  1. POST /api/products rejects malformed payloads with 400 before any
 *     storage call (bad status enums, oversized fields, bad URLs)
 *  2. Unknown fields are stripped, valid payloads pass through unchanged
 *  3. PATCH /api/products/:id applies the same rules with optional fields
 *  4. /api/vet-ingredients rejects empty and oversized ingredient lists
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import {
  productCreateSchema,
  productUpdateSchema,
  vetIngredientsSchema,
} from "../../server/validation/productSchemas.js";

// ── Schema unit tests ─────────────────────────────────────────────────────────

describe("productCreateSchema", () => {
  const valid = {
    name: "Face Cream",
    brand: "Acme",
    summary: "A cream",
    imageUrl: "https://example.com/cream.jpg",
    overallStatus: "safe",
    status: "draft",
    productType: "cosmetic",
    ingredients: [
      { name: "Aqua", status: "safe", rationale: "water", sourceUrl: "https://www.ewg.org/x" },
    ],
  };

  it("accepts a valid payload", () => {
    const parsed = productCreateSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects missing name and brand", () => {
    expect(productCreateSchema.safeParse({}).success).toBe(false);
    expect(productCreateSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(productCreateSchema.safeParse({ name: "", brand: "b" }).success).toBe(false);
  });

  it("rejects out-of-enum statuses", () => {
    expect(productCreateSchema.safeParse({ ...valid, overallStatus: "mostly-fine" }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...valid, status: "live" }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...valid, productType: "gadget" }).success).toBe(false);
  });

  it("rejects oversized fields", () => {
    expect(productCreateSchema.safeParse({ ...valid, name: "x".repeat(201) }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...valid, summary: "x".repeat(5001) }).success).toBe(false);
  });

  it("rejects non-http(s) source and image URLs", () => {
    expect(productCreateSchema.safeParse({ ...valid, imageUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(
      productCreateSchema.safeParse({
        ...valid,
        ingredients: [{ name: "Aqua", status: "safe", sourceUrl: "ftp://weird" }],
      }).success
    ).toBe(false);
  });

  it("allows empty-string URLs (storage substitutes defaults)", () => {
    const parsed = productCreateSchema.safeParse({ ...valid, imageUrl: "" });
    expect(parsed.success).toBe(true);
  });

  it("rejects ingredient names that are empty or oversized", () => {
    expect(
      productCreateSchema.safeParse({ ...valid, ingredients: [{ name: "", status: "safe" }] }).success
    ).toBe(false);
    expect(
      productCreateSchema.safeParse({ ...valid, ingredients: [{ name: "x".repeat(201), status: "safe" }] })
        .success
    ).toBe(false);
  });

  it("caps the ingredient list at 200", () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ name: `ing-${i}`, status: "safe" }));
    expect(productCreateSchema.safeParse({ ...valid, ingredients: many }).success).toBe(false);
  });

  it("strips unknown fields instead of passing them to storage", () => {
    const parsed = productCreateSchema.safeParse({ ...valid, isAdmin: true, __proto__pollute: "x" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && (parsed.data as any).isAdmin).toBeUndefined();
  });
});

describe("productUpdateSchema", () => {
  it("accepts a partial payload and injects no defaults", () => {
    const parsed = productUpdateSchema.safeParse({ status: "published" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("published");
      expect("summary" in parsed.data).toBe(false);
      expect("ingredients" in parsed.data).toBe(false);
    }
  });

  it("still rejects invalid values on provided fields", () => {
    expect(productUpdateSchema.safeParse({ status: "archived" }).success).toBe(false);
    expect(productUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("vetIngredientsSchema", () => {
  it("requires non-empty ingredientsText and caps its size", () => {
    expect(vetIngredientsSchema.safeParse({}).success).toBe(false);
    expect(vetIngredientsSchema.safeParse({ ingredientsText: "  " }).success).toBe(false);
    expect(vetIngredientsSchema.safeParse({ ingredientsText: "x".repeat(20001) }).success).toBe(false);
    expect(vetIngredientsSchema.safeParse({ ingredientsText: "aqua, glycerin" }).success).toBe(true);
  });
});

// ── Route integration: validation runs before storage ────────────────────────

const createSpy = vi.fn();

vi.mock("../../server/storage/supabaseStorage.js", () => ({
  SupabaseStorage: class {
    async create(input: unknown) {
      createSpy(input);
      return { id: "p1", ...(input as object), overallStatus: "safe", ingredients: [] };
    }
    async list() {
      return [];
    }
    async getById() {
      return null;
    }
  },
}));

vi.mock("../../server/services/aiVettingService.js", () => ({ AIVettingService: class {} }));
vi.mock("../../server/services/citationService.js", () => ({ CitationService: class {} }));

let app: any;

beforeAll(async () => {
  process.env.NODE_ENV = "production";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.ADMIN_API_KEY = "test-admin-key";
  delete process.env.SUPABASE_ANON_KEY; // force API-key auth path

  vi.resetModules();
  ({ default: app } = await import("../../server/index.js"));
});

const auth = { Authorization: "Bearer test-admin-key" };

describe("POST /api/products — boundary validation", () => {
  it("rejects an invalid overallStatus with 400 and never reaches storage", async () => {
    createSpy.mockClear();
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "P", brand: "B", overallStatus: "definitely-fine" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid product payload");
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("rejects a payload with a 10k-char brand", async () => {
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({ name: "P", brand: "B".repeat(10_000) });
    expect(res.status).toBe(400);
  });

  it("accepts a valid payload (201) and strips unknown fields", async () => {
    createSpy.mockClear();
    const res = await request(app)
      .post("/api/products")
      .set(auth)
      .send({
        name: "Good Product",
        brand: "Acme",
        sneakyExtra: "field",
        ingredients: [{ name: "Aqua", status: "safe" }],
      });

    expect(res.status).toBe(201);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).not.toHaveProperty("sneakyExtra");
    expect(createSpy.mock.calls[0][0].ingredients[0].name).toBe("Aqua");
  });
});

describe("POST /api/vet-ingredients — auth + boundary validation", () => {
  it("rejects unauthenticated requests (401) — vetting is admin-only spend", async () => {
    const res = await request(app)
      .post("/api/vet-ingredients")
      .send({ ingredientsText: "water" });
    expect(res.status).toBe(401);
  });

  it("rejects a missing ingredientsText with 400", async () => {
    const res = await request(app).post("/api/vet-ingredients").set(auth).send({});
    expect(res.status).toBe(400);
  });

  it("rejects more than 100 ingredients with 400", async () => {
    const text = Array.from({ length: 101 }, (_, i) => `ingredient-${i}`).join(", ");
    const res = await request(app).post("/api/vet-ingredients").set(auth).send({ ingredientsText: text });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Too many ingredients");
  });
});
