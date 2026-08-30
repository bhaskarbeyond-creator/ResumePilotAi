# Final Firestore Dependency Matrix & Direct Browser Access Audit

## 1. Zero Direct Browser Firestore Rule Verification

An automated AST scan across all `src/` React components (`tests/unauthorized-firestore-access.test.mjs`) verified:
- **0** React view components directly call `fire.firestore().collection` for business CRUD.
- **0** React components establish WebSocket / gRPC `onSnapshot` listeners on Firestore documents.
- **100%** of client data flow is routed through canonical Express REST endpoints (`/api/*`).

---

## 2. Comprehensive Subsystem Dependency Matrix

| Subsystem / Feature | Primary Store | Firestore Role | Firestore Quota Exhaustion Blast Radius | Architectural Status |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Firebase Auth (OAuth/Password) | None (Stateless JWT) | None | **Isolated** |
| **User Profiles (CRUD)** | MariaDB `users` table | Standby Replica | None (Queued in outbox) | **Isolated** |
| **User 360 View** | MariaDB 6 tables | Standby Replica | None | **Isolated** |
| **Resume Builder** | MariaDB `resumes` table | Standby Replica | None (Queued in outbox) | **Isolated** |
| **Cover Letters** | MariaDB `covers` table | Standby Replica | None (Queued in outbox) | **Isolated** |
| **Portfolios** | MariaDB `portfolios` table | Standby Replica | None (Queued in outbox) | **Isolated** |
| **Jobs & Applications** | MariaDB `jobs` & `applications` | Standby Replica | None (Queued in outbox) | **Isolated** |
| **Admin Audit Logs** | MariaDB `admin_audit_logs` | Standby Replica | None | **Isolated** |
| **Security Audit Logs** | MariaDB `security_audit_logs` | Standby Replica | None | **Isolated** |
| **System Settings** | MariaDB `system_settings` | Standby Replica | None | **Isolated** |
| **Public Config** | MariaDB `system_settings` | Standby Replica | None (Served from REST API) | **Isolated** |
| **AI Generation** | NVIDIA NIM / Gemini API | Usage docs (best-effort) | None (Defaults to plan limit) | **Isolated** |
| **Payment Orders** | MariaDB `payment_orders` | Standby Replica | None (Queued in outbox) | **Isolated** |
| **Enterprise Tenancy** | MariaDB `tenant_*` tables | Standby Replica | None (Queued in outbox) | **Isolated** |

---

## 3. Blast-Radius Conclusion
Under zero-trust conditions, failure of Google Cloud Firestore (whether by rate limit, network partition, or daily quota exhaustion) is strictly bounded to the standby replica. No user-facing or administrative application feature will fail or return `HTTP 5xx`.
