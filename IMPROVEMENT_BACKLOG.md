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
>
> **Status 2026-09-26:** re-verified by full-value SHA-256 comparison (values
> never printed): `GEMINI_API_KEY`, `GOOGLE_API_KEY` and `GOOGLE_CX_ID` in the
> live `.env` STILL equal the values leaked in `efeb01b`. Rotation pending (user).

**E0.2 [verified/NEW 2026-08-28]** gitleaks full-history scan found a second
live leak the audit missed: commit `e588cc1d` committed
`.claude/settings.local.json` containing the **live CRON_SECRET** (still
current at discovery). Exposure: anyone can invoke `/api/cron/*` — forced
ingest runs and Groq-quota burn. **USER ACTION: rotate CRON_SECRET** (new
value in Vercel env + local `.env`), then redeploy. File is gitignored now;
recurrence is blocked by CI. Other scan hits triaged as false positives
(docs placeholders) or already-rotated values (`setup-auth.js` history).
> **Status 2026-09-26:** CRON_SECRET still equals the leaked value (hash
> comparison). Rotation pending (user).

---

## E1 — Verdict correctness (the product IS the analyses)

**E1.1 [agent/high] ✅ DONE 2026-08-28** Cosmetic pipeline grants 0.9 confidence when EWG is
found-but-scoreless (`aiVettingService.ts:332` keys on `found`, not a usable
score; `ewgService.ts:133-156` lets found=true/score=null exist) — blind AI
verdicts skip the verification gate and auto-publish. The food path was
hardened against exactly this; the cosmetic path was not. Fix + regression test.
> Evidence: confidence now keys on derived EWG status (mirrors food/batch
> paths) AND both EWG parsers clamp before deriving `found` (root cause).
> 6 regression tests in tests/server/phase1-regressions.test.ts.

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

**E1.5 [agent/medium] ✅ DONE 2026-09-26** `parseIngredients` destroys comma-locant chemistry:
"1,2-Hexanediol" → "Hexanediol" (a different substance analyzed and shown).
Fix the comma-split to protect digit,digit-locant patterns; test.
> Evidence: the parser rewrite (PR #18) splits on top-level separators only;
> "1,2-Hexanediol" and "1,3-Butylene Glycol" survive (regression tests in
> ingredient-parser-additives.test.ts).

**E1.6 [agent/medium]** Food verdict `source_url` defaults to a USDA
nutrition-search link that cannot support regulatory claims. Point food
sources at the actual grounding (FSSAI/compound citation) instead.

**E1.7 [agent/medium] ✅ DONE 2026-09-26** Merged label fragments analyzed as single
"ingredients" produce hedge-driven caution verdicts (known garbled-name class,
now gated at ingest; this item = clean the residue inside existing published
products' ingredient lists).
> Evidence: 31 published products re-ingested through the admin endpoint
> (dry run → review → apply, full-row snapshots, every write verified in the
> DB and live). 12 kept published with corrected lists; 19 moved to draft
> (7 damaged/truncated labels, 12 generic-declaration holds — see E1.12);
> 2 duplicates unpublished. Published 45 → 24. Details: IMPROVEMENTS.md S11.

**E1.12 [agent/high] ✅ DONE 2026-09-26 (PR stacked on #18)** Generic
declarations FSSAI permits on labels — "Spices and Condiments", "Natural
Flavouring Substances", "Nature Identical Flavouring Substances", "Seasoning"
— get 0.2-confidence verdicts because the model will not rate an undisclosed
category, and one such verdict holds the whole product (gate: any ingredient
< 0.6). Nearly every Indian packaged food declares one: this held 12
otherwise-complete products in the repair and drives the Sept draft rate.
The model is also inconsistent ("mixed spices" 0.93, "flavours" 0.86).
Fix: a deterministic registry verdict for generic declared categories
("caution — composition not disclosed; FSSAI permits generic declaration"),
confident in the verdict itself, then re-ingest the 12 drafts. Never lower
the gate threshold.
> Evidence: fixed verdict (caution, 0.85, cites Labelling & Display Regs 2020
> Reg. 5) only for a declaration the label leaves undisclosed — a listed
> spice blend is itemized, a named flavour is kept ("… - Rose") and analyzed
> as written; unnamed artificial flavours, bare "Flavours"/"Herbs"/
> "Condiments" never match; computed, never cached (the cache is shared with
> deployed code). Independent review found the parser collapsed listed
> spices into the class (the verdict would have been false) — fixed before
> any write. Re-ingest (dry run → apply, 0 mismatches): 9 drafts
> republished incl. Mountain Dew; Thums up, Crunchex, Farali stay held
> (name length, "Seasoning", fused "CARDAMOM NUTMEG"). Published 24 → 32.

**E1.14 [agent/high] (NEW 2026-09-26)** Food products analyzed through the
COSMETIC pipeline: EWG / "personal care" rationales on food ingredients.
Found on 11 food products (3 published: Alpino, Sev Murmura, Heritage
A-One — all three re-ingested through the food pipeline 2026-09-26; Alpino
went to draft, its current label text is damaged). Root cause not yet
identified (likely product_type "cosmetic"/"unknown" at analysis time, then
corrected without re-analysis, or an OBF-sourced record). Add a guard: the
admin type change must trigger re-analysis, and the gate should hold a food
product whose rows cite EWG.

**E1.13 [ops/low] (NEW 2026-09-26)** Catalog follow-ups from the repair:
Alpino (now draft: damaged OFF text + cosmetic-pipeline verdicts — verify
against the pack, re-ingest with cleaned text); Thums up (held: its compliant
flavour name makes a 67-char name — re-ingest with cleaned text); Crunchex
("Seasoning" compound head scores 0.2 — E1.10); Farali Chivda (label fuses
"CARDAMOM NUTMEG");
Glow & Lovely draft = barcode duplicate with a doubled name; a THIRD Sprite
draft ("Coca Cola", created 2026-09-26 by the unfixed cron on main); 36
orphaned legacy-keyed cache rows (inert; optional cleanup).

**E1.8 [agent/low]** Same substance, divergent verdicts across name variants
("aqua" vs "water" class). Consider alias normalization before cache lookup.
> **Partial 2026-09-26:** coded additives now share one row per code
> ("Preservative (211)", "E211", "INS-211" → key "ins 211", sub-type kept:
> "ins 500(ii)"), analyzed under a wording-neutral identity ("Sodium Benzoate
> INS 211"). Uncoded aliases ("aqua"/"water") remain.

**E1.9 [agent/high] ✅ DONE 2026-09-26 (NEW)** The parser deleted additive
codes Indian labels print as bare numbers ("ACIDITY REGULATORS (330, 331)"):
20 of 45 published products were missing declared additives (Mountain Dew
lost sodium benzoate and tartrazine). Rewritten as a bracket scanner with one
INS/E code grammar validated against the Codex INS list; unreadable text is
HELD (gate → draft), never guessed or dropped. Two adversarial review rounds
(27 + 30 confirmed findings, all fixed, each pinned by a regression test).
Repair of published lists: see E1.7.

**E1.10 [agent/medium] (NEW 2026-09-26)** Named sub-ingredients of a compound
ingredient are not itemized — "Dark Chocolate Paste (Sugar, Edible Vegetable
Fat, Cocoa Solids, Soy Lecithin)" is analyzed as "Dark Chocolate Paste"
(original parser behavior, kept deliberately in the rewrite; coded additives
inside ARE emitted). Material for a safety product: soy lecithin, palm fat and
added sugars inside compounds go unanalyzed. Itemizing changes every
product's list and the per-product AI budget (50-ingredient cap) — needs its
own design pass (e.g. emit sub-items, drop the compound head).

**E1.11 [agent/low] (NEW 2026-09-26)** Residual label-reading gaps seen in
the 74-label corpus: (a) a list's final "and" merges two plain ingredients
("Iodised Salt And Nature Identical Flavouring Substance" — Smoodh Lassi) and
INCI "A and B" pairs stay merged; (b) OCR misspellings pass through as names
("Maltodectrin", "Anlioxidant"). The 2026-09-26 repair corrected these by
recorded operator edits; the parser does not.

## E2 — Admin & client correctness

**E2.1 [verified/CRITICAL] ✅ DONE 2026-08-28** The default React Query fetcher
(`queryClient.ts:96-111 getQueryFn`) never attaches the Supabase bearer —
only `apiRequest` does. The admin Drafts tab therefore ALWAYS shows 0 and
draft products cannot be opened for editing. This is why the 14-draft backlog
accumulated: **the UI cannot see drafts.** Fix the fetcher to attach the
token; then actually triage the drafts (E3.6).
> Evidence: getQueryFn now attaches getAuthToken() bearer; unit-tested in
> tests/client/queryClient.test.ts (first client tests in the repo).

**E2.2 [agent/high] ✅ DONE 2026-08-28** `apiRequest` reads the response body twice
(`res.text()` at :86 then `throwIfResNotOk` reads again) — every API error
surfaces as "body stream already read" instead of the server's message.
> Evidence: single read; regression test proves "404: <server body>" surfaces.

**E2.3 [agent/high] ✅ DONE 2026-08-28** Publish button on a brand-new unsaved product issues
`PATCH /api/products/undefined`.
> Evidence: create-mode publish now POSTs /api/products with status:published
> (productCreateSchema already accepts status).

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
> **Tooling 2026-09-26:** `POST /api/admin/products/:id/reingest` re-runs a
> stored product through the cron's parse → analyze → gate path with a
> supplied label text; dry run by default (`apply: true` to write), operator
> `hold`, before/after report. Triage itself (now 30 drafts) still pending.

**E3.7 [product/high]** Public methodology page — every credible competitor
leads with one; FirstPledge's pipeline (registry grounding, search-grounded
analysis, verification gate, publish gates) is genuinely strong and entirely
uncommunicated. Cheap, high trust yield.

**E3.8 [product/high]** Show stored provenance: per-ingredient confidence,
"independently reviewed" flags, verification notes exist in the DB and never
render. Surface them.

## E4 — Pipeline throughput & robustness

**E4.1 [agent/high] ✅ DONE 2026-08-28** `refresh-stale-ingredients` ignores the platform
budget: hardcoded 45s guard + LIMIT 5 while `CRON_BUDGET_MS=280000` exists
(`cron.ts:275,298`). Two-line fix ≈ 5x backlog drain. (Direct cause of the
419-row stale backlog.)
> Evidence: computeRefreshBudget() derives limit 11 + 160s guard from the
> 280s prod budget (worst-case-latency-aware, unit-tested). File was
> server/routes/cron.ts, not server/cron.ts. Stale 60s-era comments cleaned.

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

**E4.5 [agent/medium] ✅ DONE 2026-08-28** `ilike` with unescaped `%`/`_` in
findByNameAndBrand/hasSimilarProduct — "100% Real..." names act as wildcards
and can false-positive checkExists (product skipped forever). Escape metachars.
> Evidence: escapeLike() in server/utils/likeEscape.ts, applied at all 3
> ilike call sites; unit-tested.

**E4.6 [agent/medium]** GroqProvider hops to fallback models on EVERY error
(not just model-availability) and sticks the downgrade for the lambda
lifetime. Scope fallback to 404/decommission errors; don't persist.

**E4.7 [agent/medium] ✅ DONE 2026-09-26** Cache hits display the lowercased normalized name —
catalogs mix "Sodium Chloride" and "sodium chloride". Preserve display casing
(store original label casing alongside the normalized key).
> Evidence: analyzeIngredients returns every result (hit, fresh, coalesced)
> under the label's own wording; regression tests in analysis-pipeline and
> cache-review-regressions.

**E4.8 [agent/medium] ✅ DONE 2026-08-28** Unknown `GET /api/*` returns 200 + index.html via the
SPA catch-all — the exact silent-failure mode that hid a broken cron once.
Return 404 JSON for unmatched /api/* before the catch-all.
> Evidence: app.all("/api/*") 404 guard + missing-index.html fallback now 500
> (was silent 200). Live-probed locally; supertest regression test.

**E4.9 [agent/medium]** Per-lambda in-memory state that silently doesn't hold
on Vercel: CSE quota counter, circuit breaker, vet rate limiter. Document or
back with DB.

**E4.10 [agent/medium] ✅ DONE 2026-09-26** Health/cron-status only count PUBLISHED products, so
draft-heavy periods (a legitimate outcome) read as an outage. Include drafts
in freshness (e.g. `lastCreatedAt` over all rows + separate published count).
> Evidence: freshness over all statuses; failed reads report
> `{error:"unavailable"}` instead of a false "stale"; the health watch fails
> on a missed scheduled run (>24.5h), 72h with no product, or an unreadable DB.
> Targets both September failure classes: false alarms on draft-only days,
> and a missed run (Sep 21) that raised no alarm.

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

**E5.7 [agent/medium] (NEW 2026-09-26)** `GET /api/products` is edge-cached
(`Cache-Control: public`, no max-age; `X-Vercel-Cache: HIT`): after the
repair unpublished 21 products the plain URL still listed 36 while the DB
and a cache-busted request showed 24. Set an explicit short `s-maxage` +
`stale-while-revalidate` (or `private`) so unpublishing takes effect promptly.

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
**E7.2 ✅ DONE 2026-09-26** `ingest_runs` telemetry table (carried).
> Evidence: migrations 010/011 applied (additive, RLS default-deny); every
> cron run records start/finish/outcome/counts and scheduled-vs-manual
> trigger, fail-open. Exposed via /api/health and /api/cron-status.
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
> **Partial 2026-09-26:** /api/health body memoized 60s. Rate limits pending.

## User actions (only you can do these)

1. **Merge #16 → #17 → #18** (agent merges are blocked by policy). Until #18
   ships, the daily cron on main keeps dropping additive codes and admitting
   brand/barcode duplicates, and the health watch false-alarms.
2. **E0.1/E0.2 rotations** — GEMINI_API_KEY, GOOGLE_API_KEY (+ GOOGLE_CX_ID),
   CRON_SECRET: re-verified 2026-09-26 as still equal to the leaked values.
   Supabase + Groq already rotated.
3. Supabase console: leaked-password protection toggle (pending since July).
4. Vercel: set a real `ADMIN_API_KEY`; add rotated keys.
5. Decide: repo public vs private; imported-brands policy (E6 note: 890 gate
   currently excludes K-beauty); custom domain.
6. Re-authorize the Supabase MCP connector in claude.ai settings if MCP DB
   access is wanted.

## Verified healthy (don't touch)

Daily 890-gated India-only ingestion; publish gates (banned/low-conf/garbled
→ draft — they caught every bad verdict in this audit); GH Actions health
watch green; weekly refresh executing (throughput aside); enforced CSP +
headers; edge-cached catalog; 137/137 tests; tsc clean.
