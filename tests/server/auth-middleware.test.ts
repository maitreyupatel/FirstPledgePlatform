/**
 * Auth middleware response-shape tests.
 * Invariant: 403 responses never include auth-configuration diagnostics
 * (debug/details) outside development — they are an information-disclosure
 * surface in production.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_API_KEY",
  "NODE_ENV",
] as const;

let savedEnv: Record<string, string | undefined>;

function makeRes() {
  const out = { statusCode: 0, body: null as any };
  const res: any = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(payload: any) {
      out.body = payload;
      return res;
    },
  };
  return { res, out };
}

async function importFreshRequireAuth() {
  vi.resetModules();
  const mod = await import("../../server/middleware/auth.js");
  return mod.requireAuth;
}

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  // Force the deterministic offline path: no Supabase client, API key set so
  // the dev "no auth configured" bypass cannot fire. Empty strings are
  // pre-existing keys to dotenv, so .env values do not override them.
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_ANON_KEY = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.ADMIN_API_KEY = "test-admin-key";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("requireAuth — 403 response shape", () => {
  it("omits debug diagnostics in production", async () => {
    process.env.NODE_ENV = "production";
    const requireAuth = await importFreshRequireAuth();

    const req: any = { headers: { authorization: "Bearer wrong-token" } };
    const { res, out } = makeRes();
    await requireAuth(req, res, () => {
      throw new Error("next() must not be called for an invalid token");
    });

    expect(out.statusCode).toBe(403);
    expect(out.body.error).toBe("Forbidden");
    expect(out.body.debug).toBeUndefined();
    expect(out.body.details).toBeUndefined();
  });

  it("includes debug diagnostics in development", async () => {
    process.env.NODE_ENV = "development";
    const requireAuth = await importFreshRequireAuth();

    const req: any = { headers: { authorization: "Bearer wrong-token" } };
    const { res, out } = makeRes();
    await requireAuth(req, res, () => {
      throw new Error("next() must not be called for an invalid token");
    });

    expect(out.statusCode).toBe(403);
    expect(out.body.debug).toBeDefined();
    expect(out.body.debug.hasToken).toBe(true);
  });

  it("still accepts the correct admin API key", async () => {
    process.env.NODE_ENV = "production";
    const requireAuth = await importFreshRequireAuth();

    const req: any = { headers: { authorization: "Bearer test-admin-key" } };
    const { res, out } = makeRes();
    let nextCalled = false;
    await requireAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user?.role).toBe("admin");
    expect(out.statusCode).toBe(0);
  });
});
