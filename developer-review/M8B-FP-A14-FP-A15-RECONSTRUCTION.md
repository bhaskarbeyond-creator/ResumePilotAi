# M8B — FP-A14 / FP-A15 RECONSTRUCTION

**Source revision audited:** `69a3ed4` (= `69a3ed4c28d2fa7984eac7ee48cb75862d2cc029`, HEAD = origin)
**Application source checkpoint:** `888c2e5` (HEAD's parent; app trees identical — Gate A §2)
**Tool:** `developer-review/tools/m8b-reconstruct-a14-a15.py` (independent Python implementation)
**Machine-readable result:** `Evidence/artifacts/m8b-a14-a15-reconstruction.json`

---

## 1. The finding being investigated

`CAPABILITY-SUBFEATURE-REGISTER.md` gives `FP-A14` (Coupon / promo-code administration) and `FP-A15`
(Refunds, invoices, payment orders administration) **numerically identical** subfeature tables:

```
tabular data 14 · search 10 · filtering 28 · pagination 100 · dialog 18 · CSV 1 · JSON 10 · PDF/DOCX 5 · authz 87
legacy 35 files / 14,191 lines · modern 0 files
```

M8A recorded this as "a template-copy artifact" without proving the cause. That was a hypothesis, not a finding.
This document establishes what was actually measured.

---

## 2. Cause — established by experiment, not by inference

Four candidate causes were tested. Only one survives.

| Candidate | Test | Result |
|---|---|---|
| Copied template (hand-pasted numbers) | recompute the corpus the row *declares* | **rejected** — the numbers reproduce exactly from real source (§2.1), so they were computed, not pasted |
| Stale generated artifact | regenerate from the current tree | **rejected** — current tree reproduces the published values; nothing is stale |
| Incorrect row attribution | compare declared corpora across rows | **ACCEPTED — this is the cause** (§2.2) |
| Generator defect in the counting logic | independent re-implementation of all 16 classes | **rejected** — an independent Python implementation reproduces every published count to the digit (§2.1) |

### 2.1 The published numbers reproduce exactly from the shared directory

Both rows declare `legacyPaths: ["src/components/admin/settings"]`. Measuring that whole directory
(35 files) with an independent Python implementation of the register's 16 subfeature classes:

| class | published | independently recomputed | match |
|---|---:|---:|---|
| tabular data | 14 | **14** | ✓ |
| search | 10 | **10** | ✓ |
| filtering | 28 | **28** | ✓ |
| pagination | 100 | **100** | ✓ |
| dialog / drawer | 18 | **18** | ✓ |
| CSV export | 1 | **1** | ✓ |
| JSON export | 10 | **10** | ✓ |
| PDF / DOCX export | 5 | **5** | ✓ |
| authorization gate | 87 | **87** | ✓ |
| sorting / print / upload / drag / chart / bulk / undo | 0 | **0** | ✓ |

Line count also reconciles: `split('\n')` yields **14,191** (exactly as published) while `splitlines()` yields
14,158 — the generator counts trailing newlines, inflating by one per file. Files: **35**, exact.

**Conclusion:** the counting logic is correct. The *corpus it was pointed at* is wrong.

### 2.2 The corpus is a directory, and four rows point at it

`FP-A14`, `FP-A15`, `FP-A16` (SMTP/IMAP settings) and `FP-A21` (platform settings) **all** declare
`src/components/admin/settings` and therefore all four carry the same measurements. This is not two rows
coincidentally matching: it is four rows sharing one corpus **by construction**, because the row generator records
the containing directory rather than the capability's files.

Both capabilities genuinely live inside **one file** — `subscriptionsSettings.jsx` (2,993 lines) renders five
admin tabs (`gateways`, `gst`, `plans`, `coupons`, `invoices` at `:77`). Coupons and invoices are sibling JSX
panels in that single file. So directory attribution cannot distinguish them even in principle.

**This is a measurement-scope defect, not a data-entry mistake.** The register states the numbers as the
capability's inventory, but they are the *module's* inventory.

---

## 3. Independent reconstruction — capability-scoped

Scope was derived from the JSX render-block boundaries (`this.state.adminTab === '<tab>' && (` … brace-matched),
unioned with file-level lines carrying capability-specific identifiers outside every panel.

| | **FP-A14 Coupons** | **FP-A15 Refunds / invoices / payment orders** |
|---|---|---|
| panel | `coupons` | `invoices` |
| panel span | `subscriptionsSettings.jsx:2390-2677` | `subscriptionsSettings.jsx:1356-1669` |
| panel lines | 288 (12.2 % of the file) | 314 (14.7 %) |
| file-level affinity lines | 76 | 125 |
| **scoped legacy lines** | **364** | **439** |
| backend routes (as published) | `/admin/coupons` | `/admin/payments/refund`, `/invoices`, `/payment-orders` |
| modern files | 0 | 0 |
| classification | `MISSING` | `MISSING` |

### 3.1 Reconstructed subfeature distributions (capability-scoped)

| class | FP-A14 scoped | FP-A15 scoped | previously published (both) |
|---|---:|---:|---:|
| tabular data | **2** | **2** | 14 |
| search | **0** | **0** | 10 |
| filtering | **0** | **8** | 28 |
| sorting | 0 | 0 | 0 |
| pagination / cursor | **8** | **6** | 100 |
| dialog / drawer | **2** | **0** | 18 |
| CSV export | 0 | 0 | 1 |
| JSON export | 0 | 0 | 10 |
| PDF / DOCX export | 0 | 0 | 5 |
| authorization gate | **0** | **0** | 87 |

**The two rows are now genuinely different**, and both are very much smaller than what was published. The
published table described the whole 35-file settings module, including `authz: 87` and `pagination: 100` counts
that belong to *other* admin settings screens (feature flags, branding, SMTP, GDPR) and to neither capability.

### 3.2 What the numbers mean

- Both capabilities are **small, single-panel admin surfaces**: two tables each, modest paging, and for coupons a
  dialog for create/edit.
- Neither has client-side authorization gates in its own panel (`authz: 0` scoped vs 87 directory-wide) — the
  directory figure came from sibling settings modules.
- Neither exports anything from its own panel (`csv/json/document: 0` vs 1/10/5 directory-wide). The published
  CSV/JSON/PDF counts were **other screens' exports attributed to coupons and refunds**.
- `classification` is unaffected: modern is 0 files for both, so `MISSING` stands on independent evidence.

---

## 4. Which rows are affected — the real blast radius

M8A flagged 2 rows. The defect is systemic:

| metric | value |
|---|---:|
| rows whose `legacyPaths` are **all bare directories** | **53 / 112** |
| groups of rows sharing an identical `(paths, files, lines)` corpus | **8** |
| rows inside those groups | **18** |
| groups without any `sharedCorpusJustification` | **8 (all)** |
| **corpus double-counting factor** | **1.86×** (per-row file sum 1,212 vs 651 distinct files) |

The eight shared-corpus groups:

| rows | shared corpus | files / lines |
|---|---|---:|
| FP-A14, FP-A15, FP-A16, FP-A21 | `src/components/admin/settings` | 35 / 14,191 |
| FP-F01, FP-F02, FP-F05, FP-F06 | `src/components/EmployerPortal` | 12 / 2,100 |
| FP-A08, FP-A19 | `src/components/admin` | 68 / 29,850 |
| FP-E02, FP-E03 | `src/cv-templates` | 73 / 13,985 |
| FP-B02, FP-B03 | `src/enterprise/components/EnterpriseUsersTab.jsx` | 1 / 973 |
| FP-C01, FP-C04 | — | 1 / — |
| FP-C05, FP-D06 | — | — |
| FP-E04, FP-E05 | `src/components/BuildResume/AtsScoreMeter.jsx` | 1 / 349 |

`FP-E02`/`FP-E03` sharing a **73-file / 13,985-line** corpus is the largest single instance; two different
capabilities cannot both *be* a 73-file template directory.

---

## 5. Downstream metrics that were unreliable

| Metric | Status | Why |
|---|---|---|
| `legacyFilesMeasured` = 650 | **unaffected** | counts distinct files over the legacy tree, not a sum of rows |
| per-row `legacyFiles` / `legacyLines` | **unreliable for 18 rows** | module-level, not capability-level |
| per-row subfeature tables | **unreliable for 18 rows**, of which 4 are proven duplicates | scoped to a shared corpus |
| register "lost subfeature" leads derived from those tables | **unreliable for the 18** | a lead computed from a shared corpus cannot be attributed to one capability |
| `absentClassHistogram`, `rowsWithAbsentClass` | **inherits the 18 rows** | derived from the same tables |
| capability count 112 | unaffected | row set unchanged |
| findings 53 / 55 IDs | unaffected | different register |
| coverage total 1,544 | **not recomputed here** — it aggregates row-level figures and must be re-derived before reuse | see §6 |

**No total was adjusted to make a verifier pass.** The corrected values are recorded as *evidence*; the register was
not edited in this mandate beyond the ID-collision fix noted in the main report.

---

## 6. Acceptance status for this gate

| Requirement | Status |
|---|---|
| FP-A14 has an independently reproducible measurement | **MET** — `tools/m8b-reconstruct-a14-a15.py`, Python, independent of the JS generator |
| FP-A15 has an independently reproducible measurement | **MET** — same tool, different panel and affinity set |
| No duplicated value retained without justification | **MET** — the duplicate is explained, and the corrected values differ |
| Every number traceable or marked `UNVERIFIED` | **MET for both rows**; 16 other rows remain `UNVERIFIED` pending individual reconstruction |
| A separate process recomputes and confirms | **MET** — two implementations agree on the whole-directory reproduction; the scoped values are produced only by the independent tool |
| Report identifies unreliable dependent counts | **MET** — §4 and §5 |

**Not met in this mandate:** the other 16 rows in shared-corpus groups and the 53 bare-directory rows have **not**
been individually reconstructed. Their subfeature tables remain `UNVERIFIED`. Reconstructing them requires one
capability-to-file mapping per row, which is a separate body of work, and the register must not be published as if
those tables were measurements.

---

## 7. Reproduction

```bash
python3 developer-review/tools/m8b-reconstruct-a14-a15.py          # human-readable
python3 developer-review/tools/m8b-reconstruct-a14-a15.py --json   # machine-readable
python3 developer-review/tools/m8b-integrity-verify.py             # C03/C04/C05 enforce this class of defect
```
