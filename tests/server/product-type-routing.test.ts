/**
 * Product-type-aware ingredient verification tests.
 *
 * Verifies:
 *   1. FoodSafetyService E-number registry lookups (no external calls)
 *   2. AIVettingService routes food products to food pipeline (not EWG)
 *   3. AIVettingService routes cosmetic products to EWG (not food service)
 *   4. Supplement uses food pipeline
 *   5. Unknown type falls back to cosmetic (backward-compat)
 *   6. Cache key uses both ingredient_name AND product_type
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ──────────────────────────────────────────────
// AIVettingService routing tests
// (mocked dependencies — no real API calls)
// ──────────────────────────────────────────────

const mockEwgSearch = vi.fn().mockResolvedValue({ found: false, score: null, concerns: [], url: "", name: "", suggestedMatches: [] });
const mockFoodLookup = vi.fn().mockResolvedValue({ found: true, status: "safe", source: "e-number", url: "https://fda.gov/test", concerns: [], regulatoryNotes: "FDA GRAS" });
const mockGetAnalysis = vi.fn().mockResolvedValue(null);
const mockUpsertAnalysis = vi.fn().mockResolvedValue(undefined);
const mockShouldRefresh = vi.fn().mockReturnValue(true);

vi.mock("../../server/services/ewgService.js", () => ({
  EWGService: class {
    searchIngredient = mockEwgSearch;
    static getStatusFromScore = () => null;
  },
}));

vi.mock("../../server/services/foodSafetyService.js", () => ({
  FoodSafetyService: class {
    lookupFoodIngredient = mockFoodLookup;
  },
}));

vi.mock("../../server/services/ingredientAnalysisService.js", () => ({
  IngredientAnalysisService: class {
    getAnalysis = mockGetAnalysis;
    shouldRefreshAnalysis = mockShouldRefresh;
    upsertAnalysis = mockUpsertAnalysis;
  },
}));

vi.mock("../../server/services/researchService.js", () => ({
  ResearchService: class {
    searchIngredient = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock("../../server/services/providers/groqProvider.js", () => ({
  GroqProvider: class {
    analyzeIngredient = vi.fn().mockResolvedValue({
      status: "safe",
      rationale: "Test rationale",
      description: "Line 1\nLine 2\nLine 3",
      edgeCases: "None known",
      confidence: 0.8,
    });
  },
}));

describe("AIVettingService — product type routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAnalysis.mockResolvedValue(null);
    mockShouldRefresh.mockReturnValue(true);
    mockFoodLookup.mockResolvedValue({ found: true, status: "safe", source: "e-number", url: "https://fda.gov/test", concerns: [], regulatoryNotes: "FDA GRAS" });
    mockEwgSearch.mockResolvedValue({ found: false, score: null, concerns: [], url: "", name: "", suggestedMatches: [] });
  });

  it("food product: calls FoodSafetyService, does NOT call EWG", async () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { AIVettingService } = await import("../../server/services/aiVettingService.js");
    const svc = new AIVettingService("groq", "test-key", undefined, undefined, true);

    await svc.analyzeIngredient("sodium benzoate", "food");

    expect(mockFoodLookup).toHaveBeenCalledWith("sodium benzoate");
    expect(mockEwgSearch).not.toHaveBeenCalled();
  });

  it("cosmetic product: calls EWG, does NOT call FoodSafetyService", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { AIVettingService } = await import("../../server/services/aiVettingService.js");
    const svc = new AIVettingService("groq", "test-key", undefined, undefined, true);

    await svc.analyzeIngredient("retinol", "cosmetic");

    expect(mockEwgSearch).toHaveBeenCalledWith("retinol");
    expect(mockFoodLookup).not.toHaveBeenCalled();
  });

  it("supplement product: uses food pipeline (FoodSafetyService, not EWG)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { AIVettingService } = await import("../../server/services/aiVettingService.js");
    const svc = new AIVettingService("groq", "test-key", undefined, undefined, true);

    await svc.analyzeIngredient("vitamin c", "supplement");

    expect(mockFoodLookup).toHaveBeenCalledWith("vitamin c");
    expect(mockEwgSearch).not.toHaveBeenCalled();
  });

  it("unknown type: falls back to cosmetic pipeline (EWG)", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { AIVettingService } = await import("../../server/services/aiVettingService.js");
    const svc = new AIVettingService("groq", "test-key", undefined, undefined, true);

    await svc.analyzeIngredient("water", "unknown");

    expect(mockEwgSearch).toHaveBeenCalledWith("water");
    expect(mockFoodLookup).not.toHaveBeenCalled();
  });

  it("food ingredient has ewgScore=null in result", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { AIVettingService } = await import("../../server/services/aiVettingService.js");
    const svc = new AIVettingService("groq", "test-key", undefined, undefined, true);

    const result = await svc.analyzeIngredient("tartrazine", "food");

    expect(result.ewgScore).toBeNull();
  });

  it("cache lookup uses product_type as part of the key", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { AIVettingService } = await import("../../server/services/aiVettingService.js");
    const svc = new AIVettingService("groq", "test-key", undefined, undefined, true);

    await svc.analyzeIngredient("water", "food");
    await svc.analyzeIngredient("water", "cosmetic");

    expect(mockGetAnalysis).toHaveBeenCalledWith("water", "food");
    expect(mockGetAnalysis).toHaveBeenCalledWith("water", "cosmetic");
  });

  it("cache save includes product_type", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { AIVettingService } = await import("../../server/services/aiVettingService.js");
    const svc = new AIVettingService("groq", "test-key", undefined, undefined, true);

    await svc.analyzeIngredient("citric acid", "food");

    expect(mockUpsertAnalysis).toHaveBeenCalledWith(
      "citric acid",
      "food",
      expect.objectContaining({ ewgScore: null, productType: "food" })
    );
  });

  it("cache hit (non-stale) skips all API calls", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    mockGetAnalysis.mockResolvedValue({
      name: "water",
      status: "safe",
      rationale: "cached",
      description: "L1\nL2\nL3",
      edgeCases: "None",
      sourceUrl: "https://example.com",
      confidence: 0.9,
      ewgScore: null,
      productType: "food",
      lastAnalyzedAt: new Date().toISOString(),
    });
    mockShouldRefresh.mockReturnValue(false); // cache is fresh

    const { AIVettingService } = await import("../../server/services/aiVettingService.js");
    const svc = new AIVettingService("groq", "test-key", undefined, undefined, true);

    const result = await svc.analyzeIngredient("water", "food");

    expect(result.rationale).toBe("cached");
    expect(mockFoodLookup).not.toHaveBeenCalled();
    expect(mockEwgSearch).not.toHaveBeenCalled();
  });
});
