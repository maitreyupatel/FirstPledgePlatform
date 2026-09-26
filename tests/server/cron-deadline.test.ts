/**
 * Daily ingest out of time (post-merge code review 2026-09-26): once one
 * product stops on the analysis deadline, the run must not start the next
 * product — its first fresh AI call would follow the previous one with no
 * pacing pause, and it could not finish anyway. And a product must never
 * START its two-insert create past the budget, where the platform kill could
 * cut it in half.
 */
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

const offProducts = [
  { name: "Alpha Namkeen", brand: "Alpha", barcode: "8900000000001", ingredientsText: "Salt, Sugar", source: "food", imageUrl: "" },
  { name: "Beta Namkeen", brand: "Beta", barcode: "8900000000002", ingredientsText: "Salt, Sugar, Oil", source: "food", imageUrl: "" },
];

vi.mock("../../server/services/openFoodFactsService", () => ({
  OpenFoodFactsService: class {
    async fetchDailyProducts() {
      return offProducts;
    }
  },
}));

import { buildCronRouter } from "../../server/routes/cron";

function harness(analyze: (...a: unknown[]) => Promise<unknown>) {
  process.env.CRON_SECRET = "test-secret";
  const storage = {
    startIngestRun: vi.fn().mockResolvedValue(null),
    finishIngestRun: vi.fn().mockResolvedValue(undefined),
    findByNameAndBrand: vi.fn().mockResolvedValue(null),
    create: vi.fn(async (p: any) => ({ ...p, id: "new", overallStatus: "safe" })),
  };
  const ai = { analyzeIngredients: vi.fn(analyze) };
  const app = express();
  app.use("/api/cron", buildCronRouter(ai as any, (() => storage) as any));
  const run = () => request(app).get("/api/cron/daily-ingest").set("Authorization", "Bearer test-secret").timeout(5000);
  return { storage, ai, run };
}

describe("daily-ingest — out of time", () => {
  it("stops the run after a product hits the analysis deadline", async () => {
    const deadline = Object.assign(new Error("Analysis deadline exceeded after 1/2 ingredients"), { deadline: true });
    const { ai, storage, run } = harness(async () => {
      throw deadline;
    });
    const res = await run();
    expect(res.status).toBe(200);
    expect(ai.analyzeIngredients).toHaveBeenCalledTimes(1); // the second product is never started
    expect(storage.create).not.toHaveBeenCalled();
  });

  it("an ordinary per-product failure still moves on to the next product", async () => {
    const { ai, storage, run } = harness(async (names: unknown) => {
      if ((names as string[]).length === 2) throw new Error("Groq 500");
      return (names as string[]).map((name) => ({ name, status: "safe", rationale: "r", sourceUrl: "https://x", confidence: 0.9 }));
    });
    await run();
    expect(ai.analyzeIngredients).toHaveBeenCalledTimes(2);
    expect(storage.create).toHaveBeenCalledTimes(1);
  });

  it("never starts a create after the budget is spent", async () => {
    process.env.CRON_BUDGET_MS = "1000";
    const { storage, run } = harness(async (names: unknown) => {
      await new Promise((r) => setTimeout(r, 1100)); // analysis finishes past the 1s budget
      return (names as string[]).map((name) => ({ name, status: "safe", rationale: "r", sourceUrl: "https://x", confidence: 0.9 }));
    });
    try {
      const res = await run();
      expect(storage.create).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).toMatch(/Write deadline passed/);
    } finally {
      delete process.env.CRON_BUDGET_MS;
    }
  });
});
