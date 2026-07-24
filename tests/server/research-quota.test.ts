/**
 * Google Custom Search quota tracking tests.
 * Invariants:
 *  1. Requests stop once the configured daily limit is reached — searches
 *     degrade gracefully to empty results (EWG + AI continue)
 *  2. A warning fires when approaching the limit
 *  3. Quota state is observable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ResearchService } from "../../server/services/researchService.js";

const originalLimit = process.env.GOOGLE_SEARCH_DAILY_LIMIT;

function okFetchResponse() {
  return {
    ok: true,
    json: async () => ({
      items: [{ link: "https://example.org/a", title: "Aqua safety", snippet: "aqua is water" }],
    }),
  };
}

describe("ResearchService daily quota", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okFetchResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalLimit === undefined) delete process.env.GOOGLE_SEARCH_DAILY_LIMIT;
    else process.env.GOOGLE_SEARCH_DAILY_LIMIT = originalLimit;
  });

  it("stops issuing requests once the daily limit is reached", async () => {
    process.env.GOOGLE_SEARCH_DAILY_LIMIT = "2";
    const service = new ResearchService("key", "cx");

    // One ingredient search fans out to up to 3 sub-searches; with a limit of
    // 2 only the first two may fire.
    await service.searchIngredient("aqua");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(service.getQuotaState()).toMatchObject({ used: 2, limit: 2, exhausted: true });

    // Subsequent searches are skipped entirely, returning empty results
    const results = await service.searchIngredient("glycerin");
    expect(results).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("warns when approaching the limit", async () => {
    process.env.GOOGLE_SEARCH_DAILY_LIMIT = "3";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const service = new ResearchService("key", "cx");
      await service.searchIngredient("aqua"); // 3 sub-searches = limit

      const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(warnings.some((w) => w.includes("approaching the daily limit"))).toBe(true);
      expect(warnings.some((w) => w.includes("quota") && w.includes("exhausted"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not count anything when API keys are missing", async () => {
    process.env.GOOGLE_SEARCH_DAILY_LIMIT = "2";
    const service = new ResearchService(undefined, undefined);
    const results = await service.searchIngredient("aqua");
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.getQuotaState().used).toBe(0);
  });
});
