/**
 * AI analysis pipeline data-layer tests.
 * Invariants:
 *  1. analyzeIngredients() issues exactly ONE batched DB query for the cache
 *     lookup phase — not one (or two) per ingredient
 *  2. Concurrent analyses of the same ingredient coalesce into a single
 *     provider call and a single DB write
 *  3. Duplicate names within one list only pay for one fresh analysis
 *  4. EWG scores and confidence are clamped at the write boundary
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIVettingService, IngredientAnalysis } from "../../server/services/aiVettingService.js";
import { IngredientAnalysisService } from "../../server/services/ingredientAnalysisService.js";

function freshStoredAnalysis(name: string): IngredientAnalysis & { lastAnalyzedAt: string } {
  return {
    name,
    status: "safe",
    rationale: "cached",
    description: "cached description",
    edgeCases: "none",
    sourceUrl: "https://www.ewg.org/skindeep/",
    confidence: 0.9,
    ewgScore: 2,
    productType: "cosmetic",
    lastAnalyzedAt: new Date().toISOString(),
  };
}

/**
 * Build an AIVettingService with every collaborator faked so the tests
 * exercise only the orchestration logic (no network, no real Supabase).
 */
function buildService() {
  const service = new AIVettingService("groq", undefined, undefined, undefined, false);

  const fakeAnalysisService = {
    normalizeIngredientName: (n: string) => n.toLowerCase().trim(),
    getAnalysis: vi.fn().mockResolvedValue(null),
    getAnalysesBatch: vi.fn().mockResolvedValue(new Map()),
    shouldRefreshAnalysis: (a: any) => {
      if (!a) return true;
      if (!a.lastAnalyzedAt && !a.updatedAt) return false;
      return Date.now() - new Date(a.lastAnalyzedAt || a.updatedAt).getTime() > 30 * 24 * 60 * 60 * 1000;
    },
    upsertAnalysis: vi.fn().mockResolvedValue(undefined),
  };

  const fakeEwg = {
    searchIngredient: vi.fn().mockResolvedValue({
      found: true,
      score: 3,
      concerns: [],
      url: "https://www.ewg.org/skindeep/ingredients/test",
      name: "test",
      dataAvailability: "Fair",
      suggestedMatches: [],
    }),
  };

  const fakeProvider = {
    analyzeIngredient: vi.fn().mockResolvedValue({
      status: "safe",
      rationale: "ai rationale",
      description: "ai description",
      edgeCases: "none",
      confidence: 0.9,
    }),
  };

  (service as any).analysisService = fakeAnalysisService;
  (service as any).ewgService = fakeEwg;
  (service as any).aiProvider = fakeProvider;
  (service as any).sleep = vi.fn().mockResolvedValue(undefined); // no real 2s delays in tests

  return { service, fakeAnalysisService, fakeEwg, fakeProvider };
}

describe("analyzeIngredients — batched cache lookup", () => {
  it("issues exactly 1 batch query and 0 per-ingredient cache queries", async () => {
    const { service, fakeAnalysisService, fakeProvider } = buildService();

    const cachedMap = new Map<string, IngredientAnalysis>([
      ["aqua", freshStoredAnalysis("aqua")],
      ["glycerin", freshStoredAnalysis("glycerin")],
    ]);
    fakeAnalysisService.getAnalysesBatch.mockResolvedValue(cachedMap);

    const results = await service.analyzeIngredients(["Aqua", "Glycerin", "Newthing"], "cosmetic");

    expect(results).toHaveLength(3);
    expect(fakeAnalysisService.getAnalysesBatch).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisService.getAnalysis).not.toHaveBeenCalled();
    // Only the cache miss reaches the AI provider
    expect(fakeProvider.analyzeIngredient).toHaveBeenCalledTimes(1);
    expect(fakeProvider.analyzeIngredient.mock.calls[0][0]).toBe("Newthing");
    // Cached results come back as-is
    expect(results[0].rationale).toBe("cached");
    expect(results[1].rationale).toBe("cached");
  });

  it("pays for only one fresh analysis when the same name appears twice", async () => {
    const { service, fakeProvider } = buildService();

    const results = await service.analyzeIngredients(["Niacinamide", "niacinamide"], "cosmetic");

    expect(results).toHaveLength(2);
    expect(fakeProvider.analyzeIngredient).toHaveBeenCalledTimes(1);
  });

  it("falls back to fresh analysis when the batch lookup throws", async () => {
    const { service, fakeAnalysisService, fakeProvider } = buildService();
    fakeAnalysisService.getAnalysesBatch.mockRejectedValue(new Error("db down"));

    const results = await service.analyzeIngredients(["aqua"], "cosmetic");

    expect(results).toHaveLength(1);
    expect(fakeProvider.analyzeIngredient).toHaveBeenCalledTimes(1);
  });
});

describe("analyzeIngredient — concurrent coalescing", () => {
  it("two concurrent calls for the same ingredient share one provider call and one DB write", async () => {
    const { service, fakeAnalysisService, fakeProvider } = buildService();

    // Make the provider slow enough that both calls overlap
    fakeProvider.analyzeIngredient.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ status: "safe", rationale: "r", description: "d", edgeCases: "e", confidence: 0.9 }),
            25
          )
        )
    );

    const [a, b] = await Promise.all([
      service.analyzeIngredient("Retinol", "cosmetic"),
      service.analyzeIngredient("retinol", "cosmetic"),
    ]);

    expect(fakeProvider.analyzeIngredient).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisService.upsertAnalysis).toHaveBeenCalledTimes(1);
    expect(a).toBe(b); // literally the same resolved object
  });

  it("a second call after completion runs fresh again (no stale lock)", async () => {
    const { service, fakeProvider } = buildService();

    await service.analyzeIngredient("Retinol", "cosmetic");
    await service.analyzeIngredient("Retinol", "cosmetic");

    expect(fakeProvider.analyzeIngredient).toHaveBeenCalledTimes(2);
  });
});

describe("write-boundary clamps", () => {
  it("clamps EWG score to the 1-10 scale, rejecting garbage as null", () => {
    expect(IngredientAnalysisService.clampEwgScore(47)).toBeNull();
    expect(IngredientAnalysisService.clampEwgScore(0)).toBeNull();
    expect(IngredientAnalysisService.clampEwgScore(-3)).toBeNull();
    expect(IngredientAnalysisService.clampEwgScore(NaN)).toBeNull();
    expect(IngredientAnalysisService.clampEwgScore("8" as any)).toBeNull();
    expect(IngredientAnalysisService.clampEwgScore(null)).toBeNull();
    expect(IngredientAnalysisService.clampEwgScore(undefined)).toBeNull();
    expect(IngredientAnalysisService.clampEwgScore(1)).toBe(1);
    expect(IngredientAnalysisService.clampEwgScore(10)).toBe(10);
    expect(IngredientAnalysisService.clampEwgScore(4.4)).toBe(4);
  });

  it("clamps confidence to [0, 1] and degrades non-numeric input to 0.5", () => {
    expect(IngredientAnalysisService.clampConfidence(1.7)).toBe(1);
    expect(IngredientAnalysisService.clampConfidence(-0.4)).toBe(0);
    expect(IngredientAnalysisService.clampConfidence(0)).toBe(0);
    expect(IngredientAnalysisService.clampConfidence(0.85)).toBe(0.85);
    expect(IngredientAnalysisService.clampConfidence("high" as any)).toBe(0.5);
    expect(IngredientAnalysisService.clampConfidence(NaN)).toBe(0.5);
  });
});
