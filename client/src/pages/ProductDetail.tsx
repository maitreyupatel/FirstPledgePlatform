import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

import Header from "@/components/Header";
import IngredientAccordion from "@/components/IngredientAccordion";
import SafetyBadge from "@/components/SafetyBadge";
import SafetyMeter from "@/components/SafetyMeter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SafetyStatus } from "@shared/types";

interface ProductDetailParams {
  params: {
    id: string;
  };
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
  const productId = params.id;
  const {
    data: product,
    isLoading,
    isError,
  } = useQuery<Product | null>({
    queryKey: [`/api/products/${productId}`],
  });

  const safeCount =
    product?.ingredients.filter((ingredient) => ingredient.status === "safe")
      .length ?? 0;
  const cautionCount =
    product?.ingredients.filter((ingredient) => ingredient.status === "caution")
      .length ?? 0;
  const bannedCount =
    product?.ingredients.filter((ingredient) => ingredient.status === "banned")
      .length ?? 0;

  return (
    <div className="min-h-screen bg-muted/10">
      <Header showAdminLink />

      <main className="container max-w-7xl mx-auto px-4 md:px-6 py-10">
        <div className="mb-10 flex items-center justify-between gap-4">
          <Button variant="ghost" asChild>
            <Link href="/">
              <span>← Back to Products</span>
            </Link>
          </Button>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Product Safety Report
          </span>
        </div>

        {isLoading && (
          <div className="flex h-64 items-center justify-center rounded-lg border bg-card text-card-foreground shadow-sm">
            Loading product report...
          </div>
        )}

        {isError && (
          <div className="flex h-64 items-center justify-center rounded-lg border bg-card text-card-foreground shadow-sm">
            Unable to load product report. Please try again later.
          </div>
        )}

        {!isLoading && !isError && !product && (
          <div className="flex h-64 items-center justify-center rounded-lg border bg-card text-card-foreground shadow-sm">
            Product not found.
          </div>
        )}

        {product && (
          <div className="space-y-10">
            <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <Card className="relative overflow-hidden border-none bg-gradient-to-br from-primary/10 via-background to-background shadow-lg lg:col-span-7">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(22,163,74,0.08),_transparent_60%)]" />
                <div className="relative z-10 flex h-full flex-col justify-between p-8 md:p-10">
                  <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-sm font-medium text-primary uppercase tracking-wide">
                      {product.status === "published" ? "Published" : "Draft"}
                    </div>
                    <div className="space-y-4">
                      <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                        {product.name}
                      </h1>
                      <p className="text-lg text-foreground/80">
                        {product.brand}
                      </p>
                    </div>
                  </div>

                  <div className="mt-10 flex items-center gap-4 rounded-2xl bg-card/80 dark:bg-card/90 p-6 shadow-sm backdrop-blur">
                    <SafetyBadge status={product.overallStatus} showLabel />
                    <div className="space-y-1">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">
                        Overall Safety Verdict
                      </p>
                      <p className="text-base text-foreground">
                        {product.summary}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="lg:col-span-5">
                <div className="relative overflow-hidden rounded-2xl border bg-card shadow-lg">
                  <img
                    src={product.imageUrl}
                    alt={`${product.name} product packaging`}
                    className="h-64 w-full object-cover"
                    data-testid="product-detail-image"
                  />
                  <div className="p-6">
                    <SafetyMeter
                      safeCount={safeCount}
                      cautionCount={cautionCount}
                      bannedCount={bannedCount}
                    />
                    <Separator className="my-6" />
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        This report summarizes the current risk assessment for
                        each ingredient. Draft products are visible only to
                        administrators until published.
                      </p>
                      <p>
                        Override any ingredient from the admin workspace to
                        document editorial decisions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-8">
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Ingredient Safety Analysis
                </h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Each ingredient includes AI-generated research along with the
                  source citation used to support the current safety status.
                </p>
              </div>
              <IngredientAccordion ingredients={product.ingredients} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
