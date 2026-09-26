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
 * the class for readability: "Acidity Regulators INS 330". A code that is
 * lost makes the published report silently incomplete (Mountain Dew lost
 * sodium benzoate and tartrazine this way) or leaves a bare class name that
 * cannot be analyzed.
 */

import { canonicalIngredientKey } from "./additiveCode";

/**
 * Normalize ingredient name to title case (first letter capital, rest lower).
 * Preserves established abbreviations: pH, DNA, AHA, BHA, SPF, UV, INS, etc.
 */
function toTitleCase(s: string): string {
  const PRESERVE_UPPER = /^(pH|DNA|AHA|BHA|BHT|BHQ|SPF|UV|UVA|UVB|RNA|EDTA|SLS|SLES|INS)$/i;
  return s
    .split(" ")
    .map((word) => {
      if (PRESERVE_UPPER.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// ── Additive-code grammar ────────────────────────────────────────────────────

// Sub-type qualifiers: 503(ii), 331(iii), 1100(i). A lone digit is the
// common OCR misread of a roman numeral ("452(1)") and is accepted but dropped.
const QUALIFIER = "i{1,3}|iv|vi{0,3}|ix|x|\\d";
// Codex INS numbers run 100-1521; anything outside is a misread, not a code.
const MIN_INS = 100;
const MAX_INS = 1599;

// One code, anchored at the current position (sticky): optional INS/E prefix,
// 3-4 digits, optional a-f letter suffix (150d, 472e), optional qualifier.
const CODE_STICKY = new RegExp(
  `\\s*(?:(ins|e)\\s*-?\\s*)?(\\d{3,4})([a-f])?\\s*(?:\\(\\s*(${QUALIFIER})\\s*\\))?\\s*`,
  "iy",
);

// Something that tried to be a code but is not a valid one ("10 (ii)" where
// the label lost a digit). Never dropped silently — see emitAdditiveGroup.
const CODE_LIKE = /^(?:(?:ins|e)\s*-?\s*)?\d{1,5}[a-z]?\s*(?:\([^()]*\))?$/i;

/** The codes in `raw` when it consists ONLY of codes ("330", "INS 261 INS 330"). */
function matchCodeRun(raw: string): RegExpExecArray[] | null {
  const found: RegExpExecArray[] = [];
  let pos = 0;
  while (pos < raw.length) {
    CODE_STICKY.lastIndex = pos;
    const m = CODE_STICKY.exec(raw);
    if (!m || m[0].length === 0) return null;
    const n = Number(m[2]);
    if (n < MIN_INS || n > MAX_INS) return null;
    found.push(m);
    pos = CODE_STICKY.lastIndex;
  }
  return found.length > 0 ? found : null;
}

/** "INS 503(ii)" / "E1422" — keeps the label's E-prefix, else Indian INS style. */
function formatCode(m: RegExpExecArray): string {
  const [, prefix, num, letter, qualifier] = m;
  const suffix = (letter ?? "").toLowerCase();
  const q = qualifier && !/^\d$/.test(qualifier) ? `(${qualifier.toLowerCase()})` : "";
  return prefix?.toLowerCase() === "e" ? `E${num}${suffix}${q}` : `INS ${num}${suffix}${q}`;
}

// Unbracketed code runs after a functional class: "Stabilisers 1422, 415",
// "ACIDITY REGULATOR - E260", "Thickener-415", "Flavour Enhancer-627 & 631".
// These are rewritten into the bracketed form so one code path handles all.
const CLASS_HEAD =
  "(?:regulators?|stabili[sz]ers?|thickeners?|preservatives?|colou?rs?|emulsifiers?|sweeteners?|enhancers?|agents?|antioxidants?|sequestrants?|humectants?|acidulants?|improvers?)";
const RUN_CODE =
  `(?:(?:ins|e)\\s*-?\\s*)?[1-9]\\d{2,3}[a-f]?(?:\\s*\\(\\s*(?:${QUALIFIER})\\s*\\))?` +
  // not a quantity: "100 g", "150 kcal", "13 mg", "2%", "7,4" — while a
  // comma list with no spaces ("627,631") is still a run of codes
  `(?![\\d%]|[.,]\\d{1,2}(?!\\d)|\\s*(?:mg|g|kg|ml|l|kcal|kj|mcg|iu)\\b)`;
const UNBRACKETED_RUN = new RegExp(
  `\\b(${CLASS_HEAD})\\s*(?:[-–—:]\\s*)?(${RUN_CODE}(?:\\s*(?:,|&|\\band\\b|/)?\\s*${RUN_CODE})*)`,
  "gi",
);

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

// Separator length at s[i] (0 = not a separator), for the ingredient list
// itself and for the inside of an additive group. Newlines are separators
// only in a list laid out one-ingredient-per-line; elsewhere they are line
// wraps inside a name ("Butyl\nMethoxydibenzoylmethane") and become spaces.
function topLevelSeparator(s: string, i: number): number {
  const c = s[i];
  if (c === ",") return isLocantComma(s, i) ? 0 : 1;
  if (c === ";") return 1;
  // Sentence end: "…(INS 211). CONTAINS PERMITTED…" — but not an
  // abbreviation ("Eranda Sd. 10 mg", "delbrueckii subsp. Bulgaricus",
  // an initial like "L. Acidophilus")
  if (c === "." && /^\s+[A-Z]/.test(s.slice(i + 1)) && !ABBREVIATION_END.test(s.slice(0, i))) return 1;
  return 0;
}

const ABBREVIATION_END = /(?:\b(?:subsp|ssp|spp|sp|var|vit|approx|viz|etc|incl|st|no|mfd|mfg)|(?:^|[\s.(])[a-z])$/i;

function newlineListSeparator(s: string, i: number): number {
  return s[i] === "\n" ? 1 : topLevelSeparator(s, i);
}

function groupSeparator(s: string, i: number): number {
  const c = s[i];
  if (c === ",") return isLocantComma(s, i) ? 0 : 1;
  if (c === ";" || c === "&" || c === "/") return 1;
  if (/^and\b/i.test(s.slice(i)) && (i === 0 || /\s/.test(s[i - 1]))) return 3;
  return 0;
}

/** One ingredient per line and no comma list: "Carrot\nLodhra Bark\nZinc Oxide". */
function isNewlineList(s: string): boolean {
  const lines = s.split("\n").filter((line) => line.trim()).length;
  return lines >= 3 && (s.match(/[,;]/g) ?? []).length < lines;
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

// An allergen or facility statement ends the ingredient list; what follows
// ("ALLERGEN ADVICE: CONTAINS WHEAT, SOY AND CELERY") is not ingredients.
// Only honoured outside brackets. Nutrition-panel text is deliberately NOT a
// cut point: OCR bleeds it into the MIDDLE of lists, where cutting would
// silently drop every real ingredient after it — the garbled-name gate
// catches that bleed and holds the product instead.
const STATEMENT_START =
  /\b(?:allerg(?:ens?|y)(?:\s+(?:advice|information|declaration|statement))?\s*:|manufactured\s+in\s+a\s+facility)/gi;

function cutAtStatement(s: string): string {
  const pairs = Array.from(pairBrackets(s));
  for (const m of Array.from(s.matchAll(STATEMENT_START))) {
    const at = m.index ?? 0;
    const insideGroup = pairs.some(([open, close]) => open < at && at < close);
    if (at > 0 && !insideGroup) return s.slice(0, at);
  }
  return s;
}

/** True when a group declares additive codes, directly or in a nested group. */
function groupHasCode(inner: string): boolean {
  for (const piece of splitTopLevel(inner, groupSeparator)) {
    if (matchCodeRun(rawOf(piece).trim())) return true;
    if (piece.some((seg) => seg.kind === "group" && groupHasCode(seg.inner))) return true;
  }
  return false;
}

const PERCENT_ONLY = /^\s*[\d.,]+\s*%\s*$/;
// "added"/"permitted" are declaration boilerplate, never identity:
// "Added Flavour" is as unanalyzable as "Flavour".
const BARE_CLASS =
  /^(?:(?:added|permitted)\s+)*(extracts?|flavou?rs?|colou?rs?|emulsifiers?|stabili[sz]ers?|thickeners?|preservatives?|acids?|sweeteners?|spices?)$/i;
const ADJECTIVE_ONLY = /^(?:natural|artificial|synthetic|organic|added|permitted|nature[-\s]identical)$/i;
const QUALIFIER_WORD = /^(?:natural|artificial|synthetic|organic|added|permitted|nature|identical|nature-identical|and|&)$/i;

// ── Per-name cleanup (unchanged rules, now applied per emitted name) ─────────

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
  // Strip leading stray punctuation: "-Butylene Glycol", "'CONTAINS..."
  clean = clean.replace(/^[\s\-–—.·'"`´]+/, "").trim();
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

/** Class text around a code group: "and Emulsifier Of Vegetable Origin" → "Emulsifier Of Vegetable Origin". */
function cleanClass(s: string): string {
  const stripped = s
    .replace(/^[\s,&]*(?:and|with|plus)\s+/i, "")
    .replace(/(?:[\s\-–—:&,]|\s(?:and|with)\b)+$/i, "");
  return stripped.trim() ? cleanName(stripped) : "";
}

// FSSAI functional-class phrases that open an additive declaration. When a
// label drops the comma before one ("Iodised Salt Acidity Regulator (E260)",
// "Mixed Spices Preservative Sodium Benzoate (INS 211)"), the text before
// the phrase is a separate ingredient. Colours are deliberately absent:
// "Beetroot Colour (162)" is one identity, not two ingredients.
const CLASS_PHRASE = new RegExp(
  "\\b(?:(?:permitted|added|synthetic|food|class\\s+ii)\\s+)*(?:" +
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

// "CONTAINS PERMITTED SYNTHETIC FOOD COLOUR (129)" is the mandatory FSSAI
// declaration of a real additive, not an allergen disclaimer — keep the
// additive, drop the boilerplate.
const DECLARATION_LEAD = /^\s*(?:contains|may\s+contains?)\s+(?:(?:added|permitted)\s+)*/i;

/** Emit any ingredient merged in front of the class, return the class itself. */
function splitClassText(text: string, out: string[]): string {
  const declared = text.replace(DECLARATION_LEAD, "");
  const m = CLASS_PHRASE.exec(declared);
  if (m && m.index > 0) {
    const before = cleanClass(declared.slice(0, m.index));
    if (before) out.push(before);
    return cleanClass(declared.slice(m.index));
  }
  return cleanClass(declared);
}

// ── Emission ─────────────────────────────────────────────────────────────────

/**
 * Emit one ingredient per code in an additive group, prefixed by its class.
 * Named pieces ("Soy Lecithin" in "Emulsifiers (Soy Lecithin, 471)") and
 * nested coded sub-ingredients are emitted too. A piece that looks like a
 * code but is not a valid one keeps its brackets, so the garbled-name gate
 * holds the product for human review instead of dropping an additive.
 */
function emitAdditiveGroup(cls: string, inner: string, out: string[]): void {
  for (const piece of splitTopLevel(inner, groupSeparator)) {
    const raw = rawOf(piece).trim();
    if (!raw || PERCENT_ONLY.test(raw)) continue;
    const codes = matchCodeRun(raw);
    if (codes) {
      for (const m of codes) out.push(cls ? `${cls} ${formatCode(m)}` : formatCode(m));
      continue;
    }
    if (CODE_LIKE.test(raw)) {
      out.push(`${cls} (${raw.replace(/[()]/g, " ").replace(/\s+/g, " ").trim()})`.trim());
      continue;
    }
    emitItem(piece, out);
  }
}

/** Emit the ingredient(s) of one list item. */
function emitItem(segments: Segment[], out: string[]): void {
  const hasAdditiveGroup = segments.some((seg) => seg.kind === "group" && groupHasCode(seg.inner));

  if (!hasAdditiveGroup) {
    let head = "";
    const specifics: string[] = [];
    for (let k = 0; k < segments.length; k++) {
      const seg = segments[k];
      if (seg.kind === "text") {
        head += seg.text;
        continue;
      }
      // A QUID percentage followed by more words means the label lost a
      // comma: "IODISED SALT(0.9%) YEAST" is two ingredients, not one.
      const wordsFollow = segments.slice(k + 1).some((s) => s.kind === "text" && /[a-z]/i.test(s.text));
      if (PERCENT_ONLY.test(seg.inner) && wordsFollow) {
        out.push(cleanName(head));
        head = "";
        continue;
      }
      if (!PERCENT_ONLY.test(seg.inner)) specifics.push(seg.inner);
      // Sub-ingredient lists, percentages and notes are dropped as before
      head += " ";
    }
    const name = cleanName(head);
    // "Flavour (Natural Flavouring Substances)", "Emulsifier (Soy Lecithin)":
    // the class word alone is unanalyzable and filtered, so the parenthetical
    // IS the ingredient's identity — emit it instead of losing both.
    if (BARE_CLASS.test(name) && specifics.length > 0) {
      for (const inner of specifics) {
        // "Flavours (Nature Identical & Artificial)": the parenthetical only
        // qualifies the class — the ingredient is "… Artificial Flavours"
        const words = withoutGroups(inner).split(/[\s,]+/).filter(Boolean);
        if (words.length > 0 && words.every((w) => QUALIFIER_WORD.test(w))) {
          out.push(cleanName(`${withoutGroups(inner)} ${name}`));
          continue;
        }
        const pieces = splitTopLevel(inner, topLevelSeparator);
        // "(natural, nature-identical & artificial flavouring substances)"
        // is one description, not a list of ingredients named "natural"
        if (pieces.some((p) => ADJECTIVE_ONLY.test(rawOf(p).trim()))) out.push(cleanName(withoutGroups(inner)));
        else for (const piece of pieces) emitItem(piece, out);
      }
      return;
    }
    out.push(name);
    return;
  }

  let cls = "";
  for (const seg of segments) {
    if (seg.kind === "text") {
      cls += seg.text;
    } else if (groupHasCode(seg.inner)) {
      emitAdditiveGroup(splitClassText(cls, out), seg.inner, out);
      cls = "";
    } else {
      cls += " ";
    }
  }
  // Text after the last code group is its own ingredient when the label
  // dropped a comma: "Flavour Enhancer-627 & 631 Oleoresin Capsicum"
  if (/[a-z]/i.test(cls)) out.push(cleanClass(cls));
}

export function parseIngredients(rawText: string): string[] {
  const decoded = rawText
    .replace(/\r/g, "")
    // HTML entities leak into some OFF records; "&quot;" would split on its ";"
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
  const text = cutAtStatement(decoded)
    // "NS 627": OCR dropped the I of INS
    .replace(/\bNS\s+(?=\d{3,4}\b)/g, "INS ")
    // Replace underscores (OFF language markup: _hazelnuts_ → hazelnuts)
    .replace(/_/g, " ")
    // Strip asterisks / carets (organic and footnote marks)
    .replace(/[*^]/g, "")
    // "lodised Salt", "lodopropynyl…": the ubiquitous OCR misread of a
    // capital I as l. No ingredient word starts with these "lod…" stems,
    // so the correction cannot hit a real name.
    .replace(/\blod(?=i[sz]ed|ine|ates?\b|ides?\b|o[a-z])/gi, (m) => "I" + m.slice(1))
    .replace(UNBRACKETED_RUN, (_m, head: string, run: string) => `${head} (${run.trim()})`);

  const names: string[] = [];
  const items = isNewlineList(text)
    ? splitTopLevel(text, newlineListSeparator)
    : splitTopLevel(text.replace(/\s*\n\s*/g, " "), topLevelSeparator);
  for (const item of items) emitItem(item, names);

  const seen = new Set<string>();
  return names.filter((s) => {
    if (s.length < 3) return false;
    if (s.length > 80) return false;
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
    // The same ingredient declared twice — including one additive under two
    // wordings ("Preservative Sodium Benzoate INS 211" … "Class II
    // Preservative INS 211") — is listed once
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
  // A quantity or decimal figure is nutrition-panel bleed, not a name:
  // "Iron 1000.0 700.0 6.90 4.83 Wheat gluten"
  if (/\b\d+(?:[.,]\d+)?\s?(?:mg|g|kg|ml|kcal|kj|mcg)\b/i.test(n) || /\b\d+\.\d+\b/.test(n)) return true;
  if (/\s[.,;:]/.test(n)) return true; // floating punctuation ("Flakes . Garlic")
  if (/[-&/]\s*$/.test(n)) return true; // dangling connector ("Anti caking agent -")
  if (/\s{2,}/.test(n)) return true;
  return false;
}
