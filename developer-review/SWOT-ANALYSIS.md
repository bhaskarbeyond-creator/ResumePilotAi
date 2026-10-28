# SWOT Analysis — Evidence-Bound

Every entry below cites a `DISC-ID`, a real file/line reference captured during this
audit, or an explicit measured/observed fact. Generic claims are not permitted by the
governing mandate and none are included. Where evidence is limited to a sample rather
than exhaustive coverage, that is stated.

---

## 1. Architecture

### Strengths
- **Layered, globally-enforced authentication model.** `backend/index.js`'s single
  `/api` authentication gate (allow-listed public paths via anchored regex, else
  `requireAuth`) means individual route files like `backend/routes/resumes.js` can safely
  assume `req.user.uid` is populated without re-implementing auth per-router. Evidence:
  `appendix/INVENTORIES/security-tenant-isolation.md` §2; `backend/index.js` ~line 464-470.
- **Checksum- and lock-aware migration runner.** `backend/database/migrationRunner.js`
  computes a SHA-256 per migration file, rejects duplicate version numbers, and uses a
  quote/comment-aware SQL statement splitter rather than a naive `;`-split. Evidence:
  `appendix/INVENTORIES/database.md` §1.
- **Explicit, named security-threat documentation exists for at least one subsystem.**
  `docs/ai-settings/security-review.md` (inside the audited repo) documents a STRIDE
  threat model with specific automated-test cross-references for the AI-settings admin
  surface. This is a genuine, verifiable artifact, not a generic claim.

### Weaknesses
- **Dual, divergent frontend application trees** (`DISC-001`) — a fully-formed, buildable,
  three-days-stale legacy JSX app coexists at the repository root alongside the actively
  built TypeScript `frontend/` app, with no documented relationship between them.
- **No pinned Node.js engine version** across three independent `package.json` files
  (`DISC-005`), despite native/runtime-sensitive dependencies (`puppeteer-core`,
  `@sparticuz/chromium`).
- **`backend/index.js` is extremely large** (confirmed >7,580 lines — the final catch-all
  route handler was observed at line 7580) and mixes route mounting, global middleware,
  payment-provider validation imports, and OAuth helpers in a single file, which is a
  verified complexity signal (not independently diffed against a line-count threshold
  from an external style guide, but self-evidently large relative to the 20 separately
  modularized files under `backend/routes/`).

### Opportunities
- **Opportunity:** Extract `backend/index.js`'s remaining inline route logic (e.g., the
  duplicate `/api/enterprise`/`/api/platform` mount calls noted in
  `appendix/INVENTORIES/routes.md` §1) into dedicated router modules, matching the
  pattern already used for the 20 files in `backend/routes/`.
  **Expected measurable delta:** Reduction in `backend/index.js` line count (baseline:
  >7,580 lines, measured via the line number of the final catch-all handler observed in
  this session) and a corresponding reduction in merge-conflict surface area for that
  file.
  **Baseline measurement needed:** Exact current line count (`wc -l backend/index.js`)
  and a per-section breakdown (not fully captured in this session).
  **Measurement method:** `wc -l` before/after; `git diff --stat` per extraction PR.
  **Dependencies:** None blocking; purely a refactor.
  **Verification criteria:** `npm --prefix backend test` passes identically before and
  after (same pass count), per mandate's regression-test discipline.
- **Opportunity:** Resolve `DISC-001` by deleting or archiving the root `src/` tree.
  **Expected measurable delta:** Reduction in repository file count (currently 3,570
  tracked files) and `.git`/working-tree size (currently 328M/179M).
  **Baseline measurement needed:** `du -sh .` and `find . -type f | wc -l`, both already
  captured in this session as the baseline (328M / 179M / 3,570 files).
  **Measurement method:** Re-run the same `du -sh` / `find ... | wc -l` commands after
  deletion.
  **Dependencies:** The cross-reference-safety grep described in `DISC-001`'s
  verification recipe must pass first.
  **Verification criteria:** `npm --prefix frontend run build` still succeeds
  (confirms no live dependency on the deleted tree existed).

### Threats
- **Threat:** A developer or CI job runs `npx vite build` (or `npm install && npm run
  build` without the `--prefix frontend` qualifier) from the repository root, silently
  producing a build from the stale root `src/` tree instead of `frontend/`.
  **Trigger condition:** Presence of a fully-formed root-level `vite.config.js` +
  `index.html` (confirmed in this session) combined with a developer unfamiliar with the
  `--prefix frontend` convention.
  **Blast radius:** A stale, divergent build artifact could be manually or
  automatically mis-published if an operator does not notice it was not produced by
  `scripts/sync-dist.mjs`'s guarded pipeline.
  **Existing mitigation:** `scripts/sync-dist.mjs` validates its source is a *complete*
  Vite build and refuses to publish from a directory it did not itself resolve
  (`frontend/dist` only) — this mitigates the worst-case ("wrong app goes live")
  but does not prevent the *build* from happening or being manually copied elsewhere.
  **Evidence:** `DISC-001`; `RC-003` in `appendix/REFUTED-CANDIDATES.md`.
  **Recommended risk-reduction strategy:** Remove or rename the root-level
  `vite.config.js`/`index.html` so an accidental root-level build is not even possible.

---

## 2. UI/UX

### Strengths
- **An existing responsive visual-regression test baseline already exists**, evidenced by
  `frontend/tests/engine-responsive.spec.ts-snapshots/` being present in the repository
  (a Playwright snapshot directory is only created once a corresponding `.spec.ts` has
  actually been run and its output committed) — this indicates responsive-layout testing
  discipline already exists for at least the "engine" (AI settings) surface, even though
  this audit did not execute or inspect the snapshot contents itself (`RUNTIME
  VERIFICATION DEFERRED`).
- **A dedicated candidate-journey Playwright project exists** (`playwright.candidate.config.ts`,
  `frontend/tests/candidate/`, `npm run test:candidate`), indicating the single most
  product-critical user type (the job-seeking candidate) has isolated test tooling rather
  than being folded indiscriminately into a general suite.

### Weaknesses
- **No component-level UI/UX verification was possible within this engagement's budget**
  (see `UNVERIFIED-SUSPICIONS.md` UVS-004 and `UI-UX-AUDIT.md`). This is recorded as a
  weakness of *this audit's coverage*, not a confirmed weakness of the application's UI
  itself — the distinction matters and is preserved here deliberately per mandate §1.4.
- **51 numbered CV template folders exist in the legacy root tree** (`src/cv-templates/cv1`
  … `cv51`) with no equivalent count verified for `frontend/src/cv-templates/` in this
  session — if the active app has fewer maintained templates than the legacy count
  implies, that would be a user-facing feature-parity regression; **not confirmed, see
  `UNVERIFIED-SUSPICIONS.md`.**

### Opportunities
- **Opportunity:** Run the existing `engine-responsive.spec.ts` suite and the
  `test:candidate` suite in an authorized runtime environment to convert this audit's
  `RUNTIME VERIFICATION DEFERRED` UI/UX findings into actual pass/fail evidence.
  **Expected measurable delta:** A concrete pass/fail count at the five mandated viewport
  widths (375/390/768/1440/1920px) instead of "deferred."
  **Baseline measurement needed:** None — this is the first measurement.
  **Measurement method:** `npx playwright test engine-responsive.spec.ts` and
  `npm run test:candidate`, with `--reporter=html` for artifact capture.
  **Dependencies:** `ENVIRONMENT-GAPS.md` EG-001/EG-002 (needs a running app instance).
  **Verification criteria:** Report attached to the follow-up audit session.

### Threats
- **Threat:** Template-count or feature divergence between the legacy and active CV
  template sets goes unnoticed because no automated parity check compares them.
  **Trigger condition:** A user who previously had access to a legacy template (if the
  legacy tree was ever actually served — see `RC-003`, refuted as currently live, but not
  provably never-live historically) finds it missing from the active app.
  **Blast radius:** Unconfirmed — depends entirely on the unverified template-count
  comparison above.
  **Existing mitigation:** None identified.
  **Evidence:** Directory-count observation in `appendix/INVENTORIES/frontend.md` §2.
  **Recommended risk-reduction strategy:** A follow-up audit should diff the template
  *names/designs* (not just folder counts) between `src/cv-templates/` and
  `frontend/src/cv-templates/` (if the latter exists — not confirmed in this session,
  `frontend/src/cv-templates` was listed as a top-level directory in the original
  reconnaissance, confirming it exists, but its internal template count was not
  enumerated).

---

## 3. Security

### Strengths
- **Fail-closed credential disambiguation on the enterprise auth boundary.** A request
  presenting both a bearer token and an `x-api-key` is explicitly rejected with
  `400 AMBIGUOUS_CREDENTIALS` rather than the system picking one. Evidence:
  `backend/enterprise/enterpriseAuth.js` lines ~156-158 (quoted verbatim in
  `appendix/REFUTED-CANDIDATES.md` RC-002 context).
- **No client-exposed secret-by-provider-model variable found** across all `VITE_*`
  variables inspected (Firebase Web API key, Razorpay `key_id`, Google Maps
  browser-restricted key — each verified against that specific provider's own public-key
  design, not assumed safe by name pattern). Evidence: `appendix/INVENTORIES/environment-config.md`
  §2.
- **Webhook replay defense is applied before provider SDK event construction**, with an
  explicit `REPLAY_WINDOW_SECONDS` constant, per `backend/security/webhookGuard.js`'s
  exported symbols and the commit-message-level description in `backend/index.js`'s own
  code comments ("the replay window is enforced explicitly, and so a rejection never
  becomes a provider string in the body").
- **Narrow, pattern-anchored public-path allow-list** rather than a broad bypass — every
  public exception in `isPublicApiPath()` is either an exact string match or a specific
  anchored regex (e.g., exact token length/charset constraints on share tokens). Evidence:
  `appendix/INVENTORIES/security-tenant-isolation.md` §2.

### Weaknesses
- **`style-src-attr`/`style-src-elem` CSP directives allow `'unsafe-inline'`** (`DISC-006`),
  a defense-in-depth gap, even though `script-src` itself is strict.
- **Enterprise M2M tenant-restriction guarantee is documented in a code comment but not
  independently verified against the actual `authenticateServiceApiKey` implementation**
  in this session (`UNVERIFIED-SUSPICIONS.md` UVS-001) — a comment is evidence of intent,
  not proof of enforced behavior.
- **Production AI-provider credentials are, per the project's own documentation,
  unprovisioned as of the audited commit** (`DISC-004`), and the project's own governance
  trail (`DISC-003`) states a live security key-rotation drill (H.1) has never been
  executed in a target environment.

### Opportunities
- **Opportunity:** Close `UVS-001` by tracing `authenticateServiceApiKey` end-to-end and
  adding (if not already present) an automated test asserting that a crafted
  `x-tenant-id` header mismatched against a service key's bound tenant is rejected, not
  silently accepted.
  **Expected measurable delta:** Converts a `Medium`-confidence documented claim into a
  `High`-confidence, test-enforced invariant.
  **Baseline measurement needed:** Current test coverage of this exact function (search
  `backend/enterprise-test/` for a matching test name — not performed in this session).
  **Measurement method:** Code read + test-file grep.
  **Dependencies:** None.
  **Verification criteria:** A named test exists and fails if the restriction is removed
  (mutation-test-style check).
- **Opportunity:** Execute the H.1 security key-rotation drill package already committed
  at `developer-review/packages/h1-security-drill/` (inside the audited repo) in a real
  target environment.
  **Expected measurable delta:** Moves `DISC-003`'s "Security & cost-metering" dimension
  from the project's own self-declared `9.0` ceiling toward its stated `9.5` ceiling
  (+0.075 per the project's own weighting in `developer-review/ceiling-table-r17.md`).
  **Baseline measurement needed:** None — the package is described as "execution-ready."
  **Measurement method:** Follow the package's own `runbook.md` and
  `evidence-template.md`.
  **Dependencies:** A named human operator with target-environment access (per
  `HANDOVER-CLOSURE-2026-10-28.md` §4).
  **Verification criteria:** A dated, signed evidence artifact matching
  `expected-transcript.md`.

### Threats
- **Threat:** The enterprise M2M tenant-restriction comment in
  `enterpriseAuth.js` is aspirational rather than actually enforced in
  `authenticateServiceApiKey`.
  **Trigger condition:** A malicious or misconfigured M2M client sends a crafted
  `x-tenant-id` header.
  **Blast radius:** If confirmed, this would be a P0 (cross-tenant data access) per
  mandate §3.1 — **not confirmed by this audit; see UVS-001.**
  **Existing mitigation:** The documented design intent, plus the fact that the
  requesting value must still match (per the comment) — but this audit did not verify
  the match is enforced, not merely described.
  **Evidence:** `backend/enterprise/enterpriseAuth.js` lines ~1-13, ~160-176.
  **Recommended risk-reduction strategy:** Treat UVS-001 as the single highest-priority
  item for the next audit session, ahead of all P2/P3 findings in this package.

---

## 4. Scalability

### Strengths
- **Durable, MariaDB-backed quota/rate-limit counters are distinguished from in-memory
  ones in code structure** (`backend/security/inMemoryCounterStore.js` exists as a
  separate, named module from whatever durable counter backs
  `AI_BASIC_DAILY_LIMIT`/`AI_PREMIUM_DAILY_LIMIT`), suggesting an architecture-level
  awareness that in-memory counters do not survive multi-instance deployment — a
  positive scalability signal, though the durable counter's own implementation was not
  opened in this session (`DEFERRED`).
- **A distributed migration lock constant exists**
  (`LOCK_NAME = 'resumepilot:mariadb:schema-migrations'` in
  `backend/database/migrationRunner.js`), indicating awareness that migrations must be
  safe under multiple concurrently-starting app instances — relevant to any
  horizontally-scaled deployment.

### Weaknesses
- **N+1 query risk and pagination completeness were not assessed in this session**
  (`UNVERIFIED-SUSPICIONS.md` UVS-005) — this is an audit-coverage gap, not a confirmed
  performance defect, but it means no scalability claim can be made either way for the
  list-returning endpoints (`GET /api/resumes`, etc.) identified in
  `appendix/INVENTORIES/routes.md`.
- **A single, >7,580-line `backend/index.js`** co-locating route mounting with inline
  per-path middleware logic (e.g., the tenant-header-rejection gate, the public-path
  regex evaluation run on *every* request) means every request pays the cost of walking
  this file's full middleware chain regardless of which of the 20 routers ultimately
  handles it — a verified structural fact, though its actual latency impact was not
  measured (`DEFERRED`, no profiling tool was run).

### Opportunities
- **Opportunity:** Instrument and measure the per-request cost of the global `/api`
  middleware chain (public-path regex evaluation, rate-limit lookups, policy
  enforcement) under representative load.
  **Expected measurable delta:** A concrete p50/p95 latency number for the
  pre-router-dispatch portion of request handling.
  **Baseline measurement needed:** None exists yet in this audit or (as far as this audit
  found) in the repository's own prior documentation.
  **Measurement method:** APM/tracing span around the middleware chain in a staging
  environment; not performed in this session.
  **Dependencies:** `ENVIRONMENT-GAPS.md` EG-001 (needs a running instance + load
  generation, explicitly out of scope for this read-only audit).
  **Verification criteria:** A documented baseline exists for future regression
  comparison.

### Threats
- **Threat:** An unbounded (unpaginated) list endpoint degrades as per-user data volume
  grows (e.g., a power user with hundreds of saved resumes calling `GET /api/resumes`).
  **Trigger condition:** User data volume growth over time; no pagination parameters were
  observed in the `resumes.js` route signatures read in this session (`router.get('/', ...)`
  takes no query-parameter-based limit/offset in the code excerpt captured).
  **Blast radius:** Scoped to the `/api/resumes` list endpoint specifically, based on the
  one file read in depth; unknown for the other 19 route files.
  **Existing mitigation:** None observed in the code excerpt captured.
  **Evidence:** `backend/routes/resumes.js` line 21 (`router.get('/', async (req, res) =>
  { const resumes = await req.repository.getResumes(req.user.uid); ...`) — no limit/offset
  argument passed.
  **Recommended risk-reduction strategy:** Confirm actual per-user resume volume
  expectations with product, and add pagination to `getResumes` if volumes can plausibly
  exceed a few hundred records per user.
