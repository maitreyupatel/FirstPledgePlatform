/**
 * Food Safety Service
 * Looks up food ingredient safety using:
 *   1. Static E-number registry (EU/FDA classifications for common additives)
 *   2. Google Custom Search targeting FDA GRAS, EFSA, USDA FoodData Central
 *
 * Used for "food" and "supplement" product types — NOT for cosmetics (use EWG instead).
 */

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
    const match = name.toLowerCase().match(/(?<!vitamin\s)\b(?:e|ins)[-\s]?(\d{3,4}[a-z]?)\b/);
    if (match) return `e${match[1].replace(/\s/g, "")}`;
    return null;
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
