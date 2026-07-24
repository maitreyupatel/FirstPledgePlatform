# TODOS

## Supabase Console (user action required)

### Enable leaked-password protection
**Priority:** P1
Security advisor flag: Supabase Auth can check passwords against HaveIBeenPwned.
Console-only toggle (Auth → Settings). Cannot be done via SQL/API.

## Catalog

### Research Yoga Bar Muesli+ real ingredient label
**Priority:** P2
Unpublished pending research — the OFF record had a truncated 3-item list.
Find the real label (yogabars.in / pack photo), re-vet, publish.

### Review remaining drafts
**Priority:** P2
Five drafts await publish/discard: Biotique Sun Shield (junk ingredient data),
D'lecta Mozzarella, Ching's Red Chilli Sauce, Some By Mi (Korean-market record),
Yoga Bar Muesli+ (above).

## AI Pipeline

### Deadline-aware analyzeIngredients for the cron
**Priority:** P1
Compound-grounded analyses run ~8-12s per unknown ingredient. daily-ingest's 50s
guard only checks BETWEEN products; a single product with many unknown
ingredients can still exceed Vercel's 60s limit mid-analysis. Add a deadline
option to analyzeIngredients that aborts cleanly (skip product, no partial
write) when the budget is exhausted. (Adversarial review 2026-07-24, P1.)

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

## Completed

_(none yet — file created 2026-07-24)_
