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
import { brandKey } from "../utils/nameSimilarity";
import { ingestOutcome, ingestTriggerOf, type IngestJob } from "../services/ingestTelemetry";
import { evaluatePublishGate, ingredientInputsFromAnalyses } from "../services/publishGate";
import { analysisCacheKey } from "../utils/cacheKey";
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

/**
 * Budget math for refresh-stale-ingredients. Exported for tests.
 *
 * Derives both knobs from CRON_BUDGET_MS instead of the old hardcoded
 * 45s guard + LIMIT 5 (written for the obsolete 60s Hobby limit, and the
 * direct cause of the stale-analysis backlog: 5 rows/week against a
 * 280s budget that could take ~11).
 *
 * - stopAfterMs: don't START a refresh after this much elapsed time. The
 *   margin is worst-case single-refresh latency, not a token buffer: one
 *   refresh can run 45s compound + 45s verification + retry headroom.
 * - fetchLimit: rows to pull, at ~25s per compound-grounded refresh.
 */
export function computeRefreshBudget(rawBudgetMs: unknown): { stopAfterMs: number; fetchLimit: number } {
  const budgetMs = Number(rawBudgetMs) > 0 ? Number(rawBudgetMs) : 50_000;
  const WORST_CASE_REFRESH_MS = 120_000;
  const stopAfterMs = Math.max(5_000, budgetMs - WORST_CASE_REFRESH_MS);
  const fetchLimit = Math.max(1, Math.min(40, Math.floor(budgetMs / 25_000)));
  return { stopAfterMs, fetchLimit };
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

  // Run telemetry is fail-open end to end: not even a storage that cannot
  // initialise (missing env) may break or hang a cron response.
  const startRun = async (job: IngestJob, req: Request): Promise<string | null> => {
    try {
      return await getStorage().startIngestRun(job, ingestTriggerOf(req.headers["user-agent"]));
    } catch (err) {
      console.warn(`[ingest_runs] start not recorded (${job}):`, err instanceof Error ? err.message : err);
      return null;
    }
  };
  const finishRun = async (...args: Parameters<SupabaseStorage["finishIngestRun"]>): Promise<void> => {
    try {
      await getStorage().finishIngestRun(...args);
    } catch (err) {
      console.warn("[ingest_runs] finish not recorded:", err instanceof Error ? err.message : err);
    }
  };

  /**
   * GET /api/cron/daily-ingest
   * MUST be GET — Vercel cron scheduler always sends GET requests.
   * Using POST causes Vercel to receive 200 from Express catch-all (index.html)
   * and consider the cron "succeeded" while doing nothing.
   *
   * Budget: CRON_BUDGET_MS (280s in production per vercel.json, under the
   * 300s maxDuration), enforced via deadlineAt inside analyzeIngredients.
   */
  router.get("/daily-ingest", async (req: Request, res: Response) => {
    if (!verifyCronSecret(req, res)) return;

    if (!aiVettingService) {
      res.status(503).json({ error: "AI vetting service not available" });
      return;
    }

    // Durable run record (ingest_runs): Vercel cron logs are ephemeral.
    const runId = await startRun("daily-ingest", req);

    // 1 product per run to maximize ingredient coverage per product.
    // Cached ingredients = instant (no delay); fresh ones pay AI_CALL_DELAY_MS
    // pacing each (20s in production for Groq TPM), bounded by budgetMs below.
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
      // checkExists: exact match first, then near-duplicate (spelling
      // variant / word order) so the catalog never collects the same product
      // twice under slightly different OFF record names.
      products = await offService.fetchDailyProducts(COUNT, async (name, brand, barcode) => {
        // Same barcode = same product, whatever the brand string says
        if (barcode && (await getStorage().hasBarcode(barcode))) return true;
        const existing = await getStorage().findByNameAndBrand(name, brand);
        if (existing) return true;
        return getStorage().hasSimilarProduct(name, brand);
      });
    } catch (err) {
      console.error("[cron/daily-ingest] OFF fetch failed:", err);
      await finishRun(runId, "error", {}, { error: String(err) });
      res.status(502).json({ error: "Failed to fetch from Open Food Facts", detail: String(err) });
      return;
    }

    console.log(`[cron/daily-ingest] OFF returned ${products.length} products`);

    if (products.length === 0) {
      await finishRun(runId, "no_candidates");
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

        const normalizedBrand = brandKey(offProduct.brand) || offProduct.brand.toLowerCase().trim();
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

        // One gate for the cron and the admin re-ingest (services/publishGate.ts):
        // overall confidence >= 0.7, no banned ingredient, none below 0.6,
        // no garbled name.
        const gate = evaluatePublishGate(analyses, { totalParsed: ingredientNames.length });
        const shouldPublish = gate.publish;
        const overallConfidence = gate.overallConfidence;

        const createdProduct = await getStorage().create({
          name: offProduct.name,
          brand: offProduct.brand,
          productType,
          summary: `AI-vetted via FirstPledge. ${toAnalyze.length} ingredients analyzed from ${offProduct.source === "food" ? "Open Food Facts" : "Open Beauty Facts"} (ODbL license).`,
          imageUrl: offProduct.imageUrl,
          status: shouldPublish ? "published" : "draft",
          ingredients: ingredientInputsFromAnalyses(analyses, productType),
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
            : `draft — ${gate.reasons.join("; ")}`,
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
    const created = results.filter((r) => r.status !== "error" && r.status !== "skipped");
    const counts = {
      productsCreated: created.length,
      published: created.filter((r) => r.published).length,
      drafts: created.filter((r) => !r.published).length,
      skipped: results.filter((r) => r.status === "skipped").length,
      // e.g. a product abandoned at the deadline — invisible before this log
      failed: results.filter((r) => r.status === "error").length,
    };
    await finishRun(runId, ingestOutcome(counts), counts, { results, elapsed_s: Number(totalElapsed) });
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
   * Row count and elapsed-time guard both derive from CRON_BUDGET_MS
   * (see computeRefreshBudget) — 280s in production per vercel.json.
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
    const runId = await startRun("refresh-stale-ingredients", req);

    const refreshDays = parseInt(process.env.INGREDIENT_REFRESH_DAYS ?? "30", 10);
    const cutoff = new Date(Date.now() - refreshDays * 24 * 60 * 60 * 1000).toISOString();
    const { stopAfterMs, fetchLimit } = computeRefreshBudget(process.env.CRON_BUDGET_MS);

    // A row whose name is not its own cache key was written under an older
    // key scheme ("preservative-e211", now "ins 211"). Nothing reads it any
    // more, and refreshing it only rewrites the canonical row, so it would
    // stay the "oldest stale" row forever. Page past such rows until enough
    // real ones are collected — a fixed over-fetch would eventually be all
    // legacy rows and refresh nothing while reporting ok (review round 2).
    type StaleRow = { ingredient_name: string; product_type: string };
    const staleRows_: StaleRow[] = [];
    const PAGE = Math.max(fetchLimit * 3, 30);
    for (let page = 0; page < 10 && staleRows_.length < fetchLimit; page++) {
      const { data: rows, error } = await supabase
        .from("ingredient_analyses")
        .select("ingredient_name, product_type")
        .lt("last_analyzed_at", cutoff)
        .order("last_analyzed_at", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) {
        console.error("[cron/refresh-stale-ingredients] DB error:", error);
        await finishRun(runId, "error", {}, { error: error.message });
        res.status(500).json({ error: error.message });
        return;
      }
      const batch = (rows ?? []) as StaleRow[];
      for (const row of batch) {
        if (staleRows_.length >= fetchLimit) break;
        if (analysisCacheKey(row.ingredient_name) === row.ingredient_name) staleRows_.push(row);
      }
      if (batch.length < PAGE) break; // no more stale rows
    }
    console.log(`[cron/refresh-stale-ingredients] ${staleRows_.length} stale ingredients to refresh`);

    if (staleRows_.length === 0) {
      await finishRun(runId, "ok");
      res.json({ refreshed: 0, message: "No stale ingredients" });
      return;
    }

    const refreshed: string[] = [];
    const failed: string[] = [];
    const refreshStartMs = Date.now();

    for (const row of staleRows_) {
      // Elapsed-time guard: never START a refresh that couldn't finish its
      // worst case (compound + verification + retries) inside the budget —
      // being killed mid-write is the failure mode this protects against.
      if (Date.now() - refreshStartMs > stopAfterMs) {
        console.warn("[cron/refresh-stale] Budget exhausted — stopping early");
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

    const refreshCounts = { refreshed: refreshed.length, failed: failed.length };
    await finishRun(runId, ingestOutcome(refreshCounts), refreshCounts, { refreshed, failed });
    res.json({ refreshed: refreshed.length, failed: failed.length, names: refreshed });
  });

  return router;
}
