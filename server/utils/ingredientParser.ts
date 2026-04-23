/**
 * Parse a raw ingredient list string from Open Food Facts into clean ingredient names.
 *
 * Handles: nested parentheses (water, coffee), asterisks, underscores,
 * square brackets, numbers-only fragments, and trailing punctuation.
 */
export function parseIngredients(rawText: string): string[] {
  return (
    rawText
      // Replace underscores (OFF uses these for language markup)
      .replace(/_/g, " ")
      // Strip ALL parenthetical content BEFORE splitting on commas.
      // Using [^)]* (not .*?) so commas inside parens don't create fragments.
      .replace(/\([^)]*\)/g, "")
      // Strip square bracket annotations
      .replace(/\[[^\]]*\]/g, "")
      // Strip asterisks (used for organic certification marks)
      .replace(/\*/g, "")
      // Split on commas, semicolons, or periods followed by capital letter
      .split(/[,;]+/)
      .map((s) => {
        let clean = s.trim();
        // Strip EU category labels (e.g. "emulsifier: lecithins" → "lecithins")
        const colonIdx = clean.lastIndexOf(":");
        if (colonIdx !== -1 && colonIdx < clean.length - 2) {
          clean = clean.slice(colonIdx + 1).trim();
        }
        // Strip leading percentages/numbers ("2% nonfat milk" → "nonfat milk")
        clean = clean.replace(/^\d+\.?\d*\s*%?\s*/, "");
        // Strip trailing percentages ("hazelnuts 13%" → "hazelnuts")
        clean = clean.replace(/\s+\d+\.?\d*\s*%\s*$/, "");
        // Strip trailing punctuation
        clean = clean.replace(/[.:,;]+$/, "").trim();
        return clean;
      })
      // Keep only plausible ingredient names
      .filter((s) => {
        if (s.length < 3) return false;
        if (s.length > 80) return false;
        // Reject if only digits/symbols
        if (/^[\d\s\W]+$/.test(s)) return false;
        return true;
      })
  );
}
