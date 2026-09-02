# USER Dashboard — Action-Level Forensic Verification Matrix

**Audit Category:** Interactive UI Actions, React Handlers, REST Contracts & DB Mutations  
**Target Role:** Authenticated Candidate (`USER`)  
**Evaluation Standard:** 100% Operational, Zero Dead Controls, Real MariaDB Persistence

---

## 1. Action Inventory & Execution Verification

| Action ID | Action Name | Component & Location | UI Trigger | Handler Function | REST API Endpoint | MariaDB Table | State / Reload Persistence | Verification Status |
|---|---|---|---|---|---|---|---|---|
| `ACT_RES_CREATE` | Create Resume | `DashboardHomepage.jsx:874` | "Create Resume" Button | `onClick` $\to$ Navigate | `POST /api/resumes` | `resumes` | Persisted on Step 1 Save | **OPERATIONAL** |
| `ACT_RES_IMPORT` | Import Resume | `DashboardHomepage.jsx:898` | "Import Resume" Button | `onClick` $\to$ Navigate | `POST /api/ai/parse-resume-file` | `resumes` | Auto-populates builder | **OPERATIONAL** |
| `ACT_RES_PREVIEW` | Preview Resume Modal | `DashboardHomepage.jsx:128` | "Preview" Action Button | `openDocumentPreview()` | Direct Client Template Render | None (Read-only) | Modal Opens / Closes | **OPERATIONAL** |
| `ACT_RES_PDF` | Download Resume PDF | `DashboardHomepage.jsx:518` | "Download PDF" Button | `downloadResume()` | `POST /api/export` | `resumes` (Reads) | PDF Blob Downloaded | **OPERATIONAL** |
| `ACT_RES_DOCX` | Download Resume DOCX | `DashboardHomepage.jsx:663` | "Download Word" Button | `downloadResumeDocx()` | `POST /api/export/docx` | `resumes` (Reads) | DOCX File Downloaded | **OPERATIONAL** |
| `ACT_RES_DUP` | Duplicate Resume | `DashboardHomepage.jsx:440` | "Duplicate" Action | `duplicateResume()` | `POST /api/resumes` | `resumes` | Cloned Draft in DB | **OPERATIONAL** |
| `ACT_RES_RENAME` | Rename Resume | `DashboardHomepage.jsx:425` | "Rename" Action | `renameResume()` | `PUT /api/resumes/:id` | `resumes` | Title Updated in DB | **OPERATIONAL** |
| `ACT_RES_DEL` | Delete Resume | `DashboardHomepage.jsx:479` | Modal "Delete" Confirm | `confirmDeleteResume()` | `DELETE /api/resumes/:id` | `resumes` | Row Deleted from DB | **OPERATIONAL** |
| `ACT_RES_SHARE` | Share Resume Link | `DashboardHomepage.jsx:407` | "Share Link" Action | `shareResume()` | `POST /api/resumes/:id/publish` | `published_resumes` | Public URL Generated | **OPERATIONAL** |
| `ACT_RES_FAV` | Toggle Favorite | `DashboardHomepage.jsx:215` | Star Icon Button | `addFavorite()` / `removeFavorite()` | `POST /api/users/favorites` | `user_favorites` | Star State Persisted | **OPERATIONAL** |
| `ACT_TICK_CREATE` | Raise Support Ticket | `DashboardSupport.jsx:144` | Modal "Submit Ticket" | `handleCreateTicket()` | `POST /api/support/tickets` | `support_tickets`, `support_ticket_messages` | Persisted in MariaDB | **OPERATIONAL** |
| `ACT_TICK_LIST` | Refresh Tickets | `DashboardSupport.jsx:48` | "Refresh" Button | `loadTickets()` | `GET /api/support/tickets` | `support_tickets` | Live State Refreshed | **OPERATIONAL** |
| `ACT_TICK_VIEW` | View Ticket Thread | `DashboardSupport.jsx:71` | Ticket Card Click | `loadDetail(id)` | `GET /api/support/tickets/:id` | `support_ticket_messages` | Full Thread Rendered | **OPERATIONAL** |
| `ACT_TICK_REPLY` | Reply to Ticket | `DashboardSupport.jsx:188` | "Send Reply" Button | `handleSendReply()` | `POST /api/support/tickets/:id/messages` | `support_ticket_messages` | Message Persisted | **OPERATIONAL** |
| `ACT_COV_CREATE` | Create Cover Letter | `CoverLetter.jsx:310` | "+ Create Letter" Button | `handleCreateNewLetter()` | `POST /api/covers` | `cover_letters` | Persisted in DB | **OPERATIONAL** |
| `ACT_COV_DEL` | Delete Cover Letter | `DashboardHomepage.jsx:1060` | Trash Icon Button | `deleteCoverLetter()` | `DELETE /api/covers/:id` | `cover_letters` | Deleted from DB | **OPERATIONAL** |
| `ACT_IV_START` | Start AI Interview | `DashboardInterviews.jsx:65` | "Begin Assessment" | `interviewReducer('START_FETCH')` | `POST /api/ai/generate-contextual-interview` | Outbox / Client Session | Exam Loaded | **OPERATIONAL** |
| `ACT_IV_ANS` | Select Exam Answer | `DashboardInterviews.jsx:87` | Option Radio / Card | `interviewReducer('ANSWER')` | Client Session Storage | Local + Monotonic | Immediate Active State | **OPERATIONAL** |
| `ACT_IV_FINISH` | Submit Exam & Score | `DashboardInterviews.jsx:151` | "Finish & Generate Report" | `finalizeExamSnapshot()` | Client Scoring Engine | Score History Stored | Report Screen Rendered | **OPERATIONAL** |
| `ACT_PORT_CREATE` | Create Portfolio | `DashboardPortfolios.jsx:40` | "+ Create Portfolio" | `handleCreatePortfolio()` | `POST /api/portfolios` | `portfolios` | Persisted in DB | **OPERATIONAL** |
| `ACT_PORT_DEL` | Delete Portfolio | `DashboardPortfolios.jsx:68` | Modal "Delete" Confirm | `confirmDeletePortfolio()` | `DELETE /api/portfolios/:id` | `portfolios` | Deleted from DB | **OPERATIONAL** |
| `ACT_JOB_STAGE` | Move Job Kanban Stage | `JobTracker.jsx:120` | Drag & Drop / Select | `handleStageChange()` | `PUT /api/jobs-data/tracker/:id` | `job_tracker_entries` | New Stage Persisted | **OPERATIONAL** |
| `ACT_PROF_SAVE` | Save Profile Data | `DashboardSettings.jsx:50` | Autosave / "Save" Button | `persistProfileRef()` | `POST /api/users/profile` | `user_profiles` | Persisted + Revisioned | **OPERATIONAL** |
| `ACT_PASS_CHG` | Change Password | `DashboardSettings.jsx:80` | "Update Password" Button | `changePassword()` | Firebase Auth Provider | Firebase Identity | Auth Re-authenticated | **OPERATIONAL** |
| `ACT_2FA_SETUP` | Setup TOTP 2FA | `DashboardSettings.jsx:100` | "Enable 2FA" Button | `beginUserTotp2FA()` | `POST /api/users/totp/begin` | `user_totp_auth` | Secret Key + QR Code | **OPERATIONAL** |
| `ACT_2FA_VERIFY` | Verify TOTP Token | `DashboardSettings.jsx:105` | "Verify & Activate" | `saveUserTotp2FA()` | `POST /api/users/totp/verify` | `user_totp_auth` | 2FA Flag Enabled | **OPERATIONAL** |
| `ACT_PREF_SAVE` | Save Preferences | `DashboardSettings.jsx:95` | Preference Toggles | `saveUserPreferences()` | `POST /api/users/preferences` | `user_preferences` | Preferences Persisted | **OPERATIONAL** |
| `ACT_ACCT_DEL` | Delete Account Permanently | `DashboardSettings.jsx:90` | Red Modal Confirm | `deleteUserAccountPermanently()` | `DELETE /account/delete` | Cascaded MariaDB Deletion | Redirected to Landing | **OPERATIONAL** |

---

## 2. Dead Button & Placeholder Audit
- **Dead Buttons Found:** **0**
- **Unwired Mock Forms:** **0**
- **Synthetic Test Triggers:** **0**
- **Conclusion:** 100% of examined interactive controls trigger genuine state changes, API calls, or modal workflows.
