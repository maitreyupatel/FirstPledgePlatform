# Enhanced AI Vetting Workflow Implementation

## Overview

The AI vetting system has been enhanced with a comprehensive workflow that prioritizes EWG Skin Deep scores and includes fallback research sources.

## New Workflow

### Step 1: EWG Skin Deep Check (Primary)

1. **Direct Ingredient Page**: Attempts to fetch the ingredient's dedicated EWG page
2. **Search Database**: If direct page not found, searches EWG database
3. **Score Extraction**: Extracts hazard score (1-10) and data availability
4. **Status Determination**:
   - **Score 1-4**: `safe` ✅
   - **Score 5-7**: `caution` ⚠️
   - **Score 8-10**: `banned` 🚫

### Step 2: Research Sources (Fallback)

If EWG data is unavailable, searches:
1. **Healthline**: Consumer-friendly ingredient information
2. **PubMed**: Scientific research papers
3. **FDA**: Regulatory information

### Step 3: AI Analysis (Enhanced)

1. **Retry Logic**: Automatically retries on rate limit errors (429)
2. **Rate Limit Handling**: 
   - Extracts retry delay from error response
   - Waits appropriate time before retrying
   - Maximum 3 retries per ingredient
3. **Sequential Processing**: Processes ingredients one at a time with 2-second delays to avoid rate limits
4. **Enhanced Prompt**: Includes EWG data and research sources in AI prompt

### Step 4: Misspelling Detection

If ingredient not found in EWG:
- Suggests similar ingredient names
- Provides closest matches for manual review

## New Response Format

```typescript
{
  name: string;
  status: "safe" | "caution" | "banned";
  rationale: string;  // Detailed explanation
  description: string;  // 3-line description (NEW)
  edgeCases: string;  // One-liner edge cases (NEW)
  sourceUrl: string;
  confidence: number;
  ewgScore?: number;  // 1-10 (NEW)
  researchSources?: ResearchResult[];  // Healthline, PubMed, FDA (NEW)
  suggestedMatches?: string[];  // For misspellings (NEW)
}
```

### Description Format

**3-line description:**
1. What it is and its primary use
2. Safety profile and key characteristics  
3. Common applications in cosmetics

**Example:**
```
Hyaluronic Acid is a naturally occurring polysaccharide used as a humectant in skincare products.
It is generally recognized as safe with excellent moisturizing properties and minimal risk of irritation.
Commonly found in serums, moisturizers, and anti-aging formulations.
```

### Edge Cases Format

**One-liner mentioning special considerations:**

**Examples:**
- "May cause irritation in sensitive skin"
- "Avoid during pregnancy"
- "Use with caution in high concentrations"
- "No specific edge cases known. Use as directed."

## Rate Limit Handling

### Problem
The Gemini API free tier has strict rate limits:
- **0 requests per minute** for `gemini-2.0-flash-exp` (as seen in your errors)
- Very low token limits

### Solution Implemented

1. **Retry Logic**: Automatically retries up to 3 times
2. **Delay Extraction**: Reads retry delay from error response (usually ~10 seconds)
3. **Sequential Processing**: Processes ingredients one at a time with delays
4. **Fallback to EWG**: If AI fails, uses EWG score if available

### Configuration

```typescript
private maxRetries: number = 3;
private retryDelay: number = 10000; // 10 seconds
const delayBetweenRequests = 2000; // 2 seconds between ingredients
```

## Usage Example

```typescript
const analysis = await aiVettingService.analyzeIngredient("Hyaluronic Acid");

console.log(analysis.ewgScore); // e.g., 2
console.log(analysis.status); // "safe"
console.log(analysis.description); // 3-line description
console.log(analysis.edgeCases); // "No specific edge cases known..."
console.log(analysis.researchSources); // Array of Healthline, PubMed, FDA results
```

## Error Handling

### Rate Limit Errors (429)
- Automatically retries with appropriate delay
- Falls back to EWG data if available
- Returns fallback analysis if all retries fail

### EWG Not Found
- Searches research sources (Healthline, PubMed, FDA)
- Provides suggested matches for misspellings
- Uses AI analysis with available context

### AI Analysis Fails
- Falls back to EWG score if available
- Uses research sources for context
- Returns conservative "caution" status with manual review message

## Environment Variables

```env
# Required for AI analysis
GEMINI_API_KEY=your_gemini_api_key

# Required for research source search
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CX_ID=your_google_custom_search_id

# Optional: For admin authentication
ADMIN_API_KEY=your_secret_api_key
```

## Performance Considerations

### Sequential vs Parallel Processing

**Current Implementation**: Sequential (one at a time)
- **Pros**: Avoids rate limits, more reliable
- **Cons**: Slower for large batches

**Future Optimization**: Batch processing
- Process in small batches (e.g., 5 at a time)
- Add delays between batches
- Better balance of speed and reliability

## Testing

### Test Rate Limit Handling
```bash
# Process many ingredients at once to trigger rate limits
# Should see retry messages and successful fallbacks
```

### Test EWG Integration
```bash
# Test with known EWG ingredients
# Should see scores and proper status assignment
```

### Test Misspelling Detection
```bash
# Test with misspelled ingredient names
# Should see suggested matches
```

## Troubleshooting

### "Requires manual review" Still Appearing

1. **Check API Keys**: Ensure `GEMINI_API_KEY` is set
2. **Check Rate Limits**: You may have exceeded free tier limits
3. **Check EWG Service**: EWG scraping may be blocked (CORS/rate limits)
4. **Check Logs**: Look for specific error messages

### Rate Limits Still Hit

1. **Reduce Batch Size**: Process fewer ingredients at once
2. **Increase Delays**: Increase `delayBetweenRequests`
3. **Upgrade API Tier**: Consider paid Gemini API tier
4. **Use Fallback**: Rely more on EWG data, less on AI

### EWG Scores Not Found

1. **Check Network**: EWG site may be blocking requests
2. **Check Ingredient Name**: Try exact EWG ingredient names
3. **Use Search**: Falls back to EWG search page automatically
4. **Manual Review**: Some ingredients may not be in EWG database

