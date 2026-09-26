/**
 * The publish gate is the platform's last line against wrong verdicts:
 * overall confidence >= 0.7 AND no banned ingredient AND no ingredient
 * below 0.6 AND no garbled name. These pin each condition independently.
 */
import { describe, it, expect } from "vitest";
import { evaluatePublishGate } from "../../server/services/publishGate";

const ok = (name: string, confidence = 0.85) => ({ name, status: "safe", confidence });

describe("evaluatePublishGate", () => {
  it("publishes a clean, confident list", () => {
    const g = evaluatePublishGate([ok("Sugar"), ok("Preservative INS 211"), ok("Colour INS 102", 0.85)]);
    expect(g.publish).toBe(true);
    expect(g.reasons).toEqual([]);
  });

  it("holds on low overall confidence", () => {
    const g = evaluatePublishGate([ok("Sugar", 0.65), ok("Salt", 0.65)]);
    expect(g.publish).toBe(false);
    expect(g.reasons.join()).toMatch(/overall confidence 0.65/);
  });

  it("holds on any banned ingredient, however confident", () => {
    const g = evaluatePublishGate([ok("Sugar", 0.95), { name: "Amaranth INS 123", status: "banned", confidence: 0.95 }]);
    expect(g.publish).toBe(false);
    expect(g.reasons.join()).toMatch(/banned: Amaranth INS 123/);
  });

  it("holds when ONE ingredient is below 0.6 even if the average passes", () => {
    const g = evaluatePublishGate([ok("A", 0.95), ok("B", 0.95), ok("C", 0.95), ok("D", 0.5)]);
    expect(g.overallConfidence).toBeGreaterThanOrEqual(0.7);
    expect(g.publish).toBe(false);
    expect(g.reasons.join()).toMatch(/low confidence.*D/);
  });

  it("holds on a garbled name", () => {
    const g = evaluatePublishGate([ok("Sugar"), ok("Raising Agents (10 ii)")]);
    expect(g.publish).toBe(false);
    expect(g.reasons.join()).toMatch(/garbled/);
  });

  it("allows a code's sub-type qualifier (not garbled)", () => {
    expect(evaluatePublishGate([ok("Raising Agents INS 503(ii)")]).publish).toBe(true);
  });

  it("never publishes an empty list", () => {
    expect(evaluatePublishGate([]).publish).toBe(false);
  });

  it("holds a list cut down by the analysis cap — the tail would be silently missing (R2-28)", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => ok(`Ingredient ${i}`));
    const g = evaluatePublishGate(fifty, { totalParsed: 55 });
    expect(g.publish).toBe(false);
    expect(g.reasons.join()).toMatch(/55 ingredients; only 50 analyzed/);
    expect(evaluatePublishGate(fifty, { totalParsed: 50 }).publish).toBe(true);
  });
});
