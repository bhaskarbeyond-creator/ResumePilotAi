# M8C — Capability Denominator Reconciliation (112 vs 117)

**Mandate:** 8C §5 (P0). **Audited revision:** `69a3ed4`.
**Machine-readable ledger:** `Evidence/artifacts/m8c-capability-ledger.json`.
**Reproduce:** `python3 developer-review/tools/m8c-capability-ledger.py [--json]` — exit 0 means the
ledger is internally consistent (`sumCheck == 112`, no unknown classes, no duplicate ids, no proposal
accidentally present in the register).

---

## 1. The question

Two totals circulate: **112** register rows and **117** "capabilities". Two percentages circulate:
**11.1%** parity and **15.4%** full-plus-replaced. Neither percentage reproduces from 112. The mandate
requires an authoritative ledger, mutually exclusive categories, a denominator and inclusion rule per
count, and an explicit reconciliation of both percentages.

## 2. Where 117 comes from — exactly

**117 = 112 accepted register rows + 5 proposals that were never accepted.**

The five are `M8A-omission-challenge.json` claims whose `proposedRegisterAction` is `NEW_ROW`:

| Proposal | Proposed id | Capability | In register? |
|---|---|---|---|
| `A1` | `FP-A27` | Master Profile career repository with ATS gap computation | **no** |
| `A2` | `FP-A28` | Bidirectional resume ⇄ profile sync with per-field selection | **no** |
| `A3` | `FP-A29` | Candidate billing console (plan display, coupon validation) | **no** |
| `B1` | `FP-G26` | Contact form false success | **no** |
| `D4` | `FP-G27` | Cover-letter editor richness | **no** |

A proposal is not a register row: it has no declared corpus, no endpoint audit, no subfeature
classes and no parity classification under the register's own method. Adding it to a denominator
claims it was measured when it was only suggested. That is the defect.

The remaining M8A claims are not proposals at all: 10 are `CORRECT_EXISTING` (corrections applied to
existing rows) and 1 is `NO_CHANGE`. Correcting an existing row does not change the row count, which
is why 112 has stayed 112 across V6, V7 and M8.

## 3. The authoritative ledger

Snapshot `sha256` of every input is recorded in the artifact. Categories are mutually exclusive: each
row counts in exactly one class.

| Class | Count | Rows |
|---|---|---|
| FULL PARITY | 13 | `FP-B06, B07, C05, C06, C07, D15, E04, E08, E09, E13, E17, F05, G20` |
| PARTIAL PARITY | 51 | — |
| MISSING | 28 | — |
| MOCK / FABRICATED STATE | 12 | — |
| REPLACED BY EQUIVALENT | 5 | — |
| UNVERIFIED | 3 | `FP-E05, FP-F09, FP-G14` |
| **Sum** | **112** | sum check passes |

Also separated and **not** added to any class total:

- **Proposed, not accepted:** 5 (§2).
- **Rejected duplicates:** 0 capabilities. (Two *findings* are duplicates — `DISC-042` and
  `DISC-046`, both merged into `DISC-030` — and findings are a different universe from
  capabilities. They are never summed.)
- **Unverified:** the 3 rows above, also reported as their own class so the distribution stays
  exclusive.
- **Historical only:** 109 rows (V2), 112 rows (V6/V7/M8) — snapshots kept as history, never merged
  into the current count.

## 4. Every percentage, with its denominator

Recomputed from raw rows by the tool (`measures[]` in the artifact). `legitimate = false` means the
denominator is published here only to explain a prior statement, and must not be reused.

| ID | Measure | n / d | % | Legitimate |
|---|---|---|---|---|
| M-01 | strict FULL parity | 13 / 112 | **11.61** | yes |
| M-02 | FULL + REPLACED | 18 / 112 | **16.07** | yes |
| M-03 | any implementation (FULL+PARTIAL+REPLACED) | 69 / 112 | 61.61 | yes |
| M-04 | missing or fabricated | 40 / 112 | 35.71 | yes |
| M-05 | FULL parity excluding UNVERIFIED rows | 13 / 109 | 11.93 | yes |
| M-06 | FULL + REPLACED over the 117 mixed universe | 18 / 117 | **15.38** | **NO** |
| M-07 | FULL parity over the 117 mixed universe | 13 / 117 | **11.11** | **NO** |

**Reconciliation of the two published numbers — both reproduce exactly:**

- **11.1%** = 13 / 117 = 11.11% → measure **M-07**, the mixed universe. Accepted-only equivalent:
  **11.61%**.
- **15.4%** = 18 / 117 = 15.38% → measure **M-06**, the mixed universe. Accepted-only equivalent:
  **16.07%**.

So the numbers were not invented and not miscalculated: they were computed correctly on a denominator
that silently included five unaccepted proposals. Under the accepted-only denominator the register's
position is marginally **better** (11.6% vs 11.1%, 16.1% vs 15.4%), which is precisely why the error
was never caught — it made the product look slightly worse, so nobody questioned it. A denominator
error that flatters the auditor's own conclusion is still an error.

## 5. Why no single "completion" percentage is published

The mandate forbids a combined forensic percentage without a defensible formula, and forbids
equating parity with audit completion or production readiness. The reason is visible in the measures:
M-01 through M-05 answer **five different questions** over **three different denominators**
(112 accepted, 109 verified-only, 117 mixed). A weighted average would require a defensible weight
for "a row that is half implemented" and for "a row nobody could check", and no such weight exists in
the evidence.

What is published instead: ten separate measures (§4 here, plus `M8C-METHOD-LIMITATIONS.md` §3), each
with its denominator on its face.

## 6. Cross-checks that keep the categories exclusive

1. **The 19 shared-corpus rows are not a class.** They are a measurement property distributed across
   several classes (FULL, PARTIAL, MISSING, UNVERIFIED). Adding them to a distribution would
   double-count; the ledger records them in a separate `crossChecks` block.
2. **`FP-F05` is both FULL PARITY and `CORPUS_INCOMPLETE`.** One is a classification, the other a
   corpus-provenance fact. Both are true; neither is a category the other belongs to.
3. **Unverified rows stay in the 112.** Removing them would inflate parity. M-05 shows what happens
   when they are excluded, and states it.
4. **The 5 proposals are listed, counted and named**, so a reader can see exactly which five would
   have to be accepted to justify 117 — and cannot get 117 from the register alone.

## 7. Limitations

1. The ledger's authority is the register artifact. If the generator were run at the audited
   revision, it would emit 112 rows from 112 declarations (verified: 112 unique `id:` declarations,
   112 emitted, no duplicates, no orphans), so the count is reproducible from source.
2. `proposedNotAccepted` is derived from M8A's `proposedRegisterAction` field; if M8A had proposed a
   row without setting that field, the count would be wrong. All 16 claims were read; 5 set it.
3. No percentage here is a production-readiness claim, an audit-completion claim, or a value
   judgement about the product.
