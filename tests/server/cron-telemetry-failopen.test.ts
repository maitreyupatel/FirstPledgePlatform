/**
 * Telemetry must be fail-open end to end (adversarial review 2026-09-26):
 * when storage itself cannot initialise, the cron must still ANSWER — it
 * used to leave the request hanging (unhandled rejection in Express 4).
 */
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../server/services/openFoodFactsService", () => ({
  OpenFoodFactsService: class {
    async fetchDailyProducts() {
      throw new Error("OFF unreachable");
    }
  },
}));

import { buildCronRouter } from "../../server/routes/cron";

describe("cron telemetry fail-open", () => {
  it("daily-ingest responds even when getStorage() throws", async () => {
    process.env.CRON_SECRET = "test-secret";
    const getStorage = () => {
      throw new Error("Missing required Supabase environment variables");
    };
    const app = express();
    app.use("/api/cron", buildCronRouter({} as any, getStorage as any));
    const res = await request(app)
      .get("/api/cron/daily-ingest")
      .set("Authorization", "Bearer test-secret")
      .timeout(5000);
    expect(res.status).toBe(502); // the OFF failure is reported; nothing hangs
  });
});
