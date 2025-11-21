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

