/**
 * Rate-limit retry tests.
 * Invariants:
 *  1. A sustained 429 fails after a bounded number of retries with a
 *     structured error — no unbounded recursion
 *  2. Backoff is exponential (1s, 2s, 4s by default) and honours Retry-After
 *  3. Non-429 errors are not retried
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  withRateLimitRetry,
  RateLimitExhaustedError,
  isRateLimitError,
} from "../../server/services/providers/retry.js";

const rateLimitError = () => Object.assign(new Error("429 Too Many Requests"), { status: 429 });

function recordingSleep(delays: number[]) {
  return (ms: number) => {
    delays.push(ms);
    return Promise.resolve();
  };
}

describe("withRateLimitRetry", () => {
  it("gives up after 3 retries with a structured error", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimitError());
    const delays: number[] = [];

    await expect(
      withRateLimitRetry(fn, "TestProvider", { sleep: recordingSleep(delays) })
    ).rejects.toBeInstanceOf(RateLimitExhaustedError);

    expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
    expect(delays).toEqual([1000, 2000, 4000]); // exponential backoff
  });

  it("exposes code and status on the exhaustion error for structured handling", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimitError());
    const err = await withRateLimitRetry(fn, "TestProvider", { sleep: async () => {} }).catch((e) => e);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.status).toBe(429);
    expect(err.message).toContain("TestProvider");
  });

  it("succeeds when a retry eventually goes through", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValue("ok");

    const result = await withRateLimitRetry(fn, "TestProvider", { sleep: async () => {} });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-429 errors", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    await expect(withRateLimitRetry(fn, "TestProvider", { sleep: async () => {} })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours the Retry-After header when present", async () => {
    const err = Object.assign(new Error("429"), { status: 429, headers: { "retry-after": "7" } });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");
    const delays: number[] = [];

    await withRateLimitRetry(fn, "TestProvider", { sleep: recordingSleep(delays) });
    expect(delays).toEqual([7000]);
  });
});

describe("isRateLimitError", () => {
  it("detects direct and nested 429 status", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ response: { status: 429 } })).toBe(true);
    expect(isRateLimitError({ status: 500 })).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

// ── GroqProvider integration: bounded retry, no model hopping on rate limit ──

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("groq-sdk", () => ({
  default: class MockGroq {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {}
  },
}));

import { GroqProvider } from "../../server/services/providers/groqProvider.js";

describe("GroqProvider under sustained 429", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.useFakeTimers();
  });

  it("stops after bounded retries and surfaces a structured error instead of recursing", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));

    const provider = new GroqProvider("fake-key");
    const promise = provider
      .analyzeIngredient("aqua", { found: false, score: null, concerns: [] }, [])
      .catch((e) => e);

    await vi.advanceTimersByTimeAsync(60_000);
    const err = await promise;

    vi.useRealTimers();

    expect(err).toBeInstanceOf(RateLimitExhaustedError);
    // initial + 3 retries, on the SAME model — an account-level rate limit
    // must not trigger the model-fallback loop (3 models x 4 calls)
    expect(createMock).toHaveBeenCalledTimes(4);
    const modelsUsed = createMock.mock.calls.map((c: any[]) => c[0].model);
    expect(new Set(modelsUsed).size).toBe(1);
  });
});
