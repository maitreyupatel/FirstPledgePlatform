/**
 * Groq Compound research client — search-grounded ingredient analysis.
 *
 * groq/compound-mini wraps Groq-hosted models with server-side web search.
 * We pin search to authoritative regulatory domains and boost Indian results,
 * so verdicts for unknown ingredients are grounded in retrieved FSSAI/FDA/
 * EFSA/EWG content instead of model recall. Feasibility, JSON-mode support,
 * and latency (~8s/call) were live-verified on 2026-07-24.
 *
 * Used for: (1) ingredients that miss both the EWG database and the additive
 * registry, replacing the Google CSE + blind-AI two-step; (2) second-opinion
 * verification of "banned"/low-confidence verdicts before they can publish.
 *
 * Disable with COMPOUND_RESEARCH=false. Model override: GROQ_COMPOUND_MODEL.
 */

import {
  ingredientDataBlock,
  sanitizeIngredientName,
  validateAnalysisResult,
  ValidatedAnalysis,
} from "./promptSafety";
import { withRateLimitRetry } from "./retry";
import type { ProductType } from "@shared/types";

export const AUTHORITATIVE_SEARCH_DOMAINS = [
  "fssai.gov.in",
  "*.fda.gov",
  "efsa.europa.eu",
  "ewg.org",
  "pubmed.ncbi.nlm.nih.gov",
];

export class CompoundResearchService {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = process.env.GROQ_COMPOUND_MODEL || "groq/compound-mini") {
    this.apiKey = apiKey;
    this.model = model;
  }

  /** Enabled by default when the Groq provider is active; COMPOUND_RESEARCH=false disables. */
  static isEnabled(): boolean {
    return process.env.COMPOUND_RESEARCH !== "false";
  }

  /**
   * One search-grounded analysis call. Throws on failure — callers fall back
   * to the standard (research + plain model) path.
   */
  async analyzeWithSearch(ingredientName: string, productType: ProductType): Promise<ValidatedAnalysis> {
    const safeName = sanitizeIngredientName(ingredientName);
    const isFood = productType === "food" || productType === "supplement";
    const prompt = isFood ? this.buildFoodPrompt(safeName) : this.buildCosmeticPrompt(safeName);

    const response = await withRateLimitRetry(() => this.request(prompt), "Groq Compound");

    const content: string | undefined = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response from Groq Compound");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in Compound response");

    const defaultDescription = `${ingredientName} is a ${isFood ? "food" : "cosmetic"} ingredient.\nSafety assessment indicates caution status.\nFurther research may be needed.`;
    return validateAnalysisResult(JSON.parse(jsonMatch[0]), ingredientName, defaultDescription);
  }

  private async request(prompt: string): Promise<any> {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
        search_settings: {
          include_domains: AUTHORITATIVE_SEARCH_DOMAINS,
          country: "india",
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const err: any = new Error(`Groq Compound API error ${res.status}`);
      err.status = res.status;
      try {
        err.error = await res.json();
      } catch { /* body unavailable */ }
      throw err;
    }
    return res.json();
  }

  private jsonContract(): string {
    return `Return ONLY a JSON object:
{
  "status": "safe" | "caution" | "banned",
  "rationale": "Evidence-based explanation citing what your search found, with the regulator and regulation named.",
  "description": "3 lines: what it is and its function; safety profile per regulators; common products it appears in (Indian examples preferred).",
  "edgeCases": "One line: allergies, intake limits, special populations, or regional restrictions.",
  "confidence": 0.0-1.0
}`;
  }

  private buildFoodPrompt(safeName: string): string {
    return `You are a food safety researcher for an Indian consumer-safety platform. FSSAI (Food Safety and Standards Authority of India) regulations are the primary authority; FDA/EFSA/WHO are supporting references. Search for current regulatory information about the ingredient before answering — prefer FSSAI sources.

${ingredientDataBlock(safeName)}

${this.jsonContract()}
Status rules: safe=FSSAI-permitted and FDA GRAS/EFSA approved without concerns; caution=ADI-limited, restricted, or adverse effects at realistic intakes; banned=prohibited by FSSAI/FDA/EFSA.
Base your answer on what your search retrieves; if search finds nothing relevant, say so in the rationale and lower your confidence.`;
  }

  private buildCosmeticPrompt(safeName: string): string {
    return `You are a cosmetic ingredient safety researcher for an Indian consumer-safety platform. Search for current safety information about the ingredient before answering — prefer EWG Skin Deep, FDA, and peer-reviewed sources.

${ingredientDataBlock(safeName)}

${this.jsonContract()}
Status rules: safe=low risk, well-studied (EWG 1-4); caution=mixed evidence or concentration-dependent concerns (EWG 5-7); banned=known health risks or regulatory restrictions (EWG 8-10).
Base your answer on what your search retrieves; if search finds nothing relevant, say so in the rationale and lower your confidence.`;
  }
}
