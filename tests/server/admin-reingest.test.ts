/**
 * Admin re-ingest: a stored product re-runs the SAME parse → analyze →
 * publish-gate path as the daily cron. It must report before/after, write
 * nothing unless asked (apply: true), apply the gate in BOTH directions,
 * and never leave a published product half-written or duplicated
 * (adversarial review round 2, 2026-09-26).
 */
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../server/middleware/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { buildAdminReingestRouter } from "../../server/routes/adminReingest";

const MOUNTAIN_DEW =
  "CARBONATED WATER, SUGAR, ACIDITY REGULATORS (330 ,331), PRESERVATIVE (211), CAFFEINE (13 mg/100 g), COLOUR (102).";

type SetupOpts = {
  confidence?: number;
  product?: unknown;
  failInsertOnce?: boolean;
  analysisThrows?: boolean;
  duplicate?: boolean;
  /** update() returning null = its own read of the product failed: nothing written */
  updateReturnsNull?: "always" | "on-publish";
  dedupThrows?: boolean;
};

function setup(opts: SetupOpts = {}) {
  const product =
    opts.product === undefined
      ? {
          id: "p1",
          name: "Mountain Dew",
          brand: "PepsiCo",
          status: "published",
          productType: "food",
          imageUrl: "https://images.openfoodfacts.org/images/products/890/208/036/4022/front_en.6.400.jpg",
          publishedAt: "2026-09-14T10:00:00Z",
          ingredients: [
            { name: "Carbonated Water", status: "safe" },
            { name: "acidity regulators", status: "safe" },
          ],
        }
      : opts.product;
  let failNext = !!opts.failInsertOnce;
  // Stateful like SupabaseStorage.update: draft clears publishedAt, publish
  // without a date stamps "now", ingredients are replaced wholesale, and the
  // product is read back after the write
  const state: any = product ? { ...(product as object), ingredients: [...(product as any).ingredients] } : null;
  const storage = {
    getById: vi.fn().mockResolvedValue(product),
    update: vi.fn(async (_id: string, input: any) => {
      if (opts.updateReturnsNull === "always") return null;
      if (opts.updateReturnsNull === "on-publish" && input.status === "published") return null;
      if (failNext && input.ingredients) {
        failNext = false;
        state.status = "draft";
        state.publishedAt = null;
        state.ingredients = [];
        throw new Error("Failed to insert ingredients: upstream timeout");
      }
      if (input.status !== undefined) {
        state.status = input.status;
        if (input.status === "draft") state.publishedAt = null;
        if (input.status === "published" && !state.publishedAt) state.publishedAt = "2026-09-26T10:30:00Z";
      }
      if (input.publishedAt !== undefined) state.publishedAt = input.publishedAt;
      if (input.ingredients) state.ingredients = input.ingredients.map((i: any) => ({ ...i }));
      return { ...state, ingredients: [...state.ingredients] };
    }),
    hasBarcode: vi.fn(async () => {
      if (opts.dedupThrows) throw new Error("Duplicate check (barcode) failed: timeout");
      return !!opts.duplicate;
    }),
    hasSimilarProduct: vi.fn().mockResolvedValue(false),
  };
  const ai = {
    analyzeIngredients: vi.fn(async (names: string[]) => {
      if (opts.analysisThrows) throw new Error("Groq 429");
      return names.map((name) => ({
        name,
        status: "safe",
        rationale: `r:${name}`,
        sourceUrl: "https://example.org",
        confidence: opts.confidence ?? 0.85,
      }));
    }),
  };
  const app = express();
  app.use(express.json());
  app.use("/api/admin", buildAdminReingestRouter(ai as any, () => storage as any));
  const post = (body: unknown) => request(app).post("/api/admin/products/p1/reingest").send(body as object);
  return { post, storage, ai };
}

describe("POST /api/admin/products/:id/reingest", () => {
  it("without apply it is a dry run: reports the repaired list, writes nothing", async () => {
    const { post, storage, ai } = setup();
    const res = await post({ ingredientsText: MOUNTAIN_DEW });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.written).toBe(false);
    expect(storage.update).not.toHaveBeenCalled();
    expect(ai.analyzeIngredients.mock.calls[0][0]).toContain("Preservative INS 211");
    expect(res.body.before.ingredients.map((i: any) => i.name)).toContain("acidity regulators");
    expect(res.body.after.ingredients.map((i: any) => i.name)).toEqual([
      "Carbonated Water",
      "Sugar",
      "Acidity Regulators INS 330",
      "Acidity Regulators INS 331",
      "Preservative INS 211",
      "Caffeine",
      "Colour INS 102",
    ]);
    expect(res.body.after.status).toBe("published");
  });

  it("a misspelled flag is rejected, never treated as a write (R2-29)", async () => {
    const { post, storage } = setup({ confidence: 0.5 });
    for (const body of [{ ingredientsText: MOUNTAIN_DEW, dry_run: true }, { ingredientsText: MOUNTAIN_DEW, dryrun: true }, { ingredientsText: MOUNTAIN_DEW, apply: "yes" }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(storage.update).not.toHaveBeenCalled();
  });

  it("apply writes the new rows as a DRAFT first, then publishes with the original date (R2-25)", async () => {
    const { post, storage } = setup();
    const res = await post({ ingredientsText: MOUNTAIN_DEW, apply: true });
    expect(res.body.written).toBe(true);
    expect(storage.update).toHaveBeenCalledTimes(2);
    const [first, second] = storage.update.mock.calls;
    expect(first[1].status).toBe("draft");
    expect(first[1].ingredients).toHaveLength(7);
    expect(first[1].ingredients[4]).toMatchObject({ name: "Preservative INS 211", rationale: "r:Preservative INS 211", isOverride: false });
    expect(first[1].summary).toMatch(/7 ingredients analyzed from Open Food Facts/);
    expect(second[1]).toEqual({ status: "published", publishedAt: "2026-09-14T10:00:00Z" });
    // confirmed by read-back, original publish date kept
    expect(res.body.after.verified).toEqual({ status: "published", ingredientRows: 7, publishedAt: "2026-09-14T10:00:00Z" });
    expect(res.body.before.publishedAt).toBe("2026-09-14T10:00:00Z");
  });

  it("an update that silently wrote nothing is a failure, never 'written' (review: update() returns null on a failed read)", async () => {
    const { post, storage } = setup({ updateReturnsNull: "always" });
    const res = await post({ ingredientsText: MOUNTAIN_DEW, apply: true });
    expect(res.status).toBe(500);
    expect(res.body.written).toBeUndefined();
    // step 1 unconfirmed → never went on to publish
    expect(storage.update.mock.calls.every(([, input]) => input.status !== "published")).toBe(true);
    expect(res.body.heldAfterWriteFailure).toBe(false);
    expect(res.body.needsManualCheck).toBe(true);
  });

  it("an unconfirmed PUBLISH leaves the product a draft with its new rows, reported as held", async () => {
    const { post } = setup({ updateReturnsNull: "on-publish" });
    const res = await post({ ingredientsText: MOUNTAIN_DEW, apply: true });
    expect(res.status).toBe(500);
    expect(res.body.heldAfterWriteFailure).toBe(true);
    expect(res.body.needsManualCheck).toBe(false);
  });

  it("refuses to apply over admin overrides (they would be discarded); a dry run reports them", async () => {
    const withOverride = {
      id: "p1", name: "Mountain Dew", brand: "PepsiCo", status: "published", productType: "food", imageUrl: null,
      publishedAt: "2026-09-14T10:00:00Z", ingredients: [{ name: "Sugar", status: "caution", isOverride: true }],
    };
    const { post, storage } = setup({ product: withOverride });
    expect((await post({ ingredientsText: MOUNTAIN_DEW, apply: true })).status).toBe(409);
    expect(storage.update).not.toHaveBeenCalled();
    expect((await post({ ingredientsText: MOUNTAIN_DEW })).body.before.overrides).toBe(1);
  });

  it("an unreadable duplicate check writes nothing — never treated as 'no duplicate'", async () => {
    const draft = {
      id: "p1", name: "Glow & Lovely Serum", brand: "Glow & Lovely", status: "draft", productType: "cosmetic",
      imageUrl: "https://images.openbeautyfacts.org/images/products/890/910/603/0534/front_en.3.400.jpg",
      publishedAt: null, ingredients: [],
    };
    const { post, storage } = setup({ product: draft, dedupThrows: true });
    const res = await post({ ingredientsText: "Water, Niacinamide, Glycerin, Stearic Acid", apply: true });
    expect(res.status).toBe(500);
    expect(storage.update).not.toHaveBeenCalled();
  });

  it("a failed ingredient write leaves the product OFF the catalog, never live and empty (R2-25)", async () => {
    const { post, storage } = setup({ failInsertOnce: true });
    const res = await post({ ingredientsText: MOUNTAIN_DEW, apply: true });
    expect(res.status).toBe(500);
    expect(res.body.heldAfterWriteFailure).toBe(true);
    expect(storage.update.mock.calls.every(([, input]) => input.status !== "published")).toBe(true);
  });

  it("a failed ANALYSIS writes nothing — the product stays exactly as it was", async () => {
    const { post, storage } = setup({ analysisThrows: true });
    const res = await post({ ingredientsText: MOUNTAIN_DEW, apply: true });
    expect(res.status).toBe(500);
    expect(res.body.heldAfterWriteFailure).toBe(false);
    expect(storage.update).not.toHaveBeenCalled();
  });

  it("unpublishes a published product whose repaired list fails the gate", async () => {
    const { post, storage } = setup({ confidence: 0.5 });
    const res = await post({ ingredientsText: MOUNTAIN_DEW, apply: true });
    expect(res.body.before.status).toBe("published");
    expect(res.body.after.status).toBe("draft");
    expect(res.body.after.gate.reasons.join()).toMatch(/low confidence/);
    expect(storage.update).toHaveBeenCalledTimes(1);
    expect(storage.update.mock.calls[0][1].status).toBe("draft");
  });

  it("a damaged label is held without spending AI calls or writing junk analyses", async () => {
    const { post, ai, storage } = setup();
    const res = await post({ ingredientsText: "Sugar, RAISING AGENTS [ 503 (ii), 10 (ii) ]" });
    expect(res.body.after.status).toBe("draft");
    expect(res.body.after.gate.reasons.join()).toMatch(/label text is damaged.*10 ii/);
    expect(ai.analyzeIngredients).not.toHaveBeenCalled();
    expect(storage.update).not.toHaveBeenCalled();
  });

  it("applying a damaged label unpublishes but keeps the current rows for review", async () => {
    const { post, ai, storage } = setup();
    const res = await post({ ingredientsText: "Sugar, RAISING AGENTS [ 503 (ii), 10 (ii) ]", apply: true });
    expect(res.body.written).toBe(true);
    expect(ai.analyzeIngredients).not.toHaveBeenCalled();
    expect(storage.update).toHaveBeenCalledWith("p1", { status: "draft" });
  });

  it("a label longer than the 50-ingredient cap is held, never published truncated (R2-28)", async () => {
    const { post, ai } = setup();
    const long = Array.from({ length: 55 }, (_, i) => `Ingredient Number ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`).join(", ");
    const res = await post({ ingredientsText: long });
    expect(res.body.after.status).toBe("draft");
    expect(res.body.after.gate.reasons.join()).toMatch(/55 ingredients > 50/);
    expect(ai.analyzeIngredients).not.toHaveBeenCalled();
  });

  it("promoting a DRAFT that duplicates a live product keeps it a draft (R2-30)", async () => {
    const draft = {
      id: "p1", name: "Glow & Lovely Serum", brand: "Glow & Lovely", status: "draft", productType: "cosmetic",
      imageUrl: "https://images.openbeautyfacts.org/images/products/890/910/603/0534/front_en.3.400.jpg",
      publishedAt: null, ingredients: [],
    };
    const { post, storage } = setup({ product: draft, duplicate: true });
    const res = await post({ ingredientsText: "Water, Niacinamide, Glycerin, Stearic Acid" });
    expect(res.body.after.status).toBe("draft");
    expect(res.body.after.gate.reasons.join()).toMatch(/duplicate: barcode 8909106030534/);
    expect(storage.hasBarcode).toHaveBeenCalledWith("8909106030534", "p1"); // never matches itself
  });

  it("an operator hold keeps the product a draft even when the gate passes", async () => {
    const { post, storage } = setup();
    const res = await post({ ingredientsText: MOUNTAIN_DEW, hold: "label truncated on OFF", apply: true });
    expect(res.body.after.status).toBe("draft");
    expect(res.body.after.gate.held).toBe("label truncated on OFF");
    expect(storage.update).toHaveBeenCalledTimes(1);
    expect(storage.update.mock.calls[0][1].status).toBe("draft");
  });

  it("rejects bad input", async () => {
    const { post } = setup();
    expect((await post({})).status).toBe(400);
    expect((await post({ ingredientsText: "12, 34" })).status).toBe(422);
    const missing = setup({ product: null });
    expect((await missing.post({ ingredientsText: MOUNTAIN_DEW })).status).toBe(404);
  });
});
