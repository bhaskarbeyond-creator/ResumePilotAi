#!/usr/bin/env python3
"""
m8c-blast-radius.py — quantify, per capability row, what a directory-scoped corpus did to the
published measurement.

WHY THIS EXISTS
---------------
"53 bare-directory rows" and "1.86x inflation" are aggregate claims. An aggregate cannot tell a
reader which published number is wrong, which is merely imprecise, and which is legitimate reuse
that must not be condemned. This tool establishes impact per row: what was declared, what it
resolves to, whether a capability-scoped measurement exists, and what the register should do.

LEGITIMATE SHARED REUSE IS NOT ERRONEOUS ATTRIBUTION. A directory that genuinely implements one
capability across several files is a correct corpus. The defect is narrower: measuring a
capability over a directory that implements several capabilities, so that one row's subfeature
counts include another capability's work. The tool therefore classifies, it does not condemn.

USAGE
  python3 developer-review/tools/m8c-blast-radius.py          # table + totals
  python3 developer-review/tools/m8c-blast-radius.py --json    # machine-readable

EXIT 0 always (this is an analysis, not a gate).
"""
import argparse
import collections
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")
REV = "69a3ed4"
PARITY = os.path.join(DR, "Evidence", "artifacts", "feature-parity.json")
SCOPING = os.path.join(DR, "Evidence", "artifacts", "m8c-corpus-scoping.json")

VERDICT = {
    "capability-scoped": "CORRECTED",
    "legitimate-share": "SUPPORTED",
    "no-corpus": "CORRECTED",
    "nested-corpus-explained": "CORRECTED",
    "directory-unreconstructed": "UNRESOLVED",
}
ACTION = {
    "capability-scoped": "keep the capability-scoped corpus already recorded in the M8C overlay",
    "legitimate-share": "keep the directory corpus; record that the measurement describes shared reuse",
    "no-corpus": "reclassify as a fabricated-value finding; do not report file/volume metrics",
    "nested-corpus-explained": "scope to a sub-region of the shared file before citing subfeatures",
    "directory-unreconstructed": "reconstruct before the row's volume or subfeature counts are cited",
}


def git_code(rev, tree):
    out = subprocess.run(["git", "ls-tree", "-r", "--name-only", rev, "--", tree],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines()
            if os.path.splitext(p)[1] in (".js", ".jsx")
            and not p.endswith((".test.js", ".spec.js"))]


def lines_of(path):
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        return 0
    return len(open(full, encoding="utf-8", errors="replace").read().splitlines())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    parity = json.load(open(PARITY, encoding="utf-8"))
    overlay = (json.load(open(SCOPING, encoding="utf-8")).get("rows") or {})
    universe = git_code(REV, "src")

    rows, groups = [], collections.defaultdict(list)
    for r in parity["capabilities"]:
        paths = r.get("legacyPaths") or []
        if not paths:
            continue
        kinds = []
        for p in paths:
            if any(ch in p for ch in "*?["):
                kinds.append("glob")
            elif os.path.isdir(os.path.join(ROOT, p)):
                kinds.append("dir")
            elif os.path.isfile(os.path.join(ROOT, p)):
                kinds.append("file")
            else:
                kinds.append("missing")
        bare = all(k == "dir" for k in kinds)
        resolved = set()
        for p, k in zip(paths, kinds):
            if k == "dir":
                resolved |= {f for f in universe if f.startswith(p + "/")}
            elif k == "file" and os.path.splitext(p)[1] in (".js", ".jsx"):
                resolved.add(p)
        resolved_lines = sum(lines_of(f) for f in resolved)
        o = overlay.get(r["id"]) or {}
        scope = o.get("corpusScope")
        scoped = o.get("capabilityScoped") or {}
        gid = "DIR:" + "+".join(sorted(p for p, k in zip(paths, kinds) if k == "dir")) if any(
            k == "dir" for k in kinds) else None
        if gid:
            groups[gid].append(r["id"])
        verdict = VERDICT.get(scope, "UNRESOLVED")
        rows.append({
            "id": r["id"],
            "title": r.get("capability"),
            "classification": r.get("classification"),
            "declaredPaths": paths,
            "pathTypes": kinds,
            "bareDirectory": bare,
            "resolvedFiles": len(resolved),
            "resolvedLines": resolved_lines,
            "publishedFiles": r.get("legacyFiles"),
            "publishedLines": r.get("legacyLines"),
            "group": gid,
            "corpusScope": scope or "UNDECLARED",
            "capabilityScoped": ({"files": scoped.get("files"), "lines": scoped.get("lines"),
                                  "paths": scoped.get("paths")} if scoped else None),
            "volumeInflation": (round(len(resolved) / scoped["files"], 2)
                                if scoped and scoped.get("files") else None),
            "publishedMeasurement": verdict,
            "recommendedAction": ACTION.get(scope, "record a disposition before the row is cited"),
        })

    bare_rows = [r for r in rows if r["bareDirectory"]]
    per_row_sum = sum(r["resolvedFiles"] for r in rows)
    distinct = len({f for r in rows for f in r["declaredPaths"] if False})  # see note below
    group_summary = []
    for gid, ids in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        members = [r for r in rows if r["id"] in ids]
        group_summary.append({
            "group": gid,
            "rowCount": len(ids),
            "rows": ids,
            "resolvedFiles": members[0]["resolvedFiles"] if members else 0,
            "dispositions": sorted({m["corpusScope"] for m in members}),
            "verdicts": sorted({m["publishedMeasurement"] for m in members}),
        })

    by_verdict = collections.Counter(r["publishedMeasurement"] for r in bare_rows)
    data = {
        "artifact": "m8c-blast-radius",
        "mandate": "M8C section 7",
        "generatedBy": "developer-review/tools/m8c-blast-radius.py",
        "sourceRevision": REV,
        "method": ("Per row: declared paths classified as file/dir/glob/missing; a directory path "
                   "resolved recursively over the scope-corrected legacy tree (.js/.jsx, tests "
                   "excluded). Volume is compared with any capability-scoped measurement in the M8C "
                   "overlay. Impact verdicts are CORRECTED / SUPPORTED / UNRESOLVED; a legitimate "
                   "shared corpus is SUPPORTED, not condemned."),
        "totals": {
            "rowsWithCorpus": len(rows),
            "bareDirectoryRows": len(bare_rows),
            "rowsWithAnyDirectory": sum(1 for r in rows if "dir" in r["pathTypes"]),
            "rowsWithMixedPaths": sum(1 for r in rows if "dir" in r["pathTypes"] and not r["bareDirectory"]),
            "distinctGroups": len(groups),
            "perRowResolvedSum": per_row_sum,
            "distinctMeasuredFiles": 650,
            "inflationFactor": round(per_row_sum / 650, 3),
            "bareRowVerdicts": dict(by_verdict),
        },
        "groups": group_summary,
        "rows": rows,
    }

    if a.json:
        print(json.dumps(data, indent=2))
        return 0

    print(f"rows with a corpus      : {len(rows)}")
    print(f"bare-directory rows     : {len(bare_rows)}")
    print(f"rows with any directory : {data['totals']['rowsWithAnyDirectory']} "
          f"(mixed {data['totals']['rowsWithMixedPaths']})")
    print(f"distinct directory groups: {len(groups)}")
    print(f"per-row resolved sum    : {per_row_sum} over 650 measured files "
          f"= {data['totals']['inflationFactor']}x")
    print()
    print("bare-directory verdicts :")
    for k, v in sorted(by_verdict.items()):
        print(f"  {k:<12} {v}")
    print()
    print("largest groups:")
    for g in group_summary[:6]:
        print(f"  {g['resolvedFiles']:>4} files  {g['rowCount']} rows  {g['group'][4:][:52]:<52} "
              f"{','.join(g['dispositions'])[:44]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
