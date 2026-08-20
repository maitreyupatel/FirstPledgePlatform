/**
 * Parse a raw ingredient list string from Open Food Facts into clean ingredient names.
 *
 * Handles: nested parentheses (water, coffee), asterisks, underscores,
 * square brackets, numbers-only fragments, and trailing punctuation.
 */
/**
 * Normalize ingredient name to title case (first letter capital, rest lower).
 * Preserves established abbreviations: pH, DNA, AHA, BHA, SPF, UV, etc.
 */
function toTitleCase(s: string): string {
  const PRESERVE_UPPER = /^(pH|DNA|AHA|BHA|BHT|BHQ|SPF|UV|UVA|UVB|RNA|EDTA|SLS|SLES)$/i;
  return s
    .split(" ")
    .map((word) => {
      if (PRESERVE_UPPER.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function parseIngredients(rawText: string): string[] {
  return (
    rawText
      // Replace underscores (OFF language markup: _hazelnuts_ → hazelnuts)
      .replace(/_/g, " ")
      // Preserve additive codes before stripping parentheticals — Indian labels
      // write "Acidity Regulator (INS 296)" and the INS/E code must survive so
      // the additive registry can resolve it. Unwraps code-only parens into
      // plain text; all other parentheticals are stripped below as before.
      .replace(/\(\s*((?:ins|e)[-\s]?\d{3,4}[a-z]?(?:\s*,\s*(?:ins|e)[-\s]?\d{3,4}[a-z]?)*)\s*\)/gi, " $1 ")
      // Strip parenthetical content BEFORE splitting — prevents (water, coffee) from splitting
      .replace(/\([^)]*\)/g, "")
      // Strip square bracket annotations e.g. [SOJA]
      .replace(/\[[^\]]*\]/g, "")
      // Strip asterisks (organic certification marks)
      .replace(/\*/g, "")
      // Split on commas and semicolons
      .split(/[,;]+/)
      .map((s) => {
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
        // Strip leading percentages/numbers ("2% nonfat milk" → "nonfat milk")
        clean = clean.replace(/^\d+[,\.]?\d*\s*%?\s*/, "");
        // Strip standalone trailing number that is a percentage without % sign
        // e.g. "cacao maigre 7" where original was "cacao maigre 7,4%" and comma split it
        // — but never when the number is part of an additive code ("INS 296", "E 500")
        if (!/\b(?:ins|e)[-\s]?\d{3,4}[a-z]?$/i.test(clean)) {
          clean = clean.replace(/\s+\d+$/, "");
        }
        // Strip trailing punctuation
        clean = clean.replace(/[.:;]+$/, "").trim();
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
      })
      .filter((s) => {
        if (s.length < 3) return false;
        if (s.length > 80) return false;
        // Reject if only digits/symbols
        if (/^[\d\s\W]+$/.test(s)) return false;
        // Reject label disclaimers that are not ingredients:
        // "Contains Milk", "May contain traces of nuts", "Allergy advice: ..."
        if (/^(contains|may contain|allergen advice|allergy advice|free from|for allergens)\b/i.test(s)) return false;
        // Reject bare functional-class words with no ingredient identity —
        // "extract", "flavour", "emulsifier" alone cannot be meaningfully
        // analyzed and pollute the analysis cache with junk rows. Qualified
        // forms ("vanilla extract", "citric acid") pass untouched.
        if (/^(extracts?|flavou?rs?|colou?rs?|emulsifiers?|stabili[sz]ers?|thickeners?|preservatives?|acids?|sweeteners?|spices?)$/i.test(s)) return false;
        return true;
      })
  );
}
