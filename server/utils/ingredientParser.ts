/**
 * Parse a raw ingredient list string from Open Food Facts into clean ingredient names.
 *
 * Handles: nested and mismatched brackets, sub-ingredient parentheticals,
 * additive codes in every notation Indian labels print them in, asterisks,
 * underscores, numbers-only fragments, and trailing punctuation.
 *
 * Additive codes are the reason this is a scanner and not a chain of regexes.
 * Indian labels declare additives as a class plus codes — "Acidity
 * Regulators (330, 331)", "Raising Agents [INS 503(ii), 500(ii)]",
 * "Stabilisers 1422, 415", "Thickener-415" — and the code is the only
 * identity the additive has. Each code becomes its own ingredient, keeping
 * the class for readability: "Acidity Regulators INS 330". A lost code makes
 * the published report silently incomplete (Mountain Dew lost sodium
 * benzoate and tartrazine this way) or leaves a bare class name that cannot
 * be analyzed.
 *
 * THE RULE: when the text cannot be read with confidence — a lost comma, a
 * damaged or unknown code, a never-closed bracket — the output must trip
 * looksGarbledIngredientName so the product is HELD for human review. The
 * parser never invents a clean-looking name and never silently drops text
 * that may be an ingredient. (Two adversarial review rounds, 2026-09-26,
 * pin this with regression tests built from their reproductions.)
 */

import {
  CODE_PREFIX_SRC,
  CODE_BODY_SRC,
  canonicalIngredientKey,
  normalizeQualifier,
  parseAdditiveCode,
} from "./additiveCode";
import { isKnownInsCode } from "./insCodes";

/**
 * Normalize ingredient name to title case (first letter capital, rest lower).
 * Preserves established abbreviations: pH, DNA, AHA, BHA, SPF, UV, INS, etc.
 */
function toTitleCase(s: string): string {
  const PRESERVE_UPPER = /^(pH|DNA|AHA|BHA|BHT|BHQ|SPF|UV|UVA|UVB|RNA|EDTA|SLS|SLES|INS|II|III|IV)$/i;
  return s
    .split(" ")
    .map((word) => {
      if (PRESERVE_UPPER.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// ── Parse context ────────────────────────────────────────────────────────────

/** Names plus the subset that is HELD: exempt from filters, always garbled. */
interface Ctx {
  names: string[];
  held: Set<string>;
}

/** Record text we could not read. The brackets guarantee looksGarbledIngredientName fires. */
function hold(ctx: Ctx, label: string, raw: string): void {
  const name = `${label} (${raw.replace(/[()[\]{}]/g, " ").replace(/\s+/g, " ").trim()})`.trim();
  ctx.names.push(name);
  ctx.held.add(name);
}

// ── Additive-code grammar ────────────────────────────────────────────────────

// Inside a declared class bracket a bare number IS a code, so the prefix is optional.
const CODE_STICKY = new RegExp(`\\s*(?:${CODE_PREFIX_SRC})?${CODE_BODY_SRC}\\s*`, "iy");
const SEP_STICKY = new RegExp("\\s*(?:&|\\band\\b|/)?\\s*", "iy");

/**
 * The codes in `raw` when it consists ONLY of codes ("330", "INS 261 INS
 * 330", "INS 1422 & INS 415"), else null. Syntax only — unknown numbers are
 * returned too, and the caller holds them.
 */
function matchCodeRun(raw: string): RegExpExecArray[] | null {
  const found: RegExpExecArray[] = [];
  let pos = 0;
  while (pos < raw.length) {
    if (found.length > 0) {
      SEP_STICKY.lastIndex = pos;
      const sep = SEP_STICKY.exec(raw)!;
      pos = SEP_STICKY.lastIndex;
      if (pos >= raw.length) {
        if (/[&/]|and/i.test(sep[0])) return null; // "330 &" — the second code is missing
        break;
      }
    }
    CODE_STICKY.lastIndex = pos;
    const m = CODE_STICKY.exec(raw);
    if (!m || m[0].length === 0 || Number(m[2]) < 100) return null;
    found.push(m);
    pos = CODE_STICKY.lastIndex;
  }
  return found.length > 0 ? found : null;
}

const codeOf = (m: RegExpExecArray) => `${m[2]}${(m[3] ?? "").toLowerCase()}`;

/** "INS 503(ii)" / "E1422" — keeps the label's E-prefix, else Indian INS style. */
function formatCode(m: RegExpExecArray): string {
  const q = normalizeQualifier(m[4]);
  const body = `${codeOf(m)}${q ? `(${q})` : ""}`;
  return m[1]?.toLowerCase() === "e" ? `E${body}` : `INS ${body}`;
}

// Something that tried to be a code but cannot be read as a valid one:
// "10 (ii)" (lost digit), "21l" (l for 1), "5000th", and OCR forms with
// letters inside the number or qualifier: "INS l50d", "503(ll)", "16O c".
// Never dropped silently — the piece is held.
const CODE_LIKE = new RegExp(`^(?:${CODE_PREFIX_SRC})?\\d{1,5}(?:\\s?[a-z]{1,2})?\\s*(?:\\([^()]*\\))?$`, "i");
const OCR_CODE_LIKE = new RegExp(
  `^(?:${CODE_PREFIX_SRC})?(?=[\\dlo]*\\d[\\dlo]*\\d)[\\dlo]{2,5}(?:\\s?[a-f])?\\s*(?:\\([^()]*\\))?$`,
  "i",
);
// …but a bracketed quantity is not a code: "(100g)", "(2 mg)", "(0.9%)"
const QUANTITY = /^\s*\d+(?:[.,]\d+)?\s*(?:g|mg|kg|ml|l|mcg|iu|kcal|kj|%)\s*$/i;
const looksCodeLike = (raw: string) => !QUANTITY.test(raw) && (CODE_LIKE.test(raw) || OCR_CODE_LIKE.test(raw));

// Unbracketed code runs after a functional class — "Stabilisers 1422, 415",
// "ACIDITY REGULATOR - E260", "Thickener-415", "Flavour Enhancer-627 & 631",
// "Emulsifying Salts 339, 452" — are rewritten into the bracketed form so
// one code path handles all.
const CLASS_HEAD =
  "(?:regulators?|stabili[sz]ers?|thickeners?|preservatives?|colou?rs?|emulsifiers?|sweeteners?|enhancers?|agents?|anti[-\\s]?oxidants?|sequestrants?|humectants?|acidulants?|improvers?|salts?|gas(?:es)?|propellants?|acids?)";
const HEAD_BEFORE_CODE = new RegExp(`\\b${CLASS_HEAD}\\s*(?:[-–—:]\\s*)?(?=(?:${CODE_PREFIX_SRC})?\\d)`, "gi");
// A code in running text, not a quantity: "100 g", "150 kcal", "2%", "7,4" —
// while a comma list with no spaces ("627,631") is still a run of codes.
const CODE_AT = new RegExp(
  `(?:${CODE_PREFIX_SRC})?${CODE_BODY_SRC}(?![\\d%]|[.,]\\d{1,2}(?!\\d)|\\s*(?:mg|g|kg|ml|l|kcal|kj|mcg|iu)\\b)`,
  "iy",
);
const RUN_SEP = new RegExp("\\s*(?:,|&|\\band\\b|/)?\\s*", "iy");

/** End index of the code run starting at `pos`, or -1. Linear: one sticky step per code. */
function consumeCodeRun(s: string, pos: number): number {
  let end = -1;
  let p = pos;
  for (;;) {
    CODE_AT.lastIndex = p;
    const m = CODE_AT.exec(s);
    if (!m || Number(m[2]) < 100) break;
    end = CODE_AT.lastIndex;
    RUN_SEP.lastIndex = end;
    RUN_SEP.exec(s);
    if (RUN_SEP.lastIndex === end) break;
    p = RUN_SEP.lastIndex;
  }
  return end;
}

function bracketUnbracketedRuns(s: string): string {
  let out = "";
  let last = 0;
  HEAD_BEFORE_CODE.lastIndex = 0;
  for (let m = HEAD_BEFORE_CODE.exec(s); m; m = HEAD_BEFORE_CODE.exec(s)) {
    const start = HEAD_BEFORE_CODE.lastIndex;
    const end = consumeCodeRun(s, start);
    if (end <= start) continue;
    out += `${s.slice(last, m.index)}${m[0].replace(/[\s\-–—:]+$/, "")} (${s.slice(start, end).trim()})`;
    last = end;
    HEAD_BEFORE_CODE.lastIndex = end;
  }
  return out + s.slice(last);
}

// ── Bracket-aware scanning ───────────────────────────────────────────────────

type Segment =
  | { kind: "text"; text: string }
  | { kind: "group"; inner: string; raw: string };

const OPENERS = "([{";
const CLOSERS = ")]}";

/**
 * Pair brackets tolerantly: any closer closes the innermost open group, so a
 * label's "[Barley, Wheat, Millet)" still reads as one group. Brackets left
 * unmatched stay in the text as literal characters, where
 * looksGarbledIngredientName sees them and holds the product for review —
 * a trust platform must not guess where a damaged group ends.
 */
function pairBrackets(s: string): Map<number, number> {
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (OPENERS.includes(s[i])) stack.push(i);
    else if (CLOSERS.includes(s[i]) && stack.length > 0) pairs.set(stack.pop()!, i);
  }
  return pairs;
}

/** Per-index flag: inside some bracket pair (depth > 0). */
function insideBrackets(s: string): boolean[] {
  const inside = new Array<boolean>(s.length).fill(false);
  for (const [open, close] of Array.from(pairBrackets(s))) {
    for (let k = open + 1; k < close; k++) inside[k] = true;
  }
  return inside;
}

/** A comma inside a chemical locant ("1,2-Hexanediol") is not a separator. */
function isLocantComma(s: string, i: number): boolean {
  return /\d/.test(s[i - 1] ?? "") && /^\d+(?:,\d+)*-[a-z]/i.test(s.slice(i + 1));
}

// Label abbreviations that end in "." without ending a sentence:
// "Edible Veg. Oil", "Nat. Identical", "Refd. Palmolein", "subsp.".
const ABBREVIATIONS =
  /^(?:subsp|ssp|spp|sp|var|vit|approx|viz|etc|incl|st|no|mfd|mfg|veg|nat|refd|conc|sol|cond|hydrog|dehyd|pdr|ext|min|max|pvt|ltd|co)$/i;

/** A "." that is an abbreviation or an initial ("subsp.", "L. Acidophilus"), not a sentence end. */
function isAbbreviationDot(s: string, i: number): boolean {
  const before = s.slice(Math.max(0, i - 24), i);
  const word = /([a-z]+)$/i.exec(before)?.[1] ?? "";
  if (ABBREVIATIONS.test(word)) return true;
  if (word.length !== 1) return false;
  // "Vitamin A. CONTAINS …" ends the ingredient; so does a declaration keyword
  if (/\bvitamin\s+[a-z]$/i.test(before)) return false;
  const next = /^\s+(\S+)/.exec(s.slice(i + 1))?.[1] ?? "";
  return !/^(?:contains|may|allergen|ingredients?)\b/i.test(next);
}

// Separator length at s[i] (0 = not a separator), for the ingredient list
// itself and for the inside of an additive group. Newlines are separators
// only in a list laid out one-ingredient-per-line; elsewhere they are line
// wraps inside a name ("Butyl\nMethoxydibenzoylmethane") and become spaces.
function topLevelSeparator(s: string, i: number): number {
  const c = s[i];
  if (c === ",") return isLocantComma(s, i) ? 0 : 1;
  if (c === ";") return 1;
  // Sentence end: "…(INS 211). CONTAINS PERMITTED…"
  if (c === "." && /^\s+[A-Z]/.test(s.slice(i + 1)) && !isAbbreviationDot(s, i)) return 1;
  return 0;
}

function newlineListSeparator(s: string, i: number): number {
  return s[i] === "\n" ? 1 : topLevelSeparator(s, i);
}

// Inside an additive group only commas and semicolons separate pieces;
// "&", "and" and "/" join codes ("INS 1422 & INS 415", handled by
// matchCodeRun) or belong to names ("Mono and Diglycerides of Fatty Acids").
function groupSeparator(s: string, i: number): number {
  const c = s[i];
  if (c === ",") return isLocantComma(s, i) ? 0 : 1;
  return c === ";" ? 1 : 0;
}

// A lone line that can only END a name: its line break is a wrap.
const NAME_FINAL_LINE =
  /^(?:oil|butter|extract|sulfate|sulphate|acid|powder|flour|betaine|gum|wax|seeds?|leaf|leaves|root|juice|water|glycol|glycerin|chloride|protein|starch)$/i;

/**
 * "list" — one ingredient per line: "Carrot\nLodhra Bark\nZinc Oxide".
 * "wrap" — a comma list wrapped across lines ("Salt, Potassium\nIodate"):
 *   newlines are spaces. Only the last line of a real list may carry commas.
 * "ambiguous" — one-per-line layout whose names ALSO wrap ("Butyrospermum
 *   Parkii\n(Shea) Butter"): splitting would publish fragments, joining
 *   would guess, so the label is held.
 */
function newlineLayout(s: string): "list" | "wrap" | "ambiguous" {
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3 || lines.slice(0, -1).some((line) => /[,;]/.test(line))) return "wrap";
  const wrapped = lines.slice(1).some(
    (line, k) => /^[([{a-z]/.test(line) || /(?:[-&/]|\band|\bof)$/i.test(lines[k]) || NAME_FINAL_LINE.test(line),
  );
  return wrapped ? "ambiguous" : "list";
}

/** Newlines inside brackets are always wraps — flatten them. */
function flattenBracketNewlines(s: string): string {
  const inside = insideBrackets(s);
  let out = "";
  for (let k = 0; k < s.length; k++) out += s[k] === "\n" && inside[k] ? " " : s[k];
  return out;
}

/** Split `s` at depth 0 into items, each a list of text/group segments. */
function splitTopLevel(s: string, separatorAt: (s: string, i: number) => number): Segment[][] {
  const pairs = pairBrackets(s);
  const items: Segment[][] = [];
  let current: Segment[] = [];
  let text = "";
  const flushText = () => {
    if (text) current.push({ kind: "text", text });
    text = "";
  };
  for (let i = 0; i < s.length; i++) {
    const close = pairs.get(i);
    // INCI blend notation: "Titanium Dioxide (and) Silica" is two ingredients
    if (close !== undefined && s.slice(i + 1, close).trim().toLowerCase() === "and") {
      flushText();
      items.push(current);
      current = [];
      i = close;
      continue;
    }
    if (close !== undefined) {
      flushText();
      current.push({ kind: "group", inner: s.slice(i + 1, close), raw: s.slice(i, close + 1) });
      i = close;
      continue;
    }
    const sep = separatorAt(s, i);
    if (sep > 0) {
      flushText();
      items.push(current);
      current = [];
      i += sep - 1;
      continue;
    }
    text += s[i];
  }
  flushText();
  items.push(current);
  return items;
}

function rawOf(segments: Segment[]): string {
  return segments.map((seg) => (seg.kind === "text" ? seg.text : seg.raw)).join("");
}

/** `s` with its bracketed groups removed: "artificial (cola) flavouring" → "artificial  flavouring". */
function withoutGroups(s: string): string {
  return splitTopLevel(s, () => 0)
    .flat()
    .map((seg) => (seg.kind === "text" ? seg.text : " "))
    .join("");
}

// Memo for groupHasCode, reset per parse: every emit path asks about the
// same subtrees, and without it cost grows with nesting depth cubed.
let hasCodeMemo = new Map<string, boolean>();

/**
 * True when a group declares additive codes — readable, unknown or OCR-
 * damaged ("INS l50d", "503(ll)") — directly or nested. Damaged codes must
 * route through emitAdditiveGroup, where they are held, not dropped with
 * the bracket as a plain note.
 */
function groupHasCode(inner: string): boolean {
  const memo = hasCodeMemo.get(inner);
  if (memo !== undefined) return memo;
  let found = false;
  for (const piece of splitTopLevel(inner, groupSeparator)) {
    const raw = rawOf(piece).trim();
    if (
      matchCodeRun(raw) ||
      (OCR_CODE_LIKE.test(raw) && !QUANTITY.test(raw)) ||
      piece.some((seg) => seg.kind === "group" && groupHasCode(seg.inner))
    ) {
      found = true;
      break;
    }
  }
  hasCodeMemo.set(inner, found);
  return found;
}

// Real labels nest brackets three deep at most. Anything deeper is damage
// (or hostile input) — held, never recursed into without bound.
const MAX_BRACKET_DEPTH = 8;

function maxBracketDepth(s: string): number {
  let depth = 0;
  let max = 0;
  for (const c of s) {
    if (OPENERS.includes(c)) max = Math.max(max, ++depth);
    else if (CLOSERS.includes(c) && depth > 0) depth--;
  }
  return max;
}

// ── Statements inside the list ───────────────────────────────────────────────

// A bracketed additive code, not a bracketed quantity: "(INS 211)",
// "(330, 331)" — but not "(100g)".
const CODE_GROUP_IN_TEXT = new RegExp(`\\(\\s*(?:${CODE_PREFIX_SRC})?\\d{3,4}(?:\\s?[a-f])?\\s*(?:\\(\\s*[ivx]+\\s*\\))?\\s*[,)&]`, "i");

// "Contains <class word>" declares an ADDITIVE ("Contains Permitted
// Synthetic Food Colour", "Contains Natural Colour (Annatto)"); any other
// "Contains …" sentence is an allergen statement.
const DECLARED_CLASS =
  "(?:(?:added|permitted|natural|synthetic|artificial|nature[\\s-]identical|food)\\s+)*(?:colou?rs?|flavou?rs?|flavourings?|preservatives?|sweeteners?)\\b";

// Statements that are not ingredients. Removed ONE SENTENCE at a time —
// never "everything after": labels print "CONTAINS PERMITTED … COLOUR
// (INS 102)" after the allergen line, and truncating there published lists
// without their colours. Allergen headers ("ALLERGEN ADVICE:") are
// unambiguous anywhere outside brackets; the rest only when they start a
// sentence — mid-list, "…, store in a cool dry place Acidity Regulator
// (INS 260)" is left in place so the garbled-name gate holds it.
const ALLERGEN_HEADER = /\ballerg\w*(?:\s+\w+)?\s*:/gi;
const SENTENCE_STATEMENT = new RegExp(
  `(?:^|[.;!]\\s+|\\n\\s*)((?:manufactured\\s+in\\s+a\\s+facility|store\\s+(?:in|at|below|under)\\b|keep\\s+(?:refrigerated|in\\s+a\\s+cool)|refrigerate\\s+after\\s+opening|best\\s+before\\b)|contains\\s+(?!${DECLARED_CLASS})|may\\s+contains?\\b)`,
  "gi",
);

/** Index of the end of the depth-0 sentence starting at `at` (exclusive). */
function sentenceEnd(s: string, at: number, inside: boolean[]): number {
  for (let k = at; k < s.length; k++) {
    if (inside[k]) continue;
    if (s[k] === ";" || s[k] === "\n") return k + 1;
    if (s[k] === "." && (k + 1 >= s.length || /\s/.test(s[k + 1]))) return k + 1;
  }
  return s.length;
}

function removeStatements(input: string): string {
  let s = input;
  for (let guard = 0; guard < 200; guard++) {
    const inside = insideBrackets(s);
    let at = -1;
    for (const m of Array.from(s.matchAll(ALLERGEN_HEADER))) {
      if (!inside[m.index ?? 0]) {
        at = m.index ?? 0;
        break;
      }
    }
    for (const m of Array.from(s.matchAll(SENTENCE_STATEMENT))) {
      const start = (m.index ?? 0) + m[0].length - m[1].length;
      if (inside[start]) continue;
      // "Contains … (INS 129)" declares an additive — keep that sentence
      const sentence = s.slice(start, sentenceEnd(s, start, inside));
      if (/^contains/i.test(m[1]) && CODE_GROUP_IN_TEXT.test(sentence)) continue;
      if (at === -1 || start < at) at = start;
      break;
    }
    if (at === -1) return s;
    // Leave a boundary where the statement was: "Substances Allergen
    // Declaration: Contains Milk. May Contains Soy" must not glue "May
    // Contains Soy" onto "Substances" (no longer sentence-initial).
    s = `${s.slice(0, at)}; ${s.slice(sentenceEnd(s, at, inside))}`;
  }
  return s;
}

// A nutrition panel appended after the list ("TOMATO KETCHUP NUTRITIONAL
// INFORMATION … ENERGY VALUE (kcal)") is cut from the start of its sentence
// (so the panel's product-name heading goes too) — but only when nutrient
// words confirm it, the sentence starts at a real sentence boundary, and
// nothing after it declares an additive. Mid-list OCR bleed is left in
// place: the garbled-name gate holds it instead of a silent truncation.
const NUTRITION_PANEL =
  /n[uú]tri(?:tion|tional)\s+(?:information|facts|values?)\b(?=[\s\S]{0,200}?\b(?:energy|kcal|protein|carbohydrates?|fat)\b)/gi;

const PANEL_WORD =
  /^(?:nutritional|nutrition|information|facts?|values?|per|serves?|serving|servings|size|energy|kcal|kj|calories|proteins?|carbohydrates?|carbs|sugars?|added|total|fats?|saturated|trans|mono|poly|unsaturated|cholesterol|sodium|salt|fib(?:re|er)|dietary|of|which|approx|approximate|rda|gda|value|amount|daily|contribution|iron|calcium|vitamins?|tbsp|tsp|pack|contains?|approximately|and)$/i;

/** Everything left is nutrition-panel vocabulary, figures, units or OCR noise. */
function isPanelOnly(tail: string): boolean {
  return tail
    .toLowerCase()
    .replace(/[()[\]{}%:;,./*#'"–—-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => PANEL_WORD.test(t) || /^\d+(?:[.,]\d+)?[a-z]{0,4}$/.test(t) || t.length <= 3);
}

function cutNutritionPanel(s: string): string {
  const inside = insideBrackets(s);
  for (const m of Array.from(s.matchAll(NUTRITION_PANEL))) {
    const at = m.index ?? 0;
    if (inside[at]) continue;
    const tail = s.slice(at);
    // Only a panel that really is the tail: nothing after it but panel text
    if (CODE_GROUP_IN_TEXT.test(tail) || !isPanelOnly(tail)) continue;
    let boundary = -1;
    let sentence = false;
    for (let k = at - 1; k > 0; k--) {
      if (inside[k]) continue;
      if (s[k] === "\n" || (s[k] === "." && /\s/.test(s[k + 1] ?? ""))) {
        boundary = k;
        sentence = true;
        break;
      }
      if (s[k] === "," || s[k] === ";") {
        boundary = k;
        break;
      }
    }
    if (boundary <= 0) continue;
    const lead = s.slice(boundary + 1, at);
    // "…, Preservative (INS 211, INS 202) NUTRITIONAL INFORMATION …": the
    // lead is the last ingredient — cut at the heading itself.
    if (CODE_GROUP_IN_TEXT.test(lead) || /[)\]}]\s*$/.test(lead)) return s.slice(0, at);
    // "…(INS 211). TOMATO KETCHUP NUTRITIONAL INFORMATION …": a sentence
    // that is the panel's product-name heading — cut from its start.
    if (sentence) return s.slice(0, boundary + 1);
    // "…, Tomato Ketchup NUTRITIONAL …": ingredient or heading? Not cut —
    // the garbled-name gate holds it.
  }
  return s;
}

// ── Per-name cleanup (unchanged rules, applied per emitted name) ─────────────

function cleanName(s: string): string {
  let clean = s.trim();
  // Strip EU additive/category labels: "emulsifier: lecithins" → "lecithins"
  const colonIdx = clean.lastIndexOf(":");
  if (colonIdx !== -1 && colonIdx < clean.length - 2) {
    clean = clean.slice(colonIdx + 1).trim();
  }
  // Strip European decimal percentages FIRST (e.g. "7,4%" or "8.7%")
  // Must match before plain number stripping
  clean = clean.replace(/\s+\d+[,\.]\d+\s*%\s*$/, "");
  // Strip trailing integer percentages ("hazelnuts 13%")
  clean = clean.replace(/\s+\d+\s*%\s*$/, "");
  // Strip leading percentages/numbers ("2% nonfat milk" → "nonfat milk") —
  // but never a chemical locant: "1,2-Hexanediol" is not "Hexanediol"
  if (!/^\d+(?:,\d+)*-[a-z]/i.test(clean)) {
    clean = clean.replace(/^\d+[,\.]?\d*\s*%?\s*/, "");
  }
  // Strip a standalone 1-2 digit trailing number — the remnant of a split
  // percentage ("cacao maigre 7" from "cacao maigre 7,4%"). A 3-4 digit one
  // may be an unprefixed code ("Emulsifying Salts 339"): kept, so the gate
  // holds it instead of the code vanishing.
  clean = clean.replace(/\s+\d{1,2}$/, "");
  // Strip trailing punctuation (incl. stray label quotes: 'Vegetables"')
  clean = clean.replace(/[.:;"“”]+$/, "").trim();
  // Strip unmatched trailing closers left by malformed label text
  // e.g. "Microbial Rennet)" from "(cultures, Microbial Rennet)" split on comma
  while (
    (clean.endsWith(")") && !clean.includes("(")) ||
    (clean.endsWith("]") && !clean.includes("["))
  ) {
    clean = clean.slice(0, -1).trim();
  }
  // Strip leading stray punctuation: "-Butylene Glycol", "'CONTAINS...", "& Colour"
  clean = clean.replace(/^[\s\-–—.·'"`´&,]+/, "").trim();
  // Collapse multiple spaces
  clean = clean.replace(/\s{2,}/g, " ").trim();
  // Normalize ALL-CAPS words to title case for better readability and AI analysis
  // "LACTOSERUM en poudre" → "Lactoserum En Poudre"
  if (clean === clean.toUpperCase() && clean.length > 3) {
    clean = toTitleCase(clean);
  } else if (/^[A-Z]{4,}/.test(clean.split(" ")[0])) {
    // First word is all-caps: "LAIT écrémé en poudre" → "Lait écrémé en poudre"
    const words = clean.split(" ");
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
    clean = words.join(" ");
  }
  return clean;
}

const CONNECTOR_LEAD = /^[\s,&]*(?:(?:and|with|plus)\s+)?/i;

/** Class text around a code group: "and Emulsifier Of Vegetable Origin" → "Emulsifier Of Vegetable Origin". */
function cleanClass(s: string): string {
  const stripped = s.replace(CONNECTOR_LEAD, "").replace(/(?:[\s\-–—:&,]|\s(?:and|with)\b)+$/i, "");
  return stripped.trim() ? cleanName(stripped) : "";
}

// ── Class vocabulary ─────────────────────────────────────────────────────────

const QUALIFIERS =
  "natural|artificial|synthetic|organic|intense|low[\\s-]calorie|non[\\s-]nutritive|nutritive|vegetable|plant[\\s-]based|nature[\\s-]identical|permitted|added|food|class[\\s-]*(?:ii|ll|2)|edible|bulk|high[\\s-]intensity|table[\\s-]top";

// FSSAI functional classes. One list feeds both the class-phrase detector
// and the "bracket names the additive" rule, so they cannot drift apart.
const FUNCTIONAL_CLASSES = [
  "acidity\\s+regulators?",
  "acidulants?",
  "anti[-\\s]?caking\\s+agents?",
  "anti[-\\s]?foaming\\s+agents?",
  "anti[-\\s]?oxidants?",
  "bulking\\s+agents?",
  "emulsifiers?",
  "emulsifying\\s+(?:salts?|agents?)",
  "firming\\s+agents?",
  "flavou?r\\s+enhancers?",
  "flour\\s+treatment\\s+agents?",
  "gelling\\s+agents?",
  "glazing\\s+agents?",
  "humectants?",
  "raising\\s+agents?",
  "leavening\\s+agents?",
  "preservatives?",
  "sequeste?rants?",
  "stabili[sz]ers?",
  "stabili[sz]ing\\s+agents?",
  "sweeteners?",
  "thickeners?",
  "thickening\\s+agents?",
];
// "Thickening & Gelling Agent", "Emulsifying & Stabilizing Agent": one class
const PAIRED_CLASS_PREFIX =
  "(?:(?:thickening|gelling|stabili[sz]ing|emulsifying|raising|leavening|firming|glazing|bulking)\\s*(?:&|and)\\s*)*";
const CLASS_PHRASE_SRC = `(?:(?:${QUALIFIERS})\\s+)*${PAIRED_CLASS_PREFIX}(?:${FUNCTIONAL_CLASSES.join("|")})`;

// When a label drops the comma before a class phrase ("Iodised Salt
// Acidity Regulator (E260)"), the text before the phrase is a separate
// ingredient. Colours are deliberately absent: "Beetroot Colour (162)" is
// one identity.
const CLASS_PHRASE = new RegExp(`\\b${CLASS_PHRASE_SRC}\\b`, "i");
const CLASS_PHRASE_START = new RegExp(`^\\s*${CLASS_PHRASE_SRC}\\b`, "i");
const QUALIFIER_OR_CONNECTOR = new RegExp(`^(?:${QUALIFIERS}|and|&|with|of)$`, "i");
// One word in front of a class is usually its SOURCE, not a lost comma:
// "Soy Emulsifier (INS 322)", "Sunflower Lecithin", "Vegetable Oil".
const SOURCE_WORD =
  /^(?:soy|soya|sunflower|vegetable|plant|corn|maize|wheat|palm|milk|egg|rice|tapioca|potato|citrus|fruit|seaweed|guar|xanthan|rapeseed|canola|cotton|coconut|cane|beet|natural|mineral|microbial|fungal|bacterial)$/i;

// "CONTAINS PERMITTED SYNTHETIC FOOD COLOUR (129)" is the mandatory FSSAI
// declaration of a real additive, not an allergen disclaimer — keep the
// additive, drop the boilerplate. With a code it is always a declaration;
// without one, only when a colour/flavour/preservative/sweetener follows.
const DECLARATION_LEAD_CODED = /^\s*(?:contains|may\s+contains?)\s+(?:(?:added|permitted)\s+)*/i;
const DECLARATION_LEAD = new RegExp(`^\\s*contains\\s+(?=${DECLARED_CLASS})(?:(?:added|permitted)\\s+)*`, "i");

// "added"/"permitted" are declaration boilerplate, never identity:
// "Added Flavour" is as unanalyzable as "Flavour".
const BARE_CLASS =
  /^(?:(?:added|permitted)\s+)*(extracts?|flavou?rs?|colou?rs?|emulsifiers?|stabili[sz]ers?|thickeners?|preservatives?|acids?|sweeteners?|spices?)$/i;
// A class whose bracket NAMES what it contains: every functional class,
// plus acids, spices, minerals and vitamins.
const FUNCTIONAL_CLASS = new RegExp(
  `^(?:(?:${QUALIFIERS})\\s+)*${PAIRED_CLASS_PREFIX}(?:${FUNCTIONAL_CLASSES.join("|")}|acids?|spices?|minerals?|vitamins?)$`,
  "i",
);
const VITAMIN_OR_MINERAL = /(?:minerals?|vitamins?)$/i;
// A class whose bracket DESCRIBES it: "Flavour (Cream)" is a cream
// flavouring, not cream; "Colour (Caramel)" is caramel colour, not caramel.
const DESCRIPTOR_CLASS = new RegExp(`^(?:(?:${QUALIFIERS})\\s+)*(?:flavou?rs?|flavo(?:u)?rings?|colou?rs?|extracts?)$`, "i");
const DESCRIPTOR_STEM = /flavo|colou?r|extract/i;
const ADJECTIVE_ONLY = /^(?:natural|artificial|synthetic|organic|added|permitted|nature[-\s]identical)$/i;
const QUALIFIER_WORD = /^(?:natural|artificial|synthetic|organic|added|permitted|nature|identical|nature-identical|and|&)$/i;
// Words that only DESCRIBE a class, never name its substance:
// "Emulsifier (Vegetable Origin)", "Preservatives (Class II)".
const DESCRIPTOR_WORD =
  /^(?:of|from|as|vegetable|plant|based|origin|source|derived|class|ii|iii|2|food|grade|natural|artificial|synthetic|nature|identical|nature-identical|low|calorie|non-nutritive|nutritive|high|intensity|permitted|added|flavouring|agents?|organic|and|&|-)$/i;
// Does a bracket piece NAME a substance ("Citric Acid", "Sodium
// Bicarbonate", "Pectin")? Anything else under a functional class is kept
// with its class ("Soy Emulsifier") rather than promoted to an identity.
const SUBSTANCE_WORD =
  /^(?:lecithins?|pectins?|gums?|gelatine?|agar|carrageenans?|starch(?:es)?|extracts?|oils?|tocopherols?|acids?|glycerol|glycerine?|sorbitol|xylitol|mannitol|maltitol|erythritol|dextrins?|maltodextrins?|cellulose|caramel|curcumin|annatto|carotenes?|chlorophylls?|riboflavin|niacin|papain|bromelain|enzymes?|cultures?|esters?|glycerides|salts?|sugars?|yeast|vanillin|menthol|aspartame|sucralose|saccharin|stevia|glycosides|potassium|sodium|calcium|magnesium|zinc|iron|pepper|chillies|chilli|chili|turmeric|cumin|coriander|ginger|garlic|cardamom|cloves?|cinnamon|nutmeg|mace|fenugreek|mustard|fennel|ajwain|asafoetida|onion|powder|seeds?|leaves)$/i;
const SUBSTANCE_SUFFIX = /(?:ate|ite|ide|ose|ase)$/i;
function namesSubstance(piece: string): boolean {
  const last = piece.trim().split(/\s+/).pop() ?? "";
  return SUBSTANCE_WORD.test(last) || (last.length >= 5 && SUBSTANCE_SUFFIX.test(last));
}

// Words that continue an ingredient name after its bracketed common name —
// INCI "Beta Vulgaris (Beet) Root Extract", and Indian "Cumin (Jeera)
// Seeds", "Bengal Gram (Chana) Dal", "Sorghum (Jowar) Flour".
const CONTINUATION_WORD =
  /^(?:fruits?|leaf|leaves|roots?|seeds?|seedcake|flowers?|bark|peel|kernels?|nuts?|stem|rhizome|oil|extracts?|juice|water|milk|powder|starch|butter|wax|gum|resin|callus|sprouts?|bulb|fib(?:er|re)|pulp|shell|husk|bran|germ|protein|ferment|filtrate|cells?|meristem|branch|twig|wood|herb|aerial|flour|meal|sap|tuber|cone|needle|thallus|gel|lipids?|sterols?|glycerides|dal|paste|flakes|chunks|solids|slices|cubes|pieces|grits|concentrate)$/i;
// …but not when the head is already a complete ingredient: "Edible
// Vegetable Oil (Palmolein) Milk Solids" lost a comma.
const COMPLETE_HEAD =
  /\b(?:oils?|flour|salt|sugar|powder|solids|starch|extract|juice|water|paste|syrup|butter|cheese|cream|fat|protein)\s*$/i;

const PERCENT_ONLY = /^\s*[\d.,]+\s*%\s*$/;
const hasWord = (s: string) => /[a-z]{3,}/i.test(s);

// ── Emission ─────────────────────────────────────────────────────────────────

/** Emit any ingredient merged in front of the class, return the class itself. */
function splitClassText(text: string, ctx: Ctx): string {
  const declared = text.replace(DECLARATION_LEAD_CODED, "");
  const m = CLASS_PHRASE.exec(declared);
  if (!m || m.index === 0) return cleanClass(declared);
  const rawBefore = declared.slice(0, m.index);
  const before = cleanClass(rawBefore);
  const words = before.split(/\s+/).filter((w) => w && !QUALIFIER_OR_CONNECTOR.test(w));
  if (words.length === 0) return cleanClass(declared);
  // The label marked the boundary itself: "Refined Rice Bran Oil with Antioxidant (INS 319)"
  if (/(?:\b(?:with|and|plus)|&|,)\s*$/i.test(rawBefore)) {
    ctx.names.push(before);
    return cleanClass(declared.slice(m.index));
  }
  // "Soy Emulsifier (INS 322)": a source word is part of the class
  if (words.length === 1 && SOURCE_WORD.test(words[0])) return cleanClass(declared);
  if (words.length <= 3) {
    ctx.names.push(before);
  } else {
    // Several ingredients glued together by lost commas — can't be split safely
    hold(ctx, before, "merged label text");
  }
  return cleanClass(declared.slice(m.index));
}

/**
 * Emit one ingredient per code in an additive group, prefixed by its class.
 * Named pieces ("Soy Lecithin" in "Emulsifiers (Soy Lecithin, 471)") and
 * nested coded sub-ingredients are emitted too. A piece that looks like a
 * code but is not a valid one — or a code missing from the Codex INS list —
 * is held instead of dropped.
 */
function emitAdditiveGroup(cls: string, inner: string, ctx: Ctx): void {
  for (const piece of splitTopLevel(inner, groupSeparator)) {
    const raw = rawOf(piece).trim();
    if (!raw || PERCENT_ONLY.test(raw)) continue;
    const codes = matchCodeRun(raw);
    if (codes) {
      for (const m of codes) {
        if (!isKnownInsCode(codeOf(m))) hold(ctx, cls, m[0].trim());
        else ctx.names.push(cls ? `${cls} ${formatCode(m)}` : formatCode(m));
      }
      continue;
    }
    if (looksCodeLike(raw)) {
      hold(ctx, cls, raw);
      continue;
    }
    emitItem(piece, ctx);
  }
}

/**
 * Split an item where the label lost a comma after a bracket group:
 * - an origin qualifier stays with the ingredient ("(INS 471) of Vegetable Origin");
 * - a connector ("and", "&", ",") starts a new ingredient;
 * - after a code group or a QUID percentage, or at a class phrase, more
 *   words start a new ingredient ("SALT(0.9%) YEAST", "(CLOVE) PRESERVATIVE…");
 * - a bracketed common name mid-name continues it ("Zea Mays (Corn) Starch",
 *   "Cumin (Jeera) Seeds") when the head is not already a whole ingredient;
 * - anything else after a group is ambiguous — "Mixed spices (…) Salt Sugar
 *   Flavour enhancer" — so the item is held.
 */
function splitAfterGroups(segments: Segment[], ctx: Ctx): Segment[][] | null {
  const parts: Segment[][] = [];
  let cur: Segment[] = [];
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    const prev = cur[cur.length - 1];
    if (seg.kind === "text" && prev?.kind === "group" && hasWord(seg.text)) {
      if (/^\s*[-:]?\s*(?:of|from|derived|sourced|obtained|extracted)\b/i.test(seg.text)) {
        cur.push(seg);
        continue;
      }
      const connector = /^\s*(?:,|&|and\b|with\b|plus\b)\s*/i.exec(seg.text);
      if (connector) {
        parts.push(cur);
        cur = [{ kind: "text", text: seg.text.slice(connector[0].length) }];
        continue;
      }
      if (PERCENT_ONLY.test(prev.inner) || groupHasCode(prev.inner) || CLASS_PHRASE_START.test(seg.text)) {
        parts.push(cur);
        cur = [seg];
        continue;
      }
      if (continuesName(cur, prev.inner, seg.text)) {
        cur.push(seg);
        continue;
      }
      hold(ctx, cleanName(withoutGroups(rawOf(segments))), "label lost a comma");
      return null;
    }
    cur.push(seg);
  }
  parts.push(cur);
  return parts;
}

/** "Zea Mays (Corn) Starch", "Artificial (Vanilla) Flavouring Substances". */
function continuesName(cur: Segment[], groupInner: string, next: string): boolean {
  if (splitTopLevel(groupInner, topLevelSeparator).length > 1) return false; // a sub-ingredient list
  const head = cur.map((s) => (s.kind === "text" ? s.text : " ")).join("");
  const words = next.trim().split(/\s+/).filter(Boolean);
  if (/\b(?:natural|artificial|synthetic|identical)\s*$/i.test(head)) {
    return words.length > 0 && words.every((w) => /^(?:flavou?rings?|flavou?rs?|substances?|colou?rs?)$/i.test(w));
  }
  if (COMPLETE_HEAD.test(head)) return false;
  return words.length > 0 && words.every((w) => CONTINUATION_WORD.test(w));
}

/** Emit the ingredient(s) of one list item. */
function emitItem(input: Segment[], ctx: Ctx): void {
  const segments = stripLead(input, DECLARATION_LEAD);
  if (!segments.some((s) => (s.kind === "text" ? /[a-z0-9]/i.test(s.text) : true))) return;

  const parts = splitAfterGroups(segments, ctx);
  if (!parts) return; // held
  if (parts.length > 1) {
    for (const part of parts) emitItem(part, ctx);
    return;
  }

  const codeAt = segments.findIndex((s) => s.kind === "group" && groupHasCode(s.inner));
  if (codeAt === -1) {
    emitPlainItem(segments, ctx);
    return;
  }
  const clsText = segments.slice(0, codeAt).map((s) => (s.kind === "text" ? s.text : " ")).join("");
  const codeGroup = segments[codeAt] as { kind: "group"; inner: string };

  // "Refined Palm Oil (with Antioxidant (INS 319))": the bracket carries an
  // additive declaration, and the text before it is an ingredient in its
  // own right — not the additive's class. Emit both.
  const pieces = splitTopLevel(codeGroup.inner, groupSeparator).map((p) => rawOf(p).trim()).filter(Boolean);
  const declarative = pieces.some((raw) => !matchCodeRun(raw) && !looksCodeLike(raw) && !PERCENT_ONLY.test(raw));
  const clsName = cleanName(withoutGroups(clsText.replace(DECLARATION_LEAD_CODED, "")));
  const clsIsClass =
    CLASS_PHRASE.test(clsText) || BARE_CLASS.test(clsName) || FUNCTIONAL_CLASS.test(clsName) || /colou?r|flavo|extract/i.test(clsText);
  if (declarative && hasWord(clsText) && !clsIsClass) {
    emitPlainItem(segments.slice(0, codeAt), ctx);
    for (const seg of segments.slice(codeAt)) {
      if (seg.kind === "group" && groupHasCode(seg.inner)) emitAdditiveGroup("", seg.inner, ctx);
    }
    return;
  }

  // Class text = the words before the first code group (other groups there
  // are sub-ingredients/notes and are dropped, as for any ingredient).
  const cls = splitClassText(clsText, ctx);
  for (const seg of segments.slice(codeAt)) {
    if (seg.kind === "group" && groupHasCode(seg.inner)) emitAdditiveGroup(cls, seg.inner, ctx);
  }
}

function stripLead(segments: Segment[], lead: RegExp): Segment[] {
  const first = segments[0];
  if (first?.kind !== "text" || !lead.test(first.text)) return segments;
  return [{ kind: "text", text: first.text.replace(lead, "") }, ...segments.slice(1)];
}

// A prefixed code at the end of the text so far: "Sodium Bicarbonate INS 500"
const CODE_AT_END = new RegExp(`\\b${CODE_PREFIX_SRC}\\d{3,4}(?:\\s?[a-f])?\\s*$`, "i");
const ROMAN_QUALIFIER = /^\s*(i{1,3}|iv|vi{0,3}|ix|x)\s*$/i;

/** An item with no additive codes: a plain ingredient, possibly a class with its identity in brackets. */
function emitPlainItem(segments: Segment[], ctx: Ctx): void {
  let head = "";
  const inners: string[] = [];
  let afterGroup = false;
  for (const seg of segments) {
    if (seg.kind === "text") {
      // Wordless text after a group is a stray QUID or OCR residue
      // ("(MAIDA) 68%", "(…VANILLA)mm"), never part of the name
      if (!afterGroup || hasWord(seg.text)) head += seg.text;
      continue;
    }
    // "Sodium Bicarbonate INS 500(ii)": a sub-type qualifier belongs to the
    // code in front of it — 500(i) and 500(ii) are different substances.
    if (CODE_AT_END.test(head)) {
      const q = ROMAN_QUALIFIER.exec(seg.inner);
      if (q) {
        head = `${head.trimEnd()}(${q[1].toLowerCase()})`;
        continue;
      }
      if (/^\s*[\dlo]{1,3}\s*$/i.test(seg.inner)) {
        hold(ctx, cleanName(head), seg.inner); // "INS 500 (11)": unreadable qualifier
        return;
      }
    }
    afterGroup = true;
    if (!PERCENT_ONLY.test(seg.inner)) inners.push(seg.inner);
    head += " "; // sub-ingredient lists, percentages and notes are dropped as before
  }
  const name = cleanName(head);
  const isFunctional = FUNCTIONAL_CLASS.test(name);
  const isDescriptor = DESCRIPTOR_CLASS.test(name);
  if (inners.length === 0 || !(isFunctional || isDescriptor)) {
    ctx.names.push(name);
    return;
  }
  // The class word alone is unanalyzable, so the bracket carries the
  // identity: "Acidity Regulator (Citric Acid)" → "Citric Acid";
  // "Emulsifier (Soy)" → "Soy Emulsifier"; "Flavour (Cream)" → "Cream
  // Flavour"; "Flavour (Natural Flavouring Substances)" as is.
  const noun = cleanName(name.split(/\s+/).pop() ?? "").replace(/s$/i, "");
  let emitted = false;
  for (const inner of inners) {
    const text = withoutGroups(inner).replace(/\s+/g, " ").trim();
    const words = text.split(/[\s,]+/).filter(Boolean);
    if (isDescriptor && words.length > 0 && words.every((w) => QUALIFIER_WORD.test(w))) {
      // "Flavours (Nature Identical & Artificial)": only qualifies the class
      ctx.names.push(cleanName(`${text} ${noun}s`.replace(/ss$/i, "s")));
      emitted = true;
      continue;
    }
    const pieces = splitTopLevel(inner, topLevelSeparator);
    if (isDescriptor && pieces.some((p) => ADJECTIVE_ONLY.test(rawOf(p).trim()))) {
      // "(natural, nature-identical & artificial flavouring substances)" is
      // one description, not a list of ingredients named "natural"
      ctx.names.push(cleanName(text));
      emitted = true;
      continue;
    }
    for (const piece of pieces) {
      const raw = rawOf(piece).trim();
      if (!raw || PERCENT_ONLY.test(raw)) continue;
      const plain = withoutGroups(raw).replace(/\s+/g, " ").trim();
      if (VITAMIN_OR_MINERAL.test(name) && /^[a-k]\d{0,2}$/i.test(plain)) {
        ctx.names.push(`Vitamin ${plain.toUpperCase()}`); // "Vitamins (B6, B12)"
        emitted = true;
        continue;
      }
      if (looksCodeLike(raw) || (/\b(?:ins|e)\s?[-:.]?\s?[\dlo]/i.test(plain) && !hasWord(plain.replace(/\b(?:ins|e)\b/gi, "")))) {
        hold(ctx, name, raw); // "Preservative (21l)", "(INS 2l1)": an unreadable code
        emitted = true;
        continue;
      }
      if (!hasWord(plain)) {
        if (/\d/.test(raw)) {
          hold(ctx, name, raw);
          emitted = true;
        }
        continue;
      }
      if (isDescriptor) {
        const pieceName = cleanName(plain);
        ctx.names.push(DESCRIPTOR_STEM.test(pieceName) ? pieceName : `${pieceName} ${noun}`);
        emitted = true;
      } else if (plain.split(/\s+/).every((w) => DESCRIPTOR_WORD.test(w))) {
        // "Emulsifier (Vegetable Origin)": describes, doesn't identify
        continue;
      } else if (VITAMIN_OR_MINERAL.test(name) && /^[a-k]\d{0,2}$/i.test(plain)) {
        ctx.names.push(`Vitamin ${plain.toUpperCase()}`); // "Vitamins (B6, B12)"
        emitted = true;
      } else if (VITAMIN_OR_MINERAL.test(name) || /^spices?$/i.test(name) || namesSubstance(plain)) {
        // Spices' pieces are spices; minerals' are compounds; a substance
        // name IS the additive — each is an ingredient in its own right
        emitItem(piece, ctx);
        emitted = true;
      } else {
        ctx.names.push(cleanName(`${plain} ${noun}`)); // "Soy Emulsifier"
        emitted = true;
      }
    }
  }
  if (!emitted) ctx.names.push(name); // only descriptors: the class itself (bare ones are filtered)
}

const STORAGE_PHRASE =
  /^(?:store|keep|refrigerate|best\s+before|use\s+by|consume\s+within|once\s+opened)\b|\b(?:(?:cool|dry)(?:\s+and\s+(?:dry|hygienic))?|hygienic)\s+place\b/i;

const NBSP = String.fromCharCode(160);
const WS_RUN_WITH_NEWLINE = new RegExp(`[ \\t${NBSP}]*\\n[\\s${NBSP}]*`, "g");
const WS_RUN = new RegExp(`[ \\t${NBSP}]+`, "g");

/**
 * Parse a label into ingredient names. Never throws: the cron also calls
 * this while SELECTING candidates, where an exception on one hostile label
 * would drop every product after it — an unparseable label is held instead.
 */
export function parseIngredients(rawText: string): string[] {
  try {
    return parseIngredientsUnsafe(rawText);
  } catch (err) {
    const ctx: Ctx = { names: [], held: new Set() };
    hold(ctx, "Label text", `could not be parsed: ${err instanceof Error ? err.name : "error"}`);
    return ctx.names;
  } finally {
    hasCodeMemo = new Map();
  }
}

function heldLabel(reason: string): string[] {
  const ctx: Ctx = { names: [], held: new Set() };
  hold(ctx, "Label text", reason);
  return ctx.names;
}

function parseIngredientsUnsafe(rawText: string): string[] {
  hasCodeMemo = new Map();
  const decoded = rawText
    .replace(/\r/g, "")
    // HTML entities leak into some OFF records; "&quot;" would split on its ";"
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    // Every whitespace run becomes ONE character (a newline if it had one).
    // Adjacent \s* in the code grammar can then never backtrack over long
    // runs — the super-linear case the review measured at seconds per label.
    .replace(WS_RUN_WITH_NEWLINE, "\n")
    .replace(WS_RUN, " ")
    // A leading "Ingredients:" heading is not an ingredient
    .replace(/^\s*ingredients?\s*[:\-]?\s*\n/i, "");

  if (maxBracketDepth(decoded) > MAX_BRACKET_DEPTH) {
    return heldLabel(`brackets nested deeper than ${MAX_BRACKET_DEPTH}`);
  }

  const text = bracketUnbracketedRuns(
    removeStatements(cutNutritionPanel(decoded))
      // "NS 627": OCR dropped the I of INS
      .replace(/\bNS\s+(?=\d{3,4}\b)/g, "INS ")
      // Replace underscores (OFF language markup: _hazelnuts_ → hazelnuts)
      .replace(/_/g, " ")
      // Strip asterisks / carets (organic and footnote marks)
      .replace(/[*^]/g, "")
      // "lodised Salt", "lodopropynyl…": the ubiquitous OCR misread of a
      // capital I as l. No ingredient word starts with these "lod…" stems,
      // so the correction cannot hit a real name.
      .replace(/\blod(?=i[sz]ed|ine|ates?\b|ides?\b|o[a-z])/gi, (m) => "I" + m.slice(1)),
  );

  const layout = newlineLayout(text);
  if (layout === "ambiguous") return heldLabel("one-per-line list with names wrapped across lines");

  const ctx: Ctx = { names: [], held: new Set() };
  const items =
    layout === "list"
      ? splitTopLevel(flattenBracketNewlines(text), newlineListSeparator)
      : splitTopLevel(text.replace(/\s*\n\s*/g, " "), topLevelSeparator);
  for (const item of items) emitItem(item, ctx);

  const seen = new Set<string>();
  return ctx.names.filter((s) => {
    const isHeld = ctx.held.has(s);
    // Held text always survives: dropping it is exactly the silent loss the
    // hold exists to prevent.
    if (!isHeld) {
      if (s.length < 3) return false;
      // Reject if only digits/symbols
      if (/^[\d\s\W]+$/.test(s)) return false;
      // Reject label disclaimers that are not ingredients:
      // "Contains Milk", "May contain traces of nuts", "Allergy advice: ..."
      if (/^(contains|may contains?|allergen advice|allergy advice|free from|for allergens|manufactured in)\b/i.test(s)) return false;
      // A bare nutrition heading OCR merged into the list is dropped; one that
      // carries figures ("… Energy 450 kcal Protein 6 g") may hide a glued-on
      // ingredient, so it stays and the garbled-name gate holds it
      if (/^n[uú]tri(?:tion|tional)\b/i.test(s) && !/\d/.test(s)) return false;
      // Storage directions are never ingredients — dropped as names, without
      // cutting the rest of the list ("…0,4 store in a cool, dry and hygienic
      // place, keep refrigerated")
      if (STORAGE_PHRASE.test(s)) return false;
      // Reject bare functional-class words with no ingredient identity —
      // "extract", "flavour", "emulsifier" alone cannot be meaningfully
      // analyzed and pollute the analysis cache with junk rows. Qualified
      // forms ("vanilla extract", "citric acid") pass untouched.
      if (BARE_CLASS.test(s)) return false;
    }
    // The same ingredient declared twice — including one additive under two
    // wordings — is listed once. The key keeps sub-types apart (500(i) is
    // not 500(ii)). A held or garbled name is deduplicated only against
    // its exact text: its code must never let it vanish behind an earlier
    // clean declaration ("… INS 504 Taurine" after "Anticaking Agent INS 504").
    const key = isHeld || looksGarbledIngredientName(s) ? `raw:${s.toLowerCase().trim()}` : canonicalIngredientKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A code's sub-type qualifier is the one bracket a clean name may carry.
const QUALIFIED_CODE = /\b(?:INS \d{3,4}[a-f]?|E\d{3,4}[a-f]?)\((?:i{1,3}|iv|vi{0,3}|ix|x)\)/gi;
// A prefixed token that tries to be a code but is not a readable one:
// "INS 2l1", "INS l422", "E 95s" (OCR l/I/o/s for digits).
const PREFIXED_TOKEN = /\b(?:ins|e)\s?[-:.]?\s?([\dlos]{2,5}[a-z]?)(?![\da-z])/gi;

/**
 * Heuristic for OCR/merge damage in a parsed ingredient name — leftover
 * bracket fragments, floating punctuation, dangling connectors, implausible
 * length, unreadable or unknown additive codes. Used by the ingest cron and
 * the admin re-ingest to hold a product as a draft when its label text
 * parsed dirty: a trust platform must never publish ingredient names like
 * "Carrot Flakes . Garlic Bits and Leeks )".
 */
export function looksGarbledIngredientName(name: string): boolean {
  const n = name.trim();
  if (n.length > 60) return true;
  if (/[()[\]{}]/.test(n.replace(QUALIFIED_CODE, ""))) return true; // parser strips balanced brackets; leftovers = damage
  if (/\s[.,;:]/.test(n)) return true; // floating punctuation ("Flakes . Garlic")
  if (/[-&/]\s*$/.test(n) || /^[&,]/.test(n)) return true; // dangling connector ("Anti caking agent -")
  if (/\s{2,}|\n/.test(n)) return true;
  // A quantity or decimal figure is nutrition-panel bleed, not a name:
  // "Iron 1000.0 700.0 6.90 4.83 Wheat gluten"
  if (/\b\d+(?:[.,]\d+)?\s?(?:mg|g|kg|ml|kcal|kj|mcg)\b/i.test(n) || /\b\d+\.\d+\b/.test(n)) return true;
  // The parser always ends a coded name with its code; words after the code
  // mean a lost comma merged the next ingredient in: "INS 504 Taurine"
  if (/\b(?:INS|E)\s?\d{3,4}[a-f]?(?:\([ivx]+\))?\s+(?!and\b)[a-z]{2,}/i.test(n)) return true;
  // A code that does not exist in the Codex INS list ("INS 1501" — an OCR
  // misread) must not reach analysis as if it were an additive
  if (parseAdditiveCode(n)?.known === false) return true;
  // An unreadable prefixed code: "INS 2l1", "INS l422"
  for (const m of Array.from(n.matchAll(PREFIXED_TOKEN))) {
    if (/\d/.test(m[1]) && !/^\d{3,4}[a-f]?$/i.test(m[1])) return true;
  }
  // An unprefixed trailing 3-4 digit number is an unlabelled code
  // ("Emulsifying Salts 339") — never a name
  if (/\s\d{3,4}[a-f]?$/i.test(n) && !/\b(?:ins|e)\s?[-:.]?\s?\d{3,4}[a-f]?$/i.test(n)) return true;
  return false;
}
