import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ProductCard from "@/components/ProductCard";
import { ArrowRight, Search, Github, Twitter, Linkedin } from "lucide-react";

const PRODUCT_PREVIEW_LIMIT = 8;

interface Product {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  overallStatus: "safe" | "caution" | "banned";
  ingredientCount?: number;
}

// ── Stat count-up hook ──────────────────────────────────────────
function useCountUp(target: number, duration = 1200, decimals = 0) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
    const frame = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setCount(parseFloat((target * easeOutQuart(progress)).toFixed(decimals)));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [started, target, duration, decimals]);

  return { count, ref };
}

// ── Static ingredient data for demo ─────────────────────────────
const DEMO_INGREDIENTS = [
  {
    id: "retinol",
    name: "Retinol (Vitamin A)",
    score: 8.4,
    classification: "Generally Recognised as Safe",
    summary:
      "Retinol is a well-studied form of Vitamin A widely used in skincare for its cell-turnover and anti-aging properties. At recommended concentrations it is considered safe for most adults.",
    concerns: [
      { level: "high", text: "Teratogenic risk at high doses — avoid in pregnancy" },
      { level: "medium", text: "Photosensitivity — use SPF during the day" },
      { level: "low", text: "Possible initial irritation — start with low frequency" },
    ],
    citations: ["PubMed", "EWG", "FDA"],
  },
  {
    id: "niacinamide",
    name: "Niacinamide (Vitamin B3)",
    score: 9.6,
    classification: "Highly Safe — No Restrictions",
    summary:
      "Niacinamide is one of the most well-tolerated skincare actives. Peer-reviewed evidence supports its efficacy in reducing pore appearance, controlling sebum, and brightening skin tone.",
    concerns: [
      { level: "low", text: "Rare flushing at very high oral doses — topical use safe" },
    ],
    citations: ["PubMed", "CIR", "EFSA"],
  },
  {
    id: "parfum",
    name: "Parfum / Fragrance",
    score: 4.2,
    classification: "Use with Caution",
    summary:
      "Fragrance is a catch-all term covering hundreds of undisclosed chemicals. It is the leading cause of contact dermatitis and allergic reactions in cosmetics.",
    concerns: [
      { level: "high", text: "Major allergen — undisclosed ingredient blend" },
      { level: "high", text: "Contact dermatitis risk for sensitive skin types" },
      { level: "medium", text: "Potential endocrine disruption from some fragrance components" },
    ],
    citations: ["EWG", "NICNAS", "EFSA"],
  },
  {
    id: "hyaluronic-acid",
    name: "Hyaluronic Acid",
    score: 9.8,
    classification: "Highly Safe — No Restrictions",
    summary:
      "Hyaluronic acid is a naturally occurring polysaccharide found in the human body. Topical application is exceptionally well tolerated with no known toxicity concerns.",
    concerns: [
      { level: "low", text: "Can draw moisture out in very dry climates — use with occlusives" },
    ],
    citations: ["PubMed", "CIR", "WHO"],
  },
  {
    id: "oxybenzone",
    name: "Oxybenzone (BP-3)",
    score: 3.8,
    classification: "Restricted — Use with Caution",
    summary:
      "Oxybenzone is a UV-filter used in sunscreens. Multiple studies have detected systemic absorption and potential endocrine-disrupting activity at levels of concern.",
    concerns: [
      { level: "high", text: "Potential endocrine disruption — detected systemically after topical application" },
      { level: "high", text: "Banned in Hawaii — reef ecosystem toxicity" },
      { level: "medium", text: "Photoallergy reactions in some individuals" },
    ],
    citations: ["FDA", "EWG", "PubMed"],
  },
];

const TESTIMONIALS = [
  {
    name: "Dr. Sarah Chen",
    role: "Dermatologist, NYC",
    quote:
      "FirstPledge has become the tool I recommend to every patient asking about ingredient safety. The citation depth is on par with clinical literature reviews.",
    stars: 5,
    initials: "SC",
  },
  {
    name: "Marcus Webb",
    role: "Founder, Clean Beauty Co.",
    quote:
      "We use FirstPledge to vet every formula before launch. It caught a fragrance ingredient we would have missed — saved us a product recall.",
    stars: 5,
    initials: "MW",
  },
  {
    name: "Priya Nair",
    role: "Holistic Nutritionist",
    quote:
      "Finally a platform that doesn't dumb down the science. My clients can read the actual PubMed citations, not just a traffic-light colour.",
    stars: 5,
    initials: "PN",
  },
];

// 8 repetitions ensures scrollWidth >> viewport at all screen sizes,
// so translateX(-50%) never reveals empty space on the right.
const TICKER_UNIQUE = ["PubMed", "FDA", "EWG", "EFSA", "WHO", "CIR", "NIH", "NICNAS"];
const CREDIBILITY_ORGS = [...Array(8)].flatMap(() => TICKER_UNIQUE);

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "AI Research",
    description:
      "Our AI engine analyses every ingredient against safety databases and peer-reviewed scientific literature published across PubMed, FDA, and WHO.",
  },
  {
    step: "02",
    title: "Editorial Review",
    description:
      "Expert reviewers verify AI findings, resolve edge cases, and ensure accuracy before publication. No rating is published without human sign-off.",
  },
  {
    step: "03",
    title: "Transparent Evidence",
    description:
      "Every rating includes clickable citations linking directly to original research sources. You see exactly what we saw.",
  },
];

// ── Stat item with count-up ──────────────────────────────────────
function StatItem({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  const { count, ref } = useCountUp(value, 1200, value % 1 !== 0 ? 1 : 0);
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.375rem",
        padding: "1.75rem 1.5rem",
      }}
    >
      <span
        className="font-display stat-gradient"
        style={{ fontSize: "var(--text-2xl)", fontWeight: 800, lineHeight: 1 }}
      >
        {count}{suffix}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-sm)",
          color: "var(--fp-text-secondary)",
          fontWeight: 500,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Process connector SVG ────────────────────────────────────────
function ProcessConnector() {
  const ref = useRef<SVGPathElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.animation = "stroke-draw 1.2s var(--ease-out) forwards";
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      className="hidden md:block absolute top-8 pointer-events-none"
      style={{ left: "calc(16.67% + 2rem)", right: "calc(16.67% + 2rem)", width: "calc(100% - 16.67% * 2 - 4rem)", height: "16px", overflow: "visible" }}
      viewBox="0 0 400 16"
      preserveAspectRatio="none"
      fill="none"
    >
      <path
        ref={ref}
        d="M0 8 Q100 8 200 8 Q300 8 400 8"
        stroke="var(--fp-teal-mid)"
        strokeWidth="1.5"
        strokeDasharray="6 4"
        strokeLinecap="round"
        strokeDashoffset="200"
        style={{ strokeDashoffset: 200 }}
        opacity="0.5"
      />
    </svg>
  );
}

export default function Home() {
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const [activeIngredient, setActiveIngredient] = useState(DEMO_INGREDIENTS[0]);
  const [ingredientSearch, setIngredientSearch] = useState("");

  const filteredIngredients = DEMO_INGREDIENTS.filter((i) =>
    i.name.toLowerCase().includes(ingredientSearch.toLowerCase())
  );

  // Animate score bars on scroll-enter
  useEffect(() => {
    const bars = document.querySelectorAll<HTMLElement>(".score-bar-fill[data-score]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const score = parseFloat(el.dataset.score || "0");
            setTimeout(() => {
              el.style.transform = `scaleX(${score / 10})`;
            }, parseInt(el.dataset.delay || "0"));
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.3 }
    );
    bars.forEach((bar) => observer.observe(bar));
    return () => observer.disconnect();
  }, [activeIngredient]);

  const levelColor = (level: string) =>
    level === "high" ? "#ef4444" : level === "medium" ? "#f59e0b" : "#22c55e";
  const levelDot = (level: string) =>
    level === "high" ? "🔴" : level === "medium" ? "🟡" : "🟢";

  return (
    <div style={{ minHeight: "100vh", color: "var(--fp-text-primary)" }}>
      <Header showAdminLink />
      <Hero />

      {/* ── Stats Strip ──────────────────────────────────────── */}
      <div
        id="stats"
        style={{
          position: "relative",
          zIndex: 20,
          background: "var(--fp-glass-base)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid var(--fp-glass-border)",
          borderBottom: "1px solid var(--fp-glass-border)",
        }}
      >
        <div
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          {[
            {
              value: products?.reduce((sum, p) => sum + (p.ingredientCount ?? 0), 0) ?? 0,
              label: "Ingredients Analysed",
              suffix: "+",
            },
            { value: products?.length ?? 0, label: "Products Vetted", suffix: "" },
            { value: 5, label: "Regulatory Sources", suffix: "" },
          ].map(({ value, label, suffix }, i) => (
            <div
              key={label}
              style={{
                borderRight: i < 2 ? "1px solid var(--fp-glass-border)" : "none",
              }}
            >
              <StatItem value={value} label={label} suffix={suffix} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Products Section ─────────────────────────────────── */}
      <section id="products" style={{ padding: "6rem 1.5rem" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>

          {/* Section header */}
          <div className="reveal" style={{ marginBottom: "3rem", textAlign: "left" }}>
            <div className="glass-pill" style={{ marginBottom: "1rem" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--fp-teal-bright)", display: "inline-block", flexShrink: 0 }} />
              Vetted Products
            </div>
            <h2
              className="font-display"
              style={{ fontSize: "var(--text-xl)", fontWeight: 700, marginBottom: "0.5rem", letterSpacing: "-0.025em" }}
            >
              Recently Vetted
            </h2>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--fp-text-secondary)", maxWidth: "48ch", lineHeight: 1.65 }}>
              Every product below has been thoroughly analyzed by our AI engine and reviewed by our editorial team before publication.
            </p>
          </div>

          {/* Product grid */}
          {isLoading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
                gap: "1.5rem",
              }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="glass-card"
                  style={{ overflow: "hidden", animationDelay: `${i * 100}ms` }}
                >
                  <div style={{ height: "240px", background: "var(--fp-glass-base)" }} />
                  <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ height: "10px", background: "var(--fp-glass-mid)", borderRadius: "9999px", width: "33%" }} />
                    <div style={{ height: "14px", background: "var(--fp-glass-mid)", borderRadius: "9999px", width: "75%" }} />
                    <div style={{ height: "4px", background: "var(--fp-glass-mid)", borderRadius: "9999px", width: "100%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
                gap: "1.5rem",
              }}
            >
              {products.slice(0, PRODUCT_PREVIEW_LIMIT).map((product, i) => (
                <div
                  key={product.id}
                  style={{
                    opacity: 0,
                    animation: `fade-in 0.5s var(--ease-out) ${i * 70}ms forwards`,
                  }}
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
            <div
              className="glass-card"
              style={{ padding: "6rem 2rem", textAlign: "center" }}
            >
              <p style={{ color: "var(--fp-text-muted)" }}>No products available yet. Check back soon!</p>
            </div>
          )}

          {/* See All Products CTA — only when truncation is actually happening */}
          {products && products.length > PRODUCT_PREVIEW_LIMIT && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem",
                marginTop: "3rem",
                paddingTop: "2.5rem",
                borderTop: "1px solid var(--fp-glass-border)",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  color: "var(--fp-text-muted)",
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                Showing {PRODUCT_PREVIEW_LIMIT} of{" "}
                <span style={{ color: "var(--fp-text-secondary)", fontWeight: 600 }}>
                  {products.length}
                </span>{" "}
                vetted products
              </p>
              <Link
                href="/products"
                className="btn-primary"
                style={{ gap: "0.625rem", cursor: "pointer", textDecoration: "none" }}
              >
                See All Products
                <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "6rem 1.5rem", background: "var(--fp-glass-base)" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>

          <div className="reveal" style={{ textAlign: "center", marginBottom: "4rem" }}>
            <div className="glass-pill" style={{ marginBottom: "1rem" }}>Our Process</div>
            <h2
              className="font-display"
              style={{ fontSize: "var(--text-xl)", fontWeight: 700, letterSpacing: "-0.025em", marginBottom: "0.75rem" }}
            >
              How It Works
            </h2>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--fp-text-secondary)", maxWidth: "48ch", margin: "0 auto", lineHeight: 1.65 }}>
              Three steps from raw ingredient list to a fully-cited safety report.
            </p>
          </div>

          <div style={{ position: "relative" }}>
            <ProcessConnector />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
                gap: "1.5rem",
              }}
            >
              {HOW_IT_WORKS.map(({ step, title, description }, i) => (
                <div
                  key={step}
                  className="glass-card reveal"
                  style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}
                >
                  {/* Step badge + arrow */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div className="glass-pill" style={{ minWidth: "2.5rem", justifyContent: "center" }}>
                      <span className="font-display" style={{ fontWeight: 800, color: "var(--fp-teal-bright)", letterSpacing: 0 }}>
                        {step}
                      </span>
                    </div>
                    <ArrowRight
                      size={16}
                      style={{
                        color: "var(--fp-teal-mid)",
                        transition: "transform 200ms var(--ease-out)",
                      }}
                      className="process-arrow"
                    />
                  </div>

                  {/* Content */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <h3
                      className="font-display"
                      style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.02em" }}
                    >
                      {title}
                    </h3>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--fp-text-secondary)", lineHeight: 1.7 }}>
                      {description}
                    </p>
                  </div>

                  {/* Divider */}
                  <div style={{ height: "1px", background: `linear-gradient(90deg, var(--fp-teal-mid), transparent)`, opacity: 0.4, marginTop: "auto" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Ingredient Deep-Dive ─────────────────────────────── */}
      <section id="ingredients" style={{ padding: "6rem 1.5rem" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>

          <div className="reveal" style={{ marginBottom: "3rem" }}>
            <div className="glass-pill" style={{ marginBottom: "1rem" }}>Trust Builder</div>
            <h2
              className="font-display"
              style={{ fontSize: "var(--text-xl)", fontWeight: 700, letterSpacing: "-0.025em", marginBottom: "0.5rem" }}
            >
              See the Research
            </h2>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--fp-text-secondary)", maxWidth: "52ch", lineHeight: 1.65 }}>
              Every ingredient in our database has a full safety profile with peer-reviewed citations. No black boxes.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
              gap: "1.5rem",
              alignItems: "start",
            }}
          >
            {/* Left — ingredient list */}
            <div className="glass-card" style={{ padding: "1.5rem", overflow: "visible" }}>
              {/* Search */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  background: "var(--fp-glass-base)",
                  border: "1px solid var(--fp-glass-border)",
                  borderRadius: "var(--radius-lg)",
                  marginBottom: "1rem",
                  transition: "border-color var(--dur-fast) var(--ease-out)",
                }}
                onFocusCapture={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--fp-teal-mid)")
                }
                onBlurCapture={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--fp-glass-border)")
                }
              >
                <Search size={14} style={{ color: "var(--fp-text-muted)", flexShrink: 0 }} />
                <input
                  type="search"
                  placeholder="Search ingredients…"
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                  style={{
                    background: "none",
                    border: "none",
                    outline: "none",
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-sm)",
                    color: "var(--fp-text-primary)",
                    width: "100%",
                  }}
                />
              </div>

              {/* Ingredient list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {filteredIngredients.map((ing) => (
                  <button
                    key={ing.id}
                    onClick={() => setActiveIngredient(ing)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.875rem 1rem",
                      borderRadius: "var(--radius-md)",
                      background:
                        activeIngredient.id === ing.id
                          ? "var(--fp-glass-mid)"
                          : "transparent",
                      border:
                        activeIngredient.id === ing.id
                          ? `1px solid var(--fp-glass-border)`
                          : "1px solid transparent",
                      borderLeft:
                        activeIngredient.id === ing.id
                          ? "2px solid var(--fp-teal-bright)"
                          : "2px solid transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
                      width: "100%",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "var(--text-sm)",
                        color:
                          activeIngredient.id === ing.id
                            ? "var(--fp-text-primary)"
                            : "var(--fp-text-secondary)",
                        fontWeight: activeIngredient.id === ing.id ? 600 : 400,
                      }}
                    >
                      {ing.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "var(--text-xs)",
                        fontWeight: 700,
                        color:
                          ing.score >= 8
                            ? "var(--fp-teal-bright)"
                            : ing.score >= 6
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {ing.score}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right — ingredient detail */}
            <div
              className="glass-card"
              key={activeIngredient.id}
              style={{
                padding: "2rem",
                overflow: "visible",
                animation: "fade-in 0.3s var(--ease-out) forwards",
              }}
            >
              {/* Header */}
              <div style={{ marginBottom: "1.5rem" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>
                  Ingredient Analysis
                </p>
                <h3
                  className="font-display"
                  style={{ fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "0.5rem" }}
                >
                  {activeIngredient.name}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                    <span
                      className="font-display stat-gradient"
                      style={{ fontSize: "var(--text-2xl)", fontWeight: 800, lineHeight: 1 }}
                    >
                      {activeIngredient.score}
                    </span>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--fp-text-muted)" }}>/10</span>
                  </div>
                  <div className="glass-pill" style={{ color: "var(--fp-teal-mid)" }}>
                    {activeIngredient.classification}
                  </div>
                </div>
              </div>

              {/* Score bar */}
              <div className="score-bar" style={{ marginBottom: "1.5rem" }}>
                <div
                  className="score-bar-fill"
                  data-score={activeIngredient.score}
                  data-delay="100"
                />
              </div>

              {/* Summary */}
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--fp-text-secondary)", lineHeight: 1.7, marginBottom: "1.5rem" }}>
                {activeIngredient.summary}
              </p>

              {/* Concerns */}
              <div style={{ marginBottom: "1.5rem" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
                  Concerns
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {activeIngredient.concerns.map((concern, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        padding: "0.625rem 0.875rem",
                        background: "var(--fp-glass-base)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--fp-glass-border)",
                      }}
                    >
                      <span style={{ flexShrink: 0, fontSize: "0.7rem", marginTop: "0.1rem" }}>
                        {levelDot(concern.level)}
                      </span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-secondary)", lineHeight: 1.5 }}>
                        {concern.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Citations */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)" }}>
                  Sources:
                </span>
                {activeIngredient.citations.map((cite) => (
                  <div key={cite} className="glass-pill" style={{ padding: "0.125rem 0.625rem", color: "var(--fp-teal-mid)", textTransform: "none" }}>
                    {cite}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────── */}
      <section style={{ padding: "6rem 1.5rem", background: "var(--fp-glass-base)" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>

          <div className="reveal" style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div className="glass-pill" style={{ marginBottom: "1rem" }}>Social Proof</div>
            <h2
              className="font-display"
              style={{ fontSize: "var(--text-xl)", fontWeight: 700, letterSpacing: "-0.025em" }}
            >
              Trusted by Experts
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
              gap: "1.5rem",
            }}
          >
            {TESTIMONIALS.map((t, i) => (
              <div
                key={t.name}
                className="glass-card reveal"
                style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}
              >
                {/* Stars */}
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <span key={s} style={{ color: "var(--fp-teal-bright)", fontSize: "0.875rem" }}>★</span>
                  ))}
                </div>

                {/* Quote */}
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-sm)",
                    color: "var(--fp-text-secondary)",
                    lineHeight: 1.7,
                    fontStyle: "italic",
                    flex: 1,
                  }}
                >
                  "{t.quote}"
                </p>

                {/* Author */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", borderTop: "1px solid var(--fp-glass-border)", paddingTop: "1rem" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, var(--fp-teal-deep), var(--fp-teal-mid))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#080c10",
                      }}
                    >
                      {t.initials}
                    </span>
                  </div>
                  <div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fp-text-primary)", margin: 0 }}>
                      {t.name}
                    </p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)", margin: 0 }}>
                      {t.role}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Credibility Strip ─────────────────────────────────── */}
      <div
        style={{
          background: "var(--fp-glass-base)",
          borderTop: "1px solid var(--fp-glass-border)",
          borderBottom: "1px solid var(--fp-glass-border)",
          padding: "1.5rem 0",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "3rem", paddingLeft: "2rem", marginBottom: "0.75rem" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)", whiteSpace: "nowrap", letterSpacing: "0.04em" }}>
            BACKED BY RESEARCH FROM
          </span>
        </div>
        <div style={{ overflow: "hidden", width: "100%" }}>
          <div className="ticker-track" style={{ gap: "3rem", alignItems: "center" }}>
            {CREDIBILITY_ORGS.map((org, i) => (
              <span
                key={i}
                className="font-display"
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 700,
                  color: "var(--fp-text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  opacity: 0.5,
                  transition: "opacity var(--dur-fast) var(--ease-out)",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.5")}
              >
                {org}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer
        style={{
          background: "var(--fp-glass-base)",
          borderTop: "1px solid var(--fp-glass-border)",
          padding: "4rem 1.5rem 2rem",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
            gap: "3rem",
            paddingBottom: "3rem",
            borderBottom: "1px solid var(--fp-glass-border)",
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--fp-teal-bright)" }}>
              <svg width="24" height="28" viewBox="0 0 40 48" fill="none">
                <path d="M20 2C20 2 6 8 6 20V32C6 38 12 44 20 46C28 44 34 38 34 32V20C34 8 20 2 20 2Z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M13 24L18 29L27 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="font-display" style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--fp-text-primary)" }}>
                FirstPledge
              </span>
            </div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)", lineHeight: 1.65, maxWidth: "28ch" }}>
              Trust-as-a-Service. Every ingredient AI-vetted against peer-reviewed scientific literature.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {[Twitter, Github, Linkedin].map((Icon, i) => (
                <button
                  key={i}
                  className="btn-ghost"
                  style={{ padding: "0.5rem", minWidth: 36, minHeight: 36, justifyContent: "center" }}
                  aria-label="Social link"
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>

          {/* Product links */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <p className="font-display" style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fp-text-primary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
              Product
            </p>
            {["Browse Products", "How It Works", "Ingredient Database", "Safety Scores"].map((link) => (
              <a
                key={link}
                href="#"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  color: "var(--fp-text-muted)",
                  textDecoration: "none",
                  transition: "color var(--dur-fast) var(--ease-out)",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--fp-teal-bright)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--fp-text-muted)")}
              >
                {link}
              </a>
            ))}
          </div>

          {/* Company links */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <p className="font-display" style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fp-text-primary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
              Company
            </p>
            {["About Us", "Science Team", "Privacy Policy", "Terms of Service"].map((link) => (
              <a
                key={link}
                href="#"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  color: "var(--fp-text-muted)",
                  textDecoration: "none",
                  transition: "color var(--dur-fast) var(--ease-out)",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--fp-teal-bright)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--fp-text-muted)")}
              >
                {link}
              </a>
            ))}
          </div>

          {/* Newsletter */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <p className="font-display" style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fp-text-primary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
              Stay Updated
            </p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)", lineHeight: 1.6 }}>
              New ingredient profiles and safety reports weekly.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="email"
                placeholder="you@example.com"
                style={{
                  flex: 1,
                  padding: "0.625rem 0.875rem",
                  background: "var(--fp-glass-base)",
                  border: "1px solid var(--fp-glass-border)",
                  borderRadius: "var(--radius-full)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-xs)",
                  color: "var(--fp-text-primary)",
                  outline: "none",
                  transition: "border-color var(--dur-fast) var(--ease-out)",
                  minWidth: 0,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--fp-teal-mid)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--fp-glass-border)")}
              />
              <button
                className="btn-primary"
                style={{ padding: "0.625rem 1rem", fontSize: "var(--text-xs)", flexShrink: 0 }}
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            maxWidth: "1280px",
            margin: "2rem auto 0",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)" }}>
            © 2026 FirstPledge. Trust-as-a-Service.
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", color: "var(--fp-text-muted)", opacity: 0.6 }}>
            AI-powered · Science-backed · Independently verified
          </p>
        </div>
      </footer>
    </div>
  );
}
