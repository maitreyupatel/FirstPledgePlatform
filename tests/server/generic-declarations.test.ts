/**
 * Generic label declarations get a fixed, confident verdict (backlog E1.12).
 * FSSAI (Labelling and Display Regulations, 2020, Reg. 5) lets labels declare
 * spices/condiments by class title and natural/nature-identical flavourings
 * by class name; the model scored these ~0.2 and held 12 otherwise complete
 * products in the 2026-09-26 repair. Names below are from real labels.
 */
import { describe, it, expect, vi } from "vitest";
import { genericDeclarationKind, genericDeclarationVerdict } from "../../server/services/genericDeclarations";
import { AIVettingService, IngredientAnalysis } from "../../server/services/aiVettingService.js";
import { analysisCacheKey } from "../../server/utils/cacheKey.js";
import { evaluatePublishGate } from "../../server/services/publishGate";
import { parseIngredients } from "../../server/utils/ingredientParser";

describe("genericDeclarationKind — only whole declarations match", () => {
  it("flavour class declarations as printed on real labels", () => {
    for (const n of [
      "Natural Flavouring Substances",
      "Flavour-natural And Nature Identical Flavouring Substances",
      "Natural And Nature Identical Flavouring Substances",
      "Natural & Nature Identical Flavouring Substances",
      "Nature Identical Flavouring Substance",
      "Natural Flavours",
      "Permitted Natural Flavours",
    ]) {
      expect(genericDeclarationKind(n), n).toBe("flavouring");
    }
  });

  it("spice class titles as printed on real labels", () => {
    for (const n of [
      "Spices and Condiments", "Spices & Condiments", "spices & condiments", "Spices And Condiments", "Mixed Spices", "Spices",
      "Spice Extracts", "Spice Mix", "Mixed Spice Powder", "Natural Spices",
    ]) {
      expect(genericDeclarationKind(n), n).toBe("spices");
    }
  });

  it("never matches a code, a named flavour, a merged name, a compound head or damaged text", () => {
    for (const n of [
      "Flavour Enhancers INS 627", // a coded additive
      "Flavour 627",
      "Flavour Enhancer",
      "Artificial Flavouring Substance - Vanilla", // named flavour: normal analysis
      "mango flavours",
      "Iodised Salt And Nature Identical Flavouring Substance", // merged: salt must not inherit it
      "Seasoning", // often a compound whose contents ARE listed
      "Spices and Condiments (onion powder", // damaged
      "Seeds & Nuts",
      "Natural Colour",
      "Dehydrated Vegetable Powder",
      "",
    ]) {
      expect(genericDeclarationKind(n), n).toBeNull();
    }
  });

  it("only what the regulation permits (review): artificial flavours need their name, type must be stated, herbs are not spices", () => {
    for (const n of [
      "Nature Identical And Artificial Flavouring Substances", // artificial must carry the flavour's common name
      "natural, nature-identical & artificial flavouring substances",
      "Artificial Flavouring Substances",
      "Flavours", // type not stated
      "Added Flavour",
      "Herbs", // for supplements, herbs are the actives
      "Mixed Herbs",
      "Condiments",
      "Mixed Condiments",
    ]) {
      expect(genericDeclarationKind(n), n).toBeNull();
    }
  });

  it("applies to food and supplements only", () => {
    expect(genericDeclarationVerdict("Natural Flavouring Substances", "food")?.status).toBe("caution");
    expect(genericDeclarationVerdict("Natural Flavouring Substances", "supplement")?.confidence).toBe(0.85);
    expect(genericDeclarationVerdict("Natural Flavouring Substances", "cosmetic")).toBeNull();
  });

  it("the verdict is caution for non-disclosure, cites FSSAI, and keeps the label's wording", () => {
    const v = genericDeclarationVerdict("Spices & Condiments", "food")!;
    expect(v.name).toBe("Spices & Condiments");
    expect(v.status).toBe("caution");
    expect(v.rationale).toMatch(/Labelling and Display Regulations, 2020/);
    expect(v.rationale).toMatch(/does not list the individual spices/);
    expect(v.rationale).not.toMatch(/never their individual/); // review: overclaimed the rule
    expect(v.sourceUrl).toMatch(/^https:\/\/fssai\.gov\.in\//);
  });
});

function buildService() {
  const service = new AIVettingService("groq", undefined, undefined, undefined, false);
  const rows = new Map<string, IngredientAnalysis>();
  // The stale AI verdict production held for this key before E1.12
  rows.set("spices and condiments", {
    name: "spices and condiments", status: "caution", rationale: "the label does not specify which spices",
    description: "", edgeCases: "", sourceUrl: "", confidence: 0.2, productType: "food",
  });
  const store = {
    normalizeIngredientName: analysisCacheKey,
    getAnalysis: vi.fn(async (name: string) => rows.get(analysisCacheKey(name)) ?? null),
    getAnalysesBatch: vi.fn(async (names: string[]) => {
      const m = new Map<string, IngredientAnalysis>();
      for (const n of names) if (rows.has(analysisCacheKey(n))) m.set(analysisCacheKey(n), rows.get(analysisCacheKey(n))!);
      return m;
    }),
    shouldRefreshAnalysis: () => false,
    upsertAnalysis: vi.fn(async (name: string, _pt: string, a: IngredientAnalysis) => {
      rows.set(analysisCacheKey(name), { ...a });
    }),
  };
  // Like the real model: an undisclosed category gets ~0.2, anything else 0.9
  const provider = {
    analyzeIngredient: vi.fn(async (name: string) => ({
      status: /flavou?r|spice|condiment/i.test(name) ? "caution" : "safe",
      rationale: "ok", description: "", edgeCases: "",
      confidence: /flavou?r|spice|condiment/i.test(name) ? 0.2 : 0.9,
    })),
  };
  const sleep = vi.fn().mockResolvedValue(undefined);
  (service as any).analysisService = store;
  (service as any).aiProvider = provider;
  (service as any).sleep = sleep;
  return { service, rows, provider, store, sleep };
}

describe("parser — a declaration that lists its contents has disclosed them (review)", () => {
  it("a spice class with a list becomes the listed spices, never the bare class", () => {
    expect(parseIngredients("Water, MIXED SPICES (CLOVE, CINNAMON, CHILLI), Salt")).toEqual(["Water", "Clove", "Cinnamon", "Chilli", "Salt"]);
    expect(parseIngredients("Oats, Spices and Condiments (34%) (Onions, Turmeric, Cumin)")).toEqual(["Oats", "Onions", "Turmeric", "Cumin"]);
  });

  it("a percentage is not a list: the bare class stays (undisclosed)", () => {
    expect(parseIngredients("Milk solids, spices & condiments (1%)")).toEqual(["Milk solids", "spices & condiments"]);
  });

  it("a flavouring that names its flavour is analyzed as written, not as undisclosed", () => {
    const names = parseIngredients("Sugar, Natural Flavouring Substances (Blueberry)");
    expect(names).toEqual(["Sugar", "Natural Flavouring Substances - Blueberry"]);
    expect(genericDeclarationKind(names[1])).toBeNull();
  });

  it("a note or a fused pair inside a spice list is held, never published as a spice", () => {
    const note = parseIngredients("Salt, Spices & Condiments (Contains Mustard)");
    expect(note.some((n) => /Mustard/.test(n) && genericDeclarationKind(n) === null)).toBe(true);
    expect(note.filter((n) => /Mustard/.test(n)).every((n) => /\(/.test(n))).toBe(true); // held form
    const fused = parseIngredients("SPICES & CONDIMENTS (CHILLI, CARDAMOM NUTMEG, MACE)");
    expect(fused).toContain("Chilli");
    expect(fused).toContain("Mace");
    expect(fused.some((n) => /Cardamom Nutmeg\)/i.test(n))).toBe(true); // held
    const powders = parseIngredients("Mixed Spices (Onion powder Coriander powder, Turmeric powder)");
    expect(powders).toContain("Turmeric powder");
    expect(powders.some((n) => /Coriander powder\)/.test(n))).toBe(true); // held, not one "spice"
  });

  it("a numeric fragment in a spice list is held, never silently dropped (corpus: Green chilli sauce)", () => {
    const out = parseIngredients("salt, spices (cumin powder, 0,1 coriander powder)");
    expect(out.some((n) => /\(0\)/.test(n))).toBe(true);
  });

  it("an artificial flavour keeps the name its label gives it — that name is what makes it compliant", () => {
    expect(parseIngredients("Milk solids, nature identical and artificial flavouring substances (rose), active culture")).toEqual([
      "Milk solids",
      "nature identical and artificial flavouring substances - rose",
      "active culture",
    ]);
    // nested inside the declaration, as Thums up prints it
    expect(parseIngredients("sugar, flavours (natural, nature-identical & artificial (cola) flavouring substances).")).toEqual([
      "sugar",
      "natural, nature-identical & artificial flavouring substances - cola",
    ]);
  });

  it("a bare flavour class qualified by a declaration is unchanged (Mountain Dew)", () => {
    expect(parseIngredients("SUGAR, FLAVOUR (NATURAL FLAVOURING SUBSTANCES), PRESERVATIVE (211)")).toEqual([
      "Sugar",
      "Natural Flavouring Substances",
      "Preservative INS 211",
    ]);
  });

  it("a named flavour printed in capitals reads like every other name", () => {
    expect(parseIngredients("Sugar, Nature Identical Flavouring Substance (CHOCOLATE)")).toEqual([
      "Sugar",
      "Nature Identical Flavouring Substance - Chocolate",
    ]);
  });
});

describe("analysis pipeline — generic declarations", () => {
  it("never serves a stale 0.2 cache row, with no AI call and no pacing", async () => {
    const { service, provider, sleep } = buildService();
    const [a, b] = await service.analyzeIngredients(["Spices and Condiments", "Natural Flavouring Substances"], "food");
    expect(provider.analyzeIngredient).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect([a.status, a.confidence, a.name]).toEqual(["caution", 0.85, "Spices and Condiments"]);
    expect(b.name).toBe("Natural Flavouring Substances");
  });

  it("is never written to the shared cache — deployed code predating the rule reads it", async () => {
    const { service, rows, store } = buildService();
    await service.analyzeIngredients(["Spices and Condiments", "Mixed Spices"], "food");
    await service.analyzeIngredient("Natural Flavouring Substances", "food");
    expect(store.upsertAnalysis).not.toHaveBeenCalled();
    expect(rows.get("spices and condiments")?.confidence).toBe(0.2); // untouched
  });

  it("the single-ingredient path (refresh cron) takes the fixed verdict too", async () => {
    const { service, provider } = buildService();
    const v = await service.analyzeIngredient("spices and condiments", "food");
    expect(v.confidence).toBe(0.85);
    expect(provider.analyzeIngredient).not.toHaveBeenCalled();
  });

  it("a product held only by a generic declaration now passes the unchanged gate", async () => {
    const { service } = buildService();
    const analyses = await service.analyzeIngredients(["Carbonated Water", "Sugar", "Natural Flavouring Substances"], "food");
    const gate = evaluatePublishGate(analyses, { totalParsed: 3 });
    expect(gate.reasons).toEqual([]);
    expect(gate.publish).toBe(true);
  });
});
