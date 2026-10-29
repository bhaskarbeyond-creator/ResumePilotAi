#!/usr/bin/env python3
"""
m8c-register-delta.py — publish what changed in the register and the evidence base, instead of
rewriting history.

WHY THIS EXISTS
---------------
M8C is forbidden from silently rewriting the audited record, and equally forbidden from pretending
nothing changed. This tool reads the immutable inputs plus the M8C overlay and emits a DELTA: what
was found to be wrong, what M8C added, and which published statements are superseded. Nothing here
edits a register row; the supersession is recorded alongside it.

USAGE
  python3 developer-review/tools/m8c-register-delta.py [--json]
EXIT 0 always (an analysis, not a gate).
"""
import argparse
import collections
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")
PARITY = os.path.join(DR, "Evidence", "artifacts", "feature-parity.json")
SUBS = os.path.join(DR, "Evidence", "artifacts", "capability-subfeatures.json")
SCOPING = os.path.join(DR, "Evidence", "artifacts", "m8c-corpus-scoping.json")
DISC = os.path.join(DR, "DISCREPANCY-LOG.md")
AUDITED_REV = "69a3ed4"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    parity = json.load(open(PARITY, encoding="utf-8"))
    subs = json.load(open(SUBS, encoding="utf-8"))
    overlay = json.load(open(SCOPING, encoding="utf-8"))
    rows = parity["capabilities"]
    disc_text = open(DISC, encoding="utf-8").read()

    # ---- duplicate findings -----------------------------------------------------------------
    # an alias may announce itself either on the heading line or on the first line of the body
    merged_rows = []
    for line in disc_text.splitlines():
        if "MERGED INTO" not in line:
            continue
        m = re.match(r"^## \[(DISC-\d{3})\][^\n]*?MERGED INTO (DISC-\d{3})", line)
        if not m:
            m = re.match(r"^\s*(?:\*\*)?MERGED INTO (DISC-\d{3})", line)
            if not m:
                continue
            # body line: attribute it to the nearest preceding heading
            head = [h for h in re.findall(r"^## \[(DISC-\d{3})\]", disc_text[:disc_text.index(line) if line in disc_text else 0], re.M)]
            if not head:
                continue
            merged_rows.append({"finding": head[-1], "mergedInto": m.group(1)})
            continue
        merged_rows.append({"finding": m.group(1), "mergedInto": m.group(2)})
    finding_ids = re.findall(r"^## \[(DISC-\d{3})\]", disc_text, re.M)
    distinct_findings = len(set(finding_ids)) - len(merged_rows)

    # ---- evidence resolution -----------------------------------------------------------------
    blocks = re.split(r"^## \[(DISC-\d{3})\]", disc_text, flags=re.M)
    unresolved, citing = [], 0
    for i in range(1, len(blocks), 2):
        paths = set(re.findall(r"Evidence/[A-Za-z0-9/_.\-]+\.(?:json|log|png|tsv|md)", blocks[i + 1]))
        if paths:
            citing += 1
        for p in paths:
            if not os.path.exists(os.path.join(DR, p)):
                unresolved.append({"finding": blocks[i], "path": p})

    # ---- register rows without evidence -------------------------------------------------------
    no_evidence = [r["id"] for r in rows if not str(r.get("evidence") or "").strip()]

    # ---- revision drift -----------------------------------------------------------------------
    rev_in_register = parity.get("revision")
    drift = {"registerRevision": rev_in_register, "auditedRevision": AUDITED_REV,
             "stale": bool(rev_in_register) and not AUDITED_REV.startswith(str(rev_in_register)[:7]),
             "consequence": ("row-level file/line citations were captured at the register revision; "
                             "they are re-resolved against the audited tree by verifier C02, and any "
                             "row whose paths no longer resolve fails that check")}

    # ---- overlay statistics -------------------------------------------------------------------
    ov_rows = overlay.get("rows") or {}
    scope_counts = collections.Counter((v.get("corpusScope") or "UNDECLARED") for v in ov_rows.values())
    stale_artifact = [k for k, v in ov_rows.items() if v.get("artifactDistributionStale")]
    still_needs_correction = [k for k, v in ov_rows.items() if v.get("requiresCorrection")]

    # ---- superseded published statements ------------------------------------------------------
    superseded = [
        {"statement": "parity is 11.1%", "denominator": "13/117 (112 accepted + 5 proposals)",
         "supersededBy": "13/112 = 11.61% strict FULL parity over accepted rows",
         "evidence": "Evidence/artifacts/m8c-capability-ledger.json measure M-01/M-07"},
        {"statement": "full-plus-replaced is 15.4%", "denominator": "18/117 (mixed universe)",
         "supersededBy": "18/112 = 16.07% over accepted rows",
         "evidence": "Evidence/artifacts/m8c-capability-ledger.json measure M-02/M-06"},
        {"statement": "legacy attribution is 650/650", "denominator": "measured files",
         "supersededBy": ("attribution reaches all 651 raw code files only because directory-scoped "
                          "corpora recurse, and one corpus includes a test file. Completeness is "
                          "trivial, not point-level."),
         "evidence": "Evidence/artifacts/m8c-file-inventory.json mapping"},
        {"statement": "16 shared-corpus rows", "denominator": "rows whose corpus is shared",
         "supersededBy": ("19 rows share a corpus: grouping by identical declared corpus gave 18, "
                          "grouping by identical STORED DISTRIBUTION exposed FP-F09 as a 19th"),
         "evidence": "Evidence/artifacts/m8c-corpus-scoping.json (row FP-F09)"},
        {"statement": "the integrity verifier passes 61/61, so the register is sound",
         "denominator": "package checks",
         "supersededBy": ("package checks passed while the register still measured 19 capabilities "
                          "over shared directories"),
         "evidence": "Evidence/logs/m8c-baseline/EXITCODES.txt"},
    ]

    delta = {
        "artifact": "m8c-register-evidence-delta",
        "mandate": "M8C section 8",
        "generatedBy": "developer-review/tools/m8c-register-delta.py",
        "policy": ("Immutable inputs (feature-parity.json, capability-subfeatures.json, "
                   "DISCREPANCY-LOG.md rows, FEATURE-PARITY-MATRIX.md) are NOT rewritten. Corrections "
                   "live in Evidence/artifacts/m8c-*.json and every superseded statement is listed here "
                   "with the artifact that supersedes it."),
        "findings": {
            "idsInLog": len(finding_ids),
            "duplicateIds": [k for k, v in collections.Counter(finding_ids).items() if v > 1],
            "mergedDuplicates": merged_rows,
            "distinctFindings": distinct_findings,
            "reconciliation": (f"{len(finding_ids)} log entries, {len(merged_rows)} of which are "
                               f"merge aliases -> {distinct_findings} distinct findings"),
            "citingEvidencePath": citing,
            "unresolvedCitedPaths": unresolved,
        },
        "rows": {
            "total": len(rows),
            "withoutEvidence": no_evidence,
            "classifications": dict(collections.Counter(r["classification"] for r in rows)),
        },
        "revisionDrift": drift,
        "overlay": {
            "rowsDeclared": len(ov_rows),
            "scopeCounts": dict(scope_counts),
            "artifactDistributionStaleDeclared": len(stale_artifact),
            "requiresCorrection": still_needs_correction,
            "notScoped": [k for k, v in ov_rows.items()
                          if v.get("corpusScope") == "directory-unreconstructed"],
        },
        "supersededStatements": superseded,
        "claimsDowngraded": [
            {"claim": "M8 claim 5 (helper-verb call sites are wired)",
             "from": "OVERSTATED", "to": "downgraded in M8B",
             "evidence": "M8B-FORENSIC-CLOSURE-REPORT.md"},
            {"claim": "DISC-056 is a product defect",
             "from": "product defect", "to": "test-double defect (InMemoryRepository ignores query options)",
             "evidence": "DISCREPANCY-LOG.md DISC-056 evidence citation"},
        ],
        "handPinnedValues": [
            {"location": "scripts/verify-v4-reconciliation.py:338",
             "value": 176,
             "status": "pinned expectation, not derived; left unchanged because changing an expected "
                       "value to make a check green is prohibited"},
        ],
    }

    if a.json:
        print(json.dumps(delta, indent=2))
        return 0

    print(f"findings: {len(finding_ids)} entries, {len(merged_rows)} merge aliases -> "
          f"{distinct_findings} distinct")
    print(f"  merged: {[(m['finding'], m['mergedInto']) for m in merged_rows]}")
    print(f"  citing evidence paths: {citing}; unresolved: {len(unresolved)}")
    print(f"rows: {len(rows)}; without evidence: {len(no_evidence)}")
    print(f"revision drift: register {rev_in_register} vs audited {AUDITED_REV} "
          f"(stale={drift['stale']})")
    print(f"overlay: {dict(scope_counts)}")
    print(f"  artifact staleness declared: {len(stale_artifact)}; "
          f"still directory-unreconstructed: {len(delta['overlay']['notScoped'])}")
    print(f"superseded published statements: {len(superseded)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
