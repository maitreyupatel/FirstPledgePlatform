import { randomUUID } from "node:crypto";

import { Product } from "../shared/types";

const now = () => new Date().toISOString();

const makeIngredient = (
  name: string,
  status: "safe" | "caution" | "banned",
  rationale: string,
  sourceUrl: string,
) => {
  const timestamp = now();
  return {
    id: randomUUID(),
    name,
    status,
    rationale,
    sourceUrl,
    originalStatus: status,
    isOverride: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const makeProduct = ({
  name,
  brand,
  imageUrl,
  summary,
  status,
  ingredients,
}: {
  name: string;
  brand: string;
  imageUrl: string;
  summary: string;
  status: "draft" | "published";
  ingredients: ReturnType<typeof makeIngredient>[];
}): Product => {
  const timestamp = now();
  const overallStatus = ingredients.some((item) => item.status === "banned")
    ? "banned"
    : ingredients.some((item) => item.status === "caution")
      ? "caution"
      : "safe";

  return {
    id: randomUUID(),
    name,
    brand,
    imageUrl,
    summary,
    status,
    overallStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: status === "published" ? timestamp : null,
    editedFromProductId: null,
    ingredients,
  };
};

export const seedProducts: Product[] = [
  makeProduct({
    name: "Pure Origins Calming Cleanser",
    brand: "Purity Labs",
    imageUrl: "/generated_images/Natural_hand_soap_dispenser_e09c5e27.png",
    summary:
      "A gentle, low-foaming facial cleanser designed for sensitive skin. Formulated with plant-derived surfactants and soothing botanical extracts.",
    status: "published",
    ingredients: [
      makeIngredient(
        "Aloe Barbadensis Leaf Juice",
        "safe",
        "Provides hydration and anti-inflammatory benefits suitable for sensitive skin.",
        "https://pubmed.ncbi.nlm.nih.gov/23480214/",
      ),
      makeIngredient(
        "Decyl Glucoside",
        "safe",
        "A mild, biodegradable surfactant derived from coconut, known for gentle cleansing.",
        "https://pubchem.ncbi.nlm.nih.gov/compound/Decyl-glucoside",
      ),
      makeIngredient(
        "Phenoxyethanol",
        "caution",
        "Safe within cosmetic limits, but continuous exposure may irritate very sensitive skin.",
        "https://www.cir-safety.org/ingredient/phenoxyethanol",
      ),
    ],
  }),
  makeProduct({
    name: "Everclean Home Surface Spray",
    brand: "Everclean Collective",
    imageUrl: "/generated_images/Natural_cleaning_spray_bottle_808ea381.png",
    summary:
      "Plant-powered disinfecting spray for kitchen and high-touch surfaces with transparent ingredient disclosure.",
    status: "published",
    ingredients: [
      makeIngredient(
        "Citric Acid",
        "safe",
        "Naturally-derived pH adjuster that also provides antimicrobial benefits.",
        "https://pubchem.ncbi.nlm.nih.gov/compound/Citric-acid",
      ),
      makeIngredient(
        "Benzalkonium Chloride",
        "caution",
        "Effective disinfectant but classified as a moderate irritant; use with gloves.",
        "https://www.epa.gov/sites/default/files/2015-09/documents/benzalkonium-chloride.pdf",
      ),
      makeIngredient(
        "Synthetic Fragrance Blend",
        "banned",
        "Undisclosed fragrance components may include phthalates; insufficient transparency.",
        "https://www.ewg.org/skindeep/ingredients/702512-FRAGRANCE/",
      ),
    ],
  }),
  makeProduct({
    name: "VitalGlow Daily Multivitamin",
    brand: "VitalGlow Labs",
    imageUrl: "/generated_images/Vitamin_supplement_bottle_e47e4daf.png",
    summary:
      "A comprehensive once-daily vitamin with focus on energy support and immune resilience.",
    status: "draft",
    ingredients: [
      makeIngredient(
        "Vitamin C (Ascorbic Acid)",
        "safe",
        "Essential antioxidant that supports immune response and collagen synthesis.",
        "https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/",
      ),
      makeIngredient(
        "Vitamin B6 (Pyridoxine HCL)",
        "safe",
        "Supports energy metabolism and nervous system health.",
        "https://ods.od.nih.gov/factsheets/VitaminB6-HealthProfessional/",
      ),
      makeIngredient(
        "Titanium Dioxide",
        "caution",
        "Used as a whitening agent; oral safety under review by some regulators.",
        "https://www.efsa.europa.eu/en/efsajournal/pub/6585",
      ),
    ],
  }),
];

