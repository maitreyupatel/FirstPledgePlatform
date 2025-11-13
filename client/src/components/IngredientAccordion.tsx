import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import SafetyBadge from "./SafetyBadge";
import { ExternalLink } from "lucide-react";

type SafetyStatus = "safe" | "caution" | "banned";

interface Ingredient {
  name: string;
  status: SafetyStatus;
  rationale: string;
  sourceUrl: string;
}

interface IngredientAccordionProps {
  ingredients: Ingredient[];
}

export default function IngredientAccordion({ ingredients }: IngredientAccordionProps) {
  return (
    <Accordion type="single" collapsible className="space-y-3">
      {ingredients.map((ingredient, index) => (
        <AccordionItem
          key={index}
          value={`item-${index}`}
          className="border rounded-lg px-6 bg-card data-[state=open]:bg-muted/30 transition-colors"
          data-testid={`accordion-ingredient-${index}`}
        >
          <AccordionTrigger className="hover:no-underline py-5">
            <div className="flex items-center gap-3 flex-1">
              <SafetyBadge status={ingredient.status} size="sm" />
              <span className="font-semibold text-left text-base text-foreground">{ingredient.name}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-6 pt-2 space-y-4">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Safety Rating
                </span>
                <div className="mt-2">
                  <SafetyBadge status={ingredient.status} showLabel />
                </div>
              </div>
              
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Analysis
                </span>
                <p className="mt-2 leading-relaxed text-foreground">{ingredient.rationale}</p>
              </div>

              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Source
                </span>
                <a
                  href={ingredient.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 text-primary hover:underline font-medium"
                  data-testid={`link-source-${index}`}
                >
                  <span>View Research Citation</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
