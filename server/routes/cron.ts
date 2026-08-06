/**
 * Cron route handlers for automated product ingestion and ingredient refresh.
 *
 * Protected by CRON_SECRET header — set this in Vercel env vars.
 * Vercel sends Authorization: Bearer <CRON_SECRET> on cron invocations.
 */

import { Router, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { OpenFoodFactsService } from "../services/openFoodFactsService";
import { AIVettingService } from "../services/aiVettingService";
import { SupabaseStorage } from "../storage/supabaseStorage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { parseIngredients } from "../utils/ingredientParser";
import type { ProductType } from "@shared/types";

function offSourceToProductType(source: "food" | "beauty"): ProductType {
  return source === "food" ? "food" : "cosmetic";
}

/**
 * Constant-time string comparison. Hashing both sides first equalizes length,
 * so neither length nor content leaks through response timing.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Default CLOSED: only an explicit NODE_ENV=development opens the
    // endpoints without a secret. An unset NODE_ENV on a non-Vercel host is
    // a common misconfiguration and must not run unprotected.
    if (process.env.NODE_ENV === "development") {
      console.warn("CRON_SECRET not set — allowing cron request in local development only");
      return true;
    }
    console.error("CRON_SECRET not set — refusing cron request (fail closed)");
    res.status(503).json({ error: "Cron endpoints are not configured" });
    return false;
  }
  const authHeader = String(req.headers["authorization"] ?? "");
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!provided || !secretsMatch(provided, secret)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// One Supabase client per process — each client initializes its own
// connection state, so per-request construction is wasted work.
let staleRefreshClient: SupabaseClient | null = null;
function getStaleRefreshClient(supabaseUrl: string, supabaseKey: string): SupabaseClient {
  if (!staleRefreshClient) {
    staleRefreshClient = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return staleRefreshClient;
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

    // 1 product per run to maximize ingredient coverage per product.
    // Cached ingredients = instant (no delay). New ingredients = 2s each.
    // Typical product: 10-15 ingr, ~5-10 new = 10-20s. Well within 60s Hobby.
    const COUNT = Math.min(parseInt(process.env.CRON_PRODUCTS_PER_DAY ?? "1", 10), 2);
    // No hard cap — analyze ALL ingredients. Timeout guard at 50s stops if needed.
    const MAX_INGREDIENTS = 50;

    console.log(`[cron/daily-ingest] START — fetching ${COUNT} products`);
    const startMs = Date.now();
    // Time budget for this run. Must stay ~20s under the platform's function
    // maxDuration (vercel.json) so aborts happen cleanly, never mid-write.
    const budgetMs = Number(process.env.CRON_BUDGET_MS) > 0
      ? Number(process.env.CRON_BUDGET_MS)
      : 50_000;

    const results: Array<{ name: string; status: string; published: boolean; reason?: string }> = [];
    // Prevent multiple products from the same brand in a single run (e.g. 3 Coca-Cola variants)
    const brandsAddedThisRun = new Set<string>();

    let products;
    try {
      // Pass checkExists so barcode fallbacks skip products already in DB
      products = await offService.fetchDailyProducts(COUNT, async (name, brand) => {
        const existing = await getStorage().findByNameAndBrand(name, brand);
        return !!existing;
      });
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

    // Smallest products first: within the 60s budget it is better to COMPLETE
    // a 5-ingredient product than to nibble at a 30-ingredient one. Larger
    // products still converge across days via the analysis cache.
    products.sort(
      (a, b) => parseIngredients(a.ingredientsText).length - parseIngredients(b.ingredientsText).length
    );

    for (const offProduct of products) {
      // Abort when the budget is spent (buffer before the platform kill)
      if (Date.now() - startMs > budgetMs) {
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

        const normalizedBrand = offProduct.brand.toLowerCase().trim();
        if (brandsAddedThisRun.has(normalizedBrand)) {
          console.log(`[cron/daily-ingest] Skip "${offProduct.name}" — brand "${offProduct.brand}" already added this run`);
          results.push({ name: offProduct.name, status: "skipped", published: false, reason: "brand already added this run" });
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
        const productType = offSourceToProductType(offProduct.source);
        console.log(`[cron/daily-ingest] Analyzing "${offProduct.name}" (${productType}) — ${toAnalyze.length} ingredients`);

        // Deadline: abort cleanly (product skipped, cache retained) rather
        // than letting Vercel kill the function mid-write at maxDuration.
        const analyses = await aiVettingService.analyzeIngredients(toAnalyze, productType, {
          deadlineAt: startMs + budgetMs,
        });

        const overallConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;
        const hasBanned = analyses.some((a) => a.status === "banned");
        // Any single low-confidence ingredient (incl. verification-gate
        // disagreements, which cap at 0.5) forces a draft — an average can't
        // wash out one flagged verdict.
        const hasLowConfidence = analyses.some((a) => a.confidence < 0.6);
        const shouldPublish = overallConfidence >= 0.7 && !hasBanned && !hasLowConfidence;

        const createdProduct = await getStorage().create({
          name: offProduct.name,
          brand: offProduct.brand,
          productType,
          summary: `AI-vetted via FirstPledge. ${toAnalyze.length} ingredients analyzed from ${offProduct.source === "food" ? "Open Food Facts" : "Open Beauty Facts"} (ODbL license).`,
          imageUrl: offProduct.imageUrl,
          status: shouldPublish ? "published" : "draft",
          ingredients: analyses.map((a) => ({
            name: a.name,
            status: a.status,
            rationale: a.rationale,
            sourceUrl: a.sourceUrl || (productType === "food"
              ? `https://fdc.nal.usda.gov/food-search?query=${encodeURIComponent(a.name)}`
              : `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(a.name)}`),
            isOverride: false,
          })),
        });

        brandsAddedThisRun.add(normalizedBrand);

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

    const supabase = getStaleRefreshClient(supabaseUrl, supabaseKey);

    const refreshDays = parseInt(process.env.INGREDIENT_REFRESH_DAYS ?? "30", 10);
    const cutoff = new Date(Date.now() - refreshDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleRows, error } = await supabase
      .from("ingredient_analyses")
      .select("ingredient_name, product_type")
      .lt("last_analyzed_at", cutoff)
      .order("last_analyzed_at", { ascending: true })
      .limit(5); // Compound-grounded refreshes run ~8-12s each; 5 fits the 60s budget

    if (error) {
      console.error("[cron/refresh-stale-ingredients] DB error:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const staleRows_ = (staleRows ?? []) as Array<{ ingredient_name: string; product_type: string }>;
    console.log(`[cron/refresh-stale-ingredients] ${staleRows_.length} stale ingredients to refresh`);

    if (staleRows_.length === 0) {
      res.json({ refreshed: 0, message: "No stale ingredients" });
      return;
    }

    const refreshed: string[] = [];
    const failed: string[] = [];
    const refreshStartMs = Date.now();

    for (const row of staleRows_) {
      // Elapsed-time guard: search-grounded refreshes are slow; stop before
      // Vercel's 60s limit kills the function mid-write.
      if (Date.now() - refreshStartMs > 45_000) {
        console.warn("[cron/refresh-stale] Approaching timeout — stopping early");
        break;
      }
      try {
        const pt = (row.product_type || "cosmetic") as ProductType;
        await aiVettingService.analyzeIngredient(row.ingredient_name, pt);
        refreshed.push(`${row.ingredient_name} (${pt})`);
      } catch (err) {
        console.error(`[cron/refresh-stale] Failed for "${row.ingredient_name}":`, err);
        failed.push(row.ingredient_name);
      }
    }

    res.json({ refreshed: refreshed.length, failed: failed.length, names: refreshed });
  });

  return router;
}
