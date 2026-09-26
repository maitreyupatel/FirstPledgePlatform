/**
 * Health-watch false alarms (audit 2026-09-26, backlog E4.10 / E7.2).
 *
 * /api/health inferred cron health from the newest PUBLISHED product, so
 * draft-only days (59% of September's ingests) read as an outage: the daily
 * watch failed 5 times while the cron was running — and could not single
 * out the one day nothing ran (Sep 21). Health now measures freshness over
 * ALL statuses and reports the latest cron RUN from ingest_runs.
 */
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { ingestOutcome, summarizeIngestRun, ingestTriggerOf } from "../../server/services/ingestTelemetry";

const HOUR = 3_600_000;

describe("ingestOutcome — drafts are successes, failures are not", () => {
  it("a run that created only drafts is ok", () => {
    expect(ingestOutcome({ productsCreated: 1, published: 0, drafts: 1 })).toBe("ok");
  });
  it("a run whose only product was abandoned at the deadline is an error", () => {
    expect(ingestOutcome({ productsCreated: 0, failed: 1 })).toBe("error");
  });
  it("mixed success and failure is partial", () => {
    expect(ingestOutcome({ productsCreated: 1, failed: 1 })).toBe("partial");
    expect(ingestOutcome({ refreshed: 8, failed: 2 })).toBe("partial");
  });
  it("a run with nothing new to do is ok, not an error", () => {
    expect(ingestOutcome({ skipped: 3 })).toBe("ok");
  });
});

describe("summarizeIngestRun", () => {
  const now = Date.parse("2026-09-26T10:43:00Z");
  it("reports hours since the last run and a lenient stale flag", () => {
    const s = summarizeIngestRun(
      { job: "daily-ingest", startedAt: "2026-09-25T09:58:00Z", finishedAt: "2026-09-25T10:02:00Z", outcome: "ok" },
      now,
    );
    expect(s.hoursSinceLastRun).toBe(24.8);
    expect(s.stale).toBe(false);
    expect(s.lastOutcome).toBe("ok");
  });
  it("a run still 'running' long after it started was killed", () => {
    const s = summarizeIngestRun(
      { job: "daily-ingest", startedAt: new Date(now - 2 * HOUR).toISOString(), finishedAt: null, outcome: "running" },
      now,
    );
    expect(s.lastOutcome).toBe("killed");
  });
  it("a run in progress is reported as running", () => {
    const s = summarizeIngestRun(
      { job: "daily-ingest", startedAt: new Date(now - 60_000).toISOString(), finishedAt: null, outcome: "running" },
      now,
    );
    expect(s.lastOutcome).toBe("running");
  });
});

// ── /api/health with a storage stub ─────────────────────────────────────────

const state: {
  freshness: { published: number; drafts: number; lastCreatedAt: string | null; lastPublishedAt: string | null };
  lastRun: unknown;
  catalogThrows?: boolean;
  runLogThrows?: boolean;
  lastRunOpts?: unknown;
} = { freshness: { published: 0, drafts: 0, lastCreatedAt: null, lastPublishedAt: null }, lastRun: null };

vi.mock("../../server/storage/supabaseStorage.js", () => ({
  SupabaseStorage: class {
    async catalogFreshness() {
      if (state.catalogThrows) throw new Error("db unreachable");
      return state.freshness;
    }
    async lastIngestRun(_job: string, opts?: unknown) {
      state.lastRunOpts = opts;
      if (state.runLogThrows) throw new Error("db unreachable");
      return state.lastRun;
    }
    // The pre-fix health path read these — published rows only — so the
    // same catalog state exercises the old behaviour faithfully.
    async list() {
      return state.freshness.lastPublishedAt ? [{ createdAt: state.freshness.lastPublishedAt }] : [];
    }
    async countProductsAfter() {
      return state.freshness.published;
    }
  },
}));
vi.mock("../../server/services/aiVettingService.js", () => ({ AIVettingService: class {} }));
vi.mock("../../server/services/citationService.js", () => ({ CitationService: class {} }));

async function health() {
  process.env.NODE_ENV = "production";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  vi.resetModules(); // fresh module = fresh 60s memo
  const { default: app } = await import("../../server/index.js");
  return (await request(app).get("/api/health")).body;
}

describe("GET /api/health — freshness over all statuses + latest run", () => {
  it("a draft-only week is NOT stale (the September false alarm)", async () => {
    const now = Date.now();
    state.freshness = {
      published: 45,
      drafts: 30,
      lastCreatedAt: new Date(now - 30 * HOUR).toISOString(), // newest product is a draft
      lastPublishedAt: new Date(now - 100 * HOUR).toISOString(), // newest published: 4 days ago
    };
    state.lastRun = null;
    const body = await health();
    expect(body.status).toBe("ok");
    expect(body.catalog).toMatchObject({ published: 45, drafts: 30, stale: false });
  });

  it("72h with no product of ANY status is still stale", async () => {
    const old = new Date(Date.now() - 80 * HOUR).toISOString();
    state.freshness = { published: 45, drafts: 30, lastCreatedAt: old, lastPublishedAt: old };
    expect((await health()).catalog.stale).toBe(true);
  });

  it("exposes the latest cron run — outcome and timing, never run detail", async () => {
    state.lastRun = {
      job: "daily-ingest",
      startedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      finishedAt: new Date(Date.now() - 2 * HOUR + 240_000).toISOString(),
      outcome: "error",
    };
    const body = await health();
    expect(body.ingest).toMatchObject({ lastOutcome: "error", stale: false });
    expect(body.ingest.hoursSinceLastRun).toBeGreaterThan(1.9);
    expect(body.ingest).not.toHaveProperty("detail");
  });

  it("still answers ok when telemetry is unavailable", async () => {
    state.lastRun = null;
    const body = await health();
    expect(body.status).toBe("ok");
    expect(body.ingest).toBeNull();
  });
});

describe("GET /api/health — failed reads are visible (review 2026-09-26)", () => {
  it("an unreadable catalog is reported as an error, not as a missing field", async () => {
    state.catalogThrows = true;
    state.runLogThrows = true;
    const body = await health();
    state.catalogThrows = false;
    state.runLogThrows = false;
    expect(body.status).toBe("ok"); // liveness still answers
    expect(body.catalog).toEqual({ error: "unavailable" });
    expect(body.ingest).toEqual({ error: "unavailable" });
  });

  it("asks for the latest SCHEDULED run — a manual run cannot hide a missed schedule", async () => {
    state.lastRun = null;
    await health();
    expect(state.lastRunOpts).toEqual({ scheduledOnly: true });
  });

  it("identifies Vercel's scheduler by its user agent", () => {
    expect(ingestTriggerOf("vercel-cron/1.0")).toBe("schedule");
    expect(ingestTriggerOf("curl/8.4.0")).toBe("manual");
    expect(ingestTriggerOf(undefined)).toBe("manual");
  });
});
