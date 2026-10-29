#!/usr/bin/env python3
"""Check file-like references in current authoritative recovery reports."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEV = ROOT / "developer-implemented"
DOCS = [
    DEV / "README.md",
    DEV / "REPORTS/verification-reports/current.md",
    DEV / "REPORTS/verification-reports/backend-failure-triage-20261029.md",
    DEV / "REPORTS/IMPLEMENTATION-LOG-20261029.md",
    DEV / "REPORTS/FORENSIC-DELTA.md",
    DEV / "REPORTS/BACKEND-ROUTE-REGISTRATION-RECONCILIATION-20261029.md",
    DEV / "RELEASE-READINESS/acceptance-matrix.md",
    DEV / "RELEASE-READINESS/open-blockers.md",
    DEV / "RELEASE-READINESS/FINAL-READINESS-CERTIFICATION-20261029.md",
    DEV / "REGISTERS/README.md",
]
PREFIXES = (
    "developer-implemented/", "developer-review/", "EVIDENCE/", "REGISTERS/",
    "BASELINE/", "REPORTS/", "RELEASE-READINESS/", "PATCH-RECORDS/", "TESTS/", "tools/",
    "backend/", "frontend/", "scripts/",
)
TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])(?:developer-implemented/|developer-review/|EVIDENCE/|REGISTERS/|BASELINE/|REPORTS/|RELEASE-READINESS/|PATCH-RECORDS/|TESTS/|tools/|backend/|frontend/|scripts/)[A-Za-z0-9_./-]+")


def resolve(token: str) -> Path:
    token = token.split("#", 1)[0].rstrip(".,;)")
    if token.startswith("developer-implemented/") or token.startswith("developer-review/"):
        return ROOT / token
    if token.startswith(PREFIXES[2:10]):
        return DEV / token
    return ROOT / token


def main() -> None:
    missing_docs = [str(path.relative_to(ROOT)) for path in DOCS if not path.is_file()]
    if missing_docs:
        raise SystemExit("Missing authoritative report(s): " + ", ".join(missing_docs))
    checked = set()
    errors: list[str] = []
    for doc in DOCS:
        content = doc.read_text(encoding="utf-8", errors="replace")
        for token in TOKEN_RE.findall(content):
            token = token.rstrip(".,;)")
            # Only file-like paths and explicit directory links are claims; a slash in prose
            # such as "backend/browser E2E" is not a repository path.
            if not Path(token.split("#", 1)[0]).suffix and not token.endswith("/"):
                continue
            path = resolve(token)
            checked.add((doc, token))
            if not path.exists():
                errors.append(f"{doc.relative_to(ROOT)} -> {token} (expected {path.relative_to(ROOT)})")
    print(f"authoritative_reports={len(DOCS)}; file_references_checked={len(checked)}")
    if errors:
        print(f"CROSS_REFERENCE_AUDIT=FAIL; missing={len(errors)}")
        for error in errors:
            print(f"MISSING: {error}")
        raise SystemExit(1)
    print("CROSS_REFERENCE_AUDIT=PASS; all detected repository-relative references resolve")


if __name__ == "__main__":
    main()
