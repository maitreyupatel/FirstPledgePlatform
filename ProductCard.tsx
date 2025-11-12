import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Edit2 } from "lucide-react";
import SafetyBadge from "./SafetyBadge";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type SafetyStatus = "safe" | "caution" | "banned";

interface ProductCardProps {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  safetyStatus: SafetyStatus;
  isAdmin?: boolean;
  productStatus?: "draft" | "published";
  hasDraft?: boolean;
}

export default function ProductCard({
  id,
  name,
  brand,
  imageUrl,
  safetyStatus,
  isAdmin = false,
  productStatus = "published",
  hasDraft = false,
}: ProductCardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/products/${id}/edit`, {});
      return response.json();
    },
    onSuccess: (draft) => {
      setLocation(`/admin/edit/${draft.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create draft for editing.",
        variant: "destructive",
      });
    },
  });
  const CardContent = () => (
    <Card className="overflow-hidden hover-elevate active-elevate-2 transition-all duration-300 group">
      <div className="relative aspect-square">
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          data-testid={`img-product-${id}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
          <SafetyBadge status={safetyStatus} size="md" />
          {isAdmin && productStatus === "draft" && (
            <Badge variant="secondary" data-testid={`badge-draft-${id}`}>Draft</Badge>
          )}
          {isAdmin && hasDraft && productStatus === "published" && (
            <Badge variant="secondary" data-testid={`badge-has-draft-${id}`}>Has Draft</Badge>
          )}
        </div>
      </div>
      <div className="p-5 space-y-2">
        <p className="text-sm text-muted-foreground font-medium">{brand}</p>
        <h3 className="font-semibold text-lg leading-tight line-clamp-2">{name}</h3>
        {isAdmin ? (
          <div className="flex gap-2 pt-3">
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1"
              onClick={() => createDraftMutation.mutate()}
              disabled={createDraftMutation.isPending}
              data-testid={`button-edit-${id}`}
            >
              <Edit2 className="mr-2 h-3 w-3" />
              Edit
            </Button>
            <Link href={`/product/${id}`}>
              <Button 
                size="sm" 
                variant="ghost"
                data-testid={`button-view-${id}`}
              >
                View
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-3 text-primary font-medium">
            <span className="text-sm">View Report</span>
            <span className="text-base">→</span>
          </div>
        )}
      </div>
    </Card>
  );

  if (isAdmin) {
    return (
      <div data-testid={`card-product-${id}`}>
        <CardContent />
      </div>
    );
  }

  return (
    <Link href={`/product/${id}`}>
      <a data-testid={`card-product-${id}`}>
        <CardContent />
      </a>
    </Link>
  );
}
