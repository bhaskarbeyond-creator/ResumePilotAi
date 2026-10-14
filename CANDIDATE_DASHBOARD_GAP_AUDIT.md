# CANDIDATE_DASHBOARD_GAP_AUDIT.md
## Independent Architectural & UX Gap Audit Across Entire Candidate Dashboard

**Author:** Antigravity (Executive Engineering Lead & Principal Systems Architect)  
**Project:** IME365 — Candidate Workspace Suite  
**Date:** 2026-10-14  
**Audit Scope:** All 33 Candidate Pages, 12 Builder Steps, Sidebar Navigation, Command Palette, Cross-Feature Workflows, and Data Pipelines.

---

### Executive Summary

Following the discovery of the **"Resumes & Master CV" Routing Trap** (where clicking the sidebar menu bypassed existing saved resumes and directly initialized new draft records inside `/build-resume`), an independent, comprehensive audit was conducted across the **entire Candidate Dashboard architecture**.

The audit inspected all components in `src/components/Dashboard/`, `src/components/Candidate/`, `src/components/JobsListings/`, `src/components/CoverLetter/`, `src/components/BuildResume/`, `src/components/cuba/`, and the client router table in `src/main.jsx` and `DashboardMain.jsx`.

A total of **11 structural gaps** were identified across 4 critical failure domains:
1. **Routing Traps & Premature Form Initializers** (3 Gaps)
2. **Cross-Feature Asset & Data Pipeline Disconnects** (3 Gaps)
3. **Workflow Dead-Ends & Missing Subsystem Bridges** (3 Gaps)
4. **Information Architecture & Layout Asymmetries** (2 Gaps)

---

### Matrix of Identified Candidate Dashboard Gaps

| # | Gap ID | Feature Area | Severity | Root Cause & Failure Mechanism | User Impact | Required Remediation |
|:---:|:---|:---|:---:|:---|:---|:---|
| **1** | **GAP-CAND-01** | **Resumes & Master CV** | **P1 (Critical)** | `candidateNavigation.js:23` links `resumes` to `/build-resume`, which unconditionally calls `createResumeDraft()` in `BuildResume.jsx:1622` when no draft ID is selected. | Candidates cannot view or manage existing resumes; clicking the nav creates duplicate empty draft records. | Mount dedicated `/dashboard/resumes` (`CandidateResumesHub.jsx`) with full CRUD, preview, templates, and ATS scores *(In Flight: DIR-003)*. |
| **2** | **GAP-CAND-02** | **Resume Builder Breadcrumbs** | **P2 (High)** | In `BuildResume.jsx:1836-1842`, `Dashboard`, `Resumes & Master CV`, and `Build Resume` breadcrumbs ALL point to `/dashboard`. | Clicking "Build Resume" or "Resumes & Master CV" dumps the user back onto the overview cockpit. | Update breadcrumb targets: `Dashboard` $\rightarrow$ `/dashboard`, `Resumes & Master CV` $\rightarrow$ `/dashboard/resumes`, and make `Build Resume` non-navigating text or `/build-resume/heading`. Update `handleExitBuilder` to return to `/dashboard/resumes`. |
| **3** | **GAP-CAND-03** | **Notification Deep-Link Routing** | **P2 (High)** | In `src/components/cuba/resolveNotificationHref.js:89`, `resume_published` maps to `CANDIDATE_ROUTES.portfolios`. | Candidates clicking a "Resume Published" notification land in the Portfolios gallery instead of their resumes. | Add `resumes: '/dashboard/resumes'` to `CANDIDATE_ROUTES` and map `resume_published: CANDIDATE_ROUTES.resumes`. |
| **4** | **GAP-CAND-04** | **Job Application Cover Letter Selection** | **P1 (Critical)** | `JobApplicationModal.jsx:226-260` offers a rich Resume Selector from `getResumes()`, but `coverLetter` is ONLY a blank text area with AI Quick Pitch. | Candidates spend time crafting cover letters in `/dashboard/cover-letters`, but CANNOT select or attach them when applying to jobs. | Add a Cover Letter Selector in `JobApplicationModal.jsx` backed by `getUserCoverLetters(user.uid)`. |
| **5** | **GAP-CAND-05** | **Job Portal vs. Kanban Board Asynchrony** | **P2 (High)** | `JobApplicationModal.jsx:662` submits to `/api/applications` (`AppliedJobs`), but does NOT create a card in `JobTracker` (`/dashboard/job-tracker`). | Candidate applies for 5 jobs on the portal, navigates to "Job Tracker", and sees an empty Kanban board unless they manually click "Track in Kanban" on every row in `/dashboard/applied-jobs`. | Auto-populate or offer an "Add to Kanban Tracker" checkbox upon job application submission. |
| **6** | **GAP-CAND-06** | **Job Tracker to AI Interview Coach Bridge** | **P2 (High)** | `JobTracker.jsx:88-120` has an "Interview Scheduled" column, but only offers date-picking and .ics export. `DashboardInterviews.jsx` does not read URL search params. | Candidates cannot 1-click launch an AI mock interview tailored to a job they are actively interviewing for. | Add URL query parameter ingestion (`?role=...&company=...`) in `DashboardInterviews.jsx` and add a "Practice with AI Coach" action on Job Tracker interview cards. |
| **7** | **GAP-CAND-07** | **Master Profile Data vs. Master CV Disconnect** | **P2 (High)** | `/dashboard/settings?tab=Profile` maintains 9 rich profile sections, but there is no 1-click "Generate / Sync Master CV" action. | Profile data remains trapped in Settings without an authoritative, visually designated "Master CV" document. | Add a 1-click "Generate Master CV" action in `DashboardSettings.jsx` that creates/syncs a designated "Master CV" in `/dashboard/resumes`. |
| **8** | **GAP-CAND-08** | **Active Navigation State for Sub-routes** | **P3 (Medium)** | `navigationState.js:33-35` resolves active sidebar item by exact match or longest prefix. Once `resumes.to` changes to `/dashboard/resumes`, `/build-resume/*` has no matching ancestor. | When a candidate is actively building or editing a resume, the sidebar loses its active highlight state. | Add route aliases (`aliases: ['/build-resume']`) to `candidateNavigation.js` and extend `navigationState.js` to match item aliases. |
| **9** | **GAP-CAND-09** | **Job Listings to Recruiter Messages Bridge** | **P3 (Medium)** | `MainJobListings.jsx` and `JobDetailsModal.jsx` have no "Message Employer" action, and `DashboardMessages.jsx` has no "Start New Conversation" action. | The messaging system is entirely passive; candidates cannot inquire about a job posting. | Add a contextual "Contact Recruiter" or "Inquire" button on job postings where recruiter identity is present. |
| **10** | **GAP-CAND-10** | **Cover Letters Hub Layout Stack Trap** | **P3 (Medium)** | `CoverLetter.jsx` renders the entire 1,600-line creation form at the top, pushing the saved letters gallery to line 1672. | Candidates with 5-10 saved letters must scroll through a massive creation form just to see, preview, or download their existing letters. | Provide a tabbed toggle: "Saved Letters Gallery" vs "Create / Edit Letter", mirroring `/dashboard/portfolios`. |
| **11** | **GAP-CAND-11** | **Saved Favorites "Portfolios" Mismatch** | **P3 (Medium)** | `DashboardFavourites.jsx:235` empty action for the "Documents" tab links to `/dashboard/portfolios`, but favorites only store resumes and cover letters. | Empty state guides candidates to a surface that cannot be favorited. | Change the empty action on the Documents tab to "View Resumes" (`/dashboard/resumes`). |

---

### Deep-Dive Analysis of Primary Gaps

#### 1. GAP-CAND-01: "Resumes & Master CV" Direct-to-Wizard Trap
- **Files Touched:** `src/components/cuba/candidateNavigation.js:23`, `src/components/BuildResume/BuildResume.jsx:1622`, `src/main.jsx:322`
- **Technical Analysis:**
  The Cuba candidate navigation registered `{ id: 'resumes', label: 'Resumes & Master CV', to: '/build-resume' }`.
  In `BuildResume.jsx`, the initialization effect checked `localStorage.getItem('currentResumeId')`. When a user clicked the sidebar menu, no resume was selected, so `BuildResume` executed:
  ```javascript
  const created = await createResumeDraft(userId, initial);
  applyLoaded(created.data, created.id, created.revision, false);
  ```
  This immediately wrote a new draft to MariaDB and dropped the user into Step 1 (`/build-resume/heading`). The user had no dedicated dashboard workspace to view their collection of resumes, see ATS scores, duplicate, export, or delete drafts.
- **Status:** **DIR-003** actively under implementation by Cline.

---

#### 2. GAP-CAND-02: Triple Dashboard Breadcrumb Loop in BuildResume
- **Files Touched:** `src/components/BuildResume/BuildResume.jsx:1836-1842`
- **Technical Analysis:**
  The breadcrumb trail inside the builder header is rendered as:
  ```jsx
  <nav aria-label="Resume builder breadcrumb">
      <Link to="/dashboard" onClick={handleBreadcrumbNavigate}>Dashboard</Link>
      <Link to="/dashboard" onClick={handleBreadcrumbNavigate}>Resumes &amp; Master CV</Link>
      <Link to="/dashboard" onClick={handleBreadcrumbNavigate}>Build Resume</Link>
      <span>{resumeTitle}</span>
  </nav>
  ```
  Every single link targets `/dashboard`! A candidate clicking "Build Resume" to reset their view or "Resumes & Master CV" to view their document library is immediately thrown back to the homepage.
- **Required Action:** Link `Resumes & Master CV` to `/dashboard/resumes`, and make `Build Resume` link to `/build-resume/heading` (or render as non-interactive step separator).

---

#### 3. GAP-CAND-03: `resume_published` Notification Routes to Portfolios
- **Files Touched:** `src/components/cuba/resolveNotificationHref.js:88-89`
- **Technical Analysis:**
  ```javascript
  portfolio_published: CANDIDATE_ROUTES.portfolios,
  resume_published: CANDIDATE_ROUTES.portfolios, // <-- DEFECT
  ```
  Because `/dashboard/resumes` did not exist previously, the notification resolver routed `resume_published` to `portfolios`. When candidates receive an alert that their resume has been published or updated, clicking it routes them to `/dashboard/portfolios`.
- **Required Action:** Point `resume_published` to `CANDIDATE_ROUTES.resumes` (`/dashboard/resumes`).

---

#### 4. GAP-CAND-04: Disconnected Cover Letters in Job Applications
- **Files Touched:** `src/components/JobsListings/JobApplicationModal.jsx:226-260`, `JobApplicationModal.jsx:917-955`
- **Technical Analysis:**
  The platform provides a dedicated Cover Letters workspace (`/dashboard/cover-letters`) where candidates can tailor and save letters. However, inside `JobApplicationModal.jsx`:
  - `userResumes` is fetched via `getResumes()` and candidates can pick from a visual grid/list modal.
  - `coverLetter` is ONLY an empty rich text input (`applicationData.coverLetter`).
  - There is zero invocation of `getUserCoverLetters()`!
  Candidates cannot select an existing cover letter they already wrote for this position or company.
- **Required Action:** Import `getUserCoverLetters`, add a "Select Saved Cover Letter" button next to "Quick Pitch", allowing candidates to populate the editor from their saved letters.

---

#### 5. GAP-CAND-05: Missing Auto-Sync Between Applied Jobs & Kanban Tracker
- **Files Touched:** `src/components/JobsListings/JobApplicationModal.jsx:662-666`, `src/components/AppliedJobs/AppliedJobs.jsx:180-200`, `src/components/AppliedJobs/JobTracker.jsx`
- **Technical Analysis:**
  When applying to a job via `JobApplicationModal`, `submitJobApplication(accountUid, targetJobId, data)` inserts a record into the `applications` table.
  `AppliedJobs.jsx` renders this list. But the Kanban `JobTracker.jsx` reads from the `tracked_jobs` table.
  Currently, an application is ONLY added to `tracked_jobs` if the candidate navigates to `/dashboard/applied-jobs` and manually clicks `handleTrackInKanban`.
  Candidates who apply to jobs and immediately open their "Job Tracker" find a blank Kanban board.
- **Required Action:** When `submitJobApplication` succeeds, automatically invoke `createTrackedJob(accountUid, { title, company, location, salary, status: 'applied', jobId })` so the Kanban board immediately reflects live applications.

---

#### 6. GAP-CAND-06: Job Tracker Cannot Launch AI Mock Interview Coach
- **Files Touched:** `src/components/AppliedJobs/JobTracker.jsx:88-120`, `src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx:66-99`
- **Technical Analysis:**
  In `JobTracker.jsx`, cards in the "Interview" stage offer:
  - "Schedule interview"
  - "Export to calendar (.ics)"
  - "View linked cover letter"
  There is NO "Practice in AI Interview Coach" option!
  Furthermore, `DashboardInterviews.jsx` does not use `useSearchParams` or `useLocation` — it has no URL query parameter ingestion.
- **Required Action:**
  1. Update `DashboardInterviews.jsx` to parse `role`, `company`, and `jobId` from URL search parameters and pre-populate the setup form.
  2. Add "Practice Interview with AI" in `JobTracker.jsx` quick-action menu linking to `/dashboard/interview?role=${encodeURIComponent(job.title)}&company=${encodeURIComponent(job.company)}`.

---

#### 7. GAP-CAND-07: Master Profile Data vs. Master CV Disconnect
- **Files Touched:** `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx`, `candidateNavigation.js:59`
- **Technical Analysis:**
  Candidates invest significant effort filling out their **Master Profile Data** (`/dashboard/settings?tab=Profile`) across 9 tabs (Basic, Experience, Education, Skills, Languages, Summary, Projects, Certifications, Achievements).
  However, this profile data is trapped inside Settings. There is no:
  - "Export to Master CV"
  - "Sync with Primary Resume"
  - Visual indicator showing which resume represents the authoritative Master CV.
- **Required Action:** Add a prominent "Generate / Update Master CV" action card at the top of `/dashboard/settings?tab=Profile` that commits the profile facts into a designated Master CV in `/dashboard/resumes`.

---

### Prioritized Remediation Roadmap

```
[Phase 1: In Flight] DIR-003
  └── Mount /dashboard/resumes (CandidateResumesHub.jsx)
  └── Wire sidebar navigation & command palette
  └── Route aliases for /build-resume

[Phase 2: Immediate Next Directive - DIR-004]
  ├── GAP-CAND-02: Fix BuildResume breadcrumb loops & handleExitBuilder target
  ├── GAP-CAND-03: Fix resolveNotificationHref resume_published -> /dashboard/resumes
  └── GAP-CAND-11: Fix DashboardFavourites Documents empty state link

[Phase 3: Cross-Module Integration - DIR-005]
  ├── GAP-CAND-04: Saved Cover Letter picker in JobApplicationModal
  ├── GAP-CAND-05: Auto-sync portal job applications to Kanban JobTracker
  └── GAP-CAND-06: Deep-link Job Tracker & Applied Jobs into AI Interview Coach

[Phase 4: Master CV Alignment - DIR-006]
  ├── GAP-CAND-07: Master Profile Data -> 1-Click Master CV generation
  └── GAP-CAND-10: Cover Letters Hub view toggle (Gallery vs Editor)
```
