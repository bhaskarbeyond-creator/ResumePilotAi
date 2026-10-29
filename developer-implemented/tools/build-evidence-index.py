#!/usr/bin/env python3
"""Build a checksum-backed index of recovery evidence, without changing sources."""
from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "developer-implemented/EVIDENCE"
OUT = EVIDENCE / "evidence-index-20261029.md"

CURRENT = {
    "BASELINE/forensic-file-inventory.json": "Pre-implementation path/size/SHA-256 inventory for protected historical review files.",
    "REMOTE/push-verification-20261029.txt": "Post-push remote verification of task-branch SHA; main/dev SHA, open PR state, and branch-protection limitation.",
    "REGISTERS/recovery-register-validation-final-registers-20261029.txt": "Final validation of capability/finding counts, traceability IDs, evidence paths, and explicit FP-A12 mismatch handling.",
    "REGISTERS/recovery-cross-reference-audit-postpush-20261029.txt": "Final audit of the 10 authoritative reports after register/path updates; 95 repository-relative file references resolve.",
    "FORENSIC/check-review-integrity-release-20261029.txt": "Final protected-review integrity check after report/register updates; establishes 393/393 historical files unchanged.",
    "UNIT/current-backend-suite-final-20261029.txt": "Authoritative default full backend suite result; FAIL 1,290/57/0 of 1,347.",
    "UNIT/backend-non-mariadb-diagnostic-final-20261029.txt": "Separate MariaDB-disabled diagnostic; FAIL 1,292/25/30 of 1,347; skipped tests are not passes.",
    "UNIT/backend-leaf-failures-20261029.csv": "Leaf failure names, locations, expected/actual values and observed-cause classification from both current runs.",
    "UNIT/payment-tests-final-20261029.txt": "Local payment suite, 43/43; not live settlement/provider or MariaDB evidence.",
    "CONCURRENCY/enterprise-tests-final-20261029.txt": "Local enterprise suite, 187/187; not live MariaDB concurrency evidence.",
    "REGRESSION/disc055-and-webhook-replay-release-20261029.txt": "Focused DISC-055/payment-settings RBAC/audit/webhook tests, 16/16 with test dependencies.",
    "REGRESSION/platform-registration-notification-webhook-release-20261029.txt": "Fresh registration, retired notification and webhook regression subset, 7/7.",
    "REGRESSION/backend-exact-route-duplicates-20261029.json": "Whole-backend runtime literal route census and exact duplicate detector result.",
    "REGRESSION/backend-exact-route-duplicates-20261029.txt": "Human-readable summary of the whole-backend route detector run.",
    "REGRESSION/backend-route-reconciliation-20261029.json": "Machine-readable historical/current route registration comparison.",
    "REGRESSION/backend-route-reconciliation-run-20261029.txt": "Reconciliation generator run output.",
    "BUILD/final-recovery-build-20261029.txt": "Root production build and distribution sync result.",
    "STATIC/final-recovery-lint-20261029.txt": "Root lint result.",
    "SECURITY/final-postbuild-security-20261029.txt": "Post-build security/config verification; absent dist/.htaccess is explicitly skipped.",
    "BROWSER-E2E/mandate9-browser-mocked-20261029-retry.txt": "Mocked Mandate 9 browser UI run, 7/7; API traffic intercepted, not backend E2E.",
    "BROWSER-E2E/full-playwright-disposable-db-preflight-20261029.txt": "Configured full Playwright attempt; refused by the required disposable-DB preflight before test execution.",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_value(*args: str) -> str:
    try:
        return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return "unavailable"


def main() -> None:
    missing = [relative for relative in CURRENT if not (EVIDENCE / relative).is_file()]
    if missing:
        raise SystemExit("Missing authoritative evidence: " + ", ".join(missing))

    files = sorted(path for path in EVIDENCE.rglob("*") if path.is_file() and path != OUT)
    lines = [
        "# Recovery evidence index — 2026-10-29",
        "",
        f"- Repository branch: `{git_value('branch', '--show-current')}`",
        f"- Base/HEAD commit at index generation: `{git_value('rev-parse', 'HEAD')}`",
        "- This is a checksum inventory, not a certification that every result passed. Current reports explicitly distinguish pass, fail, skip, mocked and blocked evidence.",
        "- SHA-256 values cover the exact indexed files; regenerating logs or evidence changes those digests.",
        "",
        "## Current authoritative evidence",
        "",
        "| Evidence file | Current scope / result | Bytes | SHA-256 |",
        "|---|---|---:|---|",
    ]
    current_keys = set(CURRENT)
    for relative, description in CURRENT.items():
        path = EVIDENCE / relative
        lines.append(f"| `{path.relative_to(ROOT).as_posix()}` | {description} | {path.stat().st_size} | `{sha256(path)}` |")

    lines.extend([
        "",
        "## Preserved supplementary and historical evidence",
        "",
        "Files below are retained for traceability. Unless listed as current above, they are prior-run or supporting records and must not supersede the current verification report. Older files explicitly labelled `current` in their historical filenames predate this snapshot and are not necessarily current.",
        "",
        "| Evidence file | Status | Bytes | SHA-256 |",
        "|---|---|---:|---|",
    ])
    for path in files:
        relative = path.relative_to(EVIDENCE).as_posix()
        if relative in current_keys:
            continue
        label = "Supporting baseline/context" if relative.startswith(("BASELINE/", "FORENSIC/")) else "Historical/supporting; not authoritative for current release verdict"
        lines.append(f"| `{path.relative_to(ROOT).as_posix()}` | {label} | {path.stat().st_size} | `{sha256(path)}` |")

    lines.extend([
        "",
        "## Reports and registers",
        "",
        "- `developer-implemented/REPORTS/verification-reports/current.md` — current claim-by-claim verification result and verdict.",
        "- `developer-implemented/REPORTS/verification-reports/backend-failure-triage-20261029.md` — two distinct backend runs, failure categories and limits.",
        "- `developer-implemented/REPORTS/FORENSIC-DELTA.md` — source changes, historical/current route registration reconciliation, and evidentiary limits.",
        "- `developer-implemented/REPORTS/BACKEND-ROUTE-REGISTRATION-RECONCILIATION-20261029.md` — row-level normalized historical/current route comparison.",
        "- `developer-implemented/REPORTS/IMPLEMENTATION-LOG-20261029.md` — file-level implementation log and verification performed.",
        "- `developer-implemented/REGISTERS/README.md`, `capabilities.csv`, `findings.csv`, `traceability.csv` — 112 accepted capabilities, 5 proposals excluded from denominator, all 56 historical DISC IDs and provisional M9-P01; most capabilities remain not reassessed.",
        "- `developer-implemented/RELEASE-READINESS/FINAL-READINESS-CERTIFICATION-20261029.md` — final blocked readiness decision and unverified release gates.",
        "",
        "The index excludes itself to avoid a recursive checksum. Historical forensic source files remain under `developer-review/` and are covered by the protected inventory/integrity evidence; this index does not modify them.",
        "",
    ])
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Indexed {len(files)} evidence files: {len(CURRENT)} current authoritative; {len(files) - len(CURRENT)} supporting/historical.")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
