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

/**
 * OFF's image folder for a barcode: shorter codes are zero-padded to 13
 * digits (EAN-8 89080153 lives under 000/008/908/0153 — verified on the
 * live Maggi record), then split 3/3/3/rest.
 */
export function offImagePath(barcode: string): string | null {
  const digits = barcode.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const code = digits.padStart(13, "0");
  return `${code.slice(0, 3)}/${code.slice(3, 6)}/${code.slice(6, 9)}/${code.slice(9)}`;
}

/** The barcode encoded in an OFF/OBF image URL, or null. */
export function barcodeFromImageUrl(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/\/images\/products\/([\d/]+)\//);
  return m ? m[1].replace(/\//g, "") : null;
}
