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
 * Body (strict — an unknown key is a 400, never silently ignored):
 * - ingredientsText: the label text (e.g. Open Food Facts ingredients_text_en).
 * - apply: true to WRITE. Absent, the call is a dry run that reports
 *   before/after and writes nothing to the product (analyses are still
 *   cached — the pipeline's normal side effect). Writing is opt-in so a
 *   missing or misspelled flag fails safe.
 * - hold: operator reason to keep the product a draft even if the gate
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
import { barcodeFromImageUrl } from "../utils/offBarcode";
import { evaluatePublishGate, ingredientInputsFromAnalyses } from "../services/publishGate";

const MAX_INGREDIENTS = 50; // same cap as the daily ingest

const reingestSchema = z
  .object({
    ingredientsText: z.string().trim().min(3).max(20_000),
    apply: z.literal(true).optional(),
    hold: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

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
    const { ingredientsText, apply, hold } = parsed.data;
    const storage = getStorage();

    const product = await storage.getById(req.params.id, { includeUnpublished: true }).catch(() => null);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const names = parseIngredients(ingredientsText);
    if (names.length === 0) {
      res.status(422).json({ error: "No parseable ingredients in ingredientsText" });
      return;
    }

    const before = {
      status: product.status,
      ingredients: product.ingredients.map((i) => ({ name: i.name, status: i.status })),
    };
    const report = (after: Record<string, unknown>, written: boolean) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      dryRun: !apply,
      before,
      after,
      written,
    });

    // A damaged label (garbled names) — or one longer than the analysis cap,
    // whose tail would be silently missing — is held no matter what the
    // analyses say. Don't spend AI calls on it or write junk rows into the
    // shared analysis cache: the product goes to draft with its current rows
    // intact for a human; resubmit with a cleaned ingredientsText.
    const garbled = names.filter(looksGarbledIngredientName);
    const tooLong = names.length > MAX_INGREDIENTS;
    if (garbled.length > 0 || tooLong) {
      const reasons = [
        ...(garbled.length > 0 ? [`label text is damaged — supply a cleaned ingredientsText: ${garbled.join(" | ")}`] : []),
        ...(tooLong ? [`label lists ${names.length} ingredients > ${MAX_INGREDIENTS} — triage manually`] : []),
      ];
      const unpublish = !!apply && product.status !== "draft";
      try {
        if (unpublish) await storage.update(product.id, { status: "draft" });
      } catch (error) {
        res.status(500).json({ error: "Reingest failed", details: error instanceof Error ? error.message : String(error) });
        return;
      }
      if (unpublish) console.log(`[admin/reingest] "${product.name}" ${product.status} → draft (held label, rows kept for review)`);
      res.json(report({ status: "draft", gate: { publish: false, overallConfidence: 0, reasons, held: hold ?? null }, parsed: names }, unpublish));
      return;
    }

    let writeStarted = false;
    try {
      // On Vercel (maxDuration 300s, 20s AI pacing) a long uncached list
      // must abort cleanly before the platform kill; a retry resumes from
      // the analysis cache (backlog E4.2). Local runs have no such limit.
      const analyses = await aiVettingService.analyzeIngredients(
        names,
        product.productType,
        process.env.VERCEL ? { deadlineAt: Date.now() + 270_000 } : {},
      );
      const gate = evaluatePublishGate(analyses, { totalParsed: names.length });
      const reasons = [...gate.reasons];

      // Promoting a draft must not publish a second copy of a live product —
      // the checks the daily cron runs before creating anything, minus the
      // product itself.
      if (gate.publish && !hold && product.status !== "published") {
        const barcode = barcodeFromImageUrl(product.imageUrl);
        if (barcode && (await storage.hasBarcode(barcode, product.id))) reasons.push(`duplicate: barcode ${barcode} already in the catalog`);
        else if (await storage.hasSimilarProduct(product.name, product.brand, product.id)) reasons.push("duplicate: a similar product of this brand is in the catalog");
      }
      const status = gate.publish && !hold && reasons.length === 0 ? "published" : "draft";

      const after = {
        status,
        gate: { ...gate, publish: status === "published", reasons, held: hold ?? null },
        ingredients: analyses.map((a) => ({ name: a.name, status: a.status, confidence: a.confidence })),
      };
      if (!apply) {
        res.json(report(after, false));
        return;
      }

      // Two steps, so no failure can leave a PUBLISHED product with a
      // half-written list (the ingredient swap is not transactional —
      // backlog E4.3): write the new rows as a draft first, and publish only
      // once they are in, keeping the original publish date.
      const food = product.productType === "food" || product.productType === "supplement";
      writeStarted = true;
      await storage.update(product.id, {
        status: "draft",
        ingredients: ingredientInputsFromAnalyses(analyses, product.productType),
        summary: `AI-vetted via FirstPledge. ${names.length} ingredients analyzed from ${food ? "Open Food Facts" : "Open Beauty Facts"} (ODbL license).`,
      });
      if (status === "published") {
        await storage.update(product.id, { status: "published", publishedAt: product.publishedAt ?? undefined });
      }
      console.log(`[admin/reingest] "${product.name}" ${product.status} → ${status} (${names.length} ingredients${reasons.length ? `; held: ${reasons.join("; ")}` : ""}${hold ? `; operator hold: ${hold}` : ""})`);
      res.json(report(after, true));
    } catch (error) {
      console.error("[admin/reingest] failed:", error);
      // A failed WRITE must not leave the product live half-written; a failed
      // analysis wrote nothing, so the product is left exactly as it was
      let heldAfterWriteFailure = false;
      if (writeStarted) {
        try {
          await storage.update(product.id, { status: "draft" });
          heldAfterWriteFailure = true;
        } catch {
          /* reported below */
        }
      }
      res.status(500).json({
        error: "Reingest failed",
        details: error instanceof Error ? error.message : String(error),
        heldAfterWriteFailure,
      });
    }
  });

  return router;
}
