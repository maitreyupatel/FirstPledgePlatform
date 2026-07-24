# Changelog

## [1.1.0.0] — 2026-07-24

### Security

- **Prompt-injection hardening across all AI providers** — ingredient names and research snippets are untrusted input; they are now sanitized, wrapped in delimited data blocks, and every model verdict is validated before it can influence a safety rating. A manipulated response can never publish as "safe".
- **Request validation on all product endpoints** — product create/update and ingredient vetting now reject malformed payloads (bad statuses, oversized fields, `javascript:` URLs, unbounded lists) before touching storage.
- **Cron endpoints fail closed** — the cron secret is compared in constant time, and missing configuration now refuses requests in production instead of running unprotected.
- **Admin UI enforces the admin role** — non-admin users see an access-denied screen instead of the dashboard; rate limiting now sees real client IPs behind Vercel.
- **Ingredient vetting requires admin authentication** — the endpoint drives AI/search spend and cache writes; anonymous access is closed.
- **Draft products are admin-only** — viewing unpublished products now requires the admin role, not just any signed-in account.

### Added

- **India-only product sourcing** — the daily ingestion pipeline now sources exclusively Indian-market products; the global EU/US fallback pool is gone, and 37 foreign-market products were removed from the catalog.
- **FSSAI-first ingredient analysis** — food safety verdicts now lead with India's regulator (FSSAI, INS additive numbers) with FDA/EFSA as supporting references.
- **Search-grounded research (Groq Compound)** — ingredients unknown to the local databases are analyzed with live regulatory lookups pinned to FSSAI/FDA/EFSA/EWG/PubMed, so rationales cite real regulations instead of model recall.
- **Independent verification gate** — any "banned" or low-confidence verdict gets a second search-grounded opinion before it can publish; disagreements keep the more cautious rating and are flagged for manual review.
- **INS additive registry** — Indian-label additive codes ("Acidity Regulator (INS 296)") resolve to verified identities locally; 13 India-common additives added with FSSAI-first notes.
- **App-wide error boundary** — a crash in one page no longer takes down the whole app.
- **Pipeline tuning knobs** — `GROQ_MODEL`, `GROQ_COMPOUND_MODEL`, `COMPOUND_RESEARCH`, `AI_CALL_DELAY_MS`, `BATCH_ANALYSIS`, `GOOGLE_SEARCH_DAILY_LIMIT`.

### Changed

- **AI models brought current** — Groq default is now `openai/gpt-oss-120b` (the previous Llama models were decommissioned by Groq); Gemini and OpenAI standby providers moved off retired models.
- **Analysis caching is batched and race-safe** — one database lookup per product instead of two per ingredient, atomic upserts, and concurrent duplicate analyses share a single AI call.
- **Google research quota is tracked** — approaching the daily limit warns; exceeding it degrades gracefully instead of failing silently.
- **Every product is categorized** — the catalog's category tabs now cover the full catalog (previously untyped products were invisible to filtering).

### Fixed

- **Unbounded AI retry loops** — a sustained rate limit no longer recurses until the serverless function dies; retries are bounded with exponential backoff.
- **Admin edits now appear without a reload** — product detail caches are invalidated after saves and publishes.
- **EWG scores and confidence are bounded** — out-of-range values are rejected at write time and by database constraints.

## [1.0.2.0] — 2026-05-06

### Changed

- **Home page product grid** now shows the top 8 products instead of the full catalog, keeping the landing page focused and fast to scroll.
- **"See All Products" CTA** appears below the grid when more than 8 products exist, linking to the full product catalog at `/products` with search and status filters.
- **Dead category filter removed** from the home page — the pill tabs (Supplements, Skincare, etc.) were decorative with no filtering logic; removed to avoid misleading users.
- **`PRODUCT_PREVIEW_LIMIT` constant** introduced so the grid slice and the counter text (`Showing 8 of N`) stay in sync if the limit ever changes.
- **`settings.local.json` untracked** — moved to `.gitignore` so accumulated session permissions are no longer committed to the shared repo.
- **Skill routing rules** added to `CLAUDE.md` so Claude Code automatically invokes the right gstack skill (`/qa`, `/ship`, `/investigate`, etc.) for common development tasks.

## [1.0.1.0] — 2026-04-22

### Security (CSO Audit)

- **Finding #1 (Critical)** — `server/middleware/auth.ts`: Removed `SUPABASE_SERVICE_ROLE_KEY` from the API-key fallback chain. The service role key bypasses all Supabase Row Level Security; it must never be accepted as a bearer token. `requireAuth` and `optionalAuth` now only accept a dedicated `ADMIN_API_KEY`.
- **Finding #2 (High)** — `server/index.ts`: `GET /api/products` and `GET /api/products/:id` now apply `optionalAuth` middleware. The `includeUnpublished` query parameter is only honored when the caller is authenticated, preventing anonymous enumeration of draft products.
- **Finding #3 (High)** — `server/index.ts`: Added `express-rate-limit` (10 requests / IP / minute) on `POST /api/vet-ingredients` to prevent LLM API cost amplification by unauthenticated callers.
- **Finding #5 (Medium)** — `server/index.ts`: `GET /api/debug/storage` now returns 404 in any non-development environment, preventing storage internals from being exposed on the production URL.
- **Finding #6 (Medium)** — `server/middleware/auth.ts`: `optionalAuth` no longer hardcodes `role: 'admin'`. It now performs a real Supabase `user_profiles` lookup to populate the caller's actual role.
- **Finding #7 (Low)** — `server/middleware/auth.ts`: Auth token logging is now guarded behind `NODE_ENV === 'development'`. The token preview line that could leak partial token values in production logs has been removed.

### Added

- **Test framework** — Vitest v4 + supertest scaffolded. `vitest.config.ts` sets `VERCEL=1` so Express never tries to bind a port during test runs. Coverage via v8.
- **`tests/server/auth.test.ts`** — Four regression tests for CSO Finding #1: service role key rejected, correct ADMIN_API_KEY accepted, wrong key rejected, missing Authorization header returns 401.
- **`tests/server/public-api.test.ts`** — Three tests: unauthenticated callers cannot see unpublished products via `?includeUnpublished=true`, `/api/health` returns 200, `/api/debug/storage` returns 404 in production.
- **`tests/server/ingredient-classifier.test.ts`** — Eight unit tests for the keyword-based fallback classifier covering banned/caution/safe classification, case-insensitivity, and precedence ordering.
- **`TESTING.md`** — Documents the test framework, how to run tests, layer conventions, and expectations for new code.

### Changed

- `.gitignore`: Added `.gstack/` to keep local security reports off the remote.
- `package.json` / `VERSION`: Bumped to `1.0.1.0` (security patch release).
