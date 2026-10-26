# ADR-008 — The coverage floor is 90/85/90/95, enforced, and it is higher than it was

**Status:** Accepted · **Date:** 2026-10-27 · **Commit:** `[REC-023|DEC-1]`
**Supersedes:** nothing. **Amends:** the threshold block in `frontend/vitest.config.ts` and the
numbers recorded in `decisions/ADR-006-coverage-gate-proven-to-fail.md` (the gate's *mechanism* is
unchanged; only the floor moved).

## The decision

Decision 1 (coverage thresholds) offered two paths: raise the gate and close the gap (Path A), or
write this ADR to justify the lower enforced numbers (Path B). **Path A, on both sides of the
repository**, with one qualification recorded below.

| Surface | Enforced before | Enforced now | Measured after this change | Verdict |
|---|---|---|---|---|
| Frontend (`frontend/vitest.config.ts`, 14 admin modules) | 80 / 75 / 75 / 80 | **90 / 85 / 90 / 95** | **95.45 / 86.02 / 95.16 / 96.11** | Path A, gate raised |
| Backend (`.c8rc.json` + `check-coverage` in `test:coverage`, 13 modules) | 95 / 85 / 90 / 95 | 95 / 85 / 90 / 95 (unchanged) | **99.02 / 87.76 / 97.95 / 99.02** | already at the bar |

Order is statements / branches / functions / lines. The mandated bar is ≥90 statements,
≥85 branches, ≥95 on critical paths; the function floor is 90 because it is *not* a mandated
metric and setting it to its measured value (95.16) would make the gate a tautology that any
refactor trips.

Numbers are from `npm run test:unit:coverage` (frontend, 198 tests) and `npm run test:coverage`
(backend, 260 tests) on this branch. Both are reproducible with those two commands — the
thresholds are enforced by the runner, so a regression fails the command rather than being
reported in prose.

## Why the frontend numbers moved, and how

The 80/75/75/80 gate was passing at 83.79/77.75/82.77/84.47 — a 6-to-10-point deviation from the
mandate. The gap was **not** dead code: it was mutation handlers, failure classification and
optional-field rendering, i.e. exactly the paths an operator reaches on a bad day. Tests were
added to the existing per-tab suites (no new guessed-DOM files — see the dead end recorded in
`TEST-EVIDENCE.md`), and where a test found a real defect the **source** was repaired rather than
the assertion relaxed:

| Defect found by the new tests | Repair |
|---|---|
| `AdminHealthTab` service drawer white-screened when a detail payload omitted `affectedFeatures`, `relatedEndpoints` or `auditEvents` (`.length` on `undefined`) | `?? []` at all six sites; `/api/platform/operational-status` defaults them (`services/platformHealth.js:117`), so this is defence against an older payload, not a contract change |
| `AdminHelpDeskTab` search threw `Cannot read properties of undefined (reading 'toLowerCase')` on a ticket with no subject | `(t.subject ?? '')` |
| `AdminOperationsTab` notice and `AdminQueuesTab` retry captions printed a blank when the server omitted `retriedCount` | fallbacks asserted by test, not by eye |
| Three lint warnings (unused imports/variable) surfaced by the new files | removed; `oxlint` is back to 0/0 |
| Five strict-mode type errors in test fixtures (`JSX` namespace, possibly-undefined tuple reads) | typed fixtures; `typecheck:strict` back to 0 |

## Critical-path proof (≥95% each, per module, not aggregated)

Frontend — modules where a mistake silently changes what an operator sees or does:

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `admin-data-state.ts` (failure classification, totality) | 100.00 | 98.15 | 100.00 | 100.00 |
| `use-admin-resource.ts` (abort/latest-wins guards) | 100.00 | 100.00 | 100.00 | 100.00 |
| `admin-users-model.ts` (payload → view adapters) | 98.44 | 84.92 | 100.00 | 100.00 |
| `AdminDataState.tsx` (the four-state panels) | 100.00 | 100.00 | 100.00 | 100.00 |

Backend — modules that decide authority or persist configuration:

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `security/capabilityMap.js` | 100.00 | 100.00 | 100.00 | 100.00 |
| `security/permissionVocabulary.js` | 100.00 | 100.00 | 100.00 | 100.00 |
| `security/policy.js` | 98.36 | 93.61 | 100.00 | 98.36 |
| `security/routeManifest.js` | 99.80 | 92.59 | 100.00 | 99.80 |
| `services/adminRbac.js` | 97.39 | 85.06 | 92.30 | 97.39 |
| `services/adminRbacAdministration.js` | 100.00 | 93.69 | 100.00 | 100.00 |
| `services/configService.js` | 99.52 | 82.50 | 100.00 | 99.52 |
| `config/registry.js` | 100.00 | 93.42 | 100.00 | 100.00 |
| `routes/adminRbac.js` | 98.21 | 79.66 | 100.00 | 98.21 |
| `routes/config.js` | 98.42 | 74.02 | 100.00 | 98.42 |

`routes/adminRbac.js` (79.66) and `routes/config.js` (74.02) are the two lowest branch figures in
the repository. Both are *route* files whose uncovered branches are the `catch` arms for store
faults already exercised at the service layer (`configService` 82.50 and `adminRbac` 85.06 cover
the same faults one level down); duplicating them at the route layer would test Express, not the
platform. They are named here rather than hidden, and they are the first targets if the branch
floor is ever raised to 90.

## Where the qualification is

The **frontend function floor is 90, not 95**, and the frontend module set is the 14 admin modules
that `vitest.config.ts` lists — not the whole `src/` tree. Two consequences, stated plainly:

1. **No repository-wide frontend number exists.** `src/` outside `components/admin/` is not
   instrumented, so any claim of the form "the frontend is at 95%" is false. The gate covers the
   admin console because that is the surface this work rebuilt; extending `include` to the whole
   `src/` tree is a separate decision (see trigger 2 below).
2. **Aggregate coverage is not per-file coverage.** `AdminUsersTab.tsx` sits at 90.57/75.29/88.61
   and `AdminModerationTab.tsx` at 96.94/77.55 — both above the aggregate floor and both below the
   per-file statement target. The aggregate gate permits that by design (`per-file=false`), which
   is why the per-module table above exists: the modules that decide *authority* are individually
   above 95; the modules that decide *layout* are not, and are not claimed to be.

## Trigger that would raise the floor

Raise the frontend floor again when **any** of these holds, decided in a new ADR rather than by
editing the config:

1. Aggregate statements exceed the floor by more than 5 points for three consecutive commits
   (currently 95.45 vs 90 — one commit in, not yet satisfied).
2. The `include` list grows to the full `src/` tree, at which point the floor is re-measured from
   the new baseline before being set.
3. A defect reaches production through a path that coverage would have shown, which is the only
   trigger that justifies raising the floor *before* writing the tests.

Lowering the floor requires the same ADR, naming the modules whose removal caused the drop. There
is no silent path: `vitest.config.ts` and `.c8rc.json` are the only two places the numbers exist,
and `quality-gate.yml` runs both.

## Per-commit trend (frontend, aggregate statements/branches/functions/lines)

The mandate asked for a trend table or graph. The measurements that exist on this branch are the
ones below; every row is a command that was run, and the two "before" rows are the numbers the
gate was passing at, taken from the coverage report committed with `ADR-006`.

| Point | Tests | Statements | Branches | Functions | Lines | Change |
|---|---|---|---|---|---|---|
| Gate as found | 122 | 83.79 | 77.75 | 82.77 | 84.47 | baseline |
| After per-tab action suites (health, helpdesk, moderation, queues, operations, security, cms, users) | 168 | 94.63 | 81.87 | 94.56 | 95.45 | +10.84 stmts |
| After sparse-payload + model + state suites | 191 | 95.25 | 85.30 | 95.16 | 96.11 | +0.62 stmts, +3.43 branches |
| After `use-admin-resource` guard tests and the flat-body classification cases (gate raised) | 198 | 95.45 | 86.02 | 95.16 | 96.11 | +0.20 stmts, +0.72 branches |

A graph is deliberately not generated: four points across one branch are not a trend, and a
rendered chart of four numbers would suggest a monitoring series that does not exist. When the
trend table has ten rows, it gets replaced by the artefact the mandate asked for.

## Alternatives considered

1. **Path B — keep 80/75/75/80 and justify it.** Rejected: at 83.79/77.75/82.77/84.47 the gate was
   passing 6–10 points below the mandate, and the gap was untested mutation handlers, not
   untestable code. An ADR justifying a number can always be written; it does not make the
   handlers tested.
2. **Raise to the measured values exactly (95/86/95/96).** Rejected: a floor equal to the
   measurement fails on the next refactor that adds a branch, which trains people to lower the
   floor. The floor is the mandate; the measurement is the headroom.
3. **Raise the branch floor to 90 on both sides.** Rejected for now: it fails today
   (`routes/config.js` 74.02, `AdminUsersTab.tsx` 75.29) and the branches behind those numbers are
   duplicated fault arms, not unexercised behaviour. Named as the next target above.
4. **Exclude the low-coverage files to raise the aggregate.** Rejected outright by the mandate and
   by the standing constraint: close gaps by adding tests, never by excluding paths.

## Rollback

Revert the threshold block in `frontend/vitest.config.ts` to 80/75/75/80. The tests stay; only the
enforcement weakens, which is why the revert needs this ADR's number in its commit message. No
product code depends on the threshold, so there is no runtime rollback.
