import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

import {
  VetIngredientResult,
  VetIngredientsRequest,
  SafetyStatus,
} from "../shared/types";
import { SupabaseStorage } from "./storage/supabaseStorage";
import { buildSourceUrl as buildEwgSourceUrl } from "./utils/ewgUrlBuilder";
import { AIVettingService } from "./services/aiVettingService";
import { CitationService } from "./services/citationService";
import { requireAuth } from "./middleware/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// Initialize AI and Citation services
// Default to Groq for generous free tier (14,400 requests/day, 30 requests/minute)
const aiProviderType = (process.env.AI_PROVIDER || "groq") as "gemini" | "openai" | "groq";
const geminiApiKey = process.env.GEMINI_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;
const googleApiKey = process.env.GOOGLE_API_KEY;
const googleCxId = process.env.GOOGLE_CX_ID;

// Validate AI provider configuration
if (!["groq", "gemini", "openai"].includes(aiProviderType)) {
  console.warn(`⚠️  Invalid AI_PROVIDER "${aiProviderType}". Defaulting to "groq".`);
}

// Select API key based on provider
let aiApiKey: string | undefined;
switch (aiProviderType) {
  case "openai":
    aiApiKey = openaiApiKey;
    if (!aiApiKey) {
      console.warn(`⚠️  AI_PROVIDER is set to "openai" but OPENAI_API_KEY is not set. AI vetting will use fallback keyword matching.`);
    }
    break;
  case "groq":
    aiApiKey = groqApiKey;
    if (!aiApiKey) {
      console.warn(`⚠️  AI_PROVIDER is set to "groq" but GROQ_API_KEY is not set. AI vetting will use fallback keyword matching.`);
    }
    break;
  case "gemini":
  default:
    aiApiKey = geminiApiKey;
    if (!aiApiKey) {
      console.warn(`⚠️  AI_PROVIDER is set to "gemini" but GEMINI_API_KEY is not set. AI vetting will use fallback keyword matching.`);
    }
    break;
}

let aiVettingService: AIVettingService | null = null;
let citationService: CitationService | null = null;

try {
  if (aiApiKey) {
    const useAnalysisStorage = process.env.USE_SUPABASE_STORAGE === "true";
    aiVettingService = new AIVettingService(aiProviderType, aiApiKey, googleApiKey, googleCxId, useAnalysisStorage);
    console.log(`✅ AI Vetting Service initialized with ${aiProviderType.toUpperCase()} provider`);
    if (aiProviderType === "groq") {
      console.log(`   📊 Groq free tier: 14,400 requests/day, 30 requests/minute`);
    }
  } else {
    console.warn(`⚠️  ${aiProviderType.toUpperCase()}_API_KEY not set. AI vetting will use fallback keyword matching.`);
    if (aiProviderType === "groq") {
      console.warn(`   💡 Get your free Groq API key at: https://console.groq.com`);
      console.warn(`   💡 Add GROQ_API_KEY=your_key to your .env file`);
    }
  }
} catch (error) {
  console.error("❌ Failed to initialize AI Vetting Service:", error);
}

try {
  if (googleApiKey && googleCxId) {
    citationService = new CitationService(googleApiKey, googleCxId);
    console.log("✅ Citation Service initialized");
  } else {
    console.warn("⚠️  GOOGLE_API_KEY or GOOGLE_CX_ID not set. Citation search disabled.");
  }
} catch (error) {
  console.error("❌ Failed to initialize Citation Service:", error);
}

const app = express();

// Validate required Supabase environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
  const errorMessage = `
❌ CRITICAL: Supabase credentials are required but not configured.

Required environment variables:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY

Please set these in your .env file or environment variables.
The application cannot run without Supabase storage.
  `.trim();
  console.error(errorMessage);
  throw new Error("Missing required Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

// Initialize Supabase storage (mandatory)
// Use a function to initialize storage lazily to avoid crashing the function on startup
let storage: SupabaseStorage | null = null;

function getStorage(): SupabaseStorage {
  if (!storage) {
    try {
      console.log("Initializing Supabase storage...");
      console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✅ Set" : "❌ Missing");
      console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ Set" : "❌ Missing");
      
      storage = new SupabaseStorage();
      console.log("✅ Supabase storage initialized successfully");
    } catch (error) {
      const errorMessage = `
❌ CRITICAL: Failed to initialize Supabase storage.

Error: ${error instanceof Error ? error.message : String(error)}
Stack: ${error instanceof Error ? error.stack : "N/A"}

Please verify your Supabase credentials are correct.
      `.trim();
      console.error(errorMessage);
      throw new Error(`Failed to initialize Supabase storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return storage;
}

app.use(
  cors({
    origin: CLIENT_ORIGIN.split(","),
    credentials: true,
  }),
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Public routes (no auth required)
app.get("/api/products", async (req, res) => {
  try {
    const storageInstance = getStorage();
    const includeUnpublished = req.query.includeUnpublished === "true";
    console.log("Fetching products, includeUnpublished:", includeUnpublished);
    const products = await storageInstance.list({ includeUnpublished });
    console.log(`Found ${products.length} products`);
    res.json(products);
  } catch (error) {
    console.error("Error listing products:", error);
    const errorDetails = error instanceof Error ? {
      message: error.message,
      name: error.name
    } : { message: String(error) };
    
    res.status(500).json({ 
      error: "Failed to list products",
      details: errorDetails
    });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const storageInstance = getStorage();
    const includeUnpublished = req.query.includeUnpublished === "true";
    const product = await storageInstance.getById(req.params.id, { includeUnpublished });

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ 
      error: "Failed to fetch product",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Admin routes (auth required)
app.post("/api/products", requireAuth, async (req, res) => {
  try {
    const storageInstance = getStorage();
    const product = await storageInstance.create({
      name: req.body.name,
      brand: req.body.brand,
      summary: req.body.summary ?? "",
      imageUrl: req.body.imageUrl ?? "",
      overallStatus: req.body.overallStatus,
      status: req.body.status,
      ingredients: req.body.ingredients ?? [],
    });

    res.status(201).json(product);
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(400).json({ 
      error: "Unable to create product",
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

app.patch("/api/products/:id", requireAuth, async (req, res) => {
  try {
    const storageInstance = getStorage();
    const product = await storageInstance.update(req.params.id, {
      name: req.body.name,
      brand: req.body.brand,
      summary: req.body.summary,
      imageUrl: req.body.imageUrl,
      overallStatus: req.body.overallStatus,
      status: req.body.status,
      ingredients: req.body.ingredients,
    });

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ 
      error: "Failed to update product",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.delete("/api/products/:id", requireAuth, async (req, res) => {
  try {
    const storageInstance = getStorage();
    const deleted = await storageInstance.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ 
      error: "Failed to delete product",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/products/:id/edit", requireAuth, async (req, res) => {
  try {
    const storageInstance = getStorage();
    const draft = await storageInstance.createDraftFromProduct(req.params.id);
    if (!draft) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.status(201).json(draft);
  } catch (error) {
    console.error("Error creating draft:", error);
    res.status(500).json({ 
      error: "Failed to create draft",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/products/:id/merge", requireAuth, async (req, res) => {
  try {
    const storageInstance = getStorage();
    const merged = await storageInstance.mergeDraftIntoOriginal(req.params.id);
    if (!merged) {
      res.status(404).json({ error: "Draft not found or invalid" });
      return;
    }

    res.json(merged);
  } catch (error) {
    console.error("Error merging draft:", error);
    res.status(500).json({ 
      error: "Failed to merge draft",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Admin API for ingredient analysis management
app.get("/api/admin/ingredient-analyses/:name", requireAuth, async (req, res) => {
  try {
    if (!aiVettingService || !(aiVettingService as any).analysisService) {
      return res.status(503).json({ error: "Ingredient analysis storage not available" });
    }

    const analysisService = (aiVettingService as any).analysisService;
    const analysis = await analysisService.getAnalysis(req.params.name);

    if (!analysis) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    res.json(analysis);
  } catch (error) {
    console.error("Error fetching analysis:", error);
    res.status(500).json({ error: "Failed to fetch analysis" });
  }
});

app.post("/api/admin/ingredient-analyses/:name/refresh", requireAuth, async (req, res) => {
  try {
    if (!aiVettingService) {
      return res.status(503).json({ error: "AI Vetting Service not available" });
    }

    // Force re-analysis by analyzing the ingredient
    const analysis = await aiVettingService.analyzeIngredient(req.params.name);
    res.json(analysis);
  } catch (error) {
    console.error("Error refreshing analysis:", error);
    res.status(500).json({ error: "Failed to refresh analysis" });
  }
});

app.get("/api/admin/ingredient-analyses", requireAuth, async (req, res) => {
  try {
    if (!aiVettingService || !(aiVettingService as any).analysisService) {
      return res.status(503).json({ error: "Ingredient analysis storage not available" });
    }

    const analysisService = (aiVettingService as any).analysisService;
    const supabase = (analysisService as any).supabase;
    
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "50", 10);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from("ingredient_analyses")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Error listing analyses:", error);
    res.status(500).json({ error: "Failed to list analyses" });
  }
});

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

  if (lines.length === 0) {
    res.status(400).json({ error: "No valid ingredients found" });
    return;
  }

  try {
    let results: VetIngredientResult;

    if (aiVettingService) {
      // Use real AI analysis
      console.log(`🤖 Analyzing ${lines.length} ingredient(s) with AI...`);
      
      const analyses = await aiVettingService.analyzeIngredients(lines);
      
      // Enhance with citation search if available
      const ingredients = await Promise.all(
        analyses.map(async (analysis) => {
          let sourceUrl = analysis.sourceUrl;
          
          // If citation service is available and URL doesn't look like a real EWG URL, try to find better citation
          if (citationService) {
            // Only search if the URL is NOT a proper EWG ingredient page (i.e., it's a search URL or generic URL)
            const isProperEwgIngredientPage = sourceUrl.includes("ewg.org/skindeep/ingredients/") && !sourceUrl.includes("/search/");
            if (!isProperEwgIngredientPage) {
              try {
                const betterUrl = await citationService.findBestCitation(analysis.name);
                sourceUrl = betterUrl;
              } catch (error) {
                console.error(`Error finding citation for ${analysis.name}:`, error);
                // Keep the original URL from AI
              }
            }
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
            // Include new fields if available (these may not be in the Ingredient type yet)
            ...(analysis.description && { description: analysis.description }),
            ...(analysis.edgeCases && { edgeCases: analysis.edgeCases }),
            ...(analysis.ewgScore !== undefined && { ewgScore: analysis.ewgScore }),
            ...(analysis.researchSources && { researchSources: analysis.researchSources }),
            ...(analysis.suggestedMatches && { suggestedMatches: analysis.suggestedMatches }),
          };
        })
      );

      const overallStatus = deriveOverallStatus(ingredients.map(i => i.status));
      const summary = buildSummary(overallStatus, ingredients.length);

      results = { overallStatus, summary, ingredients };
      console.log(`✅ AI analysis complete for ${ingredients.length} ingredient(s)`);
    } else {
      // Fallback to keyword matching
      console.warn("⚠️  Using fallback keyword matching (no AI available)");
      results = buildVetResult(lines);
    }

    res.json(results);
  } catch (error) {
    console.error("❌ Error in vet-ingredients:", error);
    res.status(500).json({ 
      error: "Failed to analyze ingredients",
      details: error instanceof Error ? error.message : "Unknown error",
      fallback: "Try again or check API keys configuration"
    });
  }
});

const assetsDirectory = path.resolve(
  __dirname,
  "../attached_assets/generated_images",
);
app.use(
  "/generated_images",
  express.static(assetsDirectory, {
    maxAge: "7d",
  }),
);

const publicDir = path.resolve(__dirname, "../dist/public");
app.use(express.static(publicDir, { maxAge: "7d" }));

app.get("*", (_req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send("<!doctype html><title>FirstPledge</title><div id=\"root\"></div>");
    }
  });
});

// Export app for Vercel serverless function
export default app;

// Only listen on port when running locally (not in Vercel environment)
if (process.env.VERCEL !== "1") {
app.listen(PORT, () => {
  console.log(`✅ API server listening on http://localhost:${PORT}`);
});
} else {
  console.log("✅ Running in Vercel serverless environment");
}

const bannedKeywords = [
  "phthalate",
  "paraben",
  "synthetic fragrance",
  "benzene",
  "formaldehyde",
];
const cautionKeywords = [
  "phenoxyethanol",
  "chloride",
  "sulfate",
  "titanium dioxide",
  "aluminum",
];

function classifyIngredient(name: string): SafetyStatus {
  const normalized = name.toLowerCase();
  if (bannedKeywords.some((keyword) => normalized.includes(keyword))) {
    return "banned";
  }

  if (cautionKeywords.some((keyword) => normalized.includes(keyword))) {
    return "caution";
  }

  return "safe";
}

function buildVetResult(lines: string[]): VetIngredientResult {
  const ingredients = lines.map((line) => {
    const status = classifyIngredient(line);
    return {
      id: cryptoRandomId(),
      name: line,
      status,
      rationale: buildRationale(line, status),
      sourceUrl: buildEwgSourceUrl(line, status),
      originalStatus: status,
      isOverride: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const overallStatus = deriveOverallStatus(ingredients.map((item) => item.status));
  const summary = buildSummary(overallStatus, ingredients.length);

  return { overallStatus, summary, ingredients };
}

function deriveOverallStatus(statuses: SafetyStatus[]): SafetyStatus {
  if (statuses.includes("banned")) return "banned";
  if (statuses.includes("caution")) return "caution";
  return "safe";
}

function buildSummary(status: SafetyStatus, count: number): string {
  const prefix =
    status === "safe"
      ? "Overall assessment: Safe."
      : status === "caution"
        ? "Overall assessment: Needs caution."
        : "Overall assessment: Avoid use.";

  return `${prefix} ${count} ingredient${count === 1 ? "" : "s"} analyzed with automated vetting. Review individual rationales before publishing.`;
}

function buildRationale(name: string, status: SafetyStatus): string {
  switch (status) {
    case "safe":
      return `${name} is widely recognized as low-risk in topical consumer products.`;
    case "caution":
      return `${name} has mixed safety data. Consider concentration and product context before final approval.`;
    case "banned":
      return `${name} is flagged for exclusion due to regulatory or scientific concerns.`;
    default:
      return "No rationale available.";
  }
}

// buildSourceUrl function moved to server/utils/ewgUrlBuilder.ts
// This function is kept for backward compatibility but is no longer used
// Kept here temporarily in case of any direct references
function buildSourceUrl(status: SafetyStatus): string {
  switch (status) {
    case "safe":
      return "https://www.ewg.org/skindeep/";
    case "caution":
      return "https://www.ewg.org/skindeep/";
    case "banned":
      return "https://www.ewg.org/skindeep/";
    default:
      return "https://www.ewg.org/skindeep/";
  }
}

function cryptoRandomId(): string {
  return randomUUID();
}

