/**
 * Research Service
 * Searches multiple sources (Healthline, PubMed, FDA) for ingredient information
 */

export interface ResearchResult {
  source: "healthline" | "pubmed" | "fda" | "other";
  url: string;
  title: string;
  snippet: string;
  relevance: number; // 0-1 relevance score
}

export class ResearchService {
  private googleApiKey?: string;
  private googleCxId?: string;
  private lastRequestTime: number = 0;
  private minDelayBetweenRequests: number = 100; // 100ms delay between requests
  private consecutiveErrors: number = 0;
  private maxConsecutiveErrors: number = 3;

  constructor(googleApiKey?: string, googleCxId?: string) {
    this.googleApiKey = googleApiKey;
    this.googleCxId = googleCxId;
  }

  /**
   * Search multiple research sources for ingredient information
   */
  async searchIngredient(ingredientName: string): Promise<ResearchResult[]> {
    const results: ResearchResult[] = [];

    if (!this.googleApiKey || !this.googleCxId) {
      // Silently return empty if not configured
      return results;
    }

    // If we've hit too many consecutive errors, skip research search
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      console.debug("Skipping research search due to consecutive API errors");
      return results;
    }

    // Search Healthline
    try {
      await this.rateLimit();
      const healthline = await this.searchHealthline(ingredientName);
      if (healthline) {
        results.push(healthline);
        this.consecutiveErrors = 0; // Reset on success
      }
    } catch (error: any) {
      this.handleSearchError(error, "Healthline", ingredientName);
    }

    // Search PubMed
    try {
      await this.rateLimit();
      const pubmed = await this.searchPubMed(ingredientName);
      if (pubmed) {
        results.push(pubmed);
        this.consecutiveErrors = 0; // Reset on success
      }
    } catch (error: any) {
      this.handleSearchError(error, "PubMed", ingredientName);
    }

    // Search FDA
    try {
      await this.rateLimit();
      const fda = await this.searchFDA(ingredientName);
      if (fda) {
        results.push(fda);
        this.consecutiveErrors = 0; // Reset on success
      }
    } catch (error: any) {
      this.handleSearchError(error, "FDA", ingredientName);
    }

    // Sort by relevance
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Rate limiting to avoid hitting API limits
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minDelayBetweenRequests) {
      await this.sleep(this.minDelayBetweenRequests - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Handle search errors gracefully
   */
  private handleSearchError(error: any, source: string, ingredientName: string): void {
    // Don't log every error - only log significant ones
    const isServerError = error.status >= 500;
    const isQuotaError = error.status === 429 || error.message?.includes("quota");
    
    if (isQuotaError) {
      this.consecutiveErrors++;
      if (this.consecutiveErrors === 1) {
        console.warn(`⚠️  Google Search API quota/rate limit hit. Research search temporarily disabled.`);
      }
    } else if (isServerError && this.consecutiveErrors === 0) {
      // Only log first server error
      console.warn(`⚠️  Google Search API error (${error.status}). Research search may be unavailable.`);
      this.consecutiveErrors++;
    }
    
    // Silently skip on client errors (400-499) - likely invalid query or API issue
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Search Healthline for ingredient information
   */
  private async searchHealthline(ingredientName: string): Promise<ResearchResult | null> {
    const query = `site:healthline.com ${ingredientName} skincare cosmetic ingredient`;
    return this.searchGoogle(query, "healthline", ingredientName);
  }

  /**
   * Search PubMed for scientific research
   */
  private async searchPubMed(ingredientName: string): Promise<ResearchResult | null> {
    const query = `site:pubmed.ncbi.nlm.nih.gov ${ingredientName} safety cosmetic`;
    return this.searchGoogle(query, "pubmed", ingredientName);
  }

  /**
   * Search FDA for regulatory information
   */
  private async searchFDA(ingredientName: string): Promise<ResearchResult | null> {
    const query = `site:fda.gov ${ingredientName} cosmetic ingredient safety`;
    return this.searchGoogle(query, "fda", ingredientName);
  }

  /**
   * Generic Google Custom Search
   */
  private async searchGoogle(
    query: string,
    source: ResearchResult["source"],
    ingredientName: string
  ): Promise<ResearchResult | null> {
    if (!this.googleApiKey || !this.googleCxId) {
      return null;
    }

    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${this.googleApiKey}&cx=${this.googleCxId}&q=${encodeURIComponent(query)}&num=1`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        // Don't log every error - let handleSearchError handle it
        const errorData = await response.json().catch(() => ({}));
        
        // Throw error to be caught by handleSearchError
        const error: any = new Error(`Google Search API error: ${response.status}`);
        error.status = response.status;
        error.message = errorData.error?.message || error.message;
        throw error;
      }

      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        
        // Calculate relevance based on title and snippet matching ingredient name
        const relevance = this.calculateRelevance(
          item.title + " " + item.snippet,
          ingredientName
        );

        return {
          source,
          url: item.link,
          title: item.title,
          snippet: item.snippet,
          relevance,
        };
      }

      return null;
    } catch (error: any) {
      // Re-throw to be handled by handleSearchError
      throw error;
    }
  }

  /**
   * Calculate relevance score based on how well the text matches the ingredient name
   */
  private calculateRelevance(text: string, ingredientName: string): number {
    const lowerText = text.toLowerCase();
    const lowerIngredient = ingredientName.toLowerCase();
    
    // Exact match
    if (lowerText.includes(lowerIngredient)) {
      return 0.9;
    }

    // Partial match (words)
    const ingredientWords = lowerIngredient.split(/\s+/);
    const matchedWords = ingredientWords.filter(word => 
      word.length > 3 && lowerText.includes(word)
    ).length;
    
    const matchRatio = matchedWords / ingredientWords.length;
    return Math.min(0.8, matchRatio * 0.8);
  }
}

