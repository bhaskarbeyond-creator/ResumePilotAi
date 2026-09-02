# User Product Backend / Frontend Gap Audit

**Audit Date:** September 2026  
**Focus:** Full reconciliation between frontend UI controls, React router definitions, REST API endpoints, backend controllers, and MariaDB schemas.

---

## 1. Audit Summary & Methodology

Every candidate-facing frontend route and UI action was cross-referenced with backend routes (`backend/routes/`), controllers, and MariaDB tables. The objective is to verify:
1. Every UI control has a functioning, owner-scoped backend endpoint.
2. Every backend candidate capability has an intuitive UI surface.
3. Zero orphaned routes, broken link targets, or unhandled 404/500 responses exist.

---

## 2. API-to-UI Reconciliation Table

| Frontend Route / Surface | User Action / Trigger | Backend Endpoint Invoked | HTTP Method | MariaDB Table | Gap Resolution / Status |
|---|---|---|---|---|---|
| `/dashboard` | Load user resumes | `/api/resumes` | `GET` | `resumes` | Fully bound & paginated |
| `/dashboard` | Delete resume draft | `/api/resumes/:id` | `DELETE` | `resumes` | Modal confirmation verified |
| `/dashboard` | Duplicate resume draft | `/api/resumes/draft` | `POST` | `resumes` | Auto-names with `(Copy)` |
| `/dashboard` | Download PDF | `/api/export` | `POST` | `resumes` | Validated PDF stream returned |
| `/dashboard` | Download Word (DOCX) | `/api/export-docx` | `POST` | `resumes` | Validated OOXML returned |
| `/build-resume/:step` | Load single draft | `/api/resumes/:id` | `GET` | `resumes` | Normalized safely |
| `/build-resume/:step` | Autosave draft | `/api/resumes/draft/:id` | `PUT` | `resumes` | Optimistic locking with revision check |
| `/build-resume/:step` | Generate AI Summary | `/api/generate-summary` | `POST` | Ephemeral AI | Bearer auth attached |
| `/build-resume/:step` | Generate AI Bullets | `/api/generate-work-description` | `POST` | Ephemeral AI | Bearer auth attached |
| `/dashboard/cover-letters` | Load cover letters | `/api/cover-letters` | `GET` | `cover_letters` | Fully bound |
| `/dashboard/cover-letters` | Create / Save letter | `/api/cover-letters` | `POST` | `cover_letters` | Verified |
| `/dashboard/interview` | Generate CBT Mock Test | `/api/interview/generate` | `POST` | `interview_sessions` | Verified |
| `/dashboard/interview` | Submit completed test | `/api/interview/submit` | `POST` | `interview_sessions` | Detailed report saved |
| `/dashboard/job-tracker` | Load tracked jobs | `/api/jobs/tracker` | `GET` | `job_tracker` | Status pipeline verified |
| `/dashboard/job-tracker` | Update job status | `/api/jobs/tracker/:id` | `PUT` | `job_tracker` | Drag/drop & dropdown bound |
| `/dashboard/support` | List user tickets | `/api/support/tickets` | `GET` | `support_tickets` | Fully bound & filtered |
| `/dashboard/support` | Create new ticket | `/api/support/tickets` | `POST` | `support_tickets` | Priority & subject validated |
| `/dashboard/support` | Post thread reply | `/api/support/tickets/:id/replies` | `POST` | `support_ticket_replies` | Appended in real-time |
| `/dashboard/settings` | Load master profile | `/api/profile` | `GET` | `users`, `profiles` | Multi-section normalization |
| `/dashboard/settings` | Save master profile | `/api/profile` | `PUT` | `users`, `profiles` | Autosave & manual save bound |
| `/dashboard/settings?tab=Account` | TOTP 2FA Begin | `/api/auth/2fa/totp/begin` | `POST` | `user_2fa_totp` | QR code generation verified |
| `/dashboard/settings?tab=Account` | TOTP 2FA Verify & Save | `/api/auth/2fa/totp/save` | `POST` | `user_2fa_totp` | Validated with live TOTP code |
| `/dashboard/settings?tab=Account` | GDPR JSON Export | `/api/account/export-json` | `GET` | All user tables | Instant ZIP/JSON bundle |
| `/dashboard/plans` | Fetch user subscription | `/api/subscriptions/status` | `GET` | `subscriptions` | Live entitlement status |

---

## 3. Discovered & Resolved Gaps

1. **Cover Letter Tab in Dashboard Overview**: Previously, `getUserCoverLetters()` was called only on the `/dashboard/cover-letters` subroute. We integrated saved cover letters directly into the dashboard overview tab bar so users can preview and manage both documents seamlessly.
2. **Support Ticket Direct Navigation**: Added direct route alias `/dashboard/tickets` and `/dashboard/help` pointing to `/dashboard/support` to avoid broken navigation from legacy bookmarks.
3. **Safe Interceptor Token Binding**: Verified that every AJAX and Fetch call made by candidate components automatically attaches `Authorization: Bearer <Firebase_ID_Token>` via the central request interceptor in `src/main.jsx`.
