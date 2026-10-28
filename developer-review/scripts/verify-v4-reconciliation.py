#!/usr/bin/env python3
"""V4 reconciliation verifier — stronger checks than verify-audit-package.sh.

Written because AUDIT-CHECK-PROVENANCE.md found that 58 of the 61 existing checks are
self-referential: none stats a path, none re-derives a number from the repository, and
none notices when a document and its generator disagree.

This script is deliberately SEPARATE from verify-audit-package.sh. The old script is not
weakened, relaxed, or edited — a verifier that is adjusted until the package passes is
worthless.

Checks:
  1. capability totals sum, per domain and overall
  2. every legacy/modern path cited by a capability row exists on disk
  3. both trees are fully attributed (legacy AND modern — the old script checks legacy only)
  4. backend register: class counts sum to the unique-operation total, and the classes are
     exactly the seven the mandate names
  5. the reachability document's headline table matches the JSON it was generated from
  6. DISC headings == declared total; RA rows == expected count and unique
  7. every V4 artifact exists
  8. no V4 document claims FULL PARITY for a row with no modern anchor

Exit 0 = clean, 1 = findings (printed).
"""
import json
import os
import re
import sys

DR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(DR)
findings = []
checks = 0


def check(name, fn):
    global checks
    checks += 1
    try:
        fn()
        print(f"PASS: {name}")
    except AssertionError as exc:
        findings.append(name)
        print(f"FAIL: {name} -> {exc}")


def read(*parts):
    with open(os.path.join(DR, *parts), encoding="utf-8", errors="replace") as handle:
        return handle.read()


def parity():
    return json.loads(read("Evidence", "artifacts", "feature-parity.json"))


def reach():
    return json.loads(read("Evidence", "artifacts", "backend-reachability.json"))


CLASSES = {
    "UI-REACHABLE", "INDIRECTLY-REACHABLE", "EXTERNAL-CALLER", "SERVER-ONLY",
    "INTENTIONALLY-UNEXPOSED", "UNREACHABLE", "UNVERIFIED",
}


def c_totals():
    data = parity()
    assert sum(data["counts"].values()) == data["total"], "classification counts do not sum to total"
    assert sum(v["total"] for v in data["byDomain"].values()) == data["total"], "domain totals do not sum"
    for domain, value in data["byDomain"].items():
        assert sum(value["byClassification"].values()) == value["total"], f"{domain} does not sum"
    assert data["total"] == len(data["capabilities"]), "row count differs from declared total"


def c_paths_exist():
    data = parity()
    missing = []
    for cap in data["capabilities"]:
        for kind in ("legacyPaths", "modernPaths"):
            for path in cap.get(kind) or []:
                if not path or path.startswith("http"):
                    continue
                if not os.path.exists(os.path.join(ROOT, path)):
                    missing.append(f"{cap['id']}:{kind}:{path}")
    assert not missing, f"{len(missing)} cited path(s) do not exist, e.g. {missing[:6]}"


def c_both_attributed():
    data = parity()
    assert not data.get("legacySourceUnattributed"), f"legacy unattributed: {data.get('legacySourceUnattributed')[:5]}"
    assert not data.get("modernSourceUnattributed"), f"modern unattributed: {data.get('modernSourceUnattributed')[:5]}"


def c_reach_sums():
    data = reach()
    counts = data["classes"]
    assert set(counts) == CLASSES, f"unexpected class set: {set(counts) ^ CLASSES}"
    assert sum(counts.values()) == data["total"] == len(data["operations"]), "class counts do not sum to operations"
    assert data["units"]["uniqueMethodPath"] == data["total"], "unit mismatch between registrations and operations"


def c_reach_doc_matches():
    doc = read("BACKEND-OPERATION-REACHABILITY.md")
    counts = reach()["classes"]
    for name, value in counts.items():
        pattern = rf"\|\s*`{re.escape(name)}`\s*\|\s*\*\*{value}\*\*"
        assert re.search(pattern, doc), f"{name}={value} not rendered in the document table"


def c_ids():
    disc = read("DISCREPANCY-LOG.md")
    headings = sorted(set(re.findall(r"## \[(DISC-\d{3})\]", disc)))
    declared = int(re.search(r"Total confirmed findings in this log: \*\*(\d+)\*\*", disc).group(1))
    assert declared == len(headings), f"declared {declared}, headings {len(headings)}"
    reg = read("ALLEGATION-RESOLUTION-REGISTER.md")
    ra = re.findall(r"^\| (RA-\d{2}) \|", reg, re.M)
    assert len(ra) == len(set(ra)), "duplicate RA ids in the register"
    assert len(ra) == 35, f"expected 35 allegations, found {len(ra)}"


def c_artifacts_present():
    required = [
        "V4-COVERAGE-RECONCILIATION.md", "V4-FINAL-ACCEPTANCE-REPORT.md",
        "ALLEGATION-RESOLUTION-REGISTER.md", "AUDIT-CHECK-PROVENANCE.md",
        "AUDIT-CHANGE-HISTORY.md", "BACKEND-OPERATION-REACHABILITY.md",
        "EG-REVALIDATION-REGISTER.md", "METRIC-DEFINITIONS.md",
        "OAUTH-PROBE.md", "RUNTIME-VERIFICATION-V4.md",
        "Evidence/artifacts/backend-operations.tsv",
        "Evidence/artifacts/backend-reachability.json",
        "Evidence/logs/v4/backend-full-suite.log",
        "Evidence/logs/v4/enterprise-suite.log",
        "Evidence/logs/v4/backend-syntax.log",
        "Evidence/logs/v4/frontend-typecheck.log",
    ]
    missing = [p for p in required if not os.path.exists(os.path.join(DR, p))]
    assert not missing, f"missing: {missing}"


def c_no_unevidenced_full():
    bad = [c["id"] for c in parity()["capabilities"]
           if c["classification"] == "FULL PARITY" and not c.get("modernPaths")]
    assert not bad, f"FULL PARITY without a modern anchor: {bad}"


def c_no_placeholder_ids():
    """Every path-like token in the register must exist, guards against invented anchors."""
    data = parity()
    suspicious = []
    for cap in data["capabilities"]:
        for path in (cap.get("modernPaths") or []) + (cap.get("legacyPaths") or []):
            if "*" in path or path.endswith("/**"):
                suspicious.append(f"{cap['id']}:{path}")
    assert not suspicious, f"glob-style paths in register: {suspicious[:5]}"


for name, fn in [
    ("capability totals reconcile", c_totals),
    ("every cited path exists on disk", c_paths_exist),
    ("both trees fully attributed", c_both_attributed),
    ("reachability classes are the seven and sum to the total", c_reach_sums),
    ("reachability document matches its JSON", c_reach_doc_matches),
    ("finding/allegation IDs are consistent", c_ids),
    ("all V4 artifacts present", c_artifacts_present),
    ("no FULL PARITY row without a modern anchor", c_no_unevidenced_full),
    ("no glob-style paths in the register", c_no_placeholder_ids),
]:
    check(name, fn)

print("--- Summary ---")
print(f"PASS: {checks - len(findings)}  FAIL: {len(findings)}")
sys.exit(0 if not findings else 1)
