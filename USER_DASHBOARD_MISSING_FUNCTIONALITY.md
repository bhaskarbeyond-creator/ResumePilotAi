# USER Dashboard — Missing Functionality Ledger & Remediation Report

**Audit Objective:** Catalog all capabilities implemented in the backend/system but missing or unexposed in the USER dashboard, and report remediation proofs.

---

## 1. Missing Functionality Ledger

| Feature / Capability | Current State (Pre-Audit) | Expected State | User Impact | Severity | Implemented? | Tested? | Evidence |
|---|---|---|---|---|---|---|---|
| **User Support Ticket Submission** | Backend REST endpoints existed (`POST /api/support/tickets`) but NO frontend UI screen existed in the USER dashboard. | Candidate can open a modal to submit a ticket with subject, priority, and description. | Candidates had no way to report bugs or get technical help within the app. | **CRITICAL** | **YES** | **YES** | `DashboardSupport.jsx:144`, `tests/user-dashboard-forensic.test.mjs` |
| **User Support Ticket History & Status** | Endpoints existed (`GET /api/support/tickets`) with zero UI rendering. | Candidate sees a queue of their open/pending/resolved tickets with live status badges. | Candidates could not track support resolution progress. | **CRITICAL** | **YES** | **YES** | `DashboardSupport.jsx:48`, `tests/user-dashboard-forensic.test.mjs` |
| **Interactive Ticket Conversation Stream** | Message endpoints existed (`POST /api/support/tickets/:id/messages`) with zero UI. | Candidate can click any ticket to view the conversation thread between themselves and support specialists, and post follow-ups. | Seamless helpdesk communication thread. | **CRITICAL** | **YES** | **YES** | `DashboardSupport.jsx:71,188`, `tests/user-dashboard-forensic.test.mjs` |
| **Support Desk Navigation Links** | Sidebar lacked Help / Support item for regular users. | Sidebar displays "Help Desk & Support" with `FiLifeBuoy` icon under Account & Security. | Fast 1-click discovery of customer support. | **HIGH** | **YES** | **YES** | `ProfileDisplay.jsx:744`, `tests/user-dashboard-forensic.test.mjs` |
| **Client API Support Methods** | `src/services/api/platform.js` only exported admin ticket functions (`getAdminSupportTickets`, etc.). | Export `getUserSupportTickets`, `getUserSupportTicket`, `createUserSupportTicket`, `replyUserSupportTicket`. | Standardized authenticated API layer. | **HIGH** | **YES** | **YES** | `platform.js:165-204`, `tests/user-dashboard-forensic.test.mjs` |
| **Dashboard Canonical Support Routes** | `/dashboard/support`, `/dashboard/tickets`, `/dashboard/help` did not exist in React router. | Routes mapped in `DashboardMain.jsx` to render `<DashboardSupport />` or redirect canonically. | Clean, shareable deep links to support. | **HIGH** | **YES** | **YES** | `DashboardMain.jsx:541-543`, `tests/user-dashboard-forensic.test.mjs` |

---

## 2. Forensic Gap Closure Summary
All identified functionality gaps have been completely designed, implemented, wired to real MariaDB tables, protected by RBAC and IDOR guards, and verified through automated test suites with 0 regressions.
