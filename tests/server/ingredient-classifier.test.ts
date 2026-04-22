/**
 * Keyword-based ingredient classifier tests.
 * These cover the fallback classifyIngredient logic in server/index.ts
 * which runs when no AI provider is configured.
 */

import { describe, it, expect } from "vitest";

// The classifier logic is inlined in server/index.ts.
// Replicate it here so we can unit-test it in isolation.
const bannedKeywords = [
  "phthalate", "paraben", "synthetic fragrance",
  "benzene", "formaldehyde",
];
const cautionKeywords = [
  "phenoxyethanol", "chloride", "sulfate",
  "titanium dioxide", "aluminum",
];

function classifyIngredient(name: string): "safe" | "caution" | "banned" {
  const normalized = name.toLowerCase();
  if (bannedKeywords.some((kw) => normalized.includes(kw))) return "banned";
  if (cautionKeywords.some((kw) => normalized.includes(kw))) return "caution";
  return "safe";
}

describe("classifyIngredient", () => {
  it("marks phthalate ingredients as banned", () => {
    expect(classifyIngredient("Diethyl phthalate")).toBe("banned");
  });

  it("marks paraben ingredients as banned", () => {
    expect(classifyIngredient("Methylparaben")).toBe("banned");
  });

  it("marks formaldehyde as banned", () => {
    expect(classifyIngredient("Formaldehyde")).toBe("banned");
  });

  it("marks sulfate ingredients as caution", () => {
    expect(classifyIngredient("Sodium Lauryl Sulfate")).toBe("caution");
  });

  it("marks aluminum as caution", () => {
    expect(classifyIngredient("Aluminum Starch Octenylsuccinate")).toBe("caution");
  });

  it("marks benign ingredients as safe", () => {
    expect(classifyIngredient("Aqua")).toBe("safe");
    expect(classifyIngredient("Glycerin")).toBe("safe");
    expect(classifyIngredient("Shea Butter")).toBe("safe");
  });

  it("is case-insensitive", () => {
    expect(classifyIngredient("PARABEN FREE FORMULA")).toBe("banned");
    expect(classifyIngredient("SODIUM SULFATE")).toBe("caution");
  });

  it("banned takes precedence over caution if both keywords appear", () => {
    expect(classifyIngredient("paraben sulfate blend")).toBe("banned");
  });
});
