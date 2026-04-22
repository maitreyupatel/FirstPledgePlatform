import { ArrowDown, Leaf, FlaskConical, ShieldCheck } from "lucide-react";

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
    <section className="relative pt-36 pb-8 flex flex-col items-center justify-center overflow-hidden px-4">
      {/* Glass hero card — the liquid glass surface itself */}
      <div className="relative z-10 w-full max-w-3xl mx-auto">
        <div className="glass rounded-3xl px-8 py-14 md:px-14 md:py-20 text-center space-y-7 animate-fade-up"
          style={{
            boxShadow: "0 32px 80px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.04)",
          }}
        >
          {/* Prismatic top highlight bar */}
          <div className="absolute top-0 left-8 right-8 h-px rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 30%, hsl(158 82% 55% / 0.5) 50%, rgba(255,255,255,0.6) 70%, transparent 100%)",
            }}
          />

          {/* Eyebrow pill */}
          <div className="inline-flex items-center gap-2 glass-subtle px-4 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Trust-as-a-Service Platform
            </span>
          </div>

          {/* Headline */}
          <h1
            className="font-display font-extrabold text-foreground leading-[1.06] tracking-tight"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.25rem)" }}
          >
            Know What's In{" "}
            <span
              style={{
                background: "linear-gradient(135deg, hsl(158 82% 52%) 0%, hsl(158 72% 38%) 50%, hsl(178 82% 46%) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Every Product
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            AI-powered ingredient safety reports backed by scientific research.
            Every ingredient analyzed, every source cited.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
            <button
              onClick={scrollToProducts}
              data-testid="button-explore-products"
              className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full font-semibold text-sm overflow-hidden transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, hsl(158 82% 45%) 0%, hsl(158 72% 36%) 100%)",
                color: "hsl(158 10% 5%)",
                boxShadow: "0 8px 32px hsl(158 82% 45% / 0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              <span>Explore Products</span>
              <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
            </button>

            <button
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              className="glass-subtle inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-300 hover:scale-[1.02]"
            >
              How It Works
            </button>
          </div>

          {/* Trust pills */}
          <div className="flex flex-wrap gap-2 justify-center pt-1">
            {TRUST_PILLS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="glass-subtle flex items-center gap-1.5 px-3.5 py-1.5 rounded-full"
              >
                <Icon className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <button
        onClick={scrollToProducts}
        className="mt-10 flex flex-col items-center gap-2 opacity-40 hover:opacity-70 transition-opacity duration-300 z-10"
        aria-label="Scroll to products"
      >
        <div className="w-5 h-8 rounded-full border border-foreground/20 flex items-start justify-center pt-1.5">
          <div
            className="w-1 h-1.5 rounded-full bg-foreground/50"
            style={{ animation: "float-orb-3 2s ease-in-out infinite" }}
          />
        </div>
      </button>
    </section>
  );
}
