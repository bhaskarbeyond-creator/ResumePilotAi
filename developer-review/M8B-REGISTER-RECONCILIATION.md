# M8B — REGISTER RECONCILIATION

**Source revision:** `69a3ed4`
**Method:** independent recomputation from the machine-readable artifacts, not from published prose.
**Script:** `developer-review/tools/m8b-integrity-verify.py` (checks C07–C11)
**Machine-readable:** `M8B-reconciliation.json`

---

## 1. Published vs independently recomputed

| Quantity | Published | Recomputed | Δ | Root cause | Status |
|---|---:|---:|---:|---|---|
| Capability rows | 112 | **112** | 0 | — | **agrees** |
| Unique row IDs | (unstated) | **112** | 0 | no duplicate ids | **agrees** |
| Parity histogram | 13 / 51 / 28 / 0 / 12 / 5 / 3 | **13 / 51 / 28 / 0 / 12 / 5 / 3** | 0 | — | **agrees** |
| Domain totals A–G | 26/11/7/15/17/11/… | **26/11/7/15/17/11** | 0 | — | **agrees** |
| Backend operations | 393 | **393** (TSV rows) | 0 | — | **agrees** |
| Subfeature rows | 112 | **112** | 0 | — | **agrees** |
| `byAuditStatus` | 21 / 33 / 8 / 50 | **21 / 33 / 8 / 50** | 0 | — | **agrees** |
| Findings / IDs | 53 / 55 | **53 / 55** | 0 | the log states the split explicitly | **agrees** |
| Claim dispositions | 3/7/4/1/0/0/1 | **3/7/4/1/0/0/1** | 0 | — | **agrees** |
| `legacyFilesMeasured` | 650 | **651** via row-path union | **+1** | different enumeration basis (row-path walk vs tree scan; extension filter) | **UNRESOLVED (±1)** |
| Per-row subfeature tables | as published | **not reproducible as capability inventories** | — | 18 rows share a corpus (see `M8B-FP-A14-FP-A15-RECONSTRUCTION.md` §4) | **UNRELIABLE for 18 rows** |
| Corpus double-counting | (unstated) | **1.86×** (1,212 per-row sum vs 651 distinct) | — | directory-level attribution | **newly quantified** |
| Coverage total | 1,544 | **not independently re-derived** | — | aggregates a mix of item types whose row-level inputs include the 18 unreliable rows | **UNVERIFIED** |

**Nothing was adjusted to make a check pass.** The single arithmetic disagreement (±1 file) is recorded as
unresolved rather than reconciled by fiat.

---

## 2. Counts that were previously unreliable

| Count | Why unreliable | Safe to publish? |
|---|---|---|
| per-row `legacyFiles` / `legacyLines` | module-level for 18 rows in 8 shared-corpus groups | **no, for those 18** |
| per-row subfeature distributions | same 18 rows; 4 of them are proven duplicates | **no, for those 18** |
| "lost subfeature" leads derived from them | a lead from a shared corpus cannot be attributed to one capability | **no, until each row is scoped** |
| `rowsWithActionDiff` = 50 | inherits the 18 rows | **qualified** |
| coverage 1,544 | mixes item types and inherits the 18 rows | **no** — must be re-derived or published with that caveat |
| `legacyFilesMeasured` 650 | ±1 against row-path union | **qualified** |
| capability 112, histogram, operations 393, findings 53/55, dispositions 16 | independently recomputed and equal | **yes** |

---

## 3. The 16 M8A claims — one primary disposition each

| # | Claim | Primary bucket | Traceable evidence |
|---|---|---:|---|
| A1 | Master Profile repository | 2 | `M8A-SOURCE-CROSSWALK.md` §A1 |
| A2 | resume ⇄ profile sync | 2 | §A2 |
| A3 | candidate billing console | 2 | §A3 |
| A4 | TOTP / login history | 2 | §A4 |
| B1 | contact false success | 3 | §B1 |
| B2 | CMS pages | 3 | §B2 |
| B3 | blog reader | 3 | §B3 |
| B4 | marketing modules | 2 | §B4 |
| C1 | team member management | 2 | §C1 |
| C2 | SIEM JSON export | **7** | §C2 (falsified) |
| C3 | employer messaging | 2 | §C3 |
| D1 | admin financial back-office | 4 | §D1 |
| D2 | queue console | 3 | §D2 |
| D3 | blog WYSIWYG | 1 | §D3 |
| D4 | cover-letter rich text | 1 | §D4 |
| D5 | interview voice engine | 1 | §D5 |

Histogram 3/7/4/1/0/0/1 sums to **16**; no claim carries two primary buckets. Secondary observations are recorded
inside each claim's `subClaimVerdicts` array rather than being counted again.

### 3.1 Correction to M8A's own proposed IDs

M8A proposed `FP-G22` and `FP-G23` for two new findings. **Both IDs already exist** in
`CAPABILITY-SUBFEATURE-REGISTER.md` for different capabilities:

| proposed | already used by | corrected to |
|---|---|---|
| `FP-G22` | "Data models, runtime conf and React context scaffolding" | **`FP-G26`** (contact false success) |
| `FP-G23` | "Cross-cutting hooks (unread pollers, AI token usage, AI engine status…)" | **`FP-G27`** (cover-letter rich text) |

Had these been applied, two unrelated findings would have been silently merged into existing rows. The
machine-readable claim register now records the correction per claim (`idCollisionCorrection`). `FP-A27`, `FP-A28`
and `FP-A29` were verified free and stand.

---

## 4. Provenance reconciliation (Gate A input)

Twelve artifacts carry a recorded revision. They cite **five different revisions**:

| revision | artifacts | in current history? | app tree vs HEAD |
|---|---|---:|---|
| `a2ecb96` | 6 | yes | **0 files differ** |
| `a5835ff6` | 2 | yes | **0 files differ** |
| `a7d08a2` | 1 | **no** | **0 files differ** |
| `8fce7151` | 2 | yes | **0 files differ** |
| `a0bb09aa` | 1 | yes | **0 files differ** |

`a7d08a2` is **not an ancestor** of `HEAD`, which would normally invalidate an artifact's provenance. It is
accepted here because the application trees (`frontend/src`, `src`, `backend`) are **identical** between `a7d08a2`
and `HEAD`, and **all 100 differing files** between them are under `developer-review/`. Measurement transferability
is therefore proven rather than assumed. This is recorded because "the revision resolves" and "the measurement
transfers" are different claims, and only the second one matters for an audit.

---

## 5. Historical preservation

No prior report was rewritten. Corrections are recorded as dated sections in the artefact that owns them
(examples: the M8A claim register now carries `idCollisionCorrection` and `m8bCorrections`; the A14/A15 duplicate is
explained in a new document rather than edited out of the register; the previously published subfeature tables
remain visible in `CAPABILITY-SUBFEATURE-REGISTER.md` because this mandate does not edit registers).

---

## 6. Evidence-class labelling

Every assertion in this mandate is tagged by class, and the classes are not interchangeable:

| class | example |
|---|---|
| source-derived | "`InMemoryRepository.getCustomPageBySlug` ignores its options argument" |
| static inference | "the modern blog reader never reads `:slug`" |
| runtime observation | "`GET /api/blog/posts` → 404 with an admin identity" |
| blocked assumption | "MySQL create-at-revision-0 behaviour" — **not** claimed either way |

`M8B-RUNTIME-CLOSURE-MATRIX.md` §0 states the limits of the runtime class; `M8B-METHOD-LIMITATIONS.md` states the
limits of the static class.
