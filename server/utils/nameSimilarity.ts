/**
 * Near-duplicate product-name detection.
 *
 * Exact-match dedup (findByNameAndBrand) misses same-product records that
 * differ by spelling variant or word order — observed live: "Amul Pasteurized
 * Butter" vs "Amul pasteurised butter", and "chocolate cranberry museli" vs
 * "Muesli dark chocolate cranberry" (typo + reorder). This module catches that
 * class without pulling in a fuzzy-matching dependency.
 */

/** True when edit distance is <= 1 counting an adjacent transposition as 1. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    // One substitution, or one adjacent transposition ("museli" ~ "muesli")
    let i = 0;
    while (i < la && a[i] === b[i]) i++;
    if (i === la) return true;
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return (
      a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2)
    );
  }
  // One insertion/deletion
  const [short, long] = la < lb ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/z/g, "s") // fold pasteurized/pasteurised-class variants
    .split(/[^a-z0-9+]+/)
    .filter((w) => w.length > 1);
}

/**
 * Brand identity for dedup. "Haldiram's", "Haldiram" and "HALDIRAMS" are
 * one brand — observed live: "Moong Dal (Haldiram's)" and "Haldiram moong
 * dal (Haldiram)" were BOTH published because dedup fetched candidates by
 * exact brand and never compared the two. Lowercased, possessive and
 * punctuation stripped, first significant word, trailing plural "s" folded.
 */
export function brandKey(brand: string): string {
  const words = brand
    .toLowerCase()
    .replace(/['’`]s\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && w !== "the");
  const first = words[0] ?? "";
  return first.length >= 4 ? first.replace(/s$/, "") : first;
}

/**
 * Leading letters of a brand as typed (max 4), for a LIKE prefix that
 * fetches every spelling variant: "Hald" matches "Haldiram's" and
 * "Haldiram". brandKey then decides which candidates are the same brand.
 */
export function brandSearchPrefix(brand: string): string {
  const m = brand.trim().match(/^[a-z0-9]+/i);
  return (m ? m[0] : "").slice(0, 4);
}

/**
 * True when two product names look like the same product: 80%+ of the
 * shorter name's tokens appear in the other (allowing one edit per token
 * for words of 5+ chars). Single-token names must match exactly — "kissan"
 * must not block a future "Kissan Fresh Tomato Ketchup".
 */
export function namesLookAlike(a: string, b: string): boolean {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.length === 0 || B.length === 0) return false;
  if (A.length === 1 || B.length === 1) {
    return A.join(" ") === B.join(" ");
  }
  const matched = A.filter((w) =>
    B.some((x) => x === w || (w.length >= 5 && x.length >= 5 && withinOneEdit(w, x)))
  ).length;
  return matched / Math.min(A.length, B.length) >= 0.8;
}
