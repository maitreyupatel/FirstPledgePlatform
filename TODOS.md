# TODOS

## Supabase Console (user action required)

### Enable leaked-password protection
**Priority:** P1
Security advisor flag: Supabase Auth can check passwords against HaveIBeenPwned.
Console-only toggle (Auth → Settings). Cannot be done via SQL/API.

## Monitoring (user action recommended)

### Second channel for /api/health (optional)
**Priority:** P3
Done: `.github/workflows/health-watch.yml` (daily; fails on non-ok health,
an unreadable catalog or ingest_runs, a last scheduled run >24.5h old, no
scheduled run recorded from 10:00 UTC on 2026-09-27, or 72h with no product of any
status). Optional: add an external keyword monitor (e.g. UptimeRobot on
`"stale":true`) at https://maitreyupatel-first-pledgeplatform.vercel.app/api/health
as a second channel.

## Catalog

### Research Yoga Bar Muesli+ real ingredient label
**Priority:** P2
Unpublished pending research — the OFF record had a truncated 3-item list.
Find the real label (yogabars.in / pack photo), re-vet, publish.

### Review remaining drafts
**Priority:** P2
45 drafts (2026-09-26); triage is tracked in IMPROVEMENT_BACKLOG E3.6/E1.13,
using `POST /api/admin/products/:id/reingest`.

### rom&nd Glasting Melting Balm convergence
**Priority:** P3
16/30 ingredients cached; the daily cron will finish and auto-publish/draft it
within ~5 runs. No action needed unless it stalls.

## AI Pipeline

### Durable research-quota counter
**Priority:** P3
GOOGLE_SEARCH_DAILY_LIMIT is tracked in-memory per process; each serverless
cold start gets a fresh counter, so the cap is advisory in production. Back it
with a DB row if CSE usage returns (it is currently disabled whenever Compound
is active).

### Evaluate BATCH_ANALYSIS in the cron
**Priority:** P2
Opt-in batching (one model call for 4-12 uncached ingredients) is implemented and
tested but default-off. Enable in a staging run, compare verdict quality vs
sequential, then consider making it the cron default.

### Consider Compound for the citation service
**Priority:** P3
CitationService still uses Google CSE. groq/compound could replace it the same
way it replaced ResearchService, retiring the Google API dependency entirely.

## Design

### Full visual design review
**Priority:** P2
Run /design-review against localhost (needs browse daemon) — catalog, product
detail, and admin flows. Deferred from the 2026-07-24 improvement sweep.

### OFF image quality
**Priority:** P3
Some crowdsourced product photos are poor (e.g. an expiry-date close-up on
Heritage buttermilk). Consider an image-quality gate or manual image overrides
for showcase products.

## Completed

- **2026-07-31 — Deadline-aware analyzeIngredients** (PR #4): cron passes its
  remaining budget; analysis aborts cleanly with cache retained; products
  converge across daily runs. Live-verified (Tata Salt, Chocos published).
- **2026-07-31 — Cron dry-spell fix** (PR #4): India-only cross-source sourcing,
  shallow pages, collect-time dedup/brand gates, foreign-brand deny-list.
- **2026-07-31 — CSP enforced** (PR #5): flipped from Report-Only after clean
  headless-browser passes; verified live.
- **2026-07-31 — Honest landing stats + payload trim + health freshness**
  (PR #5, #6): real catalog-derived stats; /api/products ~16KB; /api/health
  exposes `catalog.{published,lastCreatedAt,stale}`.
