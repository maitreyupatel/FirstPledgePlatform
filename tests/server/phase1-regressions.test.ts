/**
 * Phase 1 "stop active damage" regression tests (backlog E1.1, E4.1, E4.5, E4.8).
 *
 *  - E1.1: an EWG found-but-scoreless hit must NOT inflate a blind cosmetic
 *    AI verdict to 0.9 confidence (which skipped the verification gate and
 *    sailed past the publish gates). Confidence comes from the AI verdict
 *    unless a usable 1-10 EWG score backs it.
 *  - E1.1 root cause: the EWG parsers must never report found=true with a
 *    null (out-of-range) score.
 *  - E4.1: refresh-stale budget math derives from CRON_BUDGET_MS instead of
 *    the hardcoded 45s guard + LIMIT 5 written for the obsolete 60s limit.
 *  - E4.5: LIKE metacharacters in product names/brands are escaped so
 *    "100% Real..." cannot act as a wildcard in dedup checks.
 *  - E4.8: unmatched /api/* returns JSON 404, not 200 + the SPA shell.
 */

import { describe, it, expect, vi } from "vitest";
import { AIVettingService } from "../../server/services/aiVettingService.js";
import { EWGService } from "../../server/services/ewgService.js";
import { computeRefreshBudget } from "../../server/routes/cron.js";
import { escapeLike } from "../../server/utils/likeEscape.js";

function buildCosmeticService(opts: {
  ewgFound: boolean;
  ewgScore: number | null;
  aiConfidence?: number;
}) {
  // No analysis storage, no research, no compound — isolates the standard
  // cosmetic path where the confidence bug lived.
  const service = new AIVettingService("groq", undefined, undefined, undefined, false);

  const fakeEwg = {
    searchIngredient: vi.fn().mockResolvedValue({
      found: opts.ewgFound,
      score: opts.ewgScore,
      concerns: [],
      url: "https://www.ewg.org/skindeep/search/?query=test",
      name: "test",
      dataAvailability: null,
      suggestedMatches: [],
    }),
  };

  const fakeProvider = {
    analyzeIngredient: vi.fn().mockResolvedValue({
      status: "safe",
      rationale: "ai rationale",
      description: "ai description",
      edgeCases: "none",
      confidence: opts.aiConfidence,
    }),
  };

  (service as any).ewgService = fakeEwg;
  (service as any).aiProvider = fakeProvider;
  (service as any).compoundService = null;
  (service as any).researchService = null;
  (service as any).sleep = vi.fn().mockResolvedValue(undefined);

  return service;
}

describe("E1.1 — cosmetic confidence keys on usable score, not found", () => {
  it("found-but-scoreless EWG does not inflate confidence to 0.9", async () => {
    const service = buildCosmeticService({ ewgFound: true, ewgScore: null, aiConfidence: 0.75 });
    const result = await (service as any).analyzeCosmeticIngredient("Testol", "cosmetic");
    expect(result.confidence).toBe(0.75);
  });

  it("found-but-scoreless EWG with no AI confidence falls to 0.5 (below publish gate)", async () => {
    const service = buildCosmeticService({ ewgFound: true, ewgScore: null, aiConfidence: undefined });
    const result = await (service as any).analyzeCosmeticIngredient("Testol", "cosmetic");
    expect(result.confidence).toBe(0.5);
  });

  it("a real 1-10 EWG score still grants 0.9 authoritative confidence", async () => {
    const service = buildCosmeticService({ ewgFound: true, ewgScore: 3, aiConfidence: 0.4 });
    const result = await (service as any).analyzeCosmeticIngredient("Testol", "cosmetic");
    expect(result.confidence).toBe(0.9);
    // Status derives from the score, not the blind AI verdict
    expect(result.ewgScore).toBe(3);
  });
});

describe("E1.1 root cause — EWG parsers never report found=true with null score", () => {
  const svc = new EWGService();

  it("parseEWGPage: out-of-range score text yields found=false", () => {
    const html = "<html><body>Overall score: 85 out of 100 reviews</body></html>";
    const parsed = (svc as any).parseEWGPage(html, "test", "https://www.ewg.org/x");
    expect(parsed.score).toBeNull();
    expect(parsed.found).toBe(false);
  });

  it("parseEWGPage: a genuine hazard score 1-10 is found", () => {
    const html = "<html><body>Hazard score: 3</body></html>";
    const parsed = (svc as any).parseEWGPage(html, "test", "https://www.ewg.org/x");
    expect(parsed.score).toBe(3);
    expect(parsed.found).toBe(true);
  });

  it("parseSearchResults: out-of-range snippet score yields found=false", () => {
    const html = '<a href="/skindeep/ingredients/12345-test">t</a> score: 4321';
    const parsed = (svc as any).parseSearchResults(html, "test");
    expect(parsed.score).toBeNull();
    expect(parsed.found).toBe(false);
  });
});

describe("E4.1 — refresh-stale budget derives from CRON_BUDGET_MS", () => {
  it("production budget (280s) yields ~11 rows and a 160s guard", () => {
    const { stopAfterMs, fetchLimit } = computeRefreshBudget("280000");
    expect(fetchLimit).toBe(11);
    expect(stopAfterMs).toBe(160_000);
  });

  it("unset/invalid budget falls back to the 50s default", () => {
    for (const raw of [undefined, "", "not-a-number", "-5"]) {
      const { stopAfterMs, fetchLimit } = computeRefreshBudget(raw);
      expect(fetchLimit).toBe(2);
      expect(stopAfterMs).toBe(5_000); // floor: budget smaller than worst case
    }
  });

  it("never returns a zero/negative limit or guard", () => {
    const { stopAfterMs, fetchLimit } = computeRefreshBudget("1");
    expect(fetchLimit).toBeGreaterThanOrEqual(1);
    expect(stopAfterMs).toBeGreaterThan(0);
  });
});

describe("E4.5 — LIKE metacharacter escaping", () => {
  it("escapes %, _ and backslash", () => {
    expect(escapeLike("100% Real Grape_Juice")).toBe("100\\% Real Grape\\_Juice");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves clean strings untouched", () => {
    expect(escapeLike("Amul Butter")).toBe("Amul Butter");
  });
});

describe("E4.8 — unmatched /api/* returns JSON 404, not the SPA shell", () => {
  it("GET /api/definitely-not-a-route → 404 JSON", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    vi.resetModules();
    vi.doMock("../../server/storage/supabaseStorage.js", () => ({
      SupabaseStorage: class {},
    }));
    vi.doMock("../../server/services/aiVettingService.js", () => ({ AIVettingService: class {} }));
    vi.doMock("../../server/services/citationService.js", () => ({ CitationService: class {} }));

    const { default: request } = await import("supertest");
    const { default: app } = await import("../../server/index.js");

    const res = await request(app).get("/api/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBe("Not found");

    // Non-GET methods on unknown /api paths too
    const post = await request(app).post("/api/definitely-not-a-route");
    expect(post.status).toBe(404);
    expect(post.body.error).toBe("Not found");
  });
});
