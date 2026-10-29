# M8D — Forensic Closure Report

**Mandate:** 8D — remaining forensic closure and independent acceptance. **Audit-only.**
**Audited source revision:** `69a3ed4`. **Application files changed: 0.**
**Verdict: `PARTIAL — INCOMPLETE`** — see §10.

Companion documents: `M8D-41-ROW-SOURCE-RECONSTRUCTION.md` · `M8D-M8C-CHANGES-INDEPENDENT-VALIDATION.md` ·
`M8D-CAPABILITY-LEDGER-RECONCILIATION.md` · `M8D-INVENTORY-AND-ATTRIBUTION-VALIDATION.md` ·
`M8D-REMAINING-FINDINGS-AND-BLOCKERS.md` · `M8D-LOCAL-RUNTIME-HANDOFF.md`.

---

## 0. The short version

M8C's primary outstanding task was 41 directory-scoped rows. **All 41 are now reconstructed**: 24
confirmed correct (to the line), **9 were contaminated**, 5 are justified shares, 3 are partially
reconstructed. The most severe: a **share modal** (`FP-E08`) credited with **16,941 lines** of the
entire resume builder — a **62× overstatement** — and a cover-letter row credited with the 72-file
template catalogue it does not import.

Validating M8C independently found **two holes in M8C's own verifier**: its C05 exemption could be
bypassed by placing a defective row beside a justified one, and **no check compared a row's declared
volume with its own files**, so quoted counts could be edited freely. Both are closed; fixtures went
**13 → 16**.

---

## 1. HEAD SHA and branch

| Item | Value |
|---|---|
| Branch | `arena/393531fe-resumepilotai` |
| HEAD at the start of M8D (= reported M8C HEAD, verified against remote) | `0bf550a85a7177170f9b7df3796a78d71ea44532` |
| Remote at the same moment | `0bf550a8…` — **equal**, no drift, no merges |
| Audited source revision | `69a3ed4` |
| M8D commit | `32a8ae91fc675bdb84e2800b48951cb3f1cc8e7d` (deliverables, tools, fixtures) |

The repository had **not** advanced beyond the reported M8C HEAD; no revision substitution was needed.

## 2. Working tree

Clean at the start (`git status --porcelain` → 0 lines) and clean at hand-off apart from the M8D
deliverables themselves, which are committed on this branch.

## 3. Application files changed: zero

`git diff --name-only 0bf550a..HEAD -- . ':(exclude)developer-review'` → **0 files**. Every change is
inside `developer-review/`. No application source, test, manifest, lockfile or deployment config was
touched. Generated fixture copies remain excluded from version control.

## 4. The 41 rows — outcome counts

| Disposition | Count | Rows |
|---|---|---|
| `VERIFIED — CORRECT` | **24** | A01, A03, A06, A09, A10, A11, A12, A13, A17, A22, A23, A24, C02, C05, C06, C07, D15, E13, E16, F08, G07, G09, G10, G22 |
| `CORRECTED — MEASUREMENT WAS CONTAMINATED` | **9** | A05, A07, A20, D12, D13, E08, E09, F10, G24 |
| `SHARED — JUSTIFIED WITH EVIDENCE` | **5** | D03, F11, G02, G15, G23 |
| `PARTIALLY RECONSTRUCTED` | **3** | A18, E01, G11 |
| `BLOCKED — SPECIFIC PREREQUISITE MISSING` | **0** | — |
| `UNRESOLVED — FURTHER FEASIBLE WORK REQUIRED` | **0** | — |
| **Total** | **41** | |

**Every VERIFIED row reproduces its published volume exactly (+0 lines)** under the register's own
counting convention — the strongest available self-check, and the reason the nine corrections stand
out rather than blending in.

Largest corrections: `FP-E08` 36f/16,941L → **1f/271L**; `FP-E09` 74f/15,832L → **2f/1,918L**;
`FP-A20` 5f/1,634L → 2f/713L; `FP-F10` 21f/7,818L → 17f/6,917L; `FP-A07` 1f/363L → **0f/0L**.

## 5. Independent validation of the M8C changes

| M8C item | M8D result |
|---|---|
| C03 corpus-scope | holds — 41 rows named UNVERIFIED rather than cleared, and 9 of them turned out wrong, vindicating the conservatism |
| C04 duplicate-corpus | holds — empty-corpus exclusion correct; `f9`/`f12` still fire |
| **C05 duplicate-dist** | **was bypassable** — group-level exemption let a defective row hide beside a justified pair. Replaced with per-row exemption propagating only through corpus containment; fixture `f14` now fires |
| C06 full-evidence | holds — rationales anchored per row; `f11` removes them and the failure returns |
| C10 verification-evidence | holds — `DISC-024…055` each carry one vocabulary value; **7** runtime claims, every cited path resolves (6 status fields + `DISC-056`'s composite status) |
| C12 artifact-staleness (M8C addition) | holds — 19 declarations |
| `FP-C04` nested corpus | confirmed — `LegacyPuckEditor.jsx` is 46 lines and yields **zero** classes |
| `FP-F09` scope problem | confirmed — `Analytics.jsx` is 10 lines (a live delegate, not dead code) |
| `DISC-056` citation | confirmed exactly — `InMemoryRepository.js:734` takes no options; `MySQLRepository.js:1814-1816` applies `AND published = 1` |
| 650/651 inventory | confirmed by re-enumeration from the git tree |
| 112 + 5 = 117 ledger | confirmed — 112 declared, 112 emitted, 5 proposals absent |
| runtime totals | confirmed — 35 probes → 23 test cases (8/1/12/2) → 11 contract defects (11 blocked) |

**Fixture coverage: 16**, all rejected for the expected reason. Bypass vectors tested individually:
omitted source path (`f3`), duplicated row (`f1`), **count manipulation (`f15`, `f16` — previously
undetected)**, **defect beside a justified row (`f14` — previously undetected)**, fabricated path,
wrong classification, wrong total, false closure.

**M8D made no check looser.** Two were tightened, one was added (C13 corpus-volume), and the baseline
still passes 13/13 — the tightening did not require the package to change.

## 6. Final capability counts and parity

| Quantity | Value |
|---|---|
| Accepted capabilities | **112** (FULL 13, PARTIAL 51, MISSING 28, MOCK 12, REPLACED 5, UNVERIFIED 3 — mutually exclusive, sums to 112) |
| Proposed, not accepted | **5** (`FP-A27, A28, A29, G26, G27`) |
| Combined universe | **117** — valid only when labelled provisional |
| **Accepted-capability parity (strict FULL)** | **13 / 112 = 11.61%** |
| **Full-or-replaced coverage** | **18 / 112 = 16.07%** |
| Provisional, accepted + proposed | 13/117 = 11.11% and 18/117 = 15.38% |
| Parity with UNVERIFIED excluded | 13 / 109 = 11.93% |
| Any implementation (FULL+PARTIAL+REPLACED) | 69 / 112 = 61.61% |

The published **11.1%** and **15.4%** both reproduce exactly on 13/117 and 18/117. They are correct
arithmetic on a denominator containing five proposals nobody accepted. Reconstructing nine corpora
changed **no** classification; it changed volume by up to 62×.

## 7. File inventory and attribution

| Population | Count |
|---|---|
| Inventoried (`.js`/`.jsx` under `src/` at `69a3ed4`) | **651** |
| Measured (tests excluded) | **650** — the excluded file is `src/components/welcome/App.test.js` |
| Attributed to ≥1 capability (distinct union) | **651** |
| Excluded from measurement | **1** |
| **Referenced by more than one capability** | **245** |
| Per-row reference inflation | **1.865× = 1,212 / 650** (numerator: per-row distinct files, deduped *within* each row; denominator: 650 measured) |

The union reaching 651 while the denominator is 650 is a real inconsistency: one row's directory
contains the excluded test file, so the register removes it from the denominator and counts it in the
numerator. And "650/650 attributed" is **trivially true, not point-level mapping** — 245 files are
claimed by two or more capabilities.

## 8. Remaining findings and exact prerequisites

New findings raised by M8D (full detail in `M8D-REMAINING-FINDINGS-AND-BLOCKERS.md` §5):

| ID | Finding |
|---|---|
| `M8D-01` | `FP-A07` has **no legacy implementation**; `handleBlockIp` is modern-only (`AdminSecurityTab.tsx:214`) |
| `M8D-02` | `FP-E08` share modal measured over the whole resume builder — 62× overstatement |
| `M8D-03` | `FP-E09` measured over the 72-file template catalogue it never imports — 8× |
| `M8D-04` | Register union 651 vs measured denominator 650 (test file counted both ways) |
| `M8D-05` | M8C's C05 exemption was bypassable — fixed, `f14` |
| `M8D-06` | No volume check existed — C13 added, `f15`/`f16` |

External prerequisites, exactly stated: **MariaDB** (T6/T7/T11/T8b legs, and to make T4c
meaningful); **Chromium/Playwright** (all 12 `-UI` cases and all 11 contract defects — the highest
value step); **Firebase emulator credentials** (T8b); **payment sandbox keys** (settlement only, no
real charge). **T10 is different:** messaging cannot be enabled because
`POST /api/admin/settings/public_config` rejects the payload — a product defect, not a missing
prerequisite.

## 9. Tests actually executed, by type

| Type | Executed | Result |
|---|---|---|
| **HTTP probes** (in-process, in-memory repo) | **35** | 5 × 2xx, 18 × 4xx, 11 × 5xx, 1 skipped |
| **Test cases judged** | **23** | 8 PASS, 1 FAIL, 12 BLOCKED, 2 NOT APPLICABLE |
| **Client URL contract defects** | **0 of 11 executed** | **11 BLOCKED** — no probe addresses any client path |
| **Browser E2E** | **0** | no browser; **0 of 12 browser-level claims** |
| **Database-backed** | **0** | no MariaDB; in-memory only |
| **Provider-backed** | **0** | no credentials; server-side rejection proven instead |
| Static source inspection (this mandate) | 41 rows, 112 register rows, 56 findings, 651 files | reported as static throughout |

No blocked test is counted as passing, no probe as browser correctness, and no in-memory result as
database evidence.

## 10. Verdict and reasoning

**`PARTIAL — INCOMPLETE`.**

**Complete:** provenance verified against remote; the primary task — all 41 rows reconstructed with
dispositions, per-row rationale and reproducible measurement; the M8C changes independently validated
with **two holes found and closed** and fixture coverage at 16; ledger, inventory and runtime totals
re-derived from raw data; a delta published rather than history rewritten; new findings recorded.

**Not complete, and feasible without new prerequisites:**

1. **`FP-E01`** (60 files) needs per-step scoping — the builder's own steps vs the sub-capabilities it
   contains. Declared, not finished.
2. **`FP-A18`** bulk operations need a line-region measurement rather than a containing-file count.
3. **`FP-G11`** needs a register-level decision: FAQ/about/legal content lives in `FP-G10`'s corpus.
4. The **12 register corrections** (9 corpora + 3 partial) are published as a delta but not applied —
   applying them is a register change this mandate does not authorise.

**Genuinely blocked:** browser, database, Firebase and provider validation, with per-test handoff in
`M8D-LOCAL-RUNTIME-HANDOFF.md`.

The verdict is not `PARTIAL — BLOCKED` because items 1–4 are executable now, and it is emphatically
not `COMPLETE`: M8C was committed, its tree was clean, and its verifier passed 12/12 — and nine of
the rows it had declined to reconstruct were still measurably wrong. **A green verifier and a correct
register are different claims.**

## 11. Implementation handoff

**Register work (audit-owned, needs authorisation):**

1. Apply the nine corpus corrections and the three partials (§4). Each is a measurement change; none
   changes a classification.
2. Record `M8D-01` (no legacy blocklist) against `FP-A07` and keep its modern-side finding.
3. Recompute `capability-subfeatures.json` from the 19 scoped corpora — currently declared stale.
4. Add a closure/disposition field to the 56 findings; the register still cannot answer "is this open?"
5. Decide whether the excluded test file belongs in the register's numerator; today it is in both.

**Product work (not authorised here, listed for the next mandate):**

6. `T6`: `POST /api/users-data/profile` at `expectedRevision: 0` returns 409 while `GET` returns 404 —
   a create that conflicts with a profile the read path says does not exist.
7. `T10`: the messaging module cannot be enabled — `public_config` payload rejected.
8. The 11 false-success client paths: stop suppressing the failure and stop rendering success.
9. `FP-E08`/`FP-E09`-style attribution is an audit artefact, not a product defect — fix it in the
   register, not in the code.

**Runtime:** follow the ordered plan in the handoff document; Chromium first, because it converts the
largest number of blocked claims into executable ones.
