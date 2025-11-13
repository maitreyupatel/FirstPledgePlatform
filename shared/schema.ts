import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const safetyStatusEnum = pgEnum("safety_status_enum", [
  "safe",
  "caution",
  "banned",
]);

export const productStatusEnum = pgEnum("product_status_enum", [
  "draft",
  "published",
]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  summary: text("summary").notNull(),
  imageUrl: text("image_url").notNull(),
  overallStatus: safetyStatusEnum("overall_status").notNull(),
  status: productStatusEnum("status").default("draft").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  editedFromProductId: uuid("edited_from_product_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const ingredients = pgTable("ingredients", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  status: safetyStatusEnum("status").notNull(),
  rationale: text("rationale").notNull(),
  sourceUrl: text("source_url").notNull(),
  originalStatus: safetyStatusEnum("original_status"),
  isOverride: boolean("is_override").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const productsRelations = relations(products, ({ many }) => ({
  ingredients: many(ingredients),
}));

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
  product: one(products, {
    fields: [ingredients.productId],
    references: [products.id],
  }),
}));

export type ProductRow = typeof products.$inferSelect;
export type IngredientRow = typeof ingredients.$inferSelect;

