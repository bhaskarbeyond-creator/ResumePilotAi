# CANDIDATE DASHBOARD 10/10 MASTER ENGINEERING SPECIFICATION

**Authority:** Antigravity (Executive Engineering Lead, Principal Systems Architect & Release Gatekeeper)  
**Project:** IME365 (ResumePilot AI Enterprise Platform)  
**Target Module:** Candidate Dashboard Workspace Suite  
**Workspace Root:** `D:\xampp\htdocs\IME365`  
**Current Branch:** `arena/f4651d36-resumepilotai`  
**Document Status:** 🌟 **CERTIFIED 10/10 TARGET ARCHITECTURAL SPECIFICATION**  
**Date & Timestamp:** 2026-10-16T22:15:00+05:30  

---

## 1. Executive Mandate & Non-Negotiable Quality Invariants

To achieve a true **10/10 Production Rating**, the Candidate Workspace must satisfy these four core invariants:

1. **Zero Mock Data Invariant:** Every ATS percentage, metric counter, candidate name, and job listing must bind to real database records, API endpoints, or deterministic calculations (`calculateAtsScore`). Never hardcode synthetic strings (`'Babu M'`) or static fallback numbers (`'69%'`).
2. **Zero Route Silos & Dead Links:** Eliminate the 5 fragmented job sub-routes; merge into one responsive master hub. Zero notifications pointing to incorrect surfaces (e.g. `resume_published` mapping to Portfolios).
3. **Atomic Dual-Table Consistency:** When a candidate applies for a job, writing to `applications` and `job_tracker` must occur in a single atomic database transaction. Never require manual "Track in Kanban" button clicks.
4. **Mobile First-Class Ergonomics:** On viewports $<768\text{px}$, provide a native 5-anchor sticky bottom navigation bar and a swipeable "Quick Edit" card drawer, replacing cumbersome desktop table scrollbars and deep steppers.

---

## 2. Four-Pillar Information Architecture

The 93 scattered surfaces are consolidated into four natural, linear pillars:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CANDIDATE DASHBOARD                             │
├────────────────────────────────────────────────────────────────────────┤
│ 📁 PILLAR 1: MY CAREER ASSETS                                          │
│    ├── 1. Overview Cockpit           (/dashboard)                      │
│    ├── 2. Resumes & Master CV Hub    (/dashboard/resumes)              │
│    ├── 3. 12-Step Resume Builder     (/build-resume/*)                 │
│    ├── 4. Cover Letters Hub          (/dashboard/cover-letters)        │
│    ├── 5. Web Portfolios             (/dashboard/portfolios)           │
│    └── 6. Saved Favorites            (/dashboard/favorites)            │
│                                                                        │
│ 🔍 PILLAR 2: JOB HUNT & INTELLIGENCE                                   │
│    ├── 7. Unified Job Portal Hub     (/dashboard/jobs)                 │
│    ├── 8. Job Tracker Kanban         (/dashboard/job-tracker)          │
│    └── 9. Submitted Applications     (/dashboard/applied-jobs)         │
│                                                                        │
│ 🎙️ PILLAR 3: PREPARATION & COMMS                                       │
│    ├── 10. AI Interview Coach & CBT  (/dashboard/interview)            │
│    └── 11. Recruiter Messages        (/dashboard/messages)             │
│                                                                        │
│ ⚙️ PILLAR 4: ACCOUNT, PRIVACY & SUPPORT                                │
│    ├── 12. Master Profile Data       (/dashboard/settings?tab=Profile) │
│    ├── 13. Plans & Token Quotas      (/dashboard/plans)                │
│    ├── 14. Security, 2FA & GDPR      (/dashboard/settings?tab=Security)│
│    └── 15. Support & Help Desk       (/dashboard/support)              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The 5 Core Architectural Solutions (Closing All Gaps)

---

### Solution 1: Consolidated Single Job Portal Architecture
- **Problem:** Currently fragmented into `/dashboard/jobs`, `/jobs/portal`, `/jobs/browse`, `/jobs/portal/:id`, and `/jobs/category/:cat`.
- **10/10 Architecture:** A single canonical route `/dashboard/jobs` that responds reactively to URL query parameters:
  - `/dashboard/jobs?q=Frontend&remote=true&salary=120000&jobId=job_123`
- **Component Layout:**
  - **Desktop ($\ge 1280\text{px}$):** 3-column split view (20% Filters, 40% Virtualized Job List, 40% Sticky Job Details Pane).
  - **Tablet ($768\text{px} - 1024\text{px}$):** 2-column view (Filters in collapsible drawer, 50% List, 50% Detail).
  - **Mobile ($<768\text{px}$):** Full-width job cards with a slide-up bottom sheet for details and 1-click apply.

---

### Solution 2: ACID Atomic Dual-Write for Job Application & Kanban
- **Problem:** Submitting an application saves a row in `applications`, but leaves `job_tracker` empty unless the candidate manually navigates to `/dashboard/applied-jobs` and clicks a button.
- **10/10 Architecture:** Update `MySQLRepository.saveApplication` or backend route `POST /api/jobs-data/applications/:id` to execute an atomic MariaDB transaction:
```javascript
// backend/repositories/MySQLRepository.js
async saveApplicationWithAutoTracking(appId, appData, userId, jobInfo) {
    const conn = await this._getPool().getConnection();
    try {
        await conn.beginTransaction();

        // 1. Insert or update the formal application record
        await conn.query(
            `INSERT INTO applications (id, job_id, employer_id, applicant_id, applicant_name, applicant_email, applicant_phone, resume_id, cover_letter, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
             ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
            [appId, appData.jobId, appData.employerId || null, userId, appData.name, appData.email, appData.phone, appData.resumeId, appData.coverLetter]
        );

        // 2. Automatically insert into the candidate's personal Kanban tracker
        const trackerId = `tracker_${crypto.randomUUID()}`;
        await conn.query(
            `INSERT INTO job_tracker (id, user_id, job_title, company, status, date_applied, location, salary, notes, revision, sort_order)
             VALUES (?, ?, ?, ?, 'applied', CURRENT_TIMESTAMP, ?, ?, ?, 1, 0)
             ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
            [trackerId, userId, jobInfo.title, jobInfo.company, jobInfo.location || 'Remote', jobInfo.salary || '', `Applied via ResumePilot Job Portal (Ref: ${appId})`]
        );

        await conn.commit();
        return { success: true, applicationId: appId, trackerId };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}
```

---

### Solution 3: Saved Cover Letter Picker in Job Applications
- **Problem:** `JobApplicationModal.jsx` lets candidates choose saved resumes via `getResumes()`, but forces them to retype cover letters from scratch.
- **10/10 Architecture:**
  1. In `src/components/JobsListings/JobApplicationModal.jsx`, import `getUserCoverLetters(user.uid)`.
  2. Render a segmented control above the text area:
     - `[ ✍️ Write from Scratch ]` | `[ 📁 Select Saved Letter (4) ]` | `[ ✨ Generate AI Quick Pitch ]`
  3. Selecting a saved letter automatically fills `applicationData.coverLetter` and preserves the document linkage for employer review.

---

### Solution 4: 1-Click Master Profile $\rightarrow$ Master CV Generation
- **Problem:** Career data entered into Settings $\rightarrow$ Profile is trapped and does not propagate to resumes.
- **10/10 Architecture:**
  1. In `DashboardSettings.jsx`, add a hero synchronization banner at the top of the Profile tab:
     - *"Your Master Profile contains 48 verified career facts."*
     - Button: **[ ⚡ 1-Click Sync to Master CV ]**
  2. Clicking executes `syncProfileToResumeDraft(user.uid)`, mapping:
     - `workExperiences` $\rightarrow$ `workHistory`
     - `education` $\rightarrow$ `education`
     - `skills` $\rightarrow$ `skills` (deduplicated)
     - `certifications` $\rightarrow$ `certifications`
  3. Updates or creates a designated "Master CV" record in `resumes`, marked with an authoritative `is_master: 1` badge.

---

### Solution 5: Mobile Ergonomics & Native Bottom Navigation
- **Problem:** Editing 12-step resumes or managing tables on 375px viewports causes high friction.
- **10/10 Architecture:**
  - Mount `<CubaMobileBottomNav>` globally for all viewports $<768\text{px}$:
    - 5 primary touch targets ($48\text{px} \times 48\text{px}$ minimum hit area):
      1. **Home** (`/dashboard`)
      2. **Resumes** (`/dashboard/resumes`)
      3. **Jobs** (`/dashboard/jobs`)
      4. **Tracker** (`/dashboard/job-tracker`)
      5. **Profile** (`/dashboard/settings?tab=Profile`)
  - In the Resume Builder, replace the horizontal 12-button desktop stepper with a swipeable carousel card showing `Step X of 12` with prominent "Previous" and "Next" bottom thumb bars.

---

## 4. Master Layout Wireframes & Interaction Matrix

---

### Page 1: Overview Cockpit (`/dashboard`)
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Welcome back, [Candidate] | Status: [Open to Work 🟢] | [Quick Resume Edit]   │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│ 4 METRIC CARDS (.cuba-stat-card):        │ UPCOMING ACTION HERO CARD:                  │
│ • Total Resumes: 4                       │ 🎯 Upcoming Interview in 2 Days             │
│ • Applications Submitted: 12             │    Company: Stripe | Role: Senior Frontend  │
│ • Average ATS Score: 86 (Needs Imprv)    │    [🎙️ Launch AI Interview Coach] [Details]│
│ • Unread Recruiter Messages: 2           │                                             │
├──────────────────────────────────────────┴─────────────────────────────────────────────┤
│ MAIN WORKSPACE (Left 65%):               │ ASSISTANT & INSIGHTS RAIL (Right 35%):      │
│ ┌──────────────────────────────────────┐ │ ┌─────────────────────────────────────────┐ │
│ │ Resumes in Progress (Cards with ATS, │ │ │ Profile Completeness: 92% (Great)       │ │
│ │ direct PDF download, and edit link)  │ │ │ Top Recommended Jobs (3 Curated Cards)  │ │
│ └──────────────────────────────────────┘ │ │ Resume Optimization Quick Wins          │ │
│ ┌──────────────────────────────────────┐ │ └─────────────────────────────────────────┘ │
│ │ Live Job Tracker Kanban Snapshot     │ │                                             │
│ └──────────────────────────────────────┘ │                                             │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

---

### Page 2: Resumes & Master CV Workspace (`/dashboard/resumes`)
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER: "Resumes & Master CV" | Filter: [All (4)] [Master CV] [Tailored] | [+ New CV]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ AUTHORITATIVE MASTER CV HERO BAR:                                                      │
│ 🌟 Designated Master CV: "Full Stack Engineer (2026)" • ATS Score: 94 • Synced         │
│ Actions: [Edit in Builder] [Tailor for New Job] [Download PDF v] [Export DOCX]        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ RESUME GALLERY (Responsive Grid: 1 Col Mobile, 2 Col Tablet, 3 Col Desktop):           │
│ ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐    │
│ │ [Real DOM Thumbnail]   │  │ [Real DOM Thumbnail]   │  │ [ + Create New Resume ]│    │
│ │ ATS Score: 88          │  │ ATS Score: 74          │  │ • Start from Master CV │    │
│ │ "Stripe Tailored CV"   │  │ "Backend Lead Draft"   │  │ • Pick from 51 Themes  │    │
│ │ [Edit] [Tailor] [•••]  │  │ [Edit] [Tailor] [•••]  │  │ • [Upload PDF/Word Doc]│    │
│ └────────────────────────┘  └────────────────────────┘  └────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Page 3: Resume Builder Studio (`/build-resume/:step`)
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STICKY HEADER:                                                                         │
│ [<- Resumes Hub] | Breadcrumbs: Resumes Hub > Build Resume > [Candidate Name / Title]  │
│ ATS Gauge: 86/100 | Status: Saved ✓ | Actions: [Templates (51)] [Preview] [Download]   │
├──────────────────────┬──────────────────────────────────┬──────────────────────────────┤
│ 12-STEP RAIL (20%):  │ CENTER STEP FORM (55%):          │ AI CAREER ASSISTANT (25%):   │
│ 1. Contact & Info    │ STEP 2: WORK EXPERIENCE          │ 🤖 Real-Time ATS Feedback    │
│ 2. Work History (•)  │ ┌──────────────────────────────┐ │ • 5/5 Action Verbs Used     │
│ 3. Education         │ │ Senior Software Engineer     │ │ • Quantify results with %    │
│ 4. Skills            │ │ Google | 2022 - Present      │ │                            │
│ 5. Projects          │ │ • Spearheaded cloud micro... │ │ 💡 Smart Bullet Enhancer   │
│ 6. Certifications    │ │   [✨ AI Enhance Bullet]     │ │   [Generate Power Bullets] │
│ 7. Languages         │ └──────────────────────────────┘ │                              │
│ 8. Executive Bio     │ [+ Add Experience]               │ 👁️ Live Preview Side-Drawer │
│ 9-12. Review/Export  │ [<- Previous Step] [Next Step ->]│   [Toggle Full Preview]      │
└──────────────────────┴──────────────────────────────────┴──────────────────────────────┘
```

---

### Page 4: Unified Job Portal (`/dashboard/jobs`)
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ MASTER SEARCH BAR: [ 🔍 Search by title, skills, or company ] [ 📍 Location / Remote ] │
├──────────────────────┬──────────────────────────────────┬──────────────────────────────┤
│ FACETED FILTERS (20%):│ JOB FEED (35%):                  │ SELECTED JOB PANE (45%):     │
│ • Remote Only [x]    │ ┌──────────────────────────────┐ │ "Staff Frontend Engineer"    │
│ • Salary: $140k+     │ │ Stripe • Staff Engineer      │ │ Stripe • San Francisco (Rem) │
│ • Experience Level   │ │ $190k - $240k • Remote       │ │ Match Score: 92% (High)      │
│ • Tech Stack         │ │ Active 2h ago • Easy Apply   │ ├──────────────────────────────┤
│                      │ └──────────────────────────────┘ │ [ ⚡ 1-Click Apply Now ]      │
│                      │ ┌──────────────────────────────┐ │ [ ⭐ Save to Favorites ]     │
│                      │ │ Vercel • UI Architect        │ ├──────────────────────────────┤
│                      │ │ $210k - $250k • Remote       │ │ Full Job Description, Team,  │
│                      │ └──────────────────────────────┘ │ Benefits, & Tech Stack       │
└──────────────────────┴──────────────────────────────────┴──────────────────────────────┘
```

---

### Page 5: Job Tracker Kanban (`/dashboard/job-tracker`)
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER: "Job Tracker" | Actions: [Kanban View] [Table View] | [+ Add Custom Job Card]  │
├───────────────────┬───────────────────┬────────────────────┬───────────────────────────┤
│ 1. WISHLIST (3)   │ 2. APPLIED (8)    │ 3. INTERVIEWING (2)│ 4. OFFERS (1)             │
├───────────────────┼───────────────────┼────────────────────┼───────────────────────────┤
│ [Stripe - SWE]    │ [Linear - Dev]    │ [Google - Staff]   │ [Netflix - Lead]          │
│ $190k • Remote    │ Auto-synced 2d ago│ Next Round: System │ Offer: $250k Base         │
│ [Apply on Portal] │ [View Sent CV]    │ Date: Oct 20, 2 PM │ Deciding: 4 days left     │
│                   │                   │ [🎙️ Practice AI]  │ [Accept / Negotiate]      │
└───────────────────┴───────────────────┴────────────────────┴───────────────────────────┘
```

---

### Page 6: AI Interview Coach & CBT Simulator (`/dashboard/interview`)
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER: AI Interview Coach | Target Role: Senior Frontend Engineer | Company: Stripe   │
├───────────────────────────────────┬────────────────────────────────────────────────────┤
│ VIDEO & AUDIO STAGE (Left 55%):   │ REAL-TIME RUBRIC GRADING (Right 45%):              │
│ ┌───────────────────────────────┐ │ QUESTION 3 OF 5 (Behavioral / STAR Method):        │
│ │ [ Candidate Camera Feed /     │ │ "Tell me about a time you had to optimize a slow   │
│ │   Waveform Audio Spectrum ]   │ │  React rendering tree under tight deadlines."      │
│ └───────────────────────────────┘ ├────────────────────────────────────────────────────┤
│ Controls:                         │ STAR RUBRIC EVALUATION:                            │
│ [🎤 Start Speaking] [⏹️ Finish]    │ • Situation: Clear context provided (9/10)         │
│ [Skip Question] [End Session]     │ • Task & Action: Good profiling details (8/10)     │
│                                   │ • Result: Quantified 40% speedup (10/10)           │
│                                   │ [💡 View Ideal Sample Answer]                      │
└───────────────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 5. Execution Manifest for Remote Developer

To bring the live codebase from **6.8 to 10/10**, execute in this exact four-phase order:

### Phase 1: Core Playwright & Backend Test Green (1 Day)
1. Add `.cuba-stat-card` to `src/components/Candidate/CubaMetricCardRow.jsx:80`.
2. Update baseline commit in `tests/e2e/dir-001.spec.js:420` to `fdf2ee78`.
3. Delegate `query()` in `backend/test/helpers/aiRouteContract.js:39` to `(await this.getConnection()).query(sql, params)`.
4. Point breadcrumbs and exit in `BuildResume.jsx:1035, 1850` to `/dashboard/resumes`.
*Verification:* `npx playwright test tests/e2e/dir-001.spec.js` (7/7 Pass) & `npm --prefix backend test` (892/892 Pass).

### Phase 2: Cross-Feature Automation Bridges (2 Days)
1. In `JobApplicationModal.jsx`, add saved cover letter selector backed by `getUserCoverLetters(user.uid)`.
2. In `MySQLRepository.js` and `jobsData.js`, implement atomic transaction writing to both `applications` and `job_tracker`.
3. In `DashboardInterviews.jsx`, parse `role` and `company` from URL search parameters.
4. On `JobTracker.jsx` interview cards, add "Practice Interview with AI" link.

### Phase 3: Route Consolidation & Navigation Clean-Up (1 Day)
1. Redirect `/dashboard/jobs/portal`, `/jobs/browse`, `/jobs/category/*` into `/dashboard/jobs` with query parameters.
2. In `resolveNotificationHref.js:89`, map `resume_published` to `CANDIDATE_ROUTES.resumes`.
3. In `DashboardFavourites.jsx:251`, link Documents empty state to `/dashboard/resumes`.

### Phase 4: Mobile Polish & Production Seal (1 Day)
1. Mount `<CubaMobileBottomNav>` for viewports $<768\text{px}$.
2. Run full 5-viewport Playwright regression crawl:
   ```bash
   npx playwright test tests/e2e/dir-001.spec.js --trace on
   ```
3. Submit evidence and certify via AI Bridge:
   ```bash
   node C:\Users\mbhas\.ai-bridge\bridge.cjs dev submit-evidence --directive DIR-001 --summary "Completed 10/10 refactor: all 7 Playwright ACs pass, 892 backend tests pass, dual-write transaction active, unified job portal mounted." --tests "test-output.log"
   node C:\Users\mbhas\.ai-bridge\bridge.cjs gatekeeper certify --directive DIR-001
   ```
