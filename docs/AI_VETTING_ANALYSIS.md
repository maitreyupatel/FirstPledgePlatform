# AI Vetting Tool - In-Depth Analysis Report

## Executive Summary

**CRITICAL FINDING**: The AI vetting tool is **NOT actually using AI**. It's currently using simple keyword matching with hardcoded rules. The Google Generative AI package (`@google/genai`) is installed but **never imported or used**.

## Current Implementation Analysis

### What's Actually Happening

1. **Keyword-Based Classification** (`server/index.ts:171-182`)
   - Uses simple string matching against hardcoded keyword arrays
   - `bannedKeywords`: ["phthalate", "paraben", "synthetic fragrance", "benzene", "formaldehyde"]
   - `cautionKeywords`: ["phenoxyethanol", "chloride", "sulfate", "titanium dioxide", "aluminum"]
   - Everything else defaults to "safe"

2. **Generic Rationale Generation** (`server/index.ts:223-234`)
   - Returns template strings based on status only
   - No ingredient-specific analysis
   - Examples:
     - Safe: "{name} is widely recognized as low-risk..."
     - Caution: "{name} has mixed safety data..."
     - Banned: "{name} is flagged for exclusion..."

3. **URL Construction Without Verification** (`server/utils/ewgUrlBuilder.ts`)
   - Builds URLs by slugifying ingredient names
   - No actual verification that URLs exist
   - No search for real citations
   - Just constructs: `https://www.ewg.org/skindeep/ingredients/{slug}/`

### Why All Ingredients Look the Same

1. **Same Rationale Pattern**: All ingredients with the same status get identical rationale text (only name changes)
2. **Same URL Pattern**: URLs are constructed the same way for all ingredients
3. **No Real Research**: No actual API calls to research databases or AI models

## Required Integration

### Yes, Integration is REQUIRED

To achieve the intended functionality, you need:

1. **Google Gemini API** - For actual AI analysis of ingredients
2. **Google Custom Search API** - For finding real citations from EWG and other sources
3. **Proper Environment Variable Management** - For secure API key storage

## Implementation Plan

### Phase 1: Environment Variable Setup

**NEVER hardcode API keys in code files!** Use environment variables.

#### Recommended Approach: `.env` file with `.gitignore`

1. Create `.env` file (already in `.gitignore`):
```env
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CX_ID=your_custom_search_engine_id_here
GEMINI_API_KEY=your_gemini_api_key_here
```

2. Load in `server/index.ts`:
```typescript
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX_ID = process.env.GOOGLE_CX_ID;
```

3. Create `.env.example` (commit this, NOT `.env`):
```env
GOOGLE_API_KEY=
GOOGLE_CX_ID=
GEMINI_API_KEY=
```

### Phase 2: Real AI Integration

#### Step 1: Create AI Vetting Service

Create `server/services/aiVettingService.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/genai';
import { SafetyStatus } from '@shared/types';

interface IngredientAnalysis {
  name: string;
  status: SafetyStatus;
  rationale: string;
  sourceUrl: string;
  confidence: number;
}

export class AIVettingService {
  private gemini: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.gemini = new GoogleGenerativeAI(apiKey);
    this.model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  async analyzeIngredient(ingredientName: string): Promise<IngredientAnalysis> {
    const prompt = this.buildPrompt(ingredientName);
    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return this.parseAIResponse(ingredientName, text);
  }

  async analyzeIngredients(ingredientNames: string[]): Promise<IngredientAnalysis[]> {
    // Batch analysis for efficiency
    const prompt = this.buildBatchPrompt(ingredientNames);
    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return this.parseBatchResponse(text);
  }

  private buildPrompt(ingredientName: string): string {
    return `Analyze the safety of the cosmetic/skincare ingredient "${ingredientName}".

Provide a JSON response with:
{
  "status": "safe" | "caution" | "banned",
  "rationale": "Detailed explanation based on scientific evidence",
  "ewgUrl": "Specific EWG Skin Deep URL if available, or search URL",
  "confidence": 0.0-1.0
}

Focus on:
- Scientific evidence from peer-reviewed sources
- EWG Skin Deep database (prioritize ewg.org/skindeep)
- FDA regulations
- Known health concerns
- Concentration-dependent risks

Be specific and cite actual research.`;
  }

  private buildBatchPrompt(ingredientNames: string[]): string {
    return `Analyze the safety of these cosmetic/skincare ingredients: ${ingredientNames.join(', ')}

Provide a JSON array response:
[
  {
    "name": "ingredient name",
    "status": "safe" | "caution" | "banned",
    "rationale": "Detailed explanation",
    "ewgUrl": "EWG URL",
    "confidence": 0.0-1.0
  }
]

For each ingredient, prioritize EWG Skin Deep (ewg.org/skindeep) as the citation source.`;
  }

  private parseAIResponse(ingredientName: string, text: string): IngredientAnalysis {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
    
    try {
      const parsed = JSON.parse(jsonText);
      return {
        name: ingredientName,
        status: parsed.status || 'caution',
        rationale: parsed.rationale || 'Analysis pending',
        sourceUrl: parsed.ewgUrl || this.buildFallbackUrl(ingredientName),
        confidence: parsed.confidence || 0.5
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return this.getFallbackAnalysis(ingredientName);
    }
  }

  private parseBatchResponse(text: string): IngredientAnalysis[] {
    // Similar parsing for batch responses
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
    const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
    
    try {
      const parsed = JSON.parse(jsonText);
      return Array.isArray(parsed) ? parsed.map(item => ({
        name: item.name,
        status: item.status || 'caution',
        rationale: item.rationale || 'Analysis pending',
        sourceUrl: item.ewgUrl || this.buildFallbackUrl(item.name),
        confidence: item.confidence || 0.5
      })) : [];
    } catch (error) {
      console.error('Failed to parse batch AI response:', error);
      return [];
    }
  }

  private buildFallbackUrl(ingredientName: string): string {
    const slug = ingredientName.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`;
  }

  private getFallbackAnalysis(ingredientName: string): IngredientAnalysis {
    return {
      name: ingredientName,
      status: 'caution',
      rationale: 'Unable to analyze. Manual review required.',
      sourceUrl: this.buildFallbackUrl(ingredientName),
      confidence: 0.0
    };
  }
}
```

#### Step 2: Create Citation Search Service

Create `server/services/citationService.ts`:

```typescript
interface CitationResult {
  url: string;
  title: string;
  snippet: string;
  source: 'ewg' | 'fda' | 'pubmed' | 'other';
}

export class CitationService {
  private apiKey: string;
  private cxId: string;

  constructor(apiKey: string, cxId: string) {
    this.apiKey = apiKey;
    this.cxId = cxId;
  }

  async searchEWG(ingredientName: string): Promise<CitationResult | null> {
    const query = `site:ewg.org/skindeep ${ingredientName}`;
    return this.searchGoogle(query, 'ewg');
  }

  async searchFDA(ingredientName: string): Promise<CitationResult | null> {
    const query = `site:fda.gov ${ingredientName} cosmetic`;
    return this.searchGoogle(query, 'fda');
  }

  async searchPubMed(ingredientName: string): Promise<CitationResult | null> {
    const query = `site:pubmed.ncbi.nlm.nih.gov ${ingredientName} safety`;
    return this.searchGoogle(query, 'pubmed');
  }

  private async searchGoogle(query: string, source: CitationResult['source']): Promise<CitationResult | null> {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${this.apiKey}&cx=${this.cxId}&q=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          url: item.link,
          title: item.title,
          snippet: item.snippet,
          source
        };
      }
    } catch (error) {
      console.error(`Error searching ${source}:`, error);
    }
    return null;
  }

  async findBestCitation(ingredientName: string): Promise<string> {
    // Prioritize EWG
    const ewg = await this.searchEWG(ingredientName);
    if (ewg) return ewg.url;

    // Fallback to FDA
    const fda = await this.searchFDA(ingredientName);
    if (fda) return fda.url;

    // Fallback to PubMed
    const pubmed = await this.searchPubMed(ingredientName);
    if (pubmed) return pubmed.url;

    // Final fallback
    return `https://www.ewg.org/skindeep/search/?query=${encodeURIComponent(ingredientName)}`;
  }
}
```

#### Step 3: Update Server Endpoint

Update `server/index.ts`:

```typescript
import { AIVettingService } from './services/aiVettingService';
import { CitationService } from './services/citationService';

// Initialize services
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const googleApiKey = process.env.GOOGLE_API_KEY;
const googleCxId = process.env.GOOGLE_CX_ID;

if (!geminiApiKey) {
  console.warn('⚠️  GEMINI_API_KEY not set. AI vetting will use fallback mode.');
}

const aiVettingService = geminiApiKey ? new AIVettingService(geminiApiKey) : null;
const citationService = (googleApiKey && googleCxId) 
  ? new CitationService(googleApiKey, googleCxId) 
  : null;

app.post("/api/vet-ingredients", async (req, res) => {
  const payload = req.body as VetIngredientsRequest;
  if (!payload?.ingredientsText?.trim()) {
    res.status(400).json({ error: "ingredientsText is required" });
    return;
  }

  const lines = payload.ingredientsText
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  try {
    let results: VetIngredientResult;

    if (aiVettingService) {
      // Use real AI analysis
      const analyses = await aiVettingService.analyzeIngredients(lines);
      
      // Enhance with citation search if available
      const ingredients = await Promise.all(
        analyses.map(async (analysis) => {
          let sourceUrl = analysis.sourceUrl;
          
          if (citationService && !sourceUrl.includes('ewg.org')) {
            // Try to find better citation
            const betterUrl = await citationService.findBestCitation(analysis.name);
            sourceUrl = betterUrl;
          }

          return {
            id: cryptoRandomId(),
            name: analysis.name,
            status: analysis.status,
            rationale: analysis.rationale,
            sourceUrl,
            originalStatus: analysis.status,
            isOverride: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        })
      );

      const overallStatus = deriveOverallStatus(ingredients.map(i => i.status));
      const summary = buildSummary(overallStatus, ingredients.length);

      results = { overallStatus, summary, ingredients };
    } else {
      // Fallback to keyword matching
      console.warn('Using fallback keyword matching (no AI available)');
      results = buildVetResult(lines);
    }

    res.json(results);
  } catch (error) {
    console.error('Error in vet-ingredients:', error);
    res.status(500).json({ 
      error: "Failed to analyze ingredients",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

## Security Best Practices for API Keys

### ✅ DO:
1. **Use `.env` file** - Never commit to git
2. **Add `.env` to `.gitignore`** - Already done
3. **Create `.env.example`** - Template without real keys
4. **Use environment variables** - `process.env.KEY_NAME`
5. **Validate keys exist** - Check before using services
6. **Use different keys for dev/prod** - Separate environments

### ❌ DON'T:
1. **Hardcode in source files** - Never!
2. **Commit `.env` to git** - Security risk
3. **Log API keys** - Don't console.log them
4. **Expose in client-side code** - Server-side only
5. **Share keys in chat/email** - Use secure channels

## Implementation Checklist

- [ ] Install `dotenv` package: `npm install dotenv`
- [ ] Create `.env` file with your API keys
- [ ] Create `.env.example` template file
- [ ] Create `server/services/aiVettingService.ts`
- [ ] Create `server/services/citationService.ts`
- [ ] Update `server/index.ts` to use new services
- [ ] Add error handling and fallbacks
- [ ] Test with real ingredients
- [ ] Monitor API usage and costs
- [ ] Add rate limiting if needed

## Expected Behavior After Implementation

1. **Unique Rationales**: Each ingredient gets AI-generated, specific analysis
2. **Real Citations**: URLs point to actual EWG pages or search results
3. **Accurate Status**: AI determines status based on scientific evidence
4. **Confidence Scores**: Know how certain the AI is about each rating
5. **Fallback Mode**: Still works if API keys aren't set (uses keyword matching)

## Cost Considerations

- **Gemini API**: Pay-per-use, typically $0.10-0.50 per 1000 requests
- **Google Custom Search**: Free tier: 100 queries/day, then paid
- **Recommendation**: Cache results for common ingredients to reduce costs

## Next Steps

1. Review this analysis
2. Set up `.env` file with your API keys
3. Implement the services as outlined
4. Test thoroughly
5. Monitor API usage and costs

