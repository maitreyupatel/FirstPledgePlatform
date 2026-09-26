/**
 * Refresh cron vs orphaned legacy rows (adversarial review round 2,
 * 2026-09-26). Rows keyed under the old scheme ("e211", now "ins 211") are
 * never refreshed and stay the oldest stale rows forever. A fixed
 * over-fetch (fetchLimit x 3) eventually returned ONLY those rows, so the
 * weekly refresh did nothing while reporting "No stale ingredients" / ok —
 * production already had 36 of them. The cron must page past them.
 */
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

type Row = { ingredient_name: string; product_type: string };
const LEGACY = ["preservative-e211", "stabilizers - e1422", "e415", "firvour enhancers - e627 & e631"];
const stale: Row[] = [
  // oldest first, as the query orders them: 100 legacy rows (real prod
  // names, keyed today as "ins 211", "ins 1422", ...), then real ones
  ...Array.from({ length: 100 }, (_, i) => ({ ingredient_name: LEGACY[i % LEGACY.length], product_type: "food" })),
  // generic declarations: fixed verdict, never cached — never "refreshed"
  { ingredient_name: "spices and condiments", product_type: "food" },
  { ingredient_name: "natural flavouring substances", product_type: "food" },
  { ingredient_name: "sugar", product_type: "food" },
  { ingredient_name: "ins 211", product_type: "food" },
  { ingredient_name: "glycerin", product_type: "cosmetic" },
];
const rangeCalls: Array<[number, number]> = [];

vi.mock("@supabase/supabase-js", () => {
  const query = {
    select: () => query,
    lt: () => query,
    order: () => query,
    range: async (from: number, to: number) => {
      rangeCalls.push([from, to]);
      return { data: stale.slice(from, to + 1), error: null };
    },
    limit: async (n: number) => ({ data: stale.slice(0, n), error: null }),
  };
  return { createClient: () => ({ from: () => query }) };
});

import { buildCronRouter } from "../../server/routes/cron";

describe("GET /api/cron/refresh-stale-ingredients", () => {
  it("pages past legacy rows to the real stale rows instead of reporting nothing to do", async () => {
    Object.assign(process.env, {
      CRON_SECRET: "test-secret",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      CRON_BUDGET_MS: "280000", // production value: fetchLimit 11, page 33
    });
    const ai = { analyzeIngredient: vi.fn().mockResolvedValue({}) };
    const getStorage = () => {
      throw new Error("no storage in this test"); // telemetry is fail-open
    };
    const app = express();
    app.use("/api/cron", buildCronRouter(ai as any, getStorage as any));

    const res = await request(app)
      .get("/api/cron/refresh-stale-ingredients")
      .set("Authorization", "Bearer test-secret")
      .timeout(5000);

    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBe(3);
    expect(ai.analyzeIngredient.mock.calls.map((c) => c[0])).toEqual(["sugar", "ins 211", "glycerin"]);
    expect(rangeCalls.length).toBeLessThanOrEqual(10); // bounded paging
  });
});
