import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { Link } from "wouter";

interface Product {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  overallStatus: "safe" | "caution" | "banned";
  status: "draft" | "published";
  editedFromProductId?: string | null;
  isDraft?: boolean;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("all");

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products?includeUnpublished=true"],
  });

  const draftMap = (products || [])
    .filter(p => p.status === "draft" && p.editedFromProductId)
    .reduce((acc, draft) => {
      if (draft.editedFromProductId) {
        acc[draft.editedFromProductId] = true;
      }
      return acc;
    }, {} as Record<string, boolean>);

  const publishedProducts = (products || []).filter(p => p.status === "published");

  const filteredProducts = publishedProducts.filter((product) => {
    if (activeTab === "all") return true;
    return product.overallStatus === activeTab;
  });

  return (
    <div className="min-h-screen bg-muted/20">
      <Header showAdminLink={false} />
      
      <div className="container px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage product safety reports</p>
          </div>
          <Link href="/admin/new">
            <Button data-testid="button-new-product">
              <Plus className="mr-2 h-4 w-4" />
              New Product
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Published Products</div>
            <div className="text-3xl font-bold">{publishedProducts.length}</div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Safe Products</div>
            <div className="text-3xl font-bold text-safety-safe">
              {publishedProducts.filter((p) => p.overallStatus === "safe").length}
            </div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground mb-1">Needs Review</div>
            <div className="text-3xl font-bold text-safety-caution">
              {publishedProducts.filter((p) => p.overallStatus === "caution").length}
            </div>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList data-testid="tabs-filter">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="safe" data-testid="tab-safe">Safe</TabsTrigger>
            <TabsTrigger value="caution" data-testid="tab-caution">Caution</TabsTrigger>
            <TabsTrigger value="banned" data-testid="tab-banned">Banned</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading products...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard 
                      key={product.id}
                      id={product.id}
                      name={product.name}
                      brand={product.brand}
                      imageUrl={product.imageUrl}
                      safetyStatus={product.overallStatus}
                      isAdmin={true}
                      productStatus={product.status}
                      hasDraft={draftMap[product.id] || false}
                    />
                  ))}
                </div>
                {filteredProducts.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No products found in this category</p>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
