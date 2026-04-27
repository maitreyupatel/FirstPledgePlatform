/**
 * Bulk ingest script — adds specific products by barcode.
 * Usage: npx tsx server/scripts/bulkIngest.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { OpenFoodFactsService } from "../services/openFoodFactsService";
import { AIVettingService } from "../services/aiVettingService";
import { SupabaseStorage } from "../storage/supabaseStorage";
import { parseIngredients } from "../utils/ingredientParser";

const TARGETS: Array<{ barcode: string; source: "food" | "beauty" }> = [
  // Verified on OFF barcode API (status:1, has ingredient list, letter ratio > 0.4)
  { barcode: "5449000131805", source: "food" },   // Coca-Cola Zero Sugar
  { barcode: "9002490100070", source: "food" },   // Red Bull Energy Drink
  { barcode: "5449000000996", source: "food" },   // Coca-Cola Original Taste (EU)
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

  for (const { barcode, source } of TARGETS) {
    console.log(`\n── Barcode ${barcode} (${source})`);

    let product;
    try {
      product = await off.fetchByBarcode(barcode, source);
    } catch (e) {
      console.log(`  SKIP — fetch failed: ${e}`);
      continue;
    }

    if (!product) {
      console.log("  SKIP — not found on OFF");
      continue;
    }

    const existing = await storage.findByNameAndBrand(product.name, product.brand);
    if (existing) {
      console.log(`  SKIP — "${product.name}" already in DB`);
      continue;
    }

    const ingredients = parseIngredients(product.ingredientsText).slice(0, 8);
    if (!ingredients.length) {
      console.log(`  SKIP — no parseable ingredients`);
      continue;
    }

    console.log(`  Analyzing "${product.name}" — ${ingredients.length} ingredients`);
    const analyses = await ai.analyzeIngredients(ingredients);

    const conf = analyses.reduce((s, a) => s + a.confidence, 0) / analyses.length;
    const hasBanned = analyses.some((a) => a.status === "banned");
    const shouldPublish = conf >= 0.7 && !hasBanned;

    const created = await storage.create({
      name: product.name,
      brand: product.brand,
      summary: `AI-vetted product. ${ingredients.length} ingredients analyzed from Open ${source === "food" ? "Food" : "Beauty"} Facts (ODbL license, attribution).`,
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

    console.log(
      `  ✅ "${created.name}" → ${created.status} | overall: ${created.overallStatus} | conf: ${conf.toFixed(2)}`
    );
  }

  console.log("\n── Done");
}

run().catch((e) => { console.error("Fatal:", e); process.exit(1); });
