# USER Dashboard — Data Lineage & Authoritative MariaDB Audit

**Audit Objective:** Prove that all dynamic candidate dashboard figures, resume lists, support tickets, and profile entities originate from authoritative MariaDB tables and are NOT fabricated or static placeholders.

---

## 1. Complete End-to-End Data Lineage Chain

```
[MariaDB Tables]
 (resumes, cover_letters, portfolios, support_tickets, user_profiles, user_preferences)
        │
        ▼  SQL (Connection Pool with parameterized queries)
[Node.js Backend REST Layer]
 (routes/resumes.js, routes/covers.js, routes/support.js, routes/usersData.js)
        │
        ▼  JSON HTTP / Bearer Auth via `apiJson` / `fetch`
[Frontend API Client Layer]
 (src/services/api/platform.js, src/services/resumePersistence.js)
        │
        ▼  React State (`useState`, `useEffect`, `useReducer`)
[Candidate Dashboard UI Components]
 (DashboardHomepage, DashboardSupport, DashboardSettings, BuildResume, CoverLetter)
        │
        ▼  Virtual DOM $\to$ Real Browser Render
[Candidate Rendered DOM View]
```

---

## 2. Dynamic Entity Lineage Verification Table

| Entity / UI Display | Visible Data Field | MariaDB Source Query / Column | React Service Function | Fallback / Zero-State Guard | Data Dynamism Verdict |
|---|---|---|---|---|---|
| **Resumes Count** | Total count on Stat Card | `SELECT COUNT(*) FROM resumes WHERE user_id = ?` | `getResumes(uid, page, perPage)` | `0` (clean numeric zero) | **AUTHORITATIVE (DYNAMIC)** |
| **Resume Cards** | Title, Occupation, Date, Thumbnail | `SELECT id, item, template, updated_at FROM resumes WHERE user_id = ?` | `getResumes(uid, ...)` | Empty state card with CTA | **AUTHORITATIVE (DYNAMIC)** |
| **Cover Letters** | Job Title, Company, Letter Body | `SELECT id, title, company_name, letter_body FROM cover_letters WHERE user_id = ?` | `getUserCoverLetters()` | Empty state with "+ Create" CTA | **AUTHORITATIVE (DYNAMIC)** |
| **Portfolios** | Title, Theme, Slug, Metadata | `SELECT id, title, theme, slug, data FROM portfolios WHERE user_id = ?` | `getUserPortfolios(uid)` | "No portfolios found" | **AUTHORITATIVE (DYNAMIC)** |
| **Support Tickets** | Subject, Priority, Status, Thread | `SELECT id, subject, status, priority, created_at FROM support_tickets WHERE user_id = ?` | `getUserSupportTickets()` | "No support tickets found" | **AUTHORITATIVE (DYNAMIC)** |
| **Support Thread** | Message body, author role, time | `SELECT id, author_uid, author_role, body, created_at FROM support_ticket_messages WHERE ticket_id = ?` | `getUserSupportTicket(id)` | Loading spinner $\to$ Message bubbles | **AUTHORITATIVE (DYNAMIC)** |
| **Master Profile** | Firstname, Lastname, Email, Skills | `SELECT firstname, lastname, email, data, revision FROM user_profiles WHERE id = ?` | `getProfileOfUser(uid)` | Empty input fields | **AUTHORITATIVE (DYNAMIC)** |
| **Security 2FA** | Enabled state, Backup codes left | `SELECT enabled, secret, backup_codes FROM user_totp_auth WHERE user_id = ?` | `getUserTotpStatus()` | "2FA is currently disabled" | **AUTHORITATIVE (DYNAMIC)** |
| **Job Tracker** | Kanban cards (Applied, Interview) | `SELECT id, job_title, company, stage FROM job_tracker_entries WHERE user_id = ?` | `apiJson('/api/jobs-data/tracker')` | Empty column dropzones | **AUTHORITATIVE (DYNAMIC)** |
| **Preferences** | Email notifications toggle, Lang | `SELECT language, email_notifications, revision FROM user_preferences WHERE user_id = ?` | `apiJson('/api/users/preferences')` | Default toggle states | **AUTHORITATIVE (DYNAMIC)** |

---

## 3. Forensic Elimination of Static/Fake Data
- **Static Counts:** Zero hardcoded resume, download, or favorite counts exist in `DashboardHomepage.jsx` or `DashboardMain.jsx`.
- **Placeholder Names:** No fake dummy names (e.g. "John Doe") are rendered as real profile data; the system falls back truthfully to Firebase Display Name, Email Prefix, or "Master User".
- **Local Storage Leaks:** `localStorage.removeItem('currentResumeId')` and `localStorage.removeItem('currentResumeItem')` execute on dashboard mount and session switches, preventing cross-account state leakage.
