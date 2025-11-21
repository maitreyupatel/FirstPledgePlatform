/**
 * Gemini AI Provider
 * Uses Google Gemini API
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider } from "../aiProvider";

export class GeminiProvider implements AIProvider {
  private model: any;
  private maxRetries: number = 3;

  constructor(apiKey: string) {
    const gemini = new GoogleGenerativeAI(apiKey);
    // Use gemini-1.5-flash instead of gemini-2.0-flash-exp (better free tier limits)
    try {
      this.model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
    } catch {
      this.model = gemini.getGenerativeModel({ model: "gemini-pro" });
    }
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
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return this.parseResponse(text, ingredientName);
      } catch (error: any) {
        if (error.status === 429 && attempt < this.maxRetries) {
          const delay = this.extractRetryDelay(error) || 10000;
          await this.sleep(delay);
          continue;
        }
        throw error;
      }
    }
    
    throw new Error("Failed after retries");
  }

  private buildPrompt(ingredientName: string, ewgData: any, researchSources: any[]): string {
    let ewgContext = "";
    if (ewgData.found && ewgData.score !== null) {
      ewgContext = `\nEWG Score: ${ewgData.score}/10`;
    }

    return `Analyze this cosmetic ingredient: "${ingredientName}"${ewgContext}

Return JSON:
{
  "status": "safe" | "caution" | "banned",
  "rationale": "Detailed explanation",
  "description": "3-line description (line 1: what it is, line 2: safety profile, line 3: applications)",
  "edgeCases": "One-line edge cases",
  "confidence": 0.0-1.0
}`;
  }

  private parseResponse(text: string, ingredientName: string): any {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      status: parsed.status || "caution",
      rationale: parsed.rationale || `${ingredientName} requires review.`,
      description: parsed.description || this.defaultDescription(ingredientName),
      edgeCases: parsed.edgeCases || "No specific edge cases known.",
      confidence: parsed.confidence || 0.7,
    };
  }

  private defaultDescription(name: string): string {
    return `${name} is a cosmetic ingredient.\nSafety assessment indicates caution status.\nFurther research may be needed.`;
  }

  private extractRetryDelay(error: any): number | null {
    try {
      if (error.errorDetails) {
        for (const detail of error.errorDetails) {
          if (detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo") {
            const seconds = parseFloat(detail.retryDelay?.replace(/s$/, "") || "10");
            return seconds * 1000;
          }
        }
      }
    } catch {}
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

