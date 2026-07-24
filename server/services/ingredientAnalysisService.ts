import { createClient } from "@supabase/supabase-js";
import type { IngredientAnalysis } from "./aiVettingService";
import type { ProductType } from "@shared/types";

interface StoredAnalysis {
  id: string;
  ingredient_name: string;
  product_type: string;
  status: "safe" | "caution" | "banned";
  rationale: string;
  description: string;
  edge_cases: string;
  source_url: string;
  ewg_score: number | null;
  ewg_data_availability: string | null;
  research_sources: any | null;
  suggested_matches: string[] | null;
  confidence: number;
  analysis_version: number;
  created_at: string;
  updated_at: string;
  last_analyzed_at: string;
}

export class IngredientAnalysisService {
  private supabase;
  private refreshDays: number;

  constructor(refreshDays: number = 30) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase URL and Service Role Key must be set in environment variables");
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    this.refreshDays = refreshDays;
  }

  normalizeIngredientName(name: string): string {
    return name.toLowerCase().trim();
  }

  /**
   * Clamp EWG score to its documented 1-10 scale. Anything else (including 0,
   * negatives, > 10, NaN) is stored as null rather than pretending a garbage
   * value is a real score.
   */
  static clampEwgScore(score: unknown): number | null {
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    const rounded = Math.round(score);
    if (rounded < 1 || rounded > 10) return null;
    return rounded;
  }

  /** Clamp confidence to [0, 1]; non-numeric input degrades to 0.5. */
  static clampConfidence(confidence: unknown): number {
    if (typeof confidence !== "number" || !Number.isFinite(confidence)) return 0.5;
    return Math.min(1, Math.max(0, confidence));
  }

  async getAnalysis(ingredientName: string, productType: ProductType = "cosmetic"): Promise<IngredientAnalysis | null> {
    const normalizedName = this.normalizeIngredientName(ingredientName);

    const { data, error } = await this.supabase
      .from("ingredient_analyses")
      .select("*")
      .eq("ingredient_name", normalizedName)
      .eq("product_type", productType)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapRowToAnalysis(data);
  }

  /**
   * Fetch cached analyses for a whole ingredient list in ONE query instead of
   * one round-trip per ingredient. Returns a map keyed by normalized name.
   * Fails open (empty map) so a lookup error degrades to fresh analysis.
   */
  async getAnalysesBatch(
    ingredientNames: string[],
    productType: ProductType = "cosmetic",
  ): Promise<Map<string, IngredientAnalysis>> {
    const result = new Map<string, IngredientAnalysis>();
    const normalizedNames = Array.from(
      new Set(ingredientNames.map((n) => this.normalizeIngredientName(n)).filter(Boolean)),
    );
    if (normalizedNames.length === 0) return result;

    const { data, error } = await this.supabase
      .from("ingredient_analyses")
      .select("*")
      .in("ingredient_name", normalizedNames)
      .eq("product_type", productType);

    if (error || !data) {
      if (error) console.error("Batch analysis lookup failed:", error.message);
      return result;
    }

    for (const row of data as StoredAnalysis[]) {
      result.set(row.ingredient_name, this.mapRowToAnalysis(row));
    }
    return result;
  }

  shouldRefreshAnalysis(analysis: IngredientAnalysis | null): boolean {
    if (!analysis) return true;

    const timestamp = (analysis as any).lastAnalyzedAt || (analysis as any).updatedAt;
    // No timestamp means the analysis was computed in-memory this request —
    // it is fresh by definition.
    if (!timestamp) return false;

    const lastAnalyzed = new Date(timestamp);
    if (Number.isNaN(lastAnalyzed.getTime())) return true;

    const daysSinceAnalysis = (Date.now() - lastAnalyzed.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceAnalysis > this.refreshDays;
  }

  /** Build the DB row shared by all write paths, with bounds enforced. */
  private buildAnalysisRow(analysis: IngredientAnalysis) {
    return {
      status: analysis.status,
      rationale: analysis.rationale,
      description: analysis.description,
      edge_cases: analysis.edgeCases,
      source_url: analysis.sourceUrl,
      ewg_score: IngredientAnalysisService.clampEwgScore(analysis.ewgScore),
      ewg_data_availability: null,
      research_sources: analysis.researchSources || null,
      suggested_matches: analysis.suggestedMatches ?? null,
      confidence: IngredientAnalysisService.clampConfidence(analysis.confidence),
      last_analyzed_at: new Date().toISOString(),
    };
  }

  /**
   * Atomic write keyed on the (ingredient_name, product_type) unique
   * constraint. Replaces the previous get-then-insert/update sequence, which
   * raced under concurrent analyses of the same ingredient (duplicate-key
   * errors or lost writes on serverless).
   */
  async upsertAnalysis(
    ingredientName: string,
    productType: ProductType,
    analysis: IngredientAnalysis,
  ): Promise<void> {
    const normalizedName = this.normalizeIngredientName(ingredientName);

    // Best-effort version increment; concurrent writers may compute the same
    // version, which is acceptable — the upsert itself is atomic.
    const { data: existing } = await this.supabase
      .from("ingredient_analyses")
      .select("analysis_version")
      .eq("ingredient_name", normalizedName)
      .eq("product_type", productType)
      .maybeSingle();

    const { error } = await this.supabase
      .from("ingredient_analyses")
      .upsert(
        {
          ingredient_name: normalizedName,
          product_type: productType,
          analysis_version: existing ? existing.analysis_version + 1 : 1,
          ...this.buildAnalysisRow(analysis),
        },
        { onConflict: "ingredient_name,product_type" },
      );

    if (error) {
      console.error(`Error upserting analysis for ${ingredientName} (${productType}):`, error);
      throw new Error(`Failed to upsert analysis: ${error.message}`);
    }
  }

  private mapRowToAnalysis(row: StoredAnalysis): IngredientAnalysis {
    return {
      name: row.ingredient_name,
      status: row.status,
      rationale: row.rationale,
      description: row.description,
      edgeCases: row.edge_cases,
      sourceUrl: row.source_url,
      confidence: row.confidence,
      ewgScore: row.ewg_score,
      productType: row.product_type as ProductType,
      researchSources: row.research_sources || undefined,
      suggestedMatches: row.suggested_matches ?? undefined,
      lastAnalyzedAt: row.last_analyzed_at,
      updatedAt: row.updated_at,
    } as IngredientAnalysis & { lastAnalyzedAt?: string; updatedAt?: string };
  }
}
