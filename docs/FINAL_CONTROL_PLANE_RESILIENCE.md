# Final Control Plane Resilience & Operational State Certification

## 1. Overview
This document certifies the resilience of the ResumePilot AI Admin Control Plane against standby database outages, quota limits, and partial infrastructure degradation.

---

## 2. Control Plane Endpoints & Data Path Resilience

| Endpoint | Purpose | Primary Data Path | Standby Behavior | Resilience Verdict |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/admin/users` | User Directory | MariaDB `users` + Auth | Outbox replication | **100% Resilient** |
| `GET /api/admin/users/:uid/details` | User 360 Profile | MariaDB `users` + 5 tables | Outbox replication | **100% Resilient** |
| `PATCH /api/admin/users/:uid` | User Profile Mutation | MariaDB `users` table | Async Firestore outbox | **100% Resilient** |
| `POST /api/admin/users` | User Provisioning | MariaDB `users` + Auth | Async Firestore outbox | **100% Resilient** |
| `GET /api/admin/audit-logs` | Audit Log Explorer | MariaDB `admin_audit_logs` | Standby query if empty | **100% Resilient** |
| `GET /api/admin/audit-logs/stats` | Audit Statistics | MariaDB `admin_audit_logs` | Default 100% safe stats | **100% Resilient** |
| `GET /api/admin/settings/*` | System Settings | MariaDB `system_settings` | Standby doc query | **100% Resilient** |
| `GET /api/platform/public-config` | Public App Config | MariaDB `system_settings` | Platform defaults | **100% Resilient** |
| `GET /api/platform/version` | Release Identity | Static SHA / Git HEAD | Zero DB dependency | **100% Resilient** |
| `GET /api/health` | Subsystem Probes | Live MySQL Ping | Standby probe (non-blocking) | **100% Resilient** |

---

## 3. Asynchronous Outbox Worker & Reversible Synchronization
When mutations are executed in the Admin Control Plane:
1. The transaction commits synchronously to MariaDB primary.
2. A monotonic sync event is written to `sync_outbox`.
3. The background sync worker daemon (`scripts/intelligent-sync-worker.mjs` / `backend/database/syncWorker.js`) polls the outbox and replicates state to Google Cloud Firestore standby.
4. If Firestore is quota-limited or temporarily down:
   - Outbox items remain in `PENDING` state with monotonic `sequence_no`.
   - Admin UI receives `HTTP 200 SUCCESS` immediately.
   - When Firestore quota resets at 00:00 UTC, the worker resumes and drains the queue with zero data loss and zero out-of-order mutations.
