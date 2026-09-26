/**
 * Additive-code (INS / E-number) recognition shared by the label parser,
 * the food additive registry and the analysis-cache key — one definition so
 * the three can never disagree about what counts as a code.
 *
 * Indian labels print Codex INS numbers, which are numerically identical to
 * EU E-numbers, in many forms: "INS 296", "E503", "ins-334", "INS: 211",
 * "INS No. 211", "I.N.S. 211", "472e", "150 d" (spaced letter), and with a
 * sub-type qualifier: "503(ii)", "INS 163 (ii)".
 */
import { isKnownInsCode } from "./insCodes";

// Group 1: the prefix word — "INS" (incl. "INS No.", "I.N.S.") or "E" —
// then an optional ":" "-" "." separator.
export const CODE_PREFIX_SRC = "(i\\.?\\s?n\\.?\\s?s\\.?(?:\\s*no\\.?)?|e)\\s*[-:.]?\\s*";
// Groups 2-4: 3-4 digits; an optional a-f letter that may be spaced
// ("150 d") but must end the word; an optional sub-type qualifier. A lone
// digit qualifier is the OCR misread "452(1)" — accepted, then dropped.
export const CODE_BODY_SRC =
  "(\\d{3,4})(?:[\\s-]?([a-f])(?![a-z]))?(?:\\s*\\(\\s*(i{1,3}|iv|vi{0,3}|ix|x|\\d)\\s*\\))?";

const PREFIXED = new RegExp(`(?<!vitamin\\s)\\b${CODE_PREFIX_SRC}${CODE_BODY_SRC}(?![\\da-z])`, "i");

export interface AdditiveCode {
  /** Number + letter, lowercase: "150d", "472e", "330" — the registry identity. */
  code: string;
  /** Roman sub-type qualifier when present: "ii" in 503(ii). */
  qualifier: string | null;
  /** True when the code exists in the Codex INS list (or its later additions). */
  known: boolean;
}

/** Normalise a qualifier match: roman numerals kept, the OCR digit form dropped. */
export function normalizeQualifier(q: string | undefined): string | null {
  return q && !/^\d$/.test(q) ? q.toLowerCase() : null;
}

/**
 * The prefixed additive code in a name, or null. Only prefixed codes count:
 * a bare "330" inside an ingredient name is not an identity claim — the
 * parser is what turns bare label codes into prefixed ones. The negative
 * lookbehind keeps "Vitamin E 400 IU" (a dose) from resolving to E400.
 */
export function parseAdditiveCode(name: string): AdditiveCode | null {
  const m = name.toLowerCase().match(PREFIXED);
  if (!m) return null;
  const code = `${m[2]}${m[3] ?? ""}`;
  return { code, qualifier: normalizeQualifier(m[4]), known: isKnownInsCode(code) };
}

/** Registry identity code ("150d", "503") — qualifier ignored: the registry lists the family. */
export function extractAdditiveCode(name: string): string | null {
  return parseAdditiveCode(name)?.code ?? null;
}

/**
 * Identity key for a coded name: "ins 211", "ins 150d", "ins 500(ii)". The
 * qualifier is part of it — 500(i) sodium carbonate and 500(ii) sodium
 * bicarbonate are different substances. Uncoded names key on their
 * lowercased text. Used to de-duplicate a parsed label and (through
 * analysisCacheKey) for the shared analysis cache.
 */
export function canonicalIngredientKey(name: string): string {
  const parsed = parseAdditiveCode(name);
  if (!parsed) return name.toLowerCase().trim();
  return `ins ${parsed.code}${parsed.qualifier ? `(${parsed.qualifier})` : ""}`;
}
