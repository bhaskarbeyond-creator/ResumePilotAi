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
| Backend gate (13 files, the coverage set) | `cd backend && NODE_ENV=test npm run test:coverage` | **167 / 167 pass**, `c8 check-coverage` exit 0 |
| Backend coverage | same command | **statements 98.42 %**, **branches 82.52 %**, **functions 97.53 %**, lines 98.42 % |
| New tier files (7) | §2 | **39 / 39 pass** |
| Contract + registry + ownership | §2 | `api-contract` 4/4, `config-registry` 26/26, `config-api` 17/17, `config-validators` 14/14, `database-ownership-completeness` 3/3 |
| Query budget | `test/mariadb-query-budget.test.js` | **15 / 15 pass** (admin page: 1 round trip cold, 1 batched read warm, max 1 concurrent acquisition) |
| Authority suites (spot re-run after the user-route change) | `admin-target-authority` + `admin-rbac-api` + `config-api` | **61 / 61 pass** |
| Frontend types | `cd frontend && npx tsc -b` | **0 errors** |
| Frontend types, strict, admin plane | `npm run typecheck:strict` | **0 errors** (strict + `noUnusedLocals` + `noImplicitOverride` + `noImplicitReturns`) |
| Frontend lint | `npm run lint` | **0 warnings, 0 errors** (249 files, 96 rules) |
| Frontend component tests | `npm run test:unit` | **53 / 53 pass** (5 files) |
| Frontend component coverage | `npm run test:unit:coverage` | **statements 86.81 %**, **branches 76.63 %**, **functions 85.83 %**, lines 86.91 % on the six admin modules |
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
Statements   : 98.42% ( 3365/3419 )
Branches     : 82.52% ( 595/721 )
Functions    : 97.53% ( 79/81 )
Lines        : 98.42% ( 3365/3419 )
================================================================================
```

Enforced by `c8 check-coverage --branches=80 --lines=95 --functions=90 --per-file=false` at
the end of `npm run test:coverage`, so the thresholds cannot drift from the command in this
document. `backend/.c8rc.json` scopes `include` to the modules the remediation touched; a new
module added to the surface must be added there, which is a deliberate speed bump.

**Honest gap.** The 10/10 bar asks for ≥ 85 % branches; the gate is at 80 % and the measured
value is 82.52 %. The shortfall is concentrated in three files — `routes/config.js` 63.15 %,
`routes/adminRbac.js` 66 %, `services/adminRbacAdministration.js` 68.96 % — and the next
action is *more tests*, not exclusions: `OI-COV-1` and `OI-COV-2` in `OPEN-ITEMS.md`. The gate
was never lowered from a higher value; it was set at 80 % when introduced and is raised when
the gap closes.

---

## 4. Frontend evidence

| Tier | Command | Result |
|---|---|---|
| Types (project references) | `npx tsc -b` | 0 errors |
| Types (strict, `src/components/admin`, `src/pages/admin`, `tests/unit`) | `npm run typecheck:strict` | 0 errors. `strict`, `noUnusedLocals`, `noImplicitOverride`, `noImplicitReturns`, on top of the repo's existing `noUncheckedIndexedAccess` |
| Lint | `npm run lint` | 0 warnings, 0 errors |
| Target size, text floor, focus rings, widths | `npm run ux:audit` | 0 violations (was 71 before `3a2ec1c`) |
| Contrast, WCAG 2.2 AA, 16 rendered pairs | `npm run a11y:contrast` | 16 / 16 pass |
| Component behaviour (jsdom) | `npm run test:unit` | 53 / 53 pass |

**What the component tier covers** (`tests/unit/`, vitest + jsdom + Testing Library):

| File | Tests | Pins |
|---|---|---|
| `admin-data-state.test.ts` | 10 | `data` is `null` until a request succeeds; a failure clears the payload instead of leaving stale rows; an empty success is `ready`, not `failed`; the three server error envelopes normalise to one operator-facing shape; a cancelled request is not reported as a server failure |
| `admin-users-model.test.ts` | 14 | The `adminUserProjection` → `AdminUserRecord` mapping; `status` derived from `suspended`/`identityStatus`; fields the endpoint does not return are `null`, never `0`; unknown roles degrade to `USER`; `SUPER_ADMIN` is not assignable |
| `admin-attention-tab.test.tsx` | 6 | Real signals render with severity and id; an empty list renders "no signal is firing"; a `503` renders the code and request id and **not** the sample incidents the tab used to ship; Refresh re-reads the endpoint; a derived signal has no Acknowledge control |
| `admin-users-tab.test.tsx` | 7 | Only server-returned identities render; a directory outage shows the error and no table; an empty directory says so; a refused password reset is reported as a failure and never claims a link was issued; `SUPER_ADMIN` is absent from the picker; suspension requires a reason |
| `admin-users-actions.test.tsx` | 16 | The exact request each action sends (method, URL, body, concurrency guard) and the message the operator sees afterwards — role `PATCH` with `expectedRole`, 12-month Premium grant, suspension with reason, `ai-entitlement` `PUT` with justification required before the request, quota reset, tenant assign/remove, provisioning with only the accepted fields, filters |

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
- **"Coverage meets the 10/10 bar."** Statements, functions and lines do; branches do not
  (82.52 % measured against 85 % required). See §3.
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
| `backend` | `npm ci` → `node --check` on every source file → `npm run smoke` → 21 tier files → `npm run test:coverage` (thresholds enforced) → upload coverage |
| `frontend` | `npm ci` → `tsc -b` → `typecheck:strict` → `lint` → `test:unit:coverage` → `ux:audit` → `a11y:contrast` → `build` → upload UX evidence |
| `e2e` (on `dev` only) | MariaDB service → migrations applied → `playwright install chromium` → `admin-console-ux.spec.ts` + `accessibility.spec.ts` → upload report |

A step that can be ignored is a comment: there is no `continue-on-error` and no
`|| true` anywhere in the workflow.

---

## 8. Reproduce everything

```bash
# Backend gate + coverage thresholds
cd backend && NODE_ENV=test npm run test:coverage

# The seven new tiers, individually
cd backend && NODE_ENV=test node --test --test-concurrency=1 --test-force-exit \
  test/smoke.test.js test/api-contract.test.js test/characterisation.test.js \
  test/chaos-resilience.test.js test/performance-budget.test.js \
  test/migrations-integrity.test.js test/runtime-limits.test.js

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
