#!/usr/bin/env python3
"""Build recovery CSV registers from protected historical artifacts.

Reads developer-review/ only. All generated files are written under
 developer-implemented/REGISTERS/.
"""
from __future__ import annotations

import csv
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DR = ROOT / "developer-review"
OUT = ROOT / "developer-implemented/REGISTERS"

FEATURES = DR / "Evidence/artifacts/feature-parity.json"
SUBFEATURES = DR / "Evidence/artifacts/capability-subfeatures.json"
LEDGER = DR / "Evidence/artifacts/m8c-capability-ledger.json"
DISCREPANCIES = DR / "DISCREPANCY-LOG.md"
STATUS_INDEX = ROOT / "developer-implemented/REPORTS/discrepancy-status-index.md"
NEW_FINDINGS = ROOT / "developer-implemented/REPORTS/NEW-FINDINGS.md"


def git_head() -> str:
    try:
        return subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def dump_list(value) -> str:
    return json.dumps(value if value is not None else [], ensure_ascii=False, separators=(",", ":"))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({name: row.get(name, "") for name in fieldnames})


def finding_sections(markdown: str) -> dict[str, dict]:
    headings = list(re.finditer(r"^## \[DISC-(\d{3})\] (.+)$", markdown, re.MULTILINE))
    sections: dict[str, dict] = {}
    for index, match in enumerate(headings):
        start = match.start()
        end = headings[index + 1].start() if index + 1 < len(headings) else len(markdown)
        body = markdown[start:end]
        finding_id = f"DISC-{match.group(1)}"
        severity_match = re.search(r"\*\*Severity:\*\*\s*([^\n]+)|\|\s*\*\*Severity\*\*\s*\|\s*([^|]+)\|", body)
        severity = (severity_match.group(1) or severity_match.group(2)).strip() if severity_match else ""
        verification_match = re.search(r"\*\*Verification status:\*\*\s*([^\n]+)", body)
        closure_match = re.search(r"\|\s*\*\*Closure\*\*\s*\|\s*([^|]+)\|", body)
        refs = sorted(set(re.findall(r"\bFP-[A-G]\d{2}\b", body)))
        alias_match = re.search(r"MERGED INTO (DISC-\d{3})", match.group(2), re.IGNORECASE)
        sections[finding_id] = {
            "id": finding_id,
            "title": match.group(2).strip(),
            "historicalSeverity": severity,
            "historicalVerification": verification_match.group(1).strip() if verification_match else "",
            "historicalClosure": closure_match.group(1).strip() if closure_match else "",
            "capabilityRefs": refs,
            "aliasOf": alias_match.group(1).upper() if alias_match else "",
            "body": body,
        }
    return sections


def status_rows(markdown: str) -> dict[str, dict]:
    rows = {}
    for line in markdown.splitlines():
        match = re.match(r"\|\s*(DISC-\d{3})\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$", line)
        if match:
            rows[match.group(1)] = {"title": match.group(2).strip(), "status": match.group(3).strip()}
    return rows


def main() -> None:
    features = json.loads(FEATURES.read_text(encoding="utf-8"))
    subfeatures = json.loads(SUBFEATURES.read_text(encoding="utf-8"))
    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    discrepancy_text = DISCREPANCIES.read_text(encoding="utf-8")
    status_text = STATUS_INDEX.read_text(encoding="utf-8")
    new_findings_text = NEW_FINDINGS.read_text(encoding="utf-8")
    head = git_head()

    feature_by_id = {row["id"]: row for row in features["capabilities"]}
    subfeature_by_id = {row["id"]: row for row in subfeatures["capabilities"]}
    proposals = ledger["proposedNotAccepted"]["rows"]

    provisional_status: dict[str, tuple[str, str, str]] = {
        "FP-G09": (
            "TARGETED_IMPLEMENTATION_RECORDED; DB_AND_FULL_BROWSER_UNVERIFIED",
            "developer-implemented/EVIDENCE/blog-visibility-test.txt; developer-implemented/EVIDENCE/BROWSER-E2E/full-playwright-disposable-db-preflight-20261029.txt",
            "Mocked/route-level blog evidence is not real MariaDB or full application E2E.",
        ),
        "FP-A15": (
            "OPEN_PAYMENT_ADMIN_WORKFLOW; WEBHOOK_REPLAY_UNAVAILABLE; DB_AND_PROVIDER_UNVERIFIED",
            "developer-implemented/EVIDENCE/UNIT/payment-tests-final-20261029.txt; developer-implemented/EVIDENCE/REGRESSION/disc055-and-webhook-replay-release-20261029.txt",
            "No live settlement/provider retrieval or MariaDB persistence was exercised; replay intentionally refuses metadata-only records.",
        ),
        "FP-A12": (
            "HISTORICAL_FINDING_CROSSWALK_CONFLICT; CAPABILITY_NOT_REASSESSED",
            "developer-implemented/REGISTERS/findings.csv; developer-review/DISCREPANCY-LOG.md#disc-055",
            "DISC-055 cites FP-A12 for platform configuration, while the current 112-row parity register labels FP-A12 as Platform tenant registry; no remap is inferred.",
        ),
    }

    capability_rows: list[dict] = []
    accepted_ids = set()
    for row in features["capabilities"]:
        capability_id = row["id"]
        accepted_ids.add(capability_id)
        status, evidence, blocker = provisional_status.get(
            capability_id,
            (
                "NOT_REASSESSED_IN_CURRENT_RECOVERY; HISTORICAL_CLASSIFICATION_RETAINED",
                "",
                "Fresh source-to-runtime parity and relevant DB/browser/provider acceptance were not completed in this pass.",
            ),
        )
        sub = subfeature_by_id.get(capability_id, {})
        capability_rows.append({
            "record_scope": "ACCEPTED_CAPABILITY",
            "accepted_denominator": "true",
            "capability_id": capability_id,
            "domain": row.get("domain", ""),
            "capability": row.get("capability", ""),
            "historical_classification": row.get("classification", ""),
            "historical_backend": row.get("backend", ""),
            "legacy_files": row.get("legacyFiles", ""),
            "modern_files": row.get("modernFiles", ""),
            "legacy_paths": dump_list(row.get("legacyPaths")),
            "modern_paths": dump_list(row.get("modernPaths")),
            "endpoints": dump_list(row.get("endpoints")),
            "historical_invoke": row.get("invoke", ""),
            "historical_evidence": row.get("evidence", ""),
            "historical_audit_status": sub.get("auditStatus", ""),
            "historical_subfeatures_json": dump_list(sub.get("subfeatures")),
            "current_recovery_status": status,
            "current_evidence": evidence,
            "remaining_gate": blocker,
            "source_artifact": "developer-review/Evidence/artifacts/feature-parity.json; developer-review/Evidence/artifacts/capability-subfeatures.json",
            "source_revision": features.get("revision", ""),
            "current_base_sha": head,
        })

    proposal_ids = set()
    for proposal in proposals:
        proposed_id = proposal.get("proposedNewId", "")
        proposal_ids.add(proposed_id)
        capability_rows.append({
            "record_scope": "PROPOSAL_NOT_ACCEPTED",
            "accepted_denominator": "false",
            "capability_id": proposed_id,
            "domain": proposed_id.split("-")[1][0] if "-" in proposed_id else "",
            "capability": proposal.get("title", ""),
            "historical_classification": "",
            "historical_backend": "",
            "legacy_files": "",
            "modern_files": "",
            "legacy_paths": "[]",
            "modern_paths": "[]",
            "endpoints": "[]",
            "historical_invoke": "",
            "historical_evidence": "",
            "historical_audit_status": "",
            "historical_subfeatures_json": "[]",
            "current_recovery_status": "PROVISIONAL_NOT_ACCEPTED_NOT_IN_DENOMINATOR",
            "current_evidence": "developer-review/Evidence/artifacts/m8c-capability-ledger.json",
            "remaining_gate": proposal.get("acceptanceReason", "Not accepted under the historical register method."),
            "source_artifact": "developer-review/Evidence/artifacts/m8c-capability-ledger.json",
            "source_revision": ledger.get("sourceRevision", ""),
            "current_base_sha": head,
        })

    status_by_id = status_rows(status_text)
    sections = finding_sections(discrepancy_text)
    finding_rows: list[dict] = []
    for finding_id, section in sorted(sections.items(), key=lambda pair: int(pair[0].split("-")[1])):
        current = status_by_id.get(finding_id, {})
        status = "NOT_REASSESSED_IN_CURRENT_RECOVERY; prior status index retained separately"
        evidence = ""
        remaining = "This recovery did not independently re-test or close this finding; prior status is preserved in status_index_snapshot. Use the current readiness reports for release gates."
        if finding_id == "DISC-055":
            status = "IMPLEMENTED — LOCALLY VERIFIED (route registration, RBAC, audit ordering); DB/provider/full E2E remain separate blockers"
            evidence = (
                "developer-implemented/EVIDENCE/REGRESSION/disc055-and-webhook-replay-release-20261029.txt; "
                "developer-implemented/EVIDENCE/REGRESSION/backend-exact-route-duplicates-20261029.json; "
                "developer-implemented/EVIDENCE/REGRESSION/backend-route-reconciliation-20261029.json"
            )
            remaining = "Exact literal route uniqueness: zero duplicates/unresolved; focused auth/audit tests pass. Historical FP-A12 crosswalk is inconsistent and remains unresolved; this closure does not establish payment provider or DB workflows."
        elif finding_id in ("DISC-042", "DISC-046"):
            status = "NOT APPLICABLE — historical alias merged into DISC-030; preserved as original ID"
            remaining = "Track the root finding DISC-030; this alias is not an independent accepted capability."
        finding_rows.append({
            "finding_id": finding_id,
            "id_class": "HISTORICAL_DISCREPANCY",
            "historical_title": section["title"],
            "historical_severity": section["historicalSeverity"],
            "historical_verification_status": section["historicalVerification"],
            "historical_closure": section["historicalClosure"],
            "historical_capability_refs": dump_list(section["capabilityRefs"]),
            "alias_of": section["aliasOf"],
            "status_index_snapshot": current.get("status", ""),
            "current_recovery_status": status,
            "current_evidence": evidence,
            "remaining_acceptance_gate": remaining,
            "source_anchor": f"developer-review/DISCREPANCY-LOG.md#{finding_id.lower()}",
            "current_base_sha": head,
        })

    # M9-P01 was already recorded as a provisional new finding. Keep it explicitly
    # outside the original DISC-001..056 sequence and outside the capability denominator.
    m9_match = re.search(r"^## M9-P01 — ([^\n]+)", new_findings_text, re.MULTILINE)
    if m9_match:
        finding_rows.append({
            "finding_id": "M9-P01",
            "id_class": "PROVISIONAL_NEW_FINDING",
            "historical_title": m9_match.group(1).strip(),
            "historical_severity": "P1 — proposed in the prior recovery report",
            "historical_verification_status": "route/source-level evidence in prior recovery artifacts",
            "historical_closure": "not closed for real MariaDB/browser acceptance",
            "historical_capability_refs": dump_list(["FP-G09"]),
            "alias_of": "",
            "index_status_before_this_recovery": "IMPLEMENTED — NOT VERIFIED",
            "current_recovery_status": "IMPLEMENTED IN SOURCE; ROUTE/DOUBLE EVIDENCE ONLY; DB AND FULL BROWSER E2E UNVERIFIED",
            "current_evidence": "developer-implemented/EVIDENCE/blog-visibility-test.txt; developer-implemented/EVIDENCE/BROWSER-E2E/full-playwright-disposable-db-preflight-20261029.txt",
            "remaining_acceptance_gate": "Disposable MariaDB tests and full Playwright workflow against the real app/backend; the configured workflow was blocked before tests by its disposable-DB preflight.",
            "source_anchor": "developer-implemented/REPORTS/NEW-FINDINGS.md#M9-P01",
            "current_base_sha": head,
        })

    # Traceability is deliberately many-to-many and records unmapped cases rather
    # than guessing an FP row from a similar feature name.
    reverse_findings: dict[str, list[str]] = defaultdict(list)
    for finding in finding_rows:
        for capability_id in json.loads(finding.get("historical_capability_refs") or "[]"):
            reverse_findings[capability_id].append(finding["finding_id"])

    trace_rows: list[dict] = []
    for capability in capability_rows:
        capability_id = capability["capability_id"]
        related = sorted(set(reverse_findings.get(capability_id, [])))
        mapping_note = "Historical FP row copied without new parity claim."
        if capability_id == "FP-A12":
            mapping_note = "Historical DISC-055 cites FP-A12 as admin system settings, but the current accepted register names FP-A12 Platform tenant registry; preserve both labels and do not infer a replacement ID."
        trace_rows.append({
            "record_type": "CAPABILITY",
            "record_id": capability_id,
            "historical_source": capability["source_artifact"],
            "historical_anchor": capability_id,
            "related_capability_ids": dump_list([capability_id]),
            "related_finding_ids": dump_list(related),
            "historical_disposition": capability["historical_classification"] or capability["current_recovery_status"],
            "current_recovery_status": capability["current_recovery_status"],
            "current_evidence": capability["current_evidence"],
            "remaining_gate": capability["remaining_gate"],
            "mapping_note": mapping_note,
        })
    for finding in finding_rows:
        refs = json.loads(finding.get("historical_capability_refs") or "[]")
        related_findings = [finding["alias_of"]] if finding.get("alias_of") else []
        mapping_note = "Capability references are transcribed from the historical finding text; an empty list means no explicit FP-ID crosswalk was found."
        if finding["finding_id"] == "DISC-055":
            mapping_note = "Historical FP-A12 label conflicts with the current 112-row capability register; unresolved, no guessed remap. Finding closure is separate from parity."
        trace_rows.append({
            "record_type": "FINDING",
            "record_id": finding["finding_id"],
            "historical_source": finding["source_anchor"],
            "historical_anchor": finding["finding_id"],
            "related_capability_ids": dump_list(refs),
            "related_finding_ids": dump_list(related_findings),
            "historical_disposition": finding["historical_severity"],
            "current_recovery_status": finding["current_recovery_status"],
            "current_evidence": finding["current_evidence"],
            "remaining_gate": finding["remaining_acceptance_gate"],
            "mapping_note": mapping_note,
        })

    capability_fields = [
        "record_scope", "accepted_denominator", "capability_id", "domain", "capability",
        "historical_classification", "historical_backend", "legacy_files", "modern_files",
        "legacy_paths", "modern_paths", "endpoints", "historical_invoke", "historical_evidence",
        "historical_audit_status", "historical_subfeatures_json", "current_recovery_status",
        "current_evidence", "remaining_gate", "source_artifact", "source_revision", "current_base_sha",
    ]
    finding_fields = [
        "finding_id", "id_class", "historical_title", "historical_severity",
        "historical_verification_status", "historical_closure", "historical_capability_refs",
        "alias_of", "status_index_snapshot", "current_recovery_status",
        "current_evidence", "remaining_acceptance_gate", "source_anchor", "current_base_sha",
    ]
    trace_fields = [
        "record_type", "record_id", "historical_source", "historical_anchor",
        "related_capability_ids", "related_finding_ids", "historical_disposition",
        "current_recovery_status", "current_evidence", "remaining_gate", "mapping_note",
    ]
    write_csv(OUT / "capabilities.csv", capability_fields, capability_rows)
    write_csv(OUT / "findings.csv", finding_fields, finding_rows)
    write_csv(OUT / "traceability.csv", trace_fields, trace_rows)

    README = OUT / "README.md"
    README.write_text(
        "# Recovery registers (2026-10-29)\n\n"
        "Generated from read-only historical artifacts under `developer-review/` and current recovery reports. "
        "The script is `developer-implemented/tools/build-recovery-registers.py`; it writes only here.\n\n"
        f"- `capabilities.csv`: {len(features['capabilities'])} accepted capabilities plus {len(proposals)} proposals explicitly marked `PROPOSAL_NOT_ACCEPTED`; only the accepted 112 contribute to the historical denominator.\n"
        f"- `findings.csv`: {len(sections)} original discrepancy IDs (including DISC-042 and DISC-046 as aliases) plus M9-P01 as a provisional new finding. Original IDs are preserved.\n"
        f"- `traceability.csv`: one row per accepted/proposed capability and one row per historical/provisional finding; explicit gaps and mismatched crosswalks are not guessed.\n\n"
        "Historical capability classifications are copied verbatim and are not updated by this recovery. Except where a row names specific evidence, current statuses remain `NOT_REASSESSED`; finding closure and capability parity are distinct. DISC-055 is locally verified for route registration/RBAC behavior only; this is not a global finding closure or proof of payment/database/provider workflows. The historical DISC-055 reference to FP-A12 conflicts with the current FP-A12 name; the crosswalk is flagged rather than silently remapped.\n\n"
        f"Current source base SHA: `{head}`.\n",
        encoding="utf-8",
    )
    print(f"Accepted capabilities: {len(features['capabilities'])}; provisional proposals: {len(proposals)}; proposal IDs not in denominator: {len(proposal_ids)}")
    print(f"Historical discrepancy IDs: {len(sections)}; finding rows including M9-P01: {len(finding_rows)}; traceability rows: {len(trace_rows)}")
    print(f"Wrote {OUT.relative_to(ROOT)}/capabilities.csv, findings.csv, traceability.csv, README.md")


if __name__ == "__main__":
    main()
