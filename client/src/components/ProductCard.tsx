import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, ArrowUpRight, CheckCircle } from "lucide-react";
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
import { useState, useEffect, useRef } from "react";

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

// Map safety status to numeric score
const SCORE_MAP: Record<SafetyStatus, number> = {
  safe:    9.2,
  caution: 6.1,
  banned:  2.8,
};

const STATUS_LABEL: Record<SafetyStatus, string> = {
  safe:    "Safe",
  caution: "Caution",
  banned:  "Banned",
};

const STATUS_COLOR: Record<SafetyStatus, string> = {
  safe:    "#22c55e",
  caution: "#f59e0b",
  banned:  "#ef4444",
};

// Animated score bar
function ScoreBar({ score, delay = 0 }: { score: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated) {
          setTimeout(() => setAnimated(true), delay);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animated, delay]);

  return (
    <div ref={ref} className="score-bar">
      <div
        className="score-bar-fill"
        style={{ transform: animated ? `scaleX(${score / 10})` : "scaleX(0)" }}
      />
    </div>
  );
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
  const score = SCORE_MAP[safetyStatus];
  const color = STATUS_COLOR[safetyStatus];

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
      className="glass-card"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
      data-testid={`card-product-${id}`}
    >
      {/* Image */}
      <div
        style={{
          position: "relative",
          height: "240px",
          overflow: "hidden",
          borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
          flexShrink: 0,
        }}
      >
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          data-testid={`img-product-${id}`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 600ms var(--ease-out)",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLImageElement).style.transform = "scale(1.06)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLImageElement).style.transform = "scale(1)")}
        />
        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(8,12,16,0.6) 0%, transparent 50%)",
          }}
        />

        {/* Top badges */}
        <div
          style={{
            position: "absolute",
            top: "0.75rem",
            left: "0.75rem",
            right: "0.75rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {/* VERIFIED badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              padding: "0.25rem 0.625rem",
              background: "rgba(0, 229, 200, 0.15)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(0, 229, 200, 0.30)",
              borderRadius: "9999px",
              fontFamily: "var(--font-body)",
              fontSize: "0.65rem",
              fontWeight: 700,
              color: "var(--fp-teal-bright)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <CheckCircle size={10} />
            Verified
          </div>

          {/* Safety score */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              padding: "0.25rem 0.625rem",
              background: "rgba(8, 12, 16, 0.75)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: `1px solid ${color}40`,
              borderRadius: "9999px",
              fontFamily: "var(--font-display)",
              fontSize: "0.7rem",
              fontWeight: 800,
              color,
              letterSpacing: "-0.01em",
            }}
          >
            {score} / 10
          </div>
        </div>

        {/* Admin draft badge */}
        {isAdmin && productStatus === "draft" && (
          <div
            style={{
              position: "absolute",
              bottom: "0.75rem",
              left: "0.75rem",
            }}
          >
            <Badge
              variant="secondary"
              className="glass-subtle text-[10px] rounded-lg border-none"
              data-testid={`badge-draft-${id}`}
            >
              Draft
            </Badge>
          </div>
        )}
      </div>

      {/* Card body */}
      <div
        style={{
          flex: 1,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        {/* Brand + name */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.7rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--fp-text-muted)",
              marginBottom: "0.25rem",
            }}
          >
            {brand}
          </p>
          <h3
            className="font-display"
            style={{
              fontSize: "var(--text-base)",
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
              color: "var(--fp-text-primary)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {name}
          </h3>
        </div>

        {/* Score bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.7rem",
                color: "var(--fp-text-muted)",
                letterSpacing: "0.02em",
              }}
            >
              Safety Score
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.75rem",
                fontWeight: 700,
                color,
              }}
            >
              {STATUS_LABEL[safetyStatus]}
            </span>
          </div>
          <ScoreBar score={score} />
        </div>

        {/* CTA or Admin actions */}
        {isAdmin ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "auto" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs rounded-xl"
                style={{ borderColor: "var(--fp-glass-border)", background: "var(--fp-glass-base)" }}
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
                  className="h-8 text-xs rounded-xl"
                  style={{ color: "var(--fp-text-muted)" }}
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
                    {deleteMutation.isPending ? "Deleting…" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              marginTop: "auto",
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--fp-teal-bright)",
              transition: "gap var(--dur-fast) var(--ease-out)",
            }}
          >
            View Full Report
            <ArrowUpRight size={14} />
          </div>
        )}
      </div>
    </div>
  );

  if (isAdmin) {
    return <CardContent />;
  }

  return (
    <Link href={`/product/${id}`}>
      <a className="block h-full" style={{ textDecoration: "none" }}>
        <CardContent />
      </a>
    </Link>
  );
}
