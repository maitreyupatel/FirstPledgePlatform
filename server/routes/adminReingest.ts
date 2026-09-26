/**
 * POST /api/admin/products/:id/reingest
 *
 * Re-runs a stored product through the SAME parse → analyze → publish-gate
 * path as the daily ingest. When the parser or the additive registry
 * improves, products ingested under the old code otherwise keep their old
 * ingredient lists forever — the Sept 2026 parser audit found 20 of 45
 * published products missing additives their labels declare. This is the
 * tool that repairs them, and the draft-triage tool (backlog E3.6).
 *
 * Body: { ingredientsText, dryRun?, hold? }
 * - ingredientsText: the label text (e.g. Open Food Facts ingredients_text_en).
 * - dryRun: analyze and report, write nothing to the product. (Analyses are
 *   still cached — the pipeline's normal side effect.)
 * - hold: operator reason to keep the product as a draft even if the gate
 *   passes, e.g. a name the gate cannot know is truncated on the label.
 *
 * The gate decides status exactly as the cron does: it can publish a draft
 * and it can UNPUBLISH a published product. The response reports which,
 * with the before/after lists, so every production change is visible.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import type { AIVettingService } from "../services/aiVettingService";
import type { SupabaseStorage } from "../storage/supabaseStorage";
import { requireAuth } from "../middleware/auth";
import { parseIngredients, looksGarbledIngredientName } from "../utils/ingredientParser";
import { evaluatePublishGate, ingredientInputsFromAnalyses } from "../services/publishGate";

const MAX_INGREDIENTS = 50; // same cap as the daily ingest

const reingestSchema = z.object({
  ingredientsText: z.string().trim().min(3).max(20_000),
  dryRun: z.boolean().optional(),
  hold: z.string().trim().min(1).max(300).optional(),
});

export function buildAdminReingestRouter(
  aiVettingService: AIVettingService | null,
  getStorage: () => SupabaseStorage,
): Router {
  const router = Router();

  router.post("/products/:id/reingest", requireAuth, async (req: Request, res: Response) => {
    if (!aiVettingService) {
      res.status(503).json({ error: "AI vetting service not available" });
      return;
    }
    const parsed = reingestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid reingest payload", details: fromZodError(parsed.error).message });
      return;
    }
    const { ingredientsText, dryRun, hold } = parsed.data;

    try {
      const storage = getStorage();
      const product = await storage.getById(req.params.id, { includeUnpublished: true });
      if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
      }

      const names = parseIngredients(ingredientsText).slice(0, MAX_INGREDIENTS);
      if (names.length === 0) {
        res.status(422).json({ error: "No parseable ingredients in ingredientsText" });
        return;
      }

      const before = {
        status: product.status,
        ingredients: product.ingredients.map((i) => ({ name: i.name, status: i.status })),
      };

      // A damaged label (garbled names) is held no matter what the analyses
      // say — so don't spend AI calls on it or write junk rows into the
      // shared analysis cache. The product goes to draft with its current
      // rows intact for a human; resubmit with a cleaned ingredientsText.
      const garbled = names.filter(looksGarbledIngredientName);
      if (garbled.length > 0) {
        const reasons = [`label text is damaged — supply a cleaned ingredientsText: ${garbled.join(" | ")}`];
        const report = {
          id: product.id,
          name: product.name,
          brand: product.brand,
          dryRun: !!dryRun,
          before,
          after: { status: "draft", gate: { publish: false, overallConfidence: 0, reasons, held: hold ?? null }, parsed: names },
        };
        if (!dryRun && product.status !== "draft") {
          await storage.update(product.id, { status: "draft" });
          console.log(`[admin/reingest] "${product.name}" ${product.status} → draft (damaged label, rows kept for review)`);
        }
        res.json({ ...report, written: !dryRun && product.status !== "draft" });
        return;
      }

      // On Vercel (maxDuration 300s, 20s AI pacing) a long uncached list
      // must abort cleanly before the platform kill; a retry resumes from
      // the analysis cache (backlog E4.2). Local runs have no such limit.
      const analyses = await aiVettingService.analyzeIngredients(
        names,
        product.productType,
        process.env.VERCEL ? { deadlineAt: Date.now() + 270_000 } : {},
      );
      const gate = evaluatePublishGate(analyses);
      const status = gate.publish && !hold ? "published" : "draft";

      const report = {
        id: product.id,
        name: product.name,
        brand: product.brand,
        dryRun: !!dryRun,
        before,
        after: {
          status,
          gate: { ...gate, held: hold ?? null },
          ingredients: analyses.map((a) => ({ name: a.name, status: a.status, confidence: a.confidence })),
        },
      };

      if (dryRun) {
        res.json({ ...report, written: false });
        return;
      }

      const food = product.productType === "food" || product.productType === "supplement";
      await storage.update(product.id, {
        status,
        ingredients: ingredientInputsFromAnalyses(analyses, product.productType),
        summary: `AI-vetted via FirstPledge. ${names.length} ingredients analyzed from ${food ? "Open Food Facts" : "Open Beauty Facts"} (ODbL license).`,
      });
      console.log(`[admin/reingest] "${product.name}" ${product.status} → ${status} (${names.length} ingredients${gate.reasons.length ? `; held: ${gate.reasons.join("; ")}` : ""}${hold ? `; operator hold: ${hold}` : ""})`);
      res.json({ ...report, written: true });
    } catch (error) {
      console.error("[admin/reingest] failed:", error);
      res.status(500).json({ error: "Reingest failed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
