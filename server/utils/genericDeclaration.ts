/**
 * Which ingredient names are a generic label DECLARATION that FSSAI's
 * Labelling and Display Regulations, 2020 (Regulation 5) permit — not a
 * specific substance (backlog E1.12). Words only; no dependencies, so the
 * parser and the verdict service can both use it.
 *
 * - Spices: "all spices, herbs and condiments and their extracts" may be
 *   declared under a class title ("spice and condiments, herbs or mixed
 *   spices/condiments"). A spice word is required: bare "Herbs" or
 *   "Condiments" is not matched (for supplements, herbs are the actives).
 * - Flavourings: natural and nature-identical flavouring substances may be
 *   declared by class name. The type must be stated, so bare "Flavours" is
 *   not matched; ARTIFICIAL flavourings must carry the flavour's common
 *   name, so an unnamed one is a labelling gap, not a permitted
 *   declaration — never matched.
 *
 * Callers must only treat a match as undisclosed when the label gave no
 * list for it: the parser turns "Mixed Spices (Clove, Chilli)" into the
 * listed spices, and "Natural Flavouring Substances (Blueberry)" into a
 * name that no longer matches.
 */
export type GenericDeclarationKind = "flavouring" | "spices";

const FLAVOUR_WORD = /^(?:flavou?rs?|flavou?rings?)$/;
const FLAVOUR_TYPE = new Set(["natural", "nature"]);
const FLAVOUR_FILLER = new Set(["natural", "nature", "identical", "and", "added", "permitted", "substance", "substances", "agent", "agents"]);
const SPICE_WORD = /^spices?$/;
const SPICE_FILLER = new Set([
  "and", "mixed", "condiment", "condiments", "herb", "herbs", "extract", "extracts", "natural", "mix", "blend", "powder",
]);

export function genericDeclarationKind(name: string): GenericDeclarationKind | null {
  if (/\d/.test(name)) return null; // an additive code is an identity
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return null;
  if (
    words.some((w) => FLAVOUR_WORD.test(w)) &&
    words.some((w) => FLAVOUR_TYPE.has(w)) &&
    words.every((w) => FLAVOUR_WORD.test(w) || FLAVOUR_FILLER.has(w))
  ) {
    return "flavouring";
  }
  if (words.some((w) => SPICE_WORD.test(w)) && words.every((w) => SPICE_WORD.test(w) || SPICE_FILLER.has(w))) {
    return "spices";
  }
  return null;
}
