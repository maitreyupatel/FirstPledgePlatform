# Testing

## Philosophy

100% test coverage is the key to safe vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, every change is a gamble. With tests, refactoring becomes routine.

## Framework

**Vitest v4** — native to Vite, zero config overhead, built-in ESM support.
**supertest** — HTTP assertions against the Express app without binding a port.

## How to run

```bash
npm test                 # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # With v8 coverage report
```

Tests live in `tests/server/`. The `VERCEL=1` env var is set automatically via `vitest.config.ts` so the Express server never tries to bind port 3000 during tests.

## Test layers

| Layer | Location | When to write |
|---|---|---|
| Unit | `tests/server/*.test.ts` | Pure functions, classifiers, auth logic |
| Integration | `tests/server/*.test.ts` with supertest | API routes, middleware |
| E2E | Run `/qa http://localhost:5173` | Full browser flows |

## Conventions

- One `describe` block per feature or invariant
- Test the **behaviour**, not the implementation — e.g., "returns 401" not "calls `res.status(401)`"
- Mock `@supabase/supabase-js` when testing auth middleware so tests never hit the network
- Set `VERCEL=1` (already in `vitest.config.ts`) to prevent Express from binding a port on import

## Test expectations

- **New function** → write a corresponding test
- **Bug fix** → write a regression test before fixing
- **Error handler** → write a test that triggers the error condition
- **Security fix** → write a test that proves the vulnerability is closed
- **Never commit code that makes existing tests fail**
