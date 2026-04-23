/**
 * Cron route handlers for automated product ingestion and ingredient refresh.
 *
 * Protected by CRON_SECRET header — set this in Vercel env vars.
 * Vercel sends Authorization: Bearer <CRON_SECRET> on cron invocations.
 */

import { Router, Request, Response } from "express";
import { OpenFoodFactsService } from "../services/openFoodFactsService";
import { AIVettingService } from "../services/aiVettingService";
import { SupabaseStorage } from "../storage/supabaseStorage";
import { createClient } from "@supabase/supabase-js";
import { parseIngredients } from "../utils/ingredientParser";

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("CRON_SECRET not set — cron endpoints are unprotected");
    return true;
  }
  const authHeader = req.headers["authorization"] ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}


export function buildCronRouter(
  aiVettingService: AIVettingService | null,
  storage: SupabaseStorage
): Router {
  const router = Router();
  const offService = new OpenFoodFactsService();

  /**
   * POST /api/cron/daily-ingest
   * Fetches 1-2 products from Open Food Facts / Open Beauty Facts,
   * vets their ingredients, and auto-publishes or saves as draft.
   * Scheduled: daily at 09:00 UTC via vercel.json cron.
   */
  router.post("/daily-ingest", async (req: Request, res: Response) => {
    if (!verifyCronSecret(req, res)) return;

    if (!aiVettingService) {
      res.status(503).json({ error: "AI vetting service not available" });
      return;
    }

    const results: Array<{ name: string; status: string; published: boolean; reason?: string }> = [];
    const COUNT = parseInt(process.env.CRON_PRODUCTS_PER_DAY ?? "2", 10);

    console.log(`[cron/daily-ingest] Fetching ${COUNT} products from Open Food Facts...`);

    let products;
    try {
      products = await offService.fetchDailyProducts(COUNT);
    } catch (err) {
      console.error("[cron/daily-ingest] Failed to fetch from OFF:", err);
      res.status(502).json({ error: "Failed to fetch products from Open Food Facts" });
      return;
    }

    if (products.length === 0) {
      console.warn("[cron/daily-ingest] No usable products returned from OFF");
      res.json({ ingested: 0, results: [] });
      return;
    }

    for (const offProduct of products) {
      try {
        // Skip if already exists (dedup by name+brand)
        const existing = await storage.findByNameAndBrand(offProduct.name, offProduct.brand);
        if (existing) {
          results.push({ name: offProduct.name, status: "skipped", published: false, reason: "already exists" });
          continue;
        }

        const ingredientNames = parseIngredients(offProduct.ingredientsText);
        if (ingredientNames.length === 0) {
          results.push({ name: offProduct.name, status: "skipped", published: false, reason: "no parseable ingredients" });
          continue;
        }

        // Limit to first 15 to stay within Vercel 30s timeout
        const toAnalyze = ingredientNames.slice(0, 15);
        console.log(`[cron/daily-ingest] Analyzing "${offProduct.name}" — ${toAnalyze.length} ingredients`);

        const analyses = await aiVettingService.analyzeIngredients(toAnalyze);

        const overallConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;
        const hasBanned = analyses.some((a) => a.status === "banned");

        // Auto-publish: high confidence AND no banned ingredients
        const shouldPublish = overallConfidence >= 0.7 && !hasBanned;

        const createdProduct = await storage.create({
          name: offProduct.name,
          brand: offProduct.brand,
          summary: `AI-vetted product from Open Food Facts. ${toAnalyze.length} ingredients analyzed. Source: ${offProduct.source}.`,
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

        results.push({
          name: offProduct.name,
          status: createdProduct.overallStatus,
          published: shouldPublish,
          reason: shouldPublish
            ? `confidence ${overallConfidence.toFixed(2)}`
            : `low confidence (${overallConfidence.toFixed(2)}) or banned ingredients — saved as draft`,
        });

        console.log(`[cron/daily-ingest] ✅ "${offProduct.name}" → ${shouldPublish ? "published" : "draft"}`);
      } catch (err) {
        console.error(`[cron/daily-ingest] Failed to process "${offProduct.name}":`, err);
        results.push({
          name: offProduct.name,
          status: "error",
          published: false,
          reason: err instanceof Error ? err.message : "unknown error",
        });
      }
    }

    res.json({
      ingested: results.filter((r) => r.status !== "error" && r.status !== "skipped").length,
      published: results.filter((r) => r.published).length,
      results,
    });
  });

  /**
   * POST /api/cron/refresh-stale-ingredients
   * Re-analyzes ingredient_analyses older than INGREDIENT_REFRESH_DAYS.
   * Scheduled: weekly on Sunday at 02:00 UTC.
   * Processes up to 20 stale ingredients per run to stay within 30s limit.
   */
  router.post("/refresh-stale-ingredients", async (req: Request, res: Response) => {
    if (!verifyCronSecret(req, res)) return;

    if (!aiVettingService) {
      res.status(503).json({ error: "AI vetting service not available" });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      res.status(503).json({ error: "Supabase not configured" });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const refreshDays = parseInt(process.env.INGREDIENT_REFRESH_DAYS ?? "30", 10);
    const cutoff = new Date(Date.now() - refreshDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleRows, error } = await supabase
      .from("ingredient_analyses")
      .select("ingredient_name")
      .lt("last_analyzed_at", cutoff)
      .order("last_analyzed_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[cron/refresh-stale-ingredients] DB error:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const staleNames = (staleRows ?? []).map((r: any) => r.ingredient_name as string);
    console.log(`[cron/refresh-stale-ingredients] ${staleNames.length} stale ingredients to refresh`);

    if (staleNames.length === 0) {
      res.json({ refreshed: 0, message: "No stale ingredients" });
      return;
    }

    const refreshed: string[] = [];
    const failed: string[] = [];

    for (const name of staleNames) {
      try {
        await aiVettingService.analyzeIngredient(name);
        refreshed.push(name);
      } catch (err) {
        console.error(`[cron/refresh-stale] Failed for "${name}":`, err);
        failed.push(name);
      }
    }

    res.json({ refreshed: refreshed.length, failed: failed.length, names: refreshed });
  });

  return router;
}
