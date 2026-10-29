# Repair Action Plan

For a future implementation developer. These are **instructions for later execution**,
not actions taken during this audit. No task below has been implemented.

---

## Phase 1 — P0 blockers

**None confirmed in this audit's scope.** No P0 (auth bypass, cross-tenant data access,
exposed secret, confirmed data-loss path, crash on a primary journey) was confirmed with
direct evidence during this session. This is **not** a claim that no P0 exists anywhere
in the application — see `UVS-001` (potential tenant-isolation issue, unverified) which,
if confirmed in a follow-up session, would immediately become the single Phase-1 task.

**Conditional Task P0-0 (contingent):**
- **Task ID:** P0-0
- **Related DISC ID:** None yet — tied to `UVS-001` pending confirmation
- **Problem statement:** IF `authenticateServiceApiKey` (location: search
  `backend/enterprise/` for its definition) is found to use a client-supplied
  `x-tenant-id`/`x-workspace-id` value as anything other than a restrict-only equality
  check against the API-key-derived tenant, THEN this is a cross-tenant data access P0.
- **Affected files:** `backend/enterprise/enterpriseAuth.js`, and the
  as-yet-unlocated file defining `authenticateServiceApiKey` (likely under
  `backend/enterprise/tenantService.js` or similar, per the `createTenantService` import
  seen in `backend/index.js`).
- **Owner lane:** Security + Backend
- **Estimated effort:** S (to trace and confirm/refute), L (if confirmed and a fix is
  required)
- **Acceptance criteria:** A new automated test proves a mismatched `x-tenant-id` header
  is rejected (`403`/`404`), not honored.
- **Verification recipe:** Add/locate a test that calls the M2M-authenticated endpoint
  with a valid API key for Tenant A and an `x-tenant-id` header for Tenant B; expect
  rejection.
- **Do-Not-Restore warning:** N/A — not a reference-baseline issue.

---

## Phase 2 — P1 critical and P2 high-priority issues

### Task 2.1 — Close the three human-gated release bars and provision AI provider credentials

- **Task ID:** P1-1
- **Related DISC ID:** DISC-003, DISC-004
- **Problem statement:** The project's own governance trail declares a 9.3/10 ceiling
  (explicitly not a freeze declaration) with three unexecuted human-gated verification
  packages (H.1 security drill, H.2 mesh-alias promotion, H.3 production observation) and
  unprovisioned production AI-provider credentials (Groq, Gemini, OpenRouter).
- **Affected files:** `developer-review/packages/h1-security-drill/`,
  `developer-review/packages/h3-production-observation/` (inside the audited repo),
  target-environment `backend/.env` (not in source control).
- **Owner lane:** Infrastructure + Security (named "Project Lead"/"Database
  Administrator" per the project's own closure doc)
- **Estimated effort:** L (coordination/scheduling), though the project's own estimate
  for the technical execution itself is "<30 min each for H.1-H.3"
- **Dependencies:** Requires a target staging/production-like environment and named
  human owners, per `HANDOVER-CLOSURE-2026-10-28.md` §4.
- **Implementation risks:** Running a live security drill against a real environment
  carries inherent operational risk; follow the committed runbook
  (`developer-review/packages/h1-security-drill/runbook.md`) exactly.
- **Acceptance criteria:** Dated, signed evidence artifacts exist matching each
  package's `expected-transcript.md`/`evidence-template.md`; all three AI provider keys
  resolve to a healthy status.
- **Verification recipe:** See DISC-003/DISC-004 verification recipes.
- **Rollback considerations:** N/A — these are verification activities, not code changes;
  no rollback needed unless the drill itself triggers an unexpected side effect (follow
  the runbook's own rollback section).
- **Do-Not-Restore warning:** N/A.

### Task 2.2 — Trace and confirm/refute the M2M tenant-restriction implementation (UVS-001)

- **Task ID:** P1-2
- **Related DISC ID:** None (currently `UVS-001`) — promote to a DISC entry immediately
  upon confirmation either way.
- **Problem statement:** See Phase 1 Task P0-0 — this is the investigation step that
  precedes it.
- **Affected files:** `backend/enterprise/enterpriseAuth.js`,
  `backend/enterprise/` (tenant service module, to be located).
- **Owner lane:** Security
- **Estimated effort:** S
- **Dependencies:** None.
- **Implementation risks:** None (read-only investigation).
- **Acceptance criteria:** A written, evidence-backed conclusion (REFUTED or CONFIRMED)
  is added to either `appendix/REFUTED-CANDIDATES.md` or `DISCREPANCY-LOG.md`.
- **Verification recipe:** Full read of `authenticateServiceApiKey` plus a targeted test
  as described in Task P0-0.
- **Rollback considerations:** N/A.
- **Do-Not-Restore warning:** N/A.

### Task 2.3 — Resolve the dual-frontend-tree ambiguity (DISC-001)

- **Task ID:** P2-1
- **Related DISC ID:** DISC-001
- **Problem statement:** See DISC-001 in full.
- **Affected files:** `index.html`, `vite.config.js`, `src/` (repo root).
- **Owner lane:** Frontend
- **Estimated effort:** M (mostly verification before a one-line deletion commit)
- **Dependencies:** Must run the cross-reference-safety grep from DISC-001's verification
  recipe first.
- **Implementation risks:** Low if the cross-reference check passes; if it fails, this
  becomes an extraction task instead (estimate would change to L).
- **Acceptance criteria:** `npm --prefix frontend run build` still succeeds after
  deletion/archival; `git grep` for cross-tree imports returns zero matches.
- **Verification recipe:** See DISC-001.
- **Rollback considerations:** Trivial — `git revert` the deletion commit if an
  unexpected dependency surfaces post-merge.
- **Do-Not-Restore warning:** Do not restore the root `src/` tree as "the frontend" in any
  future rewrite without first confirming which tree (root vs. `frontend/`) is intended
  to be canonical going forward — this ambiguity is exactly what created DISC-001 in the
  first place.

### Task 2.4 — Complete the backend route-level parity comparison (UVS-002 and the 19
deferred rows in `appendix/PARITY-MATRIX.md`)

- **Task ID:** P2-2
- **Related DISC ID:** None yet (UVS-002); may produce new DISC entries.
- **Problem statement:** Only 1 of 20 active route files (`resumes.js`) received a
  file-existence + line-count comparison against `reference-code/backend/routes/`; none
  received a full behavioral diff.
- **Affected files:** All files in `backend/routes/` vs. `reference-code/backend/` (and
  any files `reference-code/backend/` contains that have no active counterpart).
- **Owner lane:** Backend + QA
- **Estimated effort:** L (20 files, full behavioral comparison each)
- **Dependencies:** None.
- **Implementation risks:** None (read-only comparison); risk lies in whatever is found,
  to be assessed per-finding once discovered.
- **Acceptance criteria:** `appendix/PARITY-MATRIX.md` reaches 20/20 = 100% coverage with
  an explicit divergence classification per route.
- **Verification recipe:** For each route, compare request validation, response shape,
  status codes, and side effects per mandate §5.1; write the result as a new row.
- **Rollback considerations:** N/A (documentation task).
- **Do-Not-Restore warning:** For any row classified `REFERENCE-DEFECT`, explicitly note
  it in the resulting documentation so no future "restore from reference-code" action
  accidentally reintroduces it.

### Task 2.5 — Trace AI provider failover/timeout/retry behavior (UVS-003)

- **Task ID:** P2-3
- **Related DISC ID:** None yet (UVS-003).
- **Problem statement:** The HEAD commit itself just fixed one code/status contradiction
  in this exact subsystem (`backend/freellmapi/`), raising the prior probability of
  adjacent issues; the subsystem was not traced in this session.
- **Affected files:** `backend/freellmapi/agent/`, `backend/freellmapi/services/`,
  `backend/freellmapi/providers/`, `backend/services/aiRuntime.js`.
- **Owner lane:** Backend
- **Estimated effort:** M
- **Dependencies:** None.
- **Acceptance criteria:** A documented fallback-order, timeout, and retry-policy table
  exists per provider, cross-referenced against `backend/test/` files that assert this
  behavior.
- **Verification recipe:** Static trace + review of corresponding tests under
  `backend/test/` (filenames referencing `ai-routing`/`freellmapi` — not enumerated in
  this session, search for them first).
- **Rollback considerations:** N/A (investigation task).
- **Do-Not-Restore warning:** N/A.

### Task 2.6 — Reconcile the two differing test-pass-count figures found in the
repository's own prior documentation (see `appendix/INVENTORIES/tests.md`)

- **Task ID:** P2-4
- **Related DISC ID:** None yet.
- **Problem statement:** `HANDOVER-CLOSURE-2026-10-28.md` states 1,356/1,356 backend
  tests passing; `ceiling-table-r17.md` (two days earlier) states 1,334/1,334. Both are
  inside the audited repo's own `developer-review/` folder.
- **Affected files:** N/A (documentation reconciliation) — actionable step is to actually
  run `npm --prefix backend test` on the current `main` tip and record the real number.
- **Owner lane:** QA
- **Estimated effort:** S
- **Acceptance criteria:** A single, current, reproducible pass-count figure is recorded
  for the exact commit under test.
- **Verification recipe:** `npm --prefix backend test` in an authorized environment;
  record exit code and summary line.
- **Rollback considerations:** N/A.
- **Do-Not-Restore warning:** N/A.

---

## Phase 3 — P3 improvements

| Task ID | Related DISC ID | Problem | Owner lane | Effort |
|---|---|---|---|---|
| P3-1 | DISC-002 | Reconcile "my-app"/"IME365"/"ResumePilotAi"/"resumepilot" naming across `package.json`, `CLAUDE.md`, `frontend/index.html`, `.env.example` | Frontend/Docs | S |
| P3-2 | DISC-005 | Add `engines.node` to all three `package.json` files | Infrastructure | S |
| P3-3 | DISC-006 | Inventory inline `style=` usage in `frontend/src`, then tighten CSP `style-src-attr`/`style-src-elem` away from `'unsafe-inline'`, adding `report-uri`/`report-to` first to observe safely | Frontend/Security | M |
| P3-4 | DISC-007 | Remove compiled bundles and the `.zip` archive from `reference-code/`, keeping source only (or clearly label a dated snapshot directory) | Backend/Docs | S |
| P3-5 | (UVS-004 follow-up) | Build the state-completeness matrix (loading/empty/error/disabled/success) for the 11 screens listed in `UI-UX-AUDIT.md` §2 | Frontend/QA | L |
| P3-6 | (UVS-005 follow-up) | Audit `backend/repositories/` for N+1 query patterns and missing pagination, starting with `GET /api/resumes` | Backend/Database | M |
| P3-7 | (§3 `routes.md` observation) | Confirm whether the duplicate `/api/enterprise`, `/api/enterprise/m2m`, `/api/platform` mount calls in `backend/index.js` are intentional layering or dead duplication | Backend | S |


---

## Phase 4 — Actions created by the runtime verification pass (2026-10-28)

These are new, evidence-backed items discovered by **executing** the application
(`BROWSER-VERIFICATION-REPORT.md`, `TEST-EXECUTION-REPORT.md`). Nothing here was
implemented — the audit remains read-only with respect to application code.

### P4-1 — Fix five WCAG 2.1 AA violations on landing + pricing (DISC-008 / A11Y-001…005)

| Sub-task | File:line | Change | Effort |
|---|---|---|---|
| A11Y-001 | `frontend/src/pages/landing.tsx:239` | give the star row `role="img"` + `aria-label="5 out of 5 stars"`, or `aria-hidden` the icons and add visually-hidden text | S |
| A11Y-002 | `landing.tsx:79`, `:296` | include the visible brand text in the accessible name (or drop `aria-label` and rely on the visible text) | S |
| A11Y-003 (**critical**) | `pages/billing/pricing.tsx:264-272` | add `aria-label="Annual billing"` (or `aria-labelledby` pointing at the "Monthly Billing"/"Annual" label) to the `role="switch"` button | S |
| A11Y-004 | `pricing.tsx:285`, `:335` | raise contrast: `#009966`→ darker emerald (≥ 4.5:1 on the badge background) and `text-ink-muted/60` → `text-ink-muted` (2.45:1 → target ≥ 4.5:1) | S |
| A11Y-005 | `pricing.tsx:384` | `tabIndex={0}` + `role="region"` + `aria-label` on the `overflow-x-auto` wrapper, or provide the table in a keyboard-navigable form | S |

Verification after fix: re-run `developer-review/tools/audit-browser-verification.spec.ts`
and require zero violations in `Evidence/artifacts/axe-violation-details.json`.

### P4-2 — Stop the accessibility suite from silently testing the login page (DISC-012)

`frontend/tests/accessibility.spec.ts` sets `localStorage.ime_dev_user`, which the router
guard does not honour; every "Candidate Dashboard / Employer Portal / Admin Console /
Enterprise Console" scan therefore runs against `/login`. Fix: authenticate via
`POST /api/auth/preview-login` (the app's own non-production issuer, already used by
`engine-security.spec.ts`) and assert `expect(page).not.toHaveURL(/\/login/)` before
scanning. Effort: M. **This is the highest-value QA fix in the package** — it converts
green-but-empty coverage into real coverage.

### P4-3 — Remove the hardcoded port in `freellmapi-admin-e2e.spec.ts` (DISC-011)

The spec navigates to `http://localhost:5173` while `playwright.config.ts` starts the app
on `:4000` with `baseURL` set. Use `baseURL`-relative navigation (or read
`process.env.E2E_BASE_URL`). Effort: S. Until fixed, this 47-test suite cannot pass under
the repository's documented command in **any** environment.

### P4-4 — Make the test-count claim reproducible (DISC-009)

Delete/replace the "1,356 tests" claim with the reproducible figure produced by
`cd backend && node scripts/run-tests-with-annotations.js` (1,315 discovered / 1,271 pass
at this revision) and publish the command next to the number. Effort: S.

### P4-5 — Correct the "MySQL / MariaDB compatible" claim in the baseline migration (DISC-010)

`001_baseline.sql`'s header claims MySQL compatibility; `002`+ use `ADD COLUMN IF NOT
EXISTS` (MariaDB-only). Either amend the header to state MariaDB ≥ 11.4 as the sole
supported engine, or make later migrations portable. Effort: S (documentation) / L (portability).

### P4-6 — Establish a repeatable MariaDB-backed verification lane (GAP-D1)

The single largest remaining evidence gap. Requirement: a disposable MariaDB 11.4
instance (CI service container or a `mariadb:11.4` ephemeral job) with
`RUN_MARIADB_INTEGRATION=true`, `MARIADB_TEST_ALLOW_RESET=true`, a `DB_NAME` containing
`test|ci|cert|sandbox|scratch`, then:

```bash
npm --prefix backend test                 # un-skips 30 tests, converts 14 failures
npm --prefix backend run test:enterprise
cd frontend && npx playwright test        # unblocks engine-responsive/authenticated + candidate suites
```

Expected outcome: 30 skips become executions, the 14 DB-gated failures resolve or turn
into real defects, and the candidate dashboard suite (175 tests) becomes runnable.
Effort: M (infrastructure), no application change.

### P4-7 — Restore font parity for visual regression (GAP-B2)

`fonts.googleapis.com` was unreachable in the verification sandbox, so 20/20 screenshot
comparisons differ by 3–7 %. Either self-host the fonts (removes a third-party runtime
dependency and a CSP source) or pin the baselines to an environment with font access.
Effort: S–M.

### Revised sequencing with the runtime evidence in hand

1. **P4-2** (DISC-012) and **P4-3** (DISC-011) first — they repair trust in existing test
   results and cost hours, not days.
2. **P4-1** (A11Y-003 is axe-critical) — small diffs, user-visible, gate-able in CI with
   axe.
3. **P4-6** — infrastructure lane so the 30 MariaDB-gated tests stop being dark.
4. **P4-4 / P4-5 / P4-7** — cheap documentation/environment hygiene.
5. Then re-enter Phase 1 (P0/P1) items from the original plan, which this pass neither
   confirmed nor refuted.

---

## Sequencing recommendation for the next developer

1. Start with **Task P1-2 / P0-0** (tenant-isolation trace) — highest possible severity if
   confirmed, lowest cost to investigate.
2. Then **Task P1-1** (release-gate closure) — this is largely a scheduling/coordination
   task for named human owners, so it can run in parallel with engineering work.
3. Then **Task P2-4** (re-run the test suite once, get one authoritative number) — cheap,
   unblocks confidence in every other claim in this package that referenced test counts.
4. Then **Task P2-2** (full route parity) and **Task P2-3** (AI provider tracing) in
   parallel if two engineers are available.
5. **Task P2-1** (dual-frontend cleanup) can happen any time — it is low-risk and
   independent of everything else.
6. Phase 3 items are backlog-appropriate and do not block any release decision.

---

## Phase 5 — Capability-parity remediation (added by the 2026-10-29 re-audit)

Ordering is by severity × cost. The first phase is unusually cheap because **the backend already
exists** for every item in it (see `LEGACY-MODERN-FEATURE-INVENTORY.md` §6).

### Phase 5.1 — P0: stop presenting fabricated state (highest severity, lowest cost)

| # | Action | Evidence of defect | Endpoint to wire |
|---|---|---|---|
| R-A5-01 | Wire or remove `AdminSecurityTab` event stream | 0 API refs, invented principals/IPs/paths | `GET /api/platform/security-events` |
| R-A5-02 | Wire or remove operator roster + revoke-sessions | toast asserts a revocation that never happens | `GET/POST /api/platform/operators`, `POST …/:uid/revoke-sessions` |
| R-A5-03 | Wire or remove announcement publisher, IP blocklist | 0 API refs; no backend for IP blocklist → remove the control | `GET/POST/PATCH/DELETE /api/platform/announcements` |
| R-A5-04 | Wire or remove marketing-content tab (phrases, reviews, trusted-by, pages) | 16 invented records incl. 5 real brand names | `/api/phrases`, `/api/admin/reviews`, `/admin/trusted-by`, `/admin/pages` |
| R-A5-05 | Wire or remove attention inbox | 0 API refs | `GET /api/platform/attention` |
| R-A5-06 | Remove fabricated KPI/health fallbacks or label them as sample data | `?? '48,290'`, `'99.8%'`, `'100% Enforced'` | `/platform/stats`, `/platform/operational-status` |
| R-A5-07 | Stop swallowing moderation write failures | `.catch(() => {})` at `AdminModerationTab.tsx:152,167,184` | same |

**Acceptance:** a grep for `?? '` on fabricated literals in admin tabs returns nothing; every admin
mutation has an error branch that surfaces failure; each panel has an explicit empty state.

### Phase 5.2 — P1: restore capabilities whose backend already exists

| # | Action | Notes |
|---|---|---|
| R-A5-08 | Admin audit-log browser | `useAdminAuditLogs` already defined, unused; `/admin/audit-logs` is permission-guarded and tested |
| R-A5-09 | Coupon CRUD | `/api/admin/coupons` implemented; only a feature flag references coupons today |
| R-A5-10 | Refunds / invoices / payment-order administration | `/admin/payments/refund`, `/invoices`, `/payment-orders`; also `POST /invoice/generate` |
| R-A5-11 | Payment-webhook inspection + replay | `/platform/payment-webhooks`, `/:id/replay` — currently orphaned |
| R-A5-12 | Email operations surface | `/email/logs`, `/email/resend`, `/email/templates`, `/email/admin/test-imap`, `/email/admin/circuit-breaker-status` |
| R-A5-13 | Platform tenant registry + decommission | `/platform/tenants/:id` (GET/PATCH), `/decommission`, `/garbage-collect` |
| R-A5-14 | Enterprise bulk member actions with partial-failure reporting | port `EnterpriseUsersTab.jsx:251-297` semantics |

### Phase 5.3 — P1: restore capabilities with no backend dependency

| # | Action | Notes |
|---|---|---|
| R-A5-15 | Voice interview (TTS + optional STT + waveform) | 2,432 legacy lines; browser-only; `/live-interview/sessions/:id/turns` already accepts text |
| R-A5-16 | Internationalisation | 16 locales / 1,011 keys exist in `src/locales`; reintroduce i18n and port keys |
| R-A5-17 | Legacy portfolio migration path | `isWebCvDocument()` gate must accept or convert block content; otherwise document an export-to-recreate path |
| R-A5-18 | Command palette (⌘K) + fuzzy entity search | `fuzzyRank.js` is directly portable; 1,527 lines to recover |
| R-A5-19 | Bullet-quality coaching | `src/utils/bulletQuality.js`, 6 consumers |

### Phase 5.4 — P2: wiring and small surfaces

R-A5-20 job-map/location autocomplete (`lib/autocomplete-service.ts` already exists, unused by jobs) ·
R-A5-21 image crop (`ImageCropModal.jsx`) · R-A5-22 QR codes · R-A5-23 employer onboarding ·
R-A5-24 next-steps checklist · R-A5-25 per-route SEO + JSON-LD + OG images (`/public/jobs/:id/og.png`
already exists) · R-A5-26 GA4 instrumentation (`GA4Provider.jsx`) · R-A5-27 service worker ·
R-A5-28 privacy-consent banner · R-A5-29 global toast/live-region · R-A5-30 HUD, density, mascot.

### Phase 5.5 — P3: decision records

For each of the 30 `MISSING` capabilities, record either "restore" or an approved retirement note. An
undocumented removal stays indistinguishable from loss, which is why `INTENTIONAL RETIREMENT` has zero
entries in `FEATURE-PARITY-MATRIX.md`.

### Sequencing

5.1 → 5.3 (voice, i18n) → 5.2 → 5.4 → 5.5. Phase 5.1 is a *removal* exercise as much as a build
exercise and should not wait for anything. Nothing in Phases 5.1–5.3 requires a schema migration.

---

## Phase 6 — V7 additions (`8a6e03bb`): repair the contract before building anything

Phase 5 assumes each broken surface needs a feature. V7 shows that most of them need a **retarget**, and
that the console must first stop asserting success it cannot verify. Do this phase before 5.1: its first
two items are deletions, and everything else is cheaper once the console stops lying.

### 6.1 P0 — stop fabricating success (no backend work required)

| # | Action | Exact site |
|---|---|---|
| R-A6-01 | Delete every `.catch(() => {})` / `catch { /* Keep baseline */ }` that is followed by a success state, and mutate local state only after a 2xx | 12 sites listed in `M7-CAPABILITY-CLOSURE.md` §4; detector `client-contract-audit.cjs` → `successAfter` |
| R-A6-02 | Delete the fixture seeds in the three admin tabs and render explicit empty/error states | `AdminModerationTab.tsx:58,81`; `AdminHelpDeskTab.tsx:47` (and the `length > 0` guard at `:128-137`); `AdminUsersTab.tsx:68` |
| R-A6-03 | Remove the two dead fallback URLs in the queue console (the primary calls are correct) | `AdminQueuesTab.tsx:138,173` → keep `/api/platform/queues*` only |
| R-A6-04 | Remove the hardcoded promo constants; call the real validator | `checkout-modal.tsx:255-264` (see R-A6-08) |

### 6.2 P0 — retarget clients at operations that already exist

| # | Action | From → to |
|---|---|---|
| R-A6-05 | Employer approval/rejection | `POST …/verify {decision}` → `PATCH /api/admin/employer-applications/:uid {status, expectedStatus, reason}` (`backend/index.js:6440`) |
| R-A6-06 | Job spam flagging | `POST /admin/jobs/:id/moderate {isSpam,status:'flagged'}` → `PATCH /api/admin/jobs/:jobId {status}` with a real status (`:6886`) |
| R-A6-07 | User suspension | `POST /admin/users/:id/status` → `PATCH /api/admin/users/:uid {suspended:boolean}` (`routes/adminUsers.js:673`) |
| R-A6-08 | Coupon validation | `POST /api/billing/validate-coupon` → `POST /api/coupons/validate` (`backend/index.js:4597`) |
| R-A6-09 | Public job listing | `GET /jobs` → `GET /api/jobs-data` (`routes/jobsData.js:159`) |
| R-A6-10 | Blog list/read/write/delete | `/blog/posts*` → `/api/admin/blog/posts*` (`backend/index.js:3388/3408/6424`) and `/api/blog-data*` (`routes/blogData.js:35,85,96,106`); note there is **no create route** — creation is an upsert through `POST /api/blog-data/:id`, so the editor must mint an id |
| R-A6-11 | Enterprise platform status | `/api/platform/status` → `/api/admin/platform/status` (`routes/adminPlatformOperations.js:533`) |
| R-A6-12 | Feed the moderation tab from the server | call `GET /api/admin/employer-applications` (`:6279`) and `GET /api/admin/jobs` (`:6300`); both are registered and reachable and currently unused |

### 6.3 P1 — build what really is absent

| # | Action | Evidence |
|---|---|---|
| R-A6-13 | Backup operation (or remove the button) | no route creates a snapshot; only `GET /api/platform/backup-status` exists |
| R-A6-14 | Cache-invalidation operation (or remove the button) | no cache route exists in `backend/` |
| R-A6-15 | Dead-letter purge: keep the refusal, remove the fake success | `POST /platform/queues/purge` answers `410` deliberately; bulk replay answers `400 BULK_REPLAY_FORBIDDEN` (`routes/databaseAdmin.js:157`) |
| R-A6-16 | Employer→candidate email on transition | `/notify/email` has no route; `services/emailNotifier.js` is imported at `index.js:14` and never called. Either wire it into a transition or use the in-app message channel |
| R-A6-17 | Photo pipeline that fits the body budget | 5 MB client cap vs `express.json({limit:'256kb'})` (`index.js:316`) — downscale client-side or upload out-of-band |

### 6.4 P2 — capability restorations confirmed by V7 (additions to Phase 5)

R-A6-18 per-route SEO metadata (FP-G05) · R-A6-19 service worker / offline shell (FP-G06, positively
confirmed absent) · R-A6-20 consent surface (FP-G12) · R-A6-21 dunning banner (FP-D14) · R-A6-22 candidate
resume download in the review drawer and enterprise review (FP-F11, FP-B09) · R-A6-23 enterprise workspace
assignment (FP-B02) · R-A6-24 bullet-editor undo / passive-opener fixer / quick-metric injection (FP-E01,
FP-E14 — the section-level analyzer already exists, so this is the per-bullet half) · R-A6-25 portfolio
section library (FP-C02/FP-C06) · R-A6-26 interview snippet reuse + session export (FP-D01, FP-D03) · R-A6-27
rich blog authoring (FP-G09: insert image/link, auto-excerpt) · R-A6-28 job filters: industry, seniority,
work mode, reset-all, paging (FP-F10).

### 6.5 Acceptance for Phase 6

Phase 6 is done when: `client-contract-audit.cjs` reports **0** `successAfter` sites and **0**
`NO_REGISTERED_OPERATION`; `client-call-existence.cjs` reports 0 `MISSING`; the three admin tabs contain no
fixture constant; and every retargeted control has a Playwright spec asserting its failure path (the R-specs
in `RUNTIME-TEST-HARNESS-M7.md` are the starting point). No application change was made by this audit; the
phase is a specification for whoever is authorised to edit the product.

---

## Phase 7 — M8 additions (`a2ecb96`): four product repairs and one provenance repair

Added by Mandate 8 after independently re-reading the M7 evidence. Every row below is a **specification**;
no application file was touched by this audit. Rows are numbered separately from Phase 6 so that the two
never collide, and each cites the discrepancy it closes.

| # | Priority | Action | Exact site | Closes |
|---|---|---|---|---|
| R-A8-01 | **P1** | POST the enquiry to `/api/contact` and render the success card only on `202`; render the server's error text on 4xx/5xx; keep the honeypot field | `frontend/src/pages/cms/index.tsx:234-243` (handler), success card `:288-300`; backend contract `backend/index.js:2360-2387` | DISC-050 |
| R-A8-02 | **P1** | Point the jobs page at `/api/jobs-data`, **and** add `q` / `location` / `type` predicates in the repository (parameterised) — or delete the controls and say so | `frontend/src/pages/jobs/portal.tsx:61-81`; `backend/routes/jobsData.js:159-172`; `MySQLRepository.js:1153-1176`, `InMemoryRepository.js:402-425` | DISC-051 |
| R-A8-03 | **P2** | Replace the hand-rolled create-ticket modal with the existing `Dialog` primitive (focus trap, Escape, scroll lock, focus return) or hand-implement all four | `frontend/src/pages/dashboard/support.tsx:353-372`; primitive at `frontend/src/components/ui/dialog.tsx:1-8` | DISC-052 |
| R-A8-04 | **P3** | Reinstate one shared unread query with a coalesced interval and a backoff ladder that honours `Retry-After`; derive the nav badge from it; never treat a failed poll as "stop polling" | `frontend/src/hooks/use-api-hooks.ts:532-539`; `pages/dashboard/messages.tsx:146`, `components/dashboard/conversation-thread.tsx:54`; legacy design `src/hooks/unreadMessagesPoller.js:1-30` | DISC-053 |
| R-A8-05 | **P3** (audit-internal, not product) | Restore a real preservation mechanism for the foreign base if one is still wanted — create the ref **and** date it, or delete the claim from the package | `M7-CAPABILITY-CLOSURE.md:7`, `FINAL-AUDIT-HANDOVER.md:152`; measured state in `DISCREPANCY-LOG.md` DISC-049 | DISC-049 |
| R-A8-06 | **P1** | Implement `updateTeam` / `archiveTeam` / `restoreTeam` on `MySqlTenantRegistry` (tenant-scoped `WHERE`), add `leadPrincipalId` + `status` to `enterprise_teams` in a new forward migration, pass `leadPrincipalId` through `createTeam`, and add one regression test that runs against the MySQL registry (or a shared contract both registries satisfy) so the double can no longer mask the gap | `backend/enterprise/mysqlTenantRegistry.js` (missing three methods, cf. `:1472-1482` createTeam), `backend/enterprise/tenantService.js:890-932`, `backend/routes/enterprise.js:693-718`, `backend/database/migrations/001_baseline.sql:823-831`, test double `backend/test/helpers/inMemoryTenantRegistry.js:580` | DISC-054 |

**Note on R-A8-05:** this is the only row that is *about the audit* rather than the product. It is listed
because leaving a false provenance claim in a package whose purpose is to be trusted is itself a defect.
The ref was **not** created by M8: creating it now would misrepresent when it existed.

**Sequencing:** R-A8-01 and R-A8-02 are the two P1s and both are small — one request plus one retarget, and
one repository predicate set. They belong with Phase 6.1/6.2 rather than after it, because both are
*false-success* defects of the same class. R-A8-03 reuses a dependency that is already installed
(`@radix-ui/react-dialog`), so its cost is a rewrite of one component body. R-A8-04 is the only one that
needs design work: cadence, backoff and badge ownership have to be decided once, centrally.

**Acceptance for Phase 7.** With the backend running: one submitted contact enquiry produces exactly one
`POST /api/contact` and one stored row, and the success card appears only after the `202`; a jobs filter
changes the **server** result set (verified in the request log, not visually); the ticket modal closes on
Escape when idle but not mid-submit, traps Tab, and returns focus to its opener; an unread count arriving
while the user is on `/dashboard` updates the badge without a navigation, and a simulated `429` with
`Retry-After: 60` delays the next poll by 60 s instead of stopping it.
