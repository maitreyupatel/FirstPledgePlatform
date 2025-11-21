/**
 * EWG Skin Deep Service
 * Fetches ingredient safety scores from EWG Skin Deep database
 * Scores: 1-4 = safe, 5-7 = caution, 8-10 = banned
 */

export interface EWGIngredientData {
  name: string;
  score: number | null; // 1-10 scale, null if not found
  dataAvailability: string | null; // "Fair", "Good", "Limited", etc.
  url: string;
  concerns: string[];
  found: boolean;
  suggestedMatches?: string[]; // For misspelling detection
}

export class EWGService {
  /**
   * Search for ingredient in EWG Skin Deep database
   * Returns score and data availability information
   */
  async searchIngredient(ingredientName: string): Promise<EWGIngredientData> {
    try {
      // Try direct ingredient page first
      const directResult = await this.fetchDirectIngredientPage(ingredientName);
      if (directResult.found) {
        return directResult;
      }

      // If not found, try search page
      const searchResult = await this.searchEWGDatabase(ingredientName);
      if (searchResult.found) {
        return searchResult;
      }

      // If still not found, try with misspelling detection
      const suggestions = await this.findSimilarIngredients(ingredientName);
      return {
        name: ingredientName,
        score: null,
        dataAvailability: null,
        url: `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`,
        concerns: [],
        found: false,
        suggestedMatches: suggestions.length > 0 ? suggestions : undefined,
      };
    } catch (error) {
      console.error(`Error searching EWG for ${ingredientName}:`, error);
      return {
        name: ingredientName,
        score: null,
        dataAvailability: null,
        url: `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`,
        concerns: [],
        found: false,
      };
    }
  }

  /**
   * Fetch ingredient data from direct EWG ingredient page
   */
  private async fetchDirectIngredientPage(ingredientName: string): Promise<EWGIngredientData> {
    const slug = this.slugify(ingredientName);
    const url = `https://www.ewg.org/skindeep/ingredients/${slug}/`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        const html = await response.text();
        return this.parseEWGPage(html, ingredientName, url);
      }
    } catch (error) {
      // Page doesn't exist or network error
    }

    return {
      name: ingredientName,
      score: null,
      dataAvailability: null,
      url,
      concerns: [],
      found: false,
    };
  }

  /**
   * Search EWG database using search API/page
   */
  private async searchEWGDatabase(ingredientName: string): Promise<EWGIngredientData> {
    const searchUrl = `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        const html = await response.text();
        // Try to extract first result from search page
        const result = this.parseSearchResults(html, ingredientName);
        if (result.found) {
          return result;
        }
      }
    } catch (error) {
      console.error(`Error searching EWG database:`, error);
    }

    return {
      name: ingredientName,
      score: null,
      dataAvailability: null,
      url: searchUrl,
      concerns: [],
      found: false,
    };
  }

  /**
   * Parse EWG ingredient page HTML to extract score and data
   */
  private parseEWGPage(html: string, ingredientName: string, url: string): EWGIngredientData {
    // Extract score from HTML
    // EWG typically displays score in format like "Hazard score: 3" or "Data availability: Fair"
    const scoreMatch = html.match(/hazard[\s-]*score[:\s]*(\d+)/i) ||
                       html.match(/score[:\s]*(\d+)/i) ||
                       html.match(/rating[:\s]*(\d+)/i);
    
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    // Extract data availability
    const dataAvailabilityMatch = html.match(/data[\s-]*availability[:\s]*([^<\n]+)/i);
    const dataAvailability = dataAvailabilityMatch ? dataAvailabilityMatch[1].trim() : null;

    // Extract concerns
    const concerns: string[] = [];
    const concernMatches = Array.from(html.matchAll(/concern[:\s]*([^<\n]+)/gi));
    for (const match of concernMatches) {
      concerns.push(match[1].trim());
    }

    return {
      name: ingredientName,
      score: score !== null && score >= 1 && score <= 10 ? score : null,
      dataAvailability,
      url,
      concerns,
      found: score !== null,
    };
  }

  /**
   * Parse search results page to find matching ingredient
   */
  private parseSearchResults(html: string, ingredientName: string): EWGIngredientData {
    // Try to find ingredient links in search results
    // This is a simplified parser - in production you might want to use a proper HTML parser
    const ingredientLinkPattern = /href="(\/skindeep\/ingredients\/[^"]+)"/g;
    const matches = Array.from(html.matchAll(ingredientLinkPattern));
    
    if (matches.length > 0) {
      // Try the first result
      const firstMatch = matches[0][1];
      const fullUrl = firstMatch.startsWith('http') ? firstMatch : `https://www.ewg.org${firstMatch}`;
      
      // Extract score from search result snippet if available
      const scoreMatch = html.match(/score[:\s]*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

      return {
        name: ingredientName,
        score: score !== null && score >= 1 && score <= 10 ? score : null,
        dataAvailability: null,
        url: fullUrl,
        concerns: [],
        found: score !== null,
      };
    }

    return {
      name: ingredientName,
      score: null,
      dataAvailability: null,
      url: `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`,
      concerns: [],
      found: false,
    };
  }

  /**
   * Find similar ingredient names (for misspelling detection)
   */
  private async findSimilarIngredients(ingredientName: string): Promise<string[]> {
    // Use Google Custom Search to find similar ingredients
    // This would require Google API key - for now return empty array
    // In production, you could use fuzzy matching or a dedicated API
    
    // Simple fuzzy matching suggestions based on common misspellings
    const suggestions: string[] = [];
    
    // Common patterns: remove spaces, handle capitalization
    const normalized = ingredientName.toLowerCase().trim();
    
    // Try variations
    const variations = [
      normalized.replace(/\s+/g, ''),
      normalized.replace(/\s+/g, '-'),
      normalized.replace(/\s+/g, '_'),
    ];

    // In a real implementation, you'd query EWG or use a similarity algorithm
    // For now, return empty - this can be enhanced with actual search
    
    return suggestions;
  }

  /**
   * Convert ingredient name to URL-friendly slug
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Determine safety status based on EWG score
   */
  static getStatusFromScore(score: number | null): "safe" | "caution" | "banned" | null {
    if (score === null) return null;
    if (score >= 1 && score <= 4) return "safe";
    if (score >= 5 && score <= 7) return "caution";
    if (score >= 8 && score <= 10) return "banned";
    return null;
  }
}

