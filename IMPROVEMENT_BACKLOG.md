# Improvement Backlog v2 — exhaustive audit 2026-08-27

Two audit passes: a live-verified operational audit, then an eight-track deep
analysis (server + client code review, AI-verdict fact-checking against
FSSAI/EFSA/Codex sources, performance build analysis, full UX walkthrough,
security re-sweep incl. git history, architecture/schema review, competitive
research vs Yuka/EWG/INCIDecoder/India scanners). ~70 findings, organized as
epics E0–E7. Tags: **[verified]** = re-confirmed directly by the lead session;
**[agent]** = found and self-refutation-tested by a review agent.
Item IDs (E1.2 etc.) are stable references for planning.

The platform's operations are healthy (daily India-only ingestion, publish
gates, monitoring green). This backlog is about correctness, trust, and polish.

---

## E0 — SECURITY INCIDENT: leaked live secrets (do first)

**E0.1 [verified]** The GitHub repo is PUBLIC and commit `efeb01b`
("Deploy to production") added a real `.env` to permanent git history.
The blob contains `SUPABASE_SERVICE_ROLE_KEY` (full RLS-bypass DB access)
and `GEMINI_API_KEY` that **match the keys still in use today**, plus
`GOOGLE_API_KEY`, `GOOGLE_CX_ID`, anon keys, and an old Groq key (that one
already rotated). Remediation, in order:
1. **USER ACTION:** rotate in dashboards — Supabase service-role key,
   Gemini/Google API keys (Groq already differs). Consider making the repo
   private, or accept public + rotation.
2. Update Vercel env vars + local `.env` with the new keys; redeploy; verify
   `/api/health`, a product detail, and a local cron run still work.
3. Add secret scanning (gitleaks) to CI so this class cannot recur.
4. Optional: history scrub (git filter-repo) — rotation alone makes the
   leaked values worthless; scrubbing a public repo's history requires a
   coordinated force-push the owner must perform deliberately.

> **Status 2026-08-28:** Triage corrected this item. Supabase service-role +
> anon + Groq keys were ALREADY rotated (verified: leaked values ≠ live .env).
> Gemini + Google keys STILL LIVE — rotation pending (user). Commit efeb01b
> also leaked `client/.env`. Steps 2–3 done: gitleaks CI landed (see E0.3/E7.1),
> `.env.example` created, scan validated non-vacuously (planted-secret probe).

**E0.2 [verified/NEW 2026-08-28]** gitleaks full-history scan found a second
live leak the audit missed: commit `e588cc1d` committed
`.claude/settings.local.json` containing the **live CRON_SECRET** (still
current at discovery). Exposure: anyone can invoke `/api/cron/*` — forced
ingest runs and Groq-quota burn. **USER ACTION: rotate CRON_SECRET** (new
value in Vercel env + local `.env`), then redeploy. File is gitignored now;
recurrence is blocked by CI. Other scan hits triaged as false positives
(docs placeholders) or already-rotated values (`setup-auth.js` history).

---

## E1 — Verdict correctness (the product IS the analyses)

**E1.1 [agent/high]** Cosmetic pipeline grants 0.9 confidence when EWG is
found-but-scoreless (`aiVettingService.ts:332` keys on `found`, not a usable
score; `ewgService.ts:133-156` lets found=true/score=null exist) — blind AI
verdicts skip the verification gate and auto-publish. The food path was
hardened against exactly this; the cosmetic path was not. Fix + regression test.

**E1.2 [verified/critical-class]** The draft "Amul cheese" **banned** verdict
is factually wrong and cites a fabricated regulation (FSSAI permits class II
preservatives in cheese within limits). It was correctly HELD as draft — the
gates worked — but it proves the verifier can agree with a hallucination.
Strengthen: banned verdicts should require a resolvable citation URL and a
registry/second-source match before even draft-level display; discard/re-vet
this draft.

**E1.3 [agent/high]** Hallucinated regulatory citations exist in PUBLISHED
rationales (fabricated INS numbers, a nonexistent CFR section, misattributed
limits — ~6 of 19 sampled verdicts had citation defects even when the verdict
direction was right). Run a one-off re-verification sweep over all published
rationales: check cited regulation identifiers resolve/exist; re-analyze rows
that fail. Consider adding citation-existence checking to the pipeline.

**E1.4 [verified/high]** Legacy cache pollution on published products:
Sting Energy (food) displays a caffeine rationale written for COSMETICS
("safe for use in cosmetics..."). Sweep published ingredient rows whose
rationale context contradicts the product type; re-analyze.

**E1.5 [agent/medium]** `parseIngredients` destroys comma-locant chemistry:
"1,2-Hexanediol" → "Hexanediol" (a different substance analyzed and shown).
Fix the comma-split to protect digit,digit-locant patterns; test.

**E1.6 [agent/medium]** Food verdict `source_url` defaults to a USDA
nutrition-search link that cannot support regulatory claims. Point food
sources at the actual grounding (FSSAI/compound citation) instead.

**E1.7 [agent/medium]** Merged label fragments analyzed as single
"ingredients" produce hedge-driven caution verdicts (known garbled-name class,
now gated at ingest; this item = clean the residue inside existing published
products' ingredient lists).

**E1.8 [agent/low]** Same substance, divergent verdicts across name variants
("aqua" vs "water" class). Consider alias normalization before cache lookup.

## E2 — Admin & client correctness

**E2.1 [verified/CRITICAL]** The default React Query fetcher
(`queryClient.ts:96-111 getQueryFn`) never attaches the Supabase bearer —
only `apiRequest` does. The admin Drafts tab therefore ALWAYS shows 0 and
draft products cannot be opened for editing. This is why the 14-draft backlog
accumulated: **the UI cannot see drafts.** Fix the fetcher to attach the
token; then actually triage the drafts (E3.6).

**E2.2 [agent/high]** `apiRequest` reads the response body twice
(`res.text()` at :86 then `throwIfResNotOk` reads again) — every API error
surfaces as "body stream already read" instead of the server's message.

**E2.3 [agent/high]** Publish button on a brand-new unsaved product issues
`PATCH /api/products/undefined`.

**E2.4 [agent/medium]** No error branches on the three list pages — fetch
failures render as empty/zero states (looks like an empty catalog).

**E2.5 [agent/medium]** wouter v3 misuse creates nested `<a><a>` /
`<a><button>` interactive elements (invalid HTML, screen-reader traps).

**E2.6 [agent/medium]** Accessibility: unlabeled icon buttons, no
aria-expanded on the mobile menu, unlabeled search inputs.

**E2.7 [agent/medium]** Glass-effect MutationObserver re-attaches mousemove
listeners on every DOM change (leak/perf).

**E2.8 [agent/low]** Dead code: unused ThemeToggle, `resetPassword`
redirecting to a nonexistent `/reset-password` route, two divergent
ProductCard implementations, verbose auth logging in production console.

**E2.9 [agent/low]** Unsaved-changes guard misses productType and beforeunload.

## E3 — Honest UX (remove trust theater from a trust product)

**E3.1 [agent/high]** Safety "scores" (9.2 / 6.x) are verdict-derived
constants presented as per-product precision — every Safe product shows the
same number. Either compute a real graded score (see E6.4) or present the
verdict honestly.

**E3.2 [agent/high]** Marketing copy is fabricated and off-subject
(skincare-oriented claims on an Indian food catalog; demo ingredient panel).
Rewrite hero/marketing from the real catalog and real pipeline.

**E3.3 [verified/high]** All 8 footer links are dead `#` anchors including
Privacy Policy and Terms. Write the real pages (Privacy, Terms, About/
Methodology) or remove the links.

**E3.4 [agent/medium]** Homepage ingredient search box is a non-functional
demo; newsletter signup silently discards the email. Wire both or cut both.

**E3.5 [agent/medium]** Navigation: header anchor buttons are no-ops outside
Home; detail "Back" discards catalog filter state; 404 page is a dead end;
consumer CTAs funnel into an Admin Login that offers public self-signup.

**E3.6 [ops]** Draft triage session (14 drafts; five trivially discardable,
nine need label research incl. Knorr name repair and the E1.2 re-vet) —
unblocked by E2.1.

**E3.7 [product/high]** Public methodology page — every credible competitor
leads with one; FirstPledge's pipeline (registry grounding, search-grounded
analysis, verification gate, publish gates) is genuinely strong and entirely
uncommunicated. Cheap, high trust yield.

**E3.8 [product/high]** Show stored provenance: per-ingredient confidence,
"independently reviewed" flags, verification notes exist in the DB and never
render. Surface them.

## E4 — Pipeline throughput & robustness

**E4.1 [agent/high]** `refresh-stale-ingredients` ignores the platform
budget: hardcoded 45s guard + LIMIT 5 while `CRON_BUDGET_MS=280000` exists
(`cron.ts:275,298`). Two-line fix ≈ 5x backlog drain. (Direct cause of the
419-row stale backlog.)

**E4.2 [agent/high]** Interactive `/api/vet-ingredients` inherits
`AI_CALL_DELAY_MS=20000` from vercel.json and has NO deadline — >14 uncached
ingredients cannot finish inside maxDuration; even 5 mean ~2min admin UI
latency. Split the pacing knob (request-path vs cron) and pass a deadline.

**E4.3 [agent/high]** Storage swaps are non-transactional delete-then-insert
(`supabaseStorage.ts update/mergeDraftIntoOriginal`) — a mid-swap failure
leaves a PUBLISHED product with zero ingredients. Move to a Postgres RPC
transaction (or at minimum reorder: insert-first, publish-last).

**E4.4 [agent/medium]** Deadline buffer math: analysis may START with 15s
left but worst-case single-ingredient latency is ~90s+ (45s compound + 45s
verification + retries) — the "never killed mid-write" guarantee can break.
Raise the start-buffer / propagate deadline into compound timeouts.

**E4.5 [agent/medium]** `ilike` with unescaped `%`/`_` in
findByNameAndBrand/hasSimilarProduct — "100% Real..." names act as wildcards
and can false-positive checkExists (product skipped forever). Escape metachars.

**E4.6 [agent/medium]** GroqProvider hops to fallback models on EVERY error
(not just model-availability) and sticks the downgrade for the lambda
lifetime. Scope fallback to 404/decommission errors; don't persist.

**E4.7 [agent/medium]** Cache hits display the lowercased normalized name —
catalogs mix "Sodium Chloride" and "sodium chloride". Preserve display casing
(store original label casing alongside the normalized key).

**E4.8 [agent/medium]** Unknown `GET /api/*` returns 200 + index.html via the
SPA catch-all — the exact silent-failure mode that hid a broken cron once.
Return 404 JSON for unmatched /api/* before the catch-all.

**E4.9 [agent/medium]** Per-lambda in-memory state that silently doesn't hold
on Vercel: CSE quota counter, circuit breaker, vet rate limiter. Document or
back with DB.

**E4.10 [agent/medium]** Health/cron-status only count PUBLISHED products, so
draft-heavy periods (a legitimate outcome) read as an outage. Include drafts
in freshness (e.g. `lastCreatedAt` over all rows + separate published count).

**E4.11 [agent/low]** `USE_SUPABASE_STORAGE` env gates the entire analysis
cache but is documented nowhere (works in prod today; a fresh deploy without
it would silently disable caching). Document + default-safe.

**E4.12 [agent/low]** auth: ADMIN_API_KEY compared non-constant-time; email
logging in prod; dead `server/lib/supabase.ts` duplicate client.

## E5 — Performance

**E5.1 [agent/high]** Monolithic 640KB bundle (prod) ships admin pages, auth,
and supabase-js to every visitor; no route-level code splitting; zero
vite build tuning. Split routes lazily; expect large first-paint win.

**E5.2 [agent/medium]** Deployed JS is ~40% heavier than a fresh local build
(640KB vs 461KB) — investigate stale deploy/build drift.

**E5.3 [agent/medium]** Content-hashed assets served with
`max-age=0, must-revalidate` — add immutable caching headers for
`/assets/*` in vercel.json.

**E5.4 [agent/medium]** Fonts render-blocking, missing preconnect
(Fontshare); trim families/weights.

**E5.5 [agent/medium]** Product images hotlinked from OFF (~2s TTFB,
no sizing). Proxy/cache or at least lazy-load with dimensions.

**E5.6 [agent/low]** Dead heavy deps installed: framer-motion, recharts —
remove (also relevant to E5.2).

## E6 — Growth: SEO + product differentiation

**E6.1** Per-product `<title>`/OG + generated sitemap.xml + static stats for
crawlers (carried from v1 backlog).
**E6.2** Detail API edge caching (carried; ~1.1s → ~150ms).
**E6.3** Ingredient explorer page — the promised "Ingredient Database":
searchable 657-analysis library, products-containing-X. Crown-jewel data,
currently invisible.
**E6.4 [product]** Decide scoring model: competitors all use graded scores +
"banned abroad / FSSAI status" framing; FirstPledge's ternary verdict is
coarser. Options: honest verdict-only display (fast) or a real graded score
with methodology (bigger, pairs with E3.7).
**E6.5 [product]** Per-ingredient India-regulatory framing (FSSAI permitted/
limits/banned-abroad) — differentiator vs global apps.
**E6.6 [product/later]** Safer-alternatives suggestions; barcode/photo entry
(week+ scale; only after the above).

## E7 — Infra & process

**E7.1** CI workflow: install + tsc + vitest + gitleaks on PR and main
(carried from v1; now also the E0.3 vehicle).
**E7.2** `ingest_runs` telemetry table (carried).
**E7.3** Error tracking (carried).
**E7.4 [agent]** Schema reconciliation: Drizzle schema missing 3 live tables
and all indexes (`db:push` is a loaded gun; Drizzle unused at runtime —
consider removing it or making it authoritative); add missing indexes for
real query patterns; drop dead `product_queue` + enums.
**E7.5** Client tests + Playwright E2E smoke (carried).
**E7.6** Release hygiene: VERSION/CHANGELOG stale since 1.1.0.0 (carried).
**E7.7 [agent]** Error-response standardization (shape + no internals in prod).
**E7.8 [agent]** npm audit (full): esbuild dev-server + @babel/core CVEs in
dev tooling; supabase-js 29 releases behind. Upgrade pass with tests.
**E7.9 [agent]** Rate limits on mutating admin routes + before Supabase auth
call in requireAuth; cache /api/health (it runs 2 DB queries per anonymous hit).

## User actions (only you can do these)

1. **E0.1 rotations** — Supabase service-role key, Gemini/Google keys (see top).
2. Supabase console: leaked-password protection toggle (pending since July).
3. Vercel: set a real `ADMIN_API_KEY`; add rotated keys.
4. Decide: repo public vs private; imported-brands policy (E6 note: 890 gate
   currently excludes K-beauty); custom domain.
5. Re-authorize the Supabase MCP connector in claude.ai settings if MCP DB
   access is wanted.

## Verified healthy (don't touch)

Daily 890-gated India-only ingestion; publish gates (banned/low-conf/garbled
→ draft — they caught every bad verdict in this audit); GH Actions health
watch green; weekly refresh executing (throughput aside); enforced CSP +
headers; edge-cached catalog; 137/137 tests; tsc clean.
