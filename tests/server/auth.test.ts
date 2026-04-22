/**
 * Auth middleware regression tests.
 * Key invariants from the CSO audit:
 *  1. SUPABASE_SERVICE_ROLE_KEY must NOT be accepted as a bearer token (Finding #1)
 *  2. ADMIN_API_KEY grants access when correct
 *  3. Wrong / missing token is rejected
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Request, type Response } from "express";
import request from "supertest";

// Stub @supabase/supabase-js so auth.ts module-level createClient never calls the real SDK
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      // getUser resolves to "no user" by default — override per-test if needed
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "not mocked" } }),
    },
    from: vi.fn(),
  })),
}));

async function buildApp(env: Record<string, string | undefined>) {
  // Wipe keys that should be absent
  const keysToDelete = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_API_KEY"];
  keysToDelete.forEach((k) => delete process.env[k]);
  Object.assign(process.env, { NODE_ENV: "production" });

  // Apply caller's overrides
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  vi.resetModules();
  const { requireAuth } = await import("../../server/middleware/auth.js");

  const app = express();
  app.use(express.json());
  app.get("/protected", requireAuth, (_req: Request, res: Response) => res.json({ ok: true }));
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("requireAuth — service role key must NOT grant admin access (CSO Finding #1)", () => {
  it("rejects a request where the bearer token equals the service role key", async () => {
    const SERVICE_ROLE = "real-service-role-key-abc123";
    const app = await buildApp({
      SUPABASE_URL: "https://proj.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
      // Intentionally no ADMIN_API_KEY
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${SERVICE_ROLE}`);

    expect(res.status).toBe(403);
  });
});

describe("requireAuth — ADMIN_API_KEY", () => {
  it("grants access with the correct ADMIN_API_KEY", async () => {
    const app = await buildApp({ ADMIN_API_KEY: "my-admin-key" });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer my-admin-key");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects an incorrect ADMIN_API_KEY", async () => {
    const app = await buildApp({ ADMIN_API_KEY: "my-admin-key" });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer wrong-key");

    expect(res.status).toBe(403);
  });

  it("rejects when no Authorization header is sent", async () => {
    const app = await buildApp({ ADMIN_API_KEY: "my-admin-key" });

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
  });
});
