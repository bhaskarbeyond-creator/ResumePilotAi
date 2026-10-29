#!/usr/bin/env python3
"""Structural assertions for the 2026-10-29 re-audit artifacts.

Kept in Python (not bash) so that JSON/markdown assertions stay readable and so the
shell verifier never has to nest quoting.

Usage: verify-parity.py <check-id>
Exit 0 = pass, 1 = fail (prints the reason on stderr).
"""
import json
import os
import re
import sys

DR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARITY = os.path.join(DR, "Evidence", "artifacts", "feature-parity.json")
COVERAGE = os.path.join(DR, "Evidence", "artifacts", "backend-ui-coverage.json")
INVENTORY = os.path.join(DR, "Evidence", "artifacts", "legacy-modern-inventory.json")


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def parity():
    return json.loads(read(PARITY))


def check_registry_parses():
    data = parity()
    assert data["total"] >= 100, f"only {data['total']} capabilities"
    assert data["capabilities"], "no capability rows"


def check_ids_unique():
    ids = [c["id"] for c in parity()["capabilities"]]
    assert len(ids) == len(set(ids)), "duplicate capability IDs"
    bad = [i for i in ids if not re.fullmatch(r"FP-[A-G][0-9]{2}", i)]
    assert not bad, f"malformed IDs: {bad}"


def check_vocabulary():
    data = parity()
    bad = {c["id"]: c["classification"] for c in data["capabilities"] if c["classification"] not in data["vocabulary"]}
    assert not bad, f"out-of-vocabulary classifications: {bad}"


def check_attribution_complete():
    data = parity()
    left = data["legacySourceUnattributed"]
    assert not left, f"{len(left)} legacy source files unattributed, e.g. {left[:5]}"
    assert data["legacyFilesMeasured"] >= 600, f"only {data['legacyFilesMeasured']} legacy files measured"


def check_totals_reconcile():
    data = parity()
    if sum(data["counts"].values()) != data["total"]:
        raise AssertionError("counts do not sum to total")
    if sum(v["total"] for v in data["byDomain"].values()) != data["total"]:
        raise AssertionError("domain totals do not sum to total")
    for domain, value in data["byDomain"].items():
        if sum(value["byClassification"].values()) != value["total"]:
            raise AssertionError(f"{domain}: classification counts do not sum to its total")


def check_matrix_renders_ids():
    md = read(os.path.join(DR, "FEATURE-PARITY-MATRIX.md"))
    missing = [c["id"] for c in parity()["capabilities"] if c["id"] not in md]
    assert not missing, f"IDs missing from matrix doc: {missing[:5]}"


def check_coverage_reconciles():
    counts = json.loads(read(COVERAGE))["counts"]
    total = counts["consumedByModern"] + counts["backendWithoutModernUi"]
    assert total == counts["uniqueMethodPaths"], f"{total} != {counts['uniqueMethodPaths']}"
    assert counts["backendWithoutModernUi"] > 0, "no backend-without-UI rows"


def check_allegations():
    md = read(os.path.join(DR, "LEGACY-MODERN-FEATURE-INVENTORY.md"))
    ids = re.findall(r"^\| (RA-\d{2}) \|", md, re.M)
    assert len(ids) >= 30, f"only {len(ids)} adjudications"
    assert len(ids) == len(set(ids)), "duplicate allegation IDs"
    for verdict in ("CONFIRMED", "REFUTED", "PARTIAL", "UNRESOLVED"):
        assert verdict in md, f"no {verdict} verdicts recorded"


def check_discrepancy_ids():
    md = read(os.path.join(DR, "DISCREPANCY-LOG.md"))
    ids = sorted(set(re.findall(r"## \[(DISC-\d{3})\]", md)))
    for expected in ("DISC-013", "DISC-014", "DISC-015", "DISC-016", "DISC-017", "DISC-018"):
        assert expected in ids, f"{expected} missing"
    declared = int(re.search(r"Total confirmed findings in this log: \*\*(\d+)\*\*", md).group(1))
    # V7: DISC-042 and DISC-046 are merge stubs (folded into DISC-030 to keep the finding set free of
    # duplicates). They keep their headings so citations do not break, and are excluded from the count.
    merged = len(re.findall(r"## \[DISC-\d{3}\] MERGED INTO", md))
    assert declared == len(ids) - merged, f"declared {declared} but {len(ids)} DISC entries exist ({merged} merged stubs)"


def check_history_preserved():
    md = read(os.path.join(DR, "DISCREPANCY-LOG.md"))
    assert "SUPERSEDED IN PART" in md, "DISC-001 supersession banner missing"
    assert "144 files/dirs" in md, "the superseded prior figure was edited away instead of preserved"


def check_evidence_ids():
    md = read(os.path.join(DR, "EVIDENCE-INDEX.md"))
    for number in ("325", "326", "327", "328", "329", "330", "331", "332"):
        assert f"E-{number}" in md, f"E-{number} missing"


def check_requirement_ids():
    md = read(os.path.join(DR, "REQUIREMENT-REGISTER.md"))
    for number in range(120, 130):
        assert f"R-{number}" in md, f"R-{number} missing"


def check_amendments_dated():
    files = [
        "PARITY-MATRIX-V2.md", "EXECUTIVE-GAP-SUMMARY.md", "UI-UX-AUDIT.md",
        "REPAIR-ACTION-PLAN.md", "HANDOVER.md", "README.md",
        "REQUIREMENT-REGISTER.md", "EVIDENCE-INDEX.md", "DISCREPANCY-LOG.md",
    ]
    missing = [f for f in files if "2026-10-29" not in read(os.path.join(DR, f))]
    assert not missing, f"no dated amendment in: {missing}"


def check_no_unearned_retirement():
    retired = [c["id"] for c in parity()["capabilities"] if c["classification"] == "INTENTIONAL RETIREMENT"]
    assert not retired, f"retirement asserted without documented intent: {retired}"


def check_inventory_domains():
    data = json.loads(read(INVENTORY))
    required = ["A-super-admin", "B-enterprise", "C-portfolio-webcv", "D-voice-interview",
                "E-resume-templates", "E-resume-builder", "F-employer", "G-platform-shared"]
    missing = [d for d in required if d not in data["domains"]]
    assert not missing, f"domains missing from inventory: {missing}"
    assert data["counts"]["legacyFiles"] >= 600, "legacy file count looks under-measured"


CHECKS = {
    "registry": check_registry_parses,
    "ids": check_ids_unique,
    "vocabulary": check_vocabulary,
    "attribution": check_attribution_complete,
    "totals": check_totals_reconcile,
    "matrix-ids": check_matrix_renders_ids,
    "coverage": check_coverage_reconciles,
    "allegations": check_allegations,
    "discrepancy-ids": check_discrepancy_ids,
    "history": check_history_preserved,
    "evidence-ids": check_evidence_ids,
    "requirement-ids": check_requirement_ids,
    "amendments": check_amendments_dated,
    "retirement": check_no_unearned_retirement,
    "inventory-domains": check_inventory_domains,
}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in CHECKS:
        print(f"usage: {sys.argv[0]} <{'|'.join(sorted(CHECKS))}>", file=sys.stderr)
        sys.exit(2)
    try:
        CHECKS[sys.argv[1]]()
    except AssertionError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    sys.exit(0)
