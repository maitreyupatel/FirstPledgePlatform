-- ============================================
-- MIGRATION 6: Reclassify Existing Products & Purge Wrong-Pipeline Analyses
-- Run AFTER migration 005. Safe to re-run (UPDATEs filter on product_type = 'unknown').
--
-- Order matters:
--   1. Cosmetics FIRST — unique markers (silicones, parabens, UV filters) won't
--      false-positive on food products.
--   2. Food SECOND — patterns like "maltodextrin" or "citric acid" appear in both,
--      but cosmetics are already classified by step 1.
--   3. Name-heuristic fallback for multilingual products.
--   4. Purge EWG-based analyses that were generated for food-exclusive ingredients.
-- ============================================

-- ── STEP 1: Classify COSMETICS first ─────────────────────────────────────────
UPDATE products
SET product_type = 'cosmetic'
WHERE product_type = 'unknown'
  AND id IN (
    SELECT DISTINCT product_id FROM ingredients
    WHERE
      -- Cosmetic base solvents / carriers unique to personal care
      lower(name) IN ('aqua','dimethicone','dimethiconol','cyclopentasiloxane',
                      'cyclohexasiloxane','cyclomethicone','phenoxyethanol',
                      'isododecane','isohexadecane')
      -- Silicone chemistry (cyclo/poly/dimethicone variants)
      OR lower(name) ~ 'silicone|silsesquioxane|polysiloxane|methicone'
      -- Parabens (antimicrobials used in cosmetics; not used in food)
      OR lower(name) ~ 'paraben'
      -- Cosmetic-specific surfactants
      OR lower(name) ~ 'cocamidopropyl.betaine|sodium.laureth.sulfate|sodium.lauryl.sulfate|'
                    || 'sodium.laureth.sulphate|sodium.lauryl.sulphate'
      -- UV filter actives (sunscreen-only molecules)
      OR lower(name) ~ 'methoxycinnamate|benzophenone|oxybenzone|avobenzone|octinoxate|'
                    || 'tinosorb|mexoryl|benzotriazolyl|uvinul|diethylamino.hydroxybenzoyl|'
                    || 'ethylhexyl.triazone|homosalate|octocrylene|bis-ethylhexyloxyphenol'
      -- PEG/PPG emulsifier chains (cosmetic emulsifiers)
      OR lower(name) ~ '\bpeg-[0-9]|\bppg-[0-9]'
      -- Retinoids (active skincare)
      OR lower(name) ~ '\bretino[ly]\b|\bretinal\b'
      -- Hyaluronates (cosmetic moisturiser)
      OR lower(name) ~ 'hyaluronic|sodium hyaluronate'
      -- Alkyl benzoate / acrylate crosspolymer / carbomer (cosmetic emollients)
      OR lower(name) ~ 'alkyl benzoate|acrylate crosspolymer|carbomer|carbopol'
      -- Cosmetic skin actives
      OR lower(name) ~ '\bbakuchiol\b|\badenosi[en]\b|\bbifida ferment\b|\bcentella\b'
  );

-- ── STEP 2: Classify FOOD on remaining unknowns ───────────────────────────────
UPDATE products
SET product_type = 'food'
WHERE product_type = 'unknown'
  AND id IN (
    SELECT DISTINCT product_id FROM ingredients
    WHERE
      -- EU/FDA E-number system (exclusive to food)
      lower(name) ~ '\be-?\s*\d{3}[a-z]?\b'
      -- Core food ingredients (universal)
      OR lower(name) ~ '\b(sugar|salt|flour|oats|wheat|barley|rye|malt|'
                     || 'milk|cream|butter|cheese|egg|'
                     || 'cocoa|cacao|chocolate|vanilla|vanillin|'
                     || 'tomato|vinegar|taurine|inositol)\b'
      -- Carbohydrates and caloric / non-caloric sweeteners
      OR lower(name) ~ '\b(starch|dextrose|fructose|glucose|lactose|sucrose|'
                     || 'maltodextrin|aspartame|saccharin|acesulfame|sucralose|'
                     || 'phenylalanine|syrup|corn.syrup|oligofructose)\b'
      -- Food flavouring and colouring declarations
      OR lower(name) ~ 'natural flavo|artificial flavo|caramel colou?r'
      -- Carbonated beverages marker
      OR lower(name) ~ '\bcarbonated water\b'
      -- Food preservatives and additives
      OR lower(name) ~ '\b(monosodium glutamate|potassium sorbate|'
                     || 'sodium nitrite|sodium nitrate|tartrazine|'
                     || 'riboflavin|thiamine|niacin|folic acid|lecithin)\b'
      -- Edible oils (as standalone product ingredient names)
      OR lower(name) ~ '\b(palm oil|canola oil|sunflower oil|soybean oil|'
                     || 'vegetable oil|olive oil|corn oil|rapeseed oil|'
                     || 'edible.vegetable.oil)\b'
      -- Caffeine (beverages — cosmetics already classified in step 1)
      OR lower(name) ~ '\bcaffeine\b'
      -- Food acids used as acidity regulators
      OR lower(name) ~ '\b(citric acid|phosphoric acid|acetic acid|lactic acid|'
                     || 'acidity regulator)\b'
      -- Proteins and grains
      OR lower(name) ~ '\b(soy.protein|soya.protein|whey|casein|gluten)\b'
  );

-- ── STEP 3: Name-heuristic fallback for multilingual / ambiguous products ────
-- Catches products not handled by ingredient patterns (e.g. French/Arabic labels).
UPDATE products
SET product_type = 'food'
WHERE product_type = 'unknown'
  AND (
    lower(name) ~ '(ketchup|sauce|butter|margarine|milk|cream|yogurt|yoghurt|'
               || 'kefir|juice|beverage|cola|soda|beer|wine|bread|pasta|'
               || 'cereal|wafer|chips|chocolate|candy|jam|honey|'
               || 'lait|beurre|crème|jus|boisson|farine|'   -- French
               || 'leche|crema|jugo|manteca|azucar|aceite)'  -- Spanish
    OR lower(brand) ~ '(amul|nestle|lilia|jaouda|hacendado|quaker|alpino|'
                    || 'balaji|kissan|del monte|bird.s|lindt|starbucks|'
                    || 'coca.cola|sprite|red bull|thums up|sting)'
  );

-- ── STEP 4: Purge EWG-based analyses for food-exclusive ingredients ───────────
-- Only deletes cosmetic-tagged analyses for ingredients that appear ONLY in food
-- products. Shared ingredients (e.g. "glycerin", "citric acid") that also appear
-- in cosmetics keep their EWG analysis — it will still be used for cosmetic queries.
DELETE FROM ingredient_analyses
WHERE product_type = 'cosmetic'
  AND lower(ingredient_name) IN (
    SELECT DISTINCT lower(i.name)
    FROM ingredients i
    JOIN products p ON i.product_id = p.id
    WHERE p.product_type = 'food'
  )
  AND lower(ingredient_name) NOT IN (
    SELECT DISTINCT lower(i.name)
    FROM ingredients i
    JOIN products p ON i.product_id = p.id
    WHERE p.product_type IN ('cosmetic', 'personal_care')
  );
