import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, ArrowUpRight } from "lucide-react";
import SafetyBadge from "./SafetyBadge";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { cn } from "@/lib/utils";

type SafetyStatus = "safe" | "caution" | "banned";

interface ProductCardProps {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  safetyStatus: SafetyStatus;
  isAdmin?: boolean;
  productStatus?: "draft" | "published";
}

export default function ProductCard({
  id,
  name,
  brand,
  imageUrl,
  safetyStatus,
  isAdmin = false,
  productStatus = "published",
}: ProductCardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/products/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products?includeUnpublished=true"] });
      queryClient.removeQueries({ queryKey: [`/api/products/${id}`] });
      toast({ title: "Product deleted", description: "Successfully deleted." });
      setShowDeleteDialog(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete product.", variant: "destructive" });
    },
  });

  const CardContent = () => (
    <div
      className={cn(
        "group relative rounded-2xl overflow-hidden transition-all duration-500 ease-spring",
        "glass card-lift",
        "flex flex-col"
      )}
    >
      {/* Image section */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          data-testid={`img-product-${id}`}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />

        {/* Badges */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
          <SafetyBadge status={safetyStatus} size="md" />
          {isAdmin && productStatus === "draft" && (
            <Badge
              variant="secondary"
              className="text-[10px] glass-subtle rounded-lg border-none"
              data-testid={`badge-draft-${id}`}
            >
              Draft
            </Badge>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 p-5 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-1">{brand}</p>
          <h3 className="font-display font-700 text-base leading-tight line-clamp-2 text-foreground">{name}</h3>
        </div>

        {isAdmin ? (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs rounded-xl border-white/10 hover:border-white/20 glass-subtle"
                onClick={() => setLocation(`/admin/edit/${id}`)}
                data-testid={`button-edit-${id}`}
              >
                <Edit2 className="mr-1.5 h-3 w-3" />
                Edit
              </Button>
              <Link href={`/product/${id}`}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs rounded-xl hover:bg-white/8"
                  data-testid={`button-view-${id}`}
                >
                  View
                </Button>
              </Link>
            </div>
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full h-8 text-xs rounded-xl"
                  data-testid={`button-delete-${id}`}
                >
                  <Trash2 className="mr-1.5 h-3 w-3" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="glass-strong rounded-3xl border-white/10">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes "{name}" and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-primary text-sm font-semibold mt-auto pt-1 group-hover:gap-2.5 transition-all duration-300">
            <span>View Safety Report</span>
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
        )}
      </div>
    </div>
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
      <a data-testid={`card-product-${id}`} className="block h-full">
        <CardContent />
      </a>
    </Link>
  );
}
