/**
 * Bulk ingest script — seeds DB using the OFF search API across multiple categories and pages.
 * Mirrors the cron logic but loops over many categories/pages in one shot.
 * Usage: npx tsx server/scripts/bulkIngest.ts
 *
 * Analyzes ALL parseable ingredients per product (matches cron behaviour).
 * Runtime: ~3–5 minutes for 20 products due to Groq 30 RPM limit.
 */
import dotenv from "dotenv";
dotenv.config();

import { OpenFoodFactsService } from "../services/openFoodFactsService";
import { AIVettingService } from "../services/aiVettingService";
import { SupabaseStorage } from "../storage/supabaseStorage";
import { parseIngredients } from "../utils/ingredientParser";

// How many products to target per run
const TARGET_COUNT = 20;
// How many concurrent OFF search pages to walk
const MAX_PER_SEARCH = 5;
// Safety: skip if > 50s elapsed (matching cron budget)
const MAX_ELAPSED_MS = 300_000; // 5 minutes for bulk run (more generous than cron)

const FOOD_CATEGORIES = [
  "en:beverages", "en:snacks", "en:dairy-products", "en:breakfast-cereals",
  "en:condiments", "en:energy-drinks",
];
const BEAUTY_CATEGORIES = [
  "en:face-creams", "en:shampoos", "en:body-lotions", "en:sunscreens", "en:moisturisers",
];

async function run() {
  const off = new OpenFoodFactsService();
  const ai = new AIVettingService(
    "groq",
    process.env.GROQ_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_CX_ID,
    true
  );
  const storage = new SupabaseStorage();

  let added = 0;
  let skipped = 0;
  let failed = 0;
  const startMs = Date.now();
  const brandsAdded = new Set<string>();

  // Try India-first, then global, across multiple categories and pages
  const searchPlans: Array<{ category: string; source: "food" | "beauty"; country?: string; page: number }> = [];
  for (let page = 1; page <= 3; page++) {
    for (const cat of FOOD_CATEGORIES) {
      searchPlans.push({ category: cat, source: "food", country: "en:india", page });
    }
    for (const cat of BEAUTY_CATEGORIES) {
      searchPlans.push({ category: cat, source: "beauty", country: "en:india", page });
    }
    for (const cat of FOOD_CATEGORIES) {
      searchPlans.push({ category: cat, source: "food", page });
    }
    for (const cat of BEAUTY_CATEGORIES) {
      searchPlans.push({ category: cat, source: "beauty", page });
    }
  }

  for (const plan of searchPlans) {
    if (added >= TARGET_COUNT) break;
    if (Date.now() - startMs > MAX_ELAPSED_MS) {
      console.log("⏱ Max elapsed time reached — stopping");
      break;
    }

    const label = `${plan.country ? "India" : "Global"} ${plan.source} / ${plan.category} p${plan.page}`;
    let candidates: Awaited<ReturnType<typeof off.fetchByCategory>>;
    try {
      candidates = plan.country
        ? await off.fetchByCategoryAndCountry(plan.category, plan.source, plan.country, MAX_PER_SEARCH, plan.page)
        : await off.fetchByCategory(plan.category, plan.source, MAX_PER_SEARCH, plan.page);
    } catch (e) {
      console.log(`[${label}] OFF error: ${e}`);
      continue;
    }

    if (candidates.length === 0) continue;
    console.log(`\n[${label}] ${candidates.length} candidates`);

    for (const offProduct of candidates) {
      if (added >= TARGET_COUNT) break;

      const existing = await storage.findByNameAndBrand(offProduct.name, offProduct.brand);
      if (existing) {
        skipped++;
        continue;
      }

      const normalizedBrand = offProduct.brand.toLowerCase().trim();
      if (brandsAdded.has(normalizedBrand)) {
        console.log(`  SKIP "${offProduct.name}" — brand already added`);
        skipped++;
        continue;
      }

      const ingredients = parseIngredients(offProduct.ingredientsText);
      if (!ingredients.length) {
        skipped++;
        continue;
      }

      console.log(`  Analyzing "${offProduct.name}" (${offProduct.brand}) — ${ingredients.length} ingredients`);
      let analyses;
      try {
        analyses = await ai.analyzeIngredients(ingredients);
      } catch (e) {
        console.log(`  FAIL — AI error: ${e}`);
        failed++;
        continue;
      }

      const conf = analyses.reduce((s, a) => s + a.confidence, 0) / analyses.length;
      const hasBanned = analyses.some((a) => a.status === "banned");
      const shouldPublish = conf >= 0.7 && !hasBanned;

      try {
        const created = await storage.create({
          name: offProduct.name,
          brand: offProduct.brand,
          summary: `AI-vetted product. ${ingredients.length} ingredients analyzed from Open ${offProduct.source === "food" ? "Food" : "Beauty"} Facts (ODbL license).`,
          imageUrl: offProduct.imageUrl,
          status: shouldPublish ? "published" : "draft",
          ingredients: analyses.map((a) => ({
            name: a.name,
            status: a.status,
            rationale: a.rationale,
            sourceUrl: a.sourceUrl || `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(a.name)}`,
            isOverride: false,
          })),
        });

        brandsAdded.add(normalizedBrand);
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
        console.log(`  ✅ "${created.name}" → ${created.status} | ${created.overallStatus} | conf:${conf.toFixed(2)} | ${elapsed}s`);
        added++;
      } catch (e) {
        console.log(`  FAIL — DB error: ${e}`);
        failed++;
      }
    }
  }

  const totalElapsed = ((Date.now() - startMs) / 1000).toFixed(0);
  console.log(`\n── Done in ${totalElapsed}s: ${added} added, ${skipped} skipped, ${failed} failed`);
}

run().catch((e) => { console.error("Fatal:", e); process.exit(1); });
