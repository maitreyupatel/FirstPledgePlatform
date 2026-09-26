/**
 * A timed-out or dropped Groq call is not the model's fault: the provider
 * must surface it at once instead of retrying the prompt on each fallback
 * model — 3 models x 30s x 2 attempts could outlast any serverless deadline
 * reserve (post-merge code review 2026-09-26).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createMock, APIConnectionError, APIConnectionTimeoutError } = vi.hoisted(() => {
  class APIConnectionError extends Error {}
  class APIConnectionTimeoutError extends APIConnectionError {}
  return { createMock: vi.fn(), APIConnectionError, APIConnectionTimeoutError };
});

vi.mock("groq-sdk", () => ({
  APIConnectionError,
  default: class MockGroq {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {}
  },
}));

import { GroqProvider } from "../../server/services/providers/groqProvider.js";

describe("GroqProvider — timeouts do not trigger model fallback", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("a timeout is thrown after ONE model, not retried across the fallback list", async () => {
    createMock.mockImplementation(async () => {
      throw new APIConnectionTimeoutError("Request timed out.");
    });
    const provider = new GroqProvider("fake-key");
    await expect(provider.analyzeIngredient("aqua", { found: false, score: null, concerns: [] }, [])).rejects.toBeInstanceOf(
      APIConnectionTimeoutError,
    );
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("a model error still falls back to the next model", async () => {
    createMock
      .mockRejectedValueOnce(Object.assign(new Error("model_decommissioned"), { status: 400, error: { code: "model_decommissioned" } }))
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ status: "safe", rationale: "r", description: "d", edgeCases: "e", confidence: 0.9 }) } }],
      });
    const provider = new GroqProvider("fake-key");
    const out = await provider.analyzeIngredient("aqua", { found: false, score: null, concerns: [] }, []);
    expect(out.status).toBe("safe");
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0][0].model).not.toBe(createMock.mock.calls[1][0].model);
  });
});
