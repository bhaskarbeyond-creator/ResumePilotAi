# Metric Definitions (V4)


> **V5 note (`cccd35a5`):** backend-suite figures quoted in this document are from the V4 run, which
> left the repo's MariaDB gate off. The canonical run (`cd backend && npm test`) executes those tests:
> **1,315 discovered / 1,315 executed / 1,269 pass / 46 fail / 0 skipped, exit 1**, all 46 fails DB-caused
> (`Evidence/logs/v5/backend-canonical-suite.triage.md`). Historical numbers are retained, not overwritten.

Every number this package publishes is defined here with its **numerator, denominator, exclusions,
formula and source register**. No metric is reported as a bare percentage, and **no composite score is
computed** anywhere: averaging incomparable units is what produced the "192 uncovered / 58 orphaned"
figures that collapsed under re-checking.

**Counting rule that precedes all others:** registrations, unique `METHOD+path` pairs, handlers, services
and database operations are **different units** and never share a denominator.

---

## M1 — Legacy source surface

| Field | Value |
|---|---|
| Numerator | files under repository-root `src/` that are source (`.js`, `.jsx`), excluding tests and assets |
| Denominator | n/a (absolute count) |
| **Value** | **650 files**, **519 `.jsx`**, **193,310 lines** |
| Exclusions | `src/**/*.test.js`, `src/assets/**` binaries, `node_modules` |
| Formula | `find src -name '*.js*' -not -name '*.test.js'` then `wc -l` |
| Source | `Evidence/artifacts/legacy-file-inventory.tsv`; `tools/legacy-modern-inventory.cjs` |
| Prior figure | "144 files/dirs" (E-002) — withdrawn as DISC-018 |
| Why it matters | it is the *candidate* capability surface, not the deployed one |

## M2 — Modern source surface

| Field | Value |
|---|---|
| Numerator | files under `frontend/src/` with `.ts`/`.tsx` extensions |
| **Value** | **206 files**, **151 `.tsx`**, **68,812 lines** |
| Exclusions | tests (`frontend/tests`), generated route manifests |
| Source | `Evidence/artifacts/legacy-modern-inventory.json` |
| Cross-check | `tsc --noEmit` compiles all 206 (exit 0) |

## M3 — File attribution (coverage of the *comparison*, not of the product)

| Field | Value |
|---|---|
| Numerator | source files mapped to ≥1 capability row |
| Denominator | source files measured |
| Formula | `attributed / measured`, computed separately per tree |
| **Legacy** | **650 / 650 = 100 %** (0 unattributed) |
| **Modern** | **206 / 206 = 100 %** (0 unattributed) |
| Exclusions | none — this is the point: an exclusion here would hide a capability |
| Source | `Evidence/artifacts/feature-parity.json` (`legacySourceUnattributed`, `modernSourceUnattributed`) |
| Method note | attribution is by declared path in a capability row, **not** by filename similarity; a file is attributed only if a row names it (file or directory) as part of that capability |
| History | modern attribution was **138/206 (68 unattributed)** before V4 added rows `FP-A25`, `FP-A26`, `FP-D15`; those 68 files were real consumers of tracked surfaces (AI settings, settings panels, guards, providers), not noise |

## M4 — Capability parity distribution

| Field | Value |
|---|---|
| Unit | capability row (a behaviour, decomposed to subfeature level where the mandate requires) |
| **Value (V6)** | **112 rows** — 12 `FULL PARITY`, 47 `PARTIAL PARITY`, 32 `MISSING`, 12 `MOCK / FABRICATED STATE`, 6 `REPLACED BY EQUIVALENT`, 0 `STATIC STUB`, 0 `LOCAL-ONLY PERSISTENCE`, 0 `INTENTIONAL RETIREMENT`, 3 `UNVERIFIED` (V5 published 19/43/32/9/6/3; the V5 line is kept in `FINAL-AUDIT-HANDOVER.md` §2) |
| **Value (V4, superseded)** | 28 / 36 / 30 / 9 / 6 / 3 — eight `FULL` rows rested on endpoints that do not exist (DISC-025) |
| Denominator | 112 |
| Formula | `count(classification) / 112`; each row ≥1 legacy anchor and, where it exists, ≥1 modern anchor |
| Exclusions | none; `INTENTIONAL RETIREMENT` is zero because **no documented retirement decision exists anywhere** in the repository (grep for retirement/deprecation records → none) |
| Source | `FEATURE-PARITY-MATRIX.md` (rendered), `Evidence/artifacts/feature-parity.json` (machine) |
| Inclusion rule (V6) | a `FULL PARITY` row must have every declared endpoint resolve to a registered operation, that operation must be reachable, **and** its subfeatures must be present in the modern source — the first two are checked by `tools/parity-endpoint-audit.cjs` (12/12 `SUPPORTED`), the third was applied by hand to all 19 V5-FULL rows in V6 (7 failed). A route definition, a React page or an API reference count is never sufficient |
| **Do not report** | a single "% parity" number. 29 % of rows are `MISSING` while 17 % are `FULL`; their average describes nothing real |

## M5 — Backend operation reachability

| Field | Value |
|---|---|
| Unit A (registrations) | `router.<verb>` / `app.<verb>` / `app.all` call sites = **499** |
| Unit B (unique `METHOD+path`) | **385** — **this is the only denominator used for reachability** |
| Collapsed | 114 duplicates (same method+path registered twice, e.g. `index.js` + module route) |
| Unit C (handlers) | 385 (one inline handler per unique operation) |
| Unit D (DB operations) | **not counted** — not enumerable from route declarations; mixing it in would invalidate every percentage |
| Exclusions | test trees are never callers; route-definition files are never callers; a string mention in display metadata is never a call |
| Formula | `count(class) / 385` per class, classes assigned by first-match rule R1→R7→R7b→R2→R3→R5→R4→R6 |
| **Values (V5)** | UI-REACHABLE 152 (39.5 %), INDIRECTLY-REACHABLE 7 (1.8 %), EXTERNAL-CALLER 27 (7.0 %), SERVER-ONLY 11 (2.9 %), INTENTIONALLY-UNEXPOSED 2 (0.5 %), UNREACHABLE 176 (45.7 %), UNVERIFIED 10 (2.6 %), over **385** operations |
| **Values (V4, superseded)** | UI 126 / indirect 6 / external 27 / server 11 / machine 9 / unreachable 201 / unverified 4, over 384 — wrong in both directions (DISC-024) |
| Derived measures (V5) | live UI path (UI+indirect) 159/385 = 41.3 %; no modern call site 226/385 = 58.7 %; never referenced by either frontend 153/385 = 39.7 %; legacy-called-but-modern-dropped 23/385 = 6.0 % |
| Source | `BACKEND-OPERATION-REACHABILITY.md`; `Evidence/artifacts/backend-reachability.json`, `backend-operations.tsv` |
| Supersedes | `backend-ui-coverage.cjs` binary split (192 / 58) — kept for provenance, **not** used for any V4 claim |

## M6 — Legacy-UI-callable backend operations still UI-callable

| Field | Value |
|---|---|
| Numerator | 56 — operations called by the legacy UI that also have a modern call path (55 `UI-REACHABLE` + 1 `INDIRECTLY-REACHABLE`) |
| Denominator | 82 — operations the legacy UI called (`legacyUiRefs` non-empty) |
| **Value** | **56 / 82 = 68.3 %** |
| The other 26 | 23 `UNREACHABLE` (candidate regressions), 3 `EXTERNAL-CALLER` (now driven by a provider instead of the browser) |
| V4 figure, superseded | 14 / 82 = 17.1 % — wrong, and wrong in the alarming direction: the 45 enterprise operations the classifier could not see were most of the difference (DISC-024) |
| Caveat | legacy call detection uses the same call-site rule on `src/`; it is **not** a statement about a deployed legacy app (there is none) |
| Source | `backend-reachability.json` field `legacyUiRefs` |

## M7 — Test execution

| Field | Value |
|---|---|
| Unit | one `node --test` test case at this revision |
| Backend (canonical, V5) | 1,315 discovered / **1,315 executed** / **1,269 pass** / 46 fail / **0 skip**, 70.8 s, exit 1 — `cd backend && npm test` |
| Backend (V4, superseded) | 1,271 pass / 14 fail / 30 skip — the repo's MariaDB gate was left off, so 30 tests were reported as skipped instead of executed |
| Enterprise | **187 / 187 pass**, 0 skip |
| Pass rate reported as | `pass / total` **and** `pass / (total − skipped)`: 1,269/1,315 = 96.5 %; with 0 skipped the two coincide, which is the point of running the canonical command |
| Exclusions | none. The 46 failures stay in the denominator; they are attributed individually in `Evidence/logs/v5/backend-canonical-suite.triage.md` |
| Frontend | `tsc --noEmit` = 0 errors; **0 of 3,675 enumerated Playwright tests executed** (no browser) |
| Source | `Evidence/logs/v5/backend-canonical-suite.log`, `.triage.md`; `Evidence/logs/v4/*.log` |
| Prior figures | "1,356 tests passing" (handover doc, never executed) — superseded by measurement |

## M8 — Audit-coverage of the *audit itself*

| Field | Value |
|---|---|
| Numerator | items with a reproducible disposition |
| Denominator | items enumerated |
| Files | 650 + 206 = 857 / 857 |
| Capability rows | 112 / 112 |
| Backend operations | 384 / 384 |
| Allegations | 35 / 35 |
| Findings | 22 / 22 |
| Requirements | 65 / 65 |
| Environment gaps | 12 / 12 + 5 accessibility defects |
| **Value** | **100 % dispositioned** — every enumerated item has a row with evidence and, where unresolved, an explicit class and closure condition |
| **Critical caveat** | this measures *traceability*, not product quality or parity. 100 % traceable coverage is compatible with 52.3 % of backend operations being unreachable. Anyone quoting "100 % coverage" without the next sentence is misrepresenting the package |

## M9 — Audited-vs-deferred surface (the honest denominator problem)

| Field | Value |
|---|---|
| Attempted | the earlier package's "14 % audited" style figures |
| V4 position | **not computable as a percentage** without a defensible denominator for "surface" |
| What is reported instead | per-unit dispositions (M8) plus per-class counts (M5, M4) |
| Rationale | a single "audited %" mixes files, routes, behaviours and runtime states; V4 refuses to average them |

## M10 — Verification level (per claim, not aggregate)

Each finding carries exactly one level:

| Level | Meaning | Count in this package |
|---|---|---:|
| `VERIFIED (executed)` | produced by an executed command whose output is stored | 5 runs (`node --check`, `tsc`, backend suite, enterprise suite, tool re-runs) |
| `STATICALLY VERIFIED` | proven by reading a closed code path with cited anchors | majority of DISC-019…022 and refutations |
| `RUNTIME VERIFIED (temp env)` | executed in the earlier temporary environment (axe/Chromium) | DISC-008…012 only |
| `BLOCKED` | requires DB/browser/provider/Apache | EG-007…EG-011 |
| `UNVERIFIED` | evidence ambiguous, class recorded rather than guessed | 4 backend ops, 3 capability rows, RA-35 |

**No level is inferred from another.** A statically verified defect is not "probably confirmed at
runtime", and an executed test that only exercises a mock is `VERIFIED (executed)` about the mock.

## M11 — Client→server contract conformance

| Field | Value |
|---|---|
| Unit | one HTTP path literal passed to a call helper in `frontend/src` (a *call site*, not a route) |
| Numerator | **199** — 188 exact matches to a registered operation + 11 matches to a registered dynamic pattern (`/admin/settings/branding` vs `/admin/settings/{X}`) |
| Denominator | **229** call sites over 205 files |
| **Value** | **199 / 229 = 86.9 % conforming; 30 call sites (13.1 %) over 23 distinct paths are served by no operation** |
| Inclusion rule | callee must be an HTTP helper (`get`/`post`/`patch`/`put`/`del`/`delete`/`fetch`/`*Request`/`api.*`/`axios`); an explicit `method:` in the options decides the verb; generic arguments may contain `;`, `{}` and newlines |
| Exclusions | `window.open` targets (client-side routes), `<Link to>`/`href`/`navigate(`, `.d.ts`, test files, `utils/snippets.ts` (documentation strings), relative asset paths, bare `?tab=` style query keys |
| What it does **not** claim | that a conforming call succeeds — auth, validation, entitlement and DB state can still fail; and that a non-conforming call is never served at runtime by a catch-all route (none exists) |
| Source | `tools/client-call-existence.cjs` → `Evidence/artifacts/client-call-existence.json`; findings in DISC-025 |

## M12 — Admin write-action truthfulness (inspected subset, not a percentage of the console)

| Field | Value |
|---|---|
| Unit | an admin control that issues a write and then displays a success state |
| Inspected | **4** (suspend/reactivate user, trigger backup, clear cache, delete blog article) |
| Truthful | **0** — all four swallow the failure with `.catch(() => {})` and then mutate local state or print a success message; two of them write to endpoints that do not exist at all |
| Denominator caveat | **n = 4 is not the console.** These are the write paths reached while chasing DISC-025; the console has 30 modules and the remaining write paths were not audited for this pattern. The figure is therefore reported as `0 of 4 inspected`, never as "0 % of admin actions" |
| Inclusion rule | a control qualifies only if the failure branch is unreachable *by construction* (`.catch(() => {})`) and a success state is set unconditionally afterwards |
| Source | `DISCREPANCY-LOG.md` DISC-026 with line anchors; `AdminUsersTab.tsx:206`, `AdminOperationsTab.tsx:122,136`, `AdminBlogManagementTab.tsx:126` |

## Scorecard summary (12 dimensions, never averaged)

| # | Dimension | Value | Denominator class |
|---|---|---|---|
| M1 | Legacy source surface | 650 files / 519 `.jsx` / 193,310 lines | counted |
| M2 | Modern source surface | 206 files / 151 `.tsx` / 68,812 lines | counted |
| M3 | File attribution | 650/650 and 206/206 | counted |
| M4 | Capability parity | 19 / 43 / 32 / 9 / 6 / 3 of 112 | classified |
| M5 | Operation reachability | 152 / 7 / 27 / 11 / 2 / 176 / 10 of 385 | classified |
| M6 | Legacy-called still callable | 56 of 82 (68.3 %) | derived |
| M7 | Test execution | 1,269 of 1,315 pass; 0 of 3,675 browser tests executed | executed |
| M8 | Audit self-coverage | every unit in §1 of the reconciliation carries a class | counted |
| M9 | Audited-vs-deferred | **not computable** — refused by design | — |
| M10 | Verification level | per claim (executed / static / runtime-temp) | classified |
| M11 | Client→server conformance | 199 of 229 call sites (86.9 %) | executed (static parse) |
| M12 | Admin write truthfulness | 0 of 4 inspected | inspected subset |

**Why the summary has no total:** M9 is not computable, M12's denominator is a subset, and M4/M5 are
distributions rather than scores. Summing them would manufacture a number that no measurement supports —
the same failure mode that produced V4's over-claimed `FULL PARITY` rows.

## M13 — Subfeatures re-verified line-by-line (V6)

| Field | Definition |
|---|---|
| Unit | one user-visible subfeature row in `FEATURE-DEPTH-EVIDENCE-REGISTER.md` §3 |
| Numerator | subfeatures with a legacy anchor **and** a modern anchor **and** a verdict |
| Denominator | 74 adjudicated subfeatures |
| Exclusions | subfeatures present in only one tree (recorded as modern-only or removed, not scored) |
| Formula | 74 / 74 |
| Source | depth register §3 |
| What it does **not** prove | that the other 99 capability rows have this depth — they do not |

## M14 — Allegations dispositioned (V6)

8 of 8 mandated allegations carry an explicit disposition (`CONFIRMED` ×7, `CONFIRMED — scoped` ×1 for F03).
Denominator is the mandate's list, not the register total (48). Source: depth register §2.1.

## M15 — FULL rows challenged (V6)

19 V5-FULL rows re-read → **19/19**. 7 failed (36.8 %). Survivors 12/19 = **63.2 %**. Exclusions: none;
a row already `PARTIAL`/`MISSING` is not counted. Source: `feature-parity.json`, depth register §2.2.

## M16 — Client call sites resolving to a registered operation (V6)

| Field | Definition |
|---|---|
| Numerator | 199 call sites whose normalised path matches a registered operation |
| Denominator | 229 call sites across 205 files |
| Exclusions | none in the numerator; the *defect* metric below excludes 2 benign fallbacks |
| Formula | 199 / 229 = 86.9 % |
| Source | `client-call-existence.json`, `parity-depth-checks.json` check 9 |
| Warning | do not read 86.9 % as "86.9 % of features work" — a call site is not a workflow |

## M17 — Defective dead call sites

27 sites / 17 distinct paths (2 further sites are dead fallbacks behind a working primary call).
Formula 27 / 229 = 11.8 % of call sites. **Not comparable to M16** (different denominator rule).

## M18 — Fabricated-state components

10 components render invented records as live (`FEATURE-DEPTH-EVIDENCE-REGISTER.md` §4) out of 206 modern
files. Reported as context only: the denominator is files, the numerator is components, so the ratio is
**not** a percentage of anything meaningful and is not published as one.

## M19 — Detector precision on adjudication

Of the 10 automated checks, 4 returned PASS and 6 returned leads. Leads adjudicated: 4 (check 8) rejected
as attribution breadth, 10 (check 10) reclassified as domain bleed with 2 real residues, 4 of 17
(check 2) rejected as correct error paths. Adjudicated false positives: **18 of 57 leads** (31.6 %).
Formula: 18 / 57. Source: depth register §6.

## M20 — Runtime coverage (unchanged, and the reason the verdict is not COMPLETE)

Browser: 0 of 3,675 enumerated Playwright tests; database: 0 MariaDB-backed tests executed; providers: 0
live calls. Denominator fixed by the enumerated suites, not by ambition. Source: `RUNTIME-VERIFICATION-V4.md`.
