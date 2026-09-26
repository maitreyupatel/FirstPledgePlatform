/**
 * Regressions from adversarial review ROUND 2 (2026-09-26) of the parser.
 * Every input is a reviewer's reproduction. The rule: an additive on the
 * label reaches the report; text that cannot be read is HELD; the parser
 * never truncates the list and never invents a clean-looking wrong name.
 */
import { describe, it, expect } from "vitest";
import { parseIngredients, looksGarbledIngredientName } from "../../server/utils/ingredientParser";

const held = (names: string[]) => names.filter(looksGarbledIngredientName);
const parse = parseIngredients;

describe("a class's bracket names the additive (R2-1/24)", () => {
  it("promotes a named substance under every functional class", () => {
    expect(parse("Acidity Regulator (Citric Acid), Sugar, Water")).toEqual(["Citric Acid", "Sugar", "Water"]);
    expect(parse("Sugar, Raising Agent (Sodium Bicarbonate), Salt")).toEqual(["Sugar", "Sodium Bicarbonate", "Salt"]);
    expect(parse("Potato, Oil, Flavour Enhancer (Monosodium Glutamate), Salt")).toContain("Monosodium Glutamate");
    expect(parse("Maida, Leavening Agents (Sodium Bicarbonate, Ammonium Bicarbonate), Salt")).toEqual([
      "Maida",
      "Sodium Bicarbonate",
      "Ammonium Bicarbonate",
      "Salt",
    ]);
  });

  it("minerals and vitamins list their compounds (Bisleri)", () => {
    expect(parse("TREATED WATER, MINERALS (CALCIUM CHLORIDE, MAGNESIUM SULPHATE, POTASSIUM BICARBONATE).")).toEqual([
      "Treated Water",
      "Calcium Chloride",
      "Magnesium Sulphate",
      "Potassium Bicarbonate",
    ]);
    expect(parse("Sugar, Vitamins (Niacin, B6, B12)")).toEqual(["Sugar", "Niacin", "Vitamin B6", "Vitamin B12"]);
  });

  it("a descriptor-only bracket is not promoted to an ingredient (R2-8)", () => {
    expect(parse("Wheat Flour, Emulsifier (Vegetable Origin), Salt")).toEqual(["Wheat Flour", "Salt"]);
    expect(parse("Water, Sugar, Preservatives (Class II), Salt")).toEqual(["Water", "Sugar", "Salt"]);
    expect(parse("Wheat Flour, Emulsifier (Soy), Salt")).toEqual(["Wheat Flour", "Soy Emulsifier", "Salt"]);
  });
});

describe("statements are removed one sentence at a time — never 'everything after' (R2-2)", () => {
  it("a colour declared after the allergen line survives", () => {
    expect(
      parse("Sugar, Emulsifiers [322, 471]. Contains Wheat, Milk and Soy. CONTAINS PERMITTED SYNTHETIC FOOD COLOUR (INS 102) AND ADDED FLAVOUR (NATURAL FLAVOURING SUBSTANCES - VANILLA)"),
    ).toContain("Synthetic Food Colour INS 102");
    const out = parse("Sugar, Liquid Glucose, Acidity Regulator (INS 330). May contain traces of milk. Contains permitted synthetic food colour (INS 129)");
    expect(out.some((n) => /INS 129$/.test(n))).toBe(true);
    const mango = parse("Sugar, Glucose Syrup, Milk Solids. Allergen Information: Contains Milk. Contains Permitted Synthetic Food Colours (INS 110, INS 102) and Added Flavours (Mango)");
    expect(mango.some((n) => /INS 110$/.test(n)) && mango.some((n) => /INS 102$/.test(n))).toBe(true);
    expect(mango).toContain("Mango Flavour");
    expect(parse("Wheat Flour, Sugar. Best before 9 months from manufacture. Contains Permitted Natural Colour (INS 160c)")).toContain(
      "Natural Colour INS 160c",
    );
  });

  it("an uncoded declaration without 'permitted/added' keeps its additive", () => {
    expect(parse("Sugar, Salt. Contains Natural Colour (Annatto).")).toEqual(["Sugar", "Salt", "Annatto Colour"]);
  });

  it("removing a statement leaves a boundary, so the next one is still recognised", () => {
    expect(parse("Water, Sugar, Natural Flavouring Substances Allergen Declaration: Contains Milk. May Contains Soy")).toEqual([
      "Water",
      "Sugar",
      "Natural Flavouring Substances",
    ]);
  });
});

describe("mid-list headings are held, never cut (R2-3, R2-16)", () => {
  it("a nutrition heading bled into the middle does not truncate the list", () => {
    const out = parse(
      "water, green chilli (30%), salt, sugar, thickener (e1422), garlic powder, acidity Nutritional Information per 100g Energy (kcal) 45 regulator (e296, e260), emulsifying, stabilizing agent (e415), spices (cumin powder, coriander powder), preservative (e211)",
    );
    expect(held(out).length).toBeGreaterThan(0);
    expect(out).toContain("preservative E211");
    const facts = parse("Wheat Flour, Sugar, Nutrition Facts Energy 450 kcal Protein 6 g, Palm Oil, Milk Solids, Emulsifier (INS 322), Preservative (INS 282)");
    expect(held(facts).length).toBeGreaterThan(0);
    expect(facts).toContain("Preservative INS 282");
  });

  it("a mid-list storage phrase does not cut the codes after it", () => {
    const out = parse("Tomato, Sugar, Salt, store in a cool dry place Acidity Regulator (INS 260), Preservative (INS 211)");
    expect(out).toContain("Preservative INS 211");
    expect(held(out).length).toBeGreaterThan(0);
  });

  it("storage directions at the end are dropped as names", () => {
    expect(parse("Water, Chilli, Salt, store in a cool, dry and hygienic place, keep refrigerated")).toEqual(["Water", "Chilli", "Salt"]);
  });

  it("a heading right after a code group never cuts inside the bracket", () => {
    const out = parse("Water, Sugar, Salt, Preservative (INS 211, INS 202) NUTRITIONAL INFORMATION Energy 20 kcal");
    expect(out).toEqual(["Water", "Sugar", "Salt", "Preservative INS 211", "Preservative INS 202"]);
  });
});

describe("OCR-damaged codes are held, never published as names (R2-4, R2-5, R2-20)", () => {
  it("a prefixed code with l/o/s for digits", () => {
    for (const label of [
      "Water, Sugar, Preservative (INS 21l), Salt",
      "Water, Sugar, Thickener (INS l422), Salt",
      "Water, Sugar, Colour (INS l02), Salt",
      "Water, Sugar, Class II Preservative (INS 2l1), Salt",
    ]) {
      expect(held(parse(label)).length, label).toBeGreaterThan(0);
    }
    const mixed = parse("Water, Sugar, Preservatives (INS 2l1, INS 202), Salt");
    expect(held(mixed).length).toBeGreaterThan(0);
    expect(mixed).toContain("Preservatives INS 202");
  });

  it("a bracket whose every code is damaged still holds", () => {
    for (const label of [
      "REFINED WHEAT FLOUR (MAIDA), SUGAR, RAISING AGENTS [INS 503(ll), 500(ll)], MILK SOLIDS",
      "CARBONATED WATER, SUGAR, ACIDITY REGULATORS (INS 330 (l), INS 331 (lll)), CAFFEINE",
      "Water, Sugar, Caramel Colour (INS l50d), Salt",
      "Water, Caramel Colour (INS 150(d)), Sugar",
      "Water, Sugar, Paprika Extract (INS 16O c), Salt",
    ]) {
      expect(held(parse(label)).length, label).toBeGreaterThan(0);
    }
  });

  it("a code missing from the Codex INS list is garbled wherever it appears", () => {
    for (const n of ["INS 1501", "E1501", "Caramel INS 1501", "Citric Acid INS 3300"]) {
      expect(looksGarbledIngredientName(n), n).toBe(true);
    }
    expect(held(parse("Carbonated Water, Sugar, INS 1501, Caffeine")).length).toBeGreaterThan(0);
    expect(looksGarbledIngredientName("Acidity Regulator INS 330")).toBe(false);
  });
});

describe("ingredients are not lost or merged around brackets", () => {
  it("a compound ingredient carrying an additive keeps both (R2-6)", () => {
    expect(parse("Refined Palm Oil (with Antioxidant (INS 319)), Sugar, Salt")).toEqual([
      "Refined Palm Oil",
      "Antioxidant INS 319",
      "Sugar",
      "Salt",
    ]);
    const salt = parse("Iodised Salt (with Anticaking Agent INS 551), Sugar");
    expect(salt).toContain("Iodised Salt");
    expect(salt).toContain("Anticaking Agent INS 551");
    expect(parse("Rice Bran Oil (Antioxidant (INS 319)), Salt")).toEqual(["Rice Bran Oil", "Antioxidant INS 319", "Salt"]);
  });

  it("an origin qualifier after a code group is not an ingredient (R2-10)", () => {
    expect(parse("Wheat Flour, Emulsifier (INS 471) of Vegetable Origin, Salt")).toEqual(["Wheat Flour", "Emulsifier INS 471", "Salt"]);
  });

  it("an explicit 'with' marks the boundary — a 4-word oil is not held (R2-11)", () => {
    const out = parse("Potato, Refined Rice Bran Oil with Antioxidant (INS 319), Salt");
    expect(out).toEqual(["Potato", "Refined Rice Bran Oil", "Antioxidant INS 319", "Salt"]);
  });

  it("'<English> (<Hindi>) <form>' is one clean ingredient (R2-12)", () => {
    expect(parse("Cumin (Jeera) Seeds, Salt, Chilli")).toEqual(["Cumin Seeds", "Salt", "Chilli"]);
    expect(parse("Bengal Gram (Chana) Dal, Salt, Oil")).toEqual(["Bengal Gram Dal", "Salt", "Oil"]);
    expect(parse("Milk (Cow) Solids, Sugar")).toEqual(["Milk Solids", "Sugar"]);
    expect(parse("Sugar, Artificial (Vanilla) Flavouring Substances")).toEqual(["Sugar", "Artificial Flavouring Substances"]);
  });

  it("a lost comma before a food word after a complete ingredient is held (R2-13)", () => {
    expect(held(parse("Sugar, Cocoa Solids, Edible Vegetable Oil (Palmolein) Milk Solids, Colour (INS 150d)")).length).toBeGreaterThan(0);
    expect(held(parse("Mixed Spices (Chilli, Coriander) Water, Salt")).length).toBeGreaterThan(0);
  });

  it("sub-type qualifiers at top level are kept and both sub-types survive dedup (R2-19)", () => {
    expect(parse("Wheat Flour, Sugar, Sodium Carbonate INS 500(i), Sodium Bicarbonate INS 500(ii), Salt")).toEqual([
      "Wheat Flour",
      "Sugar",
      "Sodium Carbonate INS 500(i)",
      "Sodium Bicarbonate INS 500(ii)",
      "Salt",
    ]);
    expect(held(parse("Water, INS 500 (11), Sugar")).length).toBeGreaterThan(0);
  });

  it("a held merged name is not deduplicated away behind a clean declaration (R2-18)", () => {
    const out = parse("CARBONATED WATER, SUGAR, ANTICAKING AGENT (INS 504), ACIDITY REGULATORS (INS 330, INS 504 (1) TAURINE (0.4%)), CAFFEINE");
    expect(held(out).length).toBeGreaterThan(0);
  });
});

describe("class phrases and abbreviations (R2-7, R2-9, R2-17)", () => {
  it("label abbreviations do not split a name", () => {
    expect(parse("Sugar, Hydrogenated Veg. Oil, Salt")).toEqual(["Sugar", "Hydrogenated Veg. Oil", "Salt"]);
    expect(parse("MILK SOLIDS, SUGAR, L. ACIDOPHILUS, B. BIFIDUM")).toEqual(["Milk Solids", "Sugar", "L. Acidophilus", "B. Bifidum"]);
  });

  it("paired classes and qualifiers stay one class — no junk 'Thickening' or 'Class-II'", () => {
    const pair = parse("Wheat Flour, Thickening & Gelling Agent (INS 440, INS 415), Salt");
    expect(pair).not.toContain("Thickening");
    expect(pair).toContain("Thickening & Gelling Agent INS 440");
    expect(parse("Water, Class-II Preservative (INS 211), Salt")).not.toContain("Class-II");
    expect(parse("Water, Sugar, High Intensity Sweetener (INS 955)")).not.toContain("High Intensity");
    expect(parse("Sugar, Soy Emulsifier (INS 322), Salt")).toContain("Soy Emulsifier INS 322");
  });

  it("unbracketed codes after more class words are read, not stripped", () => {
    expect(parse("Cheese, Emulsifying Salts 339, 452, Salt")).toEqual([
      "Cheese",
      "Emulsifying Salts INS 339",
      "Emulsifying Salts INS 452",
      "Salt",
    ]);
    expect(parse("Water, Sugar, Anti-oxidant 320, Salt")).toContain("Anti-oxidant INS 320");
    expect(parse("Water, Sugar, Mineral Salt 341, Salt")).toContain("Mineral Salt INS 341");
  });
});

describe("newline-list layout (R2-15)", () => {
  it("a one-per-line list whose names also wrap is held, not split into fragments", () => {
    expect(held(parse("Aqua\nGlycerin\nButyrospermum Parkii\n(Shea) Butter\nPhenoxyethanol")).length).toBeGreaterThan(0);
    expect(held(parse("Wheat Flour\nSugar\nEdible Vegetable\nOil\nSalt")).length).toBeGreaterThan(0);
  });

  it("an 'Ingredients:' heading line is not an ingredient", () => {
    expect(parse("Ingredients:\nSugar\nSalt\nCardamom")).toEqual(["Sugar", "Salt", "Cardamom"]);
  });
});
