# USER Dashboard — Complete Route & Deep Link Verification Matrix

**Audit Standard:** 100% Route Resolution, 0 Broken Pages, 0 Unexpected 404s, 0 Console Exceptions  
**Audited Target:** Local Development Bundle & Runtime Router (`react-router-dom`)

---

## 1. Primary Authenticated USER Routes

| Route URI | Protected by Guard? | Component Tree | Primary Data Requirement | Error Boundary Safe? | Resolution Status |
|---|---|---|---|---|---|
| `/dashboard` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardHomepage` | User Resumes, Stats, Favorites | Yes | **PASS (200 OK)** |
| `/dashboard/settings` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardSettings` | Profile Data, Account, 2FA, Logins | Yes | **PASS (200 OK)** |
| `/dashboard/settings?tab=Profile` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardSettings` | Sub-tab profile form | Yes | **PASS (200 OK)** |
| `/dashboard/settings?tab=Account` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardSettings` | 2FA status, password, security | Yes | **PASS (200 OK)** |
| `/dashboard/messages` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardMessages` | Conversations list, chat messages | Yes | **PASS (200 OK)** |
| `/dashboard/favorites` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardFavourites` | Favorite resumes / covers list | Yes | **PASS (200 OK)** |
| `/dashboard/interview` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardInterviews` | Role presets, saved exam history | Yes | **PASS (200 OK)** |
| `/dashboard/cover-letters` | `RequireAuthenticated` | `DashboardMain` $\to$ `CoverLetter` | Cover letter drafts | Yes | **PASS (200 OK)** |
| `/dashboard/portfolios` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardPortfolios` | Portfolio list & theme presets | Yes | **PASS (200 OK)** |
| `/dashboard/applied-jobs` | `RequireAuthenticated` | `DashboardMain` $\to$ `AppliedJobs` | Job applications list | Yes | **PASS (200 OK)** |
| `/dashboard/job-tracker` | `RequireAuthenticated` | `DashboardMain` $\to$ `JobTracker` | Kanban application stages | Yes | **PASS (200 OK)** |
| `/dashboard/job-matching` | `RequireAuthenticated` | `Navigate` $\to$ `/dashboard/job-tracker` | Canonical redirect | Yes | **PASS (Redirect)** |
| `/dashboard/my-employments` | `RequireAuthenticated` | `DashboardMain` $\to$ `EmployerDashboard` | Employer job listings (gated) | Yes | **PASS (200 OK)** |
| `/dashboard/my-companies` | `RequireAuthenticated` | `DashboardMain` $\to$ `CompaniesManagement` | Employer company profiles | Yes | **PASS (200 OK)** |
| `/dashboard/plans` | `RequireAuthenticated` | `DashboardMain` $\to$ `Billing` | Plan pricing & subscription status | Yes | **PASS (200 OK)** |
| `/dashboard/support` | `RequireAuthenticated` | `DashboardMain` $\to$ `DashboardSupport` | Support tickets list & thread | Yes | **PASS (200 OK)** |
| `/dashboard/tickets` | `RequireAuthenticated` | `Navigate` $\to$ `/dashboard/support` | Canonical alias redirect | Yes | **PASS (Redirect)** |
| `/dashboard/help` | `RequireAuthenticated` | `Navigate` $\to$ `/dashboard/support` | Canonical alias redirect | Yes | **PASS (Redirect)** |

---

## 2. Global USER-Accessible Workspaces & Deep Links

| Route URI | Protected by Guard? | Component Tree | Description | Resolution Status |
|---|---|---|---|---|
| `/build-resume/heading` | `RequireAuthenticated` | `AuthenticatedAppShell` $\to$ `BuildResume` | Resume Builder Step 1 (Contact info) | **PASS (200 OK)** |
| `/build-resume/work-experience` | `RequireAuthenticated` | `AuthenticatedAppShell` $\to$ `BuildResume` | Resume Builder Step 2 (Employment) | **PASS (200 OK)** |
| `/build-resume/education` | `RequireAuthenticated` | `AuthenticatedAppShell` $\to$ `BuildResume` | Resume Builder Step 3 (Education) | **PASS (200 OK)** |
| `/build-resume/skills` | `RequireAuthenticated` | `AuthenticatedAppShell` $\to$ `BuildResume` | Resume Builder Step 4 (AI Skills) | **PASS (200 OK)** |
| `/build-resume/summary` | `RequireAuthenticated` | `AuthenticatedAppShell` $\to$ `BuildResume` | Resume Builder Step 5 (AI Summary) | **PASS (200 OK)** |
| `/build-resume/finalize` | `RequireAuthenticated` | `AuthenticatedAppShell` $\to$ `BuildResume` | Resume Builder Finalize (51 Templates) | **PASS (200 OK)** |
| `/create-resume` | `RequireAuthenticated` | `AuthenticatedAppShell` $\to$ `BuildResume` | Builder alias | **PASS (200 OK)** |
| `/coverletter` | `RequireAuthenticated` | `CoverLetter` | Multi-step Cover Letter Builder | **PASS (200 OK)** |
| `/portfolio/builder` | `RequireAuthenticated` | `PortfolioBuilder` | Multi-Theme Portfolio Builder | **PASS (200 OK)** |
| `/portfolios` | None (Public) | `PortfolioGallery` | Public Showcase of Portfolios | **PASS (200 OK)** |
| `/portfolio/:slug` | None (Public) | `PublicPortfolio` | Public Web CV & Portfolio URL | **PASS (200 OK)** |
| `/shared/:resumeId` | None (Public) | `PublicResume` | Published Candidate Resume URL | **PASS (200 OK)** |
| `/export/Cv1/:id/:lang` | `RequireExportAccess` | `Exporter` (Cv1) | High-fidelity Export Renderer | **PASS (200 OK)** |
| `/export/Cv51/:id/:lang` | `RequireExportAccess` | `Exporter` (Cv51) | Europass Modern Export Renderer | **PASS (200 OK)** |
| `/jobs/portal` | None (Public) | `MainJobListings` | Searchable Job Postings Directory | **PASS (200 OK)** |
| `/blog` | None (Public) | `BlogList` | Career Resources & Articles | **PASS (200 OK)** |
| `/p/terms-of-service` | None (Public) | `CustomePage` | Terms of Service Page | **PASS (200 OK)** |

---

## 3. Negative & Unauthenticated Route Redirection Tests

| Attempted Route | Initial Auth State | Expected Outcome | Actual Runtime Outcome | Status |
|---|---|---|---|---|
| `/dashboard` | Unauthenticated | Redirect $\to$ `/login?next=%2Fdashboard` | Redirects to `/login` with clean post-login target | **PASS** |
| `/dashboard/settings` | Unauthenticated | Redirect $\to$ `/login?next=%2Fdashboard%2Fsettings` | Redirects to `/login` | **PASS** |
| `/dashboard/support` | Unauthenticated | Redirect $\to$ `/login?next=%2Fdashboard%2Fsupport` | Redirects to `/login` | **PASS** |
| `/build-resume/heading` | Unauthenticated | Redirect $\to$ `/login?next=%2Fbuild-resume%2Fheading` | Redirects to `/login` | **PASS** |
| `/adm/dashboard` | Candidate `USER` | Denied / Redirect to Home / 403 Console Gate | Admin shell blocks non-admin claims | **PASS** |
| `/nonexistent-route-xyz` | Candidate `USER` | 404 Not Found Screen with "Return home" link | Renders `<NotFound />` component without crash | **PASS** |
