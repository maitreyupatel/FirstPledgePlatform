/**
 * Cron run telemetry (table ingest_runs, migration 010) — the pure parts,
 * kept out of the route handlers so they are unit-testable.
 */

export type IngestJob = "daily-ingest" | "refresh-stale-ingredients";
export type IngestOutcome = "running" | "ok" | "partial" | "error" | "no_candidates";

export interface IngestRunCounts {
  productsCreated?: number;
  published?: number;
  drafts?: number;
  skipped?: number;
  refreshed?: number;
  failed?: number;
}

export interface IngestRunRecord {
  job: IngestJob;
  startedAt: string;
  finishedAt: string | null;
  outcome: IngestOutcome;
}

/**
 * Outcome of a finished run. A draft is a SUCCESSFUL ingest (the publish
 * gates held a doubtful product for review), so drafts never count against
 * the run; only failures do — e.g. a product abandoned at the deadline.
 */
export function ingestOutcome(counts: IngestRunCounts): Exclude<IngestOutcome, "running" | "no_candidates"> {
  const succeeded = (counts.productsCreated ?? 0) + (counts.refreshed ?? 0);
  const failed = counts.failed ?? 0;
  if (failed > 0 && succeeded === 0) return "error";
  if (failed > 0) return "partial";
  return "ok";
}

// Past maxDuration (300s) plus slack: a run still 'running' after this was killed.
const KILLED_AFTER_MS = 10 * 60 * 1000;
// Lenient flag for generic monitors probing at any hour; the daily
// health-watch applies its own, stricter timed check on hoursSinceLastRun.
const RUN_STALE_AFTER_HOURS = 26;

export interface IngestHealth {
  lastRunAt: string;
  lastOutcome: IngestOutcome | "killed";
  hoursSinceLastRun: number;
  stale: boolean;
}

/** Public health summary of the latest run — outcome and timing only, never run detail. */
export function summarizeIngestRun(run: IngestRunRecord, nowMs: number): IngestHealth {
  const startedMs = Date.parse(run.startedAt);
  const hours = (nowMs - startedMs) / 3_600_000;
  const killed = run.outcome === "running" && nowMs - startedMs > KILLED_AFTER_MS;
  return {
    lastRunAt: run.startedAt,
    lastOutcome: killed ? "killed" : run.outcome,
    hoursSinceLastRun: Math.round(hours * 10) / 10,
    stale: hours > RUN_STALE_AFTER_HOURS,
  };
}
