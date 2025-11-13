import { randomUUID } from "node:crypto";

import {
  Ingredient,
  Product,
  ProductStatus,
  SafetyStatus,
} from "../../shared/types";

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

export class MemStorage {
  private products = new Map<string, Product>();

  constructor(initialProducts: Product[] = []) {
    initialProducts.forEach((product) => {
      this.products.set(product.id, this.clone(product));
    });
  }

  list(options: ListProductsOptions = {}): Product[] {
    const { includeUnpublished = false } = options;
    const items = Array.from(this.products.values())
      .filter((product) => includeUnpublished || product.status === "published")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return items.map((product) => this.clone(product));
  }

  getById(id: string, options: ListProductsOptions = {}): Product | null {
    const product = this.products.get(id);
    if (!product) {
      return null;
    }

    if (!options.includeUnpublished && product.status !== "published") {
      return null;
    }

    return this.clone(product);
  }

  create(input: CreateProductInput): Product {
    const now = new Date().toISOString();
    const productId = randomUUID();

    const ingredients = (input.ingredients ?? []).map((ingredient) =>
      this.normalizeIngredient(ingredient, productId, now),
    );

    const overallStatus =
      input.overallStatus ?? this.deriveOverallStatus(ingredients);
    const status = input.status ?? "draft";

    const product: Product = {
      id: productId,
      name: input.name,
      brand: input.brand,
      summary: input.summary,
      imageUrl: input.imageUrl,
      status,
      overallStatus,
      editedFromProductId: input.editedFromProductId ?? null,
      createdAt: now,
      updatedAt: now,
      publishedAt: status === "published" ? now : null,
      ingredients,
    };

    this.products.set(product.id, product);
    return this.clone(product);
  }

  update(id: string, input: UpdateProductInput): Product | null {
    const existing = this.products.get(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();

    if (input.ingredients) {
      existing.ingredients = input.ingredients.map((ingredient) =>
        this.normalizeIngredient(ingredient, id, now, existing.ingredients),
      );
    }

    if (input.name !== undefined) existing.name = input.name;
    if (input.brand !== undefined) existing.brand = input.brand;
    if (input.summary !== undefined) existing.summary = input.summary;
    if (input.imageUrl !== undefined) existing.imageUrl = input.imageUrl;
    if (input.status !== undefined) {
      existing.status = input.status;
      if (existing.status === "published" && !existing.publishedAt) {
        existing.publishedAt = now;
      }
      if (existing.status === "draft") {
        existing.publishedAt = null;
      }
    }

    if (input.overallStatus !== undefined) {
      existing.overallStatus = input.overallStatus;
    } else if (input.ingredients) {
      existing.overallStatus = this.deriveOverallStatus(existing.ingredients);
    }

    if (input.publishedAt !== undefined) {
      existing.publishedAt = input.publishedAt;
    }

    existing.updatedAt = now;
    this.products.set(id, existing);
    return this.clone(existing);
  }

  delete(id: string): boolean {
    return this.products.delete(id);
  }

  createDraftFromProduct(id: string): Product | null {
    const baseProduct = this.products.get(id);
    if (!baseProduct) {
      return null;
    }

    const existingDraft = Array.from(this.products.values()).find(
      (product) =>
        product.editedFromProductId === id && product.status === "draft",
    );

    if (existingDraft) {
      return this.clone(existingDraft);
    }

    const now = new Date().toISOString();
    const draftId = randomUUID();
    const draft: Product = {
      ...this.clone(baseProduct),
      id: draftId,
      status: "draft",
      editedFromProductId: id,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      ingredients: baseProduct.ingredients.map((ingredient) => ({
        ...this.cloneIngredient(ingredient),
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      })),
    };

    this.products.set(draftId, draft);
    return this.clone(draft);
  }

  seed(products: Product[]) {
    products.forEach((product) => {
      this.products.set(product.id, this.clone(product));
    });
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
      sourceUrl: ingredient.sourceUrl || existingIngredient?.sourceUrl || defaultSource,
      originalStatus: ingredient.originalStatus ?? existingIngredient?.originalStatus ?? ingredient.status,
      isOverride: ingredient.isOverride ?? existingIngredient?.isOverride ?? false,
      createdAt,
      updatedAt: now,
    };
  }

  private clone(product: Product): Product {
    return {
      ...product,
      ingredients: product.ingredients.map((ingredient) =>
        this.cloneIngredient(ingredient),
      ),
    };
  }

  private cloneIngredient(ingredient: Ingredient): Ingredient {
    return { ...ingredient };
  }
}

