import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useLocation, useRoute } from "wouter";

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VetIngredientResult, SafetyStatus } from "@shared/types";

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
  editedFromProductId?: string | null;
}

const statusCycle: SafetyStatus[] = ["safe", "caution", "banned"];

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function ProductForm() {
  const [match, params] = useRoute<{ action: string; id?: string }>("/admin/:action/:id?");
  const isCreate = params?.action === "new";
  const productId = params?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [ingredients, setIngredients] = useState<IngredientInput[]>([]);
  const [ingredientsText, setIngredientsText] = useState("");
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isOverallStatusOverridden, setIsOverallStatusOverridden] = useState(false);
  const [originalProductId, setOriginalProductId] = useState<string | null>(null);
  const [originalProductStatus, setOriginalProductStatus] = useState<"draft" | "published" | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialFormData, setInitialFormData] = useState<ProductFormValues | null>(null);
  const [initialIngredients, setInitialIngredients] = useState<IngredientInput[]>([]);
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

  const { data: productData, isLoading, refetch: refetchProduct } = useQuery<ProductResponse | null>({
    queryKey: productQueryKey ?? ["product-form:noop"],
    enabled: Boolean(productQueryKey),
    staleTime: 0, // Always refetch when editing
  });

  // Query for original product if we're editing a draft
  const originalProductQueryKey = 
    !isCreate && productData?.editedFromProductId
      ? [`/api/products/${productData.editedFromProductId}?includeUnpublished=true`]
      : null;

  const { data: originalProductData } = useQuery<ProductResponse | null>({
    queryKey: originalProductQueryKey ?? ["original-product:noop"],
    enabled: Boolean(originalProductQueryKey),
    staleTime: 0,
  });

  // Reset form when productData loads (only for edit mode)
  useEffect(() => {
    if (!isCreate && productData && !isLoading) {
      console.log("Loading product data into form:", productData);
      const loadedIngredients = productData.ingredients ?? [];
      
      // Track original product if this is a draft
      if (productData.editedFromProductId) {
        setOriginalProductId(productData.editedFromProductId);
      } else {
        setOriginalProductId(null);
        setOriginalProductStatus(null);
      }
      
      // Calculate what the overall status should be based on ingredients
      const calculatedStatus = (() => {
        if (loadedIngredients.some((i) => i.status === "banned")) return "banned";
        if (loadedIngredients.some((i) => i.status === "caution")) return "caution";
        return "safe";
      })();
      
      // Check if the stored status differs from calculated (meaning it was overridden)
      const wasOverridden = productData.overallStatus !== calculatedStatus;
      setIsOverallStatusOverridden(wasOverridden);
      
      // Store initial state for change tracking
      const initialData: ProductFormValues = {
        name: productData.name || "",
        brand: productData.brand || "",
        summary: productData.summary || "",
        imageUrl: productData.imageUrl || "",
        status: productData.status || "draft",
        overallStatus: productData.overallStatus || calculatedStatus,
      };
      setInitialFormData(initialData);
      setInitialIngredients(JSON.parse(JSON.stringify(loadedIngredients))); // Deep copy
      setHasUnsavedChanges(false);
      
      form.reset(initialData);
      setIngredients(loadedIngredients);
    } else if (isCreate && !isLoading) {
      // Reset to defaults for new product
      setIsOverallStatusOverridden(false);
      setOriginalProductId(null);
      setOriginalProductStatus(null);
      setInitialFormData(null);
      setInitialIngredients([]);
      setHasUnsavedChanges(false);
      form.reset({
        name: "",
        brand: "",
        summary: "",
        imageUrl: "",
        status: "draft",
        overallStatus: "safe",
      });
      setIngredients([]);
    }
  }, [productData, isLoading, isCreate, form]);

  // Update original product status when original product data loads
  useEffect(() => {
    if (originalProductData) {
      setOriginalProductStatus(originalProductData.status || "draft");
    }
  }, [originalProductData]);

  // Check if product is published and should be locked
  const isPublishedAndLocked = !isCreate && productData?.status === "published" && !originalProductId;

  // Watch for form and ingredient changes to track unsaved changes
  useEffect(() => {
    if (isCreate || !initialFormData) {
      setHasUnsavedChanges(false);
      return;
    }
    
    const currentData = form.getValues();
    const formChanged = 
      currentData.name !== initialFormData.name ||
      currentData.brand !== initialFormData.brand ||
      currentData.summary !== initialFormData.summary ||
      currentData.imageUrl !== initialFormData.imageUrl ||
      currentData.overallStatus !== initialFormData.overallStatus;
    
    // Compare ingredients by serializing to JSON (deep comparison, ignoring IDs)
    const ingredientsChanged = 
      JSON.stringify(ingredients.map(i => ({ name: i.name, status: i.status, rationale: i.rationale, sourceUrl: i.sourceUrl }))) !== 
      JSON.stringify(initialIngredients.map(i => ({ name: i.name, status: i.status, rationale: i.rationale, sourceUrl: i.sourceUrl })));
    
    setHasUnsavedChanges(formChanged || ingredientsChanged);
  }, [
    form.watch("name"),
    form.watch("brand"),
    form.watch("summary"),
    form.watch("imageUrl"),
    form.watch("overallStatus"),
    ingredients,
    initialFormData,
    initialIngredients,
    isCreate,
    form,
  ]);

  const vetMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/vet-ingredients", {
        ingredientsText: text,
      });
      return (await response.json()) as VetIngredientResult;
    },
    onSuccess: (result) => {
      setIngredients(result.ingredients);
      // Reset override flag when new ingredients are analyzed
      setIsOverallStatusOverridden(false);
      // Auto-update overall status based on new ingredients
      const newCalculatedStatus = (() => {
        if (result.ingredients.some((i) => i.status === "banned")) return "banned";
        if (result.ingredients.some((i) => i.status === "caution")) return "caution";
        return "safe";
      })();
      form.setValue("overallStatus", newCalculatedStatus);
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
    onSuccess: (savedProduct) => {
      // Invalidate all product queries
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/products?includeUnpublished=true"],
      });
      
      // If editing, invalidate the specific product query and stay on edit page
      if (!isCreate && productId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/products/${productId}?includeUnpublished=true`],
        });
        // Refetch the product to ensure we have the latest data
        // The useEffect will handle updating the form when productData changes
        setTimeout(() => {
          refetchProduct();
        }, 100);
      }
      
      // Reset unsaved changes tracking after successful save
      if (!isCreate && savedProduct) {
        const updatedInitialData: ProductFormValues = {
          name: savedProduct.name || "",
          brand: savedProduct.brand || "",
          summary: savedProduct.summary || "",
          imageUrl: savedProduct.imageUrl || "",
          status: savedProduct.status || "draft",
          overallStatus: savedProduct.overallStatus || "safe",
        };
        setInitialFormData(updatedInitialData);
        setInitialIngredients(JSON.parse(JSON.stringify(savedProduct.ingredients ?? [])));
        setHasUnsavedChanges(false);
      }
      
      toast({
        title: "Product saved",
        description: isCreate 
          ? "Product created successfully. You can now edit it."
          : "Your changes have been stored successfully.",
      });
      
      // Only navigate to admin if creating new product
      if (isCreate && savedProduct.id) {
        // Navigate to edit page for the newly created product
        navigate(`/admin/edit/${savedProduct.id}`);
      }
      // If editing, stay on the same page
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

  // Auto-calculate overall status from ingredients (banned > caution > safe)
  const calculatedOverallStatus = useMemo(() => {
    if (bannedCount > 0) return "banned";
    if (cautionCount > 0) return "caution";
    return "safe";
  }, [bannedCount, cautionCount]);

  // Update overall status when ingredients change (unless manually overridden)
  useEffect(() => {
    if (!isOverallStatusOverridden && ingredients.length > 0) {
      form.setValue("overallStatus", calculatedOverallStatus);
    }
  }, [calculatedOverallStatus, ingredients.length, isOverallStatusOverridden, form]);

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
    // Prevent saving published products
    if (isPublishedAndLocked) {
      toast({
        title: "Cannot save published product",
        description: "Please unpublish the product first to make changes.",
        variant: "destructive",
      });
      return;
    }

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

  const publishMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      // If this is a draft of a published product, merge it into the original
      if (originalProductId && productData?.editedFromProductId) {
        // First save the draft with current values
        const draftPayload = { ...values, ingredients };
        await apiRequest("PATCH", `/api/products/${productId}`, draftPayload);
        
        // Then merge the draft into the original
        const response = await apiRequest("POST", `/api/products/${productId}/merge`, {});
        return response.json();
      } else {
        // Regular publish - just update status
        const payload = { ...values, ingredients, status: "published" };
        const response = await apiRequest("PATCH", `/api/products/${productId}`, payload);
        return response.json();
      }
    },
    onSuccess: (savedProduct) => {
      // Invalidate all product queries
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/products?includeUnpublished=true"],
      });
      
      // Reset unsaved changes tracking after successful publish
      setHasUnsavedChanges(false);
      
      toast({
        title: "Product published",
        description: originalProductId 
          ? "Draft has been merged into the published product."
          : "Product has been published successfully.",
      });
      
      // Navigate to admin dashboard
      navigate("/admin");
    },
    onError: (error: any) => {
      toast({
        title: "Publish failed",
        description: error.message || "Failed to publish product. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePublish = () => {
    const currentValues = form.getValues();
    if (ingredients.length === 0) {
      toast({
        title: "Add ingredients first",
        description:
          "A product report requires at least one ingredient analysis.",
        variant: "destructive",
      });
      setShowPublishDialog(false);
      return;
    }
    publishMutation.mutate(currentValues);
    setShowPublishDialog(false);
  };

  const handleUnpublish = () => {
    const currentValues = form.getValues();
    // Unpublish should only update the status, not create a new product
    // If we're editing a draft, we shouldn't be able to unpublish (shouldn't show button)
    // If we're editing the original published product, just update its status
    if (originalProductId) {
      // This shouldn't happen - can't unpublish when editing a draft
      toast({
        title: "Cannot unpublish",
        description: "You are editing a draft. Publish the draft to update the original product.",
        variant: "destructive",
      });
      setShowUnpublishDialog(false);
      return;
    }
    // Update the current product's status to draft
    saveMutation.mutate({ ...currentValues, status: "draft" });
    setShowUnpublishDialog(false);
  };

  return (
    <div className="min-h-screen bg-muted/10">
      <Header showAdminLink />
      <main className="container max-w-7xl mx-auto px-4 md:px-6 py-10 space-y-10">
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
          <div className="flex items-center gap-2 flex-wrap">
            <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    if (hasUnsavedChanges) {
                      setShowCancelDialog(true);
                    } else {
                      navigate("/admin");
                    }
                  }}
                >
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You have unsaved changes. Are you sure you want to leave? All changes will be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Stay</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => {
                      setShowCancelDialog(false);
                      navigate("/admin");
                    }}
                  >
                    Discard Changes
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {!isPublishedAndLocked && (
              <Button
                onClick={handleSubmit}
                disabled={saveMutation.isPending || isLoading}
                data-testid="button-save-product"
              >
                {saveMutation.isPending ? "Saving..." : "Save Product"}
              </Button>
            )}
            {/* Simplified button logic: Published = Unpublish only, Draft = Publish */}
            {(() => {
              // Don't show button until we know the status (for edit mode)
              if (!isCreate && isLoading) {
                return null;
              }
              
              // Published product - show only Unpublish button
              if (isPublishedAndLocked) {
                return (
                  <AlertDialog open={showUnpublishDialog} onOpenChange={setShowUnpublishDialog}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={saveMutation.isPending || isLoading}
                        data-testid="button-unpublish-product"
                      >
                        Unpublish
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unpublish Product?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will hide the product from public view. You can republish it later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUnpublish}>
                          Unpublish
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                );
              }
              
              // Draft or new product - show Publish button
              return (
                <AlertDialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="default"
                      disabled={publishMutation.isPending || saveMutation.isPending || isLoading}
                      data-testid="button-publish-product"
                    >
                      {publishMutation.isPending ? "Publishing..." : "Publish"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Publish Product?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {originalProductId
                          ? "This will merge the draft into the published product. Make sure all information is accurate and complete."
                          : "This will make the product report publicly visible. Make sure all information is accurate and complete before publishing."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handlePublish}>
                        Publish
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              );
            })()}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isPublishedAndLocked && (
                <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-4">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    This product is published and locked. Unpublish it to make changes.
                  </p>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input id="name" {...form.register("name", { required: true })} disabled={isPublishedAndLocked} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input id="brand" {...form.register("brand", { required: true })} disabled={isPublishedAndLocked} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input id="imageUrl" {...form.register("imageUrl")} disabled={isPublishedAndLocked} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  rows={5}
                  {...form.register("summary", { required: true })}
                  disabled={isPublishedAndLocked}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Publication Status</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm">
                      {(() => {
                        // If editing a draft, show original's status
                        if (originalProductId && originalProductStatus) {
                          return originalProductStatus === "published" ? "Published" : "Draft";
                        }
                        // If editing original published product
                        if (productData?.status === "published" && !originalProductId) {
                          return "Published";
                        }
                        // Otherwise show current status
                        return productData?.status === "published" ? "Published" : "Draft";
                      })()}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {originalProductId 
                        ? "Editing draft of published product. Publish to update the original."
                        : productData?.status === "published" 
                          ? hasUnsavedChanges
                            ? "Changes made. Use 'Publish' to save changes."
                            : "Use 'Unpublish' button to change"
                          : "Use 'Publish' button to publish"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Overall Safety</Label>
                    {isOverallStatusOverridden && (
                      <span className="text-xs text-muted-foreground italic">
                        (Manually overridden)
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Select
                      value={form.watch("overallStatus")}
                      onValueChange={(value: SafetyStatus) => {
                        form.setValue("overallStatus", value);
                        setIsOverallStatusOverridden(true);
                      }}
                      disabled={isPublishedAndLocked}
                    >
                      <SelectTrigger disabled={isPublishedAndLocked}>
                        <SelectValue placeholder="Select rating" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="safe">Safe</SelectItem>
                        <SelectItem value="caution">Caution</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                    {!isOverallStatusOverridden && ingredients.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Auto-calculated from ingredients: {calculatedOverallStatus}
                      </p>
                    )}
                    {isOverallStatusOverridden && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          form.setValue("overallStatus", calculatedOverallStatus);
                          setIsOverallStatusOverridden(false);
                        }}
                      >
                        Reset to auto-calculated ({calculatedOverallStatus})
                      </Button>
                    )}
                  </div>
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
                disabled={isPublishedAndLocked}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => vetMutation.mutate(ingredientsText)}
                  disabled={vetMutation.isPending || !ingredientsText.trim() || isPublishedAndLocked}
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
                      disabled={isPublishedAndLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={newIngredient.status}
                      onValueChange={(value: SafetyStatus) =>
                        setNewIngredient((prev) => ({ ...prev, status: value }))
                      }
                      disabled={isPublishedAndLocked}
                    >
                      <SelectTrigger disabled={isPublishedAndLocked}>
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
                    disabled={isPublishedAndLocked}
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
                    disabled={isPublishedAndLocked}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addManualIngredient}
                  disabled={isPublishedAndLocked}
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
                        disabled={isPublishedAndLocked}
                      >
                        <SafetyBadge status={ingredient.status} showLabel />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleRemoveIngredient(ingredient.id)}
                        disabled={isPublishedAndLocked}
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