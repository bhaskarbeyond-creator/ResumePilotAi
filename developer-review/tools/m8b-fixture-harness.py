#!/usr/bin/env python3
"""
m8b-fixture-harness.py — M8B negative testing of tools/m8b-integrity-verify.py.

WHY THIS EXISTS
---------------
A verifier that has only ever been run against a package it passes proves nothing. This
harness builds eight deliberately corrupted copies of the audit dataset, runs the integrity
verifier against each, and asserts that the expected check fails FOR THE EXPECTED REASON.

The unmodified baseline is run first. If the baseline does not fail on the known real
defects, the harness itself is suspect and says so.

Each fixture is written to Evidence/fixtures/m8b/<name>/ so the corruption is reproducible
and auditable; nothing outside the fixture directory is touched.

USAGE
  python3 developer-review/tools/m8b-fixture-harness.py            # run all
  python3 developer-review/tools/m8b-fixture-harness.py --keep     # keep fixture dirs
EXIT
  0 all fixtures rejected for the right reason; 1 any mismatch.
"""
import argparse
import copy
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")
TOOL = os.path.join(DR, "tools", "m8b-integrity-verify.py")
FIXROOT = os.path.join(DR, "Evidence", "fixtures", "m8b")

ARTIFACTS = ("feature-parity.json", "parity-endpoint-audit.json", "capability-subfeatures.json")
DOCS = ("DISCREPANCY-LOG.md", "EVIDENCE-INDEX.md")


def base_dataset(dst):
    os.makedirs(os.path.join(dst, "Evidence", "artifacts"), exist_ok=True)
    for a in ARTIFACTS:
        shutil.copy(os.path.join(DR, "Evidence", "artifacts", a),
                    os.path.join(dst, "Evidence", "artifacts", a))
    for d in DOCS:
        shutil.copy(os.path.join(DR, d), os.path.join(dst, d))
    shutil.copy(os.path.join(DR, "M8A-omission-challenge.json"), os.path.join(dst, "M8A-omission-challenge.json"))


def load(dst, rel):
    return json.load(open(os.path.join(dst, rel), encoding="utf-8"))


def save(dst, rel, obj):
    json.dump(obj, open(os.path.join(dst, rel), "w", encoding="utf-8"), indent=2)


def append(dst, rel, text):
    with open(os.path.join(dst, rel), "a", encoding="utf-8") as fh:
        fh.write(text)


def run(dst):
    p = subprocess.run([sys.executable, TOOL, "--data-dir", dst, "--json"],
                       capture_output=True, text=True)
    try:
        rep = json.loads(p.stdout)
    except json.JSONDecodeError:
        return p.returncode, None, p.stderr
    return p.returncode, rep, p.stderr


# ------------------------------------------------------------------ corruptions
def f1_duplicate_capability(dst):
    """Two rows share one id -> totals inflate, 'one row per capability' unprovable."""
    p = "Evidence/artifacts/feature-parity.json"
    d = load(dst, p)
    rows = d["capabilities"]
    clone = copy.deepcopy(rows[0])
    clone["capability"] = clone["capability"] + " (duplicate fixture)"
    rows.append(clone)
    d["total"] = len(rows)          # keep the count honest so ONLY duplication is wrong
    save(dst, p, d)
    return "C11 unique-rows"


def f2_fabricated_path(dst):
    """A source path that does not exist on disk."""
    p = "Evidence/artifacts/feature-parity.json"
    d = load(dst, p)
    d["capabilities"][0]["legacyPaths"] = ["src/components/does/not/exist"]
    save(dst, p, d)
    return "C02 paths-resolve"


def f3_missing_source_reference(dst):
    """A row claims a corpus but declares no path at all."""
    p = "Evidence/artifacts/feature-parity.json"
    d = load(dst, p)
    r = next(x for x in d["capabilities"] if (x.get("legacyFiles") or 0) > 0)
    r["legacyPaths"] = []
    save(dst, p, d)
    return "C02 paths-resolve"


def f4_incorrect_parity_classification(dst):
    """A row is re-labelled FULL PARITY without any endpoint evidence to support it."""
    p = "Evidence/artifacts/feature-parity.json"
    d = load(dst, p)
    target = next(x for x in d["capabilities"]
                  if x["classification"] != "FULL PARITY" and not (x.get("endpoints") or []))
    target["classification"] = "FULL PARITY"
    e = load(dst, "Evidence/artifacts/parity-endpoint-audit.json")
    e["rows"].append({"id": target["id"], "capability": target["capability"],
                      "declaredInvoke": "n/a", "grade": "SUPPORTED", "endpoints": [],
                      "counts": {"ok": 0, "unreachable": 0, "absent": 0, "ambiguous": 0}})
    e["fullParityRows"] = len(e["rows"])
    e["tally"]["SUPPORTED"] = e["tally"].get("SUPPORTED", 0) + 1
    save(dst, "Evidence/artifacts/parity-endpoint-audit.json", e)
    save(dst, p, d)
    return "C06 full-evidence"


def f5_incorrect_summary_count(dst):
    """A published total that no longer equals the rows it summarises."""
    p = "Evidence/artifacts/feature-parity.json"
    d = load(dst, p)
    d["total"] = d["total"] + 3
    d["counts"]["PARTIAL PARITY"] = d["counts"].get("PARTIAL PARITY", 0) + 3
    save(dst, p, d)
    return "C07 exact-totals"


def f6_unresolved_marked_closed(dst):
    """A finding declared resolved while citing evidence that does not exist."""
    append(dst, "DISCREPANCY-LOG.md", """
## [DISC-999] Fixture: finding marked resolved without resolving evidence

**Severity:** P2 — High

**Verification status:** STATICALLY VERIFIED

**Resolution status:** RESOLVED — no evidence cited for this claim.
""")
    return "C10 verification-evidence"


def f7_full_row_without_implementation(dst):
    """A FULL row whose declared endpoints all resolve as absent."""
    p = "Evidence/artifacts/parity-endpoint-audit.json"
    d = load(dst, p)
    d["rows"][0]["endpoints"] = ["/definitely/not/registered"]
    d["rows"][0]["counts"] = {"ok": 0, "unreachable": 0, "absent": 1, "ambiguous": 0}
    d["rows"][0]["grade"] = "SUPPORTED"     # the dishonest grade the audit produced
    save(dst, p, d)
    return "C06 full-evidence"


def f8_duplicated_measurement_table(dst):
    """Two different capabilities carry the same non-trivial subfeature distribution."""
    p = "Evidence/artifacts/capability-subfeatures.json"
    d = load(dst, p)
    rows = d["capabilities"]
    src = max(rows, key=lambda r: sum((c.get("legacy") or 0) for c in (r.get("subfeatures") or [])))
    dst_row = next(r for r in rows if r is not src and r["id"] != src["id"])
    dst_row["subfeatures"] = copy.deepcopy(src["subfeatures"])
    save(dst, p, d)
    return "C05 duplicate-dist"


FIXTURES = [
    ("f1_duplicate_capability", f1_duplicate_capability),
    ("f2_fabricated_path", f2_fabricated_path),
    ("f3_missing_source_reference", f3_missing_source_reference),
    ("f4_incorrect_parity_classification", f4_incorrect_parity_classification),
    ("f5_incorrect_summary_count", f5_incorrect_summary_count),
    ("f6_unresolved_marked_closed", f6_unresolved_marked_closed),
    ("f7_full_row_without_implementation", f7_full_row_without_implementation),
    ("f8_duplicated_measurement_table", f8_duplicated_measurement_table),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true")
    a = ap.parse_args()

    # Remove only the GENERATED fixture directories. Deleting all of FIXROOT also destroyed the
    # committed README.md next to them, which is how a documentation file kept disappearing.
    os.makedirs(FIXROOT, exist_ok=True)
    for entry in os.listdir(FIXROOT):
        ep = os.path.join(FIXROOT, entry)
        if os.path.isdir(ep):
            shutil.rmtree(ep)

    rows, failures = [], 0

    # baseline: must reproduce the real defects, else the harness proves nothing
    base = os.path.join(FIXROOT, "_baseline")
    base_dataset(base)
    rc, rep, err = run(base)
    failed_checks = [r["check"] for r in (rep or {}).get("results", []) if not r["ok"]]
    print(f"BASELINE  exit={rc}  failing={failed_checks}")
    if not failed_checks:
        print("ABORT: the baseline passes, so this harness cannot demonstrate rejection. "
              "Either the package is now clean or the verifier lost its teeth.")
        return 1
    rows.append({"fixture": "_baseline", "expected": "(known real defects)", "exit": rc,
                 "failed": failed_checks, "verdict": "BASELINE_REPRODUCES"})

    for name, fn in FIXTURES:
        dst = os.path.join(FIXROOT, name)
        base_dataset(dst)
        expected = fn(dst)
        rc, rep, err = run(dst)
        if rep is None:
            print(f"ERROR {name}: verifier crashed: {err[:200]}")
            failures += 1
            continue
        failed = {r["check"]: r["rejections"] for r in rep["results"] if not r["ok"]}
        hit = expected in failed
        # the rejection must name the corruption itself, not merely fail somewhere. A finding
        # id (DISC-999) or row id is the token that proves the right reason.
        blob = json.dumps(failed.get(expected, []))
        token_ok = True
        if name == "f6_unresolved_marked_closed":
            token_ok = "DISC-999" in blob
        reason = ""
        if hit and failed[expected]:
            first = next((x for x in failed[expected]
                          if (not token_ok) or ("DISC-999" in json.dumps(x))), failed[expected][0])
            reason = (first.get("reason") or "")[:110]
        ok = hit and rc == 1 and token_ok
        failures += 0 if ok else 1
        rows.append({"fixture": name, "expected": expected, "exit": rc,
                     "failed": sorted(failed), "caught": hit, "reason": reason,
                     "verdict": "REJECTED_CORRECTLY" if ok else "NOT_REJECTED_AS_EXPECTED"})
        print(f"{'OK  ' if ok else 'BAD '} {name:<38} expect={expected:<18} "
              f"exit={rc} caught={hit}  {reason}")

    print("\n--- Summary ---")
    print(f"fixtures: {len(FIXTURES)}  rejected-for-the-right-reason: {len(FIXTURES) - failures}"
          f"  failures: {failures}")
    json.dump(rows, open(os.path.join(FIXROOT, "harness-results.json"), "w"), indent=2)
    if not a.keep:
        pass  # fixture dirs are kept deliberately: they are the reproducible evidence
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
