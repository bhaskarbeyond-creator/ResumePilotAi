# M8D — Capability Ledger Reconciliation

**Mandate:** 8D §4 (P0). **Audited revision:** `69a3ed4`. **Register:** `Evidence/artifacts/feature-parity.json`.
**Machine-readable:** `Evidence/artifacts/m8c-capability-ledger.json` (re-generated unchanged in M8D).
**Reproduce:** `python3 developer-review/tools/m8c-capability-ledger.py [--json]` — exits 0 only if
the ledger is internally consistent (`sumCheck == 112`, no unknown class, no duplicate id, no
proposal silently present in the register).

Recomputed from raw rows in M8D, not copied from M8C. Every figure below was re-derived; the results
agree with M8C, and the arithmetic is not the reason for agreeing — the rows are.

---

## 1. Raw distribution (mutually exclusive)

| Class | Count | Rows |
|---|---|---|
| FULL PARITY | 13 | `FP-B06, B07, C05, C06, C07, D15, E04, E08, E09, E13, E17, F05, G20` |
| PARTIAL PARITY | 51 | — |
| MISSING | 28 | — |
| MOCK / FABRICATED STATE | 12 | — |
| REPLACED BY EQUIVALENT | 5 | — |
| UNVERIFIED | 3 | `FP-E05, FP-F09, FP-G14` |
| **Sum** | **112** | equals the row count (checked by the tool) |

A row counts in exactly one class. Properties that cut across classes — a shared corpus, a scoped
measurement — are reported in separate fields and never added to this distribution.

**Independent re-derivation of the row count:** the generator declares **112** `id:` entries, emits
**112** rows, 0 duplicate ids, 0 rows present in the artifact but absent from source, 0 declared but
absent from the artifact. The count is reproducible from source, not only from the artifact.

## 2. The five proposals — provisional, never merged

| Proposal | Proposed id | Capability | In register? |
|---|---|---|---|
| `A1` | `FP-A27` | Master Profile career repository with ATS gap computation | **no** |
| `A2` | `FP-A28` | Bidirectional resume ⇄ profile sync with per-field selection | **no** |
| `A3` | `FP-A29` | Candidate billing console (plan display, coupon validation) | **no** |
| `B1` | `FP-G26` | Contact form false success | **no** |
| `D4` | `FP-G27` | Cover-letter editor richness | **no** |

They have no declared corpus, no endpoint audit, no subfeature classes and no parity classification
under the register's method. **117 = 112 accepted + 5 proposed**, and only the 112 are accepted.
The other 11 M8A claims are `CORRECT_EXISTING` (10) and `NO_CHANGE` (1) — corrections to existing
rows, which cannot change a row count, which is why the register has stayed at 112 across V6, V7, M8.

## 3. Separate calculations (each with numerator, denominator, rule)

| ID | Calculation | n / d | % | Basis |
|---|---|---|---|---|
| **A** | **Accepted-capability parity (strict FULL)** | **13 / 112** | **11.61%** | the 112 register rows; FULL only |
| **B** | **Accepted + proposed, provisional** | 13 / 117 | 11.11% | treats 5 unassessed proposals as non-FULL; **provisional, not a register figure** |
| **C** | **Full-or-replaced coverage (accepted)** | **18 / 112** | **16.07%** | FULL 13 + REPLACED 5 |
| **D** | Full-or-replaced, provisional | 18 / 117 | 15.38% | with 5 unaccepted proposals |
| **E** | Any implementation (FULL + PARTIAL + REPLACED) | 69 / 112 | 61.61% | accepted rows only |
| **F** | Partial | 51 / 112 | 45.54% | accepted rows only |
| **G** | Missing | 28 / 112 | 25.00% | accepted rows only |
| **H** | Mock / fabricated | 12 / 112 | 10.71% | accepted rows only |
| **I** | Unverified | 3 / 112 | 2.68% | accepted rows only |
| **J** | Parity with UNVERIFIED excluded from the denominator | 13 / 109 | 11.93% | a row nobody could check cannot be counted as a miss |

Calculations **B** and **D** exist only to reconcile the published figures and are labelled
provisional. Every one of the ten is a percentage of *register rows*, not of the codebase, not of
schema or endpoints, and none is a production-readiness measure.

## 4. Reconciliation of the two published percentages

- Published **11.1%** = 13/117 = **11.11%** → calculation **B**. Accepted-only equivalent: **11.61%**.
- Published **15.4%** = 18/117 = **15.38%** → calculation **D**. Accepted-only equivalent: **16.07%**.

Both reproduce exactly, on a denominator containing five proposals nobody accepted. The accepted-only
figures are marginally **higher**, which is why the error survived four audit mandates: it made the
product look slightly worse, and nobody audits a number that flatters their own conclusion.

## 5. Did M8D's reconstructions change the distribution?

**No.** Nine of the 41 reconstructed rows had contaminated corpora, and reconstructing them changed
their *volume* by up to 62× (`FP-E08`: 16,941 L → 271 L). None changed class:

| Row | Class before | Class after | Corpus change |
|---|---|---|---|
| `FP-E08` | FULL PARITY | FULL PARITY | 36f/16,941L → 1f/271L |
| `FP-E09` | FULL PARITY | FULL PARITY | 74f/15,832L → 2f/1,918L |
| `FP-A20` | PARTIAL PARITY | PARTIAL PARITY | 5f/1,634L → 2f/713L |
| `FP-F10` | PARTIAL PARITY | PARTIAL PARITY | 21f/7,818L → 17f/6,917L |
| `FP-A05` | MOCK / FABRICATED | MOCK / FABRICATED | 2f/762L → 1f/363L |
| `FP-A07` | MOCK / FABRICATED | MOCK / FABRICATED | 1f/363L → **0f/0L** |
| `FP-D13` | PARTIAL PARITY | PARTIAL PARITY | 16f/2,920L → 13f/2,657L |
| `FP-D12` | PARTIAL PARITY | PARTIAL PARITY | 28f/3,390L → 14f/3,250L |
| `FP-G24` | PARTIAL PARITY | PARTIAL PARITY | 3f/1,420L → 2f/1,356L |

This is the strongest evidence that the ledger is stable under correction: **the classification
vocabulary is doing analytic work, and the corpus attribution was not.** A reader who trusted the
percentages was misled about *how much code* implements each capability, never about the pass/fail
pattern — except for `FP-A07`, where the legacy side has no implementation at all, so its
`MOCK / FABRICATED` verdict rests entirely on the modern file.

## 6. Why no single completion percentage is published

The ten calculations answer seven different questions over three denominators (112, 117, 109). A
weighted average would need weights for "half implemented" and for "unknown", and the evidence
contains no defensible weight. **Parity is not audit completion, and neither is production
readiness.**

## 7. Limits

1. Authority is the register artifact; if a future hand edits it without re-running the generator,
   these counts follow the artifact, not the tool.
2. `proposedNotAccepted` depends on M8A setting `proposedRegisterAction: NEW_ROW`. All 16 claims were
   read; 5 set it.
3. `UNVERIFIED` (3 rows) is a class *and* an exclusion option; both are published rather than picking
   whichever looks better.
