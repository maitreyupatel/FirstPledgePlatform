-- ============================================
-- COMPLETE SUPABASE MIGRATION
-- Run this file in Supabase SQL Editor to set up all tables
-- ============================================

-- ============================================
-- MIGRATION 1: Initial Schema
-- ============================================

-- Create enums (ignore error if they already exist)
DO $$ BEGIN
    CREATE TYPE safety_status_enum AS ENUM ('safe', 'caution', 'banned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE product_status_enum AS ENUM ('draft', 'published');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  summary TEXT NOT NULL,
  image_url TEXT NOT NULL,
  overall_status safety_status_enum NOT NULL,
  status product_status_enum NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP WITH TIME ZONE,
  edited_from_product_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create ingredients table
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status safety_status_enum NOT NULL,
  rationale TEXT NOT NULL,
  source_url TEXT NOT NULL,
  original_status safety_status_enum,
  is_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingredients_product_id ON ingredients(product_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ingredients_updated_at ON ingredients;
CREATE TRIGGER update_ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION 2: Ingredient Analyses
-- ============================================

-- Create ingredient_analyses table for permanent storage of analysis results
CREATE TABLE ingredient_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_name TEXT NOT NULL UNIQUE,
  status safety_status_enum NOT NULL,
  rationale TEXT NOT NULL,
  description TEXT NOT NULL,
  edge_cases TEXT NOT NULL,
  source_url TEXT NOT NULL,
  ewg_score INTEGER,
  ewg_data_availability TEXT,
  research_sources JSONB,
  suggested_matches TEXT[],
  confidence NUMERIC NOT NULL,
  analysis_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on ingredient_name for fast lookups
CREATE INDEX idx_ingredient_analyses_name ON ingredient_analyses(ingredient_name);
CREATE INDEX idx_ingredient_analyses_updated_at ON ingredient_analyses(updated_at DESC);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_ingredient_analyses_updated_at ON ingredient_analyses;
CREATE TRIGGER update_ingredient_analyses_updated_at
  BEFORE UPDATE ON ingredient_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to normalize ingredient name (lowercase, trim)
CREATE OR REPLACE FUNCTION normalize_ingredient_name(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(TRIM(name));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- MIGRATION 3: User Profiles
-- ============================================

-- Create user_profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on email
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role full access" ON user_profiles;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile (but not role)
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()));

-- Policy: Service role can do everything (for server-side operations)
CREATE POLICY "Service role full access"
  ON user_profiles
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- VERIFICATION QUERIES
-- Run these to verify setup:
-- ============================================

-- Check tables exist
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('products', 'ingredients', 'ingredient_analyses', 'user_profiles');

-- Check admin users
-- SELECT id, email, role FROM user_profiles WHERE role = 'admin';

