/**
 * Request-body validation for product and vetting routes.
 * Zod schemas enforced at the route boundary — nothing unvalidated reaches
 * the storage layer or the AI pipeline.
 */

import { z } from "zod";

export const safetyStatusSchema = z.enum(["safe", "caution", "banned"]);
export const productStatusSchema = z.enum(["draft", "published"]);
export const productTypeSchema = z.enum(["food", "cosmetic", "supplement", "personal_care", "unknown"]);

const MAX_NAME = 200;
const MAX_TEXT = 5000;
const MAX_URL = 2048;
export const MAX_INGREDIENTS_PER_PRODUCT = 200;
export const MAX_VET_INGREDIENT_LINES = 100;

// Accepts an http(s) URL or an empty string (the storage layer substitutes a
// default EWG search URL when empty).
const urlOrEmptySchema = z
  .string()
  .max(MAX_URL)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), {
    message: "must be an http(s) URL or empty",
  });

export const ingredientInputSchema = z
  .object({
    id: z.string().max(100).optional(),
    name: z.string().trim().min(1).max(MAX_NAME),
    status: safetyStatusSchema,
    rationale: z.string().max(MAX_TEXT).default(""),
    sourceUrl: urlOrEmptySchema.optional().default(""),
    originalStatus: safetyStatusSchema.optional(),
    isOverride: z.boolean().optional(),
  })
  .strip();

export const productCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME),
    brand: z.string().trim().min(1).max(MAX_NAME),
    summary: z.string().max(MAX_TEXT).optional().default(""),
    imageUrl: urlOrEmptySchema.optional().default(""),
    overallStatus: safetyStatusSchema.optional(),
    status: productStatusSchema.optional(),
    productType: productTypeSchema.optional(),
    ingredients: z.array(ingredientInputSchema).max(MAX_INGREDIENTS_PER_PRODUCT).optional().default([]),
  })
  .strip();

// PATCH semantics: every field optional, absent fields untouched (no defaults)
export const productUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME).optional(),
    brand: z.string().trim().min(1).max(MAX_NAME).optional(),
    summary: z.string().max(MAX_TEXT).optional(),
    imageUrl: urlOrEmptySchema.optional(),
    overallStatus: safetyStatusSchema.optional(),
    status: productStatusSchema.optional(),
    productType: productTypeSchema.optional(),
    ingredients: z.array(ingredientInputSchema).max(MAX_INGREDIENTS_PER_PRODUCT).optional(),
  })
  .strip();

export const vetIngredientsSchema = z
  .object({
    ingredientsText: z.string().trim().min(1).max(20_000),
    productType: productTypeSchema.optional(),
  })
  .strip();
