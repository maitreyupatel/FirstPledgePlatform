/**
 * Grounded-analysis pipeline tests.
 * Invariants:
 *  1. INS-notation additives (Indian labels) resolve in the local registry —
 *     "Acidity Regulator (INS 296)" is Malic Acid, never a model guess
 *  2. Registry identities are injected into AI prompts as authoritative facts
 *  3. Compound search-grounded path is primary for unknown ingredients and
 *     falls back to the standard path on failure
 *  4. Verification gate: banned/low-confidence AI verdicts get a second
 *     opinion; disagreement takes the conservative status and caps confidence
 *  5. Opt-in batch analysis performs ONE model call for all uncached items
 *     while preserving registry status precedence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FoodSafetyService } from "../../server/services/foodSafetyService.js";
import { AIVettingService, IngredientAnalysis } from "../../server/services/aiVettingService.js";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("groq-sdk", () => ({
  default: class MockGroq {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {}
  },
}));

import { GroqProvider } from "../../server/services/providers/groqProvider.js";

// ── 1. INS notation resolves in the registry ─────────────────────────────────

describe("FoodSafetyService — INS number grounding", () => {
  const service = new FoodSafetyService(); // no API keys → registry only

  it.each([
    ["Acidity Regulator (INS 296)", "Malic Acid", "safe"],
    ["Acidity Regulator (INS 334)", "Tartaric Acid (L(+)-)", "safe"],
    ["Mineral Salt (INS 340)", "Potassium Phosphates", "safe"],
    ["Flavour Enhancer (INS 627)", "Disodium Guanylate", "safe"],
    ["Thickener (INS 1442)", "Hydroxypropyl Distarch Phosphate", "safe"],
    ["Colour (INS 102)", "Tartrazine", "caution"],
  ])("resolves %s → %s (%s)", async (label, expectedName, expectedStatus) => {
    const data = await service.lookupFoodIngredient(label);
    expect(data.found).toBe(true);
    expect(data.name).toBe(expectedName);
    expect(data.status).toBe(expectedStatus);
  });

  it("still resolves classic E-number notation", async () => {
    const data = await service.lookupFoodIngredient("tartrazine (E102)");
    expect(data.found).toBe(true);
    expect(data.name).toBe("Tartrazine");
  });

  it("returns not-found for genuinely unknown ingredients without network", async () => {
    const data = await service.lookupFoodIngredient("mystery himalayan herb");
    expect(data.found).toBe(false);
  });

  it("does NOT mistake vitamin dosages for additive codes", async () => {
    // "Vitamin E 400 IU" must not resolve to E400 (Alginic Acid)
    const data = await service.lookupFoodIngredient("Vitamin E 400 IU");
    expect(data.name).not.toBe("Alginic Acid");
    expect(data.found).toBe(false);
  });

  it("does NOT resolve partial names to longer registry entries", async () => {
    // "Cellulose" must not match "Carboxymethyl Cellulose (CMC)"
    const data = await service.lookupFoodIngredient("Cellulose");
    expect(data.found).toBe(false);
  });
});

// ── Parser must deliver INS codes to the registry ────────────────────────────

describe("parseIngredients — additive codes survive parenthesis stripping", () => {
  it("keeps INS codes from parenthetical notation", async () => {
    const { parseIngredients } = await import("../../server/utils/ingredientParser.js");
    const service = new FoodSafetyService();

    const parsed = parseIngredients("Potato, Acidity Regulator (INS 296), raising agents (E503, E500)");
    // The INS/E codes must survive parsing…
    expect(parsed.some((p) => /ins[-\s]?296/i.test(p))).toBe(true);
    expect(parsed.some((p) => /e[-\s]?503/i.test(p))).toBe(true);
    expect(parsed.some((p) => /e[-\s]?500/i.test(p))).toBe(true);

    // …and resolve in the registry end to end
    const insEntry = parsed.find((p) => /ins[-\s]?296/i.test(p))!;
    const data = await service.lookupFoodIngredient(insEntry);
    expect(data.found).toBe(true);
    expect(data.name).toBe("Malic Acid");
  });

  it("still strips non-additive parentheticals", async () => {
    const { parseIngredients } = await import("../../server/utils/ingredientParser.js");
    const parsed = parseIngredients("Instant coffee (water, coffee), sugar");
    expect(parsed).toEqual(["Instant coffee", "sugar"]);
  });
});

// ── Shared fixture ───────────────────────────────────────────────────────────

function buildService() {
  // No API key → no real provider/compound; we inject fakes.
  const service = new AIVettingService("groq", undefined, undefined, undefined, false);

  const fakeAnalysisService = {
    normalizeIngredientName: (n: string) => n.toLowerCase().trim(),
    getAnalysis: vi.fn().mockResolvedValue(null),
    getAnalysesBatch: vi.fn().mockResolvedValue(new Map()),
    shouldRefreshAnalysis: (a: any) => !a,
    upsertAnalysis: vi.fn().mockResolvedValue(undefined),
  };

  const fakeProvider = {
    analyzeIngredient: vi.fn().mockResolvedValue({
      status: "safe",
      rationale: "ai rationale",
      description: "d",
      edgeCases: "e",
      confidence: 0.9,
    }),
  };

  (service as any).analysisService = fakeAnalysisService;
  (service as any).aiProvider = fakeProvider;
  (service as any).sleep = vi.fn().mockResolvedValue(undefined);

  return { service, fakeAnalysisService, fakeProvider };
}

const groundedResult = {
  status: "caution" as const,
  rationale: "FSSAI search-grounded rationale",
  description: "d",
  edgeCases: "e",
  confidence: 0.8,
};

// ── 2. Registry identity injected into prompts ───────────────────────────────

describe("registry identity injection", () => {
  it("passes the verified additive identity to the AI as an authoritative source", async () => {
    const { service, fakeProvider } = buildService();

    const result = await service.analyzeIngredient("Acidity Regulator (INS 334)", "food");

    expect(fakeProvider.analyzeIngredient).toHaveBeenCalledTimes(1);
    const researchArg = fakeProvider.analyzeIngredient.mock.calls[0][2];
    expect(researchArg.length).toBeGreaterThan(0);
    expect(researchArg[0].title).toContain("VERIFIED ADDITIVE IDENTITY");
    expect(researchArg[0].title).toContain("Tartaric Acid");
    // Registry status takes precedence over the AI status
    expect(result.status).toBe("safe");
  });
});

// ── 3. Compound grounded path: primary for unknowns, safe fallback ──────────

describe("Compound search-grounded path", () => {
  it("uses Compound for registry-miss ingredients and skips the plain provider", async () => {
    const { service, fakeAnalysisService, fakeProvider } = buildService();
    const fakeCompound = { analyzeWithSearch: vi.fn().mockResolvedValue(groundedResult) };
    (service as any).compoundService = fakeCompound;

    const result = await service.analyzeIngredient("mystery himalayan herb", "food");

    expect(fakeCompound.analyzeWithSearch).toHaveBeenCalledTimes(1);
    expect(fakeProvider.analyzeIngredient).not.toHaveBeenCalled();
    expect(result.status).toBe("caution");
    expect(result.rationale).toContain("search-grounded");
    expect(fakeAnalysisService.upsertAnalysis).toHaveBeenCalledTimes(1);
  });

  it("falls back to the standard path when Compound fails", async () => {
    const { service, fakeProvider } = buildService();
    const fakeCompound = { analyzeWithSearch: vi.fn().mockRejectedValue(new Error("compound down")) };
    (service as any).compoundService = fakeCompound;

    const result = await service.analyzeIngredient("mystery himalayan herb", "food");

    expect(fakeProvider.analyzeIngredient).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("safe"); // from the plain provider
  });
});

// ── 4. Verification gate ─────────────────────────────────────────────────────

describe("verification gate (applyVerification)", () => {
  const base: IngredientAnalysis = {
    name: "test ingredient",
    status: "banned",
    rationale: "r",
    description: "d",
    edgeCases: "none",
    sourceUrl: "",
    confidence: 0.9,
    productType: "cosmetic",
  };

  it("skips verification for confident non-banned verdicts", async () => {
    const { service } = buildService();
    const fakeCompound = { analyzeWithSearch: vi.fn() };
    (service as any).compoundService = fakeCompound;

    const result = await (service as any).applyVerification({ ...base, status: "safe" });
    expect(fakeCompound.analyzeWithSearch).not.toHaveBeenCalled();
    expect(result.status).toBe("safe");
  });

  it("agreement raises confidence and keeps the status", async () => {
    const { service } = buildService();
    const fakeCompound = {
      analyzeWithSearch: vi.fn().mockResolvedValue({ ...groundedResult, status: "banned", confidence: 0.85 }),
    };
    (service as any).compoundService = fakeCompound;

    const result = await (service as any).applyVerification({ ...base, confidence: 0.5 });
    expect(result.status).toBe("banned");
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("disagreement takes the conservative status, caps confidence, and flags for review", async () => {
    const { service } = buildService();
    const fakeCompound = {
      analyzeWithSearch: vi.fn().mockResolvedValue({ ...groundedResult, status: "safe", confidence: 0.9 }),
    };
    (service as any).compoundService = fakeCompound;

    const result = await (service as any).applyVerification(base);
    expect(result.status).toBe("banned"); // conservative wins
    expect(result.confidence).toBeLessThanOrEqual(0.5); // below the publish gate
    expect(result.edgeCases).toContain("flagged for manual review");
  });

  it("keeps the primary verdict when verification itself fails", async () => {
    const { service } = buildService();
    const fakeCompound = { analyzeWithSearch: vi.fn().mockRejectedValue(new Error("down")) };
    (service as any).compoundService = fakeCompound;

    const result = await (service as any).applyVerification(base);
    expect(result.status).toBe("banned");
    expect(result.confidence).toBe(0.9);
  });
});

// ── 5. Batch analysis ────────────────────────────────────────────────────────

describe("batch analysis (BATCH_ANALYSIS=true)", () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.BATCH_ANALYSIS = "true";
  });
  afterEach(() => {
    delete process.env.BATCH_ANALYSIS;
  });

  function batchResponse(names: string[]) {
    return {
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: names.map((n) => ({
                name: n,
                status: "safe",
                rationale: `${n} batch rationale`,
                description: "d1\nd2\nd3",
                edgeCases: "none",
                confidence: 0.8,
              })),
            }),
          },
        },
      ],
    };
  }

  it("analyzes all uncached ingredients in ONE model call with registry precedence intact", async () => {
    const { service, fakeAnalysisService } = buildService();
    (service as any).aiProvider = new GroqProvider("fake-key"); // real provider, mocked SDK

    const names = ["Acidity Regulator (INS 296)", "Mineral Salt (INS 340)", "mystery herb one", "mystery herb two"];
    createMock.mockResolvedValue(batchResponse(names));

    const results = await service.analyzeIngredients(names, "food");

    expect(createMock).toHaveBeenCalledTimes(1); // ONE call for four ingredients
    expect(results).toHaveLength(4);
    // Registry entries keep authoritative status + boosted confidence
    expect(results[0].status).toBe("safe");
    expect(results[0].confidence).toBe(0.85);
    // Every ingredient was cached
    expect(fakeAnalysisService.upsertAnalysis).toHaveBeenCalledTimes(4);
  });

  it("falls back to sequential analysis when the batch shape is wrong", async () => {
    const { service } = buildService();
    (service as any).aiProvider = new GroqProvider("fake-key");

    const names = ["a-one", "b-two", "c-three", "d-four"];
    // First call: malformed batch (1 result for 4 items) → throws inside batch.
    // Subsequent calls: valid single-ingredient responses for the fallback.
    createMock
      .mockResolvedValueOnce(batchResponse(["only-one"]))
      .mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ status: "caution", rationale: "seq", description: "d", edgeCases: "e", confidence: 0.7 }),
            },
          },
        ],
      });

    const results = await service.analyzeIngredients(names, "food");

    expect(results).toHaveLength(4);
    // 1 failed batch call + 4 sequential calls
    expect(createMock).toHaveBeenCalledTimes(5);
    expect(results.every((r) => r.status === "caution")).toBe(true);
  });

  it("does not batch below the threshold", async () => {
    const { service } = buildService();
    (service as any).aiProvider = new GroqProvider("fake-key");

    createMock.mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ status: "safe", rationale: "r", description: "d", edgeCases: "e", confidence: 0.9 }) } },
      ],
    });

    await service.analyzeIngredients(["one-thing", "two-thing"], "food");
    // 2 sequential calls, no batch attempt
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
