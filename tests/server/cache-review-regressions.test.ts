/**
 * Cache regressions from the adversarial review (2026-09-26). Coded
 * additives share one analysis row per code, so these pin what may and may
 * not flow through that shared row. The store below is keyed exactly like
 * production (analysisCacheKey) and persists across calls, like the DB.
 */
import { describe, it, expect, vi } from "vitest";
import { AIVettingService, IngredientAnalysis } from "../../server/services/aiVettingService.js";
import { FoodSafetyService } from "../../server/services/foodSafetyService.js";
import { analysisCacheKey } from "../../server/utils/cacheKey.js";

function buildService() {
  const service = new AIVettingService("groq", undefined, undefined, undefined, false);
  const rows = new Map<string, IngredientAnalysis>();
  const store = {
    normalizeIngredientName: analysisCacheKey,
    getAnalysis: vi.fn(async (name: string) => rows.get(analysisCacheKey(name)) ?? null),
    getAnalysesBatch: vi.fn(async (names: string[]) => {
      const m = new Map<string, IngredientAnalysis>();
      for (const n of names) {
        const k = analysisCacheKey(n);
        if (rows.has(k)) m.set(k, rows.get(k)!);
      }
      return m;
    }),
    shouldRefreshAnalysis: () => false,
    upsertAnalysis: vi.fn(async (name: string, _pt: string, a: IngredientAnalysis) => {
      rows.set(analysisCacheKey(name), { ...a });
    }),
  };
  const provider = {
    analyzeIngredient: vi.fn(async (name: string) => ({
      status: "safe",
      rationale: `rationale written for "${name}"`,
      description: `description of "${name}"`,
      edgeCases: "none",
      confidence: 0.9,
    })),
  };
  (service as any).analysisService = store;
  (service as any).aiProvider = provider;
  (service as any).sleep = vi.fn().mockResolvedValue(undefined);
  return { service, rows, provider };
}

describe("shared code rows", () => {
  it("a coded additive is analyzed under its verified identity, not a label's wording", async () => {
    const { service, provider } = buildService();
    const [a] = await service.analyzeIngredients(["Acidity Regulator Acetic Acid INS 260"], "food");
    const [b] = await service.analyzeIngredients(["acidity regulator E260"], "food");
    expect(provider.analyzeIngredient).toHaveBeenCalledTimes(1);
    expect(provider.analyzeIngredient.mock.calls[0][0]).toBe("Acetic Acid INS 260");
    // one wording-neutral rationale, each product keeps its own label name
    expect(a.rationale).toBe(b.rationale);
    expect(a.rationale).not.toMatch(/Acidity Regulator Acetic Acid/);
    expect([a.name, b.name]).toEqual(["Acidity Regulator Acetic Acid INS 260", "acidity regulator E260"]);
  });

  it("a damaged label's analysis is isolated — never served to a clean product", async () => {
    const { service, rows, provider } = buildService();
    await service.analyzeIngredients(["acidity inal information 6g a quantity regulator E260"], "food");
    expect(rows.has("ins 260")).toBe(false);
    const [clean] = await service.analyzeIngredients(["Acidity regulator INS 260"], "food");
    expect(provider.analyzeIngredient).toHaveBeenCalledTimes(2);
    expect(clean.rationale).not.toMatch(/inal information/);
  });

  it("a merged name ('INS 504 Taurine') cannot write the shared INS 504 row", async () => {
    const { service, rows } = buildService();
    await service.analyzeIngredients(["INS 504 Taurine"], "food");
    expect(rows.has("ins 504")).toBe(false);
  });

  it("concurrent wordings of one code share one call but each keeps its OWN name", async () => {
    const { service, provider } = buildService();
    const [[clean], [damaged]] = await Promise.all([
      service.analyzeIngredients(["Humectant INS 1520"], "food"),
      service.analyzeIngredients(["acidity inal information 6g a quantity regulator E1520"], "food"),
    ]);
    expect(clean.name).toBe("Humectant INS 1520");
    expect(damaged.name).toBe("acidity inal information 6g a quantity regulator E1520");
    expect(provider.analyzeIngredient.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("the refresh cron's bare key ('ins 1520') is analyzed with a hint, not as a lone number", async () => {
    const { service, provider } = buildService();
    await service.analyzeIngredient("ins 1520", "food");
    expect(provider.analyzeIngredient.mock.calls[0][0]).toBe("Food Additive INS 1520");
  });
});

describe("refresh cron — orphaned legacy rows", () => {
  it("a row keyed under the old scheme is not its own cache key (the cron skips it)", () => {
    for (const legacy of ["preservative-e211", "stabilizers - e1422", "e415", "firvour enhancers - e627 & e631"]) {
      expect(analysisCacheKey(legacy)).not.toBe(legacy);
    }
    for (const live of ["sugar", "ins 211", "ins 500(ii)", "acidity regulator (ins 296)"]) {
      expect(analysisCacheKey(live)).toBe(live);
    }
  });
});

describe("registry name match — whole identity only", () => {
  it("a registry phrase inside a longer name is not that additive's identity", async () => {
    const svc = new FoodSafetyService();
    for (const name of ["Calcium Lactate Gluconate", "Rosemary Extract and Mixed Tocopherols", "Calcium Carbonate Fortified Wheat Flour"]) {
      expect((await svc.lookupFoodIngredient(name)).name).toBeUndefined();
    }
  });

  it("…while class/qualifier wording around it still resolves", async () => {
    const svc = new FoodSafetyService();
    expect((await svc.lookupFoodIngredient("Antioxidant Mixed Tocopherols")).found).toBe(true);
    expect((await svc.lookupFoodIngredient("Acidity Regulator Citric Acid")).name).toBe("Citric Acid");
  });
});
