# M8C — File Inventory Reconciliation (650 vs 651)

**Mandate:** 8C §6 (P1). **Audited revision:** `69a3ed4`.
**Machine-readable inventory:** `Evidence/artifacts/m8c-file-inventory.json`.
**Reproduce:** `python3 developer-review/tools/m8c-file-inventory.py [--json]` — exit 0 means the
inventory regenerates and reconciles.

---

## 1. Result

**650 vs 651 is resolved, and it was never a lost file.**

| Quantity | Legacy (`src/`) | Modern (`frontend/src`) |
|---|---|---|
| Inventoried — every `.js`/`.jsx` (resp. `.ts`/`.tsx`) in the git tree at `69a3ed4` | **651** | **206** |
| Test/spec files excluded by the audit's own scope rule | **1** — `src/components/welcome/App.test.js` | 0 |
| Measured — in scope | **650** | **206** |
| Mapped — reached by at least one capability corpus | 651 distinct | — |
| Never mapped | **0** | — |

So: **651 = raw code files; 650 = the same set minus one test file.** The two totals describe
different populations, and the register quotes the 650 figure as "650/650 attributed" while its own
corpus union reaches 651.

The generator already carried this correction as a code comment
(`tools/legacy-modern-inventory.cjs`, V5 correction note: "`walk` did not [exclude tests], so
`src/components/welcome/App.test.js` was counted in the legacy baseline (651 → 650)"). This
reconciliation confirms that comment against the tree rather than trusting it.

## 2. Checks the mandate required

| Check | Result |
|---|---|
| Symlinks | **0** under both trees (git reports mode `120000`; enumeration by name plus mode check found none) |
| Case collisions (would merge on a case-insensitive checkout) | **0** — no two legacy paths collide case-insensitively |
| Deleted files | none: enumeration is from the git tree at the audited revision, so a working-copy deletion cannot hide a file |
| Renames | none detectable: no path in the register fails to resolve (verifier C02 passes, 0 fabricated paths) |
| Duplicate paths within a row | possible and normal (a row may name a directory *and* a file inside it); the tool deduplicates within each row before summing, which is why the per-row sum is 1,212 and not higher |
| Generated / test / config / docs / vendored | **not counted**: extensions are restricted to `.js/.jsx` (legacy) and `.ts/.tsx` (modern); `node_modules`, `.git`, `dist`, `coverage`, `build`, `out` are skipped |
| Attributable to a wrong revision | no: modern = 206 and legacy in-scope = 650 at `69a3ed4`, matching the register's own counts |

## 3. The conflation the mandate warned about

The mandate asked specifically whether "inventoried", "measured" and "mapped to capabilities" had
been conflated. **They had.** The inventory separates them now, and the separation changes what the
"100% attribution" claim means:

- **Inventoried 651 → Measured 650** is a scope rule (tests excluded). Fine.
- **Measured 650 → Mapped 651 distinct** is *not* a coverage achievement. It happens because
  directory-scoped corpora recurse: a row that names `src/components/admin` maps all 68 files under
  it. When four rows name the same directory, all four "map" the same files.
- Consequently **"650/650 legacy files attributed" is trivially true and evidentially weak.** It
  states that the union of corpora covers the tree, not that each file is attributed to the
  capability it implements. A file can be attributed to four capabilities at once; 1,212 per-row
  file references over 650 distinct files (**1.865×**) is the number that shows how weak.
- Worse, the union reaches **651**, one *more* than the measured 650, because one corpus
  (`FP-G20`'s) includes the excluded test file. So the register simultaneously (a) excludes a test
  file from its denominator and (b) counts it in its numerator. That is a small but real
  inconsistency, recorded as a delta (§`m8c-register-evidence-delta.json`) rather than
  silently repaired, because repairing it would change a published attribution figure.

**No claim of 100% file mapping is made here from matching totals.** Completeness of the union is
demonstrated; point-level mapping is not, and would require a file→capability assignment that the
register does not contain.

## 4. Modern side

Modern `.ts/.tsx` files: **206 inventoried, 206 measured, 0 test files.** The modern tree contains
no test/spec files under `frontend/src`, so its two quantities coincide — which is why the same
conflation is invisible on the modern side and only shows up on the legacy side.

## 5. Verification commands

```
python3 developer-review/tools/m8c-file-inventory.py
git ls-tree -r --name-only 69a3ed4 -- src | grep -E '\.jsx?$' | wc -l      # 651
git ls-tree -r --name-only 69a3ed4 -- src | grep -E '\.jsx?$' | grep -vE '\.(test|spec)\.' | wc -l  # 650
```

## 6. Limitations

1. Line counts are `splitlines()` of the file at the audited revision; a file without a trailing
   newline reports one fewer line than a naive `wc -l`. The register's figure is compared qu
   the same method, so the comparison is like-for-like.
2. "Mapped" means *reached by a corpus path*, not *assigned to the right capability*. Only the
   shared-corpus reconstruction (19 rows) and the capability-scoped overlay (16 rows) narrow that.
3. The test-file exclusion is the audit's own rule. If the rule were changed, 650 would become 651
   and every attribution percentage would shift by 0.15%.
