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
    <section className="relative pt-32 pb-6 flex flex-col items-center justify-center overflow-hidden px-4">
      {/* Hero glass card — liquid glass surface floating on the vivid ambient background */}
      <div className="relative z-10 w-full max-w-3xl mx-auto">

        {/* Aurora prismatic border layer */}
        <div
          className="absolute inset-0 rounded-3xl opacity-60 pointer-events-none"
          style={{
            background: "conic-gradient(from 0deg, hsl(158 82% 45% / 0.4), hsl(200 82% 55% / 0.3), hsl(260 75% 65% / 0.25), hsl(310 70% 60% / 0.2), hsl(158 82% 45% / 0.4))",
            padding: "1px",
            borderRadius: "1.5rem",
            animation: "aurora-spin 12s linear infinite",
          }}
        />

        <div
          className="relative glass glass-shimmer rounded-3xl px-8 py-14 md:px-14 md:py-20 text-center space-y-7"
          style={{
            boxShadow:
              "0 40px 100px rgba(0,0,0,0.35), 0 16px 40px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(0,0,0,0.06)",
          }}
        >
          {/* Eyebrow pill */}
          <div
            className="inline-flex items-center gap-2 glass-subtle px-4 py-1.5 rounded-full animate-fade-up"
            style={{ animationDelay: "0ms", animationFillMode: "both" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Trust-as-a-Service Platform
            </span>
          </div>

          {/* Headline — animated gradient */}
          <h1
            className="font-display font-extrabold leading-[1.04] tracking-tight animate-fade-up"
            style={{
              fontSize: "clamp(2.6rem, 6.5vw, 4.75rem)",
              animationDelay: "80ms",
              animationFillMode: "both",
            }}
          >
            <span className="text-foreground">Know What's In</span>
            <br />
            <span className="text-gradient-animated">Every Product</span>
          </h1>

          {/* Sub-headline */}
          <p
            className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto leading-relaxed animate-fade-up"
            style={{ animationDelay: "160ms", animationFillMode: "both" }}
          >
            AI-powered ingredient safety reports backed by scientific research.
            Every ingredient analyzed, every source cited — complete transparency.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2 animate-fade-up"
            style={{ animationDelay: "240ms", animationFillMode: "both" }}
          >
            {/* Primary CTA — shimmer gradient button */}
            <button
              onClick={scrollToProducts}
              data-testid="button-explore-products"
              className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full font-semibold text-sm overflow-hidden transition-all duration-500 hover:scale-[1.04] hover:-translate-y-0.5 active:scale-[0.97]"
              style={{
                background:
                  "linear-gradient(135deg, hsl(158 82% 46%) 0%, hsl(168 82% 38%) 50%, hsl(158 72% 32%) 100%)",
                color: "hsl(158 10% 5%)",
                boxShadow:
                  "0 8px 32px hsl(158 82% 45% / 0.40), 0 2px 8px hsl(158 82% 45% / 0.20), inset 0 1px 0 rgba(255,255,255,0.30)",
              }}
            >
              <span className="relative z-10">Explore Products</span>
              <ArrowDown className="relative z-10 h-4 w-4 transition-transform duration-400 group-hover:translate-y-0.5" />
              {/* Shimmer sweep */}
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
            </button>

            {/* Secondary CTA */}
            <button
              onClick={() =>
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })
              }
              className="glass-subtle inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-300 hover:scale-[1.03] hover:-translate-y-0.5"
            >
              How It Works
            </button>
          </div>

          {/* Trust pills */}
          <div
            className="flex flex-wrap gap-2 justify-center pt-1 animate-fade-up"
            style={{ animationDelay: "320ms", animationFillMode: "both" }}
          >
            {TRUST_PILLS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="glass-subtle flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 hover:scale-105"
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
        className="mt-10 flex flex-col items-center gap-2 opacity-35 hover:opacity-65 transition-opacity duration-400 z-10"
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
