-- Which invocation created each ingest_runs row (adversarial review 2026-09-26).
--
-- The health watch asks "did TODAY's scheduled run happen?". An operator's
-- manual run — the documented local check against the prod DB, or a curl
-- with CRON_SECRET — must not answer that question for Vercel's scheduler,
-- or a missed scheduled run hides behind it. Vercel cron requests carry
-- `user-agent: vercel-cron/1.0`; everything else is 'manual'.
--
-- Additive only.

ALTER TABLE public.ingest_runs
  ADD COLUMN IF NOT EXISTS trigger TEXT NOT NULL DEFAULT 'manual'
  CHECK (trigger IN ('schedule', 'manual'));

CREATE INDEX IF NOT EXISTS ingest_runs_job_trigger_started_idx
  ON public.ingest_runs (job, trigger, started_at DESC);
