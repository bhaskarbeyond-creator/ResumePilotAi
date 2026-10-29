#!/usr/bin/env python3
"""
m8c-scope-corpus.py — M8C P0: reconstruct the shared-corpus rows with capability-scoped attribution.

WHY THIS EXISTS
---------------
M8B proved that the register attributes a bare directory to a capability row and then measures the
whole directory. Where two rows name the same directory, both inherit one measurement:
FP-A14/A15/A16/A21 (admin/settings), FP-F01/F02/F05/F06 (EmployerPortal), FP-A08/A19 (admin tree),
FP-E02/E03 (cv-templates), FP-B02/B03 (one file), FP-E04/E05 (one file). 18 rows across 7 groups.
M8B reconstructed 2 of them (A14, A15). This tool reconstructs the rest.

IT DOES NOT ASSUME THE SHARING IS WRONG. Each row is assigned one of four dispositions:

  SCOPED           the shared directory holds several capabilities and this row owns identifiable
                   files; the scoped file list replaces directory-wide attribution.
  LEGITIMATE_SHARE the two rows measure genuinely different PROPERTIES of the same corpus (e.g. a
                   template catalogue's volume vs its design diversity). Sharing is correct; the
                   row still needs an explicit sharedCorpusJustification.
  SUB_REGION       several capabilities live inside ONE file; scope is a line region, not a file set.
  NO_CORPUS        the row has no source corpus at all (a fabricated-value finding, not a
                   capability). Directory attribution does not apply and must not be invented.
  CORPUS_INCOMPLETE the declared path holds only a thin wrapper; the capability itself lives in a
                   DIFFERENT directory. Attribution is not merely shared, it is incomplete.

METHOD
  File assignment is explicit and auditable (FILETABLE below), derived from the capability title and
  the file's own content, not from a similarity score. Region scoping reuses the JSX panel-boundary
  technique from tools/m8b-reconstruct-a14-a15.py. Subfeature classes use the same 16 definitions as
  the register so numbers are comparable.

USAGE
  python3 developer-review/tools/m8c-scope-corpus.py            # human-readable table
  python3 developer-review/tools/m8c-scope-corpus.py --json     # machine-readable
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")

CLASSES = [
    ("table", r"<table\b|<thead\b|role=[\"']grid[\"']"),
    ("search", r"\b(?:searchQuery|setSearch|handleSearch|searchTerm|SearchInput|type=[\"']search[\"'])"),
    ("filter", r"\b(?:filter|Filter|FILTERS)\b"),
    ("sort", r"\b(?:sortBy|setSort|sortKey|SortSelect|sortOrder)\b"),
    ("pagination", r"\b(?:cursor|loadMore|Load more|pageSize|hasNext|nextCursor|perPage|offset)\b"),
    ("modal", r"\b(?:Modal|Dialog|dialog|drawer|Drawer)\b"),
    ("csv", r"\b(?:toCSV|exportCsv|text/csv|\.csv)\b"),
    ("json", r"\b(?:toJson|exportJson|application/json)\b"),
    ("document", r"\b(?:export-docx|export-pdf|exportPdf|downloadResumePdf|downloadResumeDocx|jspdf|docx)\b"),
    ("print", r"\b(?:print\(|onPrint|printLetter|printSurface|window\.print)\b"),
    ("upload", r"type=[\"']file[\"']|new FormData\(|\.upload\b"),
    ("drag", r"\bdraggable\b|\bonDragStart\b|\bonDrop\b|\bonDragOver\b"),
    ("chart", r"<svg\b|<canvas\b|recharts|<Chart\b"),
    ("bulk", r"\b(?:selectedIds|bulk|selectAll|Select All)\b"),
    ("undo", r"\b(?:undo|Undo|restoreFavourite|handleRestore)\b"),
    ("authz", r"\b(?:hasPermission|requirePermission|isSuperAdmin|isAdmin|canManage)\b"),
]

SET = "src/components/admin/settings"
EMP = "src/components/EmployerPortal"
ETS = "src/enterprise/components/EnterpriseUsersTab.jsx"
ATS = "src/components/BuildResume/AtsScoreMeter.jsx"

# row -> (disposition, scope, note)
#   scope is a list of files (SCOPED / LEGITIMATE_SHARE), a (file, [start,end]) region (SUB_REGION),
#   or None (NO_CORPUS).
FILETABLE = {
    "FP-A14": ("SUB_REGION", (f"{SET}/subscriptionsSettings.jsx", [2390, 2677]),
               "coupons panel; reconstructed by M8B"),
    "FP-A15": ("SUB_REGION", (f"{SET}/subscriptionsSettings.jsx", [1356, 1669]),
               "invoices/refunds panel; reconstructed by M8B"),
    "FP-A16": ("SCOPED", [f"{SET}/EmailSmtpSettings.jsx", f"{SET}/TwilioSmsSettings.jsx"],
               "SMTP/IMAP transport + transactional template settings; TwilioSms is the sms transport settings screen"),
    "FP-A21": ("SCOPED", [f"{SET}/FeatureFlagsSettings.jsx", f"{SET}/PlatformConfigSettings.jsx",
                          f"{SET}/ModulesSettings.jsx", f"{SET}/SecurityLimitsSettings.jsx",
                          f"{SET}/SystemHealthSettings.jsx", f"{SET}/DatabaseSettings.jsx",
                          f"{SET}/StorageSettings.jsx", f"{SET}/PlatformCurrencySettings.jsx"],
               "platform config, feature flags, modules, limits, health, DB/storage, currency"),

    "FP-F01": ("SCOPED", [f"{EMP}/EmployerPortal.jsx", f"{EMP}/EmployerPortalCuba.jsx",
                          f"{EMP}/EmployerSidebar.jsx", f"{EMP}/EmployerStates.jsx",
                          f"{EMP}/useEmployerWorkspace.js", f"{EMP}/EmployerOverview.jsx"],
               "portal shell, navigation, workspace hook, overview"),
    "FP-F02": ("SCOPED", [f"{EMP}/EmployerApplicantPipeline.jsx"], "applicant pipeline"),
    "FP-F05": ("CORPUS_INCOMPLETE", [f"{EMP}/EmployerJobPostings.jsx",
                                     "src/components/Dashboard/EmployerDashboard/EmployerDashboard.jsx",
                                     "src/components/Dashboard/EmployerDashboard/EditJobModal.jsx"],
               "EmployerJobPostings.jsx is a 25-line wrapper that renders EmployerDashboard from ../Dashboard/EmployerDashboard; the requisition editor lives there, outside the declared corpus"),
    "FP-F06": ("CORPUS_INCOMPLETE", [f"{EMP}/EmployerCompanyProfile.jsx", f"{EMP}/EmployerHiringPreferences.jsx",
                                     "src/components/Dashboard/EmployerDashboard/CompaniesManagement.jsx",
                                     "src/components/Dashboard/EmployerDashboard/AddCompanyModal.jsx"],
               "EmployerCompanyProfile.jsx is a 27-line wrapper delegating to CompaniesManagement in ../Dashboard/EmployerDashboard"),

    "FP-A08": ("SCOPED", ["src/components/admin/operations/PlatformOperations.jsx"],
               "announcements publisher lives in operations/, not the admin root; A08/A19 both named the whole admin tree"),
    "FP-A19": ("SCOPED", ["src/components/admin/HelpDesk.jsx"], "help-desk tickets screen"),

    "FP-B02": ("SUB_REGION", (ETS, None), "member directory/invite/removal region of one shared file"),
    "FP-B03": ("SUB_REGION", (ETS, None), "bulk member action region of the same file"),

    "FP-E02": ("LEGITIMATE_SHARE", ["src/cv-templates"], "catalogue VOLUME is a property of the whole template tree"),
    "FP-E03": ("LEGITIMATE_SHARE", ["src/cv-templates"], "design DIVERSITY is a property of the whole template tree"),

    "FP-E04": ("SUB_REGION", (ATS, None), "client-side deterministic score region"),
    "FP-E05": ("SUB_REGION", (ATS, None), "server-audit region; backend evidence says no ATS route exists"),

    "FP-A02": ("NO_CORPUS", None, "fabricated-value finding in the KPI dashboard, not a capability with its own corpus"),
    "FP-A04": ("NO_CORPUS", None, "fabricated-value finding in the health catalogue, not a capability with its own corpus"),
}

# affinity used only for SUB_REGION rows whose region is not an explicit panel
AFFINITY = {
    "FP-A14": r"coupon|Coupon|promo|Promo",
    "FP-A15": r"refund|Refund|invoice|Invoice|creditNote|CreditNote|transaction|Transaction",
    "FP-B02": r"invit|Invitation|member|Member|directory|removeMember|revoke|exportCsv|toCSV",
    "FP-B03": r"bulk|Bulk|selectedIds|selectAll|partial|Partial",
    "FP-E04": r"score|Score|section|breakdown|ats|Ats|ATS",
    "FP-E05": r"audit|Audit|server|Server|authoritative|backend",
}


def files_under(p):
    full = os.path.join(ROOT, p)
    if os.path.isfile(full):
        return [full]
    out = []
    for dirpath, _dn, fn in os.walk(full):
        out += [os.path.join(dirpath, f) for f in fn if f.endswith((".js", ".jsx", ".ts", ".tsx"))]
    return sorted(out)


def measure(text):
    return {k: len(re.findall(pat, text)) for k, pat in CLASSES}


def main():
    fp = json.load(open(os.path.join(DR, "Evidence/artifacts/feature-parity.json")))
    rows = {r["id"]: r for r in fp["capabilities"]}
    out = {"revision": fp.get("revision"), "groups": {}, "rows": {}}
    problems = []

    for rid, (disp, scope, note) in FILETABLE.items():
        row = rows.get(rid)
        if not row:
            problems.append(f"{rid} not in register")
            continue
        rec = {"id": rid, "title": row["capability"], "classification": row["classification"],
               "disposition": disp, "note": note,
               "published": {"paths": row.get("legacyPaths"), "files": row.get("legacyFiles"),
                             "lines": row.get("legacyLines")},
               "backend": row.get("backend"), "endpoints": row.get("endpoints"), "modernFiles": row.get("modernFiles")}

        if disp == "NO_CORPUS":
            rec.update({"scopedFiles": 0, "scopedLines": 0, "classes": {},
                        "finding": "published legacyFiles=0/lines=0 with empty paths -> attribution cannot apply"})
        elif disp == "LEGITIMATE_SHARE":
            fl = files_under(scope[0])
            text = "\n".join(open(f, encoding="utf-8", errors="replace").read() for f in fl)
            rec.update({"scopedFiles": len(fl),
                        "scopedLines": sum(len(open(f, encoding="utf-8", errors="replace").read().split("\n")) for f in fl),
                        "classes": measure(text),
                        "finding": "two rows measure different properties of one corpus; sharing is correct",
                        "sharedCorpusJustification": note})
        elif disp in ("SCOPED", "CORPUS_INCOMPLETE"):
            missing = [p for p in scope if not os.path.exists(os.path.join(ROOT, p))]
            if missing:
                problems.append(f"{rid} missing files: {missing}")
            fl = [os.path.join(ROOT, p) for p in scope if os.path.exists(os.path.join(ROOT, p))]
            text = "\n".join(open(f, encoding="utf-8", errors="replace").read() for f in fl)
            rec.update({"scopedFiles": len(fl), "scopePaths": scope,
                        "scopedLines": sum(len(open(f, encoding="utf-8", errors="replace").read().split("\n")) for f in fl),
                        "classes": measure(text),
                        "finding": (f"directory held multiple capabilities; scoped to {len(fl)} file(s)"
                                    if disp == "SCOPED" else
                                    f"capability extends beyond the declared path; scoped to {len(fl)} file(s) across two directories")})
        else:  # SUB_REGION
            path, span = scope
            full = os.path.join(ROOT, path)
            lines = open(full, encoding="utf-8", errors="replace").read().split("\n")
            if span:
                sel = lines[span[0] - 1:span[1]]
            else:
                # lines matching this capability's affinity, plus a ±3 line context window so a
                # JSX attribute on a following line is not lost
                pat = re.compile(AFFINITY[rid], re.I)
                keep = set()
                for i, ln in enumerate(lines):
                    if pat.search(ln):
                        keep.update(range(max(0, i - 3), min(len(lines), i + 4)))
                sel = [lines[i] for i in sorted(keep)]
                rec["affinityWindow"] = "match +/-3 lines"
            rec.update({"scopedFiles": 1, "scopePath": path, "span": span,
                        "scopedLines": len(sel), "classes": measure("\n".join(sel)),
                        "finding": "several capabilities share one file; scope is a region, not a file set"})

        # overlap: which other rows in the same group also claim this corpus
        rec["groupPeers"] = [k for k, v in FILETABLE.items()
                             if k != rid and (v[1] and scope and str(v[1]).find(str(scope)) >= 0)]
        out["rows"][rid] = rec

    # group view by declared directory
    groups = {}
    for rid, rec in out["rows"].items():
        key = tuple(rec["published"]["paths"] or [])
        groups.setdefault(key, []).append(rid)
    out["groups"] = {("|".join(k) or "(no corpus)"): v for k, v in groups.items()}

    if "--json" in sys.argv:
        json.dump(out, sys.stdout, indent=2)
        print()
        return

    print(f"register revision {out['revision']}\n")
    for key, ids in out["groups"].items():
        print(f"GROUP  {key}")
        for rid in ids:
            r = out["rows"][rid]
            print(f"  {rid:<8} {r['disposition']:<17} published {r['published']['files']:>3}f/"
                  f"{str(r['published']['lines']):>6}L  -> scoped {r['scopedFiles']}f/{r['scopedLines']:>5}L  "
                  f"[{r['classification']}]")
            if r.get("classes"):
                nz = {k: v for k, v in r["classes"].items() if v}
                print(f"           scoped classes: {nz if nz else '{} (all zero)'}")
        print()
    if problems:
        print("PROBLEMS:", problems)
    print("rows processed:", len(out["rows"]),
          "| dispositions:", {d: sum(1 for r in out["rows"].values() if r["disposition"] == d)
                              for d in ("SCOPED", "SUB_REGION", "LEGITIMATE_SHARE", "NO_CORPUS",
                                        "CORPUS_INCOMPLETE")})


if __name__ == "__main__":
    main()
