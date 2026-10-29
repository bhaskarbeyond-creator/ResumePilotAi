# M8D — Remaining Findings and Blockers

**Mandate:** 8D §6 (P1). **Audited revision:** `69a3ed4`. **Register revision:** `a2ecb96d2b19`.
**Machine-readable:** `Evidence/artifacts/m8c-register-evidence-delta.json` (re-generated unchanged).
**Reproduce:** `python3 developer-review/tools/m8c-register-delta.py [--json]`.

Recomputed in M8D. Where M8C and M8D disagree, the M8D recount is given with its method.

---

## 1. Identity integrity

| Check | Result | Method |
|---|---|---|
| Capability rows | 112 unique ids, **0 duplicates**, 0 orphans | generator declarations vs emitted rows |
| Findings in the log | **56 entries**, 2 of which are merge aliases → **54 distinct** | heading scan (`## [DISC-nnn]`) plus `MERGED INTO` detection |
| Merge aliases | `DISC-042` → `DISC-030`, `DISC-046` → `DISC-030` | announced in their own headings |
| Duplicate evidence under different IDs | **0** — no two findings share an identical `Modern path:line` | pairwise comparison of the citation field |
| Findings citing an evidence **path** | 13; **0 unresolved** | every `Evidence/…` string tested for existence |
| Findings with a `Verification status` field | **56 of 56** | 50 `STATICALLY VERIFIED`, 6 `RUNTIME VERIFIED` |
| Findings claiming runtime verification | **7** — the 6 above plus `DISC-056`, whose status is composite (`STATICALLY VERIFIED (code path) + RUNTIME VERIFIED (temp env)`) | each cites at least one evidence path, and **every cited path resolves**; 0 cite an `E-nnn` id, which is a style gap, not an unresolved reference |
| Findings marked resolved/closed | **0** | no finding asserts a terminal state, so none can be falsely closed |
| Rows without an `evidence` field | **0** | field-presence scan over 112 rows |

**Reconciliation of M8C's "7 RUNTIME claims":** exactly reproduced, once composite statuses are
counted. A naive count of `RUNTIME VERIFIED` strings returns 13 because the phrase also appears in
prose inside verification recipes; only 7 are status-field claims.

## 2. Stale revision and line references

| Item | Value |
|---|---|
| Register revision recorded in `feature-parity.json` | `a2ecb96d2b19` |
| Audited revision | `69a3ed4` |
| Verdict | **stale by 8 commits** |

Consequence, precisely bounded: **every declared path still resolves** at `69a3ed4` (verifier C02:
112/112) and **every declared volume reproduces exactly** (new verifier C13: 110/110 rows with
paths). So the stale revision has not invalidated a single path or count. What it *may* have
invalidated is a **line number** inside a citation like `Foo.tsx:47`, which was never re-derived per
row. That is a live, bounded uncertainty and it is not repaired here, because re-deriving 112 rows'
line numbers rewrites the audited record.

## 3. Proposed findings treated as accepted?

**No.** Five M8A proposals (`FP-A27`, `FP-A28`, `FP-A29`, `FP-G26`, `FP-G27`) remain absent from the
register and are labelled provisional wherever they appear. The only place they were ever mixed into
an accepted total is the **117 denominator**, and that is exactly what M8C and M8D reconciled. Ten
further M8A claims are `CORRECT_EXISTING` and one is `NO_CHANGE`; neither kind changes a row count.

## 4. Findings missing from the canonical ledger

None found. The 56 log entries are all present in `DISCREPANCY-LOG.md` with stable ids, and the
declared coverage figure (1,545) reconciles with the register's own parts. Two entries are aliases,
not additions — which is why "56 findings" and "54 findings" are both true under their own
definition.

## 5. New findings produced by M8D

These are recorded here because they were discovered during this mandate and do not yet exist in the
audited register.

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| `M8D-01` | `FP-A07` has **no legacy implementation**: its declared corpus (`PlatformSecurity.jsx`) implements `FP-A05`'s security-event stream, and the `handleBlockIp` cited in its evidence exists only in the **modern** `AdminSecurityTab.tsx:214` | P1 | 41-row reconstruction, row `FP-A07` |
| `M8D-02` | `FP-E08` (a share modal, `FULL PARITY`) was measured over the **entire 36-file resume builder**: 16,941 L → 271 L (**62×** overstatement) | P1 | reconstruction, row `FP-E08` |
| `M8D-03` | `FP-E09` (cover letters) was measured over the **72-file template catalogue** it does not import: 15,832 L → 1,918 L (**8×**) | P1 | reconstruction, row `FP-E09` |
| `M8D-04` | The register's corpus union reaches **651** files while its measured denominator is **650**: one row's directory contains the excluded test file, so it is removed from the denominator and counted in the numerator | P3 | inventory validation §1 |
| `M8D-05` | M8C's C05 exemption was **bypassable** by placing a defective row beside a justified one; fixed in M8D and covered by fixture `f14` | P2 (audit tooling) | independent validation §2 |
| `M8D-06` | No verifier checked a row's declared **volume** against its own files before M8D, so quoted counts could be edited freely; C13 now catches a 1,000-line or 3-file edit | P2 (audit tooling) | validation §3, fixtures `f15`/`f16` |

## 6. Discrepancies between reports, registers, artifacts and machine data

| Discrepancy | Status |
|---|---|
| 11.1% / 15.4% vs 112-row register | **reconciled** — both reproduce on 13/117 and 18/117 |
| 650 vs 651 | **reconciled** — one excluded test file |
| 16 vs 18 vs 19 shared-corpus rows | **reconciled** — 19 (M8C found the 19th via C12) |
| 56 vs 54 findings | **reconciled** — 2 merge aliases |
| 1,212 vs 1,213 per-row references | **reconciled** — the test file, in the raw-universe variant only |
| 1212 vs 1232 in an earlier C07 message | **explained** — earlier message used a different within-row dedup rule; current figure is 1,212 with the rule stated |
| "66 findings" in an M8C summary vs 56 in the log | **discrepancy retained**, not silently edited: the log has 56 entries; any document saying 66 is wrong and is listed here rather than corrected in place |

## 7. Blockers — external prerequisites, exactly stated

| # | Blocker | Affects | Exact prerequisite to unblock |
|---|---|---|---|
| B1 | **No MariaDB** (`ECONNREFUSED 127.0.0.1:3306`) | T6, T7, T11, T8b persistence legs; any claim about stored rows | disposable server on 127.0.0.1:3306, empty schema, migrations run **there only**, synthetic data, `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME` pointed at it |
| B2 | **No browser** (Playwright/Chromium absent) | all 12 `-UI` test cases and all 11 `RT-C` contract defects; **browser E2E = 0** | `npx playwright install chromium`, backend + frontend dev servers, synthetic admin session; capture screenshot + DOM before/after each submit |
| B3 | **No Firebase credentials** | T8b MFA disable | Firebase emulator or sandbox identity credentials; **production credentials must not be used** |
| B4 | **No payment provider keys** | provider settlement only (rejection already proven by T14) | sandbox keys; **no real charge** |
| B5 | **Messaging cannot be enabled** — `POST /api/admin/settings/public_config` → 400 | T10, employer messaging | **product-side**, not environment: the settings route rejects the enabling payload, so this cannot be unblocked from outside the code |
| B6 | 41-row reconstruction | *resolved in M8D* — all 41 have dispositions | — |

## 8. What remains genuinely infeasible here

Only B1–B5, and of those **B5 is a product defect, not a missing prerequisite**. Everything else in
the mandate's feasible set has been performed: the 41 rows are reconstructed, the M8C changes are
validated with two holes found and closed, the ledger and inventory reconcile, and the runtime
manifest is per-test actionable.
