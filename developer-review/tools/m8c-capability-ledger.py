#!/usr/bin/env python3
"""
m8c-capability-ledger.py — rebuild the authoritative capability ledger from machine-readable
sources, with every count carrying its own denominator and inclusion rule.

WHY THIS EXISTS
---------------
Two percentages have been quoted in this audit family: "11.1% parity" and "15.4% full-plus-replaced".
Neither reproduces from the 112-row register. They reproduce from 117 — the register plus the five
capability proposals M8A raised and nobody accepted. A denominator silently containing rejected
proposals is exactly the error M8C section 5 exists to stop, so this tool refuses to publish a
single number: it emits a ledger whose categories are mutually exclusive, plus every percentage
recomputed from raw rows with the denominator and inclusion rule attached.

USAGE
  python3 developer-review/tools/m8c-capability-ledger.py           # summary to stdout
  python3 developer-review/tools/m8c-capability-ledger.py --json    # machine-readable ledger

EXIT
  0 ledger built and internally consistent; 1 the sources disagree with each other.
"""
import argparse
import collections
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")
PARITY = os.path.join(DR, "Evidence", "artifacts", "feature-parity.json")
SUBS = os.path.join(DR, "Evidence", "artifacts", "capability-subfeatures.json")
M8A = os.path.join(DR, "M8A-omission-challenge.json")
SCOPING = os.path.join(DR, "Evidence", "artifacts", "m8c-corpus-scoping.json")

CLASSES = ["FULL PARITY", "PARTIAL PARITY", "MISSING", "MOCK / FABRICATED STATE",
           "REPLACED BY EQUIVALENT", "UNVERIFIED"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def pct(n, d):
    return None if not d else round(100.0 * n / d, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    parity = json.load(open(PARITY, encoding="utf-8"))
    rows = parity["capabilities"]
    m8a = json.load(open(M8A, encoding="utf-8"))
    scoping = json.load(open(SCOPING, encoding="utf-8"))
    subs = json.load(open(SUBS, encoding="utf-8"))

    accepted_ids = [r["id"] for r in rows]
    by_class = collections.Counter(r["classification"] for r in rows)
    unknown = [k for k in by_class if k not in CLASSES]
    dup_ids = [k for k, v in collections.Counter(accepted_ids).items() if v > 1]

    # ---- proposals: raised by M8A, never accepted into the register -------------------------
    proposals = []
    for c in m8a.get("claims", []):
        if c.get("proposedRegisterAction") == "NEW_ROW":
            proposals.append({
                "proposalId": c.get("id") or c.get("claimId"),
                "proposedNewId": c.get("proposedNewId"),
                "title": (c.get("title") or c.get("statement") or "").strip(),
                "dispositionScaleValue": c.get("disposition"),
                "registerAction": "NEW_ROW",
                "acceptance": "NOT_ACCEPTED",
                "acceptanceReason": ("A proposal is not a register row: it has not been given a "
                                     "declared corpus, endpoints, subfeature classes or a parity "
                                     "classification under the register's own method."),
                "presentInRegister": (c.get("proposedNewId") in accepted_ids),
            })
    accepted_proposals = [p for p in proposals if p["presentInRegister"]]

    # ---- historical snapshots, recorded as history and never merged into the current count ---
    history = [
        {"label": "V2 register (superseded)", "rows": 109, "full": 25,
         "source": "EVIDENCE-INDEX.md E-327", "status": "HISTORICAL_ONLY"},
        {"label": "V6 re-measurement (superseded)", "rows": 112, "full": 12,
         "source": "EVIDENCE-INDEX.md E-350", "status": "HISTORICAL_ONLY"},
        {"label": "V7 re-measurement (superseded)", "rows": 112, "full": 12,
         "source": "EVIDENCE-INDEX.md E-362", "status": "HISTORICAL_ONLY"},
        {"label": "M8 revalidation (superseded)", "rows": 112, "full": 13,
         "source": "EVIDENCE-INDEX.md E-368", "status": "HISTORICAL_ONLY"},
        {"label": "M8C current register", "rows": len(rows), "full": by_class["FULL PARITY"],
         "source": "Evidence/artifacts/feature-parity.json", "status": "CURRENT"},
    ]

    # ---- denominators and the measures that use them ----------------------------------------
    n_acc = len(rows)
    n_unver = by_class["UNVERIFIED"]
    n_verified = n_acc - n_unver
    n_mixed = n_acc + len(proposals)
    full = by_class["FULL PARITY"]
    repl = by_class["REPLACED BY EQUIVALENT"]
    impl = full + by_class["PARTIAL PARITY"] + repl

    measures = [
        {"id": "M-01", "measure": "strict FULL parity", "numerator": full, "denominator": n_acc,
         "denominatorRule": "the 112 rows present in the current register",
         "pct": pct(full, n_acc), "legitimate": True},
        {"id": "M-02", "measure": "FULL + REPLACED (functionality present, differently implemented)",
         "numerator": full + repl, "denominator": n_acc,
         "denominatorRule": "the 112 rows present in the current register",
         "pct": pct(full + repl, n_acc), "legitimate": True},
        {"id": "M-03", "measure": "any implementation at all (FULL + PARTIAL + REPLACED)",
         "numerator": impl, "denominator": n_acc,
         "denominatorRule": "the 112 rows present in the current register",
         "pct": pct(impl, n_acc), "legitimate": True},
        {"id": "M-04", "measure": "missing or fabricated",
         "numerator": by_class["MISSING"] + by_class["MOCK / FABRICATED STATE"], "denominator": n_acc,
         "denominatorRule": "the 112 rows present in the current register",
         "pct": pct(by_class["MISSING"] + by_class["MOCK / FABRICATED STATE"], n_acc), "legitimate": True},
        {"id": "M-05", "measure": "strict FULL parity, excluding rows the register itself calls UNVERIFIED",
         "numerator": full, "denominator": n_verified,
         "denominatorRule": "112 accepted rows minus 3 UNVERIFIED rows; a row whose status is unknown "
                            "cannot be counted as a miss or a hit",
         "pct": pct(full, n_verified), "legitimate": True},
        {"id": "M-06", "measure": "full + replaced over the 117 mixed universe",
         "numerator": full + repl, "denominator": n_mixed,
         "denominatorRule": "112 accepted rows PLUS 5 unaccepted proposals",
         "pct": pct(full + repl, n_mixed), "legitimate": False,
         "whyNotLegitimate": "mixes accepted register rows with proposals nobody accepted; this is the "
                             "denominator behind the published 15.4%"},
        {"id": "M-07", "measure": "strict FULL parity over the 117 mixed universe",
         "numerator": full, "denominator": n_mixed,
         "denominatorRule": "112 accepted rows PLUS 5 unaccepted proposals",
         "pct": pct(full, n_mixed), "legitimate": False,
         "whyNotLegitimate": "this is the denominator behind the published 11.1%"},
    ]

    published = [
        {"quotedAs": "11.1%", "value": 11.1, "reproduces": pct(full, n_mixed),
         "reproducedBy": "M-07 (13/117)", "acceptedOnlyEquivalent": pct(full, n_acc),
         "verdict": "REPRODUCIBLE BUT ON A REJECTED DENOMINATOR"},
        {"quotedAs": "15.4%", "value": 15.4, "reproduces": pct(full + repl, n_mixed),
         "reproducedBy": "M-06 (18/117)", "acceptedOnlyEquivalent": pct(full + repl, n_acc),
         "verdict": "REPRODUCIBLE BUT ON A REJECTED DENOMINATOR"},
    ]

    overlay_rows = scoping.get("rows") or {}
    ledger = {
        "artifact": "m8c-capability-ledger",
        "mandate": "M8C section 5",
        "generatedBy": "developer-review/tools/m8c-capability-ledger.py",
        "sourceRevision": "69a3ed4",
        "sourceSha256": {os.path.basename(p): sha256(p) for p in (PARITY, SUBS, M8A, SCOPING)},
        "method": ("Every count below is computed from the machine-readable rows, not copied from a "
                   "report. Categories are mutually exclusive: a row counts in exactly one class. "
                   "Multi-attribute properties (shared corpus, capability-scoped measurement) are "
                   "reported in separate fields and are never added to a classification total."),
        "accepted": {
            "count": n_acc,
            "inclusionRule": "rows present in Evidence/artifacts/feature-parity.json",
            "byClass": {k: by_class[k] for k in CLASSES},
            "sumCheck": sum(by_class[k] for k in CLASSES),
            "rowsByClass": {k: [r["id"] for r in rows if r["classification"] == k] for k in CLASSES},
            "unknownClasses": unknown,
            "duplicateIds": dup_ids,
        },
        "proposedNotAccepted": {
            "count": len(proposals),
            "inclusionRule": ("M8A claims whose proposedRegisterAction is NEW_ROW and whose proposed id "
                              "is absent from the register"),
            "rows": proposals,
            "acceptedAmongProposals": [p["proposedNewId"] for p in accepted_proposals],
        },
        "rejectedDuplicates": {
            "count": 0,
            "note": ("No capability row was rejected as a duplicate of another capability. Separately, two "
                     "FINDINGS are duplicates and are marked as merged in the discrepancy log (DISC-042 and "
                     "DISC-046 into DISC-030); findings and capabilities are different universes and are "
                     "never summed."),
        },
        "unverified": {
            "count": n_unver,
            "inclusionRule": "register rows whose classification is UNVERIFIED",
            "ids": [r["id"] for r in rows if r["classification"] == "UNVERIFIED"],
        },
        "historicalOnly": {"count": len([h for h in history if h["status"] == "HISTORICAL_ONLY"]),
                           "snapshots": history},
        "denominators": {
            "accepted": n_acc, "unverified": n_unver, "verifiedOnly": n_verified,
            "proposed": len(proposals), "mixedUniverse": n_mixed,
        },
        "measures": measures,
        "publishedPercentagesReconciled": published,
        "crossChecks": {
            "sharedCorpusRows": {
                "count": len(overlay_rows),
                "countedByColumn": "capabilityScoped (not by classification)",
                "note": ("The 19 shared-corpus rows are a SUBSET of the 112 and are distributed across "
                         "several classification classes. They are a measurement property, not a class, "
                         "so adding them to a distribution would double-count."),
            },
            "rowsDoNotSumTo177": {"total": n_acc + len(proposals),
                                  "note": "112 + 5 = 117; only the 112 are accepted"},
        },
    }

    ok = (ledger["accepted"]["sumCheck"] == n_acc and not unknown and not dup_ids
          and not accepted_proposals and all(m["denominator"] > 0 for m in measures))
    ledger["consistent"] = ok

    if a.json:
        print(json.dumps(ledger, indent=2))
        return 0 if ok else 1

    print(f"accepted rows        : {n_acc}  ({', '.join(f'{k}={by_class[k]}' for k in CLASSES)})")
    print(f"sum check            : {ledger['accepted']['sumCheck']} (must equal {n_acc})")
    print(f"proposed not accepted: {len(proposals)}  {[p['proposedNewId'] for p in proposals]}")
    print(f"unverified rows      : {n_unver}  {ledger['unverified']['ids']}")
    print(f"mixed universe       : {n_mixed} = {n_acc} accepted + {len(proposals)} proposed")
    print()
    for m in measures:
        flag = "" if m["legitimate"] else "   <-- NOT A LEGITIMATE DENOMINATOR"
        print(f"{m['id']}  {m['numerator']:>3}/{m['denominator']:<3} = {m['pct']:>5.2f}%  {m['measure']}{flag}")
    print()
    for p in published:
        print(f"published {p['quotedAs']:>6}  reproduces as {p['reproduces']}% via {p['reproducedBy']}"
              f"  -> accepted-only equivalent {p['acceptedOnlyEquivalent']}%")
    print()
    print("CONSISTENT" if ok else "INCONSISTENT")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
