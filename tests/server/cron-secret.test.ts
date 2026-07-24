/**
 * Cron secret verification tests.
 * Invariants:
 *  1. Wrong or missing secret → 401
 *  2. Comparison is constant-time and length-safe (no timingSafeEqual throw
 *     on length mismatch)
 *  3. Missing CRON_SECRET fails CLOSED on any deployed environment
 *     (NODE_ENV=production or VERCEL=1) and only stays open in local dev
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyCronSecret } from "../../server/routes/cron.js";

function fakeReq(authHeader?: string) {
  return { headers: authHeader !== undefined ? { authorization: authHeader } : {} } as any;
}

function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["CRON_SECRET", "NODE_ENV", "VERCEL"];

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("verifyCronSecret", () => {
  it("accepts the correct Bearer secret", () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const res = fakeRes();
    expect(verifyCronSecret(fakeReq("Bearer correct-horse-battery-staple"), res)).toBe(true);
    expect(res.statusCode).toBe(0);
  });

  it("rejects a wrong secret with 401", () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const res = fakeRes();
    expect(verifyCronSecret(fakeReq("Bearer wrong-secret"), res)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("rejects a missing Authorization header with 401", () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const res = fakeRes();
    expect(verifyCronSecret(fakeReq(), res)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("handles length-mismatched secrets without throwing (hash-equalized comparison)", () => {
    process.env.CRON_SECRET = "a-fairly-long-secret-value-here";
    const res = fakeRes();
    // Naive timingSafeEqual on raw buffers throws on length mismatch — the
    // implementation must hash both sides first.
    expect(() => verifyCronSecret(fakeReq("Bearer x"), res)).not.toThrow();
    expect(res.statusCode).toBe(401);
  });

  it("rejects an empty bearer token even though sha256('') is computable", () => {
    process.env.CRON_SECRET = "secret";
    const res = fakeRes();
    expect(verifyCronSecret(fakeReq("Bearer "), res)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("fails CLOSED when CRON_SECRET is unset on Vercel", () => {
    delete process.env.CRON_SECRET;
    process.env.VERCEL = "1";
    const res = fakeRes();
    expect(verifyCronSecret(fakeReq("Bearer anything"), res)).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it("fails CLOSED when CRON_SECRET is unset in production", () => {
    delete process.env.CRON_SECRET;
    delete process.env.VERCEL;
    process.env.NODE_ENV = "production";
    const res = fakeRes();
    expect(verifyCronSecret(fakeReq(), res)).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it("stays open only in local development when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    delete process.env.VERCEL;
    process.env.NODE_ENV = "development";
    const res = fakeRes();
    expect(verifyCronSecret(fakeReq(), res)).toBe(true);
    expect(res.statusCode).toBe(0);
  });
});
