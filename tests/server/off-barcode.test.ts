import { describe, it, expect } from "vitest";
import { offImagePath, barcodeFromImageUrl } from "../../server/utils/offBarcode";

describe("OFF barcode <-> image path", () => {
  it("splits long codes 3/3/3/rest like OFF's image folders", () => {
    expect(offImagePath("8901764032912")).toBe("890/176/403/2912");
    expect(offImagePath("0000089080153")).toBe("000/008/908/0153");
    // EAN-8: OFF zero-pads to 13 digits (live Maggi draft 89080153)
    expect(offImagePath("89080153")).toBe("000/008/908/0153");
    expect(offImagePath("1234")).toBeNull();
  });

  it("round-trips a real stored image URL (both live Sprite rows share this barcode)", () => {
    const url = "https://images.openfoodfacts.org/images/products/890/176/403/2912/front_en.26.400.jpg";
    const code = barcodeFromImageUrl(url)!;
    expect(code).toBe("8901764032912");
    expect(url).toContain(`/images/products/${offImagePath(code)}/`);
  });

  it("returns null for non-OFF or missing URLs", () => {
    expect(barcodeFromImageUrl("https://example.com/x.jpg")).toBeNull();
    expect(barcodeFromImageUrl(null)).toBeNull();
  });
});

import { SupabaseStorage } from "../../server/storage/supabaseStorage";

describe("hasBarcode — the live Sprite duplicate (same barcode, brand 'sprite' vs 'Coca-Cola')", () => {
  const rows = [
    { id: "b3c8", image_url: "https://images.openfoodfacts.org/images/products/890/176/403/2912/front_en.26.400.jpg" },
  ];
  const client = {
    from: () => ({
      select: () => ({
        ilike: (_col: string, pattern: string) => ({
          limit: async () => {
            const needle = pattern.replace(/^%|%$/g, "").replace(/\\(.)/g, "$1");
            return { data: rows.filter((r) => r.image_url.includes(needle)), error: null };
          },
        }),
      }),
    }),
  };
  const hasBarcode = (code: string) => SupabaseStorage.prototype.hasBarcode.call({ supabase: client } as any, code);

  it("finds an existing product by barcode regardless of name or brand", async () => {
    expect(await hasBarcode("8901764032912")).toBe(true);
  });

  it("does not match a different barcode", async () => {
    expect(await hasBarcode("8901764032929")).toBe(false);
    expect(await hasBarcode("12")).toBe(false);
  });
});
