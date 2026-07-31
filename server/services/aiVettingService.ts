import { SafetyStatus, ProductType } from "@shared/types";
import { EWGService, EWGIngredientData } from "./ewgService";
import { ResearchService, ResearchResult } from "./researchService";
import { IngredientAnalysisService } from "./ingredientAnalysisService";
import { FoodSafetyService, FoodSafetyData } from "./foodSafetyService";
import type { AIProvider } from "./aiProvider";
import { GeminiProvider } from "./providers/geminiProvider";
import { OpenAIProvider } from "./providers/openaiProvider";
import { GroqProvider } from "./providers/groqProvider";
import { CompoundResearchService } from "./providers/compoundResearchService";

export interface IngredientAnalysis {
  name: string;
  status: SafetyStatus;
  rationale: string;
  description: string;
  edgeCases: string;
  sourceUrl: string;
  confidence: number;
  ewgScore?: number | null;
  productType?: ProductType;
  researchSources?: ResearchResult[];
  suggestedMatches?: string[];
}

export class AIVettingService {
  private aiProvider: AIProvider | null = null;
  private ewgService: EWGService;
  private foodSafetyService: FoodSafetyService;
  private researchService?: ResearchService;
  private analysisService?: IngredientAnalysisService;
  private compoundService?: CompoundResearchService;
  private providerType: string;

  constructor(
    providerType: "gemini" | "openai" | "groq" = "gemini",
    apiKey?: string,
    googleApiKey?: string,
    googleCxId?: string,
    useAnalysisStorage: boolean = true
  ) {
    this.providerType = providerType;

    if (apiKey) {
      try {
        switch (providerType) {
          case "gemini":
            this.aiProvider = new GeminiProvider(apiKey);
            break;
          case "openai":
            this.aiProvider = new OpenAIProvider(apiKey);
            break;
          case "groq":
            this.aiProvider = new GroqProvider(apiKey);
            break;
          default:
            console.warn(`Unknown provider type: ${providerType}, using Gemini`);
            if (apiKey) this.aiProvider = new GeminiProvider(apiKey);
        }
        console.log(`✅ AI Provider initialized: ${providerType}`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${providerType} provider:`, error);
      }
    } else {
      console.warn(`⚠️  No API key provided for ${providerType}. AI analysis disabled.`);
    }

    this.ewgService = new EWGService();

    // Search-grounded analysis + verification via Groq Compound (same key).
    // Used for ingredients unknown to EWG/the additive registry, and as a
    // second opinion on banned/low-confidence verdicts.
    if (providerType === "groq" && apiKey && CompoundResearchService.isEnabled()) {
      this.compoundService = new CompoundResearchService(apiKey);
      console.log("✅ Compound research enabled (search-grounded analysis, FSSAI-pinned)");
    }

    // When Compound handles research, keep FoodSafetyService registry-only —
    // its internal Google CSE fallback is redundant there and sits outside
    // the ResearchService quota tracker.
    this.foodSafetyService = this.compoundService
      ? new FoodSafetyService()
      : new FoodSafetyService(googleApiKey, googleCxId);

    if (googleApiKey && googleCxId) {
      this.researchService = new ResearchService(googleApiKey, googleCxId);
    }

    if (useAnalysisStorage) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceRoleKey) {
          console.warn("⚠️  Ingredient analysis storage disabled: Supabase credentials not configured");
        } else {
          const refreshDays = parseInt(process.env.INGREDIENT_REFRESH_DAYS || "30", 10);
          this.analysisService = new IngredientAnalysisService(refreshDays);
          console.log("✅ Ingredient analysis storage initialized");
        }
      } catch (error) {
        console.warn("⚠️  Failed to initialize ingredient analysis storage:", error);
      }
    }
  }

  // Coalesces concurrent analyses of the same (ingredient, productType) so
  // parallel requests share one AI call and one DB write instead of racing.
  private inFlight = new Map<string, Promise<IngredientAnalysis>>();

  private analysisKey(ingredientName: string, productType: ProductType): string {
    return `${ingredientName.toLowerCase().trim()}|${productType}`;
  }

  async analyzeIngredient(ingredientName: string, productType: ProductType = "cosmetic"): Promise<IngredientAnalysis> {
    // Step 0: Check permanent storage (cache key is ingredient_name + product_type)
    if (this.analysisService) {
      const storedAnalysis = await this.analysisService.getAnalysis(ingredientName, productType);
      if (storedAnalysis && !this.analysisService.shouldRefreshAnalysis(storedAnalysis)) {
        console.debug(`Using stored analysis for "${ingredientName}" (${productType})`);
        return storedAnalysis;
      }
    }

    return this.analyzeFresh(ingredientName, productType);
  }

  /**
   * Run a fresh (non-cached) analysis. Identical concurrent calls are
   * deduplicated: the second caller awaits the first caller's promise.
   */
  private analyzeFresh(ingredientName: string, productType: ProductType): Promise<IngredientAnalysis> {
    const key = this.analysisKey(ingredientName, productType);
    const pending = this.inFlight.get(key);
    if (pending) {
      console.debug(`Coalescing concurrent analysis for "${ingredientName}" (${productType})`);
      return pending;
    }

    const isFoodContext = productType === "food" || productType === "supplement";

    if (productType === "unknown") {
      console.warn(`[aiVettingService] product_type="unknown" for "${ingredientName}" — falling back to cosmetic pipeline. Consider re-classifying this product.`);
    }

    const promise = (isFoodContext
      ? this.analyzeFoodIngredient(ingredientName, productType)
      : this.analyzeCosmeticIngredient(ingredientName, productType)
    ).finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, promise);
    return promise;
  }

  // Food / supplement pipeline: FoodSafetyService → food-targeted research → AI with food prompt
  private async analyzeFoodIngredient(ingredientName: string, productType: ProductType): Promise<IngredientAnalysis> {
    // Step 1: E-number/INS lookup or regulatory database search
    const foodData = await this.foodSafetyService.lookupFoodIngredient(ingredientName);

    // Grounded path: no authoritative registry status → one search-grounded
    // Compound call (FSSAI-pinned) replaces the research + blind-AI two-step.
    // Falls through to the standard path on any failure. Gated on the STATUS,
    // not just `found` — a research hit without a status is context, not
    // authority.
    if (!foodData.status && this.compoundService) {
      try {
        const grounded = await this.compoundService.analyzeWithSearch(ingredientName, productType);
        let result: IngredientAnalysis = {
          name: ingredientName,
          status: grounded.status,
          rationale: grounded.rationale,
          description: grounded.description,
          edgeCases: grounded.edgeCases,
          sourceUrl: `https://fdc.nal.usda.gov/food-search?query=${encodeURIComponent(ingredientName)}`,
          confidence: grounded.confidence,
          ewgScore: null,
          productType,
        };
        // Grounded verdicts still pass the banned/low-confidence gate — one
        // more independent sample before anything alarming can publish.
        result = await this.applyVerification(result);
        await this.cacheResult(ingredientName, productType, result);
        return result;
      } catch (error) {
        console.warn(`Compound research failed for "${ingredientName}" — using standard path:`, error instanceof Error ? error.message : error);
      }
    }

    // Step 2: Research fallback (FSSAI/FDA/PubMed targeted) — only if food service found nothing
    let researchSources: ResearchResult[] = [];
    if (!foodData.found && this.researchService) {
      console.debug(`Food safety data unavailable for "${ingredientName}", searching regulatory sources...`);
      researchSources = await this.researchService.searchIngredient(ingredientName, "food");
    }

    // Ground additive chemistry: when the registry identified this additive
    // (e.g. INS 296 = Malic Acid), pass the verified identity into the AI
    // prompt as an authoritative source so the model never guesses what an
    // INS/E-number is. (Evidence: ungrounded models misidentify INS numbers.)
    if (foodData.found && foodData.name) {
      researchSources = [
        {
          source: "fda",
          url: foodData.url,
          title: `VERIFIED ADDITIVE IDENTITY: "${ingredientName}" is ${foodData.name}. Do not reinterpret this identity.`,
          snippet: foodData.regulatoryNotes || "",
          relevance: 1,
        },
        ...researchSources,
      ];
    }

    // Step 3: AI analysis with food-specific prompt
    let aiAnalysis: Partial<IngredientAnalysis> = {};
    if (this.aiProvider) {
      try {
        aiAnalysis = await this.aiProvider.analyzeIngredient(
          ingredientName,
          { found: false, score: null, concerns: [] }, // EWG data not relevant for food
          researchSources,
          productType
        );
      } catch (error) {
        console.error(`Error analyzing food ingredient ${ingredientName}:`, error);
      }
    }

    // Step 4: Combine results — E-number/regulatory data takes precedence over AI status
    const finalStatus: SafetyStatus = foodData.status || aiAnalysis.status || "caution";
    const sourceUrl = foodData.url || `https://fdc.nal.usda.gov/food-search?query=${encodeURIComponent(ingredientName)}`;

    let result: IngredientAnalysis = {
      name: ingredientName,
      status: finalStatus,
      rationale: aiAnalysis.rationale || this.buildFoodRationale(ingredientName, foodData, finalStatus),
      description: aiAnalysis.description || this.buildFoodDescription(ingredientName, finalStatus),
      edgeCases: aiAnalysis.edgeCases || (foodData.concerns.length > 0 ? foodData.concerns.join("; ") : "No specific concerns at normal dietary levels."),
      sourceUrl,
      // 0.85 only for an authoritative registry status; a research hit
      // without a status must not inflate a blind AI verdict past the
      // publish (0.7) and verification (0.6) gates.
      confidence: foodData.status ? 0.85 : (aiAnalysis.confidence || 0.5),
      ewgScore: null, // EWG score is not applicable for food ingredients
      productType,
      researchSources: researchSources.length > 0 ? researchSources : undefined,
    };

    // Verification gate applies only to AI-derived verdicts (registry status
    // is authoritative and skips it)
    if (!foodData.status) {
      result = await this.applyVerification(result);
    }

    // Step 5: Cache result with (ingredient_name, product_type) composite key
    await this.cacheResult(ingredientName, productType, result);
    return result;
  }

  // Cosmetic / personal_care / unknown pipeline: EWG → research → AI with cosmetic prompt
  private async analyzeCosmeticIngredient(ingredientName: string, productType: ProductType): Promise<IngredientAnalysis> {
    // Step 1: EWG Skin Deep
    const ewgData = await this.ewgService.searchIngredient(ingredientName);

    let status: SafetyStatus | null = null;
    if (ewgData.score !== null) {
      status = EWGService.getStatusFromScore(ewgData.score) || null;
    }

    const ewgDataUnavailable = !ewgData.found || ewgData.score === null;

    // Grounded path: unknown to EWG → one search-grounded Compound call
    // replaces the research + blind-AI two-step. Falls through on failure.
    if (ewgDataUnavailable && this.compoundService) {
      try {
        const grounded = await this.compoundService.analyzeWithSearch(ingredientName, productType);
        let result: IngredientAnalysis = {
          name: ingredientName,
          status: grounded.status,
          rationale: grounded.rationale,
          description: grounded.description,
          edgeCases: grounded.edgeCases,
          sourceUrl: ewgData.url,
          confidence: grounded.confidence,
          ewgScore: ewgData.score,
          productType,
          suggestedMatches: ewgData.suggestedMatches,
        };
        // Grounded verdicts still pass the banned/low-confidence gate
        result = await this.applyVerification(result);
        await this.cacheResult(ingredientName, productType, result);
        return result;
      } catch (error) {
        console.warn(`Compound research failed for "${ingredientName}" — using standard path:`, error instanceof Error ? error.message : error);
      }
    }

    // Step 2: Research fallback — only when EWG has no data
    let researchSources: ResearchResult[] = [];

    if (ewgDataUnavailable && this.researchService) {
      console.debug(`EWG data unavailable for "${ingredientName}", searching research sources...`);
      researchSources = await this.researchService.searchIngredient(ingredientName);
    } else if (ewgData.found && ewgData.score !== null) {
      console.debug(`EWG data available for "${ingredientName}" (score: ${ewgData.score}), skipping research to save API quota.`);
    }

    // Step 3: AI analysis with cosmetic prompt
    let aiAnalysis: Partial<IngredientAnalysis> = {};
    if (this.aiProvider) {
      try {
        aiAnalysis = await this.aiProvider.analyzeIngredient(
          ingredientName,
          ewgData,
          researchSources,
          productType
        );
      } catch (error) {
        console.error(`Error analyzing cosmetic ingredient ${ingredientName} with ${this.providerType}:`, error);
      }
    }

    // Step 4: Prefer EWG status if available
    const finalStatus: SafetyStatus = status || aiAnalysis.status || "caution";

    let result: IngredientAnalysis = {
      name: ingredientName,
      status: finalStatus,
      rationale: aiAnalysis.rationale || this.buildRationaleFromEWG(ewgData, finalStatus),
      description: aiAnalysis.description || this.buildDefaultDescription(ingredientName, finalStatus),
      edgeCases: aiAnalysis.edgeCases || this.buildDefaultEdgeCases(ingredientName, finalStatus),
      sourceUrl: ewgData.url,
      confidence: ewgData.found ? 0.9 : (aiAnalysis.confidence || 0.5),
      ewgScore: ewgData.score,
      productType,
      researchSources: researchSources.length > 0 ? researchSources : undefined,
      suggestedMatches: ewgData.suggestedMatches,
    };

    // Verification gate applies only to AI-derived verdicts (an EWG-derived
    // status is authoritative and skips it)
    if (!status) {
      result = await this.applyVerification(result);
    }

    // Step 5: Cache result
    await this.cacheResult(ingredientName, productType, result);
    return result;
  }

  /**
   * Batch path: enrich each uncached ingredient with local authoritative data
   * (additive registry for food, EWG for cosmetic), analyze all of them in one
   * provider call, apply the same status-precedence and verification rules as
   * the sequential path, cache, and return a map keyed by normalized name.
   * Throws on any failure — the caller falls back to sequential analysis.
   */
  private async analyzeUncachedBatch(names: string[], productType: ProductType): Promise<Map<string, IngredientAnalysis>> {
    const provider = this.aiProvider;
    if (!(provider instanceof GroqProvider)) throw new Error("Batch analysis requires the Groq provider");
    const isFood = productType === "food" || productType === "supplement";

    const items: Array<{ name: string; context?: string; foodData?: FoodSafetyData; ewgData?: EWGIngredientData }> = [];
    for (const name of names) {
      if (isFood) {
        const foodData = await this.foodSafetyService.lookupFoodIngredient(name);
        items.push({
          name,
          foodData,
          context: foodData.found && foodData.name
            ? `Verified additive identity: ${foodData.name}. ${foodData.regulatoryNotes ?? ""}`
            : undefined,
        });
      } else {
        const ewgData = await this.ewgService.searchIngredient(name);
        items.push({
          name,
          ewgData,
          context: ewgData.found && ewgData.score !== null ? `EWG Skin Deep score: ${ewgData.score}/10` : undefined,
        });
      }
    }

    const analyses = await provider.analyzeIngredientsBatch(
      items.map(({ name, context }) => ({ name, context })),
      productType
    );

    const map = new Map<string, IngredientAnalysis>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const a = analyses[i];
      const authoritativeStatus: SafetyStatus | null = isFood
        ? item.foodData?.status ?? null
        : item.ewgData && item.ewgData.score !== null
          ? EWGService.getStatusFromScore(item.ewgData.score) || null
          : null;

      let result: IngredientAnalysis = {
        name: item.name,
        status: authoritativeStatus || a.status,
        rationale: a.rationale,
        description: a.description,
        edgeCases: a.edgeCases,
        sourceUrl: isFood
          ? item.foodData?.url || `https://fdc.nal.usda.gov/food-search?query=${encodeURIComponent(item.name)}`
          : item.ewgData?.url ?? "",
        confidence: authoritativeStatus ? 0.85 : a.confidence,
        ewgScore: isFood ? null : item.ewgData?.score ?? null,
        productType,
      };

      if (!authoritativeStatus) {
        result = await this.applyVerification(result);
      }
      await this.cacheResult(item.name, productType, result);

      const key = this.analysisService
        ? this.analysisService.normalizeIngredientName(item.name)
        : item.name.toLowerCase().trim();
      map.set(key, result);
    }
    return map;
  }

  /** Persist an analysis to the shared cache; failures are logged, not fatal. */
  private async cacheResult(ingredientName: string, productType: ProductType, result: IngredientAnalysis): Promise<void> {
    if (!this.analysisService) return;
    try {
      await this.analysisService.upsertAnalysis(ingredientName, productType, result);
      console.debug(`Saved analysis for "${ingredientName}" (${productType})`);
    } catch (error) {
      console.error(`Failed to save analysis for "${ingredientName}":`, error);
    }
  }

  /**
   * Second-opinion gate: fresh AI-derived verdicts that are "banned" or
   * low-confidence get one independent search-grounded review before they
   * can be cached or published. Agreement raises confidence; disagreement
   * takes the more severe status, caps confidence below the publish gate,
   * and flags the ingredient for manual review.
   */
  private async applyVerification(result: IngredientAnalysis): Promise<IngredientAnalysis> {
    if (!this.compoundService) return result;
    if (result.status !== "banned" && result.confidence >= 0.6) return result;

    try {
      const second = await this.compoundService.analyzeWithSearch(result.name, result.productType ?? "cosmetic");

      if (second.status === result.status) {
        return { ...result, confidence: Math.max(result.confidence, Math.min(second.confidence, 0.9)) };
      }

      const severity: Record<SafetyStatus, number> = { safe: 0, caution: 1, banned: 2 };
      const conservative = severity[second.status] > severity[result.status] ? second.status : result.status;
      console.warn(`Verification disagreement for "${result.name}": primary=${result.status}, grounded=${second.status} → keeping "${conservative}"`);
      return {
        ...result,
        status: conservative,
        confidence: Math.min(result.confidence, second.confidence, 0.5),
        edgeCases: `${result.edgeCases} [Independent search-grounded review returned "${second.status}" — flagged for manual review.]`.trim(),
      };
    } catch (error) {
      console.warn(`Verification pass failed for "${result.name}" — keeping primary verdict:`, error instanceof Error ? error.message : error);
      return result;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Delay between fresh AI calls. Groq's free tier is bound by tokens/minute
  // (8K TPM for gpt-oss-120b), not just requests/minute: at ~1.3K tokens per
  // analysis, sustained throughput is ~5 calls/min. The 2s default relies on
  // the bounded 429 retry to absorb bursts; set AI_CALL_DELAY_MS=10000 for
  // long bulk runs that must stay under the free-tier TPM ceiling.
  private readonly callDelayMs = (() => {
    const configured = parseInt(process.env.AI_CALL_DELAY_MS ?? "2000", 10);
    return Number.isFinite(configured) && configured >= 0 ? configured : 2000;
  })();

  /**
   * Analyze a list of ingredients. `opts.deadlineAt` (epoch ms) makes the run
   * deadline-aware for serverless callers: before STARTING each fresh
   * analysis, if fewer than 15s remain the whole call throws — the caller
   * skips the product cleanly instead of being killed mid-write by the
   * platform. Already-analyzed ingredients stay cached, so a retried product
   * resumes further along each day (self-healing).
   */
  async analyzeIngredients(
    ingredientNames: string[],
    productType: ProductType = "cosmetic",
    opts: { deadlineAt?: number } = {}
  ): Promise<IngredientAnalysis[]> {
    if (ingredientNames.length === 0) return [];
    const deadlineExceeded = () =>
      opts.deadlineAt !== undefined && Date.now() > opts.deadlineAt - 15_000;

    // One batched cache lookup for the entire list. Previously this was two
    // queries PER ingredient (one here, one inside analyzeIngredient) — a
    // 20-ingredient product cost 40 round-trips before any AI call.
    let cached = new Map<string, IngredientAnalysis>();
    if (this.analysisService) {
      try {
        cached = await this.analysisService.getAnalysesBatch(ingredientNames, productType);
      } catch (error) {
        console.warn("Batch cache lookup failed — falling back to fresh analysis:", error);
      }
    }

    // Experimental single-call batching (BATCH_ANALYSIS=true): analyze all
    // uncached ingredients in ONE model call, removing per-ingredient pacing
    // delays. Falls back to the sequential loop on any failure.
    if (process.env.BATCH_ANALYSIS === "true" && this.aiProvider instanceof GroqProvider) {
      const keyOf = (n: string) =>
        this.analysisService ? this.analysisService.normalizeIngredientName(n) : n.toLowerCase().trim();
      const seen = new Set<string>();
      const uncachedNames = ingredientNames.filter((n) => {
        const k = keyOf(n);
        if (seen.has(k)) return false;
        seen.add(k);
        const hit = cached.get(k);
        return !(hit && (!this.analysisService || !this.analysisService.shouldRefreshAnalysis(hit)));
      });

      if (uncachedNames.length >= 4 && uncachedNames.length <= 12 && !deadlineExceeded()) {
        try {
          const fresh = await this.analyzeUncachedBatch(uncachedNames, productType);
          fresh.forEach((analysis, key) => cached.set(key, analysis));
          console.log(`✅ Batch-analyzed ${fresh.size} ingredients in one call`);
        } catch (error) {
          console.warn("Batch analysis failed — falling back to sequential:", error instanceof Error ? error.message : error);
        }
      }
    }

    const analyses: IngredientAnalysis[] = [];

    for (let i = 0; i < ingredientNames.length; i++) {
      const name = ingredientNames[i];
      const cacheKey = this.analysisService
        ? this.analysisService.normalizeIngredientName(name)
        : name.toLowerCase().trim();

      const hit = cached.get(cacheKey);
      const isCacheHit = !!(hit && (!this.analysisService || !this.analysisService.shouldRefreshAnalysis(hit)));

      let analysis: IngredientAnalysis;
      if (isCacheHit) {
        analysis = hit!;
      } else {
        if (deadlineExceeded()) {
          throw new Error(`Analysis deadline exceeded after ${analyses.length}/${ingredientNames.length} ingredients — retry will resume from cache`);
        }
        analysis = await this.analyzeFresh(name, productType);
        // Duplicate names later in the list reuse this result instead of
        // paying for a second AI call.
        cached.set(cacheKey, analysis);
      }
      analyses.push(analysis);

      // Pace fresh API calls for the provider's rate limits (see callDelayMs).
      // Cache hits are instant and don't consume rate-limit quota.
      const isLast = i === ingredientNames.length - 1;
      if (!isCacheHit && !isLast) {
        await this.sleep(this.callDelayMs);
      }
    }

    return analyses;
  }

  private buildFoodRationale(ingredientName: string, foodData: any, status: SafetyStatus): string {
    if (foodData.found && foodData.regulatoryNotes) {
      return `${ingredientName} — ${foodData.regulatoryNotes}${foodData.concerns.length > 0 ? ` Concerns: ${foodData.concerns.join("; ")}.` : ""}`;
    }
    return `${ingredientName} food safety assessment based on available regulatory data. Status: ${status}. Manual review with FDA/EFSA databases recommended for complete assessment.`;
  }

  private buildFoodDescription(ingredientName: string, status: SafetyStatus): string {
    return `${ingredientName} is a food ingredient used in processed and packaged food products.\nFood safety assessment indicates ${status} status based on FDA/EFSA regulatory data.\nConsult current regulatory guidelines for specific use limits and applications.`;
  }

  private buildRationaleFromEWG(ewgData: EWGIngredientData, status: SafetyStatus): string {
    if (ewgData.found && ewgData.score !== null) {
      return `EWG Skin Deep score: ${ewgData.score}/10. ${ewgData.dataAvailability ? `Data availability: ${ewgData.dataAvailability}.` : ""} ${ewgData.concerns.length > 0 ? `Concerns: ${ewgData.concerns.join(", ")}.` : ""}`;
    }
    return `${ewgData.name} requires manual review. EWG Skin Deep data was unavailable. Please research this ingredient using EWG Skin Deep and other reliable sources before publishing.`;
  }

  private buildDefaultDescription(ingredientName: string, status: SafetyStatus): string {
    return `${ingredientName} is a cosmetic ingredient used in various formulations.\nSafety assessment indicates ${status} status based on available data.\nFurther research may be needed to fully understand its safety profile.`;
  }

  private buildDefaultEdgeCases(ingredientName: string, status: SafetyStatus): string {
    if (status === "banned") return "This ingredient should be avoided due to safety concerns.";
    if (status === "caution") return "Use with caution. May cause irritation in sensitive individuals.";
    return "No specific edge cases known. Use as directed.";
  }
}
