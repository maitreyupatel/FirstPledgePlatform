/**
 * Public API access-control tests.
 * Covers the includeUnpublished bypass fix:
 *  - anonymous requests must NOT see unpublished products
 *  - the health endpoint must return 200 with no auth
 *  - the debug/storage endpoint must return 404 in production
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";

// Minimal stub so the server module doesn't need a real Supabase
vi.mock("../../server/storage/supabaseStorage.js", () => ({
  SupabaseStorage: class {
    async list({ includeUnpublished }: { includeUnpublished: boolean }) {
      const all = [
        { id: "1", name: "Published Product", status: "published" },
        { id: "2", name: "Draft Product", status: "draft" },
      ];
      return includeUnpublished ? all : all.filter((p) => p.status === "published");
    }
    async getById(id: string, { includeUnpublished }: { includeUnpublished: boolean }) {
      if (id === "2" && !includeUnpublished) return null;
      return { id, name: "Draft Product", status: "draft" };
    }
  },
}));

// Prevent real AI services from initialising
vi.mock("../../server/services/aiVettingService.js", () => ({ AIVettingService: class {} }));
vi.mock("../../server/services/citationService.js", () => ({ CitationService: class {} }));

describe("GET /api/products — includeUnpublished access control", () => {
  it("returns only published products for unauthenticated requests", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    vi.resetModules();
    const { default: app } = await import("../../server/index.js");

    const res = await request(app)
      .get("/api/products?includeUnpublished=true");

    expect(res.status).toBe(200);
    const names = res.body.map((p: { name: string }) => p.name);
    expect(names).not.toContain("Draft Product");
    expect(names).toContain("Published Product");
  });
});

describe("GET /api/health", () => {
  it("returns 200 without auth", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    vi.resetModules();
    const { default: app } = await import("../../server/index.js");

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("GET /api/debug/storage — production gate", () => {
  it("returns 404 in production (endpoint is dev-only)", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    vi.resetModules();
    const { default: app } = await import("../../server/index.js");

    const res = await request(app).get("/api/debug/storage");
    expect(res.status).toBe(404);
  });
});
