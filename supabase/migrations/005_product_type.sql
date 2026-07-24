-- ============================================
-- MIGRATION 5: Product Type
-- Adds product_type to products and ingredient_analyses tables.
-- Widens ingredient_analyses cache key to (ingredient_name, product_type)
-- so food and cosmetic analyses are stored separately.
-- ============================================

-- Create the enum
DO $$ BEGIN
  CREATE TYPE product_type_enum AS ENUM ('food', 'cosmetic', 'supplement', 'personal_care', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Products: add product_type column
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type product_type_enum;

-- Backfill existing rows as 'unknown' (no reliable signal to auto-classify)
UPDATE products SET product_type = 'unknown' WHERE product_type IS NULL;

-- Enforce NOT NULL with default
ALTER TABLE products ALTER COLUMN product_type SET DEFAULT 'unknown';
ALTER TABLE products ALTER COLUMN product_type SET NOT NULL;

-- ingredient_analyses: add product_type column
ALTER TABLE ingredient_analyses ADD COLUMN IF NOT EXISTS product_type product_type_enum;

-- Backfill as 'cosmetic' — all prior analyses used the EWG Skin Deep cosmetic pipeline
UPDATE ingredient_analyses SET product_type = 'cosmetic' WHERE product_type IS NULL;

-- Enforce NOT NULL with default
ALTER TABLE ingredient_analyses ALTER COLUMN product_type SET DEFAULT 'cosmetic';
ALTER TABLE ingredient_analyses ALTER COLUMN product_type SET NOT NULL;

-- Drop old single-column unique constraint and replace with composite
ALTER TABLE ingredient_analyses DROP CONSTRAINT IF EXISTS ingredient_analyses_ingredient_name_key;
ALTER TABLE ingredient_analyses ADD CONSTRAINT ingredient_analyses_name_type_unique
  UNIQUE (ingredient_name, product_type);

-- Replace single-column index with composite index
DROP INDEX IF EXISTS idx_ingredient_analyses_name;
CREATE INDEX IF NOT EXISTS idx_ingredient_analyses_name_type
  ON ingredient_analyses(ingredient_name, product_type);

-- Index product_type on products for catalog filtering
CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);
