import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import Header from "@/components/Header";
import IngredientAccordion from "@/components/IngredientAccordion";
import SafetyBadge from "@/components/SafetyBadge";
import SafetyMeter from "@/components/SafetyMeter";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SafetyStatus } from "@shared/types";

interface ProductDetailParams {
  params: { id: string };
}

interface Ingredient {
  id: string;
  name: string;
  status: SafetyStatus;
  rationale: string;
  sourceUrl: string;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  summary: string;
  imageUrl: string;
  status: "draft" | "published";
  overallStatus: SafetyStatus;
  ingredients: Ingredient[];
}

export default function ProductDetail({ params }: ProductDetailParams) {
  const { data: product, isLoading, isError } = useQuery<Product | null>({
    queryKey: [`/api/products/${params.id}`],
  });

  const ingredients = product?.ingredients ?? [];
  const safeCount = ingredients.filter((i) => i.status === "safe").length;
  const cautionCount = ingredients.filter((i) => i.status === "caution").length;
  const bannedCount = ingredients.filter((i) => i.status === "banned").length;

  return (
    <div className="min-h-screen">
      <Header showAdminLink />

      <main className="container max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            asChild
            className="h-9 pl-2 rounded-xl glass-subtle hover:glass text-sm font-medium"
          >
            <Link href="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="glass-subtle px-3 py-1.5 rounded-full">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Safety Report
            </span>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="glass rounded-3xl py-24 flex items-center justify-center">
            <div className="space-y-3 text-center">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Loading safety report...</p>
            </div>
          </div>
        )}

        {(isError || (!isLoading && !product)) && (
          <div className="glass rounded-3xl py-24 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">
              {isError ? "Unable to load report. Please try again." : "Product not found."}
            </p>
          </div>
        )}

        {product && (
          <div className="space-y-8 animate-fade-up">
            {/* Hero section */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Product info */}
              <div className="lg:col-span-7 glass rounded-3xl overflow-hidden relative">
                {/* Subtle gradient bg */}
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    background: "radial-gradient(ellipse 80% 60% at 20% 20%, hsl(var(--primary) / 0.12), transparent 70%)",
                  }}
                />
                <div className="relative z-10 p-8 md:p-10 flex flex-col h-full gap-8">
                  {/* Status pill */}
                  <div className="flex items-center gap-3">
                    <span className="glass-subtle px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-primary">
                      {product.status}
                    </span>
                  </div>

                  {/* Product info */}
                  <div className="flex-1 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-primary/80">{product.brand}</p>
                    <h1 className="font-display font-extrabold text-3xl md:text-4xl tracking-tight leading-tight">
                      {product.name}
                    </h1>
                  </div>

                  {/* Verdict card */}
                  <div className="glass-strong rounded-2xl p-5 flex items-start gap-4">
                    <SafetyBadge status={product.overallStatus} showLabel={false} size="md" />
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Overall Safety Verdict
                      </p>
                      <div className="flex items-center gap-2">
                        <SafetyBadge status={product.overallStatus} showLabel size="sm" />
                      </div>
                      {product.summary && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          {product.summary}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Image + meter */}
              <div className="lg:col-span-5 glass rounded-3xl overflow-hidden flex flex-col">
                <div className="relative aspect-[16/9] overflow-hidden">
                  <img
                    src={product.imageUrl}
                    alt={`${product.name} packaging`}
                    className="w-full h-full object-cover"
                    data-testid="product-detail-image"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
                <div className="p-6 flex flex-col gap-5 flex-1">
                  <SafetyMeter
                    safeCount={safeCount}
                    cautionCount={cautionCount}
                    bannedCount={bannedCount}
                  />
                  {product.status === "draft" && (
                    <>
                      <Separator className="bg-white/8" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Draft — visible to administrators only until published.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Ingredients section */}
            <section className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div className="space-y-2">
                  <h2 className="font-display font-bold text-2xl tracking-tight">
                    Ingredient Analysis
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
                    Each ingredient includes AI-generated research with the source citation supporting its safety rating.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground glass-subtle px-3 py-1.5 rounded-full">
                  {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""}
                </span>
              </div>
              <IngredientAccordion ingredients={ingredients} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
