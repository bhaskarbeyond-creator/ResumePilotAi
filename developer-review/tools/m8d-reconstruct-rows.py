#!/usr/bin/env python3
"""
m8d-reconstruct-rows.py — reconstruct the 41 directory-scoped capability rows from source.

WHY THIS EXISTS
---------------
M8C declared 41 of 53 bare-directory rows UNRECONSTRUCTED. A declaration is not a reconstruction.
This tool holds one decision per row, taken by reading the files, and recomputes the scoped corpus
from the audit tree so every corrected measurement is reproducible rather than asserted.

DOCTRINE (stated so it can be argued with)
------------------------------------------
1. A bare directory is NOT a defect by itself. If the directory implements exactly one capability,
   the published measurement is correct and the row is VERIFIED — CORRECT. Eleven of the 41 are
   directories containing a single file.
2. A corpus is CONTAMINATED when it contains files implemented for a DIFFERENT capability that has
   its own row, or when it contains no file that implements the row's own capability.
3. A corpus is a JUSTIFIED SHARE when two rows measure different properties of one implementation,
   or when a sub-capability legitimately lives inside its parent's implementation and both rows are
   correct for their own scope. Justified sharing is recorded, not condemned.
4. A sub-feature nested inside a parent's directory is NOT automatically contamination: a dashboard
   legitimately renders widgets. But the parent's subfeature measurement then includes the widget's
   classes, so the parent's corpus is scoped to its own files and the overlap is declared.
5. Nothing here changes a classification. Reconstruction corrects WHAT a row measured.

USAGE
  python3 developer-review/tools/m8d-reconstruct-rows.py [--json]
EXIT 0 always (analysis).
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DR = os.path.join(ROOT, "developer-review")
REV = "69a3ed4"
PARITY = os.path.join(DR, "Evidence", "artifacts", "feature-parity.json")
SCOPING = os.path.join(DR, "Evidence", "artifacts", "m8c-corpus-scoping.json")

CLASSES = [
    ("table", r"<table\b|<thead\b|role=[\"']grid[\"']"),
    ("search", r"\b(?:searchQuery|setSearch|handleSearch|searchTerm|SearchInput|type=[\"']search[\"'])"),
    ("filter", r"\b(?:filter|Filter|FILTERS)\b"),
    ("sort", r"\b(?:sortBy|setSort|sortKey|SortSelect|sortOrder)\b"),
    ("pagination", r"\b(?:cursor|loadMore|pageSize|hasNext|nextCursor|perPage|offset)\b"),
    ("modal", r"\b(?:Modal|Dialog|drawer|Drawer)\b"),
    ("csv", r"\b(?:toCSV|exportCsv|text/csv|\.csv)\b"),
    ("json", r"\b(?:toJson|exportJson|application/json)\b"),
    ("document", r"\b(?:generatePdf|downloadDoc|\.docx|FileSaver|saveAs)\b"),
    ("print", r"\b(?:window\.print|print\()"),
    ("chart", r"<svg\b|<canvas\b|recharts|FaChartBar"),
    ("bulk", r"\b(?:bulk|Bulk|selectedUserIds|selectAll)\b"),
    ("authz", r"\b(?:isAdmin|hasPermission|requireRole|isEmployer|can[A-Z]\w*)\b"),
]

# ---------------------------------------------------------------------------------------------
# One decision per row. `scope` is a list of {path, region} entries; a path without a region is
# taken whole. `exclude` lists files inside the declared directories that belong to another
# capability. Nothing is inferred here: each entry cites what was read.
# ---------------------------------------------------------------------------------------------
D = {
 "FP-A01": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/dashboard"],
   why="The directory holds exactly one file, dashboard.jsx (507 L, 6 useState / 3 useEffect / 1 API "
       "import). There is no other capability in the corpus to contaminate it.",
   modern="AdminDashboardTab.tsx"),
 "FP-A03": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/health"],
   why="Three files, all health-specific: PlatformHealth (372 L, 61 capability-term hits), "
       "ApiHealthMatrix (263 L) and ServiceDetailPanel (244 L) are the catalogue, the matrix and the "
       "detail panel of one screen. No other row claims them.",
   modern="AdminHealthTab.tsx"),
 "FP-A05": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=["src/components/admin/security/PlatformSecurity.jsx"],
   exclude=["src/components/admin/audit/AdminAuditLogs.jsx"],
   why="The declared corpus was AdminAuditLogs.jsx (398 L) + PlatformSecurity.jsx (362 L). "
       "AdminAuditLogs.jsx IS the whole corpus of FP-A22 (dedicated audit-log browser) and contains "
       "no security-event stream; including it credited this row with another row's implementation. "
       "The row's own endpoints (/platform/security-events) resolve to getSecurityEvents in "
       "PlatformSecurity.jsx, which is therefore the whole scoped corpus.",
   modern="AdminSecurityTab.tsx (event stream region)"),
 "FP-A06": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/operators"],
   why="One file, PlatformOperators.jsx, 769 L with 17 useState hooks and a platformApi import; it "
       "is the operator roster itself, not a wrapper.",
   modern="AdminUsersTab / operator roster"),
 "FP-A07": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=[], exclude=["src/components/admin/security/PlatformSecurity.jsx"],
   why="The row claims an IP blocklist / deny rules. Its declared corpus (PlatformSecurity.jsx, "
       "362 L) contains no blocklist, deny rule or IP-ban logic: a case-insensitive search of the "
       "whole legacy tree for blocklist/deny-rule/IP-ban vocabulary returns only an unrelated hit in "
       "Checkout.jsx. The register's own evidence cites `handleBlockIp`, which exists ONLY in the "
       "MODERN file frontend/src/components/admin/AdminSecurityTab.tsx:214. The legacy corpus "
       "therefore implements FP-A05's security-event stream, not this row's capability: the legacy "
       "side has NO implementation, and the MOCK/FABRICATED finding is a modern-side finding.",
   modern="frontend/src/components/admin/AdminSecurityTab.tsx:214 (handleBlockIp)"),
 "FP-A09": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/phrases",
   "src/components/admin/reviews", "src/components/admin/TrustedBy",
   "src/components/admin/landingPages"],
   why="Four files, each one of the four things the row claims (phrases 246 L, reviews 432 L, "
       "trusted-by 101 L, admin landing pages 344 L). No other row claims them.",
   modern="AdminMarketingTab / content tabs"),
 "FP-A10": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/attention"],
   why="One file, PlatformAttention.jsx, 130 L with 8 useState hooks and one API import: small but "
       "genuinely the attention inbox, not a wrapper.",
   modern="AdminDashboardTab attention region"),
 "FP-A11": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/employerApplications",
   "src/components/admin/jobsManager"],
   why="Two files, one per half of the row's own title (employer applications 585 L, jobs manager "
       "599 L with 179 capability-term hits).",
   modern="AdminJobsTab / AdminEmployerApplicationsTab"),
 "FP-A12": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/tenants"],
   why="One file, PlatformTenants.jsx, 2,105 L with 312 capability-term hits — the tenant registry "
       "in full.",
   modern="AdminTenantsTab.tsx"),
 "FP-A13": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/companyManagement"],
   why="One file, CompanyManagement.jsx, 641 L with ZERO useState, ZERO useEffect and ZERO API "
       "calls — a static fixture screen. That is precisely why the row is MOCK/FABRICATED; the "
       "corpus is correct and the classification is supported by the absence of data plumbing.",
   modern="AdminCompaniesTab.tsx"),
 "FP-A17": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/usersManager",
   "src/components/admin/userEdit"],
   why="Four files that together are user management: UsersManager (1,013 L), User360Drawer "
       "(1,513 L), UserEdit (469 L), CreateUserModal (244 L). FP-A18's bulk operations are a region "
       "inside UsersManager, so this parent corpus is correct for its own scope; the overlap is "
       "declared rather than removed.",
   modern="AdminUsersTab.tsx / User360 drawer"),
 "FP-A18": dict(disposition="PARTIALLY RECONSTRUCTED",
   scope=["src/components/admin/usersManager/UsersManager.jsx"],
   regions=[{"path": "src/components/admin/usersManager/UsersManager.jsx",
             "lines": "34-50, 155-170, 328-430", "what": "multi-selection state, select-all, bulk "
             "suspend/remove handlers"}],
   exclude=["src/components/admin/usersManager/User360Drawer.jsx",
            "src/components/admin/usersManager/CreateUserModal.jsx"],
   why="The capability is a REGION of UsersManager.jsx (selection state 34-50, select-all 155-170, "
       "bulk handlers 328-430), not three whole files. The published corpus also carried "
       "User360Drawer (1,513 L) and CreateUserModal (244 L), neither of which implements a bulk "
       "operation. A line-region measurement is stated rather than a file count, because a bulk "
       "action is not a whole-file property; the file-level number below is the containing file.",
   modern="AdminUsersTab.tsx bulk-action region"),
 "FP-A20": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=["src/components/admin/queues", "src/components/admin/operations"],
   exclude=["src/components/admin/command/AdminCommandPalette.jsx",
            "src/components/admin/command/adminEntitySearch.js",
            "src/components/admin/sidebar/sidebar.jsx"],
   why="The declared corpus was five files across four directories. Two of them (command/, 381 L) "
       "are the whole corpus of FP-A23 (command palette + entity search) and one (sidebar.jsx, "
       "538 L) is the corpus of FP-A26 (console shell and tab routing). Neither implements queues, "
       "DLQ, outbox, cache or backups. The scoped corpus is PlatformQueues (379 L) + "
       "PlatformOperations (332 L) = 711 L.",
   modern="AdminQueuesTab.tsx / AdminOperationsTab"),
 "FP-A22": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/audit"],
   why="One file, AdminAuditLogs.jsx, 398 L with 94 capability-term hits and the row's own "
       "endpoints (/admin/audit-logs, /admin/audit-logs/stats). It is the audit browser itself.",
   modern="AdminAuditTab.tsx"),
 "FP-A23": dict(disposition="VERIFIED — CORRECT", scope=["src/components/admin/command"],
   why="Two files that are exactly the palette and its search engine (AdminCommandPalette 239 L, "
       "adminEntitySearch 142 L). The palette imports searchPlatform from platformApi, matching the "
       "row's own implementation.",
   modern="command palette (⌘K)"),
 "FP-A24": dict(disposition="VERIFIED — CORRECT", scope=["src/components/Billing/Plans"],
   why="Three files, one per element the row names: Plans (1,123 L), PlansTable (206 L), Checkout "
       "(2,524 L). No other row claims them.",
   modern="pages/pricing + checkout"),
 "FP-C02": dict(disposition="VERIFIED — CORRECT",
   scope=["src/components/PortfolioBuilder/PortfolioComponents"],
   why="72 files: 71 category/block components plus index.js, which re-exports NavbarCategory, "
       "HeroCategory, AboutCategory … AwardsCategory. That is one block library, which is what the "
       "row claims. The 72nd file is an export barrel, not a second capability.",
   modern="portfolio block library"),
 "FP-C05": dict(disposition="VERIFIED — CORRECT", scope=["src/components/PublicPortfolio"],
   why="One file, PublicPortfolio.jsx, 307 L with 114 capability-term hits and 4 useState hooks.",
   modern="public portfolio route"),
 "FP-C06": dict(disposition="VERIFIED — CORRECT", scope=["src/components/PortfolioTemplates"],
   why="Seven files: four named templates (CreativeDark, Executive, ModernMinimal, PremiumTech), "
       "shared.jsx, WebCvRenderer.jsx and index.js. All are the template gallery; the shared "
       "helpers are part of it rather than a separate capability.",
   modern="portfolio template gallery"),
 "FP-C07": dict(disposition="VERIFIED — CORRECT", scope=["src/components/PortfolioGallery"],
   why="One file, PortfolioGallery.jsx, 238 L with 6 useState hooks and 85 capability-term hits.",
   modern="portfolio gallery route"),
 "FP-D03": dict(disposition="SHARED — JUSTIFIED WITH EVIDENCE",
   scope=["src/components/Dashboard/DashboardInterviews"],
   sharedWith=["FP-D01 (LiveVoiceEngine.js, LiveInterviewSession.jsx)",
               "FP-D02 (LiveAudioWaveform.jsx)"],
   why="Six files that are one interview session: DashboardInterviews (3,129 L), "
       "LiveInterviewSession (1,691 L), LiveAnswerGuide (281 L), LiveAudioWaveform (254 L), "
       "LiveResumeDrawer (229 L) and LiveVoiceEngine (233 L). FP-D01 and FP-D02 measure the voice "
       "delivery and microphone sub-capabilities, whose implementation is INSIDE this session — a "
       "session UI cannot have a voice mode without containing it. The sharing is real and the "
       "corpus is correct for the session, but this row's subfeature counts include those two "
       "sub-capabilities' classes and must be read with that in mind.",
   modern="interview session UI"),

 "FP-D12": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=["src/components/Dashboard2", "src/components/Dashboard/ResumesList",
          "src/components/Dashboard/CoversList", "src/components/Dashboard/DashboardPortfolios",
          "src/components/Dashboard/DashboardSearch", "src/components/Dashboard/ProfileDisplay",
          "src/components/Dashboard/SettingsDropdown", "src/components/AppShell",
          "src/components/common"],
   exclude=["src/components/Dashboard2/elements/*"],
   why="The 28-file corpus mixed dashboard elements with the CONTENT-MARKETING homepage: 13 files "
       "under Dashboard2/elements are HomepageHero, HomepageFooter, HomepagePricing, HomepageReviews, "
       "Homepagefaqs, HomepageTemplates and siblings. Those same files are the implementation of "
       "FP-G10 (CMS custom pages / landing-page rendering), so they were counted twice and this "
       "row's element library was inflated with marketing copy it does not own. The scoped corpus "
       "keeps the Dashboard widgets, the AppShell and the shared common/ widgets.",
   modern="dashboard element components"),
 "FP-D13": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=["src/components/Candidate"],
   exclude=["src/components/Candidate/CubaNextSteps.jsx",
            "src/components/Candidate/PaymentGraceBanner.jsx",
            "src/components/Candidate/gracePeriodNotice.js",
            "src/components/Candidate/candidateEntitySearch.js"],
   why="The 16-file Candidate directory contains three independent capabilities with their own "
       "rows: CubaNextSteps (FP-D10, onboarding checklist), PaymentGraceBanner + gracePeriodNotice "
       "(FP-D14, dunning banner) and candidateEntitySearch (candidate search). The shell is "
       "correctly composed of them at runtime, but counting their classes as the shell's own "
       "measurement contaminates it.",
   modern="candidate shell"),
 "FP-D15": dict(disposition="VERIFIED — CORRECT", scope=["src/components/Dashboard/DashboardFavourites"],
   why="One file, DashboardFavourites.jsx, 401 L with 7 useState hooks.",
   modern="saved jobs route"),
 "FP-E01": dict(disposition="PARTIALLY RECONSTRUCTED",
   scope=["src/components/BuildResume", "src/components/Form", "src/components/Boards",
          "src/components/Actions"],
   exclude=["src/components/BuildResume/AtsScoreMeter.jsx"],
   why="The builder legitimately spans four directories (61 files), and the step components are its "
       "own implementation. It also contains whole sub-capabilities with their own rows — ATS meter "
       "(FP-E04/E05), AI writing aids (FP-E10), import/sync modals, template selection (FP-E08's "
       "share entry point) — so a single scoped file set would be arbitrary. The ATS meter is "
       "excluded here because it is a self-contained measured capability; the remaining overlap is "
       "declared and the row needs per-step scoping before its subfeature table is cited as its own.",
   modern="resume builder step flow"),
 "FP-E08": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=["src/components/Dashboard/ShareModal/ShareModal.jsx"],
   regions=[{"path": "src/components/BuildResume/BuildResume.jsx",
             "lines": "93, 1060-1090, 1920-1935, 2600-2620, 2704",
             "what": "share state, plan-gated handleShare, review-link modal mounts"}],
   exclude=None,
   why="The capability is a share modal, but the row was measured over the ENTIRE BuildResume "
       "directory (36 files, 16,941 L) — the same corpus as FP-E01's builder. The implementation is "
       "Dashboard/ShareModal/ShareModal.jsx (270 L) plus a handful of share handlers inside "
       "BuildResume.jsx. A 36-file corpus for a share modal is the same defect class as FP-A08's "
       "68-file directory.",
   modern="share/public-link modal"),
 "FP-E09": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=["src/components/CoverLetter/CoverLetter.jsx", "src/components/TemplateRenderer.jsx"],
   exclude=None,
   why="74 declared files: the entire cv-templates directory (72 files) plus CoverLetter.jsx. "
       "cv-templates is the corpus of FP-E02/FP-E03 (template catalogue volume and diversity) and "
       "CoverLetter.jsx does not read it — it imports ../TemplateRenderer, a single shared renderer. "
       "Including 72 unrelated template files inflated the cover-letter row by an order of "
       "magnitude.",
   modern="cover letter editor"),
 "FP-E13": dict(disposition="VERIFIED — CORRECT", scope=["src/engine/hybrid"],
   why="23 files that are one engine: SmartResumeComposer, 14 Smart* section components, 5 layouts, "
       "smartPartitioner, themePresets and 2 utils. That is exactly the partitioner + layouts the "
       "row claims.",
   modern="resume layout engine"),
 "FP-E16": dict(disposition="VERIFIED — CORRECT", scope=["src/components/Exporter"],
   why="Three files, all export access: Exporter (104 L), RequireExportAccess (30 L), "
       "exportAccess.js (42 L) — guard, gate and component.",
   modern="plan-gated export guard"),
 "FP-F08": dict(disposition="VERIFIED — CORRECT", scope=["src/components/JobsLanding"],
   why="Four files, all regional job landing pages (JobsLanding, JobsLandingHero, "
       "LandingJobTopCompanies, LandingJobsFeatured). FP-F10 includes this directory but that is "
       "FP-F10's contamination, not this row's.",
   modern="regional job hub pages"),
 "FP-F10": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=["src/components/JobsListings"],
   exclude=["src/components/JobsLanding/JobsLanding.jsx",
            "src/components/JobsLanding/JobsLandingHero.jsx",
            "src/components/JobsLanding/LandingJobTopCompanies.jsx",
            "src/components/JobsLanding/LandingJobsFeatured.jsx"],
   why="The row claims browse/filter (FP-F07 separately claims maps and autocomplete). Its corpus "
       "included the whole JobsLanding directory, which is FP-F08's entire declared corpus — four "
       "regional hub pages with no listing filters. Scoped to JobsListings (17 files).",
   modern="jobs listing page"),
 "FP-F11": dict(disposition="SHARED — JUSTIFIED WITH EVIDENCE",
   scope=["src/components/Dashboard/EmployerDashboard"],
   sharedWith=["FP-F03 (SendMessageDialog.jsx)",
               "M8C scoped FP-F05/FP-F06 here (the real implementation of their wrapped screens)",
               "M8C scoped FP-F09 to EmployerOverview.jsx in the sibling EmployerPortal directory"],
   why="Seven files that are one employer dashboard: EmployerDashboard (720 L), CompaniesManagement "
       "(566 L), AddCompanyModal (591 L), EditCompany-replacement EditJobModal (713 L), "
       "JobApplicationsModal (576 L), RejectionReasonModal (107 L) and SendMessageDialog (114 L). "
       "Every file serves the row's own title. The sharing is justified in both directions: the "
       "messaging dialog is FP-F03's implementation, and this directory is where M8C found the real "
       "implementations of FP-F05/FP-F06, whose own declared corpora were 25- and 27-line wrappers.",
   modern="employer dashboard"),

 "FP-G02": dict(disposition="SHARED — JUSTIFIED WITH EVIDENCE",
   scope=["src/components/cuba"],
   sharedWith=["FP-D04 (CubaCommandPalette.jsx)", "FP-D05 (CubaCopilotMascot.jsx + copilot logic)",
               "FP-D06 (CubaHud.jsx)", "FP-D08 (CubaDensityProvider.jsx)",
               "FP-G01 (CubaAppShell.jsx, CubaPortalShell.jsx)"],
   why="52 files: 30+ design-system primitives AND five feature components whose capabilities have "
       "their own rows (candidate command palette, copilot mascot, HUD, density provider, "
       "application shell). A component library legitimately ships composite components, so the "
       "corpus is not wrong — but this is sharing, not independent verification: the row's "
       "subfeature counts include those five features' classes, which is why it is recorded as a "
       "justified share rather than a clean measurement. Excluding them would be defensible too; "
       "the choice is stated so a reader can take the other one.",
   modern="design system primitives"),

 "FP-G07": dict(disposition="VERIFIED — CORRECT", scope=["src/components/Toasts"],
   why="One file, Toats.jsx (131 L, 0 useState, 0 API) — presentational toast primitives. The "
       "filename is misspelt in the legacy tree; that is a naming defect, not a corpus defect.",
   modern="toast primitives"),
 "FP-G09": dict(disposition="VERIFIED — CORRECT",
   scope=["src/components/Blog", "src/components/admin/blogManagement"],
   why="Seven files: BlogEditor (1,631 L), BlogList (387 L), BlogPost (483 L), BlogCard (171 L), "
       "CategoryFilter (84 L), BlogManagement (874 L), BlogPreviewModal (281 L). Authoring and the "
       "public blog are the row's own two halves.",
   modern="blog editor + public blog"),
 "FP-G10": dict(disposition="VERIFIED — CORRECT",
   scope=["src/components/CustomPage", "src/components/Marketing"],
   why="17 files: CustomePage.jsx (299 L), LandingPage.jsx and 15 Marketing/elements sections. The "
       "row claims CMS custom pages and landing-page rendering; the elements ARE the landing page. "
       "FP-D12 also counted them, which is D12's contamination, corrected there.",
   modern="CMS page renderer"),
 "FP-G11": dict(disposition="PARTIALLY RECONSTRUCTED",
   scope=["src/components/welcome", "src/components/Features", "src/components/Contact"],
   missing=["FAQ, About and Legal content is NOT in this corpus. A search of the three files for "
            "FAQ returns zero hits; FAQ content exists in Marketing/elements/Homepagefaqs.jsx and "
            "faqData.js, which belong to FP-G10's corpus. The row's title overstates what the "
            "corpus implements."],
   why="Welcome (1,504 L), Features (667 L) and Contact (420 L) are genuinely one marketing surface, "
       "so the corpus is not contaminated. But the row's stated scope includes FAQ/about/legal "
       "pages that live in another row's directory, so the capability is only partly covered by the "
       "measured corpus. Reconstructing it means deciding whether those pages are part of this row "
       "or of FP-G10 — a register-level decision, not a measurement.",
   modern="marketing pages"),
 "FP-G15": dict(disposition="SHARED — JUSTIFIED WITH EVIDENCE",
   scope=["src/utils"],
   sharedWith=["FP-E11 (docxDownload.js)", "FP-E12 (pdfDownload.js, exportDownloader.js, "
               "printSurface.js)", "FP-E15", "FP-G17", "FP-G19", "FP-G20", "FP-G21"],
   why="43 files of shared utilities. Other rows measure individual modules of this library as their "
       "own implementation, which is what a utility library is for; the sharing is therefore "
       "justified and recorded. It is not independent verification of this row: its counts are the "
       "union of everything in src/utils, including capabilities measured elsewhere.",
   modern="shared utils"),

 "FP-G22": dict(disposition="VERIFIED — CORRECT",
   scope=["src/models", "src/conf", "src/context"],
   why="Seven files: four models (Education, Employment, Language, Skills), two conf modules and "
       "AuthContext. src/models contains exactly those four files, so the corpus is complete for "
       "what it claims.",
   modern="models/config/context"),
 "FP-G23": dict(disposition="SHARED — JUSTIFIED WITH EVIDENCE",
   scope=["src/hooks"],
   sharedWith=["FP-D02 (useInterviewMedia.js)", "FP-D07 (unread poller hooks)",
               "FP-G08 (2FA hooks)"],
   why="11 hook modules. Hooks are cross-cutting by construction and other rows consume them; being "
       "used by several capabilities is their purpose, so the sharing is justified. As with the other "
       "library rows, the counts describe the library, not an isolated capability.",
   modern="shared hooks"),

 "FP-G24": dict(disposition="CORRECTED — MEASUREMENT WAS CONTAMINATED",
   scope=["src/components/Dashboard/DashboardSupport",
          "src/components/Dashboard/ValidationModal"],
   exclude=["src/components/Dashboard/DashboardToast/DashboardToast.jsx"],
   why="The row claims the in-app support surface and input-validation modals. DashboardToast is "
       "neither: DashboardSupport.jsx does not import it (a grep for DashboardToast inside "
       "DashboardSupport returns nothing), and its subject is toast notification primitives, which "
       "is FP-G07's capability. Scoped to DashboardSupport (916 L) + ValidationModal (438 L).",
   modern="support surface"),
}


def legacy_code():
    out = subprocess.run(["git", "ls-tree", "-r", "--name-only", REV, "--", "src"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines()
            if os.path.splitext(p)[1] in (".js", ".jsx") and not re.search(r"\.(test|spec)\.", p)]


def resolve(scope, exclude, code):
    files = set()
    for s in scope:
        if any(ch in s for ch in "*?["):
            pat = re.compile(re.escape(s).replace(r"\*", ".*"))
            files |= {f for f in code if pat.match(f)}
        elif os.path.isdir(os.path.join(ROOT, s)):
            files |= {f for f in code if f.startswith(s.rstrip("/") + "/")}
        elif os.path.isfile(os.path.join(ROOT, s)):
            files.add(s)
    for e in exclude or []:
        if any(ch in e for ch in "*?["):
            pat = re.compile(re.escape(e).replace(r"\*", ".*"))
            files = {f for f in files if not pat.match(f)}
        else:
            files.discard(e)
    return files


def measure(files):
    lines, classes = 0, {}
    for f in files:
        text = open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
        lines += len(text.split("\n"))   # register convention: counts a trailing empty line
        for name, pat in CLASSES:
            n = len(re.findall(pat, text))
            if n:
                classes[name] = classes.get(name, 0) + n
    return lines, classes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    code = legacy_code()
    parity = {r["id"]: r for r in json.load(open(PARITY, encoding="utf-8"))["capabilities"]}
    overlay = json.load(open(SCOPING, encoding="utf-8"))["rows"]
    targets = [k for k, v in overlay.items() if v.get("corpusScope") == "directory-unreconstructed"]
    missing_decision = [t for t in targets if t not in D]
    extra_decision = [k for k in D if k not in targets]

    rows = []
    for rid in sorted(targets):
        d = D.get(rid)
        r = parity[rid]
        if not d:
            rows.append({"row": rid, "disposition": "UNRESOLVED — FURTHER FEASIBLE WORK REQUIRED",
                         "why": "no decision recorded"})
            continue
        files = resolve(d.get("scope") or [], d.get("exclude"), code)
        lines, classes = measure(files)
        rows.append({
            "row": rid,
            "title": r["capability"],
            "classification": r["classification"],
            "disposition": d["disposition"],
            "published": {"paths": r["legacyPaths"], "files": r["legacyFiles"],
                          "lines": r["legacyLines"]},
            "reconstructed": {"paths": d.get("scope"), "files": sorted(files),
                              "fileCount": len(files), "lines": lines,
                              "classes": classes,
                              "regions": d.get("regions")},
            "excluded": d.get("exclude"),
            "rationale": d["why"],
            "missingEvidence": d.get("missing"),
            "modernAnchor": d.get("modern"),
            "modernPaths": r.get("modernPaths"),
            "endpoints": r.get("endpoints"),
            "backend": r.get("backend"),
            "delta": {"files": len(files) - (r["legacyFiles"] or 0),
                      "lines": lines - (r["legacyLines"] or 0)},
        })

    import collections
    tally = collections.Counter(x["disposition"] for x in rows)
    data = {
        "artifact": "m8d-row-reconstruction", "mandate": "M8D section 2",
        "generatedBy": "developer-review/tools/m8d-reconstruct-rows.py",
        "sourceRevision": REV,
        "method": ("Each of the 41 rows was read at source. A row is VERIFIED only when every file "
                   "in its declared corpus implements its own capability; CORRECTED when the corpus "
                   "contained another row's implementation; PARTIALLY RECONSTRUCTED when the "
                   "capability is a region of a shared file or extends beyond the measured corpus. "
                   "Line counts are splitlines() of the audit tree; class counts use the same "
                   "patterns as the register's generator."),
        "rowsInScope": len(targets), "decisionsRecorded": len(D),
        "missingDecision": missing_decision, "extraDecision": extra_decision,
        "tally": dict(tally), "rows": rows,
    }
    if a.json:
        print(json.dumps(data, indent=2))
        return 0
    print(f"41 rows in scope, {len(D)} decisions\n")
    for x in rows:
        d = x.get("delta") or {}
        print(f"{x['row']}  {x['disposition'][:34]:<34} {x['published']['files']:>3}f -> "
              f"{x['reconstructed']['fileCount']:>3}f   {x['published']['lines']:>6}L -> "
              f"{x['reconstructed']['lines']:>6}L  ({d.get('lines',0):+d})")
    print()
    for k, v in tally.most_common():
        print(f"  {k}: {v}")
    if missing_decision:
        print("MISSING DECISION:", missing_decision)
    if extra_decision:
        print("EXTRA DECISION:", extra_decision)
    return 0


if __name__ == "__main__":
    sys.exit(main())
