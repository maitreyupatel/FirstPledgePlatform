/**
 * AI Provider Interface
 * Supports multiple AI providers: Gemini, OpenAI, Anthropic, Groq
 */

import type { ProductType } from "@shared/types";

export interface AIProvider {
  analyzeIngredient(
    ingredientName: string,
    ewgData: any,
    researchSources: any[],
    productType?: ProductType
  ): Promise<{
    status: "safe" | "caution" | "banned";
    rationale: string;
    description: string;
    edgeCases: string;
    confidence: number;
  }>;
}

export type AIProviderType = "gemini" | "openai" | "anthropic" | "groq" | "huggingface";

