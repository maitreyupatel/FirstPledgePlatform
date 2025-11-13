interface CitationResult {
  url: string;
  title: string;
  snippet: string;
  source: "ewg" | "fda" | "pubmed" | "other";
}

export class CitationService {
  private apiKey: string;
  private cxId: string;

  constructor(apiKey: string, cxId: string) {
    if (!apiKey || !cxId) {
      throw new Error("GOOGLE_API_KEY and GOOGLE_CX_ID are required");
    }
    this.apiKey = apiKey;
    this.cxId = cxId;
  }

  async searchEWG(ingredientName: string): Promise<CitationResult | null> {
    const query = `site:ewg.org/skindeep ${ingredientName}`;
    return this.searchGoogle(query, "ewg");
  }

  async searchFDA(ingredientName: string): Promise<CitationResult | null> {
    const query = `site:fda.gov ${ingredientName} cosmetic ingredient`;
    return this.searchGoogle(query, "fda");
  }

  async searchPubMed(ingredientName: string): Promise<CitationResult | null> {
    const query = `site:pubmed.ncbi.nlm.nih.gov ${ingredientName} safety`;
    return this.searchGoogle(query, "pubmed");
  }

  async findBestCitation(ingredientName: string): Promise<string> {
    // Prioritize EWG Skin Deep
    try {
      const ewg = await this.searchEWG(ingredientName);
      if (ewg && ewg.url.includes("ewg.org/skindeep")) {
        return ewg.url;
      }
    } catch (error) {
      console.error("Error searching EWG:", error);
    }

    // Fallback to FDA
    try {
      const fda = await this.searchFDA(ingredientName);
      if (fda) {
        return fda.url;
      }
    } catch (error) {
      console.error("Error searching FDA:", error);
    }

    // Fallback to PubMed
    try {
      const pubmed = await this.searchPubMed(ingredientName);
      if (pubmed) {
        return pubmed.url;
      }
    } catch (error) {
      console.error("Error searching PubMed:", error);
    }

    // Final fallback to EWG search
    return `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`;
  }

  private async searchGoogle(
    query: string,
    source: CitationResult["source"]
  ): Promise<CitationResult | null> {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${this.apiKey}&cx=${this.cxId}&q=${encodeURIComponent(query)}&num=1`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Google Search API error (${response.status}):`, errorText);
        return null;
      }

      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          url: item.link,
          title: item.title,
          snippet: item.snippet,
          source,
        };
      }

      return null;
    } catch (error) {
      console.error(`Error searching ${source}:`, error);
      return null;
    }
  }
}

