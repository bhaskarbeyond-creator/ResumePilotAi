# M8D — Inventory and Attribution Validation

**Mandate:** 8D §5 (P1). **Audited revision:** `69a3ed4`.
**Machine-readable:** `Evidence/artifacts/m8c-file-inventory.json`,
`Evidence/artifacts/m8c-blast-radius.json`.
**Reproduce:** `python3 developer-review/tools/m8c-file-inventory.py` and
`python3 developer-review/tools/m8c-blast-radius.py`.

Independently re-derived in M8D: enumerating from `git ls-tree 69a3ed4`, not from the working copy
and not from a previous report.

---

## 1. The five quantities, kept apart

The mandate asks for five distinct populations. They are all different, and conflating them is what
produced the original "650/650" claim.

| # | Population | Count | Rule |
|---|---|---|---|
| 1 | **Inventoried** — every `.js`/`.jsx` under `src/` at `69a3ed4` | **651** | extension filter, `node_modules`/`.git`/`dist`/`coverage` excluded |
| 2 | **Measured** — inventoried minus test/spec files | **650** | the audit's own scope rule; excludes exactly `src/components/welcome/App.test.js` |
| 3 | **Attributed to at least one capability** (distinct) | **651** | union of every row's resolved corpus |
| 4 | **Excluded from measurement** | **1** | the test file above |
| 5 | **Referenced by multiple capabilities** | **245** | files reached by ≥2 of the 112 rows |

Quantity 3 exceeding quantity 2 is the anomaly worth naming: the register's union reaches **651**
files while its measured denominator is **650**, because one row's directory (`FP-G11`'s
`src/components/welcome`) contains the excluded test file. So the register simultaneously removes
that file from its denominator and counts it in its numerator. `FP-G11` declares 3 files; its
directory actually contains 4 code files, 1 of which is the test.

## 2. Modern side

`frontend/src`: **206 inventoried, 206 measured, 0 test files.** The two quantities coincide, which
is why the same conflation is invisible on the modern side.

## 3. The 1.865× inflation — numerator and denominator, defined

Two published factors differ in the third decimal; both are correct and they are now stated exactly.

| Figure | Numerator (defined) | Denominator (defined) | Factor |
|---|---|---|---|
| Blast-radius figure | **1,212** = Σ over 110 rows of *distinct files resolved within that row* (deduplicated inside each row, **not** across rows), computed over the **650-file** measured universe | 650 measured files | **1.865×** |
| Inventory figure | **1,213** = same sum, computed over the **651-file** raw universe | 651 raw or 650 measured | **1.866×** (÷650) |

**The one-file difference is `src/components/welcome/App.test.js`**, reached by `FP-G11`'s directory
claim in the raw universe and excluded from the measured universe. That is the entire discrepancy —
not a rounding difference and not a second error.

What the ratio means: the average measured file is referenced by **1.865 capabilities**. It is a
measure of *attribution redundancy*, not of coverage. A ratio of 1.0 would mean every file belongs to
exactly one capability; 1.865 means directory-scoped corpora make each file serve nearly two.

## 4. Is any file "fully mapped"? — No claim is made

The mandate warns against describing a file as fully mapped because it appears in the inventory.
M8D makes no point-level mapping claim, and the evidence for why is now explicit:

- **245 files are claimed by more than one row** (quantity 5). A file claimed by four rows is not
  "mapped" in any meaningful sense; it is *reachable from* four corpora.
- The largest overlaps are `cv-templates` (72 files claimed by `FP-E02`, `FP-E03`, and — until this
  mandate — `FP-E09`), the `admin` directory (34 files claimed by `FP-A08`, `FP-A14`, `FP-A15`,
  `FP-A16`, `FP-A19`, `FP-A21`), `src/utils` (43 files claimed by `FP-G15` plus 7 module-level rows)
  and `src/components/cuba` (52 files).
- M8D's reconstruction **removed one of those overlaps**: `FP-E09` no longer claims the 72 template
  files, which is why its corpus fell from 15,832 L to 1,918 L.

**So "650/650 legacy files attributed" is true in the trivial sense — the union covers the tree —
and it is not a mapping claim.** It is published here with that phrasing, and the register's own
wording should be read as coverage-of-union, not assignment.

## 5. Inventoried vs measured vs attributed — worked example

`src/components/welcome/App.test.js`:

| Question | Answer |
|---|---|
| Inventoried? | yes (a `.js` file under `src/`) |
| Measured? | **no** — test/spec excluded by the audit's scope rule |
| Attributed? | **yes** — reached by `FP-G11`'s directory corpus |
| Counted in the 650? | no |
| Counted in the numerator of the inflation ratio (blast radius)? | no |
| Counted in the numerator (raw inventory variant)? | yes — the 1,213 figure |

One file, three different answers, all correct under their own definition. That is the conflation
the mandate asked about, and it is now decomposed.

## 6. Checks run

| Check | Result |
|---|---|
| Symlinks under either tree | **0** |
| Case collisions (would merge on a case-insensitive checkout) | **0** |
| Deleted files / renames | none: enumeration is from the git tree at the audited revision |
| Duplicate paths within a row | present and normal (a row may name a directory *and* a file in it); deduplicated within each row before summing |
| Generated / config / docs / vendored files counted | **no** — extension filter plus excluded directories |
| Volumes reproduce from declared paths (M8D `C13`) | **110/110 rows reproduce exactly** (files and lines) |

`C13` is the machine check that makes the volume figures in this document auditable rather than
asserted: it recomputes `(files, lines)` for every row with declared paths and fails on a 1,000-line
or 3-file edit (`f15`, `f16`).

## 7. Limits

1. Line counts use the register's own convention (a `\n` count, which includes one trailing empty
   element), so a file without a trailing newline counts one higher than `wc -l`. The comparison is
   like-for-like with the register.
2. "Attributed" means *reached by a corpus path*. It does not mean assigned to the capability the
   file implements — which is exactly why M8D's 41-row reconstruction found 9 contaminated corpora.
3. The 1.865× ratio is per-row *file* references. It says nothing about lines: a 10-line stub and a
   2,500-line checkout each count once.
