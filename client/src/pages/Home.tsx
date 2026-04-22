import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ProductCard from "@/components/ProductCard";
import { FlaskConical, Users, Star, ArrowRight } from "lucide-react";

interface Product {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  overallStatus: "safe" | "caution" | "banned";
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "AI Research",
    description:
      "Our AI engine analyzes every ingredient against safety databases and peer-reviewed scientific literature.",
  },
  {
    step: "02",
    title: "Editorial Review",
    description:
      "Expert reviewers verify AI findings, resolve edge cases, and ensure accuracy before publication.",
  },
  {
    step: "03",
    title: "Transparent Evidence",
    description:
      "Every rating includes clickable citations linking directly to original research sources.",
  },
];

const STATS = [
  { icon: FlaskConical, value: "100K+", label: "Ingredients Analyzed" },
  { icon: Users, value: "50K+", label: "Products Vetted" },
  { icon: Star, value: "4.9", label: "Trust Score" },
];

export default function Home() {
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  return (
    <div className="min-h-screen">
      <Header showAdminLink />
      <Hero />

      {/* Stats strip */}
      <div className="relative z-20 container max-w-3xl mx-auto px-4 md:px-6 mb-16 -mt-2">
        <div className="glass glass-shimmer rounded-3xl p-1">
          <div className="grid grid-cols-3 divide-x divide-white/8">
            {STATS.map(({ icon: Icon, value, label }, i) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1.5 py-6 px-4 animate-fade-up"
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
              >
                <Icon className="h-4 w-4 text-primary mb-0.5 opacity-60" />
                <span className="font-display font-extrabold text-2xl md:text-3xl tracking-tight stat-gradient">
                  {value}
                </span>
                <span className="text-xs text-muted-foreground font-medium text-center">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Products section */}
      <section id="products" className="py-16 md:py-20">
        <div className="container max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-14">
            <div className="space-y-3 max-w-lg">
              <div className="inline-flex items-center gap-2 glass-subtle px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Vetted Products
                </span>
              </div>
              <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight">
                Recently Vetted
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Each product has been thoroughly analyzed by our AI research engine and reviewed
                by our editorial team.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="glass rounded-2xl overflow-hidden animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="aspect-[4/3] bg-white/5" />
                  <div className="p-5 space-y-3">
                    <div className="h-3 bg-white/5 rounded-full w-1/3" />
                    <div className="h-4 bg-white/5 rounded-full w-3/4" />
                    <div className="h-3 bg-white/5 rounded-full w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product, i) => (
                <div
                  key={product.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}
                >
                  <ProductCard
                    id={product.id}
                    name={product.name}
                    brand={product.brand}
                    imageUrl={product.imageUrl}
                    safetyStatus={product.overallStatus}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-3xl py-24 text-center">
              <p className="text-muted-foreground">No products available yet. Check back soon!</p>
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 md:py-28">
        <div className="container max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center space-y-4 mb-20">
            <div className="inline-flex items-center gap-2 glass-subtle px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Our Process
              </span>
            </div>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
              Three steps from raw ingredient list to a fully-cited safety report.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            {HOW_IT_WORKS.map(({ step, title, description }, i) => (
              <div
                key={step}
                className="glass glass-shimmer rounded-3xl p-8 flex flex-col gap-5 group hover:scale-[1.02] transition-all duration-500 ease-spring animate-fade-up relative overflow-hidden"
                style={{ animationDelay: `${i * 110}ms`, animationFillMode: "both" }}
              >
                {/* Step number glow */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-2xl glass-subtle flex items-center justify-center ring-1 ring-primary/20 group-hover:ring-primary/50 transition-all duration-400"
                    style={{
                      boxShadow: "0 0 0 0 hsl(158 82% 48% / 0)",
                      transition: "box-shadow 0.4s ease, ring-color 0.4s ease",
                    }}
                  >
                    <span className="font-display font-extrabold text-sm text-gradient-animated">
                      {step}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary/25 group-hover:text-primary/55 transition-colors duration-300 hidden md:block" />
                </div>
                <div className="space-y-2.5">
                  <h3 className="font-display font-700 text-lg tracking-tight">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-white/6">
        <div className="container max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground/50">
            © 2026 FirstPledge. Trust-as-a-Service.
          </p>
          <p className="text-xs text-muted-foreground/35">
            AI-powered · Science-backed · Independently verified
          </p>
        </div>
      </footer>
    </div>
  );
}
