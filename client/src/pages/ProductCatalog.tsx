import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, SlidersHorizontal, X } from "lucide-react";
import Header from "@/components/Header";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Product, ProductType } from "@shared/types";

const CATEGORIES = ["All", "Food & Drink", "Skincare", "Supplements", "Personal Care"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_TO_TYPE: Record<Category, ProductType | "all"> = {
  "All": "all",
  "Food & Drink": "food",
  "Skincare": "cosmetic",
  "Supplements": "supplement",
  "Personal Care": "personal_care",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  safe:    { label: "Safe",    color: "var(--fp-teal-bright)" },
  caution: { label: "Caution", color: "#f59e0b" },
  banned:  { label: "Avoid",   color: "#ef4444" },
};

function SafeDot({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? STATUS_LABELS.caution;
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: cfg.color,
        boxShadow: `0 0 6px ${cfg.color}66`,
        flexShrink: 0,
      }}
    />
  );
}

function ProductCard({ product }: { product: Product }) {
  const cfg = STATUS_LABELS[product.overallStatus] ?? STATUS_LABELS.caution;
  return (
    <Link href={`/product/${product.id}`}>
      <div
        className="glass-card"
        style={{
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: "1.25rem",
          borderRadius: "var(--radius-lg)",
          transition: "transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out)",
          height: "100%",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        }}
      >
        {/* Image */}
        {product.imageUrl ? (
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <img
              src={product.imageUrl}
              alt={product.name}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              borderRadius: "var(--radius-md)",
              background: "rgba(0,229,200,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
            }}
          >
            🧪
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--fp-text-muted)" }}>
            {product.brand}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "var(--text-sm)",
              color: "var(--fp-text-primary)",
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {product.name}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <SafeDot status={product.overallStatus} />
            <span style={{ fontSize: "var(--text-xs)", color: cfg.color, fontWeight: 500 }}>
              {cfg.label}
            </span>
          </div>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--fp-text-muted)" }}>
            {product.ingredientCount ?? product.ingredients?.length ?? 0} ingredients
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ProductCatalog() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const typeFilter = CATEGORY_TO_TYPE[category];
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && p.overallStatus !== statusFilter) return false;
      if (typeFilter !== "all" && p.productType !== typeFilter) return false;
      return true;
    });
  }, [products, query, statusFilter, category]);

  return (
    <div style={{ minHeight: "100vh", paddingTop: "64px" }}>
      <Header showAdminLink={!!user} />

      {/* Page header */}
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "3rem 1.5rem 2rem",
        }}
      >
        <div style={{ marginBottom: "2rem" }}>
          <div
            className="glass-pill"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.35rem 0.9rem",
              marginBottom: "1rem",
              fontSize: "var(--text-xs)",
              color: "var(--fp-teal-bright)",
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            ✦ PRODUCT CATALOG
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.03em",
              color: "var(--fp-text-primary)",
              marginBottom: "0.5rem",
            }}
          >
            Every Product,{" "}
            <span style={{ color: "var(--fp-teal-bright)" }}>Fully Transparent</span>
          </h1>
          <p style={{ color: "var(--fp-text-secondary)", fontSize: "var(--text-sm)", maxWidth: 560 }}>
            {products.length} products analyzed. Every ingredient AI-vetted against peer-reviewed science.
          </p>
        </div>

        {/* Search + filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
          {/* Search bar */}
          <div style={{ position: "relative", maxWidth: 560 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "1rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--fp-text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search products or brands…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                paddingLeft: "2.75rem",
                paddingRight: query ? "2.75rem" : "1rem",
                paddingTop: "0.75rem",
                paddingBottom: "0.75rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--fp-glass-border)",
                borderRadius: "var(--radius-lg)",
                color: "var(--fp-text-primary)",
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-body)",
                outline: "none",
                transition: "border-color 150ms",
              }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(0,229,200,0.4)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--fp-glass-border)"; }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--fp-text-muted)",
                  padding: "0.25rem",
                  display: "flex",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status pills */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <SlidersHorizontal size={14} style={{ color: "var(--fp-text-muted)" }} />
            {(["all", "safe", "caution", "banned"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: "0.3rem 0.85rem",
                  borderRadius: "999px",
                  border: statusFilter === s
                    ? "1px solid rgba(0,229,200,0.5)"
                    : "1px solid var(--fp-glass-border)",
                  background: statusFilter === s ? "rgba(0,229,200,0.12)" : "rgba(255,255,255,0.04)",
                  color: statusFilter === s ? "var(--fp-teal-bright)" : "var(--fp-text-muted)",
                  fontSize: "var(--text-xs)",
                  fontWeight: statusFilter === s ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 150ms",
                  textTransform: "capitalize",
                }}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]?.label ?? s}
              </button>
            ))}
          </div>

          {/* Category tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: "0.3rem 0.85rem",
                  borderRadius: "999px",
                  border: category === cat
                    ? "1px solid rgba(0,229,200,0.5)"
                    : "1px solid var(--fp-glass-border)",
                  background: category === cat ? "rgba(0,229,200,0.12)" : "rgba(255,255,255,0.04)",
                  color: category === cat ? "var(--fp-teal-bright)" : "var(--fp-text-muted)",
                  fontSize: "var(--text-xs)",
                  fontWeight: category === cat ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 150ms",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        {(query || statusFilter !== "all" || category !== "All") && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--fp-text-muted)", marginBottom: "1.5rem" }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            {query ? ` for "${query}"` : ""}
            {category !== "All" ? ` in ${category}` : ""}
          </p>
        )}

        {/* Grid */}
        {isLoading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="glass-card"
                style={{ height: 280, borderRadius: "var(--radius-lg)", opacity: 0.4 }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "4rem 2rem",
              color: "var(--fp-text-muted)",
            }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔍</div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 600 }}>
              No products found
            </p>
            <p style={{ fontSize: "var(--text-sm)", marginTop: "0.5rem" }}>
              Try a different search term or filter
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
