import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VetIngredientResult,
  VetIngredientsRequest,
  SafetyStatus,
} from "../shared/types";
import { seedProducts } from "./seed";
import { MemStorage } from "./storage/memStorage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

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

app.post("/api/vet-ingredients", (req, res) => {
  const payload = req.body as VetIngredientsRequest;
  if (!payload?.ingredientsText?.trim()) {
    res.status(400).json({ error: "ingredientsText is required" });
    return;
  }

  const lines = payload.ingredientsText
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const results: VetIngredientResult = buildVetResult(lines);
  res.json(results);
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
      sourceUrl: buildSourceUrl(status),
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

function buildSourceUrl(status: SafetyStatus): string {
  switch (status) {
    case "safe":
      return "https://pubmed.ncbi.nlm.nih.gov/";
    case "caution":
      return "https://www.ewg.org/skindeep/";
    case "banned":
      return "https://www.fda.gov/cosmetics/cosmetic-ingredients";
    default:
      return "https://example.com";
  }
}

function cryptoRandomId(): string {
  return randomUUID();
}

