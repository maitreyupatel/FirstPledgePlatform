import { SafetyStatus } from "@shared/types";
import { EWGService, EWGIngredientData } from "./ewgService";
import { ResearchService, ResearchResult } from "./researchService";
import { IngredientAnalysisService } from "./ingredientAnalysisService";
import type { AIProvider } from "./aiProvider";
import { GeminiProvider } from "./providers/geminiProvider";
import { OpenAIProvider } from "./providers/openaiProvider";
import { GroqProvider } from "./providers/groqProvider";

export interface IngredientAnalysis {
  name: string;
  status: SafetyStatus;
  rationale: string;
  description: string; // 3-line description
  edgeCases: string; // One-liner edge cases
  sourceUrl: string;
  confidence: number;
  ewgScore?: number | null;
  researchSources?: ResearchResult[];
  suggestedMatches?: string[]; // For misspellings
}

export class AIVettingService {
  private aiProvider: AIProvider | null = null;
  private ewgService: EWGService;
  private researchService?: ResearchService;
  private analysisService?: IngredientAnalysisService;
  private providerType: string;

  constructor(
    providerType: "gemini" | "openai" | "groq" = "gemini",
    apiKey?: string,
    googleApiKey?: string,
    googleCxId?: string,
    useAnalysisStorage: boolean = true
  ) {
    this.providerType = providerType;
    
    // Initialize AI provider based on type
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
    if (googleApiKey && googleCxId) {
      this.researchService = new ResearchService(googleApiKey, googleCxId);
    }
    
    // Initialize ingredient analysis storage if enabled
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

  async analyzeIngredient(ingredientName: string): Promise<IngredientAnalysis> {
    // Step 0: Check permanent storage first
    if (this.analysisService) {
      const storedAnalysis = await this.analysisService.getAnalysis(ingredientName);
      if (storedAnalysis && !this.analysisService.shouldRefreshAnalysis(storedAnalysis)) {
        console.debug(`Using stored analysis for "${ingredientName}"`);
        return storedAnalysis;
      }
    }

    // Step 1: Check EWG first
    const ewgData = await this.ewgService.searchIngredient(ingredientName);
    
    // If EWG has a score, use it to determine status
    let status: SafetyStatus | null = null;
    if (ewgData.score !== null) {
      status = EWGService.getStatusFromScore(ewgData.score) || null;
    }

    // Step 2: Only search research sources if EWG data is unavailable (not found or no score)
    // This significantly reduces Google API calls - only used as fallback when EWG fails
    let researchSources: ResearchResult[] = [];
    const ewgDataUnavailable = !ewgData.found || ewgData.score === null;
    
    if (ewgDataUnavailable && this.researchService) {
      console.debug(`EWG data unavailable for "${ingredientName}", searching research sources...`);
      researchSources = await this.researchService.searchIngredient(ingredientName);
    } else if (ewgData.found && ewgData.score !== null) {
      console.debug(`EWG data available for "${ingredientName}" (score: ${ewgData.score}), skipping research search to save API quota.`);
    }

    // Step 3: Generate AI analysis (provider handles retries internally)
    let aiAnalysis: Partial<IngredientAnalysis> = {};
    if (this.aiProvider) {
      try {
        aiAnalysis = await this.aiProvider.analyzeIngredient(
          ingredientName,
          ewgData,
          researchSources
        );
      } catch (error) {
        console.error(`Error analyzing ingredient ${ingredientName} with ${this.providerType}:`, error);
      }
    }

    // Step 4: Combine EWG data with AI analysis
    // Prefer EWG status if available, otherwise use AI status
    const finalStatus = status || aiAnalysis.status || "caution";

    const result: IngredientAnalysis = {
      name: ingredientName,
      status: finalStatus,
      rationale: aiAnalysis.rationale || this.buildRationaleFromEWG(ewgData, finalStatus),
      description: aiAnalysis.description || this.buildDefaultDescription(ingredientName, finalStatus),
      edgeCases: aiAnalysis.edgeCases || this.buildDefaultEdgeCases(ingredientName, finalStatus),
      sourceUrl: ewgData.url,
      confidence: ewgData.found ? 0.9 : (aiAnalysis.confidence || 0.5),
      ewgScore: ewgData.score,
      researchSources: researchSources.length > 0 ? researchSources : undefined,
      suggestedMatches: ewgData.suggestedMatches,
    };

    // Step 5: Save analysis permanently to database
    if (this.analysisService) {
      try {
        await this.analysisService.upsertAnalysis(ingredientName, result);
        console.debug(`Saved analysis for "${ingredientName}" to permanent storage`);
      } catch (error) {
        console.error(`Failed to save analysis for "${ingredientName}":`, error);
        // Continue even if save fails
      }
    }

    return result;
  }

  /**
   * Analyze ingredient with retry logic for rate limits
   */
  private async analyzeWithRetry(
    ingredientName: string,
    ewgData: EWGIngredientData,
    researchSources: ResearchResult[]
  ): Promise<Partial<IngredientAnalysis>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const prompt = this.buildPrompt(ingredientName, ewgData, researchSources);
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        return this.parseAIResponse(ingredientName, text);
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a rate limit error (429)
        if (error.status === 429 || error.message?.includes("429")) {
          const retryAfter = this.extractRetryDelay(error) || this.retryDelay;
          console.warn(
            `Rate limit hit for ${ingredientName} (attempt ${attempt}/${this.maxRetries}). Retrying in ${retryAfter}ms...`
          );
          
          if (attempt < this.maxRetries) {
            await this.sleep(retryAfter);
            continue;
          }
        }
        
        // For other errors, don't retry
        throw error;
      }
    }

    // If all retries failed, throw the last error
    throw lastError || new Error("Failed to analyze ingredient");
  }

  /**
   * Extract retry delay from error response
   */
  private extractRetryDelay(error: any): number | null {
    try {
      if (error.errorDetails) {
        for (const detail of error.errorDetails) {
          if (detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo") {
            const retryDelay = detail.retryDelay;
            if (retryDelay) {
              // Convert "10s" to milliseconds
              const seconds = parseFloat(retryDelay.replace(/s$/, ""));
              return seconds * 1000;
            }
          }
        }
      }
    } catch (e) {
      // Ignore parsing errors
    }
    return null;
  }

  /**
   * Sleep utility for retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async analyzeIngredients(ingredientNames: string[]): Promise<IngredientAnalysis[]> {
    if (ingredientNames.length === 0) {
      return [];
    }

    // Process ingredients sequentially with delays to avoid rate limits
    // This helps prevent 429 errors by spacing out requests
    const analyses: IngredientAnalysis[] = [];
    const delayBetweenRequests = 2000; // 2 seconds between requests

    for (let i = 0; i < ingredientNames.length; i++) {
      const analysis = await this.analyzeIngredient(ingredientNames[i]);
      analyses.push(analysis);
      
      // Add delay between requests (except for the last one)
      if (i < ingredientNames.length - 1) {
        await this.sleep(delayBetweenRequests);
      }
    }

    return analyses;
  }

  private buildPrompt(
    ingredientName: string,
    ewgData: EWGIngredientData,
    researchSources: ResearchResult[]
  ): string {
    let ewgContext = "";
    if (ewgData.found && ewgData.score !== null) {
      ewgContext = `\nEWG Skin Deep Score: ${ewgData.score}/10 (Data Availability: ${ewgData.dataAvailability || "Unknown"})`;
      if (ewgData.concerns.length > 0) {
        ewgContext += `\nEWG Concerns: ${ewgData.concerns.join(", ")}`;
      }
    } else {
      ewgContext = "\nEWG Skin Deep: Not found or score unavailable";
      if (ewgData.suggestedMatches && ewgData.suggestedMatches.length > 0) {
        ewgContext += `\nSuggested similar ingredients: ${ewgData.suggestedMatches.join(", ")}`;
      }
    }

    let researchContext = "";
    if (researchSources.length > 0) {
      researchContext = "\nAdditional Research Sources Found:\n";
      researchSources.forEach(source => {
        researchContext += `- ${source.source.toUpperCase()}: ${source.title} (${source.url})\n`;
      });
    }

    return `You are a cosmetic ingredient safety researcher. Analyze the safety of this ingredient: "${ingredientName}"

${ewgContext}
${researchContext}

Provide your analysis in JSON format:
{
  "status": "safe" | "caution" | "banned",
  "rationale": "Detailed explanation based on scientific evidence. Be specific about why this ingredient received this rating. Include information about known health concerns, regulatory status, and scientific research findings.",
  "description": "A concise 3-line description of the ingredient. First line: What it is and its primary use. Second line: Safety profile and key characteristics. Third line: Common applications in cosmetics.",
  "edgeCases": "A one-line statement mentioning any edge cases, special considerations, or specific conditions where this ingredient should be used with extra caution (e.g., 'May cause irritation in sensitive skin' or 'Avoid during pregnancy' or 'None known').",
  "confidence": 0.0-1.0
}

Guidelines:
- "safe": Generally recognized as safe, low risk, well-studied with no major concerns (EWG score 1-4)
- "caution": Mixed evidence, potential concerns at high concentrations, needs careful consideration (EWG score 5-7)
- "banned": Known health risks, regulatory restrictions, or significant safety concerns (EWG score 8-10)

If EWG score is provided, use it as the primary basis for status determination:
- Score 1-4 → "safe"
- Score 5-7 → "caution"  
- Score 8-10 → "banned"

The description must be exactly 3 lines, each line being a complete sentence.
The edgeCases must be a single concise line.

Be specific and evidence-based. The rationale should be unique to this ingredient, not generic.`;
  }

  private parseAIResponse(ingredientName: string, text: string): Partial<IngredientAnalysis> {
    // Extract JSON from markdown code blocks if present
    let jsonText = text.trim();
    
    // Remove markdown code fences
    jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    
    // Try to find JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonText);
      
      // Validate and normalize status
      let status: SafetyStatus = "caution";
      if (parsed.status === "safe" || parsed.status === "caution" || parsed.status === "banned") {
        status = parsed.status;
      }

      // Ensure rationale exists and is meaningful
      let rationale = parsed.rationale || parsed.analysis || parsed.explanation || "";
      if (!rationale || rationale.length < 20) {
        rationale = `${ingredientName} requires further research. ${parsed.rationale || "Manual review recommended."}`;
      }

      // Parse description (should be 3 lines)
      let description = parsed.description || "";
      if (description) {
        // Ensure it's formatted as 3 lines
        const lines = description.split('\n').filter(line => line.trim()).slice(0, 3);
        if (lines.length < 3) {
          // Pad with default lines if needed
          while (lines.length < 3) {
            lines.push(`${ingredientName} is commonly used in cosmetic formulations.`);
          }
        }
        description = lines.join('\n');
      }

      // Parse edge cases (should be one line)
      let edgeCases = parsed.edgeCases || parsed.edgeCase || "";
      if (!edgeCases || edgeCases.trim().length === 0) {
        edgeCases = "No specific edge cases known. Use as directed.";
      }

      const confidence = typeof parsed.confidence === "number" 
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7;

      return {
        status,
        rationale: rationale.trim(),
        description: description.trim(),
        edgeCases: edgeCases.trim(),
        confidence
      };
    } catch (error) {
      console.error(`Failed to parse AI response for ${ingredientName}:`, error);
      console.error("Raw response:", text.substring(0, 500));
      return {};
    }
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
    if (status === "banned") {
      return "This ingredient should be avoided due to safety concerns.";
    }
    if (status === "caution") {
      return "Use with caution. May cause irritation in sensitive individuals.";
    }
    return "No specific edge cases known. Use as directed.";
  }
}

