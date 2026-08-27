/**
 * Regression tests for the client fetch layer (backlog E2.1 / E2.2).
 *
 *  - E2.1: the default React Query fetcher (getQueryFn) must attach the same
 *    Authorization bearer that apiRequest sends. Without it, admin GETs like
 *    ?includeUnpublished=true silently degraded to the public view (the
 *    server never 401s — it just hides drafts), so the admin Drafts tab
 *    always showed 0 and draft products could not be opened for editing.
 *  - E2.2: apiRequest must read an error response body at most once. The old
 *    code read it twice (debug log + throwIfResNotOk), so every API error
 *    surfaced as "body stream already read" instead of the server's message.
 *
 * Runs under the node vitest environment: window/localStorage are stubbed and
 * the supabase module is mocked so getAuthToken takes the session-token path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// getAuthToken dynamic-imports ./supabase relative to queryClient.ts
vi.mock("../../client/src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token-123" } },
        error: null,
      }),
    },
  },
}));

function stubBrowserGlobals() {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
}

describe("E2.1 — getQueryFn attaches the auth bearer", () => {
  beforeEach(() => stubBrowserGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("sends Authorization on default-fetcher queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "1" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getQueryFn } = await import("../../client/src/lib/queryClient");
    const queryFn = getQueryFn({ on401: "throw" });
    const result = await queryFn({
      queryKey: ["/api/products?includeUnpublished=true"],
    } as any);

    expect(result).toEqual([{ id: "1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/products?includeUnpublished=true");
    expect(init.headers.Authorization).toBe("Bearer test-token-123");
  });

  it("omits the header when no token exists (public pages unaffected)", async () => {
    const { supabase } = await import("../../client/src/lib/supabase");
    (supabase.auth.getSession as any).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getQueryFn } = await import("../../client/src/lib/queryClient");
    const queryFn = getQueryFn({ on401: "throw" });
    await queryFn({ queryKey: ["/api/products"] } as any);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});

describe("E2.2 — apiRequest surfaces the server's error message", () => {
  beforeEach(() => stubBrowserGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("throws '<status>: <server body>' instead of a body-stream error", async () => {
    // A REAL Response object: its body can only be read once, exactly the
    // condition that produced "body stream already read" before the fix.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":"Product not found"}', { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await import("../../client/src/lib/queryClient");

    await expect(apiRequest("PATCH", "/api/products/undefined")).rejects.toThrow(
      '404: {"error":"Product not found"}',
    );
  });

  it("returns the response untouched on success so callers can read the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"id":"1"}', { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await import("../../client/src/lib/queryClient");
    const res = await apiRequest("GET", "/api/products/1");
    expect(await res.json()).toEqual({ id: "1" });
  });
});
