# M8C — Final Forensic Closure Report

**Mandate:** 8C (final forensic defect closure, register reconciliation, local runtime handoff).
**Mode:** audit-only. **Audited revision:** `69a3ed4`. **Application code changed: 0.**

**Verdict: `PARTIAL — INCOMPLETE`.** Justification in §10.

Companion documents:

| § | Document |
|---|---|
| 4 | `M8C-SHARED-CORPUS-RECONSTRUCTION.md` |
| 5 | `M8C-CAPABILITY-DENOMINATOR-RECONCILIATION.md` |
| 6 | `M8C-FILE-INVENTORY-RECONCILIATION.md` |
| 3 | `M8C-INTEGRITY-VERIFIER-FAILURE-ANALYSIS.md` |
| 9 | `M8C-RUNTIME-LOCAL-EXECUTION-MANIFEST.md` |
| 8 | `M8C-REGISTER-AND-EVIDENCE-DELTA.md` |
| 10 | `M8C-METHOD-LIMITATIONS.md` |

---

## 1. Revision and provenance

| Item | Value |
|---|---|
| Branch | `arena/393531fe-resumepilotai` |
| HEAD at start of M8C | `160cab19c1f3a3d5fa8805ffdc8289907d5f7b6e` (= remote) |
| M8B commit | `11df652e109e5a925b615e82eece6f56627d295d` |
| Parent chain | `160cab1` → `11df652` → `69a3ed4` |
| Merges | none |
| Working tree at start | clean |
| Audited source revision | `69a3ed4` |
| M8C commits (no force-push, no rewrite) | `801f348` verifier closure · `5222477` deliverables |

Baseline was captured **before any edit** into `Evidence/logs/m8c-baseline/` (`EXITCODES.txt` +
4 logs): integrity verifier **exit 1, 6 PASS / 5 FAIL**; fixture harness 8/8; audit package 61/61;
V4 reconciliation 20/20. Post-correction run in `Evidence/logs/m8c-final/`: **integrity 12/12 exit 0**,
fixtures **13/13**, audit package **61/61**, V4 **20/20**.

## 2. Is the tree clean, and did any application file change?

**Application files changed: 0.** Every change is inside `developer-review/`. Verified with
`git diff --name-only` outside that directory: empty. No manifest, lockfile, deployment config or
application test was touched. Generated fixture copies (~13 MB) were excluded from version control
by a new `.gitignore` rather than committed.

## 3. The five verifier failures — disposition each

| Check | Baseline | Final | Class | Disposition |
|---|---|---|---|---|
| C03 corpus-scope | FAIL — 53 bare-directory rows, none declared | PASS — 12 scoped + **41 named UNVERIFIED** | reconciliation | **corrected** |
| C04 duplicate-corpus | FAIL — 101 corpora, incl. an empty-corpus pair | PASS — 109 corpora | verifier + reconciliation | **corrected** |
| C05 duplicate-dist | FAIL — 4 identical groups | PASS — 2 groups justified per *relationship* | verifier | **corrected and tightened** |
| C06 full-evidence | FAIL — 3 FULL rows, no endpoint, no rationale | PASS — 13 FULL rows checked | evidence | **corrected** |
| C10 verification-evidence | FAIL — `DISC-056` uncited; 32/56 findings statusless | PASS — 7 runtime claims checked | evidence (auditor's own) | **corrected**; 1 structural note retained |

No check deleted, no assertion weakened, no expected value changed, no per-row exemption added.
Count went 11 → 13 (C12 added). Every rule change has a stated rationale and a regression fixture;
**13/13 fixtures are rejected for the expected reason**.

**The honest failure:** C05 first failed *after* my own fix, because per-row justification skipping let
an unjustified row hide beside a justified partner. The mechanism was wrong, not the residue. Fixed at
group level — strictly stronger than the original — and the reasoning is published in
`M8C-INTEGRITY-VERIFIER-FAILURE-ANALYSIS.md` §4.

**The honest catch:** the new C12 check found a **19th** shared-corpus row (`FP-F09`) that both M8B
and my own first pass missed, because its declared corpus adds a 10-line stub to a directory.

## 4. Shared-corpus rows: reconstructed and unresolved

**19 rows share a corpus across 7 declared corpora** (M8B had 18; the 19th is `FP-F09`).

| Disposition | Count | Rows |
|---|---|---|
| Capability-scoped, with recomputed classes | 16 | `A14, A15, A16, A21, F01, F02, F05, F06, F09, A08, A19, B02, B03, E04, E05, C01` |
| Legitimate share (2 properties of 1 corpus) | 2 | `E02, E03` |
| Nested corpus (strict subset), explained but not isolated | 1 | `C04` |
| No corpus (fabricated values, not a capability) | 2 | `A02, A04` |
| **Unresolved: bare-directory rows still unreconstructed** | **41 of 53** | enumerated in `m8c-blast-radius.json` |

Key corrections: `FP-A08` from 29,850 L → **333 L**; `FP-F05`'s "zero subfeatures" was a **25-line
wrapper artefact** (its implementation is in `Dashboard/EmployerDashboard/`); `FP-F09` scoped to
`EmployerOverview.jsx` (174 L). **No classification changed** — scoping corrects what a row measured,
not what it was found to be.

The 41 unreconstructed rows are **not** scoped and **not** counted as verified anywhere. Missing
evidence, stated exactly: *the capability's own implementation has not been identified, so no
file/line boundary can be drawn; the row declares a directory and nothing narrower.*

## 5. Authoritative ledger: accepted / proposed / unverified

| Category | Count |
|---|---|
| **Accepted** (register rows) | **112** — FULL 13, PARTIAL 51, MISSING 28, MOCK 12, REPLACED 5, UNVERIFIED 3 |
| **Proposed, not accepted** | **5** — `FP-A27, FP-A28, FP-A29, FP-G26, FP-G27` (M8A `NEW_ROW` claims) |
| **Unverified** | **3** — `FP-E05, FP-F09, FP-G14` |
| **Rejected duplicates** | 0 capabilities (2 *findings* are merge aliases: `DISC-042`, `DISC-046` → `DISC-030`) |
| **Historical only** | 109 (V2), 112 (V6/V7/M8) |

**117 = 112 accepted + 5 unaccepted proposals.** That is the whole discrepancy.

**Exact parity denominator: 13 / 112 = 11.61%** strict FULL parity over accepted rows.
Full-plus-replaced: **18 / 112 = 16.07%**.

The two published figures reproduce exactly on the mixed universe: **11.1% = 13/117** (11.11%) and
**15.4% = 18/117** (15.38%). They were computed correctly on a denominator that silently included
five unaccepted proposals. Accepted-only equivalents are 11.61% and 16.07% — the correction moves the
register **up**, which is why nobody caught it.

## 6. 650 vs 651: resolved

**651 = every `.js`/`.jsx` file under `src/` at `69a3ed4`. 650 = the same set minus one excluded test
file, `src/components/welcome/App.test.js`.** Not a lost file, not a rename, not a case collision
(0 case collisions, 0 symlinks).

Additional finding: the register's corpus union reaches **651** distinct files — i.e. it excludes the
test file from its denominator (650) but includes it in its numerator (651). And "650/650 attributed"
is **trivially true**, not a coverage achievement: directory corpora recurse, giving **1,212 per-row
references over 650 distinct files = 1.865×**. No claim of point-level mapping is made from matching
totals.

## 7. Runtime: 35 probes, 23 test cases, 11 contract defects — three separate tallies

| Collection | Tally |
|---|---|
| **Probes** | 35: 5 × 2xx, 18 × 4xx, 11 × 5xx, 1 skipped — *never counted as passes* |
| **Test cases** | 23: **8 PASS**, **1 FAIL**, **12 BLOCKED**, **2 NOT APPLICABLE** |
| **Alleged client URL contract defects** | 11: **11 BLOCKED**, 0 confirmed at runtime |

The mandate's "8 PASS / 1 FAIL / 12 BLOCKED / 2 N/A" is **reproduced exactly** — but it is 23 test
cases, not 35 probes. The two must not be added: **browser E2E coverage is 0 of 12 browser-level
claims.** No BLOCKED or N/A result is counted as a pass, and no probe is upgraded into browser-level
correctness.

The single FAIL is real: `POST /api/users-data/profile {expectedRevision: 0}` → **409 `STALE_WRITE`**
while `GET` → **404 `PROFILE_NOT_FOUND`**.

## 8. Blockers and exact prerequisites

| Blocker | Prerequisite to unblock |
|---|---|
| MariaDB absent (`ECONNREFUSED 127.0.0.1:3306`) | disposable server on 3306, migrations **there only**, synthetic data; unblocks T6/T7/T11/T8b persistence legs |
| No browser (Playwright/Chromium) | `npx playwright install chromium` + dev server + synthetic admin session; unblocks 12 `-UI` cases and all 11 `RT-C` cases |
| Firebase credentials absent | emulator or sandbox identity; unblocks T8b |
| Payment provider keys absent | sandbox keys only, **no real charge**; settlement is the only missing leg (rejection already proven by T14) |
| Messaging module cannot be enabled | **product-side**: `POST /api/admin/settings/public_config` → 400; not an environment gap |
| 41 directory-unreconstructed rows | implementation identification per row, then a file/line boundary |

## 9. What this mandate deliberately did not do

No application code, tests, manifests, lockfiles or deployment config changed. No production data,
credentials or charges. No check deleted or weakened. No expected value altered (the one hand-pinned
value, `176` at `verify-v4-reconciliation.py:338`, is left and recorded). No history rewritten: the
delta is published alongside the record. **No production-readiness claim is made** — parity is not
audit completion and is not deployment fitness.

## 10. Verdict and justification

**`PARTIAL — INCOMPLETE`.**

Complete: provenance and pre-change baseline; all five verifier failures closed with justified,
individually-fixtured corrections; the authoritative ledger with mutually exclusive categories and
every published percentage reconciled; 650/651 resolved by enumeration; blast radius computed per row
(53 bare-directory rows, 1.865×, 10 corrected / 2 supported / 41 unresolved); the runtime manifest
built with three separate tallies; the delta published; nine deliverables produced.

Not complete, and not blocked:

1. **41 of 53 bare-directory rows remain unreconstructed.** They are declared and enumerated, and the
   missing evidence is stated exactly — but reconstructing them is feasible work that has not been
   done, and until it is, their volumes and subfeature counts must not be cited.
2. **`FP-C04`'s duplication is explained, not eliminated**; its own subfeature inventory still needs
   sub-region scoping.
3. **Browser-level claims are untested** (0 of 12). This part is genuinely blocked by the
   environment, but the *manifest* for closing it is now complete, per-test and per-prerequisite.

The verdict is `PARTIAL — INCOMPLETE` rather than `PARTIAL — BLOCKED` because items 1 and 2 are
feasible without new environment capabilities. If those were done and only the browser/provider
blockers remained, the correct verdict would become `PARTIAL — BLOCKED`.

Every count in this report is reproducible from a committed script or machine-readable artifact; none
is copied from a previous report.
