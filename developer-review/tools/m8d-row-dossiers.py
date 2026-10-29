#!/usr/bin/env python3
"""
m8d-row-dossiers.py — per-row source dossier for the 41 directory-scoped capability rows.

WHY THIS EXISTS
---------------
A directory-scoped row cannot be corrected by guessing which file "looks like" the capability.
Each dossier shows, for one row, every candidate file under its declared directories with the three
facts a decision needs: size, what the file imports (so a wrapper or a delegated implementation is
visible), and where the capability's own vocabulary actually occurs. The record is then written by
hand into m8d-row-reconstruction.json; this tool only assembles evidence and never decides.

USAGE
  python3 developer-review/tools/m8d-row-dossiers.py                # all 41 rows, summary
  python3 developer-review/tools/m8d-row-dossiers.py --row FP-A01  # one dossier in full
  python3 developer-review/tools/m8d-row-dossiers.py --json         # machine-readable dossiers
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")
REV = "69a3ed4"
SCOPING = os.path.join(DR, "Evidence", "artifacts", "m8c-corpus-scoping.json")
PARITY = os.path.join(DR, "Evidence", "artifacts", "feature-parity.json")

STOP = set("""the a an and or of for to in on with by from as at is are be it its this that these
capability capabilities platform admin public user users page pages view views screen screens
management manager module modules system ui ux flow flows feature features support list lists""".split())


def tokens(text):
    return [w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if w not in STOP and len(w) > 2]


def code_files(rev, tree):
    out = subprocess.run(["git", "ls-tree", "-r", "--name-only", rev, "--", tree],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines()
            if os.path.splitext(p)[1] in (".js", ".jsx", ".ts", ".tsx")
            and not re.search(r"\.(test|spec)\.", p)]


LEGACY = None
MODERN = None


def imports_of(path):
    text = open(os.path.join(ROOT, path), encoding="utf-8", errors="replace").read()
    imps = re.findall(r"^\s*import\s+(?:[^'\"]*?from\s+)?['\"]([^'\"]+)['\"]", text, re.M)
    return imps, text


def dossier(row, overlay_row):
    paths = row.get("legacyPaths") or []
    toks = tokens(row.get("capability"))
    files = []
    for base in paths:
        if os.path.isdir(os.path.join(ROOT, base)):
            for f in LEGACY:
                if f.startswith(base.rstrip("/") + "/"):
                    files.append(f)
        elif os.path.isfile(os.path.join(ROOT, base)):
            files.append(base)
    files = sorted(set(files))
    out = []
    for f in files:
        imps, text = imports_of(f)
        lines = len(text.splitlines())
        low = text.lower()
        hits = {t: low.count(t) for t in toks}
        score = sum(hits.values())
        out.append({
            "file": f,
            "lines": lines,
            "capabilityTermHits": score,
            "topTerms": sorted(((v, k) for k, v in hits.items() if v), reverse=True)[:6],
            "imports": imps[:12],
            "importCount": len(imps),
            "isThin": lines <= 60,
            "importsSiblings": [i for i in imps if i.startswith(".")][:8],
        })
    out.sort(key=lambda r: (-r["capabilityTermHits"], -r["lines"]))
    return {
        "row": row["id"],
        "title": row.get("capability"),
        "classification": row.get("classification"),
        "declaredPaths": paths,
        "published": {"files": row.get("legacyFiles"), "lines": row.get("legacyLines")},
        "modernPaths": row.get("modernPaths"),
        "modernFiles": row.get("modernFiles"),
        "endpoints": row.get("endpoints"),
        "backend": row.get("backend"),
        "evidence": row.get("evidence"),
        "overlayDisposition": (overlay_row or {}).get("corpusScope"),
        "fileCount": len(files),
        "totalLines": sum(x["lines"] for x in out),
        "candidates": out,
    }


def main():
    global LEGACY, MODERN
    ap = argparse.ArgumentParser()
    ap.add_argument("--row")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--top", type=int, default=8)
    a = ap.parse_args()

    LEGACY = code_files(REV, "src")
    MODERN = code_files(REV, "frontend/src")
    parity = json.load(open(PARITY, encoding="utf-8"))
    overlay = json.load(open(SCOPING, encoding="utf-8"))["rows"]
    targets = [r for r in parity["capabilities"]
               if (overlay.get(r["id"]) or {}).get("corpusScope") == "directory-unreconstructed"]

    if a.row:
        r = next(x for x in targets if x["id"] == a.row)
        d = dossier(r, overlay.get(a.row))
        print(f"=== {d['row']} — {d['title']}")
        print(f"classification: {d['classification']} | published {d['published']}")
        print(f"declared: {d['declaredPaths']}")
        print(f"backend: {d['backend']} | endpoints: {str(d['endpoints'])[:160]}")
        print(f"modern: {d['modernPaths']} ({d['modernFiles']} files)")
        print(f"register evidence: {str(d['evidence'])[:300]}")
        print(f"candidates: {d['fileCount']} files / {d['totalLines']} lines\n")
        for c in d["candidates"]:
            thin = " THIN" if c["isThin"] else ""
            print(f"  {c['lines']:>5}L hits={c['capabilityTermHits']:>3}{thin}  {c['file']}")
            if c["topTerms"]:
                print(f"        terms: {', '.join(f'{k}×{v}' for v, k in c['topTerms'])}")
            if c["importsSiblings"]:
                print(f"        imports: {', '.join(c['importsSiblings'][:5])}")
        return 0

    docs = [dossier(r, overlay.get(r["id"])) for r in targets]
    if a.json:
        print(json.dumps({"revision": REV, "rows": docs}, indent=2))
        return 0
    print(f"{len(docs)} rows; declaring directories with {sum(d['fileCount'] for d in docs):,} "
          f"file references and {sum(d['totalLines'] for d in docs):,} lines\n")
    for d in docs:
        best = d["candidates"][0] if d["candidates"] else None
        print(f"{d['row']}  {d['fileCount']:>3}f {d['totalLines']:>6}L  "
              f"pub {str(d['published']['files']):>3} {str(d['published']['lines']):>6}L  "
              f"top: {best['file'].split('/')[-1] if best else '-'} "
              f"({best['lines'] if best else 0}L, hits {best['capabilityTermHits'] if best else 0})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
