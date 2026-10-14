# CANDIDATE_DASHBOARD_PAGES.md
## Comprehensive Master Inventory of All Candidate Workspace Surfaces & Routes

**Authority:** Lead Architecture & Technical Governance (Antigravity)  
**Project:** IME365 — Candidate Workspace Suite  
**Generated Date:** 2026-10-14  
**Router Anchors:** `src/main.jsx`, `src/components/Dashboard/DashboardMain/DashboardMain.jsx`, `src/components/BuildResume/BuildResume.jsx`  

---

### 1. Architectural Overview & Router Topology

The Candidate Portal routing is split across three distinct router levels:
1. **Top-Level Application Router (`src/main.jsx`)**: Mounts top-level namespaces (`/dashboard/*`, `/build-resume/*`, `/portfolio/*`, `/shared/*`, `/export/*`), guest routes, and authentication guards.
2. **Dashboard Sub-Router (`src/components/Dashboard/DashboardMain/DashboardMain.jsx`)**: Mounts 31 route declarations (including redirects and wildcard) in the candidate workspace table rendered inside `<CubaCandidateShell>`.
3. **Resume Builder Sub-Router (`src/components/BuildResume/BuildResume.jsx`)**: Mounts the 12 candidate step routes and review/export studio.

---

### 2. Core Candidate Dashboard Pages (Mounted under `/dashboard/*`)

| # | Page / Feature Name | Mounted URL Route | Serving Component | Exact Source File |
|:---:|:---|:---|:---|:---|
| **1** | **Candidate Cockpit / Overview** | `/dashboard` | `<DashboardHomepage>` | `src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx` |
| **2** | **Resumes & Master CV Workspace Hub** | `/dashboard/resumes` | `<DashboardResumes>` | `src/components/Dashboard/DashboardResumes/DashboardResumes.jsx` (DIR-003 / CAND-001, lazy import in DashboardMain.jsx) |
| **3** | **Cover Letters Hub** | `/dashboard/cover-letters` | `<CoverLetter>` | `src/components/CoverLetter/CoverLetter.jsx` |
| **4** | **Portfolios & Web CV** | `/dashboard/portfolios` | `<DashboardPortfolios>` | `src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx` |
| **5** | **Saved Favorites & Bookmarks** | `/dashboard/favorites` | `<DashboardFavourites>` | `src/components/Dashboard/DashboardFavourites/DashboardFavourites.jsx` |
| **6** | **Notifications Hub** | `/dashboard/notifications` | `<DashboardNotifications>` | `src/components/Dashboard/DashboardNotifications/DashboardNotifications.jsx` |
| **7** | **Browse Job Portal (Main)** | `/dashboard/jobs` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **8** | **Job Listings Portal** | `/dashboard/jobs/portal` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **9** | **Single Job Detail View** | `/dashboard/jobs/portal/:jobId` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **10** | **Job Search & Filter Browser** | `/dashboard/jobs/browse` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **11** | **Job Category Listing** | `/dashboard/jobs/category/:catName` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **12** | **Job Tracker (Kanban Pipeline)** | `/dashboard/job-tracker` | `<JobTracker>` | `src/components/AppliedJobs/JobTracker.jsx` |
| **13** | **Submitted Applications** | `/dashboard/applied-jobs` | `<AppliedJobs>` | `src/components/AppliedJobs/AppliedJobs.jsx` |
| **14** | **AI Interview Coach & CBT Simulator** | `/dashboard/interview` | `<DashboardInterviews>` | `src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx` |
| **15** | **Messages & Recruiter Chat** | `/dashboard/messages` | `<DashboardMessages>` | `src/components/Dashboard/DashboardMessages/DashboardMessages.jsx` |
| **16** | **Subscription, Quotas & Plans** | `/dashboard/plans` | `<Billing>` | `src/components/Billing/Plans/Plans.jsx` |
| **17** | **Settings & Master Configuration** | `/dashboard/settings` | `<DashboardSettings>` | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` |
| **18** | **Master Profile Data (Tab View)** | `/dashboard/settings?tab=Profile` | `<DashboardSettings>` | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` |
| **19** | **Security & 2FA Hub (Tab View)** | `/dashboard/settings?tab=Security` | `<DashboardSettings>` | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` |
| **20** | **Help Desk & Support Center** | `/dashboard/support` | `<DashboardSupport>` | `src/components/Dashboard/DashboardSupport/DashboardSupport.jsx` |
| **21** | **Candidate Design System Showcase** | `/dashboard/design-system` | `<DesignSystemShowcase>` | `src/components/cuba/DesignSystemShowcase.jsx` (lazy import in DashboardMain.jsx) |

---

### 3. Resume Builder Master Studio & 12 Step Pages (`/build-resume/*`)

All mounted within the authenticated candidate workspace via `src/components/BuildResume/BuildResume.jsx`:

| # | Builder Step / Screen | URL Route Path | Serving Sub-Component | Purpose & Data Surface |
|:---:|:---|:---|:---|:---|
| **22** | **Builder Index / Root** | `/build-resume` | `<HeadingStep>` | Default landing route for active resume editing. |
| **23** | **Step 1: Contact & Heading** | `/build-resume/heading` | `<HeadingStep>` | Full name, target role, email, phone, location, photo upload. |
| **24** | **Step 2: Work History** | `/build-resume/work-history` | `<WorkHistoryStep>` | Employment timeline, bullet points, AI bullet enhancement. |
| **25** | **Step 3: Education** | `/build-resume/education` | `<EducationStep>` | Degrees, institutions, GPA, graduation dates, coursework. |
| **26** | **Step 4: Skills & Competencies** | `/build-resume/skills` | `<SkillsStep>` | Technical & soft skills with automated deduplication engine. |
| **27** | **Step 5: Projects** | `/build-resume/projects` | `<ProjectsStep>` | Portfolio projects, tech stacks, repository and live URLs. |
| **28** | **Step 6: Certifications** | `/build-resume/certifications` | `<CertificationsStep>` | Professional certifications and credentials. |
| **29** | **Step 7: Languages** | `/build-resume/languages` | `<LanguagesStep>` | Spoken languages and proficiency. |
| **30** | **Step 8: Executive Summary** | `/build-resume/summary` | `<SummaryStep>` | Evidence-grounded summary and AI assistance. |
| **31** | **Step 9: Achievements** | `/build-resume/achievements` | `<AchievementsStep>` | Industry awards, honors, key milestones, publications. |
| **32** | **Step 10: References** | `/build-resume/references` | `<ReferencesStep>` | Professional reference contacts and endorsements. |
| **33** | **Step 11: Custom Sections** | `/build-resume/custom` | `<CustomSectionsStep>` | User-defined flexible content sections and custom headers. |
| **34** | **Step 12: Review & Template Hub** | `/build-resume/review` | `<ReviewStep>` | Comprehensive preview, ATS scorecard, 51-template switcher, PDF/DOCX downloads. |

---

### 4. Dedicated Candidate Creation & Public Sharing Surfaces

| # | Surface Name | URL Route Path | Serving Component | Purpose |
|:---:|:---|:---|:---|:---|
| **35** | **Portfolio Builder Studio** | `/portfolio/builder` | `<PortfolioBuilder>` | Standalone interactive web-portfolio designer. |
| **36** | **Public Live Candidate Portfolio** | `/portfolio/:slug` | `<PublicPortfolio>` | Public-facing responsive web portfolio for employers. |
| **37** | **Candidate Portfolio Gallery** | `/portfolios` | `<PortfolioGallery>` | Searchable gallery of candidate web portfolios. |
| **38** | **Public Shared Candidate Resume** | `/shared/:resumeId` | `<PublicResume>` | Direct shareable read-only link for a specific resume. |

---

### 5. Candidate High-Fidelity Export & Print Preview Surfaces

Mounted under `/export/` for dynamic rendering and high-fidelity PDF/print generation:

| # | Route Pattern | Total Modules | Description |
|:---:|:---|:---:|:---|
| **39–89** | `/export/Cv1/:resumeId/:language` through `/export/Cv51/:resumeId/:language` | **51 Pages** | High-fidelity print/export renderers for all 51 CV template variants (`Cv1` through `Cv51` in `src/cv-templates/`). |
| **90–93** | `/export/Cover1/:resumeId/:language` through `/export/Cover4/:resumeId/:language` | **4 Pages** | High-fidelity print/export renderers for all 4 Cover Letter templates (`Cover1` through `Cover4`). |

---

### 6. Candidate Aliases & Automatic Redirections

These routes exist in the router to automatically redirect older bookmarks or alternate paths directly into the maintained candidate workspace:

| Original URL Path | Redirects To Canonical Path | Description |
|:---|:---|:---|
| `/dashboard/profile` | `/dashboard/settings?tab=profile` | Profile edit tab |
| `/dashboard/security` | `/dashboard/settings?tab=security` | 2FA and Security tab |
| `/dashboard/account` | `/dashboard/settings` | General account settings |
| `/dashboard/billing` | `/dashboard/plans` | Candidate subscriptions & quotas |
| `/dashboard/my-resumes` | `/dashboard/resumes` | Resumes & Master CV workspace hub |
| `/dashboard/cv` | `/dashboard/cover-letters` | Cover letters hub |
| `/dashboard/job-matching` | `/dashboard/job-tracker` | Candidate job tracker pipeline |
| `/dashboard/tickets` | `/dashboard/support` | Support ticketing center |
| `/dashboard/help` | `/dashboard/support` | Help desk |
| `/resume-builder` & `/resume-builder/*` | `/build-resume` | Canonical Resume Builder |
| `/create-resume` & `/create-resume/*` | Renders `BuildResume` directly | Authenticated legacy mount, **not a redirect**; step links may change the namespace |
| `/resume/:step` | `/build-resume/heading` | Step alias redirect |
| `/resumes` & `/resumes/*` | `/dashboard/resumes` | Resumes & Master CV workspace hub |
| `/dashboard2` & `/dashboard2/*` | `/dashboard` | Legacy dashboard redirect |
| `/dashboard/my-employments` | `/employer/jobs` | Role-switching redirect |
| `/dashboard/my-companies` | `/employer/company` | Role-switching redirect |

---

### 7. Candidate Navigation Groups (`src/components/cuba/candidateNavigation.js`)

The Cuba candidate shell organizes these destinations into three primary groups in the sidebar:
1. **Workspace**: Overview (`/dashboard`), Resumes & Master CV (`/dashboard/resumes`, with the `/build-resume` builder alias for active-state resolution), Cover Letters (`/dashboard/cover-letters`), Portfolios (`/dashboard/portfolios`), Saved Favorites (`/dashboard/favorites`), Notifications (`/dashboard/notifications`).
2. **Job Intelligence**: Browse Jobs (`/dashboard/jobs`), Job Tracker (`/dashboard/job-tracker`), Submitted Applications (`/dashboard/applied-jobs`), AI Interview Coach (`/dashboard/interview`), Messages & Chat (`/dashboard/messages`).
3. **Account & Security**: Subscription & Plans (`/dashboard/plans`), Master Profile Data (`/dashboard/settings?tab=Profile`), Security & 2FA Hub (`/dashboard/settings?tab=Security`), Support (`/dashboard/support`).

## 2026-10-14 source reconciliation (supersedes historical verification wording)

The supplied “92” denominator is stale: this checked-out file had **93** numbered entries before edits (21 dashboard states including design-system, 13 builder states, 4 portfolio/sharing surfaces, 55 exports). These are not 93 unique route declarations. Source census: **113 main + 31 dashboard + 13 builder = 157 route declarations**, expanding the two export maps and including public/other-role boundaries. See [complete route/source/guard/navigation census](docs/candidate-audit/ROUTE_CENSUS.md) and its JSON; regenerate with `npm run audit:candidate:inventory`.

Confirmed discrepancies corrected: dashboard declaration count, Plans source path, Projects/Certifications/Languages/Summary step order, and `/create-resume` being a direct authenticated mount rather than a redirect. Query casing is normalized by DashboardSettings, not a defect. `Security` maps to the Account pane and scrolls to TOTP.

Additional shared candidate entry points absent from the 93-entry list: `/login`, `/sign-up`, `/coverletter/*`, `/cover-letter/*`, `/pricing`, `/billing/plans`, `/contact`, public `/jobs*`, `/blog*`, authenticated `/blog-editor*`, custom `/p/:custompage`, and legal/help aliases. These appear individually in the census; candidate access is not proof of role permission on all of them. Main authentication guard checks session; backend resource ownership remains mandatory. Export guard permits an authenticated session OR a single-use render-token fragment, with validation performed by the backend.

Material non-route states requiring separate assessment: profile `subtab`/`section`/`step`, Account/Security/TOTP, reset/verification/OAuth query and fragment flows in main.jsx, resume import/sync/template picker/preview, interview CBT/live modes, job detail/apply dialogs, support create/reply, plans checkout and consent dialogs. `MessagesModuleGate` is a real feature boundary; Cuba/legacy shell paths are conditional. Design-system has no primary navigation item (developer surface). Dashboard wildcard redirects to overview; builder's unknown-step behaviour still needs a browser test.

**Current verification:** notification component tested with simulated HTTP; all 55 template variants tested through the real renderer with fixtures. Protected route entry/refresh, real authentication, tab/modal census completeness, live CRUD and download endpoints remain **unverified**. Historical “certified” wording is not fresh evidence.
