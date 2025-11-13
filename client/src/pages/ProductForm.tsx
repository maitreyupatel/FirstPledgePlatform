import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";

import Header from "@/components/Header";
import IngredientAccordion from "@/components/IngredientAccordion";
import SafetyBadge from "@/components/SafetyBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VetIngredientResult, SafetyStatus } from "@shared/types";

interface ProductFormParams {
  params: {
    action: "new" | "edit" | string;
    id?: string;
  };
}

interface IngredientInput {
  id: string;
  name: string;
  status: SafetyStatus;
  rationale: string;
  sourceUrl: string;
}

interface ProductFormValues {
  name: string;
  brand: string;
  summary: string;
  imageUrl: string;
  status: "draft" | "published";
  overallStatus: SafetyStatus;
}

interface ProductResponse extends ProductFormValues {
  id: string;
  ingredients: IngredientInput[];
}

const statusCycle: SafetyStatus[] = ["safe", "caution", "banned"];

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function ProductForm({ params }: ProductFormParams) {
  const isCreate = params.action === "new";
  const productId = params.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [ingredients, setIngredients] = useState<IngredientInput[]>([]);
  const [ingredientsText, setIngredientsText] = useState("");
  const [newIngredient, setNewIngredient] = useState({
    name: "",
    status: "safe" as SafetyStatus,
    rationale: "",
    sourceUrl: "",
  });

  const form = useForm<ProductFormValues>({
    defaultValues: {
      name: "",
      brand: "",
      summary: "",
      imageUrl: "",
      status: "draft",
      overallStatus: "safe",
    },
  });

  const productQueryKey =
    !isCreate && productId
      ? [`/api/products/${productId}?includeUnpublished=true`]
      : null;

  const { data: productData, isLoading } = useQuery<ProductResponse | null>({
    queryKey: productQueryKey ?? ["product-form:noop"],
    enabled: Boolean(productQueryKey),
  });

  useEffect(() => {
    if (productData) {
      form.reset({
        name: productData.name,
        brand: productData.brand,
        summary: productData.summary,
        imageUrl: productData.imageUrl,
        status: productData.status,
        overallStatus: productData.overallStatus,
      });
      setIngredients(productData.ingredients ?? []);
    }
  }, [productData, form]);

  const vetMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/vet-ingredients", {
        ingredientsText: text,
      });
      return (await response.json()) as VetIngredientResult;
    },
    onSuccess: (result) => {
      setIngredients(result.ingredients);
      toast({
        title: "Ingredients analyzed",
        description:
          "AI analysis completed. Review the ingredient list before publishing.",
      });
    },
    onError: () => {
      toast({
        title: "Unable to vet ingredients",
        description: "Please try again with a cleaner ingredient list.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const payload = { ...values, ingredients };
      if (isCreate) {
        const response = await apiRequest("POST", "/api/products", payload);
        return response.json();
      }

      const response = await apiRequest(
        "PATCH",
        `/api/products/${productId}`,
        payload,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/products?includeUnpublished=true"],
      });
      toast({
        title: "Product saved",
        description: "Your changes have been stored successfully.",
      });
      navigate("/admin");
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Please review the form and try again.",
        variant: "destructive",
      });
    },
  });

  const safeCount = useMemo(
    () => ingredients.filter((ingredient) => ingredient.status === "safe").length,
    [ingredients],
  );
  const cautionCount = useMemo(
    () =>
      ingredients.filter((ingredient) => ingredient.status === "caution")
        .length,
    [ingredients],
  );
  const bannedCount = useMemo(
    () => ingredients.filter((ingredient) => ingredient.status === "banned").length,
    [ingredients],
  );

  const addManualIngredient = () => {
    if (!newIngredient.name.trim()) {
      toast({
        title: "Ingredient name required",
        description: "Please enter a name before adding.",
        variant: "destructive",
      });
      return;
    }

    setIngredients((prev) => [
      ...prev,
      {
        id: generateId(),
        name: newIngredient.name.trim(),
        status: newIngredient.status,
        rationale:
          newIngredient.rationale ||
          "Manually added ingredient. Provide rationale before publishing.",
        sourceUrl:
          newIngredient.sourceUrl ||
          "https://www.ewg.org/skindeep/ingredients/",
      },
    ]);

    setNewIngredient({
      name: "",
      status: "safe",
      rationale: "",
      sourceUrl: "",
    });
  };

  const handleCycleStatus = (id: string) => {
    setIngredients((prev) =>
      prev.map((ingredient) => {
        if (ingredient.id !== id) return ingredient;
        const currentIndex = statusCycle.indexOf(ingredient.status);
        const nextIndex = (currentIndex + 1) % statusCycle.length;
        return { ...ingredient, status: statusCycle[nextIndex] };
      }),
    );
  };

  const handleRemoveIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((ingredient) => ingredient.id !== id));
  };

  const handleSubmit = form.handleSubmit((values) => {
    if (ingredients.length === 0) {
      toast({
        title: "Add ingredients first",
        description:
          "A product report requires at least one ingredient analysis.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate(values);
  });

  return (
    <div className="min-h-screen bg-muted/10">
      <Header showAdminLink />
      <main className="container px-4 md:px-6 py-10 space-y-10">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">
              Product Safety Editor
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {isCreate ? "Create Product Report" : "Update Product Report"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Use AI vetting to bootstrap ingredient analysis, then review and
              override as needed before publishing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin">
                <span>Cancel</span>
              </Link>
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saveMutation.isPending || isLoading}
              data-testid="button-save-product"
            >
              {saveMutation.isPending ? "Saving..." : "Save Product"}
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input id="name" {...form.register("name", { required: true })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input id="brand" {...form.register("brand", { required: true })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input id="imageUrl" {...form.register("imageUrl")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  rows={5}
                  {...form.register("summary", { required: true })}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Publication Status</Label>
                  <Select
                    defaultValue={form.getValues("status")}
                    onValueChange={(value: "draft" | "published") =>
                      form.setValue("status", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Overall Safety</Label>
                  <Select
                    defaultValue={form.getValues("overallStatus")}
                    onValueChange={(value: SafetyStatus) =>
                      form.setValue("overallStatus", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="safe">Safe</SelectItem>
                      <SelectItem value="caution">Caution</SelectItem>
                      <SelectItem value="banned">Banned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Safety Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2 rounded-xl border bg-card/60 p-4">
                <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Overall Verdict
                </p>
                <SafetyBadge status={form.watch("overallStatus")} showLabel />
                <p className="text-sm text-muted-foreground">
                  Publish when the safety summary is ready for consumers. Drafts
                  remain visible only to administrators.
                </p>
              </div>
              <Separator />
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Drafts can be generated automatically from published reports.
                  Use the ingredient vetting workflow below to accelerate
                  research.
                </p>
                <p>
                  Override the AI verdict to capture final editorial decisions
                  before publishing.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>AI Ingredient Vetting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={6}
                value={ingredientsText}
                onChange={(event) => setIngredientsText(event.target.value)}
                placeholder="Paste the full ingredient list here. Separate ingredients with commas or new lines."
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => vetMutation.mutate(ingredientsText)}
                  disabled={vetMutation.isPending || !ingredientsText.trim()}
                  data-testid="button-vet-ingredients"
                >
                  {vetMutation.isPending ? "Analyzing..." : "Vet with AI"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  The AI researcher parses every ingredient, assigns a safety
                  level, and returns citations for manual review.
                </p>
              </div>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Add Ingredient Manually</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ingredient-name">Ingredient Name</Label>
                    <Input
                      id="ingredient-name"
                      value={newIngredient.name}
                      onChange={(event) =>
                        setNewIngredient((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={newIngredient.status}
                      onValueChange={(value: SafetyStatus) =>
                        setNewIngredient((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="safe">Safe</SelectItem>
                        <SelectItem value="caution">Caution</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ingredient-rationale">Rationale</Label>
                  <Textarea
                    id="ingredient-rationale"
                    rows={3}
                    value={newIngredient.rationale}
                    onChange={(event) =>
                      setNewIngredient((prev) => ({
                        ...prev,
                        rationale: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ingredient-source">Source URL</Label>
                  <Input
                    id="ingredient-source"
                    value={newIngredient.sourceUrl}
                    onChange={(event) =>
                      setNewIngredient((prev) => ({
                        ...prev,
                        sourceUrl: event.target.value,
                      }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addManualIngredient}
                >
                  Add Ingredient
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Ingredient Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm font-medium">
                <div>
                  <p className="text-muted-foreground">Safe</p>
                  <p className="text-lg text-safety-safe">{safeCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Caution</p>
                  <p className="text-lg text-safety-caution">{cautionCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Banned</p>
                  <p className="text-lg text-safety-banned">{bannedCount}</p>
                </div>
              </div>
              <Separator />
              <p className="text-sm text-muted-foreground">
                Click an ingredient in the list below to cycle through safety
                states or remove it entirely.
              </p>
              <div className="space-y-3">
                {ingredients.map((ingredient) => (
                  <div
                    key={ingredient.id}
                    className="flex items-start justify-between gap-4 rounded-lg border bg-card/60 p-4"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{ingredient.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {ingredient.rationale}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        onClick={() => handleCycleStatus(ingredient.id)}
                      >
                        <SafetyBadge status={ingredient.status} showLabel />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleRemoveIngredient(ingredient.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}

                {ingredients.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No ingredients yet. Vet an ingredient list or add them
                    manually.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Ingredient Research Preview
          </h2>
          {ingredients.length > 0 ? (
            <IngredientAccordion ingredients={ingredients} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Ingredient breakdown will appear here once you have at least one
                vetted entry.
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
