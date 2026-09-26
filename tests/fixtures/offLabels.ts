/**
 * Real ingredient-list text from Open Food Facts / Open Beauty Facts
 * (ODbL — https://opendatacommons.org/licenses/odbl/), exactly the field the
 * ingest cron parses (ingredients_text_en || ingredients_text). Captured
 * 2026-09-26 for the products the additive-code parser audit cited; the
 * barcodes identify each record.
 */
export const OFF_LABELS = {
  // Mountain Dew (PepsiCo) — barcode 8902080364022
  mountainDew: "CARBONATED WATER, SUGAR, ACIDITY REGULATORS (330 ,331), FLAVOUR (NATURAL FLAVOURING SUBSTANCES), PRESERVATIVE (211), CAFFEINE (13 mg/100 g), STABILIZER (445), COLOUR (102).",
  // Parle-G Biscuit (Parle) — barcode 8901719134845
  parleG: "REFINED WHEAT FLOUR (MAIDA) 68%, SUGAR, REFINED PALM OIL, INVERT SUGAR SYRUP (SUGAR, CITRIC ACID), IODISED SALT, RAISING AGENTS [INS 503(ii), 500(ii)], MILK SOLIDS, FLOUR TREATMENT AGENTS [INS 1101(ii)] AND EMULSIFIER OF VEGETABLE ORIGIN [INS 472e]\r\nCONTAINS ADDED FLAVOURS (ARTIFICIAL FLAVOURING SUBSTANCE - VANILLA)mm",
  // Krackjack (Parle) — barcode 8901719135248
  krackjack: "REFINED WHEAT FLOUR (MAIDA), REFINED OILS (PALMOLEIN AND PALM), SUGAR (19.1%), RAISING AGENTS [ 503 (ii), 10 (ii), 341 (i) ], INVERT SUGAR SYRUP, IODISED SALT(0.9%) YEAST, ACIDITY REGULATORS [270,296], FLOUR TREATMENT AGENTS [223,1101 (ii),1100(i)], EMULSIFIER OF VEGETABLE ORIGIN [472e] CONTAINS ADDED FLAVOURS (ARTIFICIAL FLAVOURING SUBSTANCE-VANILLA, BUT ER)",
  // HORLICKS (Horlicks) — barcode 8909106024564
  horlicks: "Malt (65.6%) [Barley (31.3%), Wheat Flour (Atta), Wheat, Millet), Milk Solids (14%), Sugar, Wheat Gluten",
  // Sting Energy (Sting) — barcode 8902080000227
  sting: "CARBONATED WATER, SUGAR, ACIDITY REGULATORS (330, 331), SEQUESTERANTS (452(1), 385),TAURINE, CAFFEINE (0.03%), PRESERVATIVES (211, 202), SWEETENERS (955, 950), INOSITOL, VITAMINS PREMIX. CONTAINS PERMITTED SYNTHETIC FOOD COLOUR (129) AND ADDED FLAVOUR (NATURAL AND NATURE IDENTICAL FLAVOURING SUBSTANCES)",
  // Sprite (sprite) — barcode 8901764032912
  sprite: "CARBONATED WATER, SUGAR, ACIDITY REGULATORS (330, 331(iii)), PRESERVATIVE (211), SWEETENER(960), FLAVOURS (NATURAL FLAVORING SUBSTANCES).",
  // Thums up (Thums up) — barcode 8901764042911
  thumsUp: "Carbonated water, sugar, acidity regulator (338), caffeine (8.1 mg/100 g), sweetener (960), colour (150 d), flavours (natural, nature-identical & artificial (cola) flavouring substances).",
  // Knorr Schezwan Sauce 200 g (Knorr) — barcode 8901030987007
  knorrSchezwan: "Water, Vegetables&quot; (Garlic - 9%, Onion 1%), Sugar, Soyabean Oil, lodised Salt, Chillies 4.4%, Soybean Sauce, Acidity Regulator - 260, Stabilisers 1422, 415, Spices & Condiments, Firvour Enhancers - E627 & E631, Natural Colour - 1501, Preservative-211, Natural Flavouring substance. Contains Soya and Gluten.",
  // Tandoori Mayo (Wingreens Farms) — barcode 8906064656783
  tandooriMayo: "Water, Refined Sunflower Oil, Sugar, Thickeners (INS 1442 & INS 415), Iodized Salt, Milk Solids, Mixed Spices, Acidity Regulators (INS 260, INS 270 & INS 330), Mustard Powder, Lemon Juice, Preservatives (INS 202 & INS 211), Antioxidant (INS 386), Natural Flavouring Substances Allergen Declaration: Contains Milk. May Contains Soy",
  // Red Chilli Sauce (Ching's) — barcode 8901595862740
  redChilliSauce: "Water, Sugar, Red Chilli (6%), Garlic, Ginger, lodised Salt, Thickener (INS 1422), Acidity Regulators (INS 261 INS 330), Emulsifying and Stabilizing Agent (INS 415), Preservative (INS 211). Allergen Advice: May contain: Wheat, Nut:, Sesame seeds Soy, Mustard and Milk.",
  // Full Bloom Tomato Ketchup (Full Bloom) — barcode 8905507044620
  fullBloomKetchup: "Water, Sugar, Tomato Paste (28%), Iodized Salt, Acidity Regulator (INS Stabilizers (INS 1422, INS 415), Preservative (INS 211), Onion Powder, Garlic Powder, Spices & Condiments CONTAINS PERMITTED CLASS II PRESERVATIVES.",
  // Tempting Tomato Ketchup (Temptin) — barcode 8903553002809
  temptingKetchup: "WATER, SUGAR, TOMATO PASTE (28°B) 24.7%, EDIBLE COMMON SALT, ACIDITY REGULATOR ACETIC ACID (INS 260), EMULSIFYING & STABILIZING AGENT (INS 1422 & INS 415), ONION POWDER, GARLIC POWDER, MIXED SPICES (CLOVE, CINNAMON, CHILLI) PRESERVATIVE SODIUM BENZOATE (INS 211). CONTAINS PERMITTED CLASS II PRESERVATIVE (INS 211). TOMATO KETCHUP NUTRITIONAL INFORMATION A L N SLU D PER (100g) - PER SERVE 1 Tbsp (15g) % RDA PER SERVE ENERGY VALUE (kcal) 150 02 f",
  // Saffola Masala Oats - Classic Masala (Saffola) — barcode 8901088068734
  saffolaOats: "Rolled Oats (73.9 %), Maltodectrin, Salt, Spices and Condiments (34%) (Onions, Tumeric, Pepper, Cumin, Garlic, Fenugreek, Clove, Nutmeg, Red Chili), Dried Vegetables (Carrots (1.15%), Onions Flakes (1.15%), Green Peas(0.69%)), Sugar, Starch, Hydrolysed Vegetable Protein, Wheat Powder, Flavour Enhancers NS 627,631), Anlioxidant (320). \r\nCONTAINS ADDED FLAVOUR-NATURAL AND NATURE IDENTICAL FLAVOURING SUBSTANCES.",
  // Schezwan Chutney (ching's) — barcode 8901595863013
  schezwanChutney: "Water, Sunflower Oil, Sugar, lodised Salt, Chilli, Corn Starch, Garlic, Onion, Ginger, Thickener (INS 1422), Flavou Enhancer (INS 635), Acidity Regulator (INS 260), Spices (White Pepper, Schezwan Pepper), Preservatives (INS 202, INS 211), Celery, Soy Sauce Powder (Soybean, Wheat, Salt), Natural Flavouring Substances. ALLERGEN ADVICE: CONTAINS WHEAT, SOY AND CELERY. May contain Peanuts, Tree Nuts, Sesame Seed, Mustard and Milk (dairy products)",
  // 2-minute noodles masala taste (Maggi) — barcode 8901058023787
  maggiNoodles: "Noodles: Refined wheat flour (Maida), Palm oil, lodized salt, Iron (mg) 1000.0 700.0 6.90 4.83 Wheat gluten, Thickeners (508 #Guideline Daily Amounts of an average adult (200 &412), Acidity regulators (501 (i) & 500 (i)) and Humectant (451(i)). \r\n\r\nMasala TASTEMAKER®: Mixed Spices (26.2%) (Onion powder Coriander powder, Red chilli powder, Turmeric powder, Garlic powder, Cumin powder, Aniseed powder, Ginger powder, Fenugreek powder, Black pepper powder, Toasted onion powder, Clove powder, Green cardamom powder, Nutmeg powder), Hydrolysed ground protein, Refined wheat flour (Maida), Sugar, Starch, Palm oil, iodized salt, Thickener (508), Acidity regulator (330), Flavour enhancer Colour (150d), Mineral and Wheat gluten.",
  // Chocos (Kellogg's) — barcode 8901499008169
  chocos: "Multigrain Flour Mix (64.8%) (Wheat Flour (Atta) (55.8%), Sorghum (Jowar) Flour (3%), Rice Flour (3 Corn Meal (3%)), Sugar, Cocoa Solids (5.3%), Minerals, Cereal Extract, lodized Salt, Colours (INS 150a, INS 150d), Edible Vegetable Oil (Palmolein), Flavours (Nature Identical & Artificial (Cream)), Vitamins, Antioxidant (INS 307b). ALLERGEN DECLARATION: CONTAINS WHEAT & BARLEY. MAY CONTAIN SOY, MILK, OATS & NUTS.",
  // Greek yogurt (Epigamia) — barcode 8906059635090
  greekYogurt: "Greek Yogurt (Pasteurized Double Toned Milk, Milk Solids, Stabilizer (Pectin), Permitted Lactic Acid Cultures), Processed Blueberry Pulp (Sugar, Water, Blueberry Fruit, Stabilizer (Pectin), Natural Flavouring Substances (Blueberry), Natural Color (INS 163 (ii)), Lemon Juice Concentrate) Total Fruit Content: 1.68% Active Live Cultures: S.Thermophilus, L.Bacillus delbrueckii subsp. Bulgaricus ALLERGENS: Contains milk. Manufactured in a facility processing nuts & cereals containing gluten.",
  // Dot and key Watermelon cooling sunscreen (Dot and key) — barcode 8906147702383
  dotKeySunscreen: "Aqua, Ethylhexyl Methoxycinnamate (and) Butyl\n\nMethoxydibenzoylmethane (and) Benzophenone-3 (and) Phospholipids (and) 1,3-Butylene Glycol, Glycerine, C12-15 Alkyl Benzoate, Caprylic/Capric Triglyceride, Propanediol, Cyclopentasiloxane, Zea Mays (Corn) Starch, Citrullus Lanatus (Watermelon) Fruit Extract, Oxothiazolidine (and) Butylene glycol (and) Sodium benzoate, Methylene Bis-Benzotriazolyl Tetramethylbutylphenol (and) Aqua (and) Decyl Glucoside (and) Propylene Glycol (and) Xanthan Gum, Diethylamino Hydroxybenzoyl Hexyl Benzoate, Titanium Dioxide (and) Silica, Fructooligosaccharides (and) Beta Vulgaris (Beet) Root Extract (and) Water, Sodium Hyaluronate, Aloe Barbadensis (Aloe Vera) Leaf Juice, Tocopheryl Acetate, Menthyl Lactate, Glyceryl Stearate (and) PEG-100 Stearate, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Sorbitan Stearate (and) Sucrose Cocoate, Sodium Lactate, Sodium Gluconate, Disodium EDTA, Sodium Hydroxide, Phenoxyethanol (and) Ethylhexylglycerin.",
  // Sun Shield Carrot Sunscreen (Biotique) — barcode 8904352003905
  sunShield: "Carrot\nNyctanthes Leaf Extracts\nCarrot Root Extracts\nLodhra Bark \nSprouted Wheat\nZinc Oxide, naturally derived",
} as const;
