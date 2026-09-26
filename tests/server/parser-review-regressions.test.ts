/**
 * Regressions from the adversarial review of the parser rewrite (2026-09-26).
 * Every input below is a reviewer's reproduction that produced a wrong but
 * clean-looking name, or silently dropped an ingredient, without holding
 * the label. The rule these pin: an unreadable label is HELD (a name that
 * trips looksGarbledIngredientName), never guessed and never truncated.
 */
import { describe, it, expect } from "vitest";
import { parseIngredients, looksGarbledIngredientName } from "../../server/utils/ingredientParser";
import { OFF_LABELS } from "../fixtures/offLabels";

const held = (names: string[]) => names.filter(looksGarbledIngredientName);

describe("additive codes in every printed form", () => {
  it("a spaced letter suffix is part of the code: 'Colour (150 d)' is caramel IV, not dropped", () => {
    expect(parseIngredients("Water, Colour (150 d), Sugar")).toEqual(["Water", "Colour INS 150d", "Sugar"]);
    expect(parseIngredients("Colour (INS 150 d)")).toEqual(["Colour INS 150d"]);
    expect(parseIngredients("Colour 150 d")).toEqual(["Colour INS 150d"]);
  });

  it("'INS No.', 'INS:' and 'I.N.S.' prefixes are read, not turned into junk names", () => {
    expect(parseIngredients("Preservative (INS No. 211), Sugar")).toEqual(["Preservative INS 211", "Sugar"]);
    expect(parseIngredients("Preservative (INS: 211), Sugar")).toEqual(["Preservative INS 211", "Sugar"]);
    expect(parseIngredients("Preservative (I.N.S. 211)")).toEqual(["Preservative INS 211"]);
  });

  it("sub-types are different substances: both 500(i) and 500(ii) are kept", () => {
    expect(parseIngredients("Wheat Flour, Raising Agents (500(i), 500(ii))")).toEqual([
      "Wheat Flour",
      "Raising Agents INS 500(i)",
      "Raising Agents INS 500(ii)",
    ]);
    expect(parseIngredients("Acidity Regulators (INS 331(i), INS 331(iii))")).toHaveLength(2);
  });

  it("a number that is not a real INS code is held, not published (Knorr 'Natural Colour - 1501')", () => {
    expect(held(parseIngredients("Sugar, Natural Colour - 1501, Salt"))).toHaveLength(1);
    expect(held(parseIngredients("Colour (1599)"))).toHaveLength(1);
    expect(held(parseIngredients(OFF_LABELS.knorrSchezwan)).join()).toMatch(/1501/);
  });

  it("an unreadable code where the identity belongs is held ('Preservative (21l)')", () => {
    const out = parseIngredients("Sugar, Preservative (21l), Salt");
    expect(held(out)).toHaveLength(1);
    expect(out).toContain("Sugar");
    expect(out).toContain("Salt");
  });

  it("a code followed by more words is a lost comma, held — never an identity (Hustle 'INS 504 Taurine')", () => {
    expect(looksGarbledIngredientName("INS 504 Taurine")).toBe(true);
    const out = parseIngredients("Carbonated Water, ACIDITY REGULATORS (INS 330, INS 331(iii), INS 504 (1) TAURINE (0.4%)), Caffeine");
    expect(held(out).length).toBeGreaterThan(0);
  });
});

describe("class words and their brackets", () => {
  it("a flavour/colour parenthetical describes the class — 'Flavour (Cream)' is not cream", () => {
    expect(parseIngredients("Sugar, Flavour (Cream), Colour (Caramel)")).toEqual(["Sugar", "Cream Flavour", "Caramel Colour"]);
    expect(parseIngredients("Milk Solids, Sugar, Added Flavour (Mango)")).toEqual(["Milk Solids", "Sugar", "Mango Flavour"]);
    expect(parseIngredients("Flavour (Natural Flavouring Substances)")).toEqual(["Natural Flavouring Substances"]);
  });

  it("a functional-class parenthetical names the additive — 'Emulsifier (Soy Lecithin)'", () => {
    expect(parseIngredients("Emulsifier (Soy Lecithin), Stabilizer (Pectin)")).toEqual(["Soy Lecithin", "Pectin"]);
  });

  it("qualifiers stay part of the class: 'Artificial Sweeteners' is not an ingredient called 'Artificial'", () => {
    expect(parseIngredients("Carbonated Water, Acidity Regulator (338), Artificial Sweeteners (951, 950)")).toEqual([
      "Carbonated Water",
      "Acidity Regulator INS 338",
      "Artificial Sweeteners INS 951",
      "Artificial Sweeteners INS 950",
    ]);
    for (const label of ["Low Calorie Sweetener (INS 955)", "Natural Antioxidant (INS 392)", "Vegetable Emulsifier (INS 322)"]) {
      const out = parseIngredients(label);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatch(/^\w[\w\s]+ INS \d+$/);
    }
  });

  it("'and'/'&' inside names are not split: 'Mono and Diglycerides of Fatty Acids'", () => {
    expect(parseIngredients("Wheat Flour, Emulsifier (Mono and Diglycerides of Fatty Acids (INS 471))")).toEqual([
      "Wheat Flour",
      "Mono and Diglycerides of Fatty Acids INS 471",
    ]);
    const seasoning = parseIngredients(
      "Potato, Seasoning (Sugar, Salt, Natural and Nature Identical Flavouring Substances, Flavour Enhancer (627, 631))",
    );
    expect(seasoning).not.toContain("Natural");
    expect(seasoning).toContain("Natural and Nature Identical Flavouring Substances");
  });

  it("a leading '&' is never part of a name", () => {
    expect(parseIngredients("Water, Acidity Regulator (330) & Colour (150d)")).toEqual([
      "Water",
      "Acidity Regulator INS 330",
      "Colour INS 150d",
    ]);
  });
});

describe("declarations and trailing text", () => {
  it("text after the last code group keeps its own parenthetical (Sting's flavouring)", () => {
    const sting = parseIngredients(OFF_LABELS.sting);
    expect(sting).toContain("Synthetic Food Colour INS 129");
    expect(sting).toContain("Natural And Nature Identical Flavouring Substances");
    expect(parseIngredients("Sugar, Flavour Enhancer (627) Flavour (Natural Flavouring Substances), Salt")).toEqual([
      "Sugar",
      "Flavour Enhancer INS 627",
      "Natural Flavouring Substances",
      "Salt",
    ]);
  });

  it("an uncoded 'CONTAINS PERMITTED … COLOUR [ANNATTO]' keeps the additive (Amul butter)", () => {
    expect(parseIngredients("Butter, common salt. CONTAINS PERMITTED NATURAL COLOUR [ANNATTO]")).toEqual([
      "Butter",
      "common salt",
      "Annatto Colour",
    ]);
    expect(parseIngredients("Sugar, Salt. Contains Permitted Natural Colour (Annatto) and Added Flavour (Vanilla)")).toEqual([
      "Sugar",
      "Salt",
      "Annatto Colour",
      "Vanilla Flavour",
    ]);
  });

  it("allergen sentences end the list in every form", () => {
    expect(parseIngredients("Sugar, Salt. Contains Wheat, Milk and Soy.")).toEqual(["Sugar", "Salt"]);
    expect(parseIngredients("Tomato, Salt, Mixed spices.\nAllergen Note: May contain Wheat, Milk and Soy.")).toEqual([
      "Tomato",
      "Salt",
      "Mixed spices",
    ]);
  });

  it("'Vitamin A.' ends an ingredient — it is not an initial", () => {
    expect(parseIngredients("Refined Soybean Oil, Vitamin A. CONTAINS PERMITTED SYNTHETIC FOOD COLOUR (102)")).toEqual([
      "Refined Soybean Oil",
      "Vitamin A",
      "Synthetic Food Colour INS 102",
    ]);
    expect(parseIngredients("Milk, Sugar, Vitamin D. May contain Nuts")).toEqual(["Milk", "Sugar", "Vitamin D"]);
  });

  it("a nutrition panel after the list is cut with its heading (Tempting ketchup)", () => {
    const out = parseIngredients(OFF_LABELS.temptingKetchup);
    expect(out[out.length - 1]).toBe("Preservative Sodium Benzoate INS 211");
    expect(held(out)).toEqual([]);
  });
});

describe("lost commas are held, not glued into clean-looking names", () => {
  it("words after a sub-ingredient group hold the item (Maggi 'Mixed spices (…) Salt Sugar')", () => {
    const out = parseIngredients("Mixed spices (38.7%) (Onion powder, Nutmeg powder (0.3%). Coriander extract & Cumin extract) Salt Sugar Flavour enhancer (635), Palm oil");
    expect(held(out)).toHaveLength(1);
    expect(out).not.toContain("Mixed spices Salt Sugar");
    expect(out).toContain("Palm oil");
  });

  it("…but an INCI common name mid-name is one ingredient ('Zea Mays (Corn) Starch')", () => {
    expect(parseIngredients("Aqua, Zea Mays (Corn) Starch, Cocos Nucifera (Coconut) Milk Protein")).toEqual([
      "Aqua",
      "Zea Mays Starch",
      "Cocos Nucifera Milk Protein",
    ]);
  });

  it("…and a class phrase after a group starts a new additive (Tempting 'MIXED SPICES (…) PRESERVATIVE …')", () => {
    const out = parseIngredients("Garlic Powder, MIXED SPICES (CLOVE, CINNAMON, CHILLI) PRESERVATIVE SODIUM BENZOATE (INS 211)");
    expect(out).toEqual(["Garlic Powder", "Mixed Spices", "Preservative Sodium Benzoate INS 211"]);
  });

  it("a comma list wrapped across lines is not split at every newline", () => {
    expect(parseIngredients("Edible Common Salt, Potassium\nIodate (2mg) and Anticaking\nAgent (INS 536)")).toEqual([
      "Edible Common Salt",
      "Potassium Iodate",
      "Anticaking Agent INS 536",
    ]);
    expect(parseIngredients("Sugar, Cocoa\nButter, Milk Solids,\nEmulsifier (Soya\nLecithin)")).toEqual([
      "Sugar",
      "Cocoa Butter",
      "Milk Solids",
      "Soya Lecithin",
    ]);
  });

  it("text the parser cannot place is never silently dropped — long merged text is held", () => {
    const out = parseIngredients(OFF_LABELS.maggiNoodles);
    expect(held(out).length).toBeGreaterThan(0);
  });
});
