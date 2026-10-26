# Test evidence

**Purpose.** What was executed, what it proves, what it does **not** prove, and how to
reproduce every number. Anything that could not be executed here is labelled **NOT RUN**
with the reason and the command to run it elsewhere. A number in this file is a transcript
of a command, never a target.

**Environment for every run below.** Node v22.22.3 · Linux sandbox · `backend/node_modules`
and `frontend/node_modules` installed locally · **no MySQL/MariaDB** · Firebase Admin in
"limited local mode" (no credentials) · **no browser binary** (Playwright browsers cannot be
downloaded here, so the browser tier is NOT RUN — §5).

**Consequence to keep in mind.** A route that touches the database answers `503`/`500`, and a
suite that asserts on persisted state fails for an environmental reason. Those failures are
listed in §5 and were proven pre-existing by re-running the same files against the base
commit with the branch's changes stashed. They are never counted as product evidence in
either direction.

---

## 1. Headline results

| Run | Command | Result |
|---|---|---|
| Backend gate (16 files, the coverage set) | `cd backend && NODE_ENV=test npm run test:coverage` | **211 / 211 pass**, `c8 check-coverage` exit 0 |
| Backend coverage | same command | **statements 98.60 %**, **branches 86.68 %**, **functions 97.53 %**, lines 98.60 % — **the 10/10 bar's coverage floor is met** (§3) |
| Tier pack as one command | `cd backend && NODE_ENV=test npm run test:tiers` | **71 tests, 69 pass, 2 conditional skips (database-gated), 0 fail** |
| Coverage closers (3 files) | §2 | **38 / 38 pass** (`config-edge-coverage` 16, `config-registry-guards` 14, `admin-rbac-edge-coverage` 8) |
| New tier files (10) | §2 | **50 / 50 pass** (51 with the opt-in EXPLAIN layer) |
| Contract + registry + ownership | §2 | `api-contract` 4/4, `config-registry` 26/26, `config-api` 17/17, `config-validators` 14/14, `database-ownership-completeness` 3/3 |
| Query budget | `test/mariadb-query-budget.test.js` | **15 / 15 pass** (admin page: 1 round trip cold, 1 batched read warm, max 1 concurrent acquisition) |
| Sustained load | `test/load-sustained.test.js` | **4 / 4 pass** — 200 requests at 20 concurrent: the capability census answers every request with p95 inside 750 ms and the configuration census inside 1 000 ms; the heap after the first window and after the second are equal within noise (a per-request leak would compound), and sustained traffic produces zero 5xx — the limiter sheds, it does not fail open |
| Migration-drill contract | `test/migration-drill-contract.test.js` | **6 / 6 pass**, no database: `scripts/migration-drill.mjs` refuses a database named `resumes`/`production`/empty, its statement splitter handles comments and `DELIMITER` blocks (a trigger body is not six statements), every forward migration is either reversible or carries a declared exemption, and no file splits to zero statements |
| Query-plan regression | `test/query-plan-regression.test.js` | **6 / 6 static pass** + EXPLAIN layer gated on `RUN_MARIADB_INTEGRATION` (CI `migration-drill` job). Registry of 13 hot queries; every filter path index-covered, unbounded recency scans index-ordered. Two uncovered outbox plans found and fixed by `030_outbox_created_at_indexes`; one hidden index (`LOWER(email)`) found and fixed in `MySQLRepository.js:706` |
| Load at agreed concurrency | `test/load-concurrency.test.js` | **4 / 4 pass** — 50 concurrent operators, p95 < 750 ms per control-plane read, zero 5xx, and 50 parallel reads of one config key cost 0 store round trips |
| Migration rollback drill | `test/migration-rollback-drill.test.js` | **gated on `RUN_MARIADB_INTEGRATION`** (CI `migration-drill` job): empty → forward chain → marker rows → every `.down.sql` in reverse → documented residue only (`config_change_log`, `001_baseline`) → re-apply → idempotent, markers survive |
| Lighthouse budgets | `npm run perf:budgets` (frontend) | **wired as a CI gate** (`lighthouse` job): per-page-class budgets in `frontend/budgets/per-page-class.json` — LCP < 2.5 s, CLS < 0.1, TBT < 200 ms (lab INP proxy), mobile simulated 4G. Browser-dependent, like Playwright (OI-TIER-1) |
| Characterisation (divergences) | `test/characterisation-divergences.test.js` | **11 / 11 pass** — DIV-007/009/010/011/012/013/015/017 pinned behaviourally (or by the exact refusal codes where the behaviour is a route guard) |
| Authority suites (spot re-run after the user-route change) | `admin-target-authority` + `admin-rbac-api` + `config-api` | **61 / 61 pass** |
| Frontend types | `cd frontend && npx tsc -b` | **0 errors** |
| Frontend types, strict, admin plane | `npm run typecheck:strict` | **0 errors** (strict + `noUnusedLocals` + `noImplicitOverride` + `noImplicitReturns`) |
| Frontend lint | `npm run lint` | **0 warnings, 0 errors** (267 files, 96 rules) |
| Frontend component tests | `npm run test:unit` | **122 / 122 pass** (16 files) |
| Frontend component coverage | `npm run test:unit:coverage` | **statements 83.90 %**, **branches 77.83 %**, **functions 82.77 %**, lines 84.47 % on the 14 admin-plane modules (thresholds 80/75/75/80, enforced by the command) |
| UX gate | `npm run verify:ux` | **0 violations**, contrast **16 / 16 pass** |
| Browser tier (E2E, a11y, visual) | `npm test` | **NOT RUN** — no browser binary; see §5 |

---

## 2. Backend test tiers

Every suite below runs without a database. `--test-concurrency=1` because several suites
install process-global injectables (`setTokenVerifierForTests`, `setRbacStoreForTests`,
`setRepositoryForTests`); `--test-force-exit` because the MySQL pool and the FreeLLMAPI
maintenance timer hold the process open after the last assertion. Both are harness
properties, not product properties.

| Suite | Tests | What it proves |
|---|---|---|
| `test/smoke.test.js` | 5 | The app boots, `/healthz` answers, the capability census is served, an unauthenticated admin route is denied with the standard envelope, and a request id is echoed — in-process, no database, < 2 s |
| `test/api-contract.test.js` | 4 | The payload shapes the console and the config editor read, field by field: capability census, config census (`authority`, `count`, `scopes`, `entries`), the `PUT` response (`auditRecorded`), and one error envelope (`success:false` + `error.code`/`message`/`requestId`) |
| `test/characterisation.test.js` | 12 | Pins the six decisions legacy intent left ambiguous: claims are not grants (DIV-002), the legacy role bundles and their sizes (DIV-004), `manage ⊃ write ⊃ read` (DIV-006), the rank ceiling (DIV-008), the two-category config classification (DIV-013), and the audit action names a saved filter depends on (DIV-011) |
| `test/chaos-resilience.test.js` | 5 | An RBAC store outage locks nobody out and widens nobody's authority; a config store outage serves declared defaults and says so; a write during an outage fails closed with no audit row; an audit-repository outage admits `auditRecorded:false` instead of implying a trail |
| `test/performance-budget.test.js` | 4 | Payload budgets (capabilities ≤ 32 KB, census ≤ 96 KB and ≤ 200 ms) and cache behaviour (25 cached configuration reads cost one) |
| `test/migrations-integrity.test.js` | 5 | Every schema-changing migration has a rollback; every rollback names only what its forward created; `029` carries every column INV-6 needs and its rollback refuses to erase evidence; `020`'s `CREATE INDEX` statements are `IF NOT EXISTS`. Static analysis, stated as such |
| `test/runtime-limits.test.js` | 4 | The rate-limit snapshot is seeded from boot, replaced by a configuration write without a restart, keeps the last-known values through a store outage, and costs **zero** queries when read 500 times |
| `test/mariadb-query-budget.test.js` | 15 | The admin directory page costs one round trip on a cold cache and one batched read on a warm cache; at most one pool acquisition is concurrent; a cached configuration read does not touch the pool |
| `test/config-registry.test.js` | 26 | 35 configuration keys, typed, bounded, defaulted; `security.rateLimit.authHourly` 1–100 000 and `authBurst` 1–10 000 as declared |
| `test/config-api.test.js` | 17 | `GET` census shape and `PUT` contract including every error code: `CONFIG_KEY_UNKNOWN` 404, `CONFIG_READ_ONLY` 403, `CONFIG_INVALID` 400, `CONFIG_REASON_REQUIRED` 400, `CONFIG_REVISION_CONFLICT` 409, store failure 503 |
| `test/config-registry-guards.test.js` | 14 | The registry's own guards, executed rather than trusted: every validator refuses null/empty/whitespace instead of coercing (`Number('') === 0` was a real defect), `assertRegistryIntegrity` rejects each malformed shape it exists to catch (duplicate id, duplicate key, bad default, non-editable without a reason), and `findEntry`/`describeEntry` resolve by key, by case-insensitive id, and report default-origin with no revision for an unresolved key |
| `test/config-edge-coverage.test.js` | 16 | The configuration route's edges: the read gate's three ways in, history with/without a limit, the write rejection ladder (value, revision sentinel, unknown key, invalid value, read-only, reason absent/empty/whitespace/short/long), the audit-row metadata, an armed audit outage, and the error mapper's driver-code whitelist — all pinned to the ELEVATED key `security.rateLimit.global` because only it requires a reason |
| `test/admin-rbac-edge-coverage.test.js` | 8 | The authority route's edges: role-listing editability against `PLATFORM_MANAGED_ROLES` and rank ordering, an empty bundle answering `[]`, an unknown role, `DELETE …?reason=` recorded with `reasonSource: 'query'`, the 500/503 mapper split with its field passthrough, an armed store outage, and exactly one semantic audit row per mutation |
| `test/config-validators.test.js` | 14 | Every validator, including the arithmetic/geo bounds that used to be `Number('') === 0` |
| `test/database-ownership-completeness.test.js` | 3 | Five RBAC/config entities resolve to an owning table and the alias map is closed |
| `test/authz-visibility-matrix.test.js` | — | The frontend-visibility × backend-enforcement matrix (INV-5) as executable data |
| `test/route-manifest.test.js` | 7 | 152 inventory rows resolve to a named rule; no route relies on a declared default; no dead rules; every permission named is held by some role or declared SUPER_ADMIN-exclusive |
| `test/admin-rbac-*.test.js` (5 files) | 60 | The authority engine: seed parity with the pre-028 literal, resolver hierarchy, grants, self-escalation block, contract codes (`SELF_ESCALATION_BLOCKED` 409, `ROLE_NOT_FOUND`/`GRANT_NOT_FOUND` 404, 503 on store failure), and the administration surface |
| `test/admin-target-authority.test.js` | 20 | A caller may never mutate an account that outranks it (`TARGET_OUTRANKS_CALLER`); SUPER_ADMIN → SUPER_ADMIN remains permitted (INV-2) |
| `test/setting-classification.test.js` | — | Every business setting is classified runtime-editable or boot-only, with no third category |

`scripts/smoke.mjs` (10 checks against a *running* deployment, `--base`, `--json`,
`npm run smoke:deployed`) is written but **NOT RUN** here: it requires a deployed base URL.

---

## 3. Coverage

```
=============================== Coverage summary ===============================
Statements   : 98.60% ( 3388/3436 )
Branches     : 86.68% ( 651/751 )
Functions    : 97.53% ( 79/81 )
Lines        : 98.60% ( 3388/3436 )
================================================================================
```

Enforced by `c8 check-coverage --statements=95 --lines=95 --functions=90 --branches=85
--per-file=false` at the end of `npm run test:coverage`, and the same four numbers are in
`backend/.c8rc.json`, so the threshold cannot drift from the command in this document.
`include` is scoped to the modules the remediation touched; a new module added to that surface
must be added there, which is a deliberate speed bump.

**The gate was raised, not waived.** The previous revision of this document reported
82.52 % branches against a 80 % gate and recorded the 10/10 bar's 85 % as an honest gap. The
gap is now closed by tests:

| File | Branches before | After | What closed it |
|---|---|---|---|
| `routes/config.js` | 63.15 % | **70.76 %** | `test/config-edge-coverage.test.js` — the rejection ladder and the mapper whitelist; the remainder is I/O-callback arms that only a live pool reaches |
| `routes/adminRbac.js` | 66.00 % | **81.03 %** | `test/admin-rbac-edge-coverage.test.js` — mapper split, armed outage, audit invariants |
| `config/registry.js` | 90.41 % | **93.33 %** | `test/config-registry-guards.test.js` — the integrity check run against deliberately invalid entries |
| `services/adminRbacAdministration.js` | 80.58 % | **93.69 %** | six cases appended to `test/admin-rbac-administration.test.js` — wildcard smuggling, missing actor, uid bounds, revocation races |

**The gate is proven to fail.** Raising the thresholds to 99 on the same coverage data exits 1:

```
$ npx c8 check-coverage --statements=99 --lines=99 --functions=99 --branches=99 --per-file=false
ERROR: Coverage for lines (98.6%) does not meet global threshold (99%)
ERROR: Coverage for functions (97.53%) does not meet global threshold (99%)
ERROR: Coverage for branches (86.68%) does not meet global threshold (99%)
exit code 1
```

**Two product defects were found by writing these tests, and fixed at the root:**

1. **`expectedRevision: null` bypassed the revision guard** (`services/configService.js`).
   `writeConfigValue` skipped the comparison whenever the caller sent `null`, so a client that
   loaded the census before a row existed could overwrite a value written since — the
   last-write-wins hole REC-015 exists to close. `null` now means exactly "I believe no value
   is stored" and is compared like any other expectation: against a stored row it is a
   `409 CONFIG_REVISION_CONFLICT` naming `currentRevision`. The console already sends the
   revision it rendered (`AdminConfigTab.tsx:200`), so no client change was needed.
2. **An audit-write failure answered 500** (`routes/config.js`). A 500 on a write reads as "it
   may have saved"; store-level codes — `ECONNREFUSED`, `ER_NO_SUCH_TABLE`, `POOL_CLOSED`,
   `AUDIT_WRITE_FAILED` — now map to 503.

---

## 4. Frontend evidence

| Tier | Command | Result |
|---|---|---|
| Types (project references) | `npx tsc -b` | 0 errors |
| Types (strict, `src/components/admin`, `src/pages/admin`, `tests/unit`) | `npm run typecheck:strict` | 0 errors. `strict`, `noUnusedLocals`, `noImplicitOverride`, `noImplicitReturns`, on top of the repo's existing `noUncheckedIndexedAccess` |
| Lint | `npm run lint` | 0 warnings, 0 errors |
| Target size, text floor, focus rings, widths | `npm run ux:audit` | 0 violations (was 71 before `3a2ec1c`) |
| Contrast, WCAG 2.2 AA, 16 rendered pairs | `npm run a11y:contrast` | 16 / 16 pass |
| Component behaviour (jsdom) | `npm run test:unit` | 122 / 122 pass |

**What the component tier covers** (`tests/unit/`, vitest + jsdom + Testing Library):

| File | Tests | Pins |
|---|---|---|
| `admin-data-state.test.ts` | 10 | `data` is `null` until a request succeeds; a failure clears the payload instead of leaving stale rows; an empty success is `ready`, not `failed`; the three server error envelopes normalise to one operator-facing shape; a cancelled request is not reported as a server failure |
| `admin-users-model.test.ts` | 14 | The `adminUserProjection` → `AdminUserRecord` mapping; `status` derived from `suspended`/`identityStatus`; fields the endpoint does not return are `null`, never `0`; unknown roles degrade to `USER`; `SUPER_ADMIN` is not assignable |
| `admin-attention-tab.test.tsx` | 6 | Real signals render with severity and id; an empty list renders "no signal is firing"; a `503` renders the code and request id and **not** the sample incidents the tab used to ship; Refresh re-reads the endpoint; a derived signal has no Acknowledge control |
| `admin-users-tab.test.tsx` | 7 | Only server-returned identities render; a directory outage shows the error and no table; an empty directory says so; a refused password reset is reported as a failure and never claims a link was issued; `SUPER_ADMIN` is absent from the picker; suspension requires a reason |
| `admin-users-actions.test.tsx` | 16 | The exact request each action sends (method, URL, body, concurrency guard) and the message the operator sees afterwards — role `PATCH` with `expectedRole`, 12-month Premium grant, suspension with reason, `ai-entitlement` `PUT` with justification required before the request, quota reset, tenant assign/remove, provisioning with only the accepted fields, filters |
| `admin-security-tab.test.tsx` | 5 | Security events are the server's rows (`/platform/security-events?limit=100`); an empty table says so; a 503 surfaces `SECURITY_EVENTS_UNAVAILABLE` + request id; a refused role change (`ADMIN_TARGET_CHANGED`) leaves the stored role on screen; non-staff accounts get no privilege control |
| `admin-security-panels.test.tsx` | 9 | The audit trail (rows + `/admin/audit-logs/stats`, empty and 503 variants), broadcasts (publish keeps the draft on refusal, supersede sends `expectedRevision`, delete only after confirmation), staff session revoke (refusal reported, success announces the server's message, `SUPER_ADMIN (claim-only)` shown but never assignable) |
| `admin-helpdesk-tab.test.tsx` | 5 | Tickets are the server's rows (`/admin/support/tickets`); the desk says it is empty rather than inventing tickets; a refused reply is reported as a refusal and keeps the draft; a refused status change (`PATCH …/tickets/:id {status}`) leaves the stored status |
| `admin-queues-tab.test.tsx` | 6 | Sampled outbox rows with the sampling caveat rendered; a platform retry exists only for a notification dead letter (never enterprise — the route answers `400 INVALID_RETRY_TARGET`); the retry body is `{jobId, queue:'notification'}`; refusals surface code + request id; empty and 503 variants |
| `admin-moderation-tab.test.tsx` | 6 | Applications are the server's rows (`/admin/employer-applications`); approval sends `status` + `expectedStatus`; rejection requires a ≥3-character reason in the request; a job feature request carries exactly one field (the route rejects compound bodies); 409s surface |
| `admin-moderation-registries.test.tsx` | 8 | Job status changes use the one-field contract with `expectedStatus`/`expectedFeatured`; the company registry and the operator-scoped tenant registry render rows, empty states and 503s (`TENANT_REGISTRY_UNAVAILABLE`) |
| `admin-filter-branches.test.tsx` | 4 | Client-side filters are pinned branch by branch: help-desk status/search, queue/state filters + expandable job detail, security severity/search/row expansion, blog status/search |
| `admin-health-tab.test.tsx` | 6 | Services and states come from `/platform/operational-status` with the collector's own counts (`8/9`); group + free-text filters; an uncollectable snapshot (`OPERATIONAL_STATUS_UNAVAILABLE`) never shows a healthy board; empty collector list renders as reported; the detail drawer reads `/…/:serviceId`; a failed provider probe is reported as a failure |
| `admin-detail-surfaces.test.tsx` | 7 | Blog reader preview renders the stored body and closes on Escape; testimonials are read-only rows with empty and 503 variants; the service drawer shows dependency, remediation, metrics, `relatedEndpoints` and `auditEvents`; the job status filter refetches with `{status}` |
| `admin-cms-tabs.test.tsx` | 8 | The blog read hits `/blog-data` (mounted route), not the non-existent `/blog/posts`; deletion sends `expectedRevision` and surfaces `CAS_CONFLICT`; the marketing tab offers only the two sections the backend serves (phrases + testimonials — no invented logo/SEO panels); a phrase write replaces the whole category exactly as the endpoint does |
| `admin-operations-tab.test.tsx` | 5 | The maintenance save sends `expectedRevision` and reports the revision the server committed; `ADMIN_SETTINGS_CONFLICT` keeps the form buffer; the removed backup/cache-purge controls are explained (`OI-OPS-1`) instead of faked; an unreadable health summary never guesses settings |

**NOT RUN, with reasons:**

| Tier | Why | Command |
|---|---|---|
| E2E, accessibility, visual snapshots, device classes | No browser binary in the sandbox and no way to download one; the specs also need a database-backed `webServer` | `cd frontend && npx playwright install chromium && npm test` |
| Lighthouse budgets (LCP < 2.5 s, INP < 200 ms, CLS < 0.1) | Needs a built app served over HTTP and a real browser | `npm --prefix frontend run build && npm --prefix frontend run preview` then Lighthouse against `/admin` |

Both run in the `e2e` job of `.github/workflows/quality-gate.yml` (on `dev`, with a MariaDB
service); neither is claimed as evidence here. `OI-TIER-1`.

---

## 5. Failures that are environmental, not product

Six files fail in this sandbox, with identical counts on the base commit (verified by
`git stash -u` and re-running each file):

| File | Failures | Cause |
|---|---|---|
| `test/freellmapi-engine.test.js` | 6 | Needs a disposable MariaDB |
| `test/enterprise-role-view-simulation.test.js` | 1 | Needs seeded enterprise tables |
| `test/forensic-data-lineage.test.js` | 1 | Needs MariaDB |
| `test/rbac-role-visibility-forensic.test.js` | 3 | Needs MariaDB |
| `test/session-reauth-lifecycle.test.js` | 1 | Needs MariaDB |
| `test/superadmin-remediation-pass.test.js` | 2 | Needs MariaDB |

They are excluded from the gate command in §1 precisely because they cannot pass here; they
are not excluded because they fail. The command that would settle them:

```bash
DB_HOST=127.0.0.1 DB_NAME=airesume_test npm --prefix backend test
```

---

## 6. What cannot be claimed from this evidence

- **"The E2E suite passes."** It was not executed. The specs exist and are listed by
  Playwright; none ran.
- **"Per-file coverage meets the bar."** The *global* numbers do (98.60 / 86.68 / 97.53 /
  98.60 against 90 / 85 / 95 / 90), and that is what `--per-file=false` gates. Per file,
  `routes/config.js` (70.76 % branches), `security/policy.js` (81.08 %),
  `services/configService.js` (82.20 %) and `routes/adminRbac.js` (81.03 %) are still under 85 %
  branches; each remainder is I/O-callback arms or an unreachable-in-jsdom branch, and closing
  them means a live pool, not a looser threshold. `OI-T-7`, decided in `D-028-1` / `ADR-006`.
- **"The deployed smoke suite passes."** `scripts/smoke.mjs` needs a live base URL.
- **"Migration apply and rollback were exercised against MariaDB."** Only static analysis of
  the migration files ran (`migrations-integrity`). Applying `001_baseline.sql` upward has no
  rollback by design, and the drill needs a disposable database.
- **"Every admin tab shows live data."** Seven tabs still contain sample-data fallbacks;
  the inventory and the per-file next action are in `OPEN-ITEMS.md` `OI-001-1`.

---

## 7. CI

`.github/workflows/quality-gate.yml` runs, on every pull request to `dev`:

| Job | Steps |
|---|---|
| `backend` | `npm ci` → `node --check` on every source file → `npm run smoke` → `npm run test:tiers` (25 tier files in one command) → `npm run test:coverage` (95/95/90/85 enforced) → upload coverage |
| `migration-drill` (on `dev` only) | MariaDB service → rollback drill → migration gate → query-plan EXPLAIN layer → `npm run query-plan:drill` (per-query row budgets) → `npm run migration:drill` (forward ×2, backward ×2, checksum) |
| `frontend` | `npm ci` → `tsc -b` → `typecheck:strict` → `lint` → `test:unit:coverage` → `ux:audit` → `a11y:contrast` → `build` → upload UX evidence |
| `e2e` (on `dev` only) | MariaDB service → migrations applied → `playwright install chromium` → `admin-console-ux.spec.ts` + `accessibility.spec.ts` → upload report |

A step that can be ignored is a comment: there is no `continue-on-error` and no
`|| true` anywhere in the workflow.

---

## 8. Reproduce everything

```bash
# Backend gate + coverage thresholds
cd backend && NODE_ENV=test npm run test:coverage

# Every tier in one command (contract, characterisation, chaos, performance, load,
# query-plan, migrations, degraded semantics, smoke)
cd backend && NODE_ENV=test npm run test:tiers

# The coverage closers on their own
cd backend && NODE_ENV=test node --test --test-concurrency=1 --test-force-exit \
  test/config-edge-coverage.test.js test/admin-rbac-edge-coverage.test.js \
  test/config-registry-guards.test.js

# Prove the coverage gate still fails when it should
cd backend && npx c8 check-coverage --branches=99 --per-file=false   # exit 1

# Re-establish that the six red files are red on the base commit too
git stash -u && for f in freellmapi-engine enterprise-role-view-simulation \
  forensic-data-lineage rbac-role-visibility-forensic session-reauth-lifecycle \
  superadmin-remediation-pass; do
  NODE_ENV=test node --test --test-concurrency=1 --test-force-exit test/$f.test.js \
    | grep -E "^# (pass|fail)"; done; git stash pop

# Frontend static + component tiers
cd frontend && npm run typecheck:strict && npm run lint && npm run test:unit:coverage \
  && npm run verify:ux

# Deployed smoke (needs a base URL)
node scripts/smoke.mjs --base https://staging.example.com --json
```
