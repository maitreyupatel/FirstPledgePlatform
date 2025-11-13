/**
 * Builds EWG Skin Deep URL for a specific ingredient
 * Prioritizes specific ingredient pages, falls back to search, then generic URLs
 */
export function buildEwgUrl(ingredientName: string, status: "safe" | "caution" | "banned"): string {
  // Convert ingredient name to URL-friendly slug
  const slug = ingredientName
    .toLowerCase()
    .trim()
    // Replace spaces and special characters with hyphens
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    // Remove multiple consecutive hyphens
    .replace(/-+/g, "-")
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    // Fallback if slug is empty
    return getFallbackUrl(status);
  }

  // Try specific ingredient page first
  // EWG Skin Deep uses format: /ingredients/{ingredient-slug}/
  const specificUrl = `https://www.ewg.org/skindeep/ingredients/${slug}/`;
  
  // For caution status, prioritize EWG search page as fallback
  if (status === "caution") {
    // Return search URL as primary, which will work even if specific page doesn't exist
    const searchUrl = `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`;
    return searchUrl;
  }

  // For safe and banned, still try EWG first but with search fallback
  // Return the specific URL (it may not exist, but browser will handle 404)
  // In a production environment, you might want to verify the URL exists first
  return specificUrl;
}

/**
 * Gets fallback URL based on status when ingredient name is invalid
 */
function getFallbackUrl(status: "safe" | "caution" | "banned"): string {
  switch (status) {
    case "safe":
      // Still prioritize EWG for safe ingredients
      return "https://www.ewg.org/skindeep/";
    case "caution":
      return "https://www.ewg.org/skindeep/";
    case "banned":
      // For banned, FDA is also important, but prioritize EWG
      return "https://www.ewg.org/skindeep/";
    default:
      return "https://www.ewg.org/skindeep/";
  }
}

/**
 * Builds a source URL prioritizing EWG Skin Deep for all ingredients
 * Falls back to other sources only if EWG is not appropriate
 */
export function buildSourceUrl(
  ingredientName: string,
  status: "safe" | "caution" | "banned"
): string {
  // Always prioritize EWG Skin Deep first
  const ewgUrl = buildEwgUrl(ingredientName, status);
  
  // For banned ingredients, also include FDA reference in rationale
  // but URL should still point to EWG for consistency
  if (status === "banned") {
    // Return EWG URL, but FDA info will be in the rationale
    return ewgUrl;
  }

  return ewgUrl;
}

