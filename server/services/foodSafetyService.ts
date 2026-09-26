/**
 * Food Safety Service
 * Looks up food ingredient safety using:
 *   1. Static E-number registry (EU/FDA classifications for common additives)
 *   2. Google Custom Search targeting FDA GRAS, EFSA, USDA FoodData Central
 *
 * Used for "food" and "supplement" product types — NOT for cosmetics (use EWG instead).
 */

import { extractAdditiveCode } from "../utils/additiveCode";

export interface FoodSafetyData {
  found: boolean;
  status: "safe" | "caution" | "banned" | null;
  source: "e-number" | "gras-research" | "efsa-research" | "usda-research" | "not-found";
  url: string;
  concerns: string[];
  regulatoryNotes?: string;
  /** Verified additive identity (e.g. "Malic Acid" for INS 296) — injected
   *  into AI prompts so the model never guesses additive chemistry. */
  name?: string;
}

interface ENumberEntry {
  name: string;
  status: "safe" | "caution" | "banned";
  category: string;
  url: string;
  concerns: string[];
  regulatoryNotes?: string;
}

export class FoodSafetyService {
  private googleApiKey?: string;
  private googleCxId?: string;
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 3;

  // E-number registry: covers high-frequency food additives with known risk profiles.
  // Source: EU Regulation (EC) No 1333/2008, FDA 21 CFR, EFSA opinions.
  // Status rationale: "safe" = FDA GRAS / EFSA approved with no ADI concerns;
  //   "caution" = approved but with ADI limits, restricted in some regions, or linked to
  //   adverse effects at realistic doses; "banned" = prohibited by FDA or EFSA.
  private static readonly E_NUMBER_REGISTRY: Record<string, ENumberEntry> = {
    // === COLOURS (E100–E199) ===
    "e100": { name: "Curcumin", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4294", concerns: [], regulatoryNotes: "FDA GRAS; EFSA approved" },
    "e101": { name: "Riboflavin (Vitamin B2)", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4260", concerns: [], regulatoryNotes: "FDA GRAS; essential vitamin" },
    "e102": { name: "Tartrazine", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4366", concerns: ["hyperactivity in children", "allergic reaction in aspirin-sensitive individuals"], regulatoryNotes: "FDA approved; EU requires warning label; ADI 7.5 mg/kg bw/day" },
    "e104": { name: "Quinoline Yellow", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4366", concerns: ["hyperactivity in children"], regulatoryNotes: "EU approved with warning; not approved in USA/Australia" },
    "e110": { name: "Sunset Yellow FCF", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4368", concerns: ["hyperactivity in children", "possible allergen"], regulatoryNotes: "FDA approved; EU warning label required; ADI 4 mg/kg bw/day" },
    "e120": { name: "Cochineal/Carmine", status: "caution", category: "Colour", url: "https://www.fda.gov/food/color-additives-questions-answers-consumers/color-additives-history", concerns: ["allergic reactions", "anaphylaxis in rare cases"], regulatoryNotes: "FDA approved with mandatory labelling; EFSA approved" },
    "e122": { name: "Carmoisine", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4367", concerns: ["hyperactivity in children"], regulatoryNotes: "EU approved with warning; not approved in USA/Japan/Australia" },
    "e123": { name: "Amaranth", status: "banned", category: "Colour", url: "https://www.fda.gov/food/color-additives-questions-answers-consumers/color-additives-history", concerns: ["banned by FDA since 1976", "potential carcinogen"], regulatoryNotes: "Banned in USA; permitted in EU for specific uses only" },
    "e124": { name: "Ponceau 4R", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4743", concerns: ["hyperactivity in children"], regulatoryNotes: "EU approved with warning; not approved in USA/Canada" },
    "e127": { name: "Erythrosine", status: "caution", category: "Colour", url: "https://www.fda.gov/food/color-additives-questions-answers-consumers/color-additives-history", concerns: ["thyroid effects at high doses"], regulatoryNotes: "FDA approved for limited uses; EU permitted with ADI" },
    "e129": { name: "Allura Red AC", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4254", concerns: ["hyperactivity in children"], regulatoryNotes: "FDA approved; EU warning label required; ADI 7 mg/kg bw/day" },
    "e131": { name: "Patent Blue V", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4430", concerns: ["allergic reactions"], regulatoryNotes: "EU approved; not approved in USA/Australia" },
    "e132": { name: "Indigo Carmine", status: "caution", category: "Colour", url: "https://www.fda.gov/food/color-additives-questions-answers-consumers/color-additives-history", concerns: ["nausea at high doses"], regulatoryNotes: "FDA approved; EFSA approved; ADI 5 mg/kg bw/day" },
    "e133": { name: "Brilliant Blue FCF", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4030", concerns: [], regulatoryNotes: "FDA approved; EFSA approved; ADI 6 mg/kg bw/day" },
    "e150a": { name: "Plain Caramel", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2473", concerns: [], regulatoryNotes: "FDA GRAS; EFSA approved" },
    "e150d": { name: "Sulfite Ammonia Caramel", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2473", concerns: ["4-methylimidazole (4-MEI) formation — possible carcinogen"], regulatoryNotes: "FDA approved; California Prop 65 warning applies above threshold" },
    "e160a": { name: "Beta-carotene", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4294", concerns: [], regulatoryNotes: "FDA GRAS; EFSA approved; provitamin A" },
    "e162": { name: "Beetroot Red / Betanin", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4858", concerns: [], regulatoryNotes: "FDA approved; EFSA approved; natural colourant" },
    "e171": { name: "Titanium Dioxide", status: "banned", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/6844", concerns: ["potential genotoxicity", "not safe as food additive"], regulatoryNotes: "Banned in EU food (2022); FDA still allows in USA up to 1% of food weight" },
    "e172": { name: "Iron Oxides", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4317", concerns: [], regulatoryNotes: "FDA approved; EFSA approved; limited uses" },

    // === PRESERVATIVES (E200–E299) ===
    "e200": { name: "Sorbic Acid", status: "safe", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/3779", concerns: [], regulatoryNotes: "FDA GRAS; EFSA approved; ADI 25 mg/kg bw/day" },
    "e202": { name: "Potassium Sorbate", status: "safe", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/3779", concerns: [], regulatoryNotes: "FDA GRAS; widely used; EFSA approved" },
    "e210": { name: "Benzoic Acid", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4433", concerns: ["benzene formation with ascorbic acid", "hyperactivity link"], regulatoryNotes: "FDA GRAS; EFSA ADI 5 mg/kg bw/day; forms benzene with E300" },
    "e211": { name: "Sodium Benzoate", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4433", concerns: ["benzene formation with ascorbic acid", "hyperactivity in children"], regulatoryNotes: "FDA GRAS; EU warning label when combined with certain colours; ADI 5 mg/kg bw/day" },
    "e212": { name: "Potassium Benzoate", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4433", concerns: ["benzene formation with ascorbic acid"], regulatoryNotes: "FDA approved; same concerns as E211" },
    "e220": { name: "Sulphur Dioxide", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4275", concerns: ["asthma trigger", "allergen — mandatory labelling >10 mg/kg"], regulatoryNotes: "FDA GRAS (limited); EFSA ADI 0.7 mg/kg bw/day; EU mandatory allergen labelling" },
    "e221": { name: "Sodium Sulphite", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4275", concerns: ["asthma trigger", "allergen"], regulatoryNotes: "Same sulphite concerns as E220" },
    "e250": { name: "Sodium Nitrite", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4786", concerns: ["nitrosamine formation — potential carcinogen", "methaemoglobinaemia risk"], regulatoryNotes: "FDA approved for cured meats; EFSA ADI 0.07 mg/kg bw/day; IARC Group 2A" },
    "e251": { name: "Sodium Nitrate", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4786", concerns: ["converts to nitrite in body", "IARC Group 2A"], regulatoryNotes: "FDA approved; EFSA ADI 3.7 mg/kg bw/day" },
    "e252": { name: "Potassium Nitrate", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4786", concerns: ["converts to nitrite", "IARC Group 2A"], regulatoryNotes: "Same as E251" },
    "e270": { name: "Lactic Acid", status: "safe", category: "Preservative", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; natural fermentation product" },
    "e280": { name: "Propionic Acid", status: "safe", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2522", concerns: [], regulatoryNotes: "FDA GRAS; natural fatty acid; EFSA approved" },
    "e282": { name: "Calcium Propionate", status: "safe", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2522", concerns: [], regulatoryNotes: "FDA GRAS; widely used in bread; EFSA approved" },

    "e260": { name: "Acetic Acid", status: "safe", category: "Acidity Regulator", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted; natural fermentation product (vinegar)" },
    "e296": { name: "Malic Acid", status: "safe", category: "Acidity Regulator", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 296); naturally occurring in fruits; no ADI needed" },

    // === ANTIOXIDANTS / ACIDITY REGULATORS (E300–E399) ===
    "e300": { name: "Ascorbic Acid (Vitamin C)", status: "safe", category: "Antioxidant", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; essential vitamin; EFSA approved" },
    "e301": { name: "Sodium Ascorbate", status: "safe", category: "Antioxidant", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; Vitamin C salt" },
    "e306": { name: "Tocopherol-rich Extract (Vitamin E)", status: "safe", category: "Antioxidant", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2779", concerns: [], regulatoryNotes: "FDA GRAS; essential vitamin" },
    "e307": { name: "Alpha-tocopherol (Vitamin E)", status: "safe", category: "Antioxidant", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2779", concerns: [], regulatoryNotes: "FDA GRAS; EFSA approved" },
    "e310": { name: "Propyl Gallate", status: "caution", category: "Antioxidant", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4090", concerns: ["potential endocrine disruption at high doses"], regulatoryNotes: "FDA approved; EFSA ADI 0.1 mg/kg bw/day" },
    "e319": { name: "TBHQ (tert-Butylhydroquinone)", status: "caution", category: "Antioxidant", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4090", concerns: ["vision disturbances at high doses", "potential carcinogen in animal studies"], regulatoryNotes: "FDA approved (limited); not permitted in EU; EFSA not approved for EU use" },
    "e320": { name: "BHA (Butylated Hydroxyanisole)", status: "caution", category: "Antioxidant", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4090", concerns: ["possible carcinogen (IARC Group 2B)", "endocrine disruption concerns"], regulatoryNotes: "FDA GRAS; EFSA under re-evaluation; NTP considers reasonably anticipated carcinogen" },
    "e321": { name: "BHT (Butylated Hydroxytoluene)", status: "caution", category: "Antioxidant", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4090", concerns: ["potential carcinogen at high doses", "liver enzyme induction in animals"], regulatoryNotes: "FDA GRAS; EFSA ADI 0.25 mg/kg bw/day" },
    "e330": { name: "Citric Acid", status: "safe", category: "Acidity Regulator", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; naturally occurring; EFSA approved" },
    "e331": { name: "Sodium Citrates", status: "safe", category: "Acidity Regulator", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; EFSA approved" },
    "e322": { name: "Lecithins", status: "safe", category: "Emulsifier", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4742", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted; usually soy- or sunflower-derived (soy is a priority allergen)" },
    "e334": { name: "Tartaric Acid (L(+)-)", status: "safe", category: "Acidity Regulator", url: "https://www.efsa.europa.eu/en/efsajournal/pub/6030", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 334); JECFA ADI 30 mg/kg bw/day; naturally occurring in grapes" },
    "e338": { name: "Phosphoric Acid", status: "caution", category: "Acidity Regulator", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4109", concerns: ["bone density reduction at high intake", "dental erosion"], regulatoryNotes: "FDA GRAS; EFSA ADI 40 mg/kg bw/day (as phosphorus)" },
    "e340": { name: "Potassium Phosphates", status: "safe", category: "Acidity Regulator", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5674", concerns: ["phosphate load relevant only for impaired kidney function"], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 340); EFSA group ADI 40 mg/kg bw/day (as phosphorus)" },
    "e341": { name: "Calcium Phosphates", status: "safe", category: "Acidity Regulator", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5674", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted; also a calcium fortificant; EFSA group ADI applies" },

    // === THICKENERS / EMULSIFIERS / STABILISERS (E400–E499) ===
    "e400": { name: "Alginic Acid", status: "safe", category: "Thickener", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; natural seaweed extract" },
    "e401": { name: "Sodium Alginate", status: "safe", category: "Thickener", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; widely used" },
    "e410": { name: "Locust Bean Gum", status: "safe", category: "Thickener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2257", concerns: [], regulatoryNotes: "FDA GRAS; natural; EFSA approved" },
    "e412": { name: "Guar Gum", status: "safe", category: "Thickener", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; natural galactomannan" },
    "e407": { name: "Carrageenan", status: "caution", category: "Thickener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5238", concerns: ["gastrointestinal effects debated; degraded carrageenan (poligeenan) is the actual concern"], regulatoryNotes: "FDA approved; FSSAI-permitted; EFSA re-evaluation set group ADI 75 mg/kg bw/day pending data" },
    "e415": { name: "Xanthan Gum", status: "safe", category: "Thickener", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; widely used; EFSA approved" },
    "e466": { name: "Carboxymethyl Cellulose (CMC)", status: "caution", category: "Thickener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5047", concerns: ["emerging research on gut microbiome effects at high intakes"], regulatoryNotes: "FDA approved; FSSAI-permitted (INS 466); EFSA approved with no numeric ADI" },
    "e440": { name: "Pectins", status: "safe", category: "Thickener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2303", concerns: [], regulatoryNotes: "FDA GRAS; natural fruit extract; EFSA approved" },
    "e450": { name: "Diphosphates", status: "caution", category: "Emulsifier", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4109", concerns: ["phosphate excess linked to cardiovascular risk"], regulatoryNotes: "FDA approved; EFSA ADI 40 mg/kg bw/day (as phosphorus)" },
    "e451": { name: "Triphosphates", status: "caution", category: "Emulsifier", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4109", concerns: ["phosphate excess"], regulatoryNotes: "Same as E450" },
    "e452": { name: "Polyphosphates", status: "caution", category: "Emulsifier", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4109", concerns: ["phosphate excess"], regulatoryNotes: "Same as E450" },
    "e471": { name: "Mono- and Diglycerides of Fatty Acids", status: "safe", category: "Emulsifier", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; derived from fats; EFSA approved" },
    "e476": { name: "Polyglycerol Polyricinoleate (PGPR)", status: "safe", category: "Emulsifier", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4156", concerns: [], regulatoryNotes: "FDA approved; EFSA ADI 25 mg/kg bw/day; used in chocolate" },
    "e481": { name: "Sodium Stearoyl-2-Lactylate", status: "safe", category: "Emulsifier", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; EFSA approved" },

    // === RAISING AGENTS / CARRIERS (E500s) ===
    "e500": { name: "Sodium Carbonates (Baking Soda family)", status: "safe", category: "Raising Agent", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 500); no ADI needed" },
    "e501": { name: "Potassium Carbonates", status: "safe", category: "Raising Agent", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 501); no ADI needed" },
    "e503": { name: "Ammonium Carbonates (Baker's Ammonia)", status: "safe", category: "Raising Agent", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 503); fully decomposes during baking" },

    // === COLOURS (additional) ===
    "e160c": { name: "Paprika Extract (Oleoresin)", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4320", concerns: [], regulatoryNotes: "FDA colour additive exempt from certification; FSSAI-permitted (INS 160c); EFSA found no safety concern" },

    // === MODIFIED STARCHES (E1400s) ===
    "e1422": { name: "Acetylated Distarch Adipate", status: "safe", category: "Modified Starch", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4911", concerns: [], regulatoryNotes: "FDA approved; FSSAI-permitted (INS 1422); EFSA: no ADI needed for modified starches" },
    "e1442": { name: "Hydroxypropyl Distarch Phosphate", status: "safe", category: "Modified Starch", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4911", concerns: [], regulatoryNotes: "FDA approved; FSSAI-permitted (INS 1442); EFSA: no ADI needed for modified starches" },

    // === FLAVOUR ENHANCERS (E600–E699) ===
    "e620": { name: "Glutamic Acid", status: "safe", category: "Flavour Enhancer", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; naturally occurring amino acid" },
    "e621": { name: "Monosodium Glutamate (MSG)", status: "safe", category: "Flavour Enhancer", url: "https://www.fda.gov/food/food-ingredients-packaging/questions-answers-monosodium-glutamate-msg", concerns: ["short-term symptoms in sensitive individuals (anecdotal; not consistently reproduced in studies)"], regulatoryNotes: "FDA GRAS; WHO/JECFA: no ADI needed at normal use; 'Chinese restaurant syndrome' not supported by controlled studies" },
    "e627": { name: "Disodium Guanylate", status: "safe", category: "Flavour Enhancer", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: ["should be avoided by those with gout — raises uric acid"], regulatoryNotes: "FDA GRAS; EFSA approved" },
    "e631": { name: "Disodium Inosinate", status: "safe", category: "Flavour Enhancer", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: ["avoid with gout"], regulatoryNotes: "FDA GRAS; EFSA approved; often combined with MSG" },

    // === SWEETENERS (E900–E999 and E1000+) ===
    "e950": { name: "Acesulfame K", status: "safe", category: "Sweetener", url: "https://www.fda.gov/food/food-additives-petitions/additional-information-about-high-intensity-sweeteners", concerns: [], regulatoryNotes: "FDA approved; EFSA ADI 9 mg/kg bw/day" },
    "e951": { name: "Aspartame", status: "caution", category: "Sweetener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/3805", concerns: ["phenylketonuria (PKU) contraindication — mandatory labelling", "IARC Group 2B (possibly carcinogenic to humans, 2023)"], regulatoryNotes: "FDA approved (ADI 50 mg/kg bw/day); EFSA ADI 40 mg/kg bw/day; EU/WHO mandatory warning for PKU" },
    "e952": { name: "Cyclamates", status: "banned", category: "Sweetener", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: ["banned by FDA since 1969 — possible carcinogen"], regulatoryNotes: "Banned in USA; permitted in EU with ADI 7 mg/kg bw/day" },
    "e954": { name: "Saccharin", status: "safe", category: "Sweetener", url: "https://www.fda.gov/food/food-additives-petitions/additional-information-about-high-intensity-sweeteners", concerns: [], regulatoryNotes: "FDA approved; de-listed from California Prop 65 (2021); EFSA ADI 5 mg/kg bw/day" },
    "e955": { name: "Sucralose", status: "safe", category: "Sweetener", url: "https://www.fda.gov/food/food-additives-petitions/additional-information-about-high-intensity-sweeteners", concerns: [], regulatoryNotes: "FDA approved; EFSA ADI 15 mg/kg bw/day" },
    "e960": { name: "Steviol Glycosides (Stevia)", status: "safe", category: "Sweetener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4316", concerns: [], regulatoryNotes: "FDA GRAS; EFSA ADI 4 mg/kg bw/day; natural origin" },
    "e961": { name: "Neotame", status: "safe", category: "Sweetener", url: "https://www.fda.gov/food/food-additives-petitions/additional-information-about-high-intensity-sweeteners", concerns: [], regulatoryNotes: "FDA approved; EFSA ADI 2 mg/kg bw/day" },
    "e965": { name: "Maltitol", status: "caution", category: "Sweetener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2765", concerns: ["laxative effect at high doses (>40g/day)"], regulatoryNotes: "FDA GRAS; EU requires laxative warning above threshold" },
    "e967": { name: "Xylitol", status: "safe", category: "Sweetener", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: ["toxic to dogs — irrelevant for human use"], regulatoryNotes: "FDA GRAS; dental benefits noted by WHO" },
    "e968": { name: "Erythritol", status: "safe", category: "Sweetener", url: "https://www.fda.gov/food/food-additives-petitions/food-additive-status-list", concerns: [], regulatoryNotes: "FDA GRAS; well-tolerated; natural origin" },

    // === ADDED 2026-09-26: codes found on real Indian labels ===
    // Each entry researched against EFSA/JECFA/FDA/FSSAI sources, then independently
    // re-verified by a second reviewer that fetched every url (20 accepted as proposed,
    // 6 corrected: a wrong CFR citation, an over-specific 1101 identity, overstated
    // EDTA concerns). Status rules follow the header comment; e536/e386 are "caution"
    // only because a major jurisdiction does not authorise them (e104/e131 precedent).
    "e445": { name: "Glycerol Ester of Wood Rosin (Ester Gum)", status: "safe", category: "Emulsifier", url: "https://www.efsa.europa.eu/en/efsajournal/pub/8110", concerns: [], regulatoryNotes: "FDA approved (21 CFR 172.735; max 100 ppm in beverages); FSSAI-permitted (INS 445(iii)); EFSA ADI 10 mg/kg bw/day (2023); JECFA ADI 25 mg/kg bw/day; density adjuster for citrus oils in soft drinks" },
    "e472e": { name: "DATEM (Diacetyl Tartaric Acid Esters of Mono- and Diglycerides)", status: "safe", category: "Emulsifier", url: "https://www.efsa.europa.eu/en/efsajournal/pub/6032", concerns: [], regulatoryNotes: "FDA GRAS (21 CFR 184.1101); FSSAI-permitted (INS 472e); EFSA ADI 600 mg/kg bw/day (2020); JECFA ADI 50 mg/kg bw/day; hydrolysed to normal dietary constituents" },
    "e470": { name: "Salts of Fatty Acids (Sodium, Potassium, Calcium, Magnesium)", status: "safe", category: "Emulsifier", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5180", concerns: [], regulatoryNotes: "FDA approved (21 CFR 172.863; magnesium and calcium stearate GRAS); FSSAI-permitted (INS 470(i)/470(ii), GMP); EFSA: no numerical ADI needed; fatty acids may be of vegetable or animal origin" },
    "e418": { name: "Gellan Gum", status: "safe", category: "Thickener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5296", concerns: [], regulatoryNotes: "FDA approved (21 CFR 172.665); FSSAI-permitted (INS 418, GMP); EFSA: no numerical ADI needed; JECFA ADI not specified; bacterial fermentation polysaccharide" },
    "e460": { name: "Microcrystalline Cellulose / Powdered Cellulose", status: "safe", category: "Thickener", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5047", concerns: [], regulatoryNotes: "FDA GRAS (SCOGS); FSSAI-permitted (INS 460(i)/460(ii), GMP); EFSA: no numerical ADI needed; JECFA ADI not specified; not absorbed (plant fibre)" },
    "e1100": { name: "Amylases", status: "safe", category: "Enzyme", url: "https://www.fda.gov/food/generally-recognized-safe-gras/enzyme-preparations-used-food-partial-list", concerns: [], regulatoryNotes: "FDA GRAS (alpha-amylase 21 CFR 184.1012; malt amylases 184.1443a); FSSAI-permitted (INS 1100); flour treatment enzyme used at GMP" },
    "e1101": { name: "Proteases (incl. Papain, Bromelain, Ficin)", status: "safe", category: "Enzyme", url: "https://www.fda.gov/food/generally-recognized-safe-gras/enzyme-preparations-used-food-partial-list", concerns: ["possible allergic reactions in people allergic to papaya, pineapple, kiwi, soy, fig or pollen (EFSA, papain: risk not greater than eating those foods)"], regulatoryNotes: "FDA GRAS (papain 21 CFR 184.1585; bromelain 184.1024; ficin 184.1316); FSSAI-permitted (INS 1101); EFSA 2026: papain raises no safety concern" },
    "e223": { name: "Sodium Metabisulphite", status: "caution", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/7594", concerns: ["asthma trigger in sulphite-sensitive individuals","allergen — mandatory labelling >10 mg/kg","EFSA 2022: margin of exposure indicates a safety concern at high intake","destroys vitamin B1 (thiamine) in food"], regulatoryNotes: "FDA GRAS (21 CFR 182.3766; not permitted in meats, vitamin B1 sources, or raw fruits/vegetables); FSSAI-permitted (INS 223); EFSA 2022 withdrew temporary group ADI of 0.7 mg SO2/kg bw/day" },
    "e504": { name: "Magnesium Carbonates", status: "safe", category: "Anticaking Agent", url: "https://www.law.cornell.edu/cfr/text/21/184.1425", concerns: [], regulatoryNotes: "FDA GRAS (21 CFR 184.1425); FSSAI-permitted (INS 504; max 20 g/kg in salt); EU-authorised, EFSA re-evaluation pending" },
    "e1450": { name: "Starch Sodium Octenyl Succinate", status: "safe", category: "Modified Starch", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5874", concerns: [], regulatoryNotes: "FDA approved (21 CFR 172.892); FSSAI-permitted (INS 1450); EFSA: no ADI needed; no safety concern incl. infants below 16 weeks" },
    "e339": { name: "Sodium Phosphates", status: "safe", category: "Acidity Regulator", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5674", concerns: ["phosphate load relevant only for impaired kidney function"], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 339); EFSA group ADI 40 mg/kg bw/day (as phosphorus); EFSA noted total dietary phosphorus can exceed the ADI in young children" },
    "e508": { name: "Potassium Chloride", status: "safe", category: "Stabiliser", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5751", concerns: ["hyperkalaemia risk only for impaired kidney function or potassium-sparing medication (mainly via low-sodium salt substitutes)"], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 508, GMP); SCF/JECFA ADI 'not specified'; EFSA 2019: chloride of no safety concern at reported uses" },
    "e509": { name: "Calcium Chloride", status: "safe", category: "Firming Agent", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5751", concerns: [], regulatoryNotes: "FDA GRAS; FSSAI-permitted (INS 509, GMP); SCF/JECFA ADI 'not specified'; EFSA 2019: chloride of no safety concern at reported uses" },
    "e536": { name: "Potassium Ferrocyanide", status: "caution", category: "Anticaking Agent", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5374", concerns: ["not authorised as a food additive in the USA (FDA permits only sodium ferrocyanide, 21 CFR 172.490)","kidney effects in rats at high doses; exposure from salt is well below the EFSA ADI"], regulatoryNotes: "FSSAI-permitted (INS 536; salt max 10 mg/kg as anhydrous sodium ferrocyanide); EFSA group ADI 0.03 mg/kg bw/day (as ferrocyanide ion), no safety concern at authorised uses; not approved in USA" },
    "e551": { name: "Silicon Dioxide (Amorphous)", status: "safe", category: "Anticaking Agent", url: "https://www.efsa.europa.eu/en/efsajournal/pub/8880", concerns: ["limited toxicity data on nano-sized aggregates (EFSA 2024 still found no safety concern at reported uses)"], regulatoryNotes: "FDA approved (anticaking use max 2% of food weight); FSSAI-permitted (INS 551, GMP); EFSA 2024: no safety concern for any age group incl. infants; no numerical ADI (margin-of-exposure approach)" },
    "e150c": { name: "Caramel III (Ammonia Caramel)", status: "caution", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2004", concerns: ["high-consuming toddlers and adults may exceed EFSA's E150c-specific ADI (100 mg/kg bw/day)","THI by-product (2-acetyl-4-tetrahydroxybutylimidazole) reduced lymphocytes in rats; this is why E150c has a lower ADI","4-methylimidazole (4-MEI) formation, possible carcinogen (IARC Group 2B)"], regulatoryNotes: "FDA approved (caramel, 21 CFR 73.85); FSSAI-permitted (INS 150c); EFSA individual ADI 100 mg/kg bw/day within caramel group ADI 300 mg/kg bw/day; contains 4-MEI and THI by-products" },
    "e160b": { name: "Annatto (Bixin/Norbixin)", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5626", concerns: ["rare hypersensitivity reactions (urticaria; isolated anaphylaxis case reports)"], regulatoryNotes: "FDA colour additive exempt from certification (21 CFR 73.30); FSSAI-permitted (INS 160b(i), 160b(ii)); EFSA ADI 6 mg/kg bw/day (bixin) and 0.3 mg/kg bw/day (norbixin); natural colourant from annatto seeds" },
    "e163": { name: "Anthocyanins (incl. Grape Skin Extract)", status: "safe", category: "Colour", url: "https://www.efsa.europa.eu/en/efsajournal/pub/3145", concerns: [], regulatoryNotes: "FDA approved as grape skin extract (beverages) and grape color extract (non-beverage foods); FSSAI-permitted (INS 163(i), 163(ii)); EFSA: no numerical ADI (data inadequate), aqueous grape skin/blackcurrant extracts unlikely to be of safety concern; natural colourant" },
    "e170": { name: "Calcium Carbonate", status: "safe", category: "Acidity Regulator", url: "https://www.efsa.europa.eu/en/efsajournal/pub/2318", concerns: [], regulatoryNotes: "FDA GRAS (21 CFR 184.1191); FSSAI-permitted (INS 170(i)); EFSA group ADI 'not specified'; also a calcium fortificant" },
    "e307b": { name: "Mixed Tocopherols (Vitamin E)", status: "safe", category: "Antioxidant", url: "https://www.efsa.europa.eu/en/efsajournal/pub/4247", concerns: [], regulatoryNotes: "FDA GRAS (tocopherols, 21 CFR 182.3890); FSSAI-permitted (INS 307b); EFSA: tocopherols not of safety concern at levels used; vitamin E UL 300 mg/day (adults)" },
    "e385": { name: "Calcium Disodium EDTA", status: "caution", category: "Preservative", url: "https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/3011", concerns: ["emerging animal research: EDTA at ADI-equivalent doses worsened colitis in mouse models of inflammatory bowel disease","EFSA flagged missing reproductive/developmental toxicity data; re-evaluation pending"], regulatoryNotes: "FDA approved (21 CFR 172.120); FSSAI-permitted (INS 385, EDTA group, specified foods); EU authorised; JECFA/SCF ADI 2.5 mg/kg bw/day (equivalent to 1.9 mg/kg bw/day as free EDTA); EFSA re-evaluation pending" },
    "e386": { name: "Disodium EDTA", status: "caution", category: "Preservative", url: "https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/386", concerns: ["not authorised as a food additive in the EU (only calcium disodium EDTA, E385, is permitted)","JECFA ADI assumes no excess (unbound) disodium EDTA remains in the food","emerging animal research: EDTA at ADI-equivalent doses worsened colitis in mouse models of inflammatory bowel disease"], regulatoryNotes: "FDA approved (21 CFR 172.135); FSSAI-permitted (INS 386, EDTA group, specified foods); not authorised in EU; JECFA ADI 2.5 mg/kg bw/day (as calcium disodium EDTA)" },
    "e234": { name: "Nisin", status: "safe", category: "Preservative", url: "https://www.efsa.europa.eu/en/efsajournal/pub/5063", concerns: [], regulatoryNotes: "FDA GRAS (21 CFR 184.1538); FSSAI-permitted (INS 234); EFSA ADI 1 mg/kg bw/day (2017); fermentation-derived antimicrobial peptide" },
    "e261": { name: "Potassium Acetates", status: "safe", category: "Acidity Regulator", url: "https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/3218", concerns: [], regulatoryNotes: "FDA-listed flavouring adjuvant (21 CFR 172.515); FSSAI-permitted (INS 261); EU authorised (E 261); JECFA group ADI not limited (with acetic acid)" },
    "e327": { name: "Calcium Lactate", status: "safe", category: "Acidity Regulator", url: "https://hfpappexternal.fda.gov/scripts/fdcc/index.cfm?set=FoodSubstances&id=CALCIUMLACTATE", concerns: [], regulatoryNotes: "FDA GRAS (21 CFR 184.1207; not for infant foods/formula); FSSAI-permitted (INS 327); JECFA ADI not limited; EU authorised" },
    "e635": { name: "Disodium 5'-Ribonucleotides", status: "safe", category: "Flavour Enhancer", url: "https://apps.who.int/food-additives-contaminants-jecfa-database/Home/Chemical/4140", concerns: ["people with gout may wish to limit — metabolised to uric acid (additive intake is small vs dietary purines)"], regulatoryNotes: "FDA permits its components (disodium guanylate 21 CFR 172.530, disodium inosinate 21 CFR 172.535); FSSAI-permitted (INS 635); JECFA ADI not specified; EU authorised; EFSA re-evaluation (E626-635) pending" },
  };

  constructor(googleApiKey?: string, googleCxId?: string) {
    this.googleApiKey = googleApiKey;
    this.googleCxId = googleCxId;
  }

  async lookupFoodIngredient(ingredientName: string): Promise<FoodSafetyData> {
    // Try E-number lookup first (instant, no API call)
    const eNumber = this.parseENumber(ingredientName);
    if (eNumber) {
      const entry = this.lookupByENumber(eNumber);
      if (entry) {
        return {
          found: true,
          status: entry.status,
          source: "e-number",
          url: entry.url,
          concerns: entry.concerns,
          regulatoryNotes: entry.regulatoryNotes,
          name: entry.name,
        };
      }
    }

    // Try matching by common name against E-number registry
    const nameMatch = this.lookupByCommonName(ingredientName);
    if (nameMatch) {
      return {
        found: true,
        status: nameMatch.status,
        source: "e-number",
        url: nameMatch.url,
        concerns: nameMatch.concerns,
        regulatoryNotes: nameMatch.regulatoryNotes,
        name: nameMatch.name,
      };
    }

    // Fall back to Google Custom Search (FDA/EFSA/USDA)
    if (this.googleApiKey && this.googleCxId && this.consecutiveErrors < this.maxConsecutiveErrors) {
      return this.researchFoodIngredient(ingredientName);
    }

    return { found: false, status: null, source: "not-found", url: "", concerns: [] };
  }

  // Extracts a normalised additive code from E-number OR INS notation.
  // Indian labels use INS numbers (Codex system — numerically identical to
  // E-numbers): "Acidity Regulator (INS 296)", "INS 627", "ins-334".
  // Also matches: "tartrazine (e102)", "e-102", "E 102", "E102".
  // Negative lookbehind prevents "Vitamin E 400 IU" (a dosage, not an
  // additive code) from resolving to E400.
  private parseENumber(name: string): string | null {
    const code = extractAdditiveCode(name);
    return code ? `e${code}` : null;
  }

  private lookupByENumber(eNumber: string): ENumberEntry | null {
    return FoodSafetyService.E_NUMBER_REGISTRY[eNumber.toLowerCase()] ?? null;
  }

  // Name match: the registry entry's name must appear as a whole phrase in
  // the ingredient string. The previous bidirectional substring match wrongly
  // resolved e.g. "Cellulose" to "Carboxymethyl Cellulose" — an identity
  // corruption that would then be injected into prompts as verified fact.
  private lookupByCommonName(ingredientName: string): ENumberEntry | null {
    const lower = ingredientName.toLowerCase();
    for (const entry of Object.values(FoodSafetyService.E_NUMBER_REGISTRY)) {
      const phrase = entry.name.toLowerCase().split(/[\/,(]/)[0].trim();
      if (phrase.length < 4) continue;
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`).test(lower)) {
        return entry;
      }
    }
    return null;
  }

  private async researchFoodIngredient(ingredientName: string): Promise<FoodSafetyData> {
    // Try FDA first (highest authority for food safety)
    const fdaResult = await this.searchSource(
      `site:fda.gov "${ingredientName}" food safety GRAS`,
      "gras-research"
    );
    if (fdaResult) return fdaResult;

    // Then EFSA
    const efsaResult = await this.searchSource(
      `site:efsa.europa.eu "${ingredientName}" food additive`,
      "efsa-research"
    );
    if (efsaResult) return efsaResult;

    // Then USDA FoodData Central
    const usdaResult = await this.searchSource(
      `site:fdc.nal.usda.gov "${ingredientName}"`,
      "usda-research"
    );
    if (usdaResult) return usdaResult;

    return { found: false, status: null, source: "not-found", url: "", concerns: [] };
  }

  private async searchSource(
    query: string,
    source: FoodSafetyData["source"]
  ): Promise<FoodSafetyData | null> {
    if (!this.googleApiKey || !this.googleCxId) return null;

    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${this.googleApiKey}&cx=${this.googleCxId}&q=${encodeURIComponent(query)}&num=1`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!response.ok) {
        if (response.status === 429 || response.status === 403) this.consecutiveErrors++;
        return null;
      }

      const data = await response.json();
      this.consecutiveErrors = 0;

      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          found: true,
          status: null, // AI will determine status from context
          source,
          url: item.link,
          concerns: [],
          regulatoryNotes: item.snippet,
        };
      }
    } catch {
      // Network error or timeout — silently skip
    }

    return null;
  }
}
