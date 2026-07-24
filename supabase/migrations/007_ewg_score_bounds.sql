-- 007_ewg_score_bounds.sql
-- EWG Skin Deep scores are on a 1-10 scale; confidence is a probability.
-- Enforce both at the DB level so no write path (present or future) can
-- store out-of-range values.
--
-- NOTE: the UPDATEs normalize any existing out-of-range rows before the
-- constraints are added. Review row counts before applying in production.

UPDATE ingredient_analyses
SET ewg_score = NULL
WHERE ewg_score IS NOT NULL AND (ewg_score < 1 OR ewg_score > 10);

UPDATE ingredient_analyses
SET confidence = LEAST(1, GREATEST(0, confidence))
WHERE confidence < 0 OR confidence > 1;

ALTER TABLE ingredient_analyses DROP CONSTRAINT IF EXISTS ingredient_analyses_ewg_score_bounds;
ALTER TABLE ingredient_analyses ADD CONSTRAINT ingredient_analyses_ewg_score_bounds
  CHECK (ewg_score IS NULL OR (ewg_score >= 1 AND ewg_score <= 10));

ALTER TABLE ingredient_analyses DROP CONSTRAINT IF EXISTS ingredient_analyses_confidence_bounds;
ALTER TABLE ingredient_analyses ADD CONSTRAINT ingredient_analyses_confidence_bounds
  CHECK (confidence >= 0 AND confidence <= 1);
