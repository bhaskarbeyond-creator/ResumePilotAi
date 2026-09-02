# USER Dashboard Backend-to-UI Forensic Trace

**Audit Date**: September 2, 2026  
**Auditor**: Senior Full-Stack Engineer & Database Architect  
**Objective**: Trace every candidate module from database layer to UI presentation, verifying zero synthetic fallbacks and authoritative ownership.

---

## 1. Domain Traces

### Domain 1: Resumes & Draft Persistence
- **Database Table**: `resumes` (`id`, `user_id`, `template`, `data` [JSON], `revision`, `created_at`, `updated_at`)
- **Backend Route**: `POST /api/resumes`, `GET /api/resumes/:id`, `PUT /api/resumes/:id`, `DELETE /api/resumes/:id` in `backend/routes/resumes.js`
- **Controller / Service**: `MySQLRepository.getUserResumes()`, `saveResumeWithRevisionGuard()`
- **Frontend API**: `services/resumePersistence.js` (`getResumes()`, `saveResumeDraft()`, `deleteResumeDraft()`)
- **UI Components**: `DashboardHomepage.jsx`, `BuildResume.jsx` (11 steps)
- **Isolation Proof**: SQL query binds `WHERE user_id = ? AND id = ?`, ensuring zero cross-account data leakage.

---

### Domain 2: Cover Letters
- **Database Table**: `cover_letters` (`id`, `user_id`, `title`, `job_title`, `company`, `content`, `template`, `created_at`, `updated_at`)
- **Backend Route**: `GET /api/cover-letters`, `POST /api/cover-letters`, `PUT /api/cover-letters/:id`, `DELETE /api/cover-letters/:id`
- **Controller / Service**: `MySQLRepository.getCoverLetters()`
- **Frontend API**: `services/api/platform.js` (`getUserCoverLetters()`, `saveCoverLetter()`, `deleteCoverLetter()`)
- **UI Component**: `src/components/CoverLetter/CoverLetter.jsx`
- **Isolation Proof**: Parameterized `WHERE user_id = req.user.uid`.

---

### Domain 3: Job Applications & Job Tracker
- **Database Tables**: `job_applications` (`id`, `job_id`, `user_id`, `status`, `resume_id`, `applied_at`), `tracked_jobs` (`id`, `user_id`, `title`, `company`, `location`, `status`, `notes`, `deadline`, `url`, `order_index`, `revision`)
- **Backend Routes**: `GET /api/jobs/applications`, `POST /api/jobs/:id/apply`, `GET /api/users/:uid/tracked-jobs`, `POST /api/users/:uid/tracked-jobs`, `PUT /api/users/:uid/tracked-jobs/:id`
- **Controller / Service**: `MySQLRepository.getTrackedJobs()`, `createTrackedJob()`
- **Frontend API**: `services/api/platform.js` (`getUserJobApplications()`, `getTrackedJobs()`, `createTrackedJob()`, `updateTrackedJob()`)
- **UI Components**: `src/components/AppliedJobs/AppliedJobs.jsx`, `src/components/AppliedJobs/JobTracker.jsx`
- **Isolation Proof**: Enforces `req.user.uid === req.params.uid` server-side before querying.

---

### Domain 4: Portfolios & Web CV
- **Database Table**: `portfolios` (`id`, `user_id`, `slug`, `title`, `theme`, `content` [JSON], `published`, `created_at`, `updated_at`)
- **Backend Routes**: `GET /api/portfolios/user/:uid`, `POST /api/portfolios`, `PUT /api/portfolios/:id`, `DELETE /api/portfolios/:id`, `GET /api/portfolios/public/:slug`
- **Controller / Service**: `MySQLRepository.getUserPortfolios()`, `getPublicPortfolioBySlug()`
- **Frontend API**: `services/api/platform.js` (`getUserPortfolios()`, `savePortfolio()`, `deletePortfolio()`)
- **UI Components**: `DashboardPortfolios.jsx`, `PortfolioBuilder.jsx`, `PublicPortfolio.jsx`
- **Isolation Proof**: Private operations check `user_id = req.user.uid`; public view checks `published = 1`.

---

### Domain 5: Messaging & Real-Time Chat
- **Database Tables**: `conversations` (`id`, `participants` [JSON], `last_message_at`), `messages` (`id`, `conversation_id`, `sender_uid`, `text`, `attachments`, `created_at`)
- **Backend Routes**: `GET /api/conversations/:uid`, `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages`
- **Controller / Service**: `MySQLRepository.getConversationsForUser()`
- **Frontend API**: `services/api/platform.js` (`getConversations()`, `sendMessage()`, `getMessagesPaginated()`)
- **UI Component**: `DashboardMessages.jsx`
- **Isolation Proof**: Rejects read/write if `req.user.uid` is not in `JSON_EXTRACT(participants, '$')`.

---

### Domain 6: AI Interview Coach & CBT Simulator
- **Database Table**: `interview_history` (`id`, `user_id`, `occupation`, `mode`, `score`, `report` [JSON], `created_at`)
- **Backend Route**: `POST /api/ai/generate-content`
- **Controller / Service**: `backend/services/aiRuntime.js` (with NVIDIA / Gemini failover)
- **Frontend API**: `services/aiService.js` (`generateUserAiContent()`)
- **UI Component**: `DashboardInterviews.jsx`
- **Isolation Proof**: AI generation requires authenticated bearer token; history stored under `user_id`.
