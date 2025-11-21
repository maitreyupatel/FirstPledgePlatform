import { createClient } from "@supabase/supabase-js";
import type { IngredientAnalysis } from "./aiVettingService";

interface StoredAnalysis {
  id: string;
  ingredient_name: string;
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

  /**
   * Normalize ingredient name for consistent lookups
   */
  normalizeIngredientName(name: string): string {
    return name.toLowerCase().trim();
  }

  /**
   * Get existing analysis from permanent database storage
   */
  async getAnalysis(ingredientName: string): Promise<IngredientAnalysis | null> {
    const normalizedName = this.normalizeIngredientName(ingredientName);

    const { data, error } = await this.supabase
      .from("ingredient_analyses")
      .select("*")
      .eq("ingredient_name", normalizedName)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapRowToAnalysis(data);
  }

  /**
   * Check if analysis needs refresh
   */
  shouldRefreshAnalysis(analysis: IngredientAnalysis | null): boolean {
    if (!analysis) {
      return true;
    }

    // Check if analysis is older than refresh window
    const lastAnalyzed = new Date((analysis as any).lastAnalyzedAt || (analysis as any).updatedAt);
    const daysSinceAnalysis = (Date.now() - lastAnalyzed.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceAnalysis > this.refreshDays;
  }

  /**
   * Save new analysis permanently
   */
  async saveAnalysis(
    ingredientName: string,
    analysis: IngredientAnalysis,
  ): Promise<void> {
    const normalizedName = this.normalizeIngredientName(ingredientName);
    const now = new Date().toISOString();

    const { error } = await this.supabase
      .from("ingredient_analyses")
      .insert({
        ingredient_name: normalizedName,
        status: analysis.status,
        rationale: analysis.rationale,
        description: analysis.description,
        edge_cases: analysis.edgeCases,
        source_url: analysis.sourceUrl,
        ewg_score: analysis.ewgScore ?? null,
        ewg_data_availability: null, // Can be added if needed
        research_sources: analysis.researchSources || null,
        suggested_matches: analysis.suggestedMatches ?? null,
        confidence: analysis.confidence,
        analysis_version: 1,
        last_analyzed_at: now,
      });

    if (error) {
      console.error(`Error saving analysis for ${ingredientName}:`, error);
      throw new Error(`Failed to save analysis: ${error.message}`);
    }
  }

  /**
   * Update existing analysis (increment version, preserve history)
   */
  async updateAnalysis(
    ingredientName: string,
    analysis: IngredientAnalysis,
  ): Promise<void> {
    const normalizedName = this.normalizeIngredientName(ingredientName);
    const now = new Date().toISOString();

    // Get current version
    const { data: existing } = await this.supabase
      .from("ingredient_analyses")
      .select("analysis_version")
      .eq("ingredient_name", normalizedName)
      .single();

    const newVersion = existing ? existing.analysis_version + 1 : 1;

    const { error } = await this.supabase
      .from("ingredient_analyses")
      .update({
        status: analysis.status,
        rationale: analysis.rationale,
        description: analysis.description,
        edge_cases: analysis.edgeCases,
        source_url: analysis.sourceUrl,
        ewg_score: analysis.ewgScore ?? null,
        ewg_data_availability: null,
        research_sources: analysis.researchSources || null,
        suggested_matches: analysis.suggestedMatches ?? null,
        confidence: analysis.confidence,
        analysis_version: newVersion,
        last_analyzed_at: now,
        // updated_at is set automatically by trigger
      })
      .eq("ingredient_name", normalizedName);

    if (error) {
      console.error(`Error updating analysis for ${ingredientName}:`, error);
      throw new Error(`Failed to update analysis: ${error.message}`);
    }
  }

  /**
   * Upsert analysis (save if new, update if exists)
   */
  async upsertAnalysis(
    ingredientName: string,
    analysis: IngredientAnalysis,
  ): Promise<void> {
    const existing = await this.getAnalysis(ingredientName);
    
    if (existing) {
      await this.updateAnalysis(ingredientName, analysis);
    } else {
      await this.saveAnalysis(ingredientName, analysis);
    }
  }

  /**
   * Map database row to IngredientAnalysis
   */
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
      researchSources: row.research_sources || undefined,
      suggestedMatches: row.suggested_matches ?? undefined,
      // Include metadata for refresh checking
      lastAnalyzedAt: row.last_analyzed_at,
      updatedAt: row.updated_at,
    } as IngredientAnalysis & { lastAnalyzedAt?: string; updatedAt?: string };
  }
}

