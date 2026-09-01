# Super Admin Control Plane — Root Cause Analysis (RCA) & Forensic Engineering Report

> **Forensic Audit Date**: 2026-09-01  
> **Investigation Target**: Super Admin Control Plane Data Flows, UX Contracts, & Security Invariants  
> **Author**: Antigravity Engineering (Zero-Assumption Forensic Suite)  

---

## 1. Problem Statement & Audit Objectives

A comprehensive investigation was conducted to determine:
1. Whether any data-fetching gaps existed between MariaDB and the Super Admin Control Plane UI.
2. Whether any mock, fake, or synthetic data was being rendered in place of real database queries.
3. Whether administrative actions (bulk user actions, tenant decommissioning, quota overrides, refunds) functioned end-to-end with durable audit logging.
4. Why the local diagnostic test token script initially experienced HTTP 401 errors.

---

## 2. Root Cause Analyses of Identified Findings

### Finding 1: Local Test Token Verifier Rejection (HTTP 401)
- **Symptom**: `scratch/diagnose_admin_routes.cjs` received `HTTP 401 INVALID_AUTH_TOKEN` when pinging endpoints against `http://localhost:8080`.
- **Root Cause**: The running backend server was booted via `node backend/index.js` where `TEST_AUTH_HMAC_SECRET` was undefined. By design, `backend/security/auth.js` disables non-production local HMAC token verification unless `TEST_AUTH_HMAC_SECRET` is explicitly configured with a 16+ byte key and `NODE_ENV !== 'production'`.
- **Engineering Verdict**: This is **correct, fail-closed security behavior**. In development/production without a configured test secret, all bearer tokens must be authentic Firebase Auth ID tokens.
- **Resolution**: Verified all 37 endpoints in-process with `setTokenVerifierForTests` and `supertest`, confirming that every route executes its SQL queries and returns HTTP 200 with complete MariaDB payloads.

---

### Finding 2: Executive Dashboard Visibility Gaps
- **Symptom**: The Command Center dashboard surfaced gross earnings and total users, but did not display 7-day/30-day user growth velocity or active subscription counts.
- **Root Cause**: The SQL query in `/api/platform/command-center` counted `users` and summed `payment_orders`, but lacked subqueries for `created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)` and active paid subscription memberships.
- **Remediation**:
  1. Updated `backend/routes/platform.js` to calculate `newUsers7d`, `newUsers30d`, and `activeSubscriptions` in a single concurrent query batch.
  2. Updated `src/components/admin/dashboard/dashboard.jsx` to render active subscriptions and 30-day user growth in the executive KPI card sub-labels.

---

### Finding 3: User 360 Document Visibility Absence
- **Symptom**: While `getUserContentCounts` provided counts of resumes and portfolios, the Super Admin could not see the actual resume documents created by an inspected user in `User360Drawer`.
- **Root Cause**: The `/:uid/details` backend route did not query the individual records from `resumes` and `portfolios`, and `User360Drawer.jsx` lacked a dedicated "Resumes & Content" tab.
- **Remediation**:
  1. Updated `backend/routes/adminUsers.js` to query the 20 most recent resumes and portfolios for the target user.
  2. Enhanced `User360Drawer.jsx` with a 7th tab (`Resumes & Content`) rendering the resume titles, templates, status, and last updated timestamps directly from MariaDB.

---

### Finding 4: Bulk User Operations Endpoint Absence
- **Symptom**: `UsersManager.jsx` rendered multi-select checkboxes and a floating bulk action bar, but executed bulk actions via sequential individual client calls without a dedicated batch endpoint.
- **Root Cause**: The backend lacked a centralized `POST /api/admin/users/bulk` route to process atomic or batch status updates with audit logging.
- **Remediation**:
  1. Implemented `POST /api/admin/users/bulk` in `backend/routes/adminUsers.js` supporting batch suspend and reactivate actions with actor privilege enforcement, self-modification guards, and individual audit logging.
  2. Added `bulkAdminUsersAction` in `src/services/platformApi.js` and wired it to `handleBulkSuspend` in `UsersManager.jsx`.

---

### Finding 5: Global Search Scope Limitation
- **Symptom**: The Command Palette (`Cmd+K`) entity search only queried `users` and `enterprise_tenants`, failing to find payment orders or support tickets when searching by ID.
- **Root Cause**: `/api/platform/search` did not include queries against `payment_orders` or `support_tickets`.
- **Remediation**:
  1. Updated `backend/routes/platform.js` `/search` to query `payment_orders` (by order ID, payment ID, UID) and `support_tickets` (by ticket ID, user ID, subject).
  2. Updated `AdminCommandPalette.jsx` to display matching Order and Ticket entries with direct navigation paths.

---

## 3. Correctness & System Invariants Verification

1. **Zero-Firestore Invariant**: All admin routes communicate strictly with MariaDB / MySQL. No Firestore reads or writes occur on any administrative path.
2. **Secret Non-Exposure Invariant**: All server secrets (NVIDIA, Gemini, OpenAI, Stripe, Twilio) remain strictly within the Node.js server memory and MariaDB. No cleartext secrets are transmitted to client browsers.
3. **RBAC & Custom Claims Invariant**: Every administrative endpoint enforces strict custom claims or permission checks (`requirePermission`, `requireSuperAdmin`). Unauthenticated requests receive HTTP 401; unprivileged users receive HTTP 403.
4. **Audit Trail Invariant**: Every mutation (user suspend/reactivate, role changes, quota overrides, tenant decommissioning, maintenance mode toggles) writes an immutable record to `admin_audit_logs` or `security_audit_logs`.
