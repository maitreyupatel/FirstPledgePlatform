# Changelog

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
