export type SafetyStatus = "safe" | "caution" | "banned";

export type ProductStatus = "draft" | "published";

export interface Ingredient {
  id: string;
  name: string;
  status: SafetyStatus;
  rationale: string;
  sourceUrl: string;
  originalStatus?: SafetyStatus;
  isOverride?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  summary: string;
  imageUrl: string;
  status: ProductStatus;
  overallStatus: SafetyStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  editedFromProductId?: string | null;
  ingredients: Ingredient[];
}

export interface VetIngredientsRequest {
  ingredientsText: string;
}

export interface VetIngredientResult {
  overallStatus: SafetyStatus;
  summary: string;
  ingredients: Ingredient[];
}

