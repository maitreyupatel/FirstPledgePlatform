/**
 * Trial ingest script — run ONE product through the full pipeline.
 * Usage: npx tsx server/scripts/trialIngest.ts [food|beauty]
 *
 * Shows exactly: what product was chosen, ingredient parsing, AI vetting,
 * confidence scores, final DB write.
 */

import dotenv from "dotenv";
dotenv.config();

import { OpenFoodFactsService } from "../services/openFoodFactsService";
import { AIVettingService } from "../services/aiVettingService";
import { SupabaseStorage } from "../storage/supabaseStorage";
import { parseIngredients } from "../utils/ingredientParser";

const source = (process.argv[2] as "food" | "beauty") ?? "food";

async function run() {
  console.log(`\n🚀 Trial ingest — source: ${source}`);
  console.log("=".repeat(60));

  // ── Step 1: Fetch from Open Food Facts ──────────────────────────
  console.log("\n📦 Step 1: Fetching product from Open Food Facts...");
  const offService = new OpenFoodFactsService();

  // Well-known barcodes for trial — barcode API is always stable even when search is down
  // Food: Tropicana OJ, Quaker Oats, Lay's Classic, Heinz Ketchup, Nutella
  // Beauty: Nivea Creme, Cetaphil, Dove soap (Open Beauty Facts barcodes)
  const TRIAL_BARCODES: Record<string, { barcode: string; source: "food" | "beauty" }[]> = {
    food: [
      { barcode: "0048500201282", source: "food" }, // Tropicana Orange Juice
      { barcode: "0030000301913", source: "food" }, // Quaker Old Fashioned Oats
      { barcode: "3017620422003", source: "food" }, // Nutella
      { barcode: "0041196990005", source: "food" }, // Heinz Ketchup
      { barcode: "0028400028738", source: "food" }, // Lay's Classic
    ],
    beauty: [
      { barcode: "4005808194001", source: "beauty" }, // Nivea Creme
      { barcode: "3574661385624", source: "beauty" }, // Cetaphil Moisturizer
      { barcode: "0079400023780", source: "beauty" }, // Dove Beauty Bar
      { barcode: "3600521826492", source: "beauty" }, // L'Oreal Elvive
      { barcode: "5000157024229", source: "beauty" }, // Simple Kind To Skin
    ],
  };

  // First try category search (works most of the time)
  let product = null;
  try {
    const categories = source === "beauty"
      ? ["en:face-creams", "en:sunscreens", "en:shampoos"]
      : ["en:beverages", "en:snacks", "en:breakfast-cereals"];
    const category = categories[Math.floor(Math.random() * categories.length)];
    console.log(`   Trying category search: ${category}`);
    const products = await offService.fetchByCategory(category, source, 5);
    if (products.length > 0) product = products[0];
  } catch {
    console.log("   Category search unavailable — falling back to barcode lookup");
  }

  // Fallback: known barcodes
  if (!product) {
    console.log("   Using barcode lookup for known popular products...");
    for (const entry of TRIAL_BARCODES[source]) {
      try {
        const p = await offService.fetchByBarcode(entry.barcode, entry.source);
        if (p) { product = p; break; }
      } catch { continue; }
    }
  }

  if (!product) {
    console.error("❌ Could not fetch any product. Check internet connection.");
    process.exit(1);
  }
  console.log(`\n   ✅ Selected: "${product.name}" by ${product.brand}`);
  console.log(`   Barcode: ${product.barcode}`);
  console.log(`   Image: ${product.imageUrl || "(none)"}`);
  console.log(`   Raw ingredients text (first 200 chars):`);
  console.log(`   ${product.ingredientsText.slice(0, 200)}...`);

  // ── Step 2: Parse ingredients ────────────────────────────────────
  console.log("\n🧪 Step 2: Parsing ingredients...");
  const allIngredients = parseIngredients(product.ingredientsText);
  const toAnalyze = allIngredients.slice(0, 12); // cap for trial speed

  console.log(`   Total parsed: ${allIngredients.length} ingredients`);
  console.log(`   Analyzing (capped at 12): ${toAnalyze.length}`);
  console.log(`   Ingredients: ${toAnalyze.join(", ")}`);

  if (toAnalyze.length === 0) {
    console.error("❌ Could not parse any ingredients from text. Skipping.");
    process.exit(1);
  }

  // ── Step 3: Check dedup ──────────────────────────────────────────
  console.log("\n🔍 Step 3: Checking for duplicates in DB...");
  const storage = new SupabaseStorage();
  const existing = await storage.findByNameAndBrand(product.name, product.brand);
  if (existing) {
    console.log(`   ⚠️  Product already exists in DB: "${product.name}". Exiting trial.`);
    console.log("   Re-run with a different category to get a fresh product.");
    process.exit(0);
  }
  console.log("   ✅ Not in DB — proceeding");

  // ── Step 4: AI vetting ───────────────────────────────────────────
  console.log("\n🤖 Step 4: Running AI vetting pipeline (EWG → Research → Groq)...");
  console.log("   ⏱  This takes ~2s per ingredient due to rate limit spacing...");

  const aiProviderType = (process.env.AI_PROVIDER || "groq") as "groq" | "openai" | "gemini";
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCxId = process.env.GOOGLE_CX_ID;

  if (!apiKey) {
    console.error("❌ No AI API key found in .env");
    process.exit(1);
  }

  const aiService = new AIVettingService(aiProviderType, apiKey, googleApiKey, googleCxId, true);
  const analyses = await aiService.analyzeIngredients(toAnalyze);

  console.log("\n   Results:");
  console.log("   " + "-".repeat(56));
  for (const a of analyses) {
    const icon = a.status === "safe" ? "✅" : a.status === "caution" ? "⚠️ " : "🚫";
    const ewg = a.ewgScore != null ? ` (EWG: ${a.ewgScore})` : " (no EWG)";
    const conf = `conf: ${(a.confidence * 100).toFixed(0)}%`;
    console.log(`   ${icon} ${a.name.padEnd(32)} ${a.status.padEnd(8)} ${ewg.padEnd(12)} ${conf}`);
  }

  // ── Step 5: Compute overall verdict ─────────────────────────────
  console.log("\n📊 Step 5: Computing overall verdict...");
  const avgConf = analyses.reduce((s, a) => s + a.confidence, 0) / analyses.length;
  const hasBanned = analyses.some((a) => a.status === "banned");
  const hasCaution = analyses.some((a) => a.status === "caution");
  const overallStatus = hasBanned ? "banned" : hasCaution ? "caution" : "safe";
  const shouldPublish = avgConf >= 0.7 && !hasBanned;

  console.log(`   Overall status : ${overallStatus}`);
  console.log(`   Avg confidence : ${(avgConf * 100).toFixed(1)}%`);
  console.log(`   Has banned     : ${hasBanned}`);
  console.log(`   Will publish   : ${shouldPublish} ${shouldPublish ? "(auto-publish)" : "(save as draft)"}`);

  // ── Step 6: Write to DB ──────────────────────────────────────────
  console.log("\n💾 Step 6: Writing to Supabase...");
  const created = await storage.create({
    name: product.name,
    brand: product.brand,
    summary: `AI-vetted product. Source: Open ${source === "food" ? "Food" : "Beauty"} Facts (ODbL). ${toAnalyze.length} ingredients analyzed via EWG + Groq AI.`,
    imageUrl: product.imageUrl,
    status: shouldPublish ? "published" : "draft",
    ingredients: analyses.map((a) => ({
      name: a.name,
      status: a.status,
      rationale: a.rationale,
      sourceUrl: a.sourceUrl || `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(a.name)}`,
      isOverride: false,
    })),
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎉 SUCCESS`);
  console.log(`   Product ID  : ${created.id}`);
  console.log(`   Name        : ${created.name}`);
  console.log(`   Brand       : ${created.brand}`);
  console.log(`   Status      : ${created.overallStatus} (${created.status})`);
  console.log(`   Ingredients : ${created.ingredients?.length ?? 0} saved`);
  if (shouldPublish) {
    console.log(`\n   🌐 Live at: https://maitreyupatel-first-pledgeplatform.vercel.app`);
  } else {
    console.log(`\n   📝 Saved as draft — review in Admin Dashboard before publishing.`);
  }
}

run().catch((err) => {
  console.error("\n❌ Trial failed:", err);
  process.exit(1);
});
