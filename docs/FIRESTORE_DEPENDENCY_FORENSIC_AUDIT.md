# Firestore Dependency Forensic Audit & Intelligent Freeze Governance

## Executive Summary & Root Cause Forensic Report

### Mandatory Root Cause Question:
**"WHY DID THE FIRESTORE QUOTA ERROR REAPPEAR AFTER THE PREVIOUS INTELLIGENT FREEZE?"**

1. **Original Root Cause**:
   In legacy architecture, all business data (resumes, portfolios, cover letters, user profiles) and control plane logs were read directly from Google Cloud Firestore (`ai-resume-builder-424cf`). When Firestore free-tier daily read limits were reached, the Google Cloud gRPC backend threw `8 RESOURCE_EXHAUSTED: Quota exceeded.`.

2. **What the Previous "Intelligent Freeze" Fixed**:
   The previous freeze successfully migrated 100% of user-facing business entities (Resumes, Portfolios, Covers, Jobs, Users, Settings, Subscriptions, Messages, Reviews, Blog, Outbox) to the MariaDB primary (`u727965524_airesume`) across 30 canonical tables, and updated `src/services/dbOperations.js` to route all CRUD via Express REST endpoints.

3. **What Remained Dependent on Firestore**:
   The Super Admin Control Plane's **Admin Audit Logs** (`GET /api/admin/audit-logs`, `GET /api/admin/audit-logs/stats`, `GET /api/admin/audit-logs/:id`) and **Platform Security Events** (`GET /api/platform/security-events`) were designed as immutable append-only event logs querying the standby Firestore collections `admin_audit_logs` and `security_audit_logs`.

4. **Exact Screen and Function**:
   - **Screen**: Admin Console → Super Admin Control Plane → Admin Audit Logs (`/admin/audit-logs` via `AdminAuditLogs.jsx`).
   - **Function**: `fetchLogs()` calling `platformApi.getAdminAuditLogs(...)` -> `GET /api/admin/audit-logs`.
   - **Failure Point**: `backend/routes/adminAudit.js` and `backend/security/adminAudit.js` threw unhandled `8 RESOURCE_EXHAUSTED`, returning HTTP 500 with the raw gRPC exception string. `AdminAuditLogs.jsx` caught the 500 and rendered a red broken error banner displaying the raw exception.

5. **Why Previous Tests Did Not Detect It**:
   - Previous end-to-end and integration test suites focused heavily on user-facing CRUD (resumes, templates, export, auth, billing).
   - Control plane tests used live mock Firestore instances with unlimited quota rather than simulating `RESOURCE_EXHAUSTED` (code 8) on the audit log endpoints.

6. **Exact Architectural Remediation**:
   - **Backend Route Degradation Layer** (`backend/routes/adminAudit.js`, `backend/security/adminAudit.js`, `backend/routes/platform.js`):
     - Catches `RESOURCE_EXHAUSTED` (code 8), `UNAVAILABLE` (code 14), and related quota errors.
     - Returns HTTP 200 with structured degradation metadata: `{ logs: [], count: 0, hasMore: false, degraded: true, quotaLimited: true, reason: 'STANDBY_FIRESTORE_QUOTA_LIMITED', message: 'Standby audit event store read limit reached. Real-time audit recording is active in the outbox.' }`.
     - Returns structured HTTP 503 for single record lookups with zero SDK error leakage.
   - **Frontend UI Error Boundary & Status Card** (`AdminAuditLogs.jsx`, `PlatformSecurity.jsx`):
     - Distinguishes empty search results from quota-limited states.
     - Displays an amber informative status banner explaining that the primary MariaDB database is 100% active while the standby audit query window resets.
     - Provides bounded manual retry buttons with backoff to prevent retry storms.
   - **Background Worker Daemon Noise Suppression** (`backend/database/syncManager.js`):
     - Drains reverse outbox with exponential backoff on quota limits and suppresses repetitive stderr logging.

7. **Permanent Regression Protection**:
   - `tests/unauthorized-firestore-access.test.mjs`: Scans AST to guarantee 0 React components invoke direct browser Firestore calls on business entities and enforces strict allowlist imports.
   - `backend/test/control-plane-data-source-integrity.test.js`: Validates control plane endpoints under simulated Firestore quota failure.
   - `backend/test/control-plane-firestore-degradation.test.js`: Performs chaos testing across all 8 failure modes.

---

## Codebase Firestore Call Inventory Summary

| Category | File Path | Route / Method | Target Collection | Classification | Degradation Protocol |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Control Plane** | `backend/routes/adminAudit.js` | `GET /api/admin/audit-logs` | `admin_audit_logs` | Standby Store | HTTP 200 `{ degraded: true, quotaLimited: true }` |
| **Control Plane** | `backend/routes/adminAudit.js` | `GET /api/admin/audit-logs/stats` | `admin_audit_logs` | Standby Store | HTTP 200 `{ degraded: true, sampleSize: 0 }` |
| **Control Plane** | `backend/routes/adminAudit.js` | `GET /api/admin/audit-logs/:id` | `admin_audit_logs` | Standby Store | HTTP 503 `{ code: 'STANDBY_STORE_QUOTA_LIMITED' }` |
| **Control Plane** | `backend/routes/platform.js` | `GET /api/platform/security-events` | `security_audit_logs` | Standby Store | HTTP 200 `{ degraded: true, quotaLimited: true }` |
| **Control Plane** | `backend/routes/platform.js` | `GET /api/platform/command-center` | MariaDB / Firestore fallback | Dual Store | 100% MariaDB primary |
| **Sync Daemon** | `backend/database/syncManager.js` | Background Worker | `sync_outbox` | Async Outbox | Exponential backoff, non-blocking |
| **Enterprise** | `backend/enterprise/enterpriseOutbox.js` | Background Daemon | `enterprise_outbox` | Durable Queue | HMAC-SHA256 authenticated envelope |
| **Business Data** | `backend/routes/resumes.js` | `GET/POST /api/resumes` | MariaDB `resumes` | Primary Store | 0% Firestore dependency |
| **Business Data** | `backend/routes/portfolios.js` | `GET/POST /api/portfolios` | MariaDB `portfolios` | Primary Store | 0% Firestore dependency |
| **Business Data** | `backend/routes/covers.js` | `GET/POST /api/covers` | MariaDB `covers` | Primary Store | 0% Firestore dependency |
| **Business Data** | `backend/routes/usersData.js` | `GET/POST /api/users-data` | MariaDB `users` | Primary Store | 0% Firestore dependency |
