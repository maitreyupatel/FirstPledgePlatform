/**
 * Escape LIKE/ILIKE metacharacters so externally-sourced strings match
 * literally. Without this, a product name like "100% Real Grape Juice" turns
 * % into a match-anything wildcard inside findByNameAndBrand — the dedup
 * check false-positives and the product is silently skipped forever.
 * Postgres honours backslash escapes in LIKE patterns by default.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
