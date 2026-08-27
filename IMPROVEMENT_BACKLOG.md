# Improvement Backlog — audited 2026-08-27

Produced by a full platform audit with every claim verified against live data
(production DB, GitHub Actions history, Groq API, client code). The platform
is operationally healthy: cron ingesting daily behind the GS1-890 India gate,
GitHub Actions health-watch green 6/6 days, weekly stale-refresh proven live,
publish gates correctly discriminating (banned/garbled/low-confidence all
held as drafts). Everything below is what is NOT working well or could work
better, ranked for a planning session.

---

## P0 — process gaps with compounding cost

### 1. No CI test gate on PRs
`.github/workflows/` contains only the health watch. `npm test` (137 tests)
and `tsc` run only on the developer machine; nothing stops a red merge.
**Improvement:** a `ci.yml` running install + tsc + vitest on pull_request
and push-to-main. Half a day, permanent safety.

### 2. Draft backlog: 14 items, oldest 115 days, no review workflow
Drafts accumulate faster than they are reviewed (AdminDashboard lists them,
but each needs label research nobody does). Current queue:
- **Trivially discardable:** "sunscreen"/Hyphen (47 garbled ingredients),
  "kissan" (brand-as-name), "Sun Shield Carrot Sunscreen"/Biotique
  (1 ingredient), "chocolate cranberry museli" (typo, superseded by the
  published Muesli), "kissan fresh tomato" (superseded by published
  Kissan Fresh Tomato Ketchup).
- **Needs verification then publish/fix:** "Amul cheese" (held on a
  banned-ingredient verdict — verify which ingredient and whether correct),
  "Knorr hot & sour veg soup" (right product, garbled ingredient names need
  repair from the real label), "Glow & Lovely serum" (31 ingredients, fresh),
  "Muesli+"/Yoga Bar (truncated label — needs real label), "Lip Balm"/
  Himalaya (rename from pack), "Eva Mosturizing Lip Balm" (Eva is an
  Egyptian brand — India-policy check), "D'lecta Mozzarella" (2 ingredients),
  "Red Chilli Sauce"/Ching's, "Some By Mi serum" (Korean-market record).
**Improvement:** one AI-assisted triage session (research each label, then
publish/fix/discard via admin API), plus a standing rule that drafts older
than N days get auto-triaged.

### 3. Published products carrying dirty legacy ingredient names
Pre-gate products still show label noise as ingredient names:
- Full Bloom Tomato Ketchup: "Spices & Condiments CONTAINS PERMITTED CLASS
  II PRESERVATIVES" (boilerplate captured as an ingredient)
- PROTEIN DAHL (Amul): "enzyme (beta-galact active culture" (truncated,
  unbalanced)
- La Shield sunscreen: one 60+ char merged token
- Bisleri: product name suffix "MADE IN INDIA" (shouty label noise)
The current parser would not produce these; the rows predate it.
**Improvement:** one-off backfill — re-parse from stored label text or fix
the handful of rows manually via admin API.

---

## P1 — high-value platform work

### 4. Stale-analysis refresh cannot keep up
419 of 657 cached analyses are older than 30 days (stale-eligible); the
weekly refresh cron processes ~5 (verified: 3 refreshed Sun Aug 23). At
this rate the backlog never clears. **Improvement:** piggyback refreshes on
the daily ingest's leftover budget, and/or scope refresh to ingredients
actually referenced by published products.

### 5. No cron run telemetry
Diagnosing the cron requires DB inference or local replays; Vercel Hobby
logs are ephemeral. **Improvement:** an `ingest_runs` table (date, found,
skips-by-reason, ingested, published, elapsed) written at the end of each
run. Enables real dashboards and lets the health watch alert on "3
consecutive zero-found days" before the 72h staleness trip.

### 6. SEO is near-zero for a public showcase
Single-page app: every product page shares one generic title/OG image, no
sitemap.xml, stats render as "0 / 0 / 0" for crawlers (IntersectionObserver
count-up), detail content hidden in collapsed accordions. **Improvement
bundle:** per-product `document.title` + OG tags, generated sitemap.xml,
static-render or precompute the stats strip, consider prerendering detail
pages.

### 7. Product-detail API uncached
`/api/products/:id` is a full serverless+DB round trip (~1.1s) on every
anonymous view; only the list endpoint has edge caching. **Improvement:**
same `s-maxage=60, stale-while-revalidate` treatment for published-product
detail responses.

### 8. "Ingredient Database" is promised but does not exist
The nav links to an ingredient database; no such page. The data (657
analyzed ingredients with FSSAI/EWG-grounded rationales) is the platform's
crown jewel. **Improvement:** an ingredient explorer page (search
ingredients, see verdicts, list which products contain them). Strong
differentiator, data already in hand.

---

## P2 — quality and robustness

### 9. Policy decision: imported brands (K-beauty etc.)
The GS1-890 gate structurally excludes imports sold in India (rom&nd — 26
orphaned cache rows, Some By Mi, Eva). Decide: stay strictly
Indian-manufactured, or add a curated import allowlist.
### 10. Cache hygiene
21 garbled-name and 15 low-confidence rows pollute the analysis cache
(draft-blockers, not published). One-off purge + the parser now prevents
recurrence.
### 11. BATCH_ANALYSIS still unevaluated
Implemented, tested, default-off. A staging comparison (verdict quality vs
sequential) could ~5x fresh-ingredient throughput per run.
### 12. Error tracking absent
No Sentry/equivalent; production exceptions vanish. Even a lightweight
capture-to-DB would help.
### 13. Client tests: zero; no E2E
137 server tests, nothing for React (ProtectedRoute, ProductCard gates) and
no Playwright smoke (home → detail → admin).
### 14. Full design review never done
Known cosmetic issues: 2 dead social links (Home.tsx:939,963), latent
mobile ticker overflow, accordion-hidden analysis text. A /design-review
pass would sweep these plus unknowns.
### 15. Citation service still on Google CSE
100/day quota, in-memory counter resets per cold start. Move citations to
Compound (like research was) and retire the Google dependency, or make the
counter durable.

---

## P3 — smaller/opportunistic

### 16. Model currency
All configured models verified live. Optional: bump fallback
qwen3.6-27b → qwen/qwen3.8-27b (now available); consider full
`groq/compound` (vs mini) for the verification second-opinion only.
### 17. OFF category expansion + 503 handling
2-3 India categories 503 regularly (energy-drinks, plant-based-foods);
more category slugs = more supply headroom.
### 18. Image quality
Some OFF crowdsourced photos are poor (expiry-date close-ups). Image-quality
gate or manual overrides for showcase products.
### 19. Release hygiene
VERSION stuck at 1.1.0.0 / CHANGELOG at 2026-07-24 while PRs #4-#13
shipped. Resume /ship discipline or automate version bumps in CI.

---

## User actions (cannot be done from code)

- **Supabase console:** enable leaked-password protection (pending since July).
- **Vercel env:** set a real ADMIN_API_KEY (the API-key admin fallback is
  currently dead code everywhere — or delete the code path).
- **claude.ai connectors:** re-authorize the Supabase MCP connector if MCP
  DB access is wanted again (read-only scripts work meanwhile).
- **Custom domain** for the showcase.

## Verified-healthy (no action)

Daily ingest cadence with India-only 890-gated sourcing; publish gates
(banned/low-confidence/garbled → draft); GitHub Actions health watch (6/6
green); weekly stale-refresh executing; deps at 0 vulnerabilities; security
headers + enforced CSP; edge-cached catalog (~150-250ms); 137/137 tests;
tsc clean.
