/**
 * AI Provider Interface
 * Supports multiple AI providers: Gemini, OpenAI, Anthropic, Groq
 */

export interface AIProvider {
  analyzeIngredient(
    ingredientName: string,
    ewgData: any,
    researchSources: any[]
  ): Promise<{
    status: "safe" | "caution" | "banned";
    rationale: string;
    description: string;
    edgeCases: string;
    confidence: number;
  }>;
}

export type AIProviderType = "gemini" | "openai" | "anthropic" | "groq" | "huggingface";

