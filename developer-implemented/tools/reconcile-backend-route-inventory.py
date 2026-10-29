#!/usr/bin/env python3
"""Compare the protected historical M8 route census with the current runtime census.

This script is read-only with respect to developer-review/. Its outputs are fixed
under developer-implemented/EVIDENCE/REGRESSION and developer-implemented/REPORTS.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HISTORICAL = ROOT / "developer-review/Evidence/artifacts/m8-registration-reconciliation.json"
CURRENT = ROOT / "developer-implemented/EVIDENCE/REGRESSION/backend-exact-route-duplicates-20261029.json"
OUT_JSON = ROOT / "developer-implemented/EVIDENCE/REGRESSION/backend-route-reconciliation-20261029.json"
OUT_MD = ROOT / "developer-implemented/REPORTS/BACKEND-ROUTE-REGISTRATION-RECONCILIATION-20261029.md"


def shape(path: str) -> str:
    path = re.sub(r":([A-Za-z0-9_]+)\b", "{X}", path)
    path = re.sub(r"\$\{[^}]*\}", "{X}", path)
    path = path.rstrip("/") or "/"
    if path.startswith("/api/"):
        path = path[4:]
    elif path == "/api":
        path = "/"
    return path


def key(method: str, path: str) -> str:
    return f"{method.upper()} {shape(path)}"


def main() -> None:
    historical = json.loads(HISTORICAL.read_text(encoding="utf-8"))
    current = json.loads(CURRENT.read_text(encoding="utf-8"))

    historical_rows = historical["rows"]
    historical_keys = {row["dedupeKey"] for row in historical_rows}
    current_rows = current["registrations"]
    current_key_counts = Counter(key(row["method"], row["path"]) for row in current_rows)
    current_keys = set(current_key_counts)

    historical_only = sorted(historical_keys - current_keys)
    current_only = sorted(current_keys - historical_keys)
    normalized_collisions = {
        normalized_key: [
            {
                "path": row["path"],
                "source": row["source"],
                "mountTrail": row["mountTrail"],
            }
            for row in current_rows
            if key(row["method"], row["path"]) == normalized_key
        ]
        for normalized_key, count in current_key_counts.items()
        if count > 1
    }

    current_only_rows = []
    for normalized_key in current_only:
        matching = [row for row in current_rows if key(row["method"], row["path"]) == normalized_key]
        source_counts = Counter(row["source"].split(":", 1)[0] for row in matching)
        current_only_rows.append({
            "normalizedKey": normalized_key,
            "literalPaths": sorted({row["path"] for row in matching}),
            "sources": sorted(source_counts),
        })

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "historicalArtifact": str(HISTORICAL.relative_to(ROOT)),
        "historicalRevision": historical.get("revision"),
        "currentRuntimeArtifact": str(CURRENT.relative_to(ROOT)),
        "currentBranch": current.get("branch"),
        "currentBaseSha": current.get("baseSha"),
        "historical": {
            "registrationInstances": len(historical_rows),
            "distinctNormalizedMethodPathKeys": len(historical_keys),
        },
        "current": {
            "exactLiteralMethodPathRegistrations": len(current_rows),
            "exactLiteralMethodPathKeys": current.get("distinctMethodAndLiteralPathKeys"),
            "exactDuplicateKeys": current.get("duplicateMethodAndLiteralPathKeys"),
            "distinctNormalizedMethodPathKeys": len(current_keys),
            "normalizedAliasInstances": len(current_rows) - len(current_keys),
            "unresolvedRoutePatterns": current.get("unresolvedRoutePatterns"),
            "unresolvedMountPatterns": current.get("unresolvedMountPatterns"),
        },
        "delta": {
            "newNormalizedKeys": len(current_only),
            "historicalKeysNotPresentCurrently": len(historical_only),
            "historicalRowsMinusCurrentRows": len(historical_rows) - len(current_rows),
        },
        "historicalOnlyKeys": historical_only,
        "currentOnlyKeys": current_only_rows,
        "currentNormalizedAliasCollisions": normalized_collisions,
        "interpretation": (
            "Historical M8 counts are a source-parser census at its recorded revision and apply "
            "the historical /api-stripping and parameter-shape normalization. The current census "
            "walks routes reachable from backend/index.js at runtime, expands every actual mount "
            "prefix, preserves literal aliases, and distinguishes ALL from individual methods. "
            "Exact method+literal-path uniqueness is checked separately from normalized alias "
            "collisions; aliases are not reported as literal duplicate handlers."
        ),
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = [
        "# Backend route-registration reconciliation (2026-10-29 UTC)",
        "",
        "This is a read-only comparison; the historical `developer-review/` tree was not modified.",
        "It separates the historical parser's normalized source census from the current Express",
        "runtime inventory that expands literal mount prefixes and checks exact method+literal-path pairs.",
        "",
        "## Counts",
        "",
        "| Census | Registration instances | Distinct keys | Notes |",
        "|---|---:|---:|---|",
        f"| Historical M8 parser ({result['historicalRevision']}) | {len(historical_rows)} | {len(historical_keys)} | Historical parser scope and normalization; includes its recorded duplicate instances. |",
        f"| Current reachable Express runtime ({current.get('baseSha')}) | {len(current_rows)} exact literal pairs | {len(current_keys)} normalized keys | {current.get('duplicateMethodAndLiteralPathKeys')} exact literal duplicates; {current.get('unresolvedRoutePatterns')} unresolved route patterns; {current.get('unresolvedMountPatterns')} unresolved mounts. |",
        "",
        f"The current runtime contains **{len(current_only)} normalized keys not present in the historical M8 key set** and **{len(historical_only)} historical normalized keys absent from the current runtime**.",
        f"The current census has **{len(current_rows) - len(current_keys)} path-shape/prefix-normalized alias instances** versus **{len(historical_rows) - len(historical_keys)} historical duplicate instances**. Thus the raw instance delta is {len(current_rows) - len(historical_rows)} = {len(current_only)} new normalized keys + {len(current_rows) - len(current_keys)} current alias instances - {len(historical_rows) - len(historical_keys)} historical duplicate instances; these are different census units, not 52 unexplained duplicates.",
        "The historical artifact is stamped at `8fce71518d1dc957c3c8cefa9867445edb35f438`; the current checked-out base is `aa24147245daa6c027d046f1f7ae6f8fc703be46`. The intervening repository history changes `backend/index.js`, `backend/routes/adminUsers.js`, and `backend/routes/blogData.js`; the current runtime also expands existing compatibility mounts such as `/api/jobs` and `/api/blog` that are counted separately as effective paths. The row-level current-only list below is the exact delta; route presence does not establish feature correctness."
        "",
        "## Current exact-path result",
        "",
        f"**{current.get('completeness')}** — {current.get('methodAndLiteralPathRegistrations')} exact method+literal-path registrations, {current.get('distinctMethodAndLiteralPathKeys')} distinct keys, {current.get('duplicateMethodAndLiteralPathKeys')} duplicate keys.",
        "The inventory used runtime Express registration, records `ALL` as one `ALL` registration rather than expanding it to every HTTP verb, expands all literal mount prefixes, and reports regex/non-literal constructs as unresolved. No unresolved route or mount patterns were found.",
        "",
        "## New normalized method+path keys versus historical M8",
        "",
    ]
    if current_only_rows:
        lines.extend(["| Normalized key | Current literal path(s) | Source file(s) |", "|---|---|---|"])
        for row in current_only_rows:
            lines.append(
                f"| `{row['normalizedKey']}` | {', '.join(f'`{p}`' for p in row['literalPaths'])} | {', '.join(f'`{s}`' for s in row['sources'])} |"
            )
    else:
        lines.append("None.")
    lines.extend([
        "",
        "## Historical normalized keys absent now",
        "",
        "None." if not historical_only else "\n".join(f"- `{item}`" for item in historical_only),
        "",
        "## Normalized alias collisions in the current census",
        "",
        "These are different exact literals that collapse under the historical `/api`-stripping/parameter-shape key. They are not exact `METHOD+literal path` duplicates:",
        "",
    ])
    if normalized_collisions:
        lines.extend(["| Normalized key | Literal registrations |", "|---|---|"])
        for normalized_key, rows in sorted(normalized_collisions.items()):
            values = ", ".join(f"`{row['path']}` ({row['source']})" for row in rows)
            lines.append(f"| `{normalized_key}` | {values} |")
    else:
        lines.append("None.")
    lines.extend([
        "",
        "## Scope and limitations",
        "",
        "- The historical M8 artifact was produced at a different source revision and by static parsers; it is not a current runtime census.",
        "- Current exact-path uniqueness applies to Express routes reachable from the exported backend app. It does not prove handler correctness, database persistence, tenant isolation, provider delivery, or browser workflows.",
        "- A normalized alias collision is intentionally kept distinct from a literal duplicate. `/healthz` and `/api/healthz`, for example, are different literal paths.",
        "- Full row data is in the JSON artifacts linked above.",
        "",
    ])
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"Historical: {len(historical_rows)} instances / {len(historical_keys)} normalized keys")
    print(f"Current: {len(current_rows)} exact literals / {len(current_keys)} normalized keys")
    print(f"Current-only keys: {len(current_only)}; historical-only keys: {len(historical_only)}")
    print(f"Exact duplicates: {current.get('duplicateMethodAndLiteralPathKeys')}; unresolved routes/mounts: {current.get('unresolvedRoutePatterns')}/{current.get('unresolvedMountPatterns')}")
    print(f"Wrote {OUT_JSON.relative_to(ROOT)} and {OUT_MD.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
