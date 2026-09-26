/**
 * Deterministic verdicts for the generic declarations Indian food labels are
 * ALLOWED to print (backlog E1.12).
 *
 * FSSAI's Labelling and Display Regulations, 2020 (Regulation 5, list of
 * ingredients) let a label declare "all spices, herbs and condiments and
 * their extracts" under a class title ("spice and condiments, herbs or mixed
 * spices/condiments as appropriate"), and natural / nature-identical
 * flavouring substances by class name; artificial ones by the flavour's
 * common name. Nearly every packaged food uses one of these declarations.
 *
 * Asked to rate such a declaration, the model scores it ~0.2 (it cannot rate
 * an undisclosed category) and is inconsistent about it ("mixed spices"
 * 0.93, "spices and condiments" 0.2). One such verdict held 12 otherwise
 * complete products in the 2026-09-26 repair. The honest verdict is fixed
 * and CONFIDENT: caution, because the composition is not disclosed and
 * cannot be checked — not because of any evidence of harm. The publish gate
 * is unchanged.
 *
 * Deliberately narrow: only names made entirely of declaration words match.
 * A digit (an additive code), a named flavour ("Artificial Flavouring
 * Substance - Vanilla"), "enhancer", "seasoning" (often a compound whose
 * contents ARE listed) or a damaged name falls through to normal analysis.
 */
import type { IngredientAnalysis } from "./aiVettingService";
import type { ProductType } from "@shared/types";
import { looksGarbledIngredientName } from "../utils/ingredientParser";

export type GenericDeclarationKind = "flavouring" | "spices";

const FLAVOUR_WORD = /^(?:flavou?rs?|flavou?rings?)$/;
const FLAVOUR_FILLER = new Set(["natural", "nature", "identical", "artificial", "and", "added", "substance", "substances", "agent", "agents"]);
const SPICE_WORD = /^(?:spices?|condiments?|herbs?)$/;
const SPICE_FILLER = new Set(["and", "mixed"]);

/** Official compendium of the regulation the verdicts cite. */
export const FSSAI_LABELLING_URL =
  "https://fssai.gov.in/upload/uploadfiles/files/Comp_Labelling%20Display_Version%20VII_03042025.pdf";

export function genericDeclarationKind(name: string): GenericDeclarationKind | null {
  if (/\d/.test(name) || looksGarbledIngredientName(name)) return null;
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return null;
  if (words.some((w) => FLAVOUR_WORD.test(w)) && words.every((w) => FLAVOUR_WORD.test(w) || FLAVOUR_FILLER.has(w))) {
    return "flavouring";
  }
  if (words.some((w) => SPICE_WORD.test(w)) && words.every((w) => SPICE_WORD.test(w) || SPICE_FILLER.has(w))) {
    return "spices";
  }
  return null;
}

const VERDICTS: Record<GenericDeclarationKind, Omit<IngredientAnalysis, "name" | "productType">> = {
  flavouring: {
    status: "caution",
    confidence: 0.85,
    rationale:
      "Generic flavouring declaration. FSSAI's Labelling and Display Regulations, 2020 (Regulation 5) let a label declare " +
      "natural and nature-identical flavouring substances by class name only, and artificial ones by the flavour's common " +
      "name (e.g. vanilla) — never their individual compounds. The flavourings in this product are therefore not disclosed " +
      "and cannot be checked. Rated caution for that reason alone: the label gives no evidence of a hazard.",
    description:
      "A class declaration for added flavourings (natural, nature-identical and/or artificial flavouring substances), " +
      "as permitted on Indian food labels. The specific flavouring substances are not listed.",
    edgeCases:
      "People who need to avoid a specific flavouring substance cannot confirm from the label whether it is present; " +
      "ask the manufacturer.",
    sourceUrl: FSSAI_LABELLING_URL,
  },
  spices: {
    status: "caution",
    confidence: 0.85,
    rationale:
      "Generic spice declaration. FSSAI's Labelling and Display Regulations, 2020 (Regulation 5, class titles) let a label " +
      "declare all spices, herbs and condiments and their extracts under a class title such as 'spices and condiments' or " +
      "'mixed spices'. The individual spices in this product are therefore not disclosed and cannot be checked. Rated " +
      "caution for that reason alone: the label gives no evidence of a hazard.",
    description:
      "A class declaration for a blend of spices, herbs and/or condiments, as permitted on Indian food labels. " +
      "The individual spices are not listed.",
    edgeCases:
      "People who need to avoid a specific spice cannot confirm from the label whether it is present; ask the manufacturer.",
    sourceUrl: FSSAI_LABELLING_URL,
  },
};

/** The fixed verdict for a generic food declaration, or null if the name is not one. */
export function genericDeclarationVerdict(name: string, productType: ProductType): IngredientAnalysis | null {
  if (productType !== "food" && productType !== "supplement") return null;
  const kind = genericDeclarationKind(name);
  return kind ? { name, productType, ...VERDICTS[kind] } : null;
}
