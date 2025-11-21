/**
 * OpenAI Provider
 * Uses OpenAI GPT models (GPT-4o-mini has generous free tier)
 */

import OpenAI from "openai";
import type { AIProvider } from "../aiProvider";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
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
    
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("No response from OpenAI");

      return this.parseResponse(content, ingredientName);
    } catch (error: any) {
      if (error.status === 429) {
        // OpenAI rate limits - wait and retry
        await this.sleep(60000); // Wait 1 minute
        return this.analyzeIngredient(ingredientName, ewgData, researchSources);
      }
      throw error;
    }
  }

  private buildPrompt(ingredientName: string, ewgData: any, researchSources: any[]): string {
    let ewgContext = "";
    if (ewgData.found && ewgData.score !== null) {
      ewgContext = `\nEWG Score: ${ewgData.score}/10 (1-4=safe, 5-7=caution, 8-10=banned)`;
    }

    return `You are a cosmetic ingredient safety researcher. Analyze: "${ingredientName}"${ewgContext}

Return JSON only:
{
  "status": "safe" | "caution" | "banned",
  "rationale": "Detailed scientific explanation",
  "description": "3-line description. Line 1: What it is and primary use. Line 2: Safety profile. Line 3: Common applications.",
  "edgeCases": "One concise line about edge cases or special considerations",
  "confidence": 0.0-1.0
}`;
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
      throw new Error(`Failed to parse OpenAI response: ${error}`);
    }
  }

  private defaultDescription(name: string): string {
    return `${name} is a cosmetic ingredient.\nSafety assessment indicates caution status.\nFurther research may be needed.`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

