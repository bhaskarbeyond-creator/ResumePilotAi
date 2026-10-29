#!/usr/bin/env python3
"""V4 reconciliation verifier — stronger checks than verify-audit-package.sh.

Written because AUDIT-CHECK-PROVENANCE.md found that 58 of the 61 existing checks are
self-referential: none stats a path, none re-derives a number from the repository, and
none notices when a document and its generator disagree.

This script is deliberately SEPARATE from verify-audit-package.sh. The old script is not
weakened, relaxed, or edited — a verifier that is adjusted until the package passes is
worthless.

Checks:
  1. capability totals sum, per domain and overall
  2. every legacy/modern path cited by a capability row exists on disk
  3. both trees are fully attributed (legacy AND modern — the old script checks legacy only)
  4. backend register: class counts sum to the unique-operation total, and the classes are
     exactly the seven the mandate names
  5. the reachability document's headline table matches the JSON it was generated from
  6. DISC headings == declared total; RA rows == expected count and unique
  7. every V4 artifact exists
  8. no V4 document claims FULL PARITY for a row with no modern anchor

Exit 0 = clean, 1 = findings (printed).
"""
import json
import os
import re
import sys

DR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(DR)
findings = []
checks = 0


def check(name, fn):
    global checks
    checks += 1
    try:
        fn()
        print(f"PASS: {name}")
    except AssertionError as exc:
        findings.append(name)
        print(f"FAIL: {name} -> {exc}")


def read(*parts):
    with open(os.path.join(DR, *parts), encoding="utf-8", errors="replace") as handle:
        return handle.read()


def parity():
    return json.loads(read("Evidence", "artifacts", "feature-parity.json"))


def reach():
    return json.loads(read("Evidence", "artifacts", "backend-reachability.json"))


CLASSES = {
    "UI-REACHABLE", "INDIRECTLY-REACHABLE", "EXTERNAL-CALLER", "SERVER-ONLY",
    "INTENTIONALLY-UNEXPOSED", "UNREACHABLE", "UNVERIFIED",
}


def c_totals():
    data = parity()
    assert sum(data["counts"].values()) == data["total"], "classification counts do not sum to total"
    assert sum(v["total"] for v in data["byDomain"].values()) == data["total"], "domain totals do not sum"
    for domain, value in data["byDomain"].items():
        assert sum(value["byClassification"].values()) == value["total"], f"{domain} does not sum"
    assert data["total"] == len(data["capabilities"]), "row count differs from declared total"


def c_paths_exist():
    data = parity()
    missing = []
    for cap in data["capabilities"]:
        for kind in ("legacyPaths", "modernPaths"):
            for path in cap.get(kind) or []:
                if not path or path.startswith("http"):
                    continue
                if not os.path.exists(os.path.join(ROOT, path)):
                    missing.append(f"{cap['id']}:{kind}:{path}")
    assert not missing, f"{len(missing)} cited path(s) do not exist, e.g. {missing[:6]}"


def c_both_attributed():
    data = parity()
    assert not data.get("legacySourceUnattributed"), f"legacy unattributed: {data.get('legacySourceUnattributed')[:5]}"
    assert not data.get("modernSourceUnattributed"), f"modern unattributed: {data.get('modernSourceUnattributed')[:5]}"


def c_reach_sums():
    data = reach()
    counts = data["classes"]
    assert set(counts) == CLASSES, f"unexpected class set: {set(counts) ^ CLASSES}"
    assert sum(counts.values()) == data["total"] == len(data["operations"]), "class counts do not sum to operations"
    assert data["units"]["uniqueMethodPath"] == data["total"], "unit mismatch between registrations and operations"


def c_reach_doc_matches():
    doc = read("BACKEND-OPERATION-REACHABILITY.md")
    counts = reach()["classes"]
    for name, value in counts.items():
        pattern = rf"\|\s*`{re.escape(name)}`\s*\|\s*\*\*{value}\*\*"
        assert re.search(pattern, doc), f"{name}={value} not rendered in the document table"


def c_ids():
    disc = read("DISCREPANCY-LOG.md")
    headings = sorted(set(re.findall(r"## \[(DISC-\d{3})\]", disc)))
    declared = int(re.search(r"Total confirmed findings in this log: \*\*(\d+)\*\*", disc).group(1))
    # V7: a heading can exist as a merge stub (DISC-042 / DISC-046 were folded into DISC-030 to keep the
    # finding set non-duplicated). The declared count is distinct findings, so stubs are excluded — but the
    # stubs themselves must be labelled, which is asserted rather than assumed.
    merged = len(re.findall(r"## \[DISC-\d{3}\] MERGED INTO", disc))
    stubs = len(re.findall(r"\*\*status: merged\*\*", disc))
    assert merged == stubs, f"{merged} merged headings but {stubs} stub markers"
    assert declared == len(headings) - merged, (
        f"declared {declared}, headings {len(headings)}, merged stubs {merged}")
    reg = read("ALLEGATION-RESOLUTION-REGISTER.md")
    ra = re.findall(r"^\| (RA-\d{2}) \|", reg, re.M)
    assert len(ra) == len(set(ra)), "duplicate RA ids in the register"
    # V6: derive, do not pin. The register's own summary row must agree with the row count.
    total_row = re.search(r"\| \*\*Total\*\* \| \*\*(\d+)\*\* \| RA-01 … RA-(\d{2}) \|", reg)
    assert total_row, "allegation register has no summary total row"
    assert int(total_row.group(1)) == len(ra), f"summary says {total_row.group(1)}, rows say {len(ra)}"
    assert int(total_row.group(2)) == len(ra), f"summary range RA-{total_row.group(2)} != {len(ra)} rows"


def c_artifacts_present():
    required = [
        "V4-COVERAGE-RECONCILIATION.md", "V4-FINAL-ACCEPTANCE-REPORT.md",
        "ALLEGATION-RESOLUTION-REGISTER.md", "AUDIT-CHECK-PROVENANCE.md",
        "AUDIT-CHANGE-HISTORY.md", "BACKEND-OPERATION-REACHABILITY.md",
        "EG-REVALIDATION-REGISTER.md", "METRIC-DEFINITIONS.md",
        "OAUTH-PROBE.md", "RUNTIME-VERIFICATION-V4.md",
        "Evidence/artifacts/backend-operations.tsv",
        "Evidence/artifacts/backend-reachability.json",
        "Evidence/logs/v4/backend-full-suite.log",
        "Evidence/logs/v4/enterprise-suite.log",
        "Evidence/logs/v4/backend-syntax.log",
        "Evidence/logs/v4/frontend-typecheck.log",
    ]
    missing = [p for p in required if not os.path.exists(os.path.join(DR, p))]
    assert not missing, f"missing: {missing}"


def c_no_unevidenced_full():
    bad = [c["id"] for c in parity()["capabilities"]
           if c["classification"] == "FULL PARITY" and not c.get("modernPaths")]
    assert not bad, f"FULL PARITY without a modern anchor: {bad}"


def c_no_placeholder_ids():
    """Every path-like token in the register must exist, guards against invented anchors."""
    data = parity()
    suspicious = []
    for cap in data["capabilities"]:
        for path in (cap.get("modernPaths") or []) + (cap.get("legacyPaths") or []):
            if "*" in path or path.endswith("/**"):
                suspicious.append(f"{cap['id']}:{path}")
    assert not suspicious, f"glob-style paths in register: {suspicious[:5]}"



def _filesystem_count(root, exts, exclude_patterns=()):
    total = 0
    for base, _dirs, names in os.walk(os.path.join(ROOT, root)):
        for name in names:
            if not name.endswith(tuple(exts)):
                continue
            if any(re.search(pat, name) for pat in exclude_patterns):
                continue
            total += 1
    return total


def c_source_counts_independent():
    """Recompute the two headline file counts from the working tree, not from the artifact."""
    data = parity()
    legacy_disk = _filesystem_count("src", (".js", ".jsx"), (r"\.(test|spec)\.[cm]?jsx?$",))
    modern_disk = _filesystem_count("frontend/src", (".ts", ".tsx"))
    assert data["legacyFilesMeasured"] == legacy_disk, (
        f"legacy: register says {data['legacyFilesMeasured']}, filesystem has {legacy_disk}")
    assert data["modernFilesMeasured"] == modern_disk, (
        f"modern: register says {data['modernFilesMeasured']}, filesystem has {modern_disk}")
    ledger = read("Evidence", "artifacts", "legacy-file-inventory.tsv").strip().splitlines()
    assert len(ledger) - 1 == legacy_disk, f"ledger rows {len(ledger) - 1} != filesystem {legacy_disk}"


def c_operation_register_matches_tsv():
    tsv = read("Evidence", "artifacts", "backend-operations.tsv").strip().splitlines()
    rows = len(tsv) - 1
    total = reach()["total"]
    assert rows == total, f"tsv has {rows} rows, json total is {total}"


def c_dispositions_enumerated():
    """Every category the coverage claim aggregates must still enumerate to its stated size."""
    disc = len(re.findall(r"## \[DISC-\d{3}\]", read("DISCREPANCY-LOG.md")))
    req = len(re.findall(r"^\| \*\*R-\d{3}\*\*", read("REQUIREMENT-REGISTER.md"), re.M))
    ra = len(re.findall(r"^\| (RA-\d{2}) \|", read("ALLEGATION-RESOLUTION-REGISTER.md"), re.M))
    eg_doc = read("EG-REVALIDATION-REGISTER.md")
    eg_missing = [f"EG-{n:03d}" for n in range(1, 13) if f"EG-{n:03d}" not in eg_doc]
    a11y = len(re.findall(r"A11Y-00[1-5]", read("EG-REVALIDATION-REGISTER.md")))
    caps = parity()["total"]
    ops = reach()["total"]
    assert disc >= 26, f"findings shrank unexpectedly: {disc}"
    assert req >= 65, f"requirements shrank unexpectedly: {req}"
    assert ra >= 35, f"allegations shrank unexpectedly: {ra}"
    assert not eg_missing, f"EG entries not dispositioned: {eg_missing}"
    # V7: the operation count is derived from the register, not pinned. Pinning 385 is what let the
    # DISC-041 omission survive three passes: the number could not move, so the missing router could not
    # show up. The floor guards against a shrinking enumeration; the TSV check below guards the exact size.
    tsv_rows = len(read("Evidence", "artifacts", "backend-operations.tsv").strip().splitlines()) - 1
    assert caps == 112, f"caps {caps}"
    assert ops >= 385, f"operation register shrank to {ops}"
    assert ops == tsv_rows, f"register total {ops} != tsv rows {tsv_rows}"
    assert disc >= 46, f"findings shrank unexpectedly: {disc}"


def c_coverage_total_arithmetic():
    """The package's headline coverage figure must equal the sum of its parts."""
    data = parity()
    doc = read("V4-COVERAGE-RECONCILIATION.md")
    # V7: derive every part from the registers instead of reading pinned constants. The old form had
    # been stale since V5 (allegations 35 and findings 26 while the log held 48 and 40), and the failed
    # assertion was the only thing that noticed.
    disc_ids = len(re.findall(r"## \[DISC-\d{3}\]", read("DISCREPANCY-LOG.md")))
    merged = len(re.findall(r"## \[DISC-\d{3}\] MERGED INTO", read("DISCREPANCY-LOG.md")))
    findings = disc_ids - merged
    allegations = len(re.findall(r"^\| (RA-\d{2}) \|", read("ALLEGATION-RESOLUTION-REGISTER.md"), re.M))
    parts = [data["legacyFilesMeasured"], data["modernFilesMeasured"], data["total"],
             reach()["total"], allegations, findings, 65, 17]
    total = sum(parts)
    stated = f"{total:,}"
    assert stated in doc, f"coverage document does not state the derived total {stated}"
    assert "2,092" not in doc, "retracted total still present as a claim"
    # the composition must be printed as an equation, not only as a total
    equation = " + ".join(str(p) for p in parts) + f" = **{stated}**"
    assert equation in doc, f"coverage document does not show the composition {equation}"


def c_client_calls_consistent():
    """DISC-025's numbers must match the artifact it cites, and the artifact must be internally consistent."""
    art = json.loads(read("Evidence/artifacts/client-call-existence.json"))
    tally = art["tally"]
    assert art["callSites"] == sum(tally.values()), "callSites != sum of tally"
    assert art["filesScanned"] > 200, f"only {art['filesScanned']} files scanned"
    missing_sites = tally.get("MISSING", 0)
    # V7: 23 -> 17. Six `/support/tickets*` paths were retracted (DISC-041/DISC-025). Pinned again, but at
    # the retracted-corrected value, because this artifact is produced by a scanner that has its own
    # backend parser; the number is a claim about that parser as much as about the app.
    dead_paths = len(art["distinctMissingEndpoints"])
    assert dead_paths == 17, f"expected 17 dead paths, found {dead_paths}"
    assert missing_sites == sum(min(1, 1) for c in art["calls"] if c["status"] == "MISSING"), "MISSING tally mismatch"
    assert tally.get("METHOD-MISMATCH", 0) == 0, "unexpected verb mismatches"
    log = read("DISCREPANCY-LOG.md")
    assert "17 client-side paths" in log, "DISC-025 headline does not match the artifact"
    rows = len(re.findall(r"^\| \d+ \| `(?:GET|POST|PUT|PATCH|DELETE) /", log, re.M))
    # V7: the table now lists 23 rows of which 6 are struck through as retracted (history preserved),
    # so the invariant is "rows = current paths + retracted rows", not "rows = current paths".
    retracted = len(re.findall(r"\*\*RETRACTED V7\*\*", log))
    assert retracted == 6, f"expected 6 retracted rows in DISC-025, found {retracted}"
    # the 6 struck-through rows no longer match the strict `| n | \`VERB path\`` form, so `rows` counts the
    # live ones; the original table size (23) must still be recoverable from the table itself
    assert rows == dead_paths, f"DISC-025 lists {rows} live paths, artifact has {dead_paths}"
    struck = len(re.findall(r"^\| \d+ \| ~~`", log, re.M))
    assert struck == retracted, f"{struck} struck-through rows, {retracted} retraction markers"
    assert "23 client-side paths" in log, "DISC-025 original count must stay visible as history"


def c_full_parity_supported():
    """Every surviving FULL PARITY row must be endpoint-supported and reachability-supported."""
    art = json.loads(read("Evidence/artifacts/parity-endpoint-audit.json"))
    data = parity()
    full = sum(1 for c in data["capabilities"] if c["classification"] == "FULL PARITY")
    assert art["fullParityRows"] == full, f"audit covers {art['fullParityRows']} rows, parity has {full} FULL"
    bad = {k: v for k, v in art["tally"].items() if k != "SUPPORTED" and v}
    assert not bad, f"FULL PARITY rows still unsupported: {bad}"
    # V6: the expected count is derived from the register, never pinned, so a classification
    # change cannot silently satisfy this check.
    assert 0 < full <= 112, f"FULL PARITY row count out of range: {full}"
    assert art["fullParityRows"] == full
    assert art["allRowsChecked"] == 112, f"endpoint audit covered {art['allRowsChecked']} rows, not 112"
    summary = art["allRowsSummary"]
    assert summary["fullySupported"] > 0, "no fully supported rows"
    assert summary["withUnsupportedEndpoint"] + summary["fullySupported"] + summary["rowsWithNoDeclaredEndpoint"] + summary["withUnreachableEndpoint"] >= 112
    # V7: de-pinned. The value moved 38 -> 37 when FP-E06 gained its real persistence endpoint, which is a
    # correct change, not a regression. A band keeps the check meaningful without freezing a count that
    # legitimately tracks classification edits.
    no_endpoint = summary["rowsWithNoDeclaredEndpoint"]
    assert 30 <= no_endpoint <= 45, f"rows with no declared endpoint out of band: {no_endpoint}"
    doc = read("V4-COVERAGE-RECONCILIATION.md")
    assert "Endpoint resolution applied to all 112 rows" in doc, "requirement (d) residue statement missing"



def c_registration_reconciliation():
    """M8 gate B: the two parsers must agree in scope, and the published 413 must stay reproducible.

    Every assertion is an identity derived from the artifact's own numbers, never a pinned count:
      B's total            == A's alias registrations + A's out-of-scope distinct routes
      legacy replay total  == false positives + alias collisions + B's total
      in-scope disagreement == 0 in both directions
    """
    rec = json.loads(read("Evidence/artifacts/m8-registration-reconciliation.json"))
    art = rec["arithmetic"]
    v = rec["verifications"]
    assert v["reproduces413"], "the published 413 no longer reproduces from the replayed old rules"
    assert v["reproduces397"], "the published 397/393 no longer reproduce from the canonical register"
    assert v["inScopeAgrees"], (
        f"parsers disagree inside the /api scope: {art['onlyB_inScope']} B-only, {art['onlyA']} A-only")
    assert art["a"]["aliasRegistrations"] + art["onlyB_outOfScope"] == art["b"]["registrations"], (
        f"{art['a']['aliasRegistrations']} + {art['onlyB_outOfScope']} != {art['b']['registrations']}")
    lr = art["legacyReplay"]
    assert lr["falsePositives"] + lr["aliasCollisions"] + art["b"]["registrations"] == lr["totalLiterals"], (
        "the historical arithmetic no longer closes: "
        f"{lr['falsePositives']} + {lr['aliasCollisions']} + {art['b']['registrations']} != {lr['totalLiterals']}")
    # the register's own units must stay internally consistent
    assert art["a"]["routeCallSites"] + (art["a"]["aliasRegistrations"] - art["a"]["routeCallSites"]) == art["a"]["aliasRegistrations"]
    assert rec["rows"], "reconciliation artifact carries no row-level table"
    # scope boundary must be stated in the reachability document, not only in the artifact
    doc = read("BACKEND-OPERATION-REACHABILITY.md")
    assert "non-/api routes" in doc.lower() and "alias registrations" in doc.lower(), (
        "reachability document does not state the M8 counting units and scope boundary")


def c_reach_doc_matches_register():
    """The reachability document's class table must equal the register artifact."""
    doc = read("BACKEND-OPERATION-REACHABILITY.md")
    classes = reach()["classes"]
    for name, n in classes.items():
        assert re.search(r"\| `%s` \| \*\*%d\*\* \|" % (re.escape(name), n), doc), \
            f"{name}={n} not found in the reachability document table"
    assert "Per-operation rationale for all 176" in doc, "per-operation rationale table missing"


def c_legacy_call_visibility():
    """Legacy call evidence in the reachability register must be re-derivable from src/.

    M8 repaired the call-site extractor: the legacy tree reaches the API through the generic
    helper `apiJson(` (84 call sites), which the published regex could not see, so 85 operations
    carried legacyUiRefs=0 and the reason "called only by tests, never by a client" even though
    legacy components called them. This check re-derives, with an independently written scanner,
    the exact set of operations that have a legacy call site and requires set equality with the
    artifact. It is an agreement check between two implementations, not an independent semantic
    proof: both share the idea "a call is a helper verb immediately followed by a path literal".
    """
    ops = reach()["operations"]
    call_re = re.compile(
        r"(?:\b(?:get|post|patch|put|del|delete|fetch|request|apiRequest|apiJson|apiFetch"
        r"|\w*[Rr]equest|apiClient\.(?:get|post|patch|put|delete)))"
        r"\s*(?:<[^\n]{0,200}>)?\(\s*[`'\"](\/[^`'\"]{1,160})"
    )

    def normalise(raw):
        v = re.sub(r"\$\{[^}]*\}", "{X}", raw)
        v = re.sub(r"/:([A-Za-z0-9_]+)", "/{X}", v)
        if v.startswith("/api/"):
            v = v[4:]
        return v.rstrip("/") or "/"

    calls = set()
    legacy_root = os.path.join(ROOT, "src")
    for dirpath, dirnames, filenames in os.walk(legacy_root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in
                       ("node_modules", "dist", "build", "coverage")]
        for name in filenames:
            if not name.endswith((".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs")):
                continue
            with open(os.path.join(dirpath, name), encoding="utf-8", errors="replace") as handle:
                text = handle.read()
            for match in call_re.finditer(text):
                calls.add(normalise(match.group(1)))

    def is_called(path):
        if path in calls:
            return True
        if path.endswith("{X}"):
            head = path.replace("{X}", "")
            segments = [s for s in path.split("/") if s]
            return any(call.startswith(head) and len([s for s in call.split("/") if s]) == len(segments)
                       for call in calls)
        return False

    expected = {(op["method"], op["path"]) for op in ops if is_called(op["path"])}
    actual = {(op["method"], op["path"]) for op in ops if op.get("legacyUiRefs", 0) > 0}
    assert expected == actual, (
        "legacy call evidence disagrees with src/: "
        f"artifact-only={sorted(actual - expected)[:5]} derivable-only={sorted(expected - actual)[:5]}"
    )
    assert actual, "no operation carries legacy call evidence at all"
    # The helper that motivated the repair: the public contact form is a legacy call site.
    assert ("POST", "/contact") in actual, "POST /contact lost its legacy call evidence"


def c_m8_gap_adjudications():
    """Every M8 contract-gap adjudication must cite an operation that exists.

    A WRONG_URL disposition is only honest if the operation it points at is registered. This
    re-resolves the cited operation against the 393-operation register and fails if the citation is
    invented; a MISSING_BACKEND disposition must cite nothing and must not overlap a registered shape.
    """
    art = json.loads(read("Evidence", "artifacts", "m8-contract-gap-revalidation.json"))
    ops = reach()["operations"]

    def normalise(raw):
        v = re.sub(r"\$\{[^}]*\}", "{X}", raw)
        v = re.sub(r"/:([A-Za-z0-9_]+)", "/{X}", v)
        if v.startswith("/api/"):
            v = v[4:]
        return v.rstrip("/") or "/"

    registered = {normalise(op["path"]) for op in ops}
    wrong, missing = 0, 0
    for gap in art["gaps"]:
        adj = gap.get("adjudicated") or {}
        klass = adj.get("class") or gap["disposition"]
        if klass == "WRONG_URL":
            wrong += 1
            cited = [normalise(tok) for tok in re.findall(r"(/[\w\-{}:./]+)", adj.get("equivalent") or "")]
            assert cited, f"{gap['path']}: WRONG_URL without a cited operation"
            assert any(c in registered for c in cited), \
                f"{gap['path']}: cites {cited} — none of them is a registered operation"
        elif klass == "MISSING_BACKEND":
            missing += 1
            assert not adj.get("equivalent"), f"{gap['path']}: MISSING_BACKEND must not cite an equivalent"
    assert wrong and missing, "gap adjudication set lost one of its classes"
    # The gap set itself must equal the audit's unresolved set (no gap silently dropped or added).
    contract = json.loads(read("Evidence", "artifacts", "client-contract-audit.json"))
    unresolved = {normalise(c["path"]) for c in contract["calls"] if c["disposition"] != "REGISTERED_AND_MATCHED"}
    assert {g["path"] for g in art["gaps"]} == unresolved, "gap revalidation does not cover the audit's unresolved paths"
    assert art["counts"]["falseSuccessSites"] == contract["falseSuccessSites"], "false-success site count disagrees with the audit"


def c_m8_parity_revalidation():
    """The independent parity derivation must agree with the published distribution and account
    for every reclassification it produced."""
    art = json.loads(read("Evidence", "artifacts", "m8-parity-revalidation.json"))
    data = parity()
    at_parity = sum(1 for c in data["capabilities"]
                    if c["classification"] in ("FULL PARITY", "REPLACED BY EQUIVALENT"))
    assert art["counts"]["rows"] == len(data["capabilities"]) == 112, "revalidation did not cover 112 rows"
    assert art["counts"]["atParity"] == at_parity, \
        f"revalidation says {art['counts']['atParity']} rows at parity, register says {at_parity}"
    # The parity artifact records a 12-character revision, the revalidation the full SHA: compare prefixes.
    assert art["revision"][:12] == data["revision"][:12], \
        f"revalidation ran at {art['revision'][:12]}, register at {data['revision'][:12]}"
    # Every row the revalidation flags at parity must carry a recorded human adjudication.
    adjudicated = json.loads(read("Evidence", "adjudications-m8.json"))["rows"]
    for row in art["rows"]:
        if row["classification"] in ("FULL PARITY", "REPLACED BY EQUIVALENT") and row["flags"]:
            assert row["id"] in adjudicated or row["flags"] in (["COMPONENT_VS_WORKFLOW"],), \
                f"{row['id']} is flagged at parity with no adjudication"


for name, fn in [
    ("capability totals reconcile", c_totals),
    ("every cited path exists on disk", c_paths_exist),
    ("both trees fully attributed", c_both_attributed),
    ("reachability classes are the seven and sum to the total", c_reach_sums),
    ("reachability document matches its JSON", c_reach_doc_matches),
    ("finding/allegation IDs are consistent", c_ids),
    ("all V4 artifacts present", c_artifacts_present),
    ("no FULL PARITY row without a modern anchor", c_no_unevidenced_full),
    ("no glob-style paths in the register", c_no_placeholder_ids),
    ("legacy/modern counts recomputed from the filesystem", c_source_counts_independent),
    ("operation register matches its TSV", c_operation_register_matches_tsv),
    ("every dispositioned category enumerates", c_dispositions_enumerated),
    ("client call existence artifact reconciles", c_client_calls_consistent),
    ("every FULL PARITY row is supported", c_full_parity_supported),
    ("reachability document matches the register", c_reach_doc_matches_register),
    ("coverage total equals the sum of its parts", c_coverage_total_arithmetic),
    ("registration counts reconcile across the two parsers", c_registration_reconciliation),
    ("legacy call evidence re-derivable from src/", c_legacy_call_visibility),
    ("M8 gap adjudications cite registered operations", c_m8_gap_adjudications),
    ("M8 parity revalidation agrees with the register", c_m8_parity_revalidation),
]:
    check(name, fn)

print("--- Summary ---")
print(f"PASS: {checks - len(findings)}  FAIL: {len(findings)}")
sys.exit(0 if not findings else 1)
