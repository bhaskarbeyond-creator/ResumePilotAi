#!/usr/bin/env python3
"""Validate register completeness, cross-references, and evidence-path integrity."""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REG = ROOT / "developer-implemented/REGISTERS"


def read_csv(name: str) -> list[dict[str, str]]:
    with (REG / name).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def files_from(value: str) -> list[str]:
    paths = []
    for token in value.split(";"):
        token = token.strip().strip("`")
        if not token:
            continue
        token = token.split("#", 1)[0].strip()
        if token and ("/" in token or "." in token):
            paths.append(token)
    return paths


def main() -> None:
    capabilities = read_csv("capabilities.csv")
    findings = read_csv("findings.csv")
    trace = read_csv("traceability.csv")
    errors: list[str] = []

    accepted = [row for row in capabilities if row["record_scope"] == "ACCEPTED_CAPABILITY"]
    proposals = [row for row in capabilities if row["record_scope"] == "PROPOSAL_NOT_ACCEPTED"]
    accepted_ids = {row["capability_id"] for row in accepted}
    proposal_ids = {row["capability_id"] for row in proposals}
    finding_ids = {row["finding_id"] for row in findings}

    if len(accepted) != 112 or sum(row["accepted_denominator"] == "true" for row in capabilities) != 112:
        errors.append("accepted capability count/denominator must be exactly 112")
    if len(proposals) != 5 or any(row["accepted_denominator"] != "false" for row in proposals):
        errors.append("all 5 proposals must be explicit and excluded from the accepted denominator")
    expected_findings = {f"DISC-{number:03d}" for number in range(1, 57)} | {"M9-P01"}
    if finding_ids != expected_findings or len(findings) != len(expected_findings):
        errors.append("finding IDs must contain DISC-001..DISC-056 exactly once plus M9-P01")
    if len(accepted_ids) != 112 or len(proposal_ids) != 5:
        errors.append("capability IDs must be unique within accepted/provisional scopes")

    for row in findings:
        if row["alias_of"] and row["alias_of"] not in finding_ids:
            errors.append(f"{row['finding_id']} aliases unknown finding {row['alias_of']}")
        for capability_id in json.loads(row["historical_capability_refs"] or "[]"):
            if capability_id not in accepted_ids and capability_id not in proposal_ids:
                errors.append(f"{row['finding_id']} references unknown capability {capability_id}")
        if row["finding_id"] == "DISC-055" and "FP-A12" not in row["historical_capability_refs"]:
            errors.append("DISC-055 historical FP-A12 reference was not preserved")

    for row in trace:
        for finding_id in json.loads(row["related_finding_ids"] or "[]"):
            if finding_id not in finding_ids:
                errors.append(f"trace {row['record_id']} references unknown finding {finding_id}")
        for capability_id in json.loads(row["related_capability_ids"] or "[]"):
            if capability_id not in accepted_ids and capability_id not in proposal_ids:
                errors.append(f"trace {row['record_id']} references unknown capability {capability_id}")
    if len(trace) != len(capabilities) + len(findings):
        errors.append("traceability row count must cover each capability/proposal and finding exactly once")

    for filename, rows in (("capabilities.csv", capabilities), ("findings.csv", findings), ("traceability.csv", trace)):
        for row in rows:
            for field, value in row.items():
                if field not in {"source_artifact", "historical_source", "current_evidence", "source_anchor"}:
                    continue
                for relative in files_from(value or ""):
                    if not (ROOT / relative).is_file():
                        errors.append(f"{filename} {row.get('record_id') or row.get('finding_id') or row.get('capability_id')} has missing evidence/source path: {relative}")

    fp_a12 = next((row for row in capabilities if row["capability_id"] == "FP-A12"), None)
    if not fp_a12 or "CROSSWALK_CONFLICT" not in fp_a12["current_recovery_status"] or "no remap is inferred" not in fp_a12["remaining_gate"]:
        errors.append("FP-A12 / DISC-055 crosswalk conflict must be explicitly flagged without remapping")
    if any(path.relative_to(ROOT).parts[0] == "developer-review" for path in REG.rglob("*")):
        errors.append("register output directory must not contain or write into developer-review")

    print(f"accepted_capabilities={len(accepted)}; accepted_denominator={sum(r['accepted_denominator']=='true' for r in capabilities)}")
    print(f"proposals_not_accepted={len(proposals)}; historical_DISC_ids={sum(i.startswith('DISC-') for i in finding_ids)}; provisional_new_findings={len(findings)-56}")
    print(f"traceability_rows={len(trace)}; FP-A12/DISC-055_conflict_flagged={bool(fp_a12 and 'CROSSWALK_CONFLICT' in fp_a12['current_recovery_status'])}")
    if errors:
        print(f"VALIDATION=FAIL; errors={len(errors)}")
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(1)
    print("VALIDATION=PASS; counts, IDs, cross-references, source paths, and explicit no-remap conflict checked")


if __name__ == "__main__":
    main()
