# DIR-087 — Candidate Page Inventory (Phase 1)

**Scope:** every candidate-facing surface in the IME365 Candidate Suite.
**Method:** the inventory was produced by enumerating the REAL router rather than trusting
the directive brief, then measuring each serving file with
`.bridge/evidence/dir087-metrics.mjs`.
**Reproduce:** `node .bridge/evidence/dir087-metrics.mjs` → `.bridge/evidence/dir087-metrics.json`

### The router is SPLIT ACROSS THREE FILES (read this first)

This is the single biggest trap in auditing this suite, and it is what caused my first draft
of this inventory to be wrong:

| File | Owns |
|---|---|
| `src/main.jsx` | public top-level routes (`/jobs/portal`, `/jobs/browse`, `/jobs/city/:slug`, …) |
| `src/components/Dashboard/DashboardMain/DashboardMain.jsx` | all `/dashboard/*` children (`plans`, `favorites`, `cover-letters`, `profile`, `security`, …) |
| `src/components/BuildResume/BuildResume.jsx` | the `/build-resume/*` step children |

An audit that reads only `main.jsx` **sees none of the dashboard routes**. My first pass did
exactly that, grepped for the relative `path="jobs/portal"` form, found nothing, and wrongly
concluded the job-portal routes did not exist. `tests/dir087-candidate-master-audit.test.mjs`
AC3 now pins all three files.

No figure in this document is hand-written. Every line count and class count is emitted by
that script so the Lead can re-derive it.

---

## 1. Route inventory (verified against the router)

| # | Module | Mounted route | Serving component | File | Lines |
|---|---|---|---|---|---|
| 1 | Overview | `/dashboard` | `DashboardHomepage` | `src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx` | 1942 |
| 2 | Resume Builder (shell) | `/build-resume` | `BuildResume` | `src/components/BuildResume/BuildResume.jsx` | 2710 |
| 3 | Cover Letters | `/dashboard/cover-letters` | `CoverLetter` | `src/components/CoverLetter/CoverLetter.jsx` | 1812 |
| 4 | Portfolios | `/dashboard/portfolios` | `DashboardPortfolios` | `src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx` | 548 |
| 5 | Job Tracker | `/dashboard/job-tracker` | `JobTracker` | `src/components/AppliedJobs/JobTracker.jsx` | 1075 |
| 6 | Applied Jobs | `/dashboard/applied-jobs` | `AppliedJobs` | `src/components/AppliedJobs/AppliedJobs.jsx` | 553 |
| 7 | Job Portal | `/dashboard/jobs/portal` | `MainJobListings` | `src/components/JobsListings/MainJobListings.jsx` | 873 |
| 8 | Job Search Bar | `/dashboard/jobs/browse` | `JobSearchBar` (child of `MainJobListings`) | `src/components/JobsListings/JobSearchBar.jsx` | 224 |
| 9 | AI Interview Coach | `/dashboard/interview` | `DashboardInterviews` | `src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx` | 3130 |
| 10 | Messages | `/dashboard/messages` | `MessagesModuleGate` → `DashboardMessages` | `src/components/Dashboard/DashboardMessages/DashboardMessages.jsx` | 675 |
| 11 | Settings & 2FA | `/dashboard/settings` | `DashboardSettings` | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` | 6171 |
| 12 | Support | `/dashboard/support` | `DashboardSupport` | `src/components/Dashboard/DashboardSupport/DashboardSupport.jsx` | 863 |
| 13 | Executive Rail | `/dashboard` (rail region) | `CandidateExecutiveRail` | `src/components/Candidate/CandidateExecutiveRail.jsx` | 91 |
| 14 | Portfolio Gallery | `/dashboard/portfolios` (gallery view) | `PortfolioGallery` | `src/components/PortfolioGallery/PortfolioGallery.jsx` | 239 |

### Resume Builder children (13 routes, not 10)

The brief says "all 10 steps". The router mounts **thirteen** children:

`""` (index → `HeadingStep`), `heading`, `work-history`, `education`, `skills`, `languages`,
`summary`, `projects`, `certifications`, `achievements`, `references`, `custom`, `review`.

That is **11 step components plus an index alias plus a review screen**. Auditing only the
ten named steps would have missed `custom` and `review`.

---

## 2. Corrections to the directive brief

Three discrepancies were found by reading the router. They matter because an audit that
probes the brief's URLs would record false 404s:

1. **The Job Portal paths are real, but they REDIRECT for a signed-in candidate.** My first
   draft of this inventory claimed `/jobs/portal` and `/jobs/browse` were not mounted. That
   was **wrong**, and `tests/dir087-candidate-master-audit.test.mjs` caught it: the routes
   exist at `src/main.jsx:594-598` as **absolute** paths (`path="/jobs/portal"`,
   `path="/jobs/portal/:jobId"`, `path="/jobs/browse"`, `path="/jobs/category/:catName"`) —
   my pattern only looked for the relative form the dashboard children use.
   The real behaviour is auth-aware dispatch:
   - **Guest** → `JobsPortalRoute` / `JobsBrowseRoute` render `MainJobListings` in place, so
     `/jobs/portal` is a genuine public job-browsing URL.
   - **Signed-in candidate** → the same components `<Navigate>` into the dashboard:
     `/jobs/portal/...` → `/dashboard/jobs/portal/...` (or `/dashboard/jobs`), and
     `/jobs/browse...` → `/dashboard/jobs...`.
   **Consequence for the audit:** both path families are valid. The candidate-facing URL is
   the dashboard one, and a crawler that probes `/jobs/portal` while signed in must follow
   the redirect rather than treat the arrival as the rendered page.
2. **There is no `DashboardPlans` module.** `/dashboard/plans` is served by the `Billing`
   component (`src/components/Billing`).
3. **Favorites is `DashboardFavourites`** (British spelling in the component, American in
   the route), and `/dashboard/profile` and `/dashboard/security` are **redirects** into
   Settings tabs — they are not pages, so they cannot be scored as pages.

Also redirected, and therefore excluded from scoring: `/dashboard/my-employments`,
`/dashboard/my-companies`, `/dashboard/job-matching`, `/dashboard/tickets`,
`/dashboard/help`.

---

## 3. Component groups

`AppliedJobs` · `Billing` · `BuildResume` · `Candidate` · `CoverLetter` · `Dashboard` ·
`JobsListings` · `PortfolioBuilder` · `PortfolioGallery` · `PortfolioTemplates` ·
`PublicPortfolio`

Note the brief names "14 candidate modules"; the source tree groups them across these
eleven directories, and the fourteen scored surfaces above are the page-level entries.

---

## 4. Frozen baseline (verified)

`src/cv-templates` contains exactly **55 template modules**: `cv1`…`cv51` (51) plus
`cover1`…`cover4` (4). This is the pinned freeze figure asserted by
`tests/dir063-docx-parity-and-print.test.mjs` and the DIR-068 manifest.

A raw file count returns 67 because each template directory holds several nested files; the
**module** count is 55. DIR-087 asserts diff 0 over those 55 modules plus the DIR-071
authorised `templateUtils.js`.
