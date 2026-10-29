#!/usr/bin/env python3
"""
m8c-runtime-manifest.py — build the local execution manifest from the recorded runtime evidence,
keeping probes, test cases and grouped findings in separate universes.

WHY THIS EXISTS
---------------
"35 probes / 8 PASS / 1 FAIL / 12 BLOCKED / 2 N/A" is quoted as if it were one tally. It is two:
35 HTTP probes and 23 test cases. Mixing them lets a reader add 8 + 5 (2xx probes) and call it
"13 passes", or worse, treat an in-process HTTP 200 as browser-level correctness. This tool
refuses to produce a combined number. It emits three separately-counted collections:

  RT-P-xx  HTTP probes        — evidence about route wiring, never about browser behaviour
  RT-T-xx  test cases         — the PASS/FAIL/BLOCKED/NOT APPLICABLE judgements built on them
  RT-C-xx  contract defects   — the 11 alleged wrong-URL client paths, tested one by one

A passing HTTP response is not browser-level correctness, BLOCKED is never counted as a pass, and
NOT APPLICABLE is never counted as a pass.

USAGE
  python3 developer-review/tools/m8c-runtime-manifest.py          # tallies + table
  python3 developer-review/tools/m8c-runtime-manifest.py --json    # machine-readable manifest
EXIT 0 always (an analysis, not a gate).
"""
import argparse
import collections
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")
PROBES = os.path.join(DR, "Evidence", "artifacts", "m8b-runtime-probes.json")
CONTRACT = os.path.join(DR, "Evidence", "artifacts", "m8-contract-gap-revalidation.json")
MATRIX = os.path.join(DR, "M8B-RUNTIME-CLOSURE-MATRIX.md")

ENV = {
    "runtime": "Node backend started locally against InMemoryRepository unless stated",
    "database": "MariaDB NOT available in the audit sandbox (ECONNREFUSED 127.0.0.1:3306)",
    "browser": "Playwright/Chromium NOT available",
    "providers": "Firebase / Razorpay / PayPal credentials NOT available",
    "consequence": "every browser-level and provider-level claim below is BLOCKED, not passed",
}

STATUSES = ("PASS", "FAIL", "BLOCKED", "NOT APPLICABLE")


def parse_matrix():
    """The verification-status table is the authoritative list of test-case judgements."""
    text = open(MATRIX, encoding="utf-8").read()
    rows = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        m = re.match(r"^\*\*?(T\d+[a-z]?(?:-UI)?|C\d)\*\*?", cells[0])
        if not m:
            continue
        tid = m.group(1)
        raw_status = cells[3].replace("**", "").strip()
        status = raw_status.upper()
        # A composite verdict such as "PASS (backend) / n/a (UI)" is kept as its primary
        # judgement with the qualifier recorded, so a backend pass is never read as a UI pass.
        base = status.split("(")[0].split("/")[0].strip()
        if base.startswith("NOT APPLICABLE") or base in ("N/A", "NA"):
            base = "NOT APPLICABLE"
        if base not in STATUSES:
            continue
        rows.append({
            "id": tid,
            "label": cells[0].split("**")[-1].strip() or cells[0],
            "area": cells[1],
            "kind": "browser e2e" if "browser" in cells[2] else "integration",
            "status": base,
            "statusDetail": raw_status,
            "qualifier": (raw_status if "(" in raw_status or "/" in raw_status else None),
            "recordedEvidence": cells[4] if len(cells) > 4 else "",
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    probes = json.load(open(PROBES, encoding="utf-8"))
    contract = json.load(open(CONTRACT, encoding="utf-8"))
    cases = parse_matrix()

    probe_rows = []
    for p in probes["probes"]:
        st = p.get("status")
        cls = ("skipped" if st == -2 else
               "2xx" if isinstance(st, int) and 200 <= st < 300 else
               "4xx" if isinstance(st, int) and 400 <= st < 500 else
               "5xx" if isinstance(st, int) and st >= 500 else "unknown")
        probe_rows.append({
            "id": "RT-P-" + p["id"],
            "probe": p["id"], "label": p.get("label"), "method": p.get("method"),
            "path": p.get("path"), "identity": p.get("identity"), "httpStatus": st,
            "statusClass": cls, "body": (p.get("body") or "")[:160],
            "evidenceClass": "route wiring / in-process behaviour only — NOT browser correctness",
            "countsAsPass": False,
        })

    probe_tally = collections.Counter(r["statusClass"] for r in probe_rows)
    case_tally = collections.Counter(c["status"] for c in cases)

    # ---- one test per alleged wrong-URL contract defect --------------------------------------
    contract_rows, seen_probe_paths = [], collections.defaultdict(list)
    for r in probe_rows:
        seen_probe_paths[r["path"]].append(r)
    for i, path in enumerate(contract["falseSuccessPaths"], start=1):
        matching_gap = next((g for g in contract["gaps"] if g["path"] == path), None)
        # match the client's EXACT url shape: /admin/users/{X}/status must match a recorded
        # /api/admin/users/m8b-user/status, because that is the request the client really makes.
        tmpl = re.escape(path).replace(r"\{X\}", "[^/]+")
        pat = re.compile(r"^/api" + tmpl + r"$")
        pr = [p for p in probe_rows if p["path"] and pat.match(p["path"])]
        if not pr:
            pr = seen_probe_paths.get(path) or seen_probe_paths.get("/api" + path) or []
        executed = [p for p in pr if p["httpStatus"] not in (None, -2)]
        if executed:
            status = "PASS"   # the defect is CONFIRMED by an executed request
            basis = (f"confirmed by executed probe {executed[0]['probe']} → HTTP "
                     f"{executed[0]['httpStatus']} {executed[0]['body'][:60]}")
        else:
            status = "BLOCKED"
            basis = ("no executed request for this path; the defect is proven statically "
                     "(client posts to a path with no registered operation) but the browser-level "
                     "reproduction needs the dev server plus a signed-in session")
        contract_rows.append({
            "id": f"RT-C-{i:02d}", "path": path,
            "classification": (matching_gap or {}).get("classification",
                "NOT_IN_GAP_SET (false-success site whose URL resolves, or was unresolved, in the "
                "contract revalidation; it is not one of the 15 gap shapes)"),
            "sites": (matching_gap or {}).get("siteCount"),
            "probes": [p["probe"] for p in pr],
            "status": status, "basis": basis,
            "expected": ("client must receive a 4xx it does not swallow AND must not render a "
                         "success state"),
            "evidenceToCapture": ("response status + body for the client's exact URL, plus a "
                                  "screenshot/DOM diff showing the success state is suppressed"),
        })
    contract_tally = collections.Counter(r["status"] for r in contract_rows)

    # ---- domain coverage required by M8C section 9, mapped onto the test cases ---------------
    required_domains = {
        "payment rejection / fail-closed": ["T14"],
        "contact form": ["T2", "T2-UI"],
        "admin queue telemetry + fabricated errors": ["T3", "T3-UI"],
        "CMS create/publish/public read authz": ["T4", "T4b", "T4c", "T4-UI"],
        "blog routing + error states": ["T5", "T5-UI"],
        "profile sync / persistence": ["T6"],
        "billing / subscriptions": ["T7", "T7-UI"],
        "MFA enrol + QR + recovery": ["T8", "T8b"],
        "enterprise team UI / permission gates": ["T9"],
        "employer messaging": ["T10"],
        "admin financial settings": ["T11"],
        "rich-text editor": ["T16"],
        "interview voice / media": ["T15"],
    }
    by_id = {c["id"]: c for c in cases}
    domain_rows = []
    for name, ids in required_domains.items():
        present = [i for i in ids if i in by_id]
        statuses = {i: by_id[i]["status"] for i in present}
        worst = ("BLOCKED" if "BLOCKED" in statuses.values() else
                 "FAIL" if "FAIL" in statuses.values() else
                 "PASS" if statuses and all(s == "PASS" for s in statuses.values()) else
                 "NOT APPLICABLE")
        domain_rows.append({"domain": name, "testCases": statuses, "domainStatus": worst,
                            "missingTestCases": [i for i in ids if i not in by_id]})

    tallies = {
        "probes": {"total": len(probe_rows), **dict(probe_tally)},
        "testCases": {"total": len(cases), **{s: case_tally[s] for s in STATUSES}},
        "contractDefects": {"total": len(contract_rows), **{s: contract_tally[s] for s in STATUSES}},
        "neverSum": ("These three collections answer different questions and are never added "
                     "together. No combined runtime pass rate is published."),
        "passDefinition": {
            "testCase": "the judgement recorded in M8B-RUNTIME-CLOSURE-MATRIX.md",
            "contractDefect": ("PASS means the alleged defect was CONFIRMED by an executed "
                               "request — not that the product works"),
            "probe": "no probe is ever a pass; a probe is evidence about routing",
        },
    }

    manifest = {
        "artifact": "m8c-runtime-manifest",
        "mandate": "M8C section 9",
        "generatedBy": "developer-review/tools/m8c-runtime-manifest.py",
        "sourceRevision": "69a3ed4",
        "environment": ENV,
        "probePathCaveat": ("The probe artifact stores normalised paths (concrete ids replaced by "
                             "{id}), so a probe is mapped to a contract path by template shape. No "
                             "probe in this set addresses any of the 11 client paths below, which is "
                             "why all 11 remain BLOCKED rather than inferred."),
        "method": ("Test cases are parsed from the verification-status table rather than retyped, so "
                   "the manifest cannot drift from the recorded judgements. Probes come from the "
                   "machine-readable probe artifact. The 11 contract defects are enumerated from the "
                   "contract revalidation artifact, one test each. Blocked tests stay blocked; nothing "
                   "in this environment was upgraded by inference."),
        "tallies": tallies,
        "testCases": cases,
        "probes": probe_rows,
        "contractDefects": contract_rows,
        "requiredDomains": domain_rows,
        "blockedPrerequisites": {
            "MariaDB": "start a disposable MariaDB on 127.0.0.1:3306, run migrations there, point "
                       "DB_HOST/DB_USER/DB_PASSWORD at it; unblocks T6/T7/T11/T8b persistence legs",
            "browser": "install Playwright Chromium and run the dev server; unblocks every -UI case",
            "Firebase": "supply identity credentials (or run the emulator) to unblock T8b",
            "payment providers": "sandbox keys only; no real charge may be made",
            "messaging": "requires public_config.modules.enableMessagesModule=true, which the "
                         "settings route rejects in this build (400)",
        },
    }

    if a.json:
        print(json.dumps(manifest, indent=2))
        return 0

    print("PROBES (evidence about routing; never browser correctness)")
    print(f"  total {len(probe_rows)}: " + ", ".join(f"{k}={v}" for k, v in sorted(probe_tally.items())))
    print()
    print("TEST CASES")
    for s in STATUSES:
        ids = [c["id"] for c in cases if c["status"] == s]
        print(f"  {s:<15} {case_tally[s]:>2}  {', '.join(ids)}")
    print(f"  total           {len(cases):>2}")
    print()
    print("ALLEGED WRONG-URL CONTRACT DEFECTS (one test each)")
    for s in STATUSES:
        print(f"  {s:<15} {contract_tally[s]:>2}")
    print()
    print("REQUIRED DOMAINS")
    for d in domain_rows:
        print(f"  {d['domainStatus']:<15} {d['domain']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
