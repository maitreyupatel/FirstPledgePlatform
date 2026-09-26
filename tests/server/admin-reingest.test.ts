/**
 * Admin re-ingest: a stored product re-runs the SAME parse → analyze →
 * publish-gate path as the daily cron. It must report before/after, write
 * nothing on dryRun, and apply the gate in BOTH directions — a repaired
 * product whose real label turns out damaged is unpublished, not left live.
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

function setup(opts: { confidence?: number; product?: unknown } = {}) {
  const product =
    opts.product === undefined
      ? {
          id: "p1",
          name: "Mountain Dew",
          brand: "PepsiCo",
          status: "published",
          productType: "food",
          ingredients: [
            { name: "Carbonated Water", status: "safe" },
            { name: "acidity regulators", status: "safe" },
          ],
        }
      : opts.product;
  const storage = {
    getById: vi.fn().mockResolvedValue(product),
    update: vi.fn().mockResolvedValue(product),
  };
  const ai = {
    analyzeIngredients: vi.fn(async (names: string[]) =>
      names.map((name) => ({
        name,
        status: "safe",
        rationale: `r:${name}`,
        sourceUrl: "https://example.org",
        confidence: opts.confidence ?? 0.85,
      })),
    ),
  };
  const app = express();
  app.use(express.json());
  app.use("/api/admin", buildAdminReingestRouter(ai as any, () => storage as any));
  return { app, storage, ai };
}

describe("POST /api/admin/products/:id/reingest", () => {
  it("dryRun reports the repaired list and writes nothing", async () => {
    const { app, storage, ai } = setup();
    const res = await request(app).post("/api/admin/products/p1/reingest").send({ ingredientsText: MOUNTAIN_DEW, dryRun: true });
    expect(res.status).toBe(200);
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

  it("apply writes the gate's status, the rows the cron would write, and the summary", async () => {
    const { app, storage } = setup();
    const res = await request(app).post("/api/admin/products/p1/reingest").send({ ingredientsText: MOUNTAIN_DEW });
    expect(res.body.written).toBe(true);
    const [id, input] = storage.update.mock.calls[0];
    expect(id).toBe("p1");
    expect(input.status).toBe("published");
    expect(input.ingredients).toHaveLength(7);
    expect(input.ingredients[4]).toMatchObject({ name: "Preservative INS 211", rationale: "r:Preservative INS 211", isOverride: false });
    expect(input.summary).toMatch(/7 ingredients analyzed from Open Food Facts/);
  });

  it("unpublishes a published product whose repaired list fails the gate", async () => {
    const { app, storage } = setup({ confidence: 0.5 });
    const res = await request(app).post("/api/admin/products/p1/reingest").send({ ingredientsText: MOUNTAIN_DEW });
    expect(res.body.before.status).toBe("published");
    expect(res.body.after.status).toBe("draft");
    expect(res.body.after.gate.reasons.join()).toMatch(/low confidence/);
    expect(storage.update.mock.calls[0][1].status).toBe("draft");
  });

  it("a damaged label is held without spending AI calls or writing junk analyses", async () => {
    const { app, ai, storage } = setup();
    const res = await request(app)
      .post("/api/admin/products/p1/reingest")
      .send({ ingredientsText: "Sugar, RAISING AGENTS [ 503 (ii), 10 (ii) ]", dryRun: true });
    expect(res.body.after.status).toBe("draft");
    expect(res.body.after.gate.reasons.join()).toMatch(/label text is damaged.*10 ii/);
    expect(ai.analyzeIngredients).not.toHaveBeenCalled();
    expect(storage.update).not.toHaveBeenCalled();
  });

  it("applying a damaged label unpublishes but keeps the current rows for review", async () => {
    const { app, ai, storage } = setup();
    const res = await request(app)
      .post("/api/admin/products/p1/reingest")
      .send({ ingredientsText: "Sugar, RAISING AGENTS [ 503 (ii), 10 (ii) ]" });
    expect(res.body.written).toBe(true);
    expect(ai.analyzeIngredients).not.toHaveBeenCalled();
    expect(storage.update).toHaveBeenCalledWith("p1", { status: "draft" });
  });

  it("an operator hold keeps the product a draft even when the gate passes", async () => {
    const { app, storage } = setup();
    const res = await request(app)
      .post("/api/admin/products/p1/reingest")
      .send({ ingredientsText: MOUNTAIN_DEW, hold: "label truncated on OFF" });
    expect(res.body.after.gate.publish).toBe(true);
    expect(res.body.after.status).toBe("draft");
    expect(res.body.after.gate.held).toBe("label truncated on OFF");
    expect(storage.update.mock.calls[0][1].status).toBe("draft");
  });

  it("rejects bad input", async () => {
    const { app } = setup();
    expect((await request(app).post("/api/admin/products/p1/reingest").send({})).status).toBe(400);
    expect((await request(app).post("/api/admin/products/p1/reingest").send({ ingredientsText: "12, 34" })).status).toBe(422);
    const missing = setup({ product: null });
    expect((await request(missing.app).post("/api/admin/products/nope/reingest").send({ ingredientsText: MOUNTAIN_DEW })).status).toBe(404);
  });
});
