# FirstPledge Design System
## Liquid Glass × Minimalism — Complete Reference

> **Purpose:** Single source of truth for every visual decision on this platform.
> Reference this before touching any CSS, component, or layout.

---

## 1. Philosophy

### The Core Identity

FirstPledge occupies a unique position: clinical precision meets consumer trust. The design reflects this by fusing two opposing forces into one coherent material language:

| Force | What it means here |
|---|---|
| **Liquid Glass** | Translucent, refracted, physically alive. Apple visionOS material — depth through transparency, not decoration |
| **Minimalism** | Ruthless whitespace. One action per screen. Nothing on the page that doesn't earn its place |

**The resolution: Glass IS the minimalism.** One material, used with supreme confidence across the entire surface. Everywhere glass does not appear: silence.

### The Differentiator

Competitors (EWG, Yuka, Think Dirty) are either utilitarian-clinical or playfully cartoonish. Neither is aspirational.

FirstPledge must feel like: **Apple Health app × Glossier aesthetics × Stripe engineering credibility.**

Users should think: *"This is the authority. Nothing else compares."*

### World-Class Design Principles Applied

| Principle | Application |
|---|---|
| **Golden Ratio (1.618)** | Section padding ratios, card proportions, type scale steps |
| **Gestalt: Proximity** | Related elements grouped with consistent internal spacing |
| **Gestalt: Continuity** | Dashed connector line flows through process cards |
| **Gestalt: Figure-Ground** | Glass cards emerge from the deep-space background |
| **Fitts's Law** | Primary CTAs are large (min 44px), full-width on mobile |
| **Hick's Law** | Maximum 5 category filter options. 3 process steps. |
| **Miller's Law** | Nav has 3 primary links. Stats show 3 numbers. |
| **Von Restorff Effect** | Teal is the only chromatic accent — it stands out against neutrals |
| **Peak-End Rule** | Hero + Login are premium touchpoints; they define the brand impression |
| **Asymmetric Easing** | Hover-in is slow (glass warms); hover-out is fast (glass cools) |
| **WCAG AA Contrast** | All body text on dark bg exceeds 4.5:1. Muted text used only for supporting info |

---

## 2. Colour System

All colours live as CSS custom properties in `client/src/index.css`. **Never hardcode hex values in components.**

### Deep Space Base (Background Hierarchy)

```css
--fp-bg-void:    #080c10   /* Page background — the deepest layer */
--fp-bg-deep:    #0a0f15   /* Section alt backgrounds */
--fp-bg-mid:     #0d1520   /* Surface panels */
--fp-bg-surface: #111b28   /* Elevated surfaces */
```

Background gradient layering (App.tsx `DeepSpaceBackground`):
1. Base linear gradient (near-black deep navy)
2. Three teal radial glows at strategic positions (bioluminescent effect)
3. Edge vignette (draws focus toward center)
4. Fine noise grain at 2.8% opacity (premium texture, invisible but felt)

### Glass Materials (Frosted Surfaces)

Three tiers — **never use the same tier for two stacked layers**:

```css
--fp-glass-base:          rgba(255,255,255,0.042)   /* Background panels, strips */
--fp-glass-mid:           rgba(255,255,255,0.068)   /* Cards (default) */
--fp-glass-high:          rgba(255,255,255,0.112)   /* Hovered/elevated cards */
--fp-glass-border:        rgba(255,255,255,0.095)   /* Side and bottom borders */
--fp-glass-border-bright: rgba(255,255,255,0.22)    /* Ghost button borders */
--fp-glass-specular:      rgba(255,255,255,0.38)    /* Top-edge highlight (light source) */
--fp-glass-specular-edge: rgba(255,255,255,0.12)    /* Side-edge subtle highlight */
```

### Teal Spectrum (The Light Source)

Teal is the only non-neutral hue. It is the ambient light source of the entire interface.

```css
--fp-teal-bright:    #00e5c8   /* Primary: headlines, CTAs, active states */
--fp-teal-mid:       #00bfa5   /* Secondary: focus rings, links, dividers */
--fp-teal-deep:      #008a7a   /* Score bar gradient start */
--fp-teal-glow:      rgba(0,229,200,0.15)   /* Ambient section glow */
--fp-teal-glow-soft: rgba(0,229,200,0.06)   /* Very subtle background tint */
--fp-mint:           #7fffd4   /* Gradient pair for headline text */
--fp-mint-soft:      rgba(127,255,212,0.08) /* Mint-tinted glass wash */
```

### Text Hierarchy

```css
--fp-text-primary:   #f0f4f8              /* Headlines, important body */
--fp-text-secondary: rgba(240,244,248,0.65)  /* Body copy, descriptions */
--fp-text-muted:     rgba(240,244,248,0.35)  /* Labels, captions, supporting */
```

**Rule:** Never use muted text for anything a user needs to read to make a decision. It is for decoration and categorisation only.

### Safety Colours (Ingredient Status)

These are reserved exclusively for safety-status indicators. Do not repurpose.

```
Safe    → #22c55e (score 8+)
Caution → #f59e0b (score 5–7.9)
Banned  → #ef4444 (score <5)
```

---

## 3. Typography

### Font Stack

| Role | Font | Fallback | Usage |
|---|---|---|---|
| **Display** | Bricolage Grotesque | Helvetica Neue, sans-serif | All headings H1–H4, stat numbers, step numbers, logo wordmark |
| **Body** | Satoshi | Inter, sans-serif | All body copy, labels, captions, UI text, form fields |
| **Mono** | JetBrains Mono | ui-monospace | Code, technical values only |

**Why Bricolage Grotesque:** Variable weight (200–800), sharp at large display sizes, unexpectedly refined at small sizes. Avoids the overexposure of Inter/Plus Jakarta Sans. Its slightly condensed geometry reads as authoritative.

**Why Satoshi:** Geometric sans with personality. Excellent legibility at 14–18px. Pairs naturally with Bricolage's angularity.

### Type Scale (Fluid, Viewport-Responsive)

```css
--text-xs:   clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)   /* 12–14px */
--text-sm:   clamp(0.875rem, 0.8rem + 0.35vw, 1rem)       /* 14–16px */
--text-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem)      /* 16–18px */
--text-lg:   clamp(1.125rem, 1rem + 0.75vw, 1.5rem)       /* 18–24px */
--text-xl:   clamp(1.5rem, 1.2rem + 1.25vw, 2.25rem)      /* 24–36px */
--text-2xl:  clamp(2rem, 1.2rem + 2.5vw, 3.5rem)          /* 32–56px */
--text-hero: clamp(3rem, 0.5rem + 7vw, 8rem)              /* 48–128px */
```

### Letter-Spacing (Optical Tracking)

Tighter at large sizes (reduces visual weight), looser at small sizes (improves legibility):

```css
Hero/Display H1: -0.035em
Section H2:      -0.028em
Card H3:         -0.022em
Body text:       -0.008em
Pill labels:     +0.04em  (uppercase, needs air)
Caption labels:  +0.06em  (uppercase labels, maximum air)
```

### Line Heights

```css
Display/Hero: 1.04
H1:           1.08
H2:           1.12
H3:           1.20
Body:         1.70
Caption:      1.50
```

### Text Rendering

```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
text-wrap: balance;   /* headings — prevents orphan words */
text-wrap: pretty;    /* body copy — prevents last-line orphans */
```

---

## 4. The Glass Material System

### The Five Laws

**Law 1 — Backdrop blur is the soul.**
Every glass surface uses `backdrop-filter: blur(28px) saturate(160%) brightness(1.02)`. Never fake glass with opacity alone. The blur must interact with content behind it.

**Law 2 — Asymmetric borders simulate real glass.**
Top edge: `--fp-glass-specular` (0.38) — catches overhead light.
Side edges: `--fp-glass-border` (0.095) and `--fp-glass-specular-edge` (0.12) — slight gradient.
Bottom edge: `rgba(255,255,255,0.03)` — in shadow, nearly invisible.

**Law 3 — Inset shadows only. No outer colour glows.**
The AI trap: neon outer box-shadows. Instead:
```css
box-shadow:
  inset 0 1.5px 0 rgba(255,255,255,0.14),   /* top inner glow */
  inset 0 -2px 8px rgba(0,0,0,0.12),         /* bottom depth */
  0 4px 6px rgba(0,0,0,0.15),                /* near shadow */
  0 16px 40px rgba(0,0,0,0.45),              /* mid elevation */
  0 32px 64px rgba(0,0,0,0.22);              /* atmospheric depth */
```

**Law 4 — Three tiers, never the same for stacked layers.**
`glass-base` (panels) → `glass-mid` (cards) → `glass-high` (hovered/active).

**Law 5 — Teal is the light source.**
All ambient glow uses teal. It suggests bioluminescence — natural, not neon.

### Magnetic Light Effect (Hover Tracking)

JavaScript tracks cursor position within each glass element, feeding CSS custom properties for a radial highlight that follows the mouse — like a flashlight behind frosted glass:

```javascript
el.style.setProperty("--light-x", `${x}%`);
el.style.setProperty("--light-y", `${y}%`);
el.style.setProperty("--light-opacity", "1");
```

```css
.glass-card::before {
  background: radial-gradient(
    ellipse 60% 40% at var(--light-x, 50%) var(--light-y, 0%),
    rgba(255,255,255,0.11) 0%,
    rgba(255,255,255,0.04) 45%,
    transparent 70%
  );
  opacity: var(--light-opacity, 0);
  transition: opacity 380ms var(--ease-out);
}
```

### Saturation Bloom on Hover

Real glass oversaturates the content behind it when light hits it:
- Rest: `blur(28px) saturate(160%)`
- Hover: `blur(22px) saturate(220%)` — blur reduces (you're closer), saturation blooms

### Asymmetric Timing (Apple's secret)

```css
/* EXIT — fast (glass cools quickly) */
.glass-card {
  transition: all 200ms cubic-bezier(0.4, 0, 1, 1);
}
/* ENTER — slow settle (glass warms gradually) */
.glass-card:hover {
  transition: all 340ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

This single distinction makes interactions feel 10× more physical.

---

## 5. Spacing System

Based on a 4px base unit with Golden Ratio relationships:

```css
--space-1:  0.25rem  /* 4px  — icon gap, tight labels */
--space-2:  0.5rem   /* 8px  — pill padding, badge gap */
--space-3:  0.75rem  /* 12px — pill horizontal padding */
--space-4:  1rem     /* 16px — standard component padding */
--space-6:  1.5rem   /* 24px — card internal padding */
--space-8:  2rem     /* 32px — section subsection spacing */
--space-10: 2.5rem   /* 40px — section header gap */
--space-12: 3rem     /* 48px — major component gaps */
--space-16: 4rem     /* 64px — nav height, section breathing */
--space-20: 5rem     /* 80px — large section padding */
--space-24: 6rem     /* 96px — hero breathing room */
```

**Section padding rule:** All major sections use `padding: 6rem 1.5rem` (96px top/bottom). This creates consistent vertical rhythm.

---

## 6. Border Radius System

```css
--radius-sm:   0.5rem    /* 8px  — small badges, tight pills */
--radius-md:   0.875rem  /* 14px — inputs, small cards */
--radius-lg:   1.25rem   /* 20px — medium cards */
--radius-xl:   1.75rem   /* 28px — glass cards (primary) */
--radius-2xl:  2.5rem    /* 40px — hero containers */
--radius-full: 9999px    /* Circles, pills */
```

---

## 7. Component Reference

### Glass Card (`.glass-card`)

The primary surface. Used for product cards, process steps, testimonials, ingredient panels.

Key properties:
- Background: `--fp-glass-mid` at rest, `rgba(255,255,255,0.096)` on hover
- Border: asymmetric (specular top, dimmer sides, nearly invisible bottom)
- Backdrop filter: `blur(28px) saturate(160%) brightness(1.02)`
- Hover lift: `translateY(-4px)`
- Has magnetic light (`::before`) and ambient bloom (`::after`) pseudo-elements
- Children must be `position: relative; z-index: 2` to sit above the light layer

### Glass Pill (`.glass-pill`)

For labels, badges, filter chips. Two variants:
- Static: `.glass-pill` — display only
- Interactive: `.glass-pill.glass-pill--interactive` — clickable with hover states
- Active: `.glass-pill--interactive.active` — teal gradient background, dark text

### Buttons

**Primary (`.btn-primary`):** Teal-to-teal-mid gradient. Dark text (`#050d10`). No outer glow at rest; soft teal shadow on hover.

**Ghost (`.btn-ghost`):** Glass base background, `--fp-glass-border-bright` border. Has magnetic light tracking via `::before`.

**Rule:** Never use more than one primary CTA per screen section. Ghost is the secondary.

### Navigation (`.fp-nav`)

- Transparent at page top
- `.fp-nav.scrolled` activates on scroll: `rgba(8,12,16,0.80)` + `blur(32px) saturate(200%)`
- Activation triggered by `IntersectionObserver` on `#hero-scroll-sentinel` — not scroll events
- 64px height, `max-width: 1280px` centered

### Score Bar (`.score-bar`, `.score-bar-fill`)

4px height bar. Fill animates from `scaleX(0)` to `scaleX(score/10)` on `IntersectionObserver` entry. Gradient: `--fp-teal-deep` → `--fp-teal-bright`.

### Ticker Strip

Requires content repeated **8 times** minimum to ensure `scrollWidth / 2 > max-viewport-width` at all screen sizes. Current implementation: 64 spans (8 × 8 unique items), scrollWidth ≈ 6010px.

---

## 8. Animation System

### Easing Variables

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1)  /* Spring settle — primary for enter states */
--ease-in:  cubic-bezier(0.4, 0, 1, 1)      /* Fast exit — primary for leave states */
--dur-fast: 180ms   /* Colour changes, opacity tweaks */
--dur-mid:  320ms   /* Positional changes, backdrop-filter */
--dur-slow: 600ms   /* Page-level transitions */
```

### Page Load Sequence

Staggered opacity fades (no translateY — eliminates CLS):

| Element | Delay |
|---|---|
| Page body | 0ms (500ms fade-in) |
| Hero eyebrow pill | 200ms |
| H1 line 1 | 320ms |
| H1 line 2 (gradient) | 420ms (part of same h1) |
| Subtitle | 500ms |
| CTAs | 580ms |
| Trust pills | 640ms |
| Scroll cue | 800ms |

### Scroll-Driven Reveals

Uses CSS `animation-timeline: view()` — no JavaScript ScrollReveal:

```css
.reveal {
  opacity: 0;
  animation: reveal-in linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 70%;
}
```

### Keyframe Reference

| Name | Purpose | Duration |
|---|---|---|
| `page-load` | Body fade-in on route change | 500ms |
| `hero-breathe` | Background radial glow pulsing | 10s infinite |
| `fade-in` | General element entrance | 500ms |
| `fade-up` | Legacy (translateY — use `fade-in` for new work) | 600ms |
| `reveal-in` | Scroll-driven opacity reveal | scroll-driven |
| `reveal-clip-in` | Scroll-driven clip-path reveal | scroll-driven |
| `stroke-draw` | SVG logo checkmark draw | 600ms |
| `scroll-bounce` | Scroll cue chevron | 2s infinite |
| `ticker` | Credibility strip infinite scroll | 30s infinite |
| `pulse-glow` | Featured element attention pulse | 3s infinite |
| `accordion-down/up` | Radix accordion | 200ms |

### Cursor Glow

400×400px radial teal gradient follows cursor at desktop only (`@media (hover: hover)`). Implemented in `App.tsx` via `mousemove` event listener. CSS transition: `0.1s linear` on position for smooth following without lag.

### Reduced Motion

All transforms, backdrop-filter transitions, and infinite animations are suppressed for `prefers-reduced-motion: reduce`. Opacity changes are permitted as they don't cause vestibular issues.

---

## 9. Layout & Breakpoints

### Breakpoints (mobile-first)

```
Base:    0px    → single column, full-width cards
768px:   Tablet → 2-column grid, nav links visible
1024px:  Desktop → 3-column grid, full nav
1280px:  Wide   → max-width container (1280px)
```

### Container

```css
max-width: 1280px;
margin: 0 auto;
padding: 0 1.5rem;
```

### Grid Patterns

```css
/* Auto-responsive — no media queries needed */
grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));

/* Stats strip — always 3 columns */
grid-template-columns: repeat(3, 1fr);

/* Footer — 4 columns on wide, auto-stack on mobile */
grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
```

### Touch Targets

All interactive elements on mobile: `min-height: 44px; min-width: 44px` (Apple HIG standard).

---

## 10. Dark-Only Mode

This platform is **dark mode only**. There is no light mode.

- HTML always has `class="dark"`
- `localStorage.setItem("theme", "dark")` enforced in `App.tsx`
- All CSS custom properties are defined for dark only
- `ThemeToggle` component exists but is not rendered anywhere
- Background: near-black deep navy, never white

**Why dark-only:** The glass material system requires a dark background to function — light from the teal source refracts through the glass and becomes visible against the dark void behind it. On a white background, this effect disappears entirely. The brand identity is inseparable from the dark environment.

---

## 11. SVG Logo Specification

Shield silhouette with animated checkmark stroke.

```
viewBox: 0 0 40 48
Shield path: M20 2 C20 2 6 8 6 20 V32 C6 38 12 44 20 46 C28 44 34 38 34 32 V20 C34 8 20 2 20 2 Z
Check path:  M13 24 L18 29 L27 19
strokeDasharray: 24
strokeDashoffset: 24 → 0 (on load, 600ms, var(--ease-out), 400ms delay)
```

Color: `currentColor` — inherits from parent, defaults to teal (`#00e5c8`).

Desktop: Logo + "FirstPledge" wordmark (Bricolage Grotesque, weight 600).
Mobile: Logo only (wordmark hidden via `hidden sm:block`).

---

## 12. What to Avoid

| ❌ Don't | ✅ Do instead |
|---|---|
| Outer neon box-shadow glows | Inset glass highlights only |
| Multiple accent colours | Teal is the **only** non-neutral hue |
| Purple, violet, pink accents | If you feel tempted, use a deeper teal |
| `transition: all` | List only the specific properties changing |
| `translateY` on scroll animations | Use `opacity` only — prevents CLS |
| Emoji as design elements | Lucide icons only |
| Centred body copy | Left-align all body. Centre only hero + stat labels |
| Coloured card borders | Surface elevation through glass depth |
| Decorative blobs/shapes | Let backdrop-blur do the atmospheric work |
| White sections | Dark background throughout — no exceptions |
| ThemeToggle in UI | Dark-only, remove from all surfaces |
| Bright gradient buttons | Teal-to-teal-mid on CTA only |
| `<Link><a>` in wouter | `<Link className="...">` — Link renders as `<a>` natively |
| `setLocation("/protected")` for auth redirect | `setLocation("/login", { replace: true })` — preserve back-button history |

---

## 13. File Map

```
client/
├── index.html               ← Font imports (Bricolage Grotesque + Satoshi), cursor-glow div
├── src/
│   ├── index.css            ← ALL design tokens, glass utilities, animations
│   ├── App.tsx              ← DeepSpaceBackground, cursor glow JS, magnetic glass light JS
│   ├── pages/
│   │   ├── Home.tsx         ← All marketing sections, count-up hook, ticker
│   │   ├── ProductDetail.tsx
│   │   ├── AdminDashboard.tsx
│   │   └── ProductForm.tsx
│   └── components/
│       ├── Header.tsx        ← fp-nav, IntersectionObserver scroll glass, ShieldLogo SVG
│       ├── Hero.tsx          ← hero-bg, 100dvh, staggered entrances
│       ├── ProductCard.tsx   ← VERIFIED badge, ScoreBar, new anatomy
│       ├── SafetyBadge.tsx   ← safe/caution/banned status indicators
│       ├── IngredientAccordion.tsx
│       └── auth/
│           ├── LoginForm.tsx ← Restyled glass card, back-to-home link
│           └── ProtectedRoute.tsx ← replace:true redirect
tailwind.config.ts            ← Design tokens as Tailwind utilities
```

---

## 14. Making Future Changes

### Changing a colour

1. Update the `--fp-*` variable in `:root` in `index.css`
2. The shadcn `--primary` token maps to `172 100% 45%` (teal) — update if moving away from teal

### Changing a font

1. Replace the `<link>` tag in `client/index.html`
2. Update `--font-display` or `--font-body` in `:root`
3. Verify letter-spacing still looks correct at hero sizes (different fonts need different optical tracking)

### Adding a new glass component

1. Apply `position: relative; overflow: hidden; isolation: isolate` to the element
2. Use `var(--fp-glass-mid)` as background
3. Set `border-top: 1px solid var(--fp-glass-specular)` for the light-catching edge
4. The magnetic light JS in `App.tsx` auto-applies to `.glass-card` — add your class to the selector if needed
5. Never use the same glass tier for two stacked layers

### Adding a new animation

1. Define `@keyframes` in `index.css`
2. Add the animation shorthand to `tailwind.config.ts` under `animation`
3. Wrap in `@media (prefers-reduced-motion: no-preference)` if it involves movement

### Adjusting spacing

Always use `--space-*` variables or Tailwind spacing (which maps to the same 4px base). Never hardcode pixel values for layout spacing.

---

*Last updated: April 2026. Maintained by the FirstPledge design system.*
