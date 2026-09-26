/**
 * Duplicate checks fail closed (review 2026-09-26): an unreadable products
 * table used to answer "no duplicate", so a DB hiccup during sourcing could
 * publish a second copy of a live product. Now the check throws; the daily
 * ingest skips THAT candidate (a later run retries it) and carries on —
 * neither a duplicate nor an aborted run.
 */
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

const seen: boolean[] = [];

vi.mock("../../server/services/openFoodFactsService", () => ({
  OpenFoodFactsService: class {
    async fetchDailyProducts(_count: number, checkExists: (name: string, brand: string, barcode: string) => Promise<boolean>) {
      seen.push(await checkExists("Moong Dal", "Haldiram", "8904004400262"));
      return [];
    }
  },
}));

import { buildCronRouter } from "../../server/routes/cron";

describe("daily-ingest duplicate check", () => {
  it("skips a candidate whose uniqueness cannot be checked, and the run still answers", async () => {
    process.env.CRON_SECRET = "test-secret";
    const storage = {
      startIngestRun: vi.fn().mockResolvedValue(null),
      finishIngestRun: vi.fn().mockResolvedValue(undefined),
      hasBarcode: vi.fn().mockRejectedValue(new Error("Duplicate check (barcode) failed: timeout")),
      findByNameAndBrand: vi.fn().mockResolvedValue(null),
      hasSimilarProduct: vi.fn().mockResolvedValue(false),
    };
    const app = express();
    app.use("/api/cron", buildCronRouter({} as any, (() => storage) as any));

    const res = await request(app)
      .get("/api/cron/daily-ingest")
      .set("Authorization", "Bearer test-secret")
      .timeout(5000);

    expect(seen).toEqual([true]); // treated as "exists" → skipped, never created
    expect(res.status).toBe(200);
    expect(res.body.ingested).toBe(0);
  });
});
