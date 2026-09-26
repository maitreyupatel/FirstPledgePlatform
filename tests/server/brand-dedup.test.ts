/**
 * Brand-variant dedup (audit 2026-09-26): "Moong Dal" (brand "Haldiram's")
 * and "Haldiram moong dal" (brand "Haldiram") were both published. The
 * near-duplicate check fetched candidates by EXACT brand, so the two were
 * never compared — the name check would have matched them.
 */
import { describe, it, expect } from "vitest";
import { brandKey, brandSearchPrefix } from "../../server/utils/nameSimilarity";
import { SupabaseStorage } from "../../server/storage/supabaseStorage";

type Row = { name: string; brand: string };

/** Minimal supabase-js stand-in: from().select().ilike(col, pattern).limit() with ILIKE semantics. */
function fakeClient(rows: Row[]) {
  return {
    from: () => ({
      select: () => ({
        ilike: (col: keyof Row, pattern: string) => ({
          limit: async () => {
            const literal = pattern.replace(/%$/, "").replace(/\\(.)/g, "$1").toLowerCase();
            const isPrefix = pattern.endsWith("%");
            const data = rows.filter((r) =>
              isPrefix ? r[col].toLowerCase().startsWith(literal) : r[col].toLowerCase() === literal,
            );
            return { data, error: null };
          },
        }),
      }),
    }),
  };
}

const hasSimilar = (rows: Row[], name: string, brand: string) =>
  SupabaseStorage.prototype.hasSimilarProduct.call({ supabase: fakeClient(rows) } as any, name, brand);

describe("brandKey — one brand, many spellings", () => {
  it("folds possessives, punctuation, case and a trailing plural s", () => {
    for (const b of ["Haldiram's", "Haldiram", "HALDIRAMS", "haldiram’s"]) expect(brandKey(b)).toBe("haldiram");
    expect(brandKey("Lay's")).toBe(brandKey("Lays"));
    expect(brandKey("ching's")).toBe(brandKey("Ching secret"));
    expect(brandKey("D'lecta")).toBe("dlecta");
    expect(brandKey("The Whole Truth")).toBe("whole");
  });

  it("keeps distinct brands distinct", () => {
    expect(brandKey("Amul")).not.toBe(brandKey("Britannia"));
    expect(brandKey("Kissan")).not.toBe(brandKey("Knorr"));
  });

  it("search prefix is the brand's leading letters as typed", () => {
    expect(brandSearchPrefix("Haldiram's")).toBe("Hald");
    expect(brandSearchPrefix("D'lecta")).toBe("D");
    expect(brandSearchPrefix("  Bru ")).toBe("Bru");
  });
});

describe("hasSimilarProduct — brand-variant duplicates", () => {
  const catalog: Row[] = [
    { name: "Moong Dal", brand: "Haldiram's" },
    { name: "Aloo Bhujia", brand: "Haldiram's" },
    { name: "Moong Dal", brand: "Bikaji" },
  ];

  it("catches the live duplicate: 'Haldiram moong dal' by 'Haldiram' vs 'Moong Dal' by 'Haldiram's'", async () => {
    expect(await hasSimilar(catalog, "Haldiram moong dal", "Haldiram")).toBe(true);
  });

  it("does not flag a different product of the same brand", async () => {
    expect(await hasSimilar(catalog, "Khatta Meetha", "Haldiram")).toBe(false);
  });

  it("does not flag the same product name under a different brand", async () => {
    expect(await hasSimilar([{ name: "Moong Dal", brand: "Bikaji" }], "Moong Dal", "Haldiram")).toBe(false);
  });

  it("treats LIKE metacharacters in the brand literally (E4.5)", async () => {
    expect(await hasSimilar(catalog, "Moong Dal", "%")).toBe(false);
  });
});
