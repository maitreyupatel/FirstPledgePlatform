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
  getStorage: () => SupabaseStorage
): Router {
  const router = Router();
  const offService = new OpenFoodFactsService();

  /**
   * GET /api/cron/daily-ingest
   * MUST be GET — Vercel cron scheduler always sends GET requests.
   * Using POST causes Vercel to receive 200 from Express catch-all (index.html)
   * and consider the cron "succeeded" while doing nothing.
   *
   * Budget: 2 products × 8 ingredients × 2s delay = 32s < 60s Hobby limit.
   */
  router.get("/daily-ingest", async (req: Request, res: Response) => {
    if (!verifyCronSecret(req, res)) return;

    if (!aiVettingService) {
      res.status(503).json({ error: "AI vetting service not available" });
      return;
    }

    // Hard cap: 2 products × 8 ingredients × 2s = 32s — stays within 60s Vercel Hobby limit
    const COUNT = Math.min(parseInt(process.env.CRON_PRODUCTS_PER_DAY ?? "2", 10), 2);
    const MAX_INGREDIENTS = 8;

    console.log(`[cron/daily-ingest] START — fetching ${COUNT} products`);
    const startMs = Date.now();

    const results: Array<{ name: string; status: string; published: boolean; reason?: string }> = [];

    let products;
    try {
      products = await offService.fetchDailyProducts(COUNT);
    } catch (err) {
      console.error("[cron/daily-ingest] OFF fetch failed:", err);
      res.status(502).json({ error: "Failed to fetch from Open Food Facts", detail: String(err) });
      return;
    }

    console.log(`[cron/daily-ingest] OFF returned ${products.length} products`);

    if (products.length === 0) {
      res.json({ ingested: 0, results: [], message: "No usable products from OFF" });
      return;
    }

    for (const offProduct of products) {
      // Abort if we're past 50s (leave 10s buffer before Vercel kills function)
      if (Date.now() - startMs > 50_000) {
        console.warn("[cron/daily-ingest] Approaching timeout — stopping early");
        break;
      }

      try {
        const existing = await getStorage().findByNameAndBrand(offProduct.name, offProduct.brand);
        if (existing) {
          console.log(`[cron/daily-ingest] Skip "${offProduct.name}" — already in DB`);
          results.push({ name: offProduct.name, status: "skipped", published: false, reason: "already exists" });
          continue;
        }

        const ingredientNames = parseIngredients(offProduct.ingredientsText);
        if (ingredientNames.length === 0) {
          console.warn(`[cron/daily-ingest] Skip "${offProduct.name}" — no parseable ingredients`);
          results.push({ name: offProduct.name, status: "skipped", published: false, reason: "no parseable ingredients" });
          continue;
        }

        // Cap at MAX_INGREDIENTS to stay within time budget
        const toAnalyze = ingredientNames.slice(0, MAX_INGREDIENTS);
        console.log(`[cron/daily-ingest] Analyzing "${offProduct.name}" — ${toAnalyze.length} ingredients`);

        const analyses = await aiVettingService.analyzeIngredients(toAnalyze);

        const overallConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;
        const hasBanned = analyses.some((a) => a.status === "banned");
        const shouldPublish = overallConfidence >= 0.7 && !hasBanned;

        const createdProduct = await getStorage().create({
          name: offProduct.name,
          brand: offProduct.brand,
          summary: `AI-vetted via FirstPledge. ${toAnalyze.length} ingredients analyzed from ${offProduct.source === "food" ? "Open Food Facts" : "Open Beauty Facts"} (ODbL license).`,
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

        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`[cron/daily-ingest] ✅ "${offProduct.name}" → ${shouldPublish ? "published" : "draft"} (conf=${overallConfidence.toFixed(2)}, ${elapsed}s elapsed)`);

        results.push({
          name: offProduct.name,
          status: createdProduct.overallStatus,
          published: shouldPublish,
          reason: shouldPublish
            ? `confidence ${overallConfidence.toFixed(2)}`
            : `draft — confidence ${overallConfidence.toFixed(2)}${hasBanned ? ", has banned ingredients" : ""}`,
        });
      } catch (err) {
        console.error(`[cron/daily-ingest] Error on "${offProduct.name}":`, err);
        results.push({
          name: offProduct.name,
          status: "error",
          published: false,
          reason: err instanceof Error ? err.message : "unknown error",
        });
      }
    }

    const totalElapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`[cron/daily-ingest] DONE in ${totalElapsed}s — ${results.filter(r => r.published).length} published`);

    res.json({
      ingested: results.filter((r) => r.status !== "error" && r.status !== "skipped").length,
      published: results.filter((r) => r.published).length,
      elapsed_s: totalElapsed,
      results,
    });
  });

  /**
   * GET /api/cron/refresh-stale-ingredients
   * MUST be GET — same reason as daily-ingest above.
   * Scheduled: weekly on Sunday at 02:00 UTC.
   * Processes up to 10 stale ingredients per run (10 × 2s = 20s, safe).
   */
  router.get("/refresh-stale-ingredients", async (req: Request, res: Response) => {
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
      .limit(10); // 10 × 2s = 20s, safely within 60s limit

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
