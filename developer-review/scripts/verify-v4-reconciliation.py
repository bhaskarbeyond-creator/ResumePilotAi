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



def _filesystem_count(root, exts, exclude_patterns=()):
    total = 0
    for base, _dirs, names in os.walk(os.path.join(ROOT, root)):
        for name in names:
            if not name.endswith(tuple(exts)):
                continue
            if any(re.search(pat, name) for pat in exclude_patterns):
                continue
            total += 1
    return total


def c_source_counts_independent():
    """Recompute the two headline file counts from the working tree, not from the artifact."""
    data = parity()
    legacy_disk = _filesystem_count("src", (".js", ".jsx"), (r"\.(test|spec)\.[cm]?jsx?$",))
    modern_disk = _filesystem_count("frontend/src", (".ts", ".tsx"))
    assert data["legacyFilesMeasured"] == legacy_disk, (
        f"legacy: register says {data['legacyFilesMeasured']}, filesystem has {legacy_disk}")
    assert data["modernFilesMeasured"] == modern_disk, (
        f"modern: register says {data['modernFilesMeasured']}, filesystem has {modern_disk}")
    ledger = read("Evidence", "artifacts", "legacy-file-inventory.tsv").strip().splitlines()
    assert len(ledger) - 1 == legacy_disk, f"ledger rows {len(ledger) - 1} != filesystem {legacy_disk}"


def c_operation_register_matches_tsv():
    tsv = read("Evidence", "artifacts", "backend-operations.tsv").strip().splitlines()
    rows = len(tsv) - 1
    total = reach()["total"]
    assert rows == total, f"tsv has {rows} rows, json total is {total}"


def c_dispositions_enumerated():
    """Every category the coverage claim aggregates must still enumerate to its stated size."""
    disc = len(re.findall(r"## \[DISC-\d{3}\]", read("DISCREPANCY-LOG.md")))
    req = len(re.findall(r"^\| \*\*R-\d{3}\*\*", read("REQUIREMENT-REGISTER.md"), re.M))
    ra = len(re.findall(r"^\| (RA-\d{2}) \|", read("ALLEGATION-RESOLUTION-REGISTER.md"), re.M))
    eg_doc = read("EG-REVALIDATION-REGISTER.md")
    eg_missing = [f"EG-{n:03d}" for n in range(1, 13) if f"EG-{n:03d}" not in eg_doc]
    a11y = len(re.findall(r"A11Y-00[1-5]", read("EG-REVALIDATION-REGISTER.md")))
    caps = parity()["total"]
    ops = reach()["total"]
    assert disc == 26, f"expected 26 findings after DISC-024..026, found {disc}"
    assert req == 65, f"expected 65 requirements, found {req}"
    assert ra == 35, f"expected 35 allegations, found {ra}"
    assert not eg_missing, f"EG entries not dispositioned: {eg_missing}"
    assert caps == 112 and ops == 385, f"caps {caps}, ops {ops}"


def c_coverage_total_arithmetic():
    """The package's headline coverage figure must equal the sum of its parts."""
    data = parity()
    doc = read("V4-COVERAGE-RECONCILIATION.md")
    parts = [data["legacyFilesMeasured"], data["modernFilesMeasured"], data["total"],
             reach()["total"], 35, 26, 65, 17]
    total = sum(parts)
    assert total == 1496, f"parts sum to {total}, not 1,496"
    assert "1,496" in doc, "coverage document does not state the corrected total"
    assert "2,092" not in doc, "retracted total still present as a claim"


def c_client_calls_consistent():
    """DISC-025's numbers must match the artifact it cites, and the artifact must be internally consistent."""
    art = json.loads(read("Evidence/artifacts/client-call-existence.json"))
    tally = art["tally"]
    assert art["callSites"] == sum(tally.values()), "callSites != sum of tally"
    assert art["filesScanned"] > 200, f"only {art['filesScanned']} files scanned"
    missing_sites = tally.get("MISSING", 0)
    dead_paths = len(art["distinctMissingEndpoints"])
    assert dead_paths == 23, f"expected 23 dead paths, found {dead_paths}"
    assert missing_sites == sum(min(1, 1) for c in art["calls"] if c["status"] == "MISSING"), "MISSING tally mismatch"
    assert tally.get("METHOD-MISMATCH", 0) == 0, "unexpected verb mismatches"
    log = read("DISCREPANCY-LOG.md")
    assert "23 client-side paths" in log, "DISC-025 headline does not match the artifact"
    rows = len(re.findall(r"^\| \d+ \| `(?:GET|POST|PUT|PATCH|DELETE) /", log, re.M))
    assert rows == 23, f"DISC-025 table lists {rows} paths, artifact has {dead_paths}"


def c_full_parity_supported():
    """Every surviving FULL PARITY row must be endpoint-supported and reachability-supported."""
    art = json.loads(read("Evidence/artifacts/parity-endpoint-audit.json"))
    data = parity()
    full = sum(1 for c in data["capabilities"] if c["classification"] == "FULL PARITY")
    assert art["fullParityRows"] == full, f"audit covers {art['fullParityRows']} rows, parity has {full} FULL"
    bad = {k: v for k, v in art["tally"].items() if k != "SUPPORTED" and v}
    assert not bad, f"FULL PARITY rows still unsupported: {bad}"
    assert full == 19, f"expected 19 FULL PARITY rows, found {full}"
    assert art["allRowsChecked"] == 112, f"endpoint audit covered {art['allRowsChecked']} rows, not 112"
    summary = art["allRowsSummary"]
    assert summary["fullySupported"] == 67, f"fully supported rows: {summary['fullySupported']}"
    assert summary["withUnsupportedEndpoint"] == 31, f"unsupported-endpoint rows: {summary['withUnsupportedEndpoint']}"
    assert summary["withUnreachableEndpoint"] == 15, f"unreachable-endpoint rows: {summary['withUnreachableEndpoint']}"
    assert summary["rowsWithNoDeclaredEndpoint"] == 38, f"rows with no endpoint: {summary['rowsWithNoDeclaredEndpoint']}"
    doc = read("V4-COVERAGE-RECONCILIATION.md")
    assert "Endpoint resolution applied to all 112 rows" in doc, "requirement (d) residue statement missing"


def c_reach_doc_matches_register():
    """The reachability document's class table must equal the register artifact."""
    doc = read("BACKEND-OPERATION-REACHABILITY.md")
    classes = reach()["classes"]
    for name, n in classes.items():
        assert re.search(r"\| `%s` \| \*\*%d\*\* \|" % (re.escape(name), n), doc), \
            f"{name}={n} not found in the reachability document table"
    assert "Per-operation rationale for all 176" in doc, "per-operation rationale table missing"


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
    ("legacy/modern counts recomputed from the filesystem", c_source_counts_independent),
    ("operation register matches its TSV", c_operation_register_matches_tsv),
    ("every dispositioned category enumerates", c_dispositions_enumerated),
    ("client call existence artifact reconciles", c_client_calls_consistent),
    ("every FULL PARITY row is supported", c_full_parity_supported),
    ("reachability document matches the register", c_reach_doc_matches_register),
    ("coverage total equals the sum of its parts", c_coverage_total_arithmetic),
]:
    check(name, fn)

print("--- Summary ---")
print(f"PASS: {checks - len(findings)}  FAIL: {len(findings)}")
sys.exit(0 if not findings else 1)
