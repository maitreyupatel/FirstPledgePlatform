# FirstPledge Design Guidelines

## Design Approach: Reference-Based (Health-Tech Premium)

Drawing inspiration from **Cred** (premium fintech), **Apple** (authoritative minimalism), and **Yuka** (health-tech clarity), combined with modern wellness app aesthetics. Focus: Building trust through visual hierarchy, clear safety signals, and polished interactions.

**Core Principle:** Information density without clutter. Every element reinforces credibility and transparency.

---

## Typography System

**Primary Font:** Inter or SF Pro Display (via Google Fonts/CDN)
**Secondary Font:** System UI fallback

**Hierarchy:**
- Hero Headlines: 3xl to 5xl, font-weight 700
- Section Headers: 2xl to 3xl, font-weight 600
- Product Names: xl to 2xl, font-weight 600
- Body Text: base to lg, font-weight 400
- Labels/Metadata: sm to base, font-weight 500
- Citations/Fine Print: xs to sm, font-weight 400

**Letter Spacing:** Tight (-0.02em) for headlines, normal for body

---

## Layout System

**Spacing Scale:** Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24
- Component padding: p-4 to p-8
- Section spacing: py-12 to py-24
- Grid gaps: gap-4 to gap-8

**Container Strategy:**
- Full-width sections with max-w-7xl inner containers
- Content sections: max-w-6xl
- Reading content: max-w-3xl

**Grid Patterns:**
- Product grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Feature cards: grid-cols-1 lg:grid-cols-2
- Admin forms: Single column with max-w-2xl

---

## Component Library

### Public Interface Components

**1. Navigation**
- Sticky header with backdrop blur
- Logo left, minimal navigation links center/right
- Subtle border-bottom separator
- Height: h-16 to h-20

**2. Hero Section (Homepage)**
- 70vh minimum height
- Large background image (abstract safety/lab/natural imagery)
- Centered headline + subtitle with blurred-background container
- Single prominent CTA button with blur backdrop
- No hover states on image-overlay buttons

**3. Product Card (Grid View)**
- Rounded container (rounded-xl to rounded-2xl)
- Product image: aspect-ratio-square, object-cover
- Overlay gradient on image bottom
- Safety badge: Prominent shield icon (top-right corner, absolute position)
  - Green shield: Safe
  - Yellow warning triangle: Caution  
  - Red octagon: Banned
- Product name + brand below image
- Subtle shadow on hover (no dramatic transforms)

**4. Safety Report Page (Individual Product)**
**Layout:** Two-column on desktop, single on mobile
- Left column (60%): Product hero image, metadata, affiliate CTA
- Right column (40%): Quick safety summary, key stats

**Ingredient Evidence Section:**
- Full-width below hero
- Accordion pattern: Each ingredient = collapsible card
- Closed state: Ingredient name + safety badge icon + expand arrow
- Open state reveals:
  - Safety rating label
  - One-sentence rationale
  - Clickable citation link styled as subtle underlined text
- Smooth height transitions (transition-all duration-300)
- Alternating subtle background shades for visual rhythm

**5. Trust Indicators**
- Badge system using Heroicons or Font Awesome
- Green: CheckCircleIcon / fa-shield-check
- Yellow: ExclamationTriangleIcon / fa-triangle-exclamation
- Red: XCircleIcon / fa-octagon-xmark
- Consistent sizing: h-6 w-6 for inline, h-12 w-12 for featured

**6. CTA Buttons**
- Primary: Large, rounded-lg, font-weight 600
- On images: Backdrop blur with semi-transparent background
- Standard states: Default, disabled (no hover/active for image overlays)

### Admin Dashboard Components

**7. Editorial Interface**
- Clean form layouts with generous spacing (space-y-6)
- Input fields: Full-width, rounded-lg, clear labels above
- Ingredient parser: Textarea for raw paste + "Vet Ingredients" button
- Proposal Review: Two-column layout
  - Left: AI-generated report preview
  - Right: Override controls (toggle buttons for status changes)
- Toggle buttons for ratings (Green/Yellow/Red) - NOT dropdowns
- Publish button: Prominent, confirmation required

**8. Dashboard Grid**
- Table-like cards showing pending/published products
- Quick filters: All / Safe / Caution / Banned
- Status indicators consistent with public badges

---

## Interaction Patterns

**Accordions:** Click to expand/collapse with rotation arrow indicator (rotate-180 transform)
**Modals:** Centered overlay with backdrop blur
**Loading States:** Skeleton screens for product grids, subtle spinner for AI processing
**Animations:** Minimal. Only accordion expand/collapse and subtle hover elevations

---

## Icons & Assets

**Icon Library:** Heroicons via CDN (outline style for navigation, solid for badges)
**Product Images:** User-provided URLs, displayed as object-cover with aspect-ratio containers
**Safety Badges:** Icon-based (not custom illustrations)
**Placeholder:** <!-- CUSTOM ICON: Lab beaker or molecule for trust/science themes -->

---

## Images

**Homepage Hero:**
- Large, high-quality background image
- Subject: Abstract lab/science imagery OR natural/organic product photography
- Treatment: Subtle overlay gradient to ensure text legibility
- Position: Center-center, object-cover

**Product Images:**
- User-uploaded product photos (square aspect ratio preferred)
- Display: Contained within cards, rounded corners
- Quality: Should feel premium (encourage high-res uploads)

**Safety Report Page:**
- Featured product image: Large, prominent placement (aspect-ratio-4/3 or similar)
- No additional decorative images needed

---

## Accessibility

- ARIA labels for all interactive elements
- Keyboard navigation for accordions and toggles
- Focus states: Visible ring-2 ring-offset-2
- Contrast ratios meet WCAG AA standards
- Form inputs with associated labels (not just placeholders)

---

## Page-Specific Layouts

**Homepage:**
1. Hero (70vh) with blurred CTA container
2. "How It Works" 3-column grid (Icon + Title + Description)
3. Featured Products grid (3 columns desktop)
4. Trust signals section (stats, certifications)
5. Footer with links, social, newsletter

**Product Safety Report:**
1. Product hero section (image + metadata + affiliate CTA)
2. Safety summary card (overall rating, quick stats)
3. Full ingredient evidence list (accordion stack)
4. Related products carousel
5. Footer

**Admin Dashboard:**
1. Top navigation with "New Product" CTA
2. Status filter tabs
3. Product management grid/table
4. Sidebar for quick stats

**New Product Submission (Admin):**
1. Form: Product details (name, brand, image URL, affiliate link)
2. Ingredient input: Large textarea
3. "Vet with AI" button
4. Proposal review interface (appears post-vetting)
5. Final publish controls

---

**Viewport Strategy:** Natural content flow. Hero sections use 70-80vh. Content sections use auto height based on content with consistent py-20 spacing. No forced 100vh constraints on content.