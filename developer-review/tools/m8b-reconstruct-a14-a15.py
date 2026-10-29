#!/usr/bin/env python3
"""
m8b-reconstruct-a14-a15.py — M8B P0 independent reconstruction of FP-A14 and FP-A15.

WHY THIS EXISTS
---------------
M8A found that CAPABILITY-SUBFEATURE-REGISTER.md gives FP-A14 and FP-A15 subfeature
tables that are numerically identical (14/10/28/100/18/1/10/5/87) and both report
"legacy 35 files / 0 modern". That alone does not prove an error: two capabilities
could legitimately share a source directory. This tool establishes what was ACTUALLY
MEASURED and rebuilds both rows from capability-scoped evidence.

It is a deliberate SECOND IMPLEMENTATION. The published numbers come from
tools/capability-subfeature-audit.cjs (JavaScript, regex over a directory corpus).
This tool is Python, reconstructs capability scope from JSX render-block boundaries,
and is used to check that implementation rather than to reproduce it.

SCOPE DERIVATION (no hardcoded line numbers in the logic)
---------------------------------------------------------
subscriptionsSettings.jsx renders one panel per `this.state.adminTab === '<tab>'`
expression. A capability's UI scope is the brace-matched body of its panel, unioned
with the file-level lines that name capability-specific identifiers (state, handler,
API import) outside every panel. Backend scope is the route set recorded for the row.

USAGE
  python3 developer-review/tools/m8b-reconstruct-a14-a15.py            # summary
  python3 developer-review/tools/m8b-reconstruct-a14-a15.py --json     # machine-readable
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")
SRC = os.path.join(ROOT, "src")
FILE = os.path.join(SRC, "components/admin/settings/subscriptionsSettings.jsx")

# ---------------------------------------------------------------- class definitions
# Mirrors the 16 distinctive classes of the published register so the two
# implementations count the same *concept*. Kept as literal regex source so a reader
# can diff them against tools/capability-subfeature-audit.cjs:88-105.
CLASSES = [
    ("table", "tabular data", r"<table\b|<thead\b|role=[\"']grid[\"']"),
    ("search", "search", r"\b(?:searchQuery|setSearch|handleSearch|searchTerm|SearchInput|type=[\"']search[\"'])"),
    ("filter", "filtering", r"\b(?:filter|Filter|FILTERS)\b"),
    ("sort", "sorting", r"\b(?:sortBy|setSort|sortKey|SortSelect|sortOrder)\b"),
    ("pagination", "pagination / cursor / load-more",
     r"\b(?:cursor|loadMore|Load more|pageSize|hasNext|nextCursor|perPage|offset)\b"),
    ("modal", "dialog / drawer", r"\b(?:Modal|Dialog|dialog|drawer|Drawer)\b"),
    ("csv", "CSV export", r"\b(?:toCSV|exportCsv|text/csv|\.csv)\b"),
    ("json", "JSON export", r"\b(?:toJson|exportJson|application/json)\b"),
    ("document", "PDF / DOCX export",
     r"\b(?:export-docx|export-pdf|exportPdf|downloadResumePdf|downloadResumeDocx|jspdf|docx)\b"),
    ("print", "print", r"\b(?:print\(|onPrint|printLetter|printSurface|window\.print)\b"),
    ("upload", "file upload", r"type=[\"']file[\"']|new FormData\(|\.upload\b"),
    ("drag", "drag & drop", r"\bdraggable\b|\bonDragStart\b|\bonDrop\b|\bonDragOver\b"),
    ("chart", "chart / visualisation", r"<svg\b|<canvas\b|recharts|<Chart\b"),
    ("bulk", "bulk selection", r"\b(?:selectedIds|bulk|selectAll|Select All)\b"),
    ("undo", "undo / restore", r"\b(?:undo|Undo|restoreFavourite|handleRestore)\b"),
    ("authz", "client-side authorization gate",
     r"\b(?:hasPermission|requirePermission|isSuperAdmin|isAdmin|canManage)\b"),
]

# Capability-specific identifier affinities used to attribute file-level lines.
AFFINITY = {
    "FP-A14": re.compile(r"coupon|Coupon|couponCode|promo|Promo", re.I),
    "FP-A15": re.compile(r"refund|Refund|invoice|Invoice|creditNote|CreditNote|transaction|Transaction", re.I),
}

PANEL_RE = re.compile(r"this\.state\.adminTab\s*===\s*['\"]([a-zA-Z]+)['\"]\s*&&\s*\(")


def brace_span(text, open_idx):
    """Return (start,end) covering the balanced (...) region starting at open_idx '('."""
    depth = 0
    i = open_idx
    in_str = None
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
        elif ch in "\"'`":
            in_str = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return open_idx, i + 1
        i += 1
    return open_idx, len(text)


def load():
    text = open(FILE, encoding="utf-8").read()
    lines = text.splitlines(keepends=True)
    # char offsets per line start, for mapping spans back to line numbers
    offs, acc = [], 0
    for ln in lines:
        offs.append(acc)
        acc += len(ln)
    return text, lines, offs


def line_of(offs, idx):
    lo, hi = 0, len(offs) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if offs[mid] <= idx:
            lo = mid
        else:
            hi = mid - 1
    return lo + 1  # 1-based


def panels(text, offs):
    out = {}
    for m in PANEL_RE.finditer(text):
        tab = m.group(1)
        start = line_of(offs, m.start())
        _, end_idx = brace_span(text, m.start() + m.group(0).rindex("("))
        end = line_of(offs, min(end_idx, len(text) - 1))
        prev = out.get(tab)
        out[tab] = (start, end) if prev is None else (min(prev[0], start), max(prev[1], end))
    return out


def scope_lines(rid, panels_map, total_lines, tab_for_row):
    span = panels_map.get(tab_for_row)
    if not span:
        return None
    lo, hi = span
    inside = set(range(lo, hi + 1))
    # file-level attribution: lines outside EVERY panel that carry capability affinity
    all_panel_lines = set()
    for a, b in panels_map.values():
        all_panel_lines.update(range(a, b + 1))
    return inside, all_panel_lines, hi - lo + 1


def measure(lines, idxs):
    corpus = "\n".join(lines[i - 1] for i in sorted(idxs) if 1 <= i <= len(lines))
    counts = {}
    for key, label, pat in CLASSES:
        counts[key] = len(re.findall(pat, corpus))
    return counts, corpus


def main():
    text, lines, offs = load()
    pm = panels(text, offs)
    total = len(lines)

    # capability -> the panel that constitutes its user-visible surface
    TAB = {"FP-A14": "coupons", "FP-A15": "invoices"}

    # backend route sets as published on the row
    parity = json.load(open(os.path.join(DR, "Evidence/artifacts/feature-parity.json")))
    rows = {r["id"]: r for r in parity["capabilities"]}

    result = {"revision": parity.get("revision"), "file": os.path.relpath(FILE, ROOT),
              "fileLines": total, "panels": pm, "rows": {}}

    for rid in ("FP-A14", "FP-A15"):
        tab = TAB[rid]
        inside, all_panel_lines, span = scope_lines(rid, pm, total, tab)
        # file-level affinity lines outside every panel
        outside = [i for i in range(1, total + 1)
                   if i not in all_panel_lines and AFFINITY[rid].search(lines[i - 1])]
        scoped = inside | set(outside)
        counts, corpus = measure(lines, scoped)
        whole_counts, _ = measure(lines, set(range(1, total + 1)))

        published = rows[rid]
        result["rows"][rid] = {
            "panel": tab,
            "panelSpan": [pm[tab][0], pm[tab][1]] if tab in pm else None,
            "panelLines": span,
            "fileLevelAffinityLines": len(outside),
            "scopedLines": len(scoped),
            "scopedShareOfFile": round(len(scoped) / total * 100, 1),
            "scopedClasses": counts,
            "wholeFileClasses": whole_counts,
            "published": {
                "legacyPaths": published.get("legacyPaths"),
                "legacyFiles": published.get("legacyFiles"),
                "legacyLines": published.get("legacyLines"),
                "modernFiles": published.get("modernFiles"),
                "classification": published.get("classification"),
                "endpoints": published.get("endpoints"),
            },
            "backendRoutes": published.get("endpoints"),
        }

    if "--json" in sys.argv:
        json.dump(result, sys.stdout, indent=2)
        print()
        return

    print(f"file: {result['file']}  ({total} lines)")
    print(f"panels discovered: { {k: v for k, v in sorted(pm.items())} }\n")
    for rid, d in result["rows"].items():
        print(f"=== {rid}  panel='{d['panel']}'  span={d['panelSpan']}  ({d['panelLines']} lines, "
              f"{d['scopedShareOfFile']}% of file with {d['fileLevelAffinityLines']} affinity lines)")
        print(f"    published : paths={d['published']['legacyPaths']} files={d['published']['legacyFiles']} "
              f"lines={d['published']['legacyLines']} class={d['published']['classification']}")
        print(f"    scoped    : " + " ".join(f"{k}={v}" for k, v in d["scopedClasses"].items()))
        print(f"    wholefile : " + " ".join(f"{k}={v}" for k, v in d["wholeFileClasses"].items()))
        print()


if __name__ == "__main__":
    main()
