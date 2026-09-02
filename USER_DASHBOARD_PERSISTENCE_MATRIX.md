# USER Dashboard — Database & MariaDB CRUD Persistence Matrix

**Audit Category:** Data Mutation Lifecycle & Atomicity  
**Test Pattern:** $\text{CREATE} \longrightarrow \text{READ} \longrightarrow \text{UPDATE} \longrightarrow \text{READ} \longrightarrow \text{DELETE} \longrightarrow \text{ASSERT ABSENT}$

---

## 1. Full CRUD Lifecycle Verification Table

| Domain Entity | CREATE Operation | READ (Post-Create) | UPDATE / Mutation | READ (Post-Update) | DELETE Operation | Post-Delete Absence Assertion | MariaDB Table(s) |
|---|---|---|---|---|---|---|---|
| **Resume Draft** | `POST /api/resumes` | Returns new ID + Rev 1 | `PUT /api/resumes/:id` | Returns updated revision | `DELETE /api/resumes/:id` | `SELECT *` returns 0 rows | `resumes`, `resume_drafts` |
| **Cover Letter** | `POST /api/covers` | Returns letter ID | `PUT /api/covers/:id` | Returns edited body | `DELETE /api/covers/:id` | `SELECT *` returns 0 rows | `cover_letters` |
| **Portfolio Web CV**| `POST /api/portfolios` | Returns slug + theme | `PUT /api/portfolios/:id` | Returns new theme data | `DELETE /api/portfolios/:id` | `SELECT *` returns 0 rows | `portfolios` |
| **Support Ticket** | `POST /api/support/tickets` | Returns Ticket ID + Msg | `POST /api/support/tickets/:id/messages` | Returns updated thread | Handled via account delete | Soft-close on resolution | `support_tickets`, `support_ticket_messages` |
| **Candidate Profile**| Auto-created on signup | Returns profile data | `POST /api/users/profile` | Returns updated profile | `DELETE /account/delete` | Cascaded user delete | `user_profiles` |
| **Job Application** | `POST /api/jobs-data/apply` | Returns application | Status transition | Returns new status | `DELETE /api/jobs-data/app/:id` | `SELECT *` returns 0 rows | `job_applications` |
| **Job Tracker Kanban**| `POST /api/jobs-data/tracker`| Returns card ID | `PUT /api/jobs-data/tracker/:id` | Returns new stage | `DELETE /api/jobs-data/tracker/:id` | `SELECT *` returns 0 rows | `job_tracker_entries` |
| **TOTP 2FA Secret** | `POST /api/users/totp/begin` | Returns pending secret | `POST /api/users/totp/verify` | Returns enabled=1 | `POST /api/users/totp/disable` | `enabled=0, secret=NULL` | `user_totp_auth` |
| **User Preferences** | `POST /api/users/preferences`| Returns prefs | `POST /api/users/preferences` | Returns new flags | Handled via account delete | Preferences reset | `user_preferences` |

---

## 2. Monotonic Revisions & Conflict Protection
- **Profile Optimistic Locking:** Uses monotonic `revision` field in `user_profiles` table. If another tab saves a change, subsequent writes with stale `expectedRevision` return `HTTP 409 CONFLICT` with authoritative remote state, preventing silent overwrites.
- **Resume Conflict Protection:** `saveResumeDraft` validates `expectedRevision` against `resumes.revision`.
- **Atomic Transactions:** Ticket creation executes in a single database transaction (`connection.beginTransaction()` $\to$ `INSERT support_tickets` $\to$ `INSERT support_ticket_messages` $\to$ `connection.commit()`).
