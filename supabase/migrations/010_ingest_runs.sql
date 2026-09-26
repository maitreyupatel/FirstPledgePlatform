-- Durable cron run log (backlog E7.2).
--
-- Vercel cron logs are ephemeral, and /api/health used to infer cron health
-- from the newest PUBLISHED product. That produced false alarms on draft-only
-- days (Sept 2026: 5 failed health-watch runs while the cron was running)
-- and could not single out the one day nothing ran (2026-09-21), nor runs
-- that spent their whole budget and abandoned a product at the deadline.
--
-- One row per cron invocation: inserted as 'running' right after auth,
-- updated with counts and an outcome at the end. A row still 'running' long
-- after started_at means the function was killed (maxDuration) mid-run.
--
-- Additive only. RLS default-deny like every other table here: the server
-- reads/writes with the service role; no anon/authenticated access.

CREATE TABLE IF NOT EXISTS public.ingest_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job              TEXT NOT NULL CHECK (job IN ('daily-ingest', 'refresh-stale-ingredients')),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  outcome          TEXT NOT NULL DEFAULT 'running'
                   CHECK (outcome IN ('running', 'ok', 'partial', 'error', 'no_candidates')),
  products_created INTEGER NOT NULL DEFAULT 0,
  published        INTEGER NOT NULL DEFAULT 0,
  drafts           INTEGER NOT NULL DEFAULT 0,
  skipped          INTEGER NOT NULL DEFAULT 0,
  refreshed        INTEGER NOT NULL DEFAULT 0,
  failed           INTEGER NOT NULL DEFAULT 0,
  detail           JSONB
);

CREATE INDEX IF NOT EXISTS ingest_runs_job_started_idx
  ON public.ingest_runs (job, started_at DESC);

ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ingest_runs IS
  'RLS default-deny intended: cron run telemetry, service role only.';
