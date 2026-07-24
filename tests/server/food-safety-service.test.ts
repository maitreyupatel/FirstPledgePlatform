/**
 * FoodSafetyService unit tests — E-number registry lookups.
 * These use the real implementation (no mocking) to verify the static registry.
 */

import { describe, it, expect } from "vitest";
import { FoodSafetyService } from "../../server/services/foodSafetyService.js";

const service = new FoodSafetyService(); // no API keys → only static registry + name matching

describe("FoodSafetyService — E-number registry lookups", () => {
  it("looks up E102 (tartrazine) as caution", async () => {
    const result = await service.lookupFoodIngredient("tartrazine (e102)");
    expect(result.found).toBe(true);
    expect(result.status).toBe("caution");
    expect(result.source).toBe("e-number");
  });

  it("looks up E621 (MSG) as safe", async () => {
    const result = await service.lookupFoodIngredient("monosodium glutamate e621");
    expect(result.found).toBe(true);
    expect(result.status).toBe("safe");
  });

  it("looks up E250 (sodium nitrite) as caution", async () => {
    const result = await service.lookupFoodIngredient("e250");
    expect(result.found).toBe(true);
    expect(result.status).toBe("caution");
    expect(result.concerns.length).toBeGreaterThan(0);
  });

  it("looks up E171 (titanium dioxide) as banned", async () => {
    const result = await service.lookupFoodIngredient("titanium dioxide (e171)");
    expect(result.found).toBe(true);
    expect(result.status).toBe("banned");
  });

  it("looks up E300 (ascorbic acid / vitamin C) as safe", async () => {
    const result = await service.lookupFoodIngredient("ascorbic acid (e300)");
    expect(result.found).toBe(true);
    expect(result.status).toBe("safe");
  });

  it("returns not-found for unknown ingredient without API keys", async () => {
    const result = await service.lookupFoodIngredient("unicorn powder xyz12345");
    expect(result.found).toBe(false);
    expect(result.status).toBeNull();
    expect(result.source).toBe("not-found");
  });

  it("matches by common name (sodium benzoate → E211 → caution)", async () => {
    const result = await service.lookupFoodIngredient("sodium benzoate");
    expect(result.found).toBe(true);
    expect(result.status).toBe("caution");
  });

  it("matches E-number written with dash (e-102)", async () => {
    const result = await service.lookupFoodIngredient("e-102");
    expect(result.found).toBe(true);
    expect(result.status).toBe("caution");
  });

  it("provides concerns for flagged additives", async () => {
    const result = await service.lookupFoodIngredient("e102");
    expect(result.concerns).toContain("hyperactivity in children");
  });

  it("E952 (cyclamates) is marked banned", async () => {
    const result = await service.lookupFoodIngredient("e952");
    expect(result.found).toBe(true);
    expect(result.status).toBe("banned");
  });

  it("potassium sorbate (E202) is safe", async () => {
    const result = await service.lookupFoodIngredient("potassium sorbate");
    expect(result.found).toBe(true);
    expect(result.status).toBe("safe");
  });

  it("xanthan gum (E415) is safe", async () => {
    const result = await service.lookupFoodIngredient("xanthan gum");
    expect(result.found).toBe(true);
    expect(result.status).toBe("safe");
  });

  it("aspartame (E951) is caution due to PKU and IARC 2B", async () => {
    const result = await service.lookupFoodIngredient("aspartame");
    expect(result.found).toBe(true);
    expect(result.status).toBe("caution");
  });
});
