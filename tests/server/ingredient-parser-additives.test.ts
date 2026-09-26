/**
 * Parser regression tests built from REAL labels (tests/fixtures/offLabels.ts).
 *
 * Audit 2026-09-26: Indian labels print additive codes as bare numbers
 * ("Acidity regulator (260)", "[270,296]", "Stabilisers 1422, 415") and the
 * old parser only kept "INS"/"E"-prefixed codes. Published reports lost
 * additives (Mountain Dew: sodium benzoate 211 and tartrazine 102) and bare
 * class names ("acidity regulators") were analyzed as if they were
 * ingredients. The rule these tests pin: every additive on the label reaches
 * the report, and a label too damaged to parse is HELD (garbled-name gate),
 * never silently truncated.
 */
import { describe, it, expect } from "vitest";
import { parseIngredients, looksGarbledIngredientName } from "../../server/utils/ingredientParser";
import { canonicalIngredientKey, extractAdditiveCode } from "../../server/utils/additiveCode";
import { OFF_LABELS } from "../fixtures/offLabels";
import { FoodSafetyService } from "../../server/services/foodSafetyService";

const anyGarbled = (names: string[]) => names.some(looksGarbledIngredientName);

describe("published products that lost additives — real labels", () => {
  it("Mountain Dew: all 9 label components, incl. sodium benzoate and tartrazine", () => {
    const out = parseIngredients(OFF_LABELS.mountainDew);
    expect(out).toEqual([
      "Carbonated Water",
      "Sugar",
      "Acidity Regulators INS 330",
      "Acidity Regulators INS 331",
      "Natural Flavouring Substances",
      "Preservative INS 211",
      "Caffeine",
      "Stabilizer INS 445",
      "Colour INS 102",
    ]);
    expect(anyGarbled(out)).toBe(false);
  });

  it("Parle-G: square-bracket codes with sub-type qualifiers, and codes joined by AND", () => {
    const out = parseIngredients(OFF_LABELS.parleG);
    expect(out).toEqual([
      "Refined Wheat Flour",
      "Sugar",
      "Refined Palm Oil",
      "Invert Sugar Syrup",
      "Iodised Salt",
      "Raising Agents INS 503(ii)",
      "Raising Agents INS 500(ii)",
      "Milk Solids",
      "Flour Treatment Agents INS 1101(ii)",
      "Emulsifier Of Vegetable Origin INS 472e",
      // "CONTAINS ADDED FLAVOURS (ARTIFICIAL FLAVOURING SUBSTANCE - VANILLA)mm":
      // the mandatory flavouring declaration is an ingredient, kept — and
      // the OCR tail "mm" is not glued onto it
      "Artificial Flavouring Substance - Vanilla",
    ]);
    expect(anyGarbled(out)).toBe(false);
  });

  it("Sting: keeps the colour declared as 'CONTAINS PERMITTED SYNTHETIC FOOD COLOUR (129)'", () => {
    const out = parseIngredients(OFF_LABELS.sting);
    for (const code of ["330", "331", "452", "385", "211", "202", "955", "950"]) {
      expect(out.some((n) => extractAdditiveCode(n) === code)).toBe(true);
    }
    expect(out).toContain("Synthetic Food Colour INS 129");
    expect(out.some((n) => /^contains\b/i.test(n))).toBe(false);
  });

  it("Sprite: bare codes incl. 331(iii) and no bare class name left behind", () => {
    const out = parseIngredients(OFF_LABELS.sprite);
    expect(out).toContain("Acidity Regulators INS 331(iii)");
    expect(out).toContain("Preservative INS 211");
    expect(out).toContain("Sweetener INS 960");
    expect(out).not.toContain("Acidity Regulators");
  });

  it("no bare functional class survives where the label gave codes", () => {
    for (const label of [OFF_LABELS.mountainDew, OFF_LABELS.parleG, OFF_LABELS.sprite, OFF_LABELS.tandooriMayo]) {
      const out = parseIngredients(label);
      expect(out.filter((n) => /^(acidity regulators?|raising agents?|stabili[sz]ers?|thickeners?)$/i.test(n))).toEqual([]);
    }
  });
});

describe("every notation Indian labels use for additive codes", () => {
  it("unbracketed runs after a class: spaces, dashes, E-prefix", () => {
    expect(parseIngredients("Stabilisers 1422, 415")).toEqual(["Stabilisers INS 1422", "Stabilisers INS 415"]);
    expect(parseIngredients("Thickener-415, Acidity Regulator - 260, Preservative-E211")).toEqual([
      "Thickener INS 415",
      "Acidity Regulator INS 260",
      "Preservative E211",
    ]);
  });

  it("codes joined by '&', by whitespace, or by commas without spaces", () => {
    expect(parseIngredients("Thickeners (INS 1442 & INS 415)")).toEqual(["Thickeners INS 1442", "Thickeners INS 415"]);
    expect(parseIngredients("Acidity Regulators (INS 261 INS 330)")).toEqual([
      "Acidity Regulators INS 261",
      "Acidity Regulators INS 330",
    ]);
    expect(parseIngredients("Acidity Regulators [270,296]")).toEqual([
      "Acidity Regulators INS 270",
      "Acidity Regulators INS 296",
    ]);
    // Real label: "Flavour Enhancers NS 627,631)" — OCR lost the I of INS
    const saffola = parseIngredients(OFF_LABELS.saffolaOats);
    expect(saffola).toContain("Flavour Enhancers INS 627");
    expect(saffola).toContain("Flavour Enhancers INS 631");
  });

  it("nested qualifier and letter suffixes", () => {
    expect(parseIngredients("Natural Color (INS 163 (ii))")).toEqual(["Natural Color INS 163(ii)"]);
    expect(parseIngredients("Colours (INS 150a, INS 150d)")).toEqual(["Colours INS 150a", "Colours INS 150d"]);
  });

  it("text after a code group is its own ingredient (label lost a comma)", () => {
    expect(parseIngredients("Flavour Enhancer-627 & 631 Oleoresin Capsicum")).toEqual([
      "Flavour Enhancer INS 627",
      "Flavour Enhancer INS 631",
      "Oleoresin Capsicum",
    ]);
  });

  it("an ingredient merged in front of a class phrase is split off", () => {
    expect(parseIngredients("Iodised Salt Acidity Regulator-E260")).toEqual(["Iodised Salt", "Acidity Regulator E260"]);
    const tempting = parseIngredients(OFF_LABELS.temptingKetchup);
    // "MIXED SPICES (CLOVE, CINNAMON, CHILLI)": the listed spices (E1.12)
    expect(tempting).toEqual(expect.arrayContaining(["Garlic Powder", "Clove", "Cinnamon", "Chilli"]));
    expect(tempting).not.toContain("Mixed Spices");
    // …but a colour's own identity is never split from it
    expect(parseIngredients("Beetroot Colour (162)")).toEqual(["Beetroot Colour INS 162"]);
  });

  it("one additive declared twice is listed once", () => {
    const out = parseIngredients(OFF_LABELS.temptingKetchup);
    expect(out.filter((n) => extractAdditiveCode(n) === "211")).toEqual(["Preservative Sodium Benzoate INS 211"]);
  });

  it("mixed groups keep both the named additive and the code", () => {
    expect(parseIngredients("Emulsifiers (Soy Lecithin, 471)")).toEqual(["Soy Lecithin", "Emulsifiers INS 471"]);
  });
});

describe("damaged labels are held for review, never silently truncated", () => {
  it("Krackjack: an OCR-mangled code ('10 (ii)') trips the gate; every valid code survives", () => {
    const out = parseIngredients(OFF_LABELS.krackjack);
    expect(anyGarbled(out)).toBe(true);
    for (const code of ["503", "341", "270", "296", "223", "1101", "1100", "472e"]) {
      expect(out.some((n) => extractAdditiveCode(n) === code)).toBe(true);
    }
    // "IODISED SALT(0.9%) YEAST" — a QUID percentage ends an ingredient
    expect(out).toContain("Iodised Salt");
    expect(out).toContain("Yeast");
  });

  it("Full Bloom: a never-closed bracket is flagged, and the rest of the label still parses", () => {
    const out = parseIngredients(OFF_LABELS.fullBloomKetchup);
    expect(anyGarbled(out)).toBe(true);
    expect(out).toContain("Preservative INS 211");
    expect(out).toContain("Onion Powder");
  });

  it("Maggi noodles: nutrition-panel bleed mid-list is flagged, not cut — the second half survives", () => {
    const out = parseIngredients(OFF_LABELS.maggiNoodles);
    expect(anyGarbled(out)).toBe(true);
    expect(out).toContain("Thickener INS 508");
    expect(out).toContain("Acidity regulator INS 330");
    expect(out).toContain("Mineral and Wheat gluten");
  });

  it("Chocos: the label's own unbalanced parenthesis is flagged", () => {
    expect(anyGarbled(parseIngredients(OFF_LABELS.chocos))).toBe(true);
  });
});

describe("bracket handling", () => {
  it("HORLICKS: a '[' closed by ')' is still one group", () => {
    const out = parseIngredients(OFF_LABELS.horlicks);
    expect(out).toEqual(["Malt", "Milk Solids", "Sugar", "Wheat Gluten"]);
    expect(anyGarbled(out)).toBe(false);
  });

  it("a bare class word yields to the identity in its parenthetical", () => {
    expect(parseIngredients("Emulsifier (Soy Lecithin), Flavour (Natural Flavouring Substances)")).toEqual([
      "Soy Lecithin",
      "Natural Flavouring Substances",
    ]);
    // an adjective list is one description, not ingredients named "natural"
    // (…and the flavour the label names is kept — E1.12)
    expect(parseIngredients(OFF_LABELS.thumsUp)).toContain("natural, nature-identical & artificial flavouring substances - cola");
    expect(parseIngredients("Flavours (Nature Identical & Artificial (Cream))")).toEqual([
      "Nature Identical & Artificial Flavours - Cream",
    ]);
  });

  it("an allergen statement ends the list", () => {
    const out = parseIngredients(OFF_LABELS.schezwanChutney);
    expect(out[out.length - 1]).toBe("Natural Flavouring Substances");
    expect(out.some((n) => /celery$|peanut|tree nut/i.test(n) && n !== "Celery")).toBe(false);
  });

  it("the mandatory additive declaration survives while allergen disclaimers still drop", () => {
    expect(parseIngredients("Sugar, Contains Permitted Synthetic Food Colour (129), Contains Milk")).toEqual([
      "Sugar",
      "Synthetic Food Colour INS 129",
    ]);
  });
});

describe("cosmetic (INCI) labels", () => {
  it("Dot & Key: '(and)' blends split, so the UV filters reach the report", () => {
    const out = parseIngredients(OFF_LABELS.dotKeySunscreen);
    for (const name of [
      "Ethylhexyl Methoxycinnamate",
      "Butyl Methoxydibenzoylmethane",
      "Benzophenone-3",
      "1,3-Butylene Glycol",
      "Titanium Dioxide",
      "Silica",
    ]) {
      expect(out).toContain(name);
    }
    expect(out).not.toContain("Titanium Dioxide Silica");
    expect(anyGarbled(out)).toBe(false);
  });

  it("comma-locant chemistry survives (E1.5): '1,2-Hexanediol' is not 'Hexanediol'", () => {
    expect(parseIngredients("Aqua, 1,2-Hexanediol, Glycerin")).toEqual(["Aqua", "1,2-Hexanediol", "Glycerin"]);
    // the European decimal-percentage path the comma split relies on still works
    expect(parseIngredients("cacao maigre 7,4%, sucre")).toEqual(["cacao maigre", "sucre"]);
  });

  it("a one-per-line list splits on newlines; a wrapped name does not", () => {
    expect(parseIngredients(OFF_LABELS.sunShield).slice(0, 6)).toEqual([
      "Carrot",
      "Nyctanthes Leaf Extracts",
      "Carrot Root Extracts",
      "Lodhra Bark",
      "Sprouted Wheat",
      "Zinc Oxide",
    ]);
  });
});

describe("label noise", () => {
  it("fixes the 'lodised' OCR misread without touching real 'Lod…' names", () => {
    expect(parseIngredients("lodised Salt, LODIZED SALT, Lodhra Bark")).toEqual(["Iodised Salt", "Iodized Salt", "Lodhra Bark"]);
  });

  it("decodes HTML entities before splitting on ';'", () => {
    expect(parseIngredients("Sugar, Spices &amp; Condiments, Salt")).toEqual(["Sugar", "Spices & Condiments", "Salt"]);
    expect(parseIngredients("Sugar, &quot;Seasoning&quot;")).toEqual(["Sugar", "Seasoning"]);
  });

  it("sentence splits skip abbreviations", () => {
    expect(parseIngredients("Eranda Sd. 10 mg")).toEqual(["Eranda Sd. 10 mg"]);
    expect(parseIngredients("Petroleum Jelly. Light Liquid Paraffin")).toEqual(["Petroleum Jelly", "Light Liquid Paraffin"]);
  });
});

describe("looksGarbledIngredientName", () => {
  it("allows a code's sub-type qualifier, the only bracket a clean name carries", () => {
    expect(looksGarbledIngredientName("Raising Agents INS 503(ii)")).toBe(false);
    expect(looksGarbledIngredientName("Acidity Regulators INS 331(iii)")).toBe(false);
  });

  it("flags bracket leftovers, braces and nutrition-panel figures", () => {
    expect(looksGarbledIngredientName("Malt [Barley")).toBe(true);
    expect(looksGarbledIngredientName("Whole Grains 66% {Rolled Oats")).toBe(true);
    expect(looksGarbledIngredientName("Iron 1000.0 700.0 6.90 4.83 Wheat gluten")).toBe(true);
    expect(looksGarbledIngredientName("acidity inal information 6g a quantity regulator E260")).toBe(true);
  });
});

describe("canonicalIngredientKey — one cache row per additive", () => {
  it("keys every wording of a code to the code", () => {
    for (const n of ["Preservative INS 211", "PRESERVATIVE E211", "Preservative Sodium Benzoate INS 211", "Class II Preservative ins-211"]) {
      expect(canonicalIngredientKey(n)).toBe("ins 211");
    }
    expect(canonicalIngredientKey("Emulsifier Of Vegetable Origin INS 472e")).toBe("ins 472e");
  });

  it("keeps sub-types apart: 500(i) sodium carbonate is not 500(ii) sodium bicarbonate", () => {
    expect(canonicalIngredientKey("Acidity Regulators INS 331(iii)")).toBe("ins 331(iii)");
    expect(canonicalIngredientKey("Raising Agents INS 500(i)")).not.toBe(canonicalIngredientKey("Raising Agents INS 500(ii)"));
    // …while every spelling of ONE code agrees, incl. a spaced letter
    expect(canonicalIngredientKey("Colour INS 150 d")).toBe(canonicalIngredientKey("Colour E150d"));
    expect(canonicalIngredientKey("Colour INS 150 d")).not.toBe(canonicalIngredientKey("Colour E 150 a"));
  });

  it("leaves non-coded names and vitamin doses alone", () => {
    expect(canonicalIngredientKey("  Sugar ")).toBe("sugar");
    expect(canonicalIngredientKey("Vitamin E 400 IU")).toBe("vitamin e 400 iu");
    expect(canonicalIngredientKey("PEG-100 Stearate")).toBe("peg-100 stearate");
  });
});

describe("registry: every code on the audited published labels resolves to a verified identity", () => {
  // Each parsed code must reach FoodSafetyService with an authoritative
  // identity + status — otherwise the AI would be left to guess what
  // "INS 445" is. Codes added 2026-09-26 were researched and independently
  // re-verified against EFSA/JECFA/FDA/FSSAI sources.
  const PUBLISHED = {
    mountainDew: OFF_LABELS.mountainDew,
    parleG: OFF_LABELS.parleG,
    sting: OFF_LABELS.sting,
    sprite: OFF_LABELS.sprite,
    thumsUp: OFF_LABELS.thumsUp,
    tandooriMayo: OFF_LABELS.tandooriMayo,
    saffolaOats: OFF_LABELS.saffolaOats,
    schezwanChutney: OFF_LABELS.schezwanChutney,
    temptingKetchup: OFF_LABELS.temptingKetchup,
  };

  for (const [product, label] of Object.entries(PUBLISHED)) {
    it(`${product}: all additive codes resolve`, async () => {
      const service = new FoodSafetyService();
      const coded = parseIngredients(label).filter((n) => extractAdditiveCode(n) !== null);
      expect(coded.length).toBeGreaterThan(0);
      for (const name of coded) {
        const data = await service.lookupFoodIngredient(name);
        expect({ name, found: data.found, hasStatus: data.status !== null, hasIdentity: !!data.name }).toEqual({
          name,
          found: true,
          hasStatus: true,
          hasIdentity: true,
        });
      }
    });
  }

  it("Mountain Dew's previously-missing additives carry their real identities", async () => {
    const service = new FoodSafetyService();
    expect((await service.lookupFoodIngredient("Preservative INS 211")).name).toBe("Sodium Benzoate");
    expect(await service.lookupFoodIngredient("Colour INS 102")).toMatchObject({ name: "Tartrazine", status: "caution" });
    expect((await service.lookupFoodIngredient("Stabilizer INS 445")).name).toBe("Glycerol Ester of Wood Rosin (Ester Gum)");
  });

  it("new entries never introduce a 'banned' verdict for an FSSAI-permitted additive", async () => {
    const service = new FoodSafetyService();
    for (const code of ["445", "472e", "1101", "1100", "223", "339", "385", "386", "536", "551", "635", "150c", "160b"]) {
      const data = await service.lookupFoodIngredient(`INS ${code}`);
      expect(data.found).toBe(true);
      expect(data.status).not.toBe("banned");
      expect(data.regulatoryNotes).toMatch(/FSSAI-permitted/);
    }
  });
});
