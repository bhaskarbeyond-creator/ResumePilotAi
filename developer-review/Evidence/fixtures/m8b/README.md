# M8B verifier regression fixtures

These fixtures are **generated deterministically**, not stored. Each is the audit dataset with exactly one
corruption applied, produced by `developer-review/tools/m8b-fixture-harness.py`.

> **Note:** the harness deletes and rebuilds this directory on every run (`FIXROOT` is cleared at start), so this
> README and `harness-results.json` are rewritten each time. If you run the harness, re-add this file afterwards —
> or simply rely on the harness output, which is authoritative.

The bulky per-fixture dataset copies are **deliberately not committed**: they are 8 near-copies of the same
artifacts (~870 KB each) and the harness rebuilds them byte-identically in under a second. What *is* committed is
`harness-results.json`, which records for every fixture the expected check, the observed failing checks, the exit
code, whether it was caught, and the rejection reason.

Regenerate everything with:

```bash
python3 developer-review/tools/m8b-fixture-harness.py   # exit 0 == all 8 rejected for the right reason
```

| fixture | corruption | expected rejection |
|---|---|---|
| f1_duplicate_capability | one row id appears twice | C11 unique-rows |
| f2_fabricated_path | source path that does not exist | C02 paths-resolve |
| f3_missing_source_reference | row declares a corpus but names no path | C02 paths-resolve |
| f4_incorrect_parity_classification | non-FULL row relabelled FULL with no endpoints | C06 full-evidence |
| f5_incorrect_summary_count | published totals inflated | C07 exact-totals |
| f6_unresolved_marked_closed | finding marked RESOLVED, cites nothing | C10 verification-evidence |
| f7_full_row_without_implementation | FULL row whose endpoints are all absent | C06 full-evidence |
| f8_duplicated_measurement_table | one row's subfeature vector copied onto another | C05 duplicate-dist |

The harness always runs the **unmodified baseline first** and aborts if it does not reproduce the known real
defects — a negative test suite that cannot fail proves nothing.
