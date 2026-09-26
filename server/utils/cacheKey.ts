/**
 * Key for the shared ingredient-analysis cache (ingredient_analyses).
 *
 * A clean coded name shares its code's row ("ins 211"), so every wording of
 * one additive gets ONE verdict and one AI call. A damaged or merged name
 * ("acidity inal information 6g a quantity regulator E260", "INS 504
 * Taurine") is isolated under its own full text: its wording must never
 * become the rationale that a clean, published product displays
 * (adversarial review 2026-09-26).
 */
import { looksGarbledIngredientName } from "./ingredientParser";
import { canonicalIngredientKey } from "./additiveCode";

export function analysisCacheKey(name: string): string {
  return looksGarbledIngredientName(name) ? name.toLowerCase().trim() : canonicalIngredientKey(name);
}
