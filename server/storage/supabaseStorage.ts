import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  Ingredient,
  Product,
  ProductStatus,
  SafetyStatus,
} from "../../shared/types";

// Storage input types (previously defined in memStorage.ts)
export interface CreateIngredientInput {
  id?: string;
  name: string;
  status: SafetyStatus;
  rationale: string;
  sourceUrl: string;
  originalStatus?: SafetyStatus;
  isOverride?: boolean;
}

export interface CreateProductInput {
  name: string;
  brand: string;
  summary: string;
  imageUrl: string;
  overallStatus?: SafetyStatus;
  status?: ProductStatus;
  ingredients?: CreateIngredientInput[];
  editedFromProductId?: string | null;
}

export interface UpdateProductInput {
  name?: string;
  brand?: string;
  summary?: string;
  imageUrl?: string;
  overallStatus?: SafetyStatus;
  status?: ProductStatus;
  ingredients?: CreateIngredientInput[];
  publishedAt?: string | null;
}

export interface ListProductsOptions {
  includeUnpublished?: boolean;
}

export class SupabaseStorage {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase URL and Service Role Key must be set in environment variables");
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  async list(options: ListProductsOptions = {}): Promise<Product[]> {
    const { includeUnpublished = false } = options;

    let query = this.supabase
      .from("products")
      .select(`
        *,
        ingredients (*)
      `)
      .order("created_at", { ascending: false });

    if (!includeUnpublished) {
      query = query.eq("status", "published");
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error listing products:", error);
      throw new Error(`Failed to list products: ${error.message}`);
    }

    return (data || []).map((row) => this.mapRowToProduct(row));
  }

  async getById(
    id: string,
    options: ListProductsOptions = {},
  ): Promise<Product | null> {
    const { includeUnpublished = false } = options;

    let query = this.supabase
      .from("products")
      .select(`
        *,
        ingredients (*)
      `)
      .eq("id", id)
      .single();

    const { data, error } = await query;

    if (error || !data) {
      return null;
    }

    if (!includeUnpublished && data.status !== "published") {
      return null;
    }

    return this.mapRowToProduct(data);
  }

  async create(input: CreateProductInput): Promise<Product> {
    const now = new Date().toISOString();
    const productId = randomUUID();

    const ingredients = (input.ingredients ?? []).map((ingredient: CreateIngredientInput) =>
      this.normalizeIngredient(ingredient, productId, now),
    );

    const overallStatus =
      input.overallStatus ?? this.deriveOverallStatus(ingredients);
    const status = input.status ?? "draft";

    // Insert product
    const { data: productData, error: productError } = await this.supabase
      .from("products")
      .insert({
        id: productId,
        name: input.name,
        brand: input.brand,
        summary: input.summary,
        image_url: input.imageUrl,
        overall_status: overallStatus,
        status: status,
        published_at: status === "published" ? now : null,
        edited_from_product_id: input.editedFromProductId ?? null,
      })
      .select()
      .single();

    if (productError) {
      console.error("Error creating product:", productError);
      throw new Error(`Failed to create product: ${productError.message}`);
    }

    // Insert ingredients
    if (ingredients.length > 0) {
      const ingredientRows = ingredients.map((ing: Ingredient) => ({
        id: ing.id,
        product_id: productId,
        name: ing.name,
        status: ing.status,
        rationale: ing.rationale,
        source_url: ing.sourceUrl,
        original_status: ing.originalStatus ?? null,
        is_override: ing.isOverride ?? false,
      }));

      const { error: ingredientsError } = await this.supabase
        .from("ingredients")
        .insert(ingredientRows);

      if (ingredientsError) {
        console.error("Error creating ingredients:", ingredientsError);
        // Try to clean up product
        await this.supabase.from("products").delete().eq("id", productId);
        throw new Error(
          `Failed to create ingredients: ${ingredientsError.message}`,
        );
      }
    }

    // Fetch complete product with ingredients
    const product = await this.getById(productId, { includeUnpublished: true });
    if (!product) {
      throw new Error("Failed to fetch created product");
    }

    return product;
  }

  async update(id: string, input: UpdateProductInput): Promise<Product | null> {
    const existing = await this.getById(id, { includeUnpublished: true });
    if (!existing) {
      return null;
    }

    // Log which product is being updated for debugging
    console.log(`Updating product ${id}${existing.editedFromProductId ? ` (draft of ${existing.editedFromProductId})` : ''}`);

    const now = new Date().toISOString();
    const updateData: any = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.brand !== undefined) updateData.brand = input.brand;
    if (input.summary !== undefined) updateData.summary = input.summary;
    if (input.imageUrl !== undefined) updateData.image_url = input.imageUrl;
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === "published" && !existing.publishedAt) {
        updateData.published_at = now;
      }
      if (input.status === "draft") {
        updateData.published_at = null;
      }
    }
    if (input.publishedAt !== undefined) {
      updateData.published_at = input.publishedAt;
    }

    // Use provided overallStatus if given (allows manual override)
    // Only auto-calculate if overallStatus is not provided
    if (input.overallStatus !== undefined) {
      updateData.overall_status = input.overallStatus;
    } else if (input.ingredients) {
      // Auto-calculate only if overallStatus was not provided
      const normalizedIngredients = input.ingredients.map((ingredient: CreateIngredientInput) =>
        this.normalizeIngredient(ingredient, id, now, existing.ingredients),
      );
      updateData.overall_status = this.deriveOverallStatus(normalizedIngredients);
    }

    // Update product
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await this.supabase
        .from("products")
        .update(updateData)
        .eq("id", id);

      if (updateError) {
        console.error("Error updating product:", updateError);
        throw new Error(`Failed to update product: ${updateError.message}`);
      }
    }

    // Update ingredients if provided
    if (input.ingredients) {
      // Delete existing ingredients
      const { error: deleteError } = await this.supabase
        .from("ingredients")
        .delete()
        .eq("product_id", id);

      if (deleteError) {
        console.error("Error deleting ingredients:", deleteError);
        throw new Error(`Failed to delete ingredients: ${deleteError.message}`);
      }

      // Insert new ingredients
      const normalizedIngredients = input.ingredients.map((ingredient: CreateIngredientInput) =>
        this.normalizeIngredient(ingredient, id, now, existing.ingredients),
      );

      if (normalizedIngredients.length > 0) {
        const ingredientRows = normalizedIngredients.map((ing: Ingredient) => ({
          id: ing.id,
          product_id: id,
          name: ing.name,
          status: ing.status,
          rationale: ing.rationale,
          source_url: ing.sourceUrl,
          original_status: ing.originalStatus ?? null,
          is_override: ing.isOverride ?? false,
        }));

        const { error: insertError } = await this.supabase
          .from("ingredients")
          .insert(ingredientRows);

        if (insertError) {
          console.error("Error inserting ingredients:", insertError);
          throw new Error(
            `Failed to insert ingredients: ${insertError.message}`,
          );
        }
      }
    }

    // Fetch updated product
    return await this.getById(id, { includeUnpublished: true });
  }

  async delete(id: string): Promise<boolean> {
    // First delete all ingredients associated with this product
    const { error: ingredientsError } = await this.supabase
      .from("ingredients")
      .delete()
      .eq("product_id", id);

    if (ingredientsError) {
      console.error("Error deleting ingredients:", ingredientsError);
      // Continue with product deletion even if ingredients deletion fails
    }

    // Then delete the product
    const { error } = await this.supabase.from("products").delete().eq("id", id);

    if (error) {
      console.error("Error deleting product:", error);
      return false;
    }

    return true;
  }

  async createDraftFromProduct(id: string): Promise<Product | null> {
    const baseProduct = await this.getById(id, { includeUnpublished: true });
    if (!baseProduct) {
      return null;
    }

    // Check for existing draft
    const { data: existingDrafts } = await this.supabase
      .from("products")
      .select("*")
      .eq("edited_from_product_id", id)
      .eq("status", "draft")
      .limit(1);

    if (existingDrafts && existingDrafts.length > 0) {
      return await this.getById(existingDrafts[0].id, {
        includeUnpublished: true,
      });
    }

    // Create new draft
    const now = new Date().toISOString();
    const draftId = randomUUID();

    const { error: productError } = await this.supabase
      .from("products")
      .insert({
        id: draftId,
        name: baseProduct.name,
        brand: baseProduct.brand,
        summary: baseProduct.summary,
        image_url: baseProduct.imageUrl,
        overall_status: baseProduct.overallStatus,
        status: "draft",
        published_at: null,
        edited_from_product_id: id,
      });

    if (productError) {
      console.error("Error creating draft:", productError);
      throw new Error(`Failed to create draft: ${productError.message}`);
    }

    // Copy ingredients
    if (baseProduct.ingredients.length > 0) {
      const ingredientRows = baseProduct.ingredients.map((ing) => ({
        id: randomUUID(),
        product_id: draftId,
        name: ing.name,
        status: ing.status,
        rationale: ing.rationale,
        source_url: ing.sourceUrl,
        original_status: ing.originalStatus ?? null,
        is_override: ing.isOverride ?? false,
      }));

      const { error: ingredientsError } = await this.supabase
        .from("ingredients")
        .insert(ingredientRows);

      if (ingredientsError) {
        console.error("Error copying ingredients:", ingredientsError);
        await this.supabase.from("products").delete().eq("id", draftId);
        throw new Error(
          `Failed to copy ingredients: ${ingredientsError.message}`,
        );
      }
    }

    return await this.getById(draftId, { includeUnpublished: true });
  }

  async seed(products: Product[]): Promise<void> {
    for (const product of products) {
      try {
        await this.create({
          name: product.name,
          brand: product.brand,
          summary: product.summary,
          imageUrl: product.imageUrl,
          overallStatus: product.overallStatus,
          status: product.status,
          editedFromProductId: product.editedFromProductId ?? null,
          ingredients: product.ingredients.map((ing) => ({
            id: ing.id,
            name: ing.name,
            status: ing.status,
            rationale: ing.rationale,
            sourceUrl: ing.sourceUrl,
            originalStatus: ing.originalStatus,
            isOverride: ing.isOverride,
          })),
        });
      } catch (error) {
        console.error(`Error seeding product ${product.id}:`, error);
        // Continue with other products
      }
    }
  }

  async mergeDraftIntoOriginal(draftId: string): Promise<Product | null> {
    // Get the draft product
    const draft = await this.getById(draftId, { includeUnpublished: true });
    if (!draft || !draft.editedFromProductId) {
      return null;
    }

    const originalId = draft.editedFromProductId;
    const original = await this.getById(originalId, { includeUnpublished: true });
    if (!original) {
      return null;
    }

    const now = new Date().toISOString();

    // Update the original product with draft's data
    const updateData: any = {
      name: draft.name,
      brand: draft.brand,
      summary: draft.summary,
      image_url: draft.imageUrl,
      overall_status: draft.overallStatus,
      status: "published",
      published_at: original.publishedAt || now,
    };

    const { error: updateError } = await this.supabase
      .from("products")
      .update(updateData)
      .eq("id", originalId);

    if (updateError) {
      console.error("Error updating original product:", updateError);
      throw new Error(`Failed to update original product: ${updateError.message}`);
    }

    // Delete old ingredients for the original product
    const { error: deleteIngredientsError } = await this.supabase
      .from("ingredients")
      .delete()
      .eq("product_id", originalId);

    if (deleteIngredientsError) {
      console.error("Error deleting old ingredients:", deleteIngredientsError);
      // Continue anyway - we'll try to insert new ones
    }

    // Insert draft's ingredients as the original's ingredients
    if (draft.ingredients.length > 0) {
      const ingredientRows = draft.ingredients.map((ing) => ({
        id: randomUUID(),
        product_id: originalId,
        name: ing.name,
        status: ing.status,
        rationale: ing.rationale,
        source_url: ing.sourceUrl,
        original_status: ing.originalStatus ?? null,
        is_override: ing.isOverride ?? false,
      }));

      const { error: ingredientsError } = await this.supabase
        .from("ingredients")
        .insert(ingredientRows);

      if (ingredientsError) {
        console.error("Error inserting ingredients:", ingredientsError);
        throw new Error(`Failed to insert ingredients: ${ingredientsError.message}`);
      }
    }

    // Delete the draft product
    const { error: deleteDraftError } = await this.supabase
      .from("products")
      .delete()
      .eq("id", draftId);

    if (deleteDraftError) {
      console.error("Error deleting draft:", deleteDraftError);
      // Continue anyway - the original has been updated
    }

    // Return the updated original product
    return await this.getById(originalId, { includeUnpublished: true });
  }

  private deriveOverallStatus(ingredients: Ingredient[]): SafetyStatus {
    if (ingredients.some((ingredient) => ingredient.status === "banned")) {
      return "banned";
    }
    if (ingredients.some((ingredient) => ingredient.status === "caution")) {
      return "caution";
    }
    return "safe";
  }

  private normalizeIngredient(
    ingredient: CreateIngredientInput,
    productId: string,
    now: string,
    existing: Ingredient[] = [],
  ): Ingredient {
    const defaultSource = "https://example.com/research";
    const existingIngredient = ingredient.id
      ? existing.find((item) => item.id === ingredient.id)
      : undefined;

    const createdAt = existingIngredient?.createdAt ?? now;

    return {
      id: ingredient.id ?? randomUUID(),
      name: ingredient.name,
      status: ingredient.status,
      rationale: ingredient.rationale,
      sourceUrl:
        ingredient.sourceUrl ||
        existingIngredient?.sourceUrl ||
        defaultSource,
      originalStatus:
        ingredient.originalStatus ??
        existingIngredient?.originalStatus ??
        ingredient.status,
      isOverride:
        ingredient.isOverride ??
        existingIngredient?.isOverride ??
        false,
      createdAt,
      updatedAt: now,
    };
  }

  private mapRowToProduct(row: any): Product {
    return {
      id: row.id,
      name: row.name,
      brand: row.brand,
      summary: row.summary,
      imageUrl: row.image_url,
      status: row.status,
      overallStatus: row.overall_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      editedFromProductId: row.edited_from_product_id,
      ingredients: (row.ingredients || []).map((ing: any) => ({
        id: ing.id,
        name: ing.name,
        status: ing.status,
        rationale: ing.rationale,
        sourceUrl: ing.source_url,
        originalStatus: ing.original_status,
        isOverride: ing.is_override,
        createdAt: ing.created_at,
        updatedAt: ing.updated_at,
      })),
    };
  }
}

