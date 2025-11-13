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
import { seedProducts } from "./seed";
import { MemStorage } from "./storage/memStorage";
import { buildSourceUrl as buildEwgSourceUrl } from "./utils/ewgUrlBuilder";
import { AIVettingService } from "./services/aiVettingService";
import { CitationService } from "./services/citationService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// Initialize AI and Citation services
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const googleApiKey = process.env.GOOGLE_API_KEY;
const googleCxId = process.env.GOOGLE_CX_ID;

let aiVettingService: AIVettingService | null = null;
let citationService: CitationService | null = null;

try {
  if (geminiApiKey) {
    aiVettingService = new AIVettingService(geminiApiKey);
    console.log("✅ AI Vetting Service initialized");
  } else {
    console.warn("⚠️  GEMINI_API_KEY not set. AI vetting will use fallback keyword matching.");
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
const storage = new MemStorage(seedProducts);

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

app.get("/api/products", (req, res) => {
  const includeUnpublished = req.query.includeUnpublished === "true";
  const products = storage.list({ includeUnpublished });
  res.json(products);
});

app.get("/api/products/:id", (req, res) => {
  const includeUnpublished = req.query.includeUnpublished === "true";
  const product = storage.getById(req.params.id, { includeUnpublished });

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(product);
});

app.post("/api/products", (req, res) => {
  try {
    const product = storage.create({
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
    console.error(err);
    res.status(400).json({ error: "Unable to create product" });
  }
});

app.patch("/api/products/:id", (req, res) => {
  const product = storage.update(req.params.id, {
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
});

app.delete("/api/products/:id", (req, res) => {
  const deleted = storage.delete(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.status(204).send();
});

app.post("/api/products/:id/edit", (req, res) => {
  const draft = storage.createDraftFromProduct(req.params.id);
  if (!draft) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.status(201).json(draft);
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
            // Only search if the URL is a generic search URL or doesn't contain ewg.org
            if (!sourceUrl.includes("ewg.org/skindeep/ingredients/") || sourceUrl.includes("/search/")) {
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

app.listen(PORT, () => {
  console.log(`✅ API server listening on http://localhost:${PORT}`);
});

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

