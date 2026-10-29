# M8C — Shared-Corpus Reconstruction

**Mandate:** 8C §4 (P0). **Audited revision:** `69a3ed4`. **Register snapshot:** `feature-parity.json` (112 rows).
**Machine-readable ledger:** `Evidence/artifacts/m8c-corpus-scoping.json` (62 row declarations).
**Reproduce:** `python3 developer-review/tools/m8c-scope-corpus.py` and
`python3 developer-review/tools/m8c-blast-radius.py`.

This document reconstructs every capability row whose declared legacy corpus is shared with another
row. It does **not** assume that sharing is a defect. Two rows can share a corpus correctly (one
directory, two properties of the same capability); the defect is narrower — measuring a capability
over a corpus that also implements *other* capabilities, so that one row's subfeature counts include
another capability's work.

---

## 1. How the rows were identified

Identification was by evidence, not by a count:

1. **Corpus identity.** Group rows whose declared `(paths, files, lines)` tuple is identical.
   Result: **18 rows in 7 groups** (M8B's "8 groups" counted FP-A14/FP-A15 as their own group; the
   settings directory is one group of four rows).
2. **Distribution identity, as an independent probe.** Group rows whose *stored subfeature
   distribution* in `capability-subfeatures.json` is identical. Result: **19 rows**, and the
   nineteenth was `FP-F09`, which the tuple grouping missed because FP-F09's declared corpus adds one
   file (`src/components/Analytics.jsx`) to the same directory.

The two methods disagreeing by exactly one row is itself the evidence that FP-F09's measurement came
from the directory rather than from its declared corpus: adding a file that contributes no classes
cannot change a distribution, and it did not. Verifier check **C12** now enforces that any row whose
stored distribution coincides with another's must declare why, so this class of miss cannot recur
silently.

A third, degenerate pair is handled separately. `FP-A02` and `FP-A04` declare **no paths and zero
files** and share an empty corpus; their findings concern fabricated values, not capabilities. They
are `no-corpus`, not a shared corpus, and are excluded from the 19.

`FP-A14` and `FP-A15` were reconstructed by M8B and are carried forward, not re-derived here.

---

## 2. The 19 rows, before and after

| Row | Class | Published corpus | Capability-scoped corpus | Disposition | Status |
|---|---|---|---|---|---|
| `FP-A14` | MISSING | 35 f / 14,191 L | 1 f / 288 L | capability-scoped | VERIFIED (M8B) |
| `FP-A15` | MISSING | 35 f / 14,191 L | 1 f / 314 L | capability-scoped | VERIFIED (M8B) |
| `FP-A16` | PARTIAL PARITY | 35 f / 14,191 L | 2 f / 2,092 L | capability-scoped | VERIFIED |
| `FP-A21` | PARTIAL PARITY | 35 f / 14,191 L | 8 f / 1,552 L | capability-scoped | VERIFIED |
| `FP-F01` | PARTIAL PARITY | 12 f / 2,100 L | 6 f / 987 L | capability-scoped | VERIFIED |
| `FP-F02` | PARTIAL PARITY | 12 f / 2,100 L | 1 f / 752 L | capability-scoped | VERIFIED |
| `FP-F05` | FULL PARITY | 12 f / 2,100 L | 3 f / 1,461 L | capability-scoped | VERIFIED |
| `FP-F06` | PARTIAL PARITY | 12 f / 2,100 L | 4 f / 1,331 L | capability-scoped | VERIFIED |
| `FP-F09` | UNVERIFIED | 13 f / 2,111 L | 1 f / 174 L | capability-scoped | PARTIALLY VERIFIED |
| `FP-A08` | MOCK / FABRICATED | 68 f / 29,850 L | 1 f / 333 L | capability-scoped | VERIFIED |
| `FP-A19` | MOCK / FABRICATED | 68 f / 29,850 L | 1 f / 273 L | capability-scoped | VERIFIED |
| `FP-B02` | PARTIAL PARITY | 1 f / 973 L | 1 f / 756 L | capability-scoped | VERIFIED |
| `FP-B03` | MISSING | 1 f / 973 L | 1 f / 70 L | capability-scoped | VERIFIED |
| `FP-E02` | PARTIAL PARITY | 73 f / 13,985 L | 73 f / 13,985 L | legitimate-share | VERIFIED |
| `FP-E03` | PARTIAL PARITY | 73 f / 13,985 L | 73 f / 13,985 L | legitimate-share | VERIFIED |
| `FP-E04` | FULL PARITY | 1 f / 349 L | 1 f / 242 L | capability-scoped | VERIFIED |
| `FP-E05` | UNVERIFIED | 1 f / 349 L | 1 f / 14 L | capability-scoped | VERIFIED |
| `FP-C01` | PARTIAL PARITY | 2 f / 1,789 L | 2 f / 1,789 L | capability-scoped | VERIFIED |
| `FP-C04` | PARTIAL PARITY | 1 f / 1,743 L | 1 f / 1,743 L | nested-corpus-explained | PARTIALLY VERIFIED |

Seven declared corpora, nineteen rows: `admin/settings` (4), `EmployerPortal` (5), `admin` (2),
`EnterpriseUsersTab.jsx` (2), `cv-templates` (2), `AtsScoreMeter.jsx` (2), `PortfolioBuilder` (2).

---

## 3. Group by group

### 3.1 `src/components/admin/settings` — 4 rows, 35 files, 14,191 L

The directory implements four distinct capabilities. All four rows published the whole-directory
volume (35 f / 14,191 L), so every row's subfeature counts included the other three rows' work.
M8B proved this for FP-A14/FP-A15 by reproducing the published `14/10/28/100/18/1/10/5/87` exactly
from the 35-file directory; the same construction holds for FP-A16 and FP-A21 because they carry the
identical tuple.

- `FP-A14` (coupons) → region **2390–2677** of `subscriptionsSettings.jsx` → 288 L.
- `FP-A15` (invoices) → region **1356–1669** of `subscriptionsSettings.jsx` → 314 L.
- `FP-A16` (email/SMS providers) → `EmailSmtpSettings` + `TwilioSmsSettings` → 2 f / 2,092 L.
- `FP-A21` (service configuration) → the eight provider files → 8 f / 1,552 L.

Overlap handling: A14 and A15 are **sub-regions of one file** and A16/A21 are **file selections over
the same directory**; no two rows therefore measure the same lines except where a region boundary is
shared (a section heading belongs to both). That overlap is declared, not silently subtracted.

### 3.2 `src/components/EmployerPortal` — 5 rows, 12 files, 2,088 L

The most consequential case, because it contains a **FULL PARITY** row.

- `FP-F01` → 6 f / 987 L (posting lifecycle and its dialogs).
- `FP-F02` → 1 f / 752 L (`EmployerApplicantPipeline.jsx`).
- `FP-F05` → 3 f / 1,461 L. Its published corpus was `EmployerJobPostings.jsx`, a **25-line
  wrapper**; the real editor lives in `Dashboard/EmployerDashboard/`. A wrapper-only corpus scores
  zero classes, which is exactly what the first pass produced — a false result. The capability lives
  outside the declared directory, so the row is `CORPUS_INCOMPLETE`, not "absent".
- `FP-F06` → 4 f / 1,331 L. Same shape: `EmployerCompanyProfile.jsx` is a **27-line wrapper** onto
  `Dashboard/EmployerDashboard/CompaniesManagement.jsx`.
- `FP-F09` → 1 f / 174 L. `src/components/Analytics.jsx` is a **10-line stub**
  (`export async function Analytics()`), so the declared 13-file corpus reduced to the directory.
  The real analytics capability is `EmployerOverview.jsx`, lazily routed at the EmployerPortal index
  route (`EmployerPortal.jsx:18,135`) and rendering live metrics from `useEmployerWorkspace`
  (`activeJobs`, `totalApplications`, `totalCompanies`, per-status funnel counts).

FP-F09 remains **PARTIALLY VERIFIED**: the scoped implementation and its route are proven; its
runtime telemetry is not, because the metrics come from a hook whose own data path is unexercised in
this environment.

### 3.3 `src/components/admin` — 2 rows, 68 files, 29,850 L

The widest corpus in the register: a recursive directory of 68 files, larger than the entire modern
frontend's component layer for this area.

- `FP-A08` → `operations/PlatformOperations.jsx`, 1 f / 333 L.
- `FP-A19` → `HelpDesk.jsx`, 1 f / 273 L.

Both remain `MOCK / FABRICATED STATE`. Scoping changes the *volume* of the claim, not its
classification: the fabrications are in those two files, and DISC-026/DISC-029 already cite them.

### 3.4 `src/enterprise/components/EnterpriseUsersTab.jsx` — 2 rows, 973 L

One file, two capabilities, measured with line-range boundaries rather than file selection:

- `FP-B02` → 756 L (the user table, bulk actions, role filters).
- `FP-B03` → 70 L (the invite flow).

`FP-B03` is `MISSING`; its 70 scoped lines are the invite affordance that remains, which is
consistent with the finding that invites "succeed" without a request rather than being absent.

### 3.5 `src/cv-templates` — 2 rows, 73 files, 13,985 L — **legitimate share**

This is the case that must **not** be condemned. Two capabilities — template volume and template
diversity — are genuinely properties of one directory. Neither row misattributes another capability's
work; they measure different *properties* of the same corpus. Their identical distributions are
therefore expected, and the M8C verifier skips them as a **declared legitimate share** rather than
treating them as duplication.

The distinction matters for the blast radius: 2 of 53 bare-directory rows are `SUPPORTED`, not
`CORRECTED`.

### 3.6 `src/components/BuildResume/AtsScoreMeter.jsx` — 2 rows, 349 L

- `FP-E04` → 242 L; classified **FULL PARITY**, and the full-parity claim survives scoping: the
  scoring engine is client-side `lib/atsScore.js` plus this renderer.
- `FP-E05` → 14 L; stays **UNVERIFIED**. A repository-wide search of `backend/` finds **no ATS
  route** — only quota-stats, audit and user-stats registrations. A 14-line corpus could not support
  any backend claim, and none is made.

### 3.7 `src/components/PortfolioBuilder` — 2 rows, nested corpora

- `FP-C01` → `LegacyPuckEditor.jsx` + `PortfolioBuilder.jsx`, 2 f / 1,789 L.
- `FP-C04` → `PortfolioBuilder.jsx` alone, 1 f / 1,743 L.

Measured directly: `LegacyPuckEditor.jsx` is **45 lines and contributes zero subfeature classes**;
every class in both rows comes from `PortfolioBuilder.jsx`. FP-C04's corpus is a strict subset of
FP-C01's, so the identical distribution is mathematically forced.

This is recorded as `nested-corpus-explained`, and the row keeps `status: PARTIALLY_VERIFIED` with
`requiresCorrection: true`: the duplication is **explained, not eliminated**. FP-C04's measurement
still describes FP-C01's implementation and is not an independent measurement; its subfeature table
needs sub-region scoping (editing entry point vs creation editor) before it can be read as its own
inventory.

---

## 4. Independence of the reconstruction

Each capability-scoped volume was recomputed from the files themselves, not taken from a report: the
scope tool maps a row to concrete files, counts lines from the working tree at the audited revision,
and recomputes the subfeature classes with the same class patterns the register's generator uses.
Where a scope is a line range (FP-A14, FP-A15, FP-B02, FP-B03, FP-E04, FP-E05) the range is stated
and the count is the range length.

Class recomputation examples (from `m8c-scope-corpus.py --json`):

- `FP-A16` → `{table: 2, filter: 6, pagination: 26, modal: 8, json: 8, authz: 25}`
- `FP-A21` → `{table: 2, filter: 1, pagination: 7, modal: 1, json: 2, document: 2, authz: 10}`
- `FP-F02` → `{table: 2, search: 3, filter: 4, pagination: 7, modal: 6, document: 8, print: 1}`
- `FP-B03` → `{bulk: 3, authz: 1}`
- `FP-A08` → `{pagination: 1, modal: 1, authz: 11}`
- `FP-F05` → `{search: 7, filter: 10, sort: 4, pagination: 2, modal: 4}` — the earlier all-zero
  result was the wrapper artefact, not an absence of capability.
- `FP-F09` → `{pagination: 1, authz: 3}` on `EmployerOverview.jsx`.

---

## 5. Impact on the register

- **Volume.** Scoping reduces the reported corpus of 17 rows; the two legitimate-share rows are
  unchanged. The published volume of `FP-A08` falls from 29,850 L to 333 L, a 89.7-fold reduction,
  and that is the largest single correction in the register.
- **Classification.** **No classification changes.** Scoping corrects what a row was measured over,
  not what it was found to be. `FP-F05` stays `FULL PARITY` (its implementation exists and is wired);
  `FP-F09` stays `UNVERIFIED`; `FP-A08`/`FP-A19` stay `MOCK / FABRICATED`.
- **Distributions.** The stored distributions in `capability-subfeatures.json` are **stale** for
  these rows — they are the directory-wide measurement. Nineteen rows now declare
  `artifactDistributionStale` in the overlay. The artifact is **not** rewritten, because rewriting it
  would erase the audited record; the supersession is declared instead (§8 of the mandate).
- **Verifier.** Checks C03–C06 and the new C12 consume these declarations. A row declared
  `capability-scoped` is measured on its scoped corpus; a row declared
  `directory-unreconstructed` remains **UNVERIFIED** and C03 reports it as such.

---

## 6. What is still not reconstructed — stated precisely

**41 bare-directory rows remain `directory-unreconstructed` and UNVERIFIED.** They are not scoped,
not silently accepted, and not counted as verified anywhere in this report. For each, the missing
evidence is the same and is stated exactly:

> The row declares one or more directories as its corpus and no file-level or line-range boundary.
> To reconstruct it, the capability's own implementation must first be identified (by route, entry
> point or component import), and only then can a file/line boundary be drawn. That identification
> has not been done for these rows.

`m8c-blast-radius.py --json` lists them individually with their resolved file counts, so the work
ahead is enumerated rather than estimated. Three of the 53 bare-directory rows are *mixed* path rows
(directory plus file) and are handled with the directory portion resolved as declared.

---

## 7. Blast radius

Per-row table: `Evidence/artifacts/m8c-blast-radius.json` (`rows[]`), summarised here.

| Measure | Value |
|---|---|
| Rows with a corpus | 110 of 112 |
| Bare-directory rows (every declared path a directory) | **53** |
| Rows with at least one directory path | 69 (16 mixed) |
| Distinct directory groups | 60 |
| Per-row resolved sum | **1,212** files (deduplicated within each row) |
| Distinct measured files | 650 |
| Inflation factor | **1.865×** (published 1.86× reproduces) |

Bare-directory verdicts: **CORRECTED 10**, **SUPPORTED 2**, **UNRESOLVED 41**. The ten corrected
rows are the capability-scoped rows in the table above that have no file-level path; the two
supported rows are the `cv-templates` legitimate share. A directory-scoped row is not automatically
defective, and 2 of 53 prove it.

Largest groups by resolved volume: `EmployerPortal` (12 f, 5 rows), `admin/settings` (35 f, 4 rows),
`admin` (68 f, 2 rows), `cv-templates` (73 f, 2 rows, legitimate), and two single-row groups over
multiple directories (`Actions`+`Boards`+`community`, 61 f; `AppShell`+`Dashboard/Cover…`, 28 f).

---

## 8. Limits of this reconstruction

1. Scoping proves **where** a capability's code lives; it does not prove the capability runs. All 19
   rows remain static findings.
2. A line range is a judgement about where a feature begins and ends. Ranges are stated so a reader
   can contest them; they are not derived by a parser.
3. Class recomputation uses pattern matching and can over- or under-count (a `Modal` import that is
   never used still counts). It is comparable to the register's own method, not better than it.
4. FP-F09's route is proven; its metrics' data path is not.
5. FP-C04's duplication is explained; its own subfeature inventory is still not isolated.
