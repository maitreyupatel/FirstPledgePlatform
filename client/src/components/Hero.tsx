import { ArrowDown, Leaf, FlaskConical, ShieldCheck } from "lucide-react";
import heroImage from "@assets/generated_images/Natural_ingredients_hero_background_fecc2003.png";

const TRUST_PILLS = [
  { icon: FlaskConical, label: "AI-Verified" },
  { icon: Leaf, label: "Science-Backed" },
  { icon: ShieldCheck, label: "Transparent" },
];

export default function Hero() {
  const scrollToProducts = () => {
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[88vh] flex flex-col items-center justify-center overflow-hidden px-4">
      {/* Background image with deep overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/72 via-black/55 to-black/80" />
      {/* Prismatic bottom fade into page background */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[hsl(var(--background))] to-transparent" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto text-center space-y-8">
        {/* Eyebrow pill */}
        <div className="inline-flex items-center gap-2 glass px-4 py-1.5 rounded-full animate-fade-up"
          style={{ animationDelay: "0ms" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-white/80">
            Trust-as-a-Service Platform
          </span>
        </div>

        {/* Headline */}
        <h1
          className="font-display font-extrabold text-white leading-[1.06] tracking-tight animate-fade-up"
          style={{ animationDelay: "80ms", fontSize: "clamp(2.75rem, 7vw, 5.25rem)" }}
        >
          Trust Through{" "}
          <span
            style={{
              background: "linear-gradient(135deg, hsl(158 82% 62%) 0%, hsl(158 82% 45%) 60%, hsl(178 82% 48%) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Transparency
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed font-light animate-fade-up"
          style={{ animationDelay: "160ms" }}
        >
          We analyze every ingredient so you don't have to. AI-powered safety
          reports backed by scientific research and editorial review.
        </p>

        {/* CTA */}
        <div
          className="flex flex-col sm:flex-row gap-3 justify-center items-center animate-fade-up"
          style={{ animationDelay: "240ms" }}
        >
          <button
            onClick={scrollToProducts}
            data-testid="button-explore-products"
            className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl font-semibold text-sm overflow-hidden transition-all duration-300 ease-spring hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, hsl(158 82% 45%) 0%, hsl(158 72% 36%) 100%)",
              color: "hsl(158 10% 5%)",
              boxShadow: "0 8px 32px hsl(158 82% 45% / 0.30), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            <span>Explore Products</span>
            <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
            {/* Shimmer overlay */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
          </button>

          <button
            className="glass inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-medium text-white/85 hover:text-white transition-all duration-300 hover:scale-[1.02]"
          >
            How It Works
          </button>
        </div>

        {/* Trust pills */}
        <div
          className="flex flex-wrap gap-2.5 justify-center animate-fade-up"
          style={{ animationDelay: "320ms" }}
        >
          {TRUST_PILLS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="glass flex items-center gap-1.5 px-3.5 py-1.5 rounded-full"
            >
              <Icon className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-white/75">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <button
        onClick={scrollToProducts}
        className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 opacity-50 hover:opacity-80 transition-opacity duration-300 animate-fade-in"
        style={{ animationDelay: "500ms" }}
        aria-label="Scroll to products"
      >
        <div className="w-5 h-8 rounded-full border border-white/30 flex items-start justify-center pt-1.5">
          <div
            className="w-1 h-1.5 rounded-full bg-white/70"
            style={{ animation: "float-orb-3 2s ease-in-out infinite" }}
          />
        </div>
      </button>
    </section>
  );
}
