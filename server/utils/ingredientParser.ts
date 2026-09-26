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
 * that may be an ingredient.
 */

import { CODE_PREFIX_SRC, CODE_BODY_SRC, canonicalIngredientKey, normalizeQualifier } from "./additiveCode";
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
// "10 (ii)" (lost digit), "21l" (l for 1), "5000th". Never dropped silently.
const CODE_LIKE = new RegExp(`^(?:${CODE_PREFIX_SRC})?\\d{1,5}(?:\\s?[a-z]{1,2})?\\s*(?:\\([^()]*\\))?$`, "i");

// Unbracketed code runs after a functional class — "Stabilisers 1422, 415",
// "ACIDITY REGULATOR - E260", "Thickener-415", "Flavour Enhancer-627 & 631" —
// are rewritten into the bracketed form so one code path handles all.
const CLASS_HEAD =
  "(?:regulators?|stabili[sz]ers?|thickeners?|preservatives?|colou?rs?|emulsifiers?|sweeteners?|enhancers?|agents?|antioxidants?|sequestrants?|humectants?|acidulants?|improvers?)";
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

/** A comma inside a chemical locant ("1,2-Hexanediol") is not a separator. */
function isLocantComma(s: string, i: number): boolean {
  return /\d/.test(s[i - 1] ?? "") && /^\d+(?:,\d+)*-[a-z]/i.test(s.slice(i + 1));
}

const ABBREVIATIONS = /^(?:subsp|ssp|spp|sp|var|vit|approx|viz|etc|incl|st|no|mfd|mfg)$/i;

/** A "." that is an abbreviation or an initial ("subsp.", "L. Acidophilus"), not a sentence end. */
function isAbbreviationDot(s: string, i: number): boolean {
  const before = s.slice(Math.max(0, i - 24), i);
  const word = /([a-z]+)$/i.exec(before)?.[1] ?? "";
  if (ABBREVIATIONS.test(word)) return true;
  if (word.length !== 1) return false;
  // "Vitamin A. CONTAINS …" ends the ingredient; so does a following
  // all-caps word or a declaration keyword.
  if (/\bvitamin\s+[a-z]$/i.test(before)) return false;
  const next = /^\s+(\S+)/.exec(s.slice(i + 1))?.[1] ?? "";
  return !(/^[A-Z]{2,}/.test(next) || /^(?:contains|may)\b/i.test(next));
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

/**
 * One ingredient per line: "Carrot\nLodhra Bark\nZinc Oxide". A comma list
 * that merely wraps across lines ("Salt, Potassium\nIodate") is not one —
 * only the last line may carry commas.
 */
function isNewlineList(s: string): boolean {
  const lines = s.split("\n").filter((line) => line.trim());
  return lines.length >= 3 && lines.slice(0, -1).every((line) => !/[,;]/.test(line));
}

/** Newlines inside brackets are always wraps — flatten them. */
function flattenBracketNewlines(s: string): string {
  const inside = new Array<boolean>(s.length).fill(false);
  for (const [open, close] of Array.from(pairBrackets(s))) {
    for (let k = open + 1; k < close; k++) inside[k] = true;
  }
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

/** True when a group declares additive codes (syntactically), directly or nested. */
function groupHasCode(inner: string): boolean {
  const memo = hasCodeMemo.get(inner);
  if (memo !== undefined) return memo;
  let found = false;
  for (const piece of splitTopLevel(inner, groupSeparator)) {
    if (matchCodeRun(rawOf(piece).trim()) || piece.some((seg) => seg.kind === "group" && groupHasCode(seg.inner))) {
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

// ── Statements that end the list ─────────────────────────────────────────────

// An allergen, facility or storage statement ends the ingredient list; so
// does a sentence that starts "Contains …"/"May contain …" (an allergen
// sentence — "Contains ADDED/PERMITTED …" is an additive declaration and
// is kept). Only honoured outside brackets. Nutrition-panel text is NOT a
// cut point: OCR bleeds it into the MIDDLE of lists, where cutting would
// silently drop every real ingredient after it — the garbled-name gate
// catches that bleed and holds the product instead.
const STATEMENT_START =
  /\b(?:allerg\w*(?:\s+\w+)?\s*:|manufactured\s+in\s+a\s+facility|store\s+(?:in|at|below|under)\b|keep\s+(?:refrigerated|in\s+a\s+cool)|refrigerate\s+after\s+opening|best\s+before\b)|(?:^|[.;!]\s+|\n\s*)(?:contains\s+(?!added\b|permitted\b)|may\s+contains?\b)/gi;
const SENTENCE_HAS_CODE = new RegExp(`\\(\\s*(?:${CODE_PREFIX_SRC})?\\d{3}`, "i");

// A nutrition panel appended after the list ("TOMATO KETCHUP NUTRITIONAL
// INFORMATION … ENERGY VALUE (kcal)") is cut only when nutrient words
// confirm it, and from the start of its sentence/item so the panel's
// product-name heading goes too. Headerless mid-list bleed is NOT cut.
const NUTRITION_PANEL =
  /n[uú]tri(?:tion|tional)\s+(?:information|facts|values?)\b(?=[\s\S]{0,200}?\b(?:energy|kcal|protein|carbohydrates?|fat)\b)/gi;

function cutAtNutritionPanel(s: string): string {
  const pairs = Array.from(pairBrackets(s));
  for (const m of Array.from(s.matchAll(NUTRITION_PANEL))) {
    const at = m.index ?? 0;
    if (pairs.some(([open, close]) => open < at && at < close)) continue;
    const before = s.slice(0, at);
    const boundary = Math.max(before.lastIndexOf(". "), before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf("\n"));
    if (boundary > 0) return s.slice(0, boundary + 1);
  }
  return s;
}

function cutAtStatement(s: string): string {
  s = cutAtNutritionPanel(s);
  const pairs = Array.from(pairBrackets(s));
  for (const m of Array.from(s.matchAll(STATEMENT_START))) {
    const at = (m.index ?? 0) + (m[0].length - m[0].trimStart().length) + (/^[.;!]/.test(m[0]) ? 1 : 0);
    if (at <= 0) continue;
    if (pairs.some(([open, close]) => open < at && at < close)) continue;
    // "Contains … (INS 129)" declares an additive — not an allergen sentence
    const sentence = s.slice(at).split(/\.\s/)[0];
    if (/^\s*(?:contains|may)/i.test(s.slice(at)) && SENTENCE_HAS_CODE.test(sentence)) continue;
    return s.slice(0, at);
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
  // Strip standalone trailing number that is a percentage without % sign
  // e.g. "cacao maigre 7" where original was "cacao maigre 7,4%" and comma split it
  // — but never when the number is part of an additive code ("INS 296", "E 500")
  if (!/\b(?:ins|e)[-\s]?\d{3,4}[a-z]?$/i.test(clean)) {
    clean = clean.replace(/\s+\d+$/, "");
  }
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
  "natural|artificial|synthetic|organic|intense|low[\\s-]calorie|non[\\s-]nutritive|nutritive|vegetable|plant[\\s-]based|nature[\\s-]identical|permitted|added|food|class\\s+ii|edible";

// FSSAI functional-class phrases that open an additive declaration. When a
// label drops the comma before one ("Iodised Salt Acidity Regulator (E260)",
// "Mixed Spices Preservative Sodium Benzoate (INS 211)"), the text before
// the phrase is a separate ingredient. Qualifiers belong to the phrase
// ("Artificial Sweeteners", "Vegetable Emulsifier"). Colours are
// deliberately absent: "Beetroot Colour (162)" is one identity.
const CLASS_PHRASE = new RegExp(
  `\\b(?:(?:${QUALIFIERS})\\s+)*(?:` +
    [
      "acidity\\s+regulators?",
      "anti[-\\s]?caking\\s+agents?",
      "anti[-\\s]?foaming\\s+agents?",
      "antioxidants?",
      "bulking\\s+agents?",
      "emulsifiers?",
      "emulsifying\\s+(?:salts?|agents?|(?:&|and)\\s+stabili[sz]ing\\s+agents?)",
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
    ].join("|") +
    ")\\b",
  "i",
);
const QUALIFIER_OR_CONNECTOR = new RegExp(`^(?:${QUALIFIERS}|and|&|with|of)$`, "i");
const CLASS_PHRASE_START = new RegExp(`^\\s*${CLASS_PHRASE.source.replace(/^\\b/, "")}`, "i");
// Plant-part / form words that continue an INCI name after its bracketed
// common name: "Beta Vulgaris (Beet) Root Extract".
const INCI_PART =
  /^\s*(?:fruit|leaf|leaves|root|seed|seedcake|flower|bark|peel|kernel|nut|stem|rhizome|oil|extract|juice|water|milk|powder|starch|butter|wax|gum|resin|callus|sprout|bulb|fib(?:er|re)|pulp|shell|husk|bran|germ|protein|ferment|filtrate|cell|meristem|branch|twig|wood|herb|aerial|flour|meal|sap|tuber|cone|needle|thallus|gel|lipids?|sterols?|glycerides)\b/i;

// "CONTAINS PERMITTED SYNTHETIC FOOD COLOUR (129)" is the mandatory FSSAI
// declaration of a real additive, not an allergen disclaimer — keep the
// additive, drop the boilerplate. With a code it is always a declaration;
// without one, only "Contains ADDED/PERMITTED …" is.
const DECLARATION_LEAD_CODED = /^\s*(?:contains|may\s+contains?)\s+(?:(?:added|permitted)\s+)*/i;
const DECLARATION_LEAD = /^\s*contains\s+(?:(?:added|permitted)\s+)+/i;

// "added"/"permitted" are declaration boilerplate, never identity:
// "Added Flavour" is as unanalyzable as "Flavour".
const BARE_CLASS =
  /^(?:(?:added|permitted)\s+)*(extracts?|flavou?rs?|colou?rs?|emulsifiers?|stabili[sz]ers?|thickeners?|preservatives?|acids?|sweeteners?|spices?)$/i;
// A class whose parenthetical NAMES the ingredient: "Emulsifier (Soy Lecithin)".
const IDENTITY_CLASS = new RegExp(
  `^(?:(?:${QUALIFIERS})\\s+)*(?:emulsifiers?|stabili[sz]ers?|thickeners?|preservatives?|acids?|sweeteners?|spices?|antioxidants?)$`,
  "i",
);
// A class whose parenthetical DESCRIBES it: "Flavour (Cream)" is a cream
// flavouring, not cream; "Colour (Caramel)" is caramel colour, not caramel.
const DESCRIPTOR_CLASS = new RegExp(`^(?:(?:${QUALIFIERS})\\s+)*(?:flavou?rs?|flavo(?:u)?rings?|colou?rs?|extracts?)$`, "i");
const DESCRIPTOR_STEM = /flavo|colou?r|extract/i;
const ADJECTIVE_ONLY = /^(?:natural|artificial|synthetic|organic|added|permitted|nature[-\s]identical)$/i;
const QUALIFIER_WORD = /^(?:natural|artificial|synthetic|organic|added|permitted|nature|identical|nature-identical|and|&)$/i;

const PERCENT_ONLY = /^\s*[\d.,]+\s*%\s*$/;
const hasWord = (s: string) => /[a-z]{3,}/i.test(s);

// ── Emission ─────────────────────────────────────────────────────────────────

/** Emit any ingredient merged in front of the class, return the class itself. */
function splitClassText(text: string, ctx: Ctx): string {
  const declared = text.replace(DECLARATION_LEAD_CODED, "");
  const m = CLASS_PHRASE.exec(declared);
  if (m && m.index > 0) {
    const before = cleanClass(declared.slice(0, m.index));
    const words = before.split(/\s+/).filter((w) => w && !QUALIFIER_OR_CONNECTOR.test(w));
    if (words.length > 0 && words.length <= 3) {
      ctx.names.push(before);
    } else if (words.length > 3) {
      // Several ingredients glued together by lost commas — can't be split safely
      hold(ctx, before, "merged label text");
    }
    return cleanClass(declared.slice(m.index));
  }
  return cleanClass(declared);
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
    if (CODE_LIKE.test(raw)) {
      hold(ctx, cls, raw);
      continue;
    }
    emitItem(piece, ctx);
  }
}

/**
 * Split an item where the label lost a comma after a bracket group:
 * - after a code group or a QUID percentage, more words start a new
 *   ingredient ("SALT(0.9%) YEAST", "Flavour Enhancer (627) Oleoresin");
 * - a connector ("and", "&", ",") starts a new ingredient;
 * - after any other group (sub-ingredients, notes) it is ambiguous —
 *   "Mixed spices (…) Salt Sugar Flavour enhancer" — so the item is held.
 */
function splitAfterGroups(segments: Segment[], ctx: Ctx): Segment[][] | null {
  const parts: Segment[][] = [];
  let cur: Segment[] = [];
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    const prev = cur[cur.length - 1];
    if (seg.kind === "text" && prev?.kind === "group" && hasWord(seg.text)) {
      // INCI puts the common name mid-name: "Zea Mays (Corn) Starch",
      // "Aloe Barbadensis (Aloe Vera) Leaf Juice" — one ingredient
      if (INCI_PART.test(seg.text)) {
        cur.push(seg);
        continue;
      }
      const connector = /^\s*(?:,|&|and\b|with\b|plus\b)\s*/i.exec(seg.text);
      if (connector) {
        parts.push(cur);
        cur = [{ kind: "text", text: seg.text.slice(connector[0].length) }];
        continue;
      }
      // After a code group or QUID the next words are a new ingredient; so
      // are words that open an additive declaration ("…(CLOVE, CHILLI)
      // PRESERVATIVE SODIUM BENZOATE (INS 211)").
      if (PERCENT_ONLY.test(prev.inner) || groupHasCode(prev.inner) || CLASS_PHRASE_START.test(seg.text)) {
        parts.push(cur);
        cur = [seg];
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
  // Class text = the words before the first code group (other groups there
  // are sub-ingredients/notes and are dropped, as for any ingredient).
  const cls = splitClassText(
    segments.slice(0, codeAt).map((s) => (s.kind === "text" ? s.text : " ")).join(""),
    ctx,
  );
  for (const seg of segments.slice(codeAt)) {
    if (seg.kind === "group" && groupHasCode(seg.inner)) emitAdditiveGroup(cls, seg.inner, ctx);
  }
}

function stripLead(segments: Segment[], lead: RegExp): Segment[] {
  const first = segments[0];
  if (first?.kind !== "text" || !lead.test(first.text)) return segments;
  return [{ kind: "text", text: first.text.replace(lead, "") }, ...segments.slice(1)];
}

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
    } else {
      afterGroup = true;
      if (!PERCENT_ONLY.test(seg.inner)) inners.push(seg.inner);
      head += " "; // sub-ingredient lists, percentages and notes are dropped as before
    }
  }
  const name = cleanName(head);
  const isIdentity = IDENTITY_CLASS.test(name);
  const isDescriptor = DESCRIPTOR_CLASS.test(name);
  if (inners.length === 0 || !(isIdentity || isDescriptor)) {
    ctx.names.push(name);
    return;
  }
  // The class word alone is unanalyzable, so the parenthetical carries the
  // identity: "Emulsifier (Soy Lecithin)" → "Soy Lecithin"; "Flavour (Cream)"
  // → "Cream Flavour"; "Flavour (Natural Flavouring Substances)" as is.
  const noun = cleanName(name.split(/\s+/).pop() ?? "").replace(/s$/i, "");
  for (const inner of inners) {
    const text = withoutGroups(inner).replace(/\s+/g, " ").trim();
    const words = text.split(/[\s,]+/).filter(Boolean);
    // "Flavours (Nature Identical & Artificial)": only qualifies the class
    if (words.length > 0 && words.every((w) => QUALIFIER_WORD.test(w))) {
      ctx.names.push(cleanName(`${text} ${noun}s`.replace(/ss$/i, "s")));
      continue;
    }
    const pieces = splitTopLevel(inner, topLevelSeparator);
    // "(natural, nature-identical & artificial flavouring substances)" is
    // one description, not a list of ingredients named "natural"
    if (pieces.some((p) => ADJECTIVE_ONLY.test(rawOf(p).trim()))) {
      ctx.names.push(cleanName(text));
      continue;
    }
    for (const piece of pieces) {
      const raw = rawOf(piece).trim();
      if (!raw || PERCENT_ONLY.test(raw)) continue;
      const words3 = withoutGroups(raw);
      if (!hasWord(words3)) {
        // "Preservative (21l)": an unreadable code where the identity should be
        if (/\d/.test(raw)) hold(ctx, name, raw);
        continue;
      }
      if (isDescriptor) {
        const pieceName = cleanName(words3);
        ctx.names.push(DESCRIPTOR_STEM.test(pieceName) ? pieceName : `${pieceName} ${noun}`);
      } else {
        emitItem(piece, ctx);
      }
    }
  }
}

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
    .replace(WS_RUN, " ");

  if (maxBracketDepth(decoded) > MAX_BRACKET_DEPTH) {
    const ctx: Ctx = { names: [], held: new Set() };
    hold(ctx, "Label text", `brackets nested deeper than ${MAX_BRACKET_DEPTH}`);
    return ctx.names;
  }
  const text = bracketUnbracketedRuns(
    cutAtStatement(decoded)
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

  const ctx: Ctx = { names: [], held: new Set() };
  const items = isNewlineList(text)
    ? splitTopLevel(flattenBracketNewlines(text), newlineListSeparator)
    : splitTopLevel(text.replace(/\s*\n\s*/g, " "), topLevelSeparator);
  for (const item of items) emitItem(item, ctx);

  const seen = new Set<string>();
  return ctx.names.filter((s) => {
    // Held text always survives: dropping it is exactly the silent loss the
    // hold exists to prevent.
    if (!ctx.held.has(s)) {
      if (s.length < 3) return false;
      // Reject if only digits/symbols
      if (/^[\d\s\W]+$/.test(s)) return false;
      // Reject label disclaimers that are not ingredients:
      // "Contains Milk", "May contain traces of nuts", "Allergy advice: ..."
      if (/^(contains|may contains?|allergen advice|allergy advice|free from|for allergens|manufactured in)\b/i.test(s)) return false;
      // Nutrition-panel text that OCR merged into the ingredient list
      if (/^n[uú]tri(?:tion|tional)\b/i.test(s)) return false;
      // Reject bare functional-class words with no ingredient identity —
      // "extract", "flavour", "emulsifier" alone cannot be meaningfully
      // analyzed and pollute the analysis cache with junk rows. Qualified
      // forms ("vanilla extract", "citric acid") pass untouched.
      if (BARE_CLASS.test(s)) return false;
    }
    // The same ingredient declared twice — including one additive under two
    // wordings — is listed once. The key keeps sub-types apart: 500(i)
    // sodium carbonate and 500(ii) sodium bicarbonate are both kept.
    const key = canonicalIngredientKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A code's sub-type qualifier is the one bracket a clean name may carry.
const QUALIFIED_CODE = /\b(?:INS \d{3,4}[a-f]?|E\d{3,4}[a-f]?)\((?:i{1,3}|iv|vi{0,3}|ix|x)\)/gi;

/**
 * Heuristic for OCR/merge damage in a parsed ingredient name — leftover
 * bracket fragments, floating punctuation, dangling connectors, or
 * implausible length. Used by the ingest cron to hold a product as a draft
 * when its label text parsed dirty: a trust platform must never publish
 * ingredient names like "Carrot Flakes . Garlic Bits and Leeks )".
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
  return false;
}
