# M8C — Register and Evidence Delta

**Mandate:** 8C §8 (P1). **Policy: immutable history, published delta.**
**Machine-readable:** `Evidence/artifacts/m8c-register-evidence-delta.json`.
**Reproduce:** `python3 developer-review/tools/m8c-register-delta.py [--json]`.

---

## 1. What this document is, and is not

It is **not** a corrected register. `feature-parity.json`, `capability-subfeatures.json`,
`DISCREPANCY-LOG.md` findings and `FEATURE-PARITY-MATRIX.md` are left as the audited record. It is a
**delta**: what M8C found to be wrong with them, what it added alongside them, and which published
statements are now superseded by which artifact.

Nothing in this delta silently rewrites a number. Where a figure must change, both figures and the
reason are stated.

---

## 2. Identity and id integrity

| Check | Result |
|---|---|
| Capability rows | 112 unique ids; **0 duplicates**; 112 `id:` declarations in the generator → 112 emitted rows |
| Findings | **56 log entries, 2 of which are merge aliases** → **54 distinct findings** |
| Merge aliases | `DISC-042` → `DISC-030`, `DISC-046` → `DISC-030` (both announce themselves as merged in their heading) |
| Findings citing an evidence path | 13; **0 of those paths fail to resolve** |
| Findings citing no evidence path | 43 — the structure is *source-line citations*, not artifact paths; this is a documentation property, not an unresolved reference |
| Register rows without an `evidence` field | **0** |
| Findings with identical `modern path:line` | **0** (no duplicated evidence under different IDs) |
| Referenced-but-absent findings | **0** |
| Rows referencing absent files | **0** (verifier C02 passes: 112/112 paths resolve) |

The "54 findings" and "56 findings" figures both appear in earlier documents. Both are correct under
their own definition, and the delta now states which is which: **56 entries, 54 distinct**.

---

## 3. Revision drift

| Item | Value |
|---|---|
| Register revision recorded in `feature-parity.json` | `a2ecb96d2b19` |
| Audited revision | `69a3ed4` |
| Status | **stale** |

Consequence, stated precisely: row-level file/line citations were captured at `a2ecb96d2b19`. Every
declared **path** still resolves at `69a3ed4` (C02 passes), so no citation points at a deleted file.
But **line ranges** were not re-derived per row, so a citation such as `Foo.tsx:47` may have shifted
by a few lines. That is a known, bounded limitation; it is not repaired here because re-deriving 112
rows' line numbers would rewrite the record. It is recorded in `M8C-METHOD-LIMITATIONS.md` §2.

---

## 4. What M8C added (additive only)

| Artifact | Content |
|---|---|
| `m8c-corpus-scoping.json` | 62 row declarations; 19 shared-corpus rows explained; 41 rows explicitly declared **unreconstructed** |
| `m8c-capability-ledger.json` | 112 accepted / 5 proposed / 3 unverified / 5 historical snapshots; 7 measures with denominators |
| `m8c-file-inventory.json` | 651 inventoried vs 650 measured vs 651 mapped; 0 symlinks, 0 case collisions |
| `m8c-blast-radius.json` | 53 bare-directory rows individually; 1.865× inflation; 10 corrected / 2 supported / 41 unresolved |
| `m8c-runtime-manifest.json` | 35 probes, 23 test cases, 11 contract defects, three separate tallies |
| This delta | supersession map |

New verifier check **C12 (artifact-staleness)**; new tools `m8c-scope-corpus.py`,
`m8c-capability-ledger.py`, `m8c-file-inventory.py`, `m8c-blast-radius.py`,
`m8c-runtime-manifest.py`, `m8c-register-delta.py`; 5 new regression fixtures (13 total).

---

## 5. Superseded published statements

| Statement as published | Its real denominator | Superseded by | Evidence |
|---|---|---|---|
| parity is **11.1%** | 13/117 (112 accepted + 5 unaccepted proposals) | **13/112 = 11.61%** over accepted rows | ledger measure M-01 vs M-07 |
| full-plus-replaced is **15.4%** | 18/117 (mixed universe) | **18/112 = 16.07%** | ledger measure M-02 vs M-06 |
| legacy attribution **650/650** | measured files | attribution reaches **651** raw files only because directory corpora recurse, and one corpus includes a test file; completeness is trivial, not point-level | file-inventory `mapping` |
| **16** shared-corpus rows | rows whose declared corpus is shared | **19** rows share a corpus; grouping by *stored distribution* exposed `FP-F09` as the 19th | scoping artifact, row `FP-F09` |
| verifier passes **61/61**, so the register is sound | package checks | package checks passed while 19 capabilities were measured over shared directories | `m8c-baseline/EXITCODES.txt` |
| `FP-F05` scores zero subfeatures | a 25-line wrapper | the capability lives in `Dashboard/EmployerDashboard/`; the zero was a wrapper artefact | scoping artifact, `FP-F05` |

**Note on direction.** Four of these six corrections move the register *up* (11.6 > 11.1, 16.1 >
15.4, 19 > 16, 651 > 650), and two move it down (volume 29,850 → 333 L for `FP-A08`; `FP-F05`'s
"zero subfeatures" → 27). The audit made errors in both directions; the delta reports both.

---

## 6. Claims downgraded (kept, with prior verdict)

| Claim | Was | Is | Where preserved |
|---|---|---|---|
| M8 claim 5 — helper-verb call sites are wired | OVERSTATED | downgraded in M8B | `M8B-FORENSIC-CLOSURE-REPORT.md` |
| `DISC-056` — publish state leaks | "product defect" | **test-double defect**: `InMemoryRepository` ignores query options while `MySQLRepository` applies `AND published = 1` | `DISCREPANCY-LOG.md` DISC-056, now with evidence citation |
| `DISC-042`, `DISC-046` | separate findings | merge aliases of `DISC-030` | their own headings |
| `FP-B03` — team invite | implied present | `MISSING`; 70 scoped lines are the affordance only | scoping artifact |

---

## 7. Hand-pinned values

| Location | Value | Disposition |
|---|---|---|
| `scripts/verify-v4-reconciliation.py:338` | `176` | **Pinned expectation, not derived.** Left unchanged: changing an expected value to make a check green is prohibited. Recorded here so a future mandate can decide whether the pin is still correct. |

Other check expectations (`verify-audit-package.sh` 61 checks) assert package structure rather than
measured values, so they cannot drift from the register.

---

## 8. "Closed" versus "verified" — what the register can and cannot say

- **0** findings are marked closed or resolved. The `**Verification status:**` field added to 56
  findings records *evidence class*, not disposition.
- The register has **no closure/disposition field at all**, so "is this still open?" is
  unanswerable from the register. Verifier C10 reports this in its passing line
  (*"NOTE no closure/disposition field exists in the register"*) rather than letting the check pass
  silently.
- Consequently: a row that is **STATICALLY VERIFIED** is *not* closed. It means source inspection
  reproduced the claim. A **BLOCKED** runtime test is not closed either.
- Ten findings remain explicitly open (`FP-B05, C02, D07, D12, D13, F07, G11, G21, G23, G24` ids in
  the M8 open-findings register) and are carried forward unchanged.

---

## 9. What a future mandate would need to change (in the record, not around it)

1. Re-derive line ranges at the audited revision, row by row, with before/after recording.
2. Add a closure/disposition field to the 56 findings — a schema change to the audited record.
3. Recompute `capability-subfeatures.json` from the 19 scoped corpora (currently declared stale).
4. Reconstruct the 41 directory-unreconstructed rows.
5. Decide whether the `176` pin is still the right expectation.

None of these is authorised by M8C.
