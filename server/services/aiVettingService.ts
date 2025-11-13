// @ts-ignore - @google/genai types may not be available
import { GoogleGenerativeAI } from "@google/genai";
import { SafetyStatus } from "@shared/types";

export interface IngredientAnalysis {
  name: string;
  status: SafetyStatus;
  rationale: string;
  sourceUrl: string;
  confidence: number;
}

export class AIVettingService {
  private gemini: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }
    this.gemini = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.0-flash-exp or fallback to gemini-1.5-flash
    try {
      this.model = this.gemini.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    } catch {
      this.model = this.gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
    }
  }

  async analyzeIngredient(ingredientName: string): Promise<IngredientAnalysis> {
    const prompt = this.buildPrompt(ingredientName);
    
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return this.parseAIResponse(ingredientName, text);
    } catch (error) {
      console.error(`Error analyzing ingredient ${ingredientName}:`, error);
      return this.getFallbackAnalysis(ingredientName);
    }
  }

  async analyzeIngredients(ingredientNames: string[]): Promise<IngredientAnalysis[]> {
    if (ingredientNames.length === 0) {
      return [];
    }

    // For better results, analyze in batches or individually
    // Gemini can handle multiple ingredients in one call, but individual analysis is more reliable
    const analyses = await Promise.all(
      ingredientNames.map(name => this.analyzeIngredient(name))
    );

    return analyses;
  }

  private buildPrompt(ingredientName: string): string {
    return `You are a cosmetic ingredient safety researcher. Analyze the safety of this ingredient: "${ingredientName}"

Provide your analysis in JSON format:
{
  "status": "safe" | "caution" | "banned",
  "rationale": "Detailed explanation based on scientific evidence. Be specific about why this ingredient received this rating. Include information about known health concerns, regulatory status, and scientific research findings.",
  "ewgUrl": "Specific EWG Skin Deep URL if you know it, or use format: https://www.ewg.org/skindeep/search/?query=INGREDIENT_NAME",
  "confidence": 0.0-1.0
}

Guidelines:
- "safe": Generally recognized as safe, low risk, well-studied with no major concerns
- "caution": Mixed evidence, potential concerns at high concentrations, needs careful consideration
- "banned": Known health risks, regulatory restrictions, or significant safety concerns

Prioritize:
1. EWG Skin Deep database (ewg.org/skindeep) for citations
2. FDA regulations and restrictions
3. Scientific peer-reviewed research
4. Known health concerns and side effects

Be specific and evidence-based. The rationale should be unique to this ingredient, not generic.`;
  }

  private parseAIResponse(ingredientName: string, text: string): IngredientAnalysis {
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

      // Ensure URL exists
      let sourceUrl = parsed.ewgUrl || parsed.sourceUrl || parsed.url || "";
      if (!sourceUrl || !sourceUrl.startsWith("http")) {
        sourceUrl = `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`;
      }

      const confidence = typeof parsed.confidence === "number" 
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7;

      return {
        name: ingredientName,
        status,
        rationale: rationale.trim(),
        sourceUrl,
        confidence
      };
    } catch (error) {
      console.error(`Failed to parse AI response for ${ingredientName}:`, error);
      console.error("Raw response:", text.substring(0, 500));
      return this.getFallbackAnalysis(ingredientName);
    }
  }

  private getFallbackAnalysis(ingredientName: string): IngredientAnalysis {
    return {
      name: ingredientName,
      status: "caution",
      rationale: `${ingredientName} requires manual review. AI analysis was unavailable. Please research this ingredient using EWG Skin Deep and other reliable sources before publishing.`,
      sourceUrl: `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`,
      confidence: 0.0
    };
  }
}

