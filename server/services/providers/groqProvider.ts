/**
 * Groq Provider
 * Uses Groq API - Very fast, generous free tier (14,400 requests/day)
 * Models: llama-3.3-70b-versatile (current), llama-3.1-8b-instant, mixtral-8x7b-32768
 */

import Groq from "groq-sdk";
import type { AIProvider } from "../aiProvider";

export class GroqProvider implements AIProvider {
  private client: Groq;
  private model: string;
  private fallbackModels: string[] = [
    "llama-3.3-70b-versatile",  // Latest version
    "llama-3.1-8b-instant",     // Fast alternative
    "mixtral-8x7b-32768"         // Mixtral model
  ];

  constructor(apiKey: string, model: string = "llama-3.3-70b-versatile") {
    this.client = new Groq({ apiKey });
    this.model = model;
  }

  async analyzeIngredient(
    ingredientName: string,
    ewgData: any,
    researchSources: any[]
  ): Promise<{
    status: "safe" | "caution" | "banned";
    rationale: string;
    description: string;
    edgeCases: string;
    confidence: number;
  }> {
    const prompt = this.buildPrompt(ingredientName, ewgData, researchSources);
    
    // Try current model first, then fallback models if decommissioned
    const modelsToTry = [this.model, ...this.fallbackModels.filter(m => m !== this.model)];
    
    for (const modelToUse of modelsToTry) {
      try {
        const response = await this.client.chat.completions.create({
          model: modelToUse,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.3,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("No response from Groq");

        // Update model if we used a fallback
        if (modelToUse !== this.model) {
          console.log(`✅ Switched to model: ${modelToUse} (${this.model} was decommissioned)`);
          this.model = modelToUse;
        }

        return this.parseResponse(content, ingredientName);
      } catch (error: any) {
        // Check if model is decommissioned (error structure may vary)
        const isDecommissioned = 
          (error.status === 400 && error.error?.code === "model_decommissioned") ||
          (error.status === 400 && error.error?.error?.code === "model_decommissioned") ||
          (error.message?.includes("decommissioned") || error.message?.includes("no longer supported"));
        
        if (isDecommissioned) {
          console.warn(`⚠️  Model ${modelToUse} is decommissioned, trying next model...`);
          // Continue to next model if not the last one
          if (modelToUse !== modelsToTry[modelsToTry.length - 1]) {
            continue;
          }
        }
        
        // If rate limit, retry with same model
        if (error.status === 429) {
          await this.sleep(1000);
          return this.analyzeIngredient(ingredientName, ewgData, researchSources);
        }
        
        // If this was the last model, throw the error
        if (modelToUse === modelsToTry[modelsToTry.length - 1]) {
          throw error;
        }
        
        // For other errors on non-last model, try next
        if (modelToUse !== modelsToTry[modelsToTry.length - 1]) {
          continue;
        }
      }
    }
    
    throw new Error("All Groq models failed");
  }

  private buildPrompt(ingredientName: string, ewgData: any, researchSources: any[]): string {
    let ewgContext = "";
    if (ewgData.found && ewgData.score !== null) {
      ewgContext = `\nEWG Skin Deep Score: ${ewgData.score}/10 (Data Availability: ${ewgData.dataAvailability || "Unknown"})`;
      if (ewgData.concerns && ewgData.concerns.length > 0) {
        ewgContext += `\nEWG Concerns: ${ewgData.concerns.join(", ")}`;
      }
    } else {
      ewgContext = "\nEWG Skin Deep: Not found or score unavailable";
      if (ewgData.suggestedMatches && ewgData.suggestedMatches.length > 0) {
        ewgContext += `\nSuggested similar ingredients: ${ewgData.suggestedMatches.join(", ")}`;
      }
    }

    let researchContext = "";
    if (researchSources && researchSources.length > 0) {
      researchContext = "\nAdditional Research Sources Found:\n";
      researchSources.forEach((source: any) => {
        researchContext += `- ${source.source.toUpperCase()}: ${source.title} (${source.url})\n`;
      });
    }

    return `You are a cosmetic ingredient safety researcher. Analyze the safety of this ingredient: "${ingredientName}"

${ewgContext}${researchContext}

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

  private parseResponse(text: string, ingredientName: string): any {
    try {
      const parsed = JSON.parse(text);
      return {
        status: parsed.status || "caution",
        rationale: parsed.rationale || `${ingredientName} requires review.`,
        description: parsed.description || this.defaultDescription(ingredientName),
        edgeCases: parsed.edgeCases || "No specific edge cases known.",
        confidence: parsed.confidence || 0.7,
      };
    } catch (error) {
      throw new Error(`Failed to parse Groq response: ${error}`);
    }
  }

  private defaultDescription(name: string): string {
    return `${name} is a cosmetic ingredient.\nSafety assessment indicates caution status.\nFurther research may be needed.`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

