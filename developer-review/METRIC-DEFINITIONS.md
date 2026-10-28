# Metric Definitions (V4)

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
| **Value** | **651 files**, **519 `.jsx`**, **193,320 lines** |
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
| **Legacy** | **651 / 651 = 100 %** (0 unattributed) |
| **Modern** | **206 / 206 = 100 %** (0 unattributed) |
| Exclusions | none — this is the point: an exclusion here would hide a capability |
| Source | `Evidence/artifacts/feature-parity.json` (`legacySourceUnattributed`, `modernSourceUnattributed`) |
| Method note | attribution is by declared path in a capability row, **not** by filename similarity; a file is attributed only if a row names it (file or directory) as part of that capability |
| History | modern attribution was **138/206 (68 unattributed)** before V4 added rows `FP-A25`, `FP-A26`, `FP-D15`; those 68 files were real consumers of tracked surfaces (AI settings, settings panels, guards, providers), not noise |

## M4 — Capability parity distribution

| Field | Value |
|---|---|
| Unit | capability row (a behaviour, decomposed to subfeature level where the mandate requires) |
| **Value** | **112 rows** — 28 `FULL PARITY`, 36 `PARTIAL PARITY`, 30 `MISSING`, 9 `MOCK / FABRICATED STATE`, 6 `REPLACED BY EQUIVALENT`, 0 `STATIC STUB`, 0 `LOCAL-ONLY PERSISTENCE`, 0 `INTENTIONAL RETIREMENT`, 3 `UNVERIFIED` |
| Denominator | 112 |
| Formula | `count(classification) / 112`; each row ≥1 legacy anchor and, where it exists, ≥1 modern anchor |
| Exclusions | none; `INTENTIONAL RETIREMENT` is zero because **no documented retirement decision exists anywhere** in the repository (grep for retirement/deprecation records → none) |
| Source | `FEATURE-PARITY-MATRIX.md` (rendered), `Evidence/artifacts/feature-parity.json` (machine) |
| **Do not report** | a single "% parity" number. 25 % of rows are `MISSING` while 25 % are `FULL`; their average describes nothing real |

## M5 — Backend operation reachability

| Field | Value |
|---|---|
| Unit A (registrations) | `router.<verb>` / `app.<verb>` call sites = **498** |
| Unit B (unique `METHOD+path`) | **384** — **this is the only denominator used for reachability** |
| Collapsed | 114 duplicates (same method+path registered twice, e.g. `index.js` + module route) |
| Unit C (handlers) | 384 (one inline handler per unique operation) |
| Unit D (DB operations) | **not counted** — not enumerable from route declarations; mixing it in would invalidate every percentage |
| Exclusions | test trees are never callers; route-definition files are never callers; a string mention in display metadata is never a call |
| Formula | `count(class) / 384` per class, classes assigned by first-match rule R1→R7→R2→R3→R5→R4→R6 |
| **Values** | UI-REACHABLE 126 (32.8 %), INDIRECTLY-REACHABLE 6 (1.6 %), EXTERNAL-CALLER 27 (7.0 %), SERVER-ONLY 11 (2.9 %), INTENTIONALLY-UNEXPOSED 9 (2.3 %), UNREACHABLE 201 (52.3 %), UNVERIFIED 4 (1.0 %) |
| Derived measures | live UI path (UI+indirect) 132/384 = 34.4 %; no modern call site 250/384 = 65.1 %; never referenced by either frontend 183/384 = 47.7 %; legacy-called-but-modern-dropped 67/384 = 17.4 % |
| Source | `BACKEND-OPERATION-REACHABILITY.md`; `Evidence/artifacts/backend-reachability.json`, `backend-operations.tsv` |
| Supersedes | `backend-ui-coverage.cjs` binary split (192 / 58) — kept for provenance, **not** used for any V4 claim |

## M6 — Legacy-UI-callable backend operations still UI-callable

| Field | Value |
|---|---|
| Numerator | operations called by the legacy UI that also have a modern call site |
| Denominator | operations called by the legacy UI |
| **Value** | **14 / 82 = 17.1 %** — of the 82 operations the legacy UI called, only 14 still have a modern call site. The other 68 split: 57 `UNREACHABLE`, 7 `INTENTIONALLY-UNEXPOSED`, 3 `EXTERNAL-CALLER`, 1 `INDIRECTLY-REACHABLE` |
| Caveat | legacy call detection uses the same call-site rule on `src/`; it is **not** a statement about the deployed legacy app (there is none) |
| Source | `backend-reachability.json` field `legacyUiRefs` |

## M7 — Test execution

| Field | Value |
|---|---|
| Unit | `node --test` test cases at this revision |
| Backend | 1,315 tests → **1,271 pass**, 14 fail, **30 skip**, 69,414 ms |
| Enterprise | **187 / 187 pass**, 0 skip |
| Pass rate reported as | `pass / (total − skipped)` where stated, else `pass / total`; **both quoted** for the backend: 1,271/1,315 = 96.7 %, and 1,271/1,285 = 98.9 % excluding skips |
| Exclusions | none. Failures are **not** removed on the grounds of being environment-caused; they stay in the denominator and are triaged in `RUNTIME-VERIFICATION-V4.md` §3 |
| Frontend | `tsc --noEmit` = 0 errors; **0 Playwright tests executed** (no browser) |
| Source | `Evidence/logs/v4/*.log` |
| Prior figure | "1,356 tests passing" (from a handover doc, not executed) and "1,545 executed" (1,315+187+43 across suites) — both superseded by this measured run |

## M8 — Audit-coverage of the *audit itself*

| Field | Value |
|---|---|
| Numerator | items with a reproducible disposition |
| Denominator | items enumerated |
| Files | 651 + 206 = 857 / 857 |
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
