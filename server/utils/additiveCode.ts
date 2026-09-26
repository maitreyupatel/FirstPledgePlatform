/**
 * Additive-code (INS / E-number) recognition shared by the label parser,
 * the food additive registry and the analysis-cache key — one definition so
 * the three can never disagree about what counts as a code.
 *
 * Indian labels print Codex INS numbers, which are numerically identical to
 * EU E-numbers: "INS 296", "E503", "ins-334", "472e", optionally with a
 * sub-type qualifier: "503(ii)", "INS 163 (ii)".
 */

/**
 * The normalised code in a name ("296", "472e", "150d"), or null. Only
 * prefixed codes count here — a bare "330" inside an ingredient name is not
 * an identity claim; the parser is what turns bare label codes into
 * prefixed ones. The negative lookbehind keeps "Vitamin E 400 IU" (a dose)
 * from resolving to E400.
 */
export function extractAdditiveCode(name: string): string | null {
  const match = name.toLowerCase().match(/(?<!vitamin\s)\b(?:e|ins)[-\s]?(\d{3,4}[a-z]?)\b/);
  return match ? match[1] : null;
}

/**
 * Analysis-cache key for an ingredient name. A coded additive is keyed by
 * its code, so "Preservative (211)", "PRESERVATIVE-E211" and "Preservative
 * Sodium Benzoate (INS 211)" share ONE analysis — one AI call instead of
 * one per label wording, and one consistent verdict for one substance.
 * Everything else keys on its lowercased name, as before.
 */
export function canonicalIngredientKey(name: string): string {
  const lower = name.toLowerCase().trim();
  const code = extractAdditiveCode(lower);
  return code ? `ins ${code}` : lower;
}
