# Completion report — admin control plane remediation

**Repository:** `bhaskarbeyond-creator/ResumePilotAi`
**Branch:** `arena/55faaf92-resumepilotai` (never `main`)
**Commits:** `9d922d2` (analysis) → `b106012` (Phase 0) → `1d47922` → `b2803e1` → `5ace3e6` (Phase 1)
**Date:** 2026-10-26

---

## 0. Status banner — read before §1

§1 below is the **phase-1 snapshot**, written at commit `5ace3e6` when the backend authority
model had just landed. Four of the ❌ rows in that scorecard have since been closed on this
branch, and the scorecard is *not* rewritten in place, because a report that edits its own past
is not evidence. Current state, with the file that proves it:

| Row in §1 | Then | Now | Proof |
|---|---|---|---|
| Typed config keys | ❌ registry not implemented | ✅ 35 typed keys, one write path, one trail | `DECISION-LOG.md D-015-1`, `test/config-registry.test.js` (26), `test/config-registry-guards.test.js` (14) |
| Coverage ≥ 90 stmts / 85 branches | ❌ not measured | ✅ **98.60 / 86.68 / 97.53 / 98.60** on 211 tests, gate at 95/95/90/85 and proven to fail | `TEST-EVIDENCE.md §3`, `D-028-1`, `ADR-006` |
| UX: 5 device classes, 44 px, contrast, motion, print | ❌ measured gaps | ✅ 71 defects fixed, 16/16 contrast pairs pass, 0 UX violations | `UX-DEVICE-MATRIX.md`, `test/unit/admin-*.test.tsx` (16 files), `npm run verify:ux` |
| Test tiers | ⚠️ 5 of 12 | ⚠️ 10 of 12 executed; E2E/visual and browser vitals remain CI-only (`OI-T-4`) | `TEST-EVIDENCE.md §2` |

The final consolidated report — all 18 requirements scored met-with-evidence or
deferred-with-ADR — is produced in the completion step; §1 stays as the phase-1 record it was.

---

## 1. Read this first

This engagement was asked to take the admin control plane to a production-ready
10/10: fix the backend authority model, enhance every layout across five device
classes, build a full test-suite pack, and produce this pack.

**What was delivered:** the backend authority model is rebuilt, proven, and
deployable. Three commits, 58 new or rewritten files, **31 new tests**, all green.

**What was not delivered:** the frontend/UX work. The console still hides tabs by
role name, still has no audit-trail tab, still has no 44 px touch targets, and no
performance budget is asserted. That work is *specified and measured* in
`UX-DEVICE-MATRIX.md` and `OPEN-ITEMS.md`, but it is not done.

**The 10/10 bar is therefore not met.** Stated precisely, with evidence:

| 10/10 requirement | Status | Evidence |
|---|---|---|
| TypeScript strict, no `any` | ✅ (frontend) | `npx tsc -b` → 0 errors |
| Zero lint errors/warnings | ✅ (frontend) | `oxlint` → 0 warnings, 0 errors, 237 files |
| No dead or commented-out code | ⚠️ | Removed `_permissionsFor` dead import and the unused `isSupportDeskPath`; no repo-wide audit performed |
| Complexity budget | ❌ | Not measured; no linter rule enforces it |
| No duplicated business logic | ✅ (authority) | One engine: `routeManifest.js`; the ladders are deleted |
| Structured error handling | ✅ (new code) | Every RBAC path returns a coded envelope; store failures are 503, not 500 |
| No string-concat SQL / unsanitised HTML / secrets in code | ✅ (new code) | All new SQL is parameterised; resource names are pattern-validated; no secrets introduced |
| Typed config keys | ❌ | Config registry (REC-012b–e) not implemented — `OI-CFG-2` |
| Doc comments + ADRs | ✅ | 5 ADRs, module docblocks on every new file |
| Coverage ≥ 90 % stmts / 85 % branches / 95 % critical paths | ❌ | **Not measured.** No coverage tooling is configured — `OI-T-1` |
| UX: 5 device classes, 44 px, safe-area, no h-scroll, keyboard, WCAG 2.2 AA, dark/high-contrast/reduced-motion, 200 % zoom, tokens, density, print | ❌ | Measured gaps in `UX-DEVICE-MATRIX.md §2` |
| LCP < 2.5 s / INP < 200 ms / CLS < 0.1 | ❌ | No assertion exists — `OI-UX-3` |
| Test tiers: unit, integration, contract, E2E, visual, a11y, security, performance, characterisation, chaos, migration, smoke | ⚠️ 5 of 12 exercised | `TEST-EVIDENCE.md §5` |
| Completion pack | ✅ | This file plus six companions and five ADRs |

A different report would claim the bar was met. This one names the two large gaps
(UX, coverage) and one medium one (configuration registry) rather than rounding them
up.

---

## 2. What changed, in order

### `9d922d2` — Analysis (13 documents, +2 872 lines, no code)

The comparison against the legacy reference, the six-invariant proof attempt, the
configuration gap register, and ten open decisions. It established the verdict
**"not releasable as a control plane"** and the reasons.

### `b106012` — Phase 0: the emergency set

| Change | File | Why |
|---|---|---|
| Target-authority ceiling | `security/targetAuthority.js`, wired into 7 handlers | An ADMIN could act on a SUPER_ADMIN's account through endpoints that only checked "are you an admin" |
| Non-throwing denial audit | `security/denialAudit.js` | `recordAdminAuditLog` throws when the store is down, converting a correct 403 into a 503 |
| Secret classification extracted and fixed | `security/settingClassification.js` + `.data.js` | A latent ordering bug let `firebase.apiKey` bypass the private-key exemption and be redacted — the opposite of the intended behaviour for a public client key |

Tests: 28 (target authority) + 8 (classification). Fails-before proven by reverting
the two patched files (`0/6` escalation cases caught before, `6/6` after).

### `1d47922` — Phase 1a: authority is data (REC-005)

- `028_admin_rbac.sql`: `admin_roles`, `admin_role_permissions`, `admin_user_roles`.
  §A seeds all eight roles from the literal (behaviour-preserving, proven by a test
  that *parses the SQL*); §B is the single intentional grant (`messages.read` to
  ADMIN and SUPPORT), with its reasoning inline.
- `services/adminRbac.js`: hierarchy resolver, legacy dotted aliases, TTL cache with
  background refresh, literal fallback, grant preloading.
- `security/permissionVocabulary.js`: the literal, extracted to break a require cycle.
- `security/auth.js`: `permissionsFor` / `requirePermission` delegate to the resolver;
  **the token-asserted `permissions` claim is no longer authority**.
- `security/policy.js`: `hasPermission` goes through `satisfies`, so the hierarchy
  applies on the request path.
- `index.js`: cache warmed after schema bootstrap, before the listener accepts
  traffic; dead import removed.

12 tests.

### `b2803e1` — Phase 1b: one authorisation engine (REC-006)

- `security/routeManifest.js`: 27 named rules; reads and writes resolved in separate
  passes; two *declared* defaults.
- `security/policy.js`: the two if-ladders deleted; a path the manifest cannot resolve
  is denied and logged.
- Four behaviour corrections: `audit-logs → audit.read`, `pages → content.manage`,
  `coupons → payments.read/.manage`, `settings →` named rules.
- `test/fixtures/admin-route-inventory.json`: 152 routes; the test asserts **zero**
  routes rely on a default and no rule is dead.

7 tests.

### `5ace3e6` — Phase 1c: authority is changeable, audited (REC-005 acceptance 2, INV-6)

- `routes/adminRbac.js` + `services/adminRbacAdministration.js`: SUPER_ADMIN-only,
  step-up, reasoned, audited role/grant administration.
- `security/adminAudit.js`: one row per authority change, with a store-computed
  before/after; the generic post-response row is suppressed for these paths.
- Store gains `replaceRolePermissions`, `upsertGrant`, `deleteGrant`, `listGrants`;
  grants apply to the caller's next request via `preloadUserGrants`.

12 tests.

---

## 3. The six invariants

Full evidence in `SECURITY-AND-RBAC-PROOF.md`.

| # | Invariant | Verdict |
|---|---|---|
| INV-1 | All Must/Should capabilities reachable | **PARTIAL** — 152/152 routes have a named rule and 0 permission orphans; 11 capabilities still have no console surface |
| INV-2 | Super-admin unconditional, no hard-coded block | **PROVEN** — wildcard seeded, expanded, honoured, and removal blocked |
| INV-3 | Configurable bundles, resource × action, hierarchy, audited bypass | **PROVEN** for bundles/hierarchy/grants; **PARTIAL** for scoped bypass (`OI-005-2`) |
| INV-4 | Every business value dashboard-configurable with validation/default/audit | **PARTIAL** — 34 CFG gaps remain (`OI-CFG-*`) |
| INV-5 | UI hiding is not authorization | **PROVEN as a property**; 3 visible-but-denied cells remain because the console hides by role name (`OI-018-1`) |
| INV-6 | Config changes audited with actor/timestamp/before-after/scope | **PROVEN for authority changes**; **PARTIAL for settings values** (no server-computed `before`, `OI-012-1`) |

---

## 4. Decisions taken on your behalf

`DECISION-LOG.md` carries all of them. The five that change observable behaviour:

1. **Token-claimed permissions are no longer authority.** Nothing in the codebase
   mints that claim, so no existing deployment loses access unless it hand-set one.
   Migration query in `DEPLOYMENT-RUNBOOK.md §7.1`.
2. **AUDITOR can now read the audit trail**, and ADMIN can read the settings it could
   already write. Both are corrections, not grants.
3. **Seven of the eight "unassigned" permissions were not gaps.** Granting all eight
   would have widened authority to fix a reporting artefact.
4. **Authority changes require a reason and two identities** — self-escalation is
   blocked, so every widening involves a different account from the beneficiary.
5. **No-op and rejected changes write no audit row**, so "what changed" is answerable
   without filtering out non-events.

Corrections to the analysis itself are catalogued in `OPEN-ITEMS.md §6`; the notable
one is that "`system.config.manage` gates all settings writes" was off by one action —
the ladder returns `system.config.write`, which ADMIN already held.

---

## 5. Deploy and roll back

`DEPLOYMENT-RUNBOOK.md`. The short version:

1. `git log --oneline -3` → `5ace3e6`, `b2803e1`, `1d47922`.
2. Pre-flight: `NODE_ENV=test node --test test/admin-rbac-resolver.test.js test/route-manifest.test.js test/admin-rbac-api.test.js` → 31/31.
3. Deploy; the boot applies 028 and logs `[AdminRBAC] Loaded 8 role(s) and N stored permission(s)`.
4. Verify: `GET /api/admin/rbac/roles` reports `"source": "database"`; AUDITOR gets 200
   on `/api/admin/audit-logs`; ADMIN gets 200 on `/api/admin/settings`.
5. Roll back one change: re-apply the previous bundle through the API (seconds).
   Roll back the resolver: revert `1d47922`. Roll back the schema: `028_admin_rbac.down.sql`
   — cannot lock anyone out, because a missing store degrades to the literal.

**Operational warnings that are easy to miss:**

- A store outage is *safe* (pre-028 authority) but *not configurable*; the log line
  `[AdminRBAC] admin.rbac.store_unavailable` is the tell.
- `SUPER_ADMIN_MFA_REQUIRED` defaults to true in production. Enrol MFA before the
  deploy or every authority change returns `403 SUPER_ADMIN_MFA_REQUIRED`.
- The RBAC cache is per process; another instance converges within
  `ADMIN_RBAC_CACHE_TTL_MS` (15 s default).

---

## 6. Verification you can run right now

```bash
# The authoritative command for this pass — no database needed
cd backend && NODE_ENV=test node --test --test-concurrency=1 --test-force-exit \
  test/admin-rbac-api.test.js test/admin-rbac-resolver.test.js test/route-manifest.test.js \
  test/admin-rbac-contract.test.js test/admin-target-authority.test.js \
  test/setting-classification.test.js test/superadmin-control-plane.test.js \
  test/superadmin-platform.test.js test/admin-audit-query.test.js test/security.test.js \
  test/admin-routing-telemetry-route.test.js test/admin-tenant-assignment.test.js
# -> # tests 132 / # pass 132 / # fail 0

# Wider regression (21 files)
# -> # tests 184 / # pass 182 / # fail 2   (both pre-existing: no MariaDB)

# Frontend static
cd frontend && npx tsc -b && npm run lint
# -> 0 errors; 0 warnings, 0 errors
```

The two failures are catalogued and were proven pre-existing by reverting the working
tree (`TEST-EVIDENCE.md §4.1`).

---

## 7. The pack

| Document | What it answers |
|---|---|
| `README.md` … `12-appendices.md` | The analysis: reference inventory, coverage matrix, SWOT, RCA register, divergence register, configuration register, recommendations, residual risk |
| **`COMPLETION-REPORT.md`** | This file — what shipped, what did not, and how to verify |
| **`DECISION-LOG.md`** | Ten RR decisions resolved, twelve execution decisions, four analysis corrections |
| **`TEST-EVIDENCE.md`** | Exact commands, exact counts, what each suite proves, which tiers exist and which do not |
| **`UX-DEVICE-MATRIX.md`** | Five viewport classes: measured current state, acceptance criteria, and the nine work items |
| **`SECURITY-AND-RBAC-PROOF.md`** | The six invariants with verdicts, the visibility-vs-enforcement matrix, the threat-model checks |
| **`DEPLOYMENT-RUNBOOK.md`** | Pre-flight, apply, verify, three rollback levels, break-glass, post-deploy checks |
| **`OPEN-ITEMS.md`** | 37 open items with file, acceptance criterion and dependency; none blank, none TBD |
| **`decisions/ADR-001…005`** | Why authority is data, why token claims are not authority, why the manifest, why the API is SUPER_ADMIN-only, why one audit row |

---

## 8. What I would do next, in order

1. **`OI-018-1` — capability-driven tab visibility.** It is the hinge: until the
   console reads permissions instead of role names, every authority improvement above
   is invisible to the people using it, and the three visible-but-denied cells remain.
2. **`OI-008-1` — the audit-trail tab.** The backend is ready and AUDITOR now reaches
   it; the screen is missing. This is the shortest path from "authority is audited" to
   "authority is *seen* to be audited".
3. **`OI-UX-1` then `OI-UX-2`/`OI-UX-3`** — navigation at 320 px, 44 px targets, then
   the performance budget. In that order, because measuring the responsiveness of
   screens a phone cannot reach measures nothing.
4. **`OI-T-1`/`OI-005-6`** — coverage tooling and a real migration test. Both are
   prerequisites for claiming any numeric quality bar.
5. **`OI-CFG-1`** — the nine DB-BROKEN settings, which are the ones where the
   dashboard currently lies.
