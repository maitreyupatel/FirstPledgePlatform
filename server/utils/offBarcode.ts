/**
 * Barcode identity for products sourced from Open Food Facts / Open Beauty
 * Facts. The products table has no barcode column, but every OFF-sourced
 * product stores its OFF image URL, which encodes the barcode:
 *   8901764032912 -> https://images.openfoodfacts.org/images/products/890/176/403/2912/front_en.26.400.jpg
 *
 * Observed live (audit 2026-09-26): "Sprite" is published TWICE — same
 * barcode 8901764032912, once under brand "sprite" and once under
 * "Coca-Cola". No name/brand normalisation can equate those; the barcode can.
 */

/** OFF's image folder for a barcode: codes longer than 8 digits split 3/3/3/rest. */
export function offImagePath(barcode: string): string | null {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 8) return null;
  if (code.length === 8) return code;
  return `${code.slice(0, 3)}/${code.slice(3, 6)}/${code.slice(6, 9)}/${code.slice(9)}`;
}

/** The barcode encoded in an OFF/OBF image URL, or null. */
export function barcodeFromImageUrl(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/\/images\/products\/([\d/]+)\//);
  return m ? m[1].replace(/\//g, "") : null;
}
