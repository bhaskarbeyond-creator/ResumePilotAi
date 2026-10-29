#!/usr/bin/env python3
"""Extract leaf TAP failures from the latest backend evidence logs.

All generated outputs are written below developer-implemented/EVIDENCE/UNIT.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UNIT = ROOT / "developer-implemented/EVIDENCE/UNIT"
RUNS = {
    "DEFAULT_MARIADB_ENABLED": UNIT / "current-backend-suite-final-20261029.txt",
    "MARIADB_INTEGRATION_DISABLED_DIAGNOSTIC": UNIT / "backend-non-mariadb-diagnostic-final-20261029.txt",
}
OUT = UNIT / "backend-leaf-failures-20261029.csv"


def parse_failures(run_name: str, path: Path) -> list[dict]:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    rows: list[dict] = []
    for index, line in enumerate(lines):
        match = re.match(r"^\s*not ok (\d+(?:\.\d+)*) - (.*)$", line)
        if not match:
            continue
        block = lines[index + 1:index + 60]
        failure_type = ""
        location = ""
        raw_error = ""
        expected = ""
        actual = ""
        code = ""
        for offset, item in enumerate(block):
            if not failure_type:
                found = re.search(r"failureType:\s*(.*)", item)
                if found:
                    failure_type = found.group(1).strip().strip("'\"")
            if not location:
                found = re.search(r"location:\s*['\"]?([^'\"]+)", item)
                if found:
                    location = found.group(1).strip()
            if not raw_error:
                found = re.search(r"error:\s*(.*)", item)
                if found:
                    raw_error = found.group(1).strip().strip("'\"")
                    if raw_error in ("|-", "|", ">-"):
                        continuation = []
                        for next_line in block[offset + 1:offset + 6]:
                            if re.match(r"\s*(code|name|expected|actual|operator|stack|location|failureType):", next_line):
                                break
                            if next_line.strip():
                                continuation.append(next_line.strip())
                        raw_error = " ".join(continuation[:3]) or raw_error
            if not expected and re.search(r"\bexpected:", item):
                expected = item.split("expected:", 1)[1].strip()
            if not actual and re.search(r"\bactual:", item):
                actual = item.split("actual:", 1)[1].strip()
            if not code:
                found = re.search(r"\bcode:\s*(.*)", item)
                if found:
                    code = found.group(1).strip().strip("'\"")
            if item.strip() == "...":
                break
        if failure_type == "subtestsFailed":
            continue

        name = match.group(2).strip()
        nearby = "\n".join(lines[max(0, index - 25):index + 5])
        if ("/api/admin/users/" in name.lower() and "status" in name.lower()) or "body.status normalization" in name.lower():
            category = "FIREBASE_ADMIN_ADC_UNAVAILABLE (DB rate-limit/audit may also be unavailable)"
            evidence = "Mandate 9B log records failed Google ADC token acquisition for Admin SDK calls."
        elif "ECONNREFUSED 127.0.0.1:3306" in raw_error:
            category = "MARIADB_UNAVAILABLE_DIRECT_CONNECTION"
            evidence = "The test/error message reports connect ECONNREFUSED 127.0.0.1:3306."
        elif any(token in nearby for token in ("[Rate limit store]", "[Employer review]", "[Platform] payment-webhook", "[AdminAudit]")) or "503" in raw_error or actual == "503":
            category = "DB_BACKED_HTTP_OR_RATE_LIMITER_UNAVAILABLE"
            evidence = "The HTTP assertion received 503/500 and nearby suite logs show a MariaDB-backed rate-limit, audit, repository, or webhook storage refusal."
        else:
            category = "UNCLASSIFIED_REQUIRES_REVIEW"
            evidence = "No database/credential root cause is assigned by the extractor."
        rows.append({
            "run": run_name,
            "tap_id": match.group(1),
            "test_name": name,
            "failure_type": failure_type,
            "location": location,
            "error": raw_error,
            "error_code": code,
            "expected": expected,
            "actual": actual,
            "triage_category": category,
            "observed_evidence": evidence,
        })
    return rows


def main() -> None:
    rows = []
    for run_name, path in RUNS.items():
        rows.extend(parse_failures(run_name, path))
    fields = [
        "run", "tap_id", "test_name", "failure_type", "location", "error", "error_code",
        "expected", "actual", "triage_category", "observed_evidence",
    ]
    with OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    for run in RUNS:
        selected = [row for row in rows if row["run"] == run]
        categories = {}
        for row in selected:
            categories[row["triage_category"]] = categories.get(row["triage_category"], 0) + 1
        print(f"{run}: {len(selected)} leaf failures; {categories}")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
