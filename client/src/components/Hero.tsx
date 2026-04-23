import { ChevronDown, FlaskConical, Leaf, ShieldCheck } from "lucide-react";

const TRUST_PILLS = [
  { icon: FlaskConical, label: "AI-Verified" },
  { icon: Leaf,         label: "Science-Backed" },
  { icon: ShieldCheck,  label: "Transparent" },
];

export default function Hero() {
  const scrollTo = (id: string) =>
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section
      style={{
        position: "relative",
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        padding: "0 1.5rem",
      }}
    >
      {/* Localised hero background radial — breathing animation */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0, 229, 200, 0.14) 0%, transparent 70%),
            radial-gradient(ellipse 50% 35% at 15% 15%, rgba(0, 191, 165, 0.07) 0%, transparent 60%),
            radial-gradient(ellipse 35% 28% at 85% 85%, rgba(127, 255, 212, 0.05) 0%, transparent 50%)
          `,
          animation: "hero-breathe 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
        aria-hidden
      />

      {/* Content centred column — max 800px */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "800px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "1.5rem",
          paddingTop: "4rem",
          paddingBottom: "2rem",
        }}
      >
        {/* 1 — Eyebrow pill */}
        <div
          className="glass-pill"
          style={{
            opacity: 0,
            animation: "fade-in 0.5s var(--ease-out) 200ms forwards",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--fp-teal-bright)",
              flexShrink: 0,
            }}
          />
          Trust-as-a-Service Platform
        </div>

        {/* 2+3 — Hero headline */}
        <h1
          className="font-display"
          style={{
            fontSize: "var(--text-hero)",
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: "-0.03em",
            margin: 0,
            opacity: 0,
            animation: "fade-in 0.6s var(--ease-out) 320ms forwards",
          }}
        >
          <span style={{ color: "var(--fp-text-primary)", display: "block" }}>
            Know What's In
          </span>
          <span
            className="text-teal-gradient"
            style={{ display: "block" }}
          >
            Every Product
          </span>
        </h1>

        {/* 4 — Subtitle */}
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-lg)",
            color: "var(--fp-text-secondary)",
            maxWidth: "52ch",
            lineHeight: 1.6,
            margin: 0,
            opacity: 0,
            animation: "fade-in 0.6s var(--ease-out) 500ms forwards",
          }}
        >
          AI-powered ingredient safety reports backed by peer-reviewed scientific
          research. Every ingredient analyzed, every source cited.
        </p>

        {/* 5 — CTAs */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            justifyContent: "center",
            opacity: 0,
            animation: "fade-in 0.6s var(--ease-out) 580ms forwards",
          }}
        >
          <button
            onClick={() => scrollTo("#products")}
            className="btn-primary"
            data-testid="button-explore-products"
          >
            Explore Products
            <ChevronDown size={16} />
          </button>
          <button
            onClick={() => scrollTo("#how-it-works")}
            className="btn-ghost"
          >
            How It Works
          </button>
        </div>

        {/* 6 — Trust pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            justifyContent: "center",
            opacity: 0,
            animation: "fade-in 0.6s var(--ease-out) 640ms forwards",
          }}
        >
          {TRUST_PILLS.map(({ icon: Icon, label }) => (
            <div key={label} className="glass-pill" style={{ gap: "0.375rem" }}>
              <Icon size={12} style={{ color: "var(--fp-teal-bright)" }} />
              {label}
            </div>
          ))}
        </div>

        {/* 7 — Scroll cue */}
        <button
          onClick={() => scrollTo("#stats")}
          aria-label="Scroll down"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--fp-teal-bright)",
            opacity: 0.45,
            marginTop: "0.5rem",
            transition: "opacity var(--dur-fast) var(--ease-out)",
            animation: "fade-in 0.5s var(--ease-out) 800ms forwards",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.8")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.45")}
        >
          <ChevronDown
            size={20}
            style={{ animation: "scroll-bounce 2s ease-in-out infinite" }}
          />
        </button>
      </div>

      {/* Sentinel div — IntersectionObserver uses this for nav glass activation */}
      <div id="hero-scroll-sentinel" style={{ position: "absolute", bottom: 0, height: "1px", width: "100%" }} />
    </section>
  );
}
