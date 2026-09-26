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

describe("admin key comparison (post-merge review 2026-09-26, E4.12)", () => {
  it("secretsMatch is exact and length-safe", async () => {
    vi.resetModules();
    const { secretsMatch } = await import("../../server/middleware/auth.js");
    expect(secretsMatch("test-admin-key", "test-admin-key")).toBe(true);
    expect(secretsMatch("test-admin-kez", "test-admin-key")).toBe(false);
    expect(secretsMatch("t", "test-admin-key")).toBe(false); // different length: no throw
    expect(secretsMatch("", "test-admin-key")).toBe(false);
  });

  it("rejects a wrong key of a different length with 403, never an exception", async () => {
    process.env.NODE_ENV = "production";
    const requireAuth = await importFreshRequireAuth();
    const req: any = { headers: { authorization: "Bearer x" } };
    const { res, out } = makeRes();
    let nextCalled = false;
    await requireAuth(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(out.statusCode).toBe(403);
  });
});

describe("admin re-ingest is behind the real auth middleware", () => {
  it("no Authorization header: 401 and nothing read or written", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const express = (await import("express")).default;
    const request = (await import("supertest")).default;
    const { buildAdminReingestRouter } = await import("../../server/routes/adminReingest.js");
    const storage = { getById: vi.fn(), update: vi.fn() };
    const ai = { analyzeIngredients: vi.fn() };
    const app = express();
    app.use(express.json());
    app.use("/api/admin", buildAdminReingestRouter(ai as any, () => storage as any));

    const res = await request(app).post("/api/admin/products/p1/reingest").send({ ingredientsText: "Sugar, Salt", apply: true });
    expect(res.status).toBe(401);
    const wrong = await request(app)
      .post("/api/admin/products/p1/reingest")
      .set("Authorization", "Bearer not-the-key")
      .send({ ingredientsText: "Sugar, Salt", apply: true });
    expect(wrong.status).toBe(403);
    expect(storage.getById).not.toHaveBeenCalled();
    expect(storage.update).not.toHaveBeenCalled();
    expect(ai.analyzeIngredients).not.toHaveBeenCalled();
  });
});

describe("optionalAuth — admin key compared in constant time too", () => {
  async function importFreshOptionalAuth() {
    vi.resetModules();
    return (await import("../../server/middleware/auth.js")).optionalAuth;
  }

  it("the right key grants admin; a wrong key of any length grants nothing", async () => {
    process.env.NODE_ENV = "production";
    const optionalAuth = await importFreshOptionalAuth();
    const run = async (token: string) => {
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      await optionalAuth(req, {} as any, () => {});
      return req.user?.role;
    };
    expect(await run("test-admin-key")).toBe("admin");
    expect(await run("x")).toBeUndefined();
    expect(await run("test-admin-kez")).toBeUndefined();
  });
});

