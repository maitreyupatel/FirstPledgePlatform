/**
 * Post-merge verification findings (2026-09-26, after #16–#19 deployed):
 * health's lastPublishedAt, the last fail-open dedup check, and cron runs
 * ending seconds from Vercel's 300s kill.
 */
import { describe, it, expect, vi } from "vitest";
import { SupabaseStorage } from "../../server/storage/supabaseStorage";
import { AIVettingService, IngredientAnalysis } from "../../server/services/aiVettingService.js";
import { analysisCacheKey } from "../../server/utils/cacheKey.js";

type Row = { id: string; status: string; created_at: string; published_at: string | null };

/** supabase-js stand-in: select/eq/not/order/limit/maybeSingle, plus head counts. */
function fakeProducts(rows: Row[]) {
  return {
    from: () => {
      let list = [...rows];
      let countOnly = false;
      let cols = "";
      const q: any = {
        select(c: string, opts?: { head?: boolean }) {
          cols = c;
          countOnly = !!opts?.head;
          return q;
        },
        eq(col: keyof Row, v: string) {
          list = list.filter((r) => r[col] === v);
          return q;
        },
        not(col: keyof Row, _op: string, _v: null) {
          list = list.filter((r) => r[col] !== null);
          return q;
        },
        order(col: keyof Row, { ascending }: { ascending: boolean }) {
          list.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (ascending ? 1 : -1));
          return q;
        },
        limit(n: number) {
          list = list.slice(0, n);
          return q;
        },
        async maybeSingle() {
          const r = list[0];
          return { data: r ? { [cols]: (r as any)[cols] } : null, error: null };
        },
        then(resolve: (v: unknown) => void) {
          resolve(countOnly ? { count: list.length, error: null } : { data: list, error: null });
        },
      };
      return q;
    },
  };
}

describe("catalogFreshness — lastPublishedAt is when something last went LIVE", () => {
  it("a re-published older product counts at its publication time, not its creation time", async () => {
    const rows: Row[] = [
      { id: "old", status: "published", created_at: "2026-05-04T09:00:00Z", published_at: "2026-09-26T11:36:00Z" },
      { id: "new", status: "published", created_at: "2026-09-22T10:02:00Z", published_at: "2026-09-22T10:02:00Z" },
      { id: "draft", status: "draft", created_at: "2026-09-26T09:58:00Z", published_at: null },
    ];
    const f = await SupabaseStorage.prototype.catalogFreshness.call({ supabase: fakeProducts(rows) } as any);
    expect(f.lastPublishedAt).toBe("2026-09-26T11:36:00Z"); // was the newest published created_at: 09-22
    expect(f.lastCreatedAt).toBe("2026-09-26T09:58:00Z"); // any status
    expect([f.published, f.drafts]).toEqual([2, 1]);
  });
});

describe("findByNameAndBrand fails closed", () => {
  it("an unreadable table is an error, never 'no such product'", async () => {
    const failing = {
      from: () => {
        const q: any = {
          select: () => q,
          ilike: () => q,
          limit: () => q,
          maybeSingle: async () => ({ data: null, error: { message: "timeout" } }),
        };
        return q;
      },
    };
    await expect(
      SupabaseStorage.prototype.findByNameAndBrand.call({ supabase: failing } as any, "Moong Dal", "Haldiram"),
    ).rejects.toThrow(/Duplicate check/);
  });
});

function buildService(cachedNames: string[] = []) {
  const service = new AIVettingService("groq", undefined, undefined, undefined, false);
  const rows = new Map<string, IngredientAnalysis>();
  for (const n of cachedNames) {
    rows.set(analysisCacheKey(n), { name: n, status: "safe", rationale: "cached", description: "", edgeCases: "", sourceUrl: "", confidence: 0.9 });
  }
  (service as any).analysisService = {
    normalizeIngredientName: analysisCacheKey,
    getAnalysis: vi.fn(async (n: string) => rows.get(analysisCacheKey(n)) ?? null),
    getAnalysesBatch: vi.fn(async (names: string[]) => {
      const m = new Map<string, IngredientAnalysis>();
      for (const n of names) if (rows.has(analysisCacheKey(n))) m.set(analysisCacheKey(n), rows.get(analysisCacheKey(n))!);
      return m;
    }),
    shouldRefreshAnalysis: () => false,
    upsertAnalysis: vi.fn(async () => undefined),
  };
  const provider = {
    analyzeIngredient: vi.fn(async () => ({ status: "safe", rationale: "fresh", description: "", edgeCases: "", confidence: 0.9 })),
  };
  const sleep = vi.fn().mockResolvedValue(undefined);
  (service as any).aiProvider = provider;
  (service as any).sleep = sleep;
  (service as any).callDelayMs = 20_000; // production pacing (vercel.json)
  return { service, provider, sleep };
}

describe("analysis pacing — never into the deadline, never toward a cache hit", () => {
  it("pauses between two fresh analyses", async () => {
    const { service, provider, sleep } = buildService();
    await service.analyzeIngredients(["Rare Gum A", "Rare Gum B"], "food");
    expect(provider.analyzeIngredient).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not pause when everything after a fresh analysis is cached", async () => {
    const { service, sleep } = buildService(["Sugar", "Salt"]);
    await service.analyzeIngredients(["Rare Gum A", "Sugar", "Salt"], "food");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops BEFORE a pause that would run into the deadline reserve, keeping the budget for writes", async () => {
    const { service, provider, sleep } = buildService();
    // 70s left: the first analysis may start (reserve 60s), but after a 20s
    // pause the second could not — so stop now instead of sleeping first
    const deadlineAt = Date.now() + 70_000;
    await expect(service.analyzeIngredients(["Rare Gum A", "Rare Gum B"], "food", { deadlineAt })).rejects.toThrow(
      /deadline exceeded after 1\/2/,
    );
    expect(provider.analyzeIngredient).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("never starts a fresh analysis inside the reserve", async () => {
    const { service, provider } = buildService();
    await expect(service.analyzeIngredients(["Rare Gum A"], "food", { deadlineAt: Date.now() + 50_000 })).rejects.toThrow(
      /deadline exceeded after 0\/1/,
    );
    expect(provider.analyzeIngredient).not.toHaveBeenCalled();
  });
});

describe("deadline reserve scales with the caller's budget (code review)", () => {
  it("a 50s budget with a 15s reserve still analyzes (a fixed 60s reserve blocked every local run)", async () => {
    const { service, provider } = buildService();
    const out = await service.analyzeIngredients(["Rare Gum A"], "food", { deadlineAt: Date.now() + 50_000, reserveMs: 15_000 });
    expect(out).toHaveLength(1);
    expect(provider.analyzeIngredient).toHaveBeenCalledTimes(1);
  });

  it("a deadline stop is recognisable without parsing the message", async () => {
    const { service } = buildService();
    const err = await service.analyzeIngredients(["Rare Gum A"], "food", { deadlineAt: Date.now() + 50_000 }).catch((e) => e);
    expect(err.deadline).toBe(true);
    expect(err.name).toBe("AnalysisDeadlineError");
  });
});

