/**
 * The publish gate — the single answer to "may this product go live without
 * a human?" Used by the daily ingest cron and the admin re-ingest, so a
 * repaired product is judged exactly like a freshly ingested one.
 * (server/scripts/bulkIngest.ts and trialIngest.ts still carry older,
 * weaker copies — backlog E1 gate unification.)
 *
 * These gates caught every bad verdict in the Aug 2026 audit; strengthen
 * them, never bypass them.
 */
import { looksGarbledIngredientName } from "../utils/ingredientParser";
import type { ProductType, SafetyStatus } from "@shared/types";

/**
 * Ingredient rows to store for a set of analyses — shared by the cron and
 * the admin re-ingest so both write the same thing. (The USDA/EWG search
 * fallback for a missing sourceUrl is a known weak citation — backlog E1.6.)
 */
export function ingredientInputsFromAnalyses(
  analyses: Array<{ name: string; status: SafetyStatus; rationale: string; sourceUrl?: string }>,
  productType: ProductType,
) {
  const food = productType === "food" || productType === "supplement";
  return analyses.map((a) => ({
    name: a.name,
    status: a.status,
    rationale: a.rationale,
    sourceUrl:
      a.sourceUrl ||
      (food
        ? `https://fdc.nal.usda.gov/food-search?query=${encodeURIComponent(a.name)}`
        : `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(a.name)}`),
    isOverride: false,
  }));
}

export interface GateInput {
  name: string;
  status: string;
  confidence: number;
}

export interface GateResult {
  publish: boolean;
  overallConfidence: number;
  /** Why the product is held; empty when it may publish. */
  reasons: string[];
}

export function evaluatePublishGate(analyses: GateInput[]): GateResult {
  if (analyses.length === 0) return { publish: false, overallConfidence: 0, reasons: ["no ingredients"] };

  const overallConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;
  const reasons: string[] = [];
  if (overallConfidence < 0.7) reasons.push(`overall confidence ${overallConfidence.toFixed(2)} < 0.70`);

  const banned = analyses.filter((a) => a.status === "banned").map((a) => a.name);
  if (banned.length > 0) reasons.push(`banned: ${banned.join(", ")}`);

  // Any single low-confidence ingredient (incl. verification-gate
  // disagreements, which cap at 0.5) holds the product — an average can't
  // wash out one flagged verdict.
  const low = analyses.filter((a) => a.confidence < 0.6).map((a) => a.name);
  if (low.length > 0) reasons.push(`low confidence (<0.60): ${low.join(", ")}`);

  // Dirty label text (OCR fragments, merged tokens) must never reach the
  // public catalog under a "published" badge.
  const garbled = analyses.filter((a) => looksGarbledIngredientName(a.name)).map((a) => a.name);
  if (garbled.length > 0) reasons.push(`garbled names need review: ${garbled.join(", ")}`);

  return { publish: reasons.length === 0, overallConfidence, reasons };
}
