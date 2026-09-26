# FirstPledgePlatform — Claude Code Instructions

## Project Overview

Trust-as-a-Service platform for AI-powered product ingredient safety verification.
Full-stack TypeScript: React 18 + Express.js + Supabase (PostgreSQL) + Drizzle ORM.
AI providers: Groq (primary), OpenAI, Gemini — configured via `AI_PROVIDER` env var.
Deployed on Vercel. Auth via Supabase JWT with API key fallback.

## Tech Stack

- **Frontend**: React 18, Vite (port 5173), Tailwind CSS, Shadcn UI, Wouter, React Query
- **Backend**: Express.js (TypeScript, port 3000), proxied through Vite in dev
- **Database**: Supabase (PostgreSQL), Drizzle ORM (`shared/schema.ts`)
- **Dev command**: `npm run dev` — starts Express on :3000, Vite proxy on :5173
- **Build**: `npm run build` — Vite + esbuild bundle for Vercel
- **Deploy**: Vercel (`vercel.json`), API entry at `api/index.ts`

## Key Architecture

- `server/index.ts` — Express app: public GET /api/health, GET /api/products[/:id]; admin (Supabase JWT with admin role, or ADMIN_API_KEY): POST/PATCH/DELETE products, /api/vet-ingredients, /api/admin/ingredient-analyses, /api/admin/cron-status. Unmatched `/api` and `/api/*` return JSON 404
- `server/routes/cron.ts` — /api/cron/daily-ingest (09:00 UTC daily) + /api/cron/refresh-stale-ingredients (Sun 02:00 UTC), both behind CRON_SECRET; every run is logged to `ingest_runs` (trigger 'schedule' only when the User-Agent is vercel-cron, else 'manual')
- `server/routes/adminReingest.ts` — POST /api/admin/products/:id/reingest `{ingredientsText, apply?: true, hold?}`: re-runs parse → analyze → publish gate. Dry run by default, but dry runs still spend AI calls and write the shared analysis cache. `apply: true` can publish OR unpublish; refuses (409) products with admin overrides
- `server/middleware/auth.ts` — Supabase JWT verification + API key fallback (constant-time compare)
- `server/services/aiVettingService.ts` — Multi-layer ingredient analysis: cache → EWG → research → AI
- `server/storage/supabaseStorage.ts` — Product/ingredient persistence layer
- `shared/schema.ts` — Drizzle schema for products + ingredients ONLY. ingredient_analyses, user_profiles and ingest_runs exist only in `supabase/migrations/` (001–011, applied by hand in the SQL editor / Supabase MCP). Runtime uses supabase-js; do NOT run `npm run db:push` (backlog E7.4)
- `client/src/pages/` — Home, ProductDetail, AdminDashboard, ProductForm
- `client/src/components/auth/` — AuthProvider (Supabase session), ProtectedRoute

## Environment Variables Required

Full, commented inventory: `.env.example` (copy to `.env`).

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY   # client build (anon key only)
USE_SUPABASE_STORAGE=true   # REQUIRED: anything else silently disables the analysis cache
AI_PROVIDER=groq|openai|gemini
GROQ_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY
ADMIN_API_KEY (admin bearer fallback), CRON_SECRET (required in production)
GOOGLE_API_KEY + GOOGLE_CX_ID (optional: citation + legacy research search)
CLIENT_ORIGIN=http://localhost:5173, PORT=3000
NODE_ENV=development|production
DATABASE_URL                # drizzle-kit only; the server does not read it
```

Optional AI-pipeline tuning:

```
GROQ_MODEL              # default openai/gpt-oss-120b
GROQ_COMPOUND_MODEL     # default groq/compound-mini (search-grounded research)
COMPOUND_RESEARCH=false # disable search-grounded analysis + verification gate
AI_CALL_DELAY_MS=10000  # pacing between fresh AI calls (default 2000)
BATCH_ANALYSIS=true     # opt-in: analyze uncached ingredients in one call
GOOGLE_SEARCH_DAILY_LIMIT=100  # legacy CSE research quota
OPENAI_MODEL / GEMINI_MODEL    # standby provider overrides
CRON_BUDGET_MS          # default 50000; prod 280000 via vercel.json
CRON_PRODUCTS_PER_DAY   # default 1, capped at 2 in code
INGREDIENT_REFRESH_DAYS=30     # re-analyze cached rows older than this
```

## gstack

Use `/browse` from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`,
`/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`,
`/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/open-gstack-browser`,
`/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`,
`/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`,
`/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`,
`/gstack-upgrade`, `/learn`

### Recommended skill order for this project

| Situation | Skills to run |
|-----------|---------------|
| New feature | `/office-hours` → `/plan-eng-review` → build → `/review` → `/qa http://localhost:5173` → `/ship` |
| Bug fix | `/investigate` → `/careful` → fix → `/review` → `/ship` |
| Security concern | `/cso` → `/freeze server/` → fix → `/review` → `/ship` |
| Pre-deploy | `/cso` then `/qa https://<vercel-url>` then `/canary https://<vercel-url>` |
| Design change | `/plan-design-review` → build → `/design-review` → `/qa http://localhost:5173` |

### High-priority first runs

1. `/cso` — security audit (auth middleware, admin routes, AI input, external API calls)
2. `/qa http://localhost:5173` — QA the full ingredient vetting workflow in real browser
3. `/ship` — test framework + CI already exist (Vitest, 350 tests; CI gates tsc + tests + gitleaks)

## Testing

Run: `npm test` (Vitest, 350 tests in 32 files across `tests/server/` and `tests/client/`, ~4s warm, ~20s cold; per-test timeout 20s)
Coverage: `npm run test:coverage`
Test directories: `tests/server/`, `tests/client/` (node env), shared fixtures in `tests/fixtures/`.
CI (`.github/workflows/ci.yml`) runs `npm run check`, `npm test` and gitleaks on every PR and push to main (the PR scan is the gate; `secret-scan-full.yml` sweeps full history weekly).
See [TESTING.md](TESTING.md) for full conventions.

- New function → write a corresponding test
- Bug fix → write a regression test before fixing
- Security fix → write a test proving the vulnerability is closed
- Never commit code that makes existing tests fail

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
