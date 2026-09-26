/**
 * Deterministic verdicts for the generic declarations Indian food labels are
 * ALLOWED to print (backlog E1.12). Which names qualify, and the regulation
 * behind it: server/utils/genericDeclaration.ts.
 *
 * Asked to rate such a declaration, the model scores it ~0.2 (it cannot rate
 * an undisclosed category) and is inconsistent about it ("mixed spices"
 * 0.93, "spices and condiments" 0.2). One such verdict held 12 otherwise
 * complete products in the 2026-09-26 repair. The honest verdict is fixed
 * and CONFIDENT: caution, because this label used the permitted class name
 * without listing the contents, so they cannot be checked — not because of
 * any evidence of harm. The publish gate is unchanged.
 *
 * The parser only produces a bare declaration when the label gave no list
 * for it ("Mixed Spices (Clove, Chilli)" becomes the listed spices), so
 * "does not list" is true whenever this fires.
 */
import type { IngredientAnalysis } from "./aiVettingService";
import type { ProductType } from "@shared/types";
import { looksGarbledIngredientName } from "../utils/ingredientParser";
import { genericDeclarationKind as declarationKind, type GenericDeclarationKind } from "../utils/genericDeclaration";

export type { GenericDeclarationKind };

/** Official compendium of the regulation the verdicts cite. */
export const FSSAI_LABELLING_URL =
  "https://fssai.gov.in/upload/uploadfiles/files/Comp_Labelling%20Display_Version%20VII_03042025.pdf";

export function genericDeclarationKind(name: string): GenericDeclarationKind | null {
  return looksGarbledIngredientName(name) ? null : declarationKind(name);
}

const VERDICTS: Record<GenericDeclarationKind, Omit<IngredientAnalysis, "name" | "productType">> = {
  flavouring: {
    status: "caution",
    confidence: 0.85,
    rationale:
      "Generic flavouring declaration. FSSAI's Labelling and Display Regulations, 2020 (Regulation 5) let a label declare " +
      "natural and nature-identical flavouring substances by class name. This label uses the class name and does not list " +
      "the individual flavouring substances, so they cannot be checked. Rated caution for that reason alone: the label " +
      "gives no evidence of a hazard.",
    description:
      "A class declaration for added natural and/or nature-identical flavouring substances, as permitted on Indian " +
      "food labels. The specific flavouring substances are not listed.",
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
      "declare spices, herbs and condiments and their extracts under a class title such as 'spices and condiments' or " +
      "'mixed spices'. This label uses the class title and does not list the individual spices, so they cannot be " +
      "checked. Rated caution for that reason alone: the label gives no evidence of a hazard.",
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
