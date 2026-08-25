# Complete Database Migration & Dependency Audit

## Executive Summary
This document provides a forensic audit of all direct and indirect database dependencies across the ResumePilot AI repository, documenting exact operations, affected collections/tables, persistence replacements, and architectural justifications.

---

## Complete Forensic Inventory

| File | Operation | Collection / Table | Purpose | Replacement / Abstraction | Firestore Exception | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/services/resumePersistence.js` | CRUD | `users/:uid/resumes` | Draft saving & retrieval | `/api/resumes` via REST API | Offline / Disconnected Fallback | ✅ VERIFIED |
| `src/services/profilePersistence.js` | Write / Merge | `users/:uid` | User profile management | `/api/users-data/profile` | Offline Fallback | ✅ VERIFIED |
| `src/components/BuildResume/BuildResume.jsx` | Read / Save | `users/:uid/resumes` | Resume Builder UI | `resumePersistence.js` | None (Direct calls removed) | ✅ VERIFIED |
| `src/components/CoverLetter/CoverLetter.jsx` | Read / Save | `users/:uid/covers` | Cover Letter UI | `covers.js` API client | None (Direct calls removed) | ✅ VERIFIED |
| `src/components/admin/dashboard/dashboard.jsx` | Aggregations | `stats`, `payment_orders` | Platform Command Center | `/api/platform/command-center` | None (Direct calls removed) | ✅ VERIFIED |
| `src/components/admin/settings/DatabaseSettings.jsx` | Switch / Test / Sync | `sync_outbox`, `database_switch_audit` | Super Admin Database Control | `/api/admin/database-settings` | None | ✅ VERIFIED |
| `backend/routes/resumes.js` | REST CRUD | `resumes` / `users/:uid/resumes` | Resume persistence API | `getRepository(getActiveEngine())` | Dual-Engine Provider | ✅ VERIFIED |
| `backend/routes/portfolios.js` | REST CRUD | `portfolios` / `users/:uid/portfolios` | Portfolio persistence API | `getRepository(getActiveEngine())` | Dual-Engine Provider | ✅ VERIFIED |
| `backend/routes/covers.js` | REST CRUD | `covers` / `users/:uid/covers` | Cover letter persistence API | `getRepository(getActiveEngine())` | Dual-Engine Provider | ✅ VERIFIED |
| `backend/routes/usersData.js` | REST Read/Write | `users` / `users/:uid` | User profiles API | `getRepository(getActiveEngine())` | Dual-Engine Provider | ✅ VERIFIED |
| `backend/routes/databaseAdmin.js` | Control Plane | `database_engine_state`, `sync_outbox` | Engine switching & sync | `syncManager.js` & `engineManager.js` | Dual-Engine Provider | ✅ VERIFIED |
| `backend/services/platformHealth.js` | Health Probes | `system_settings`, `stats` | Operational Health Probes | Native MariaDB Probe / Firestore Merge | Dual-Engine Provider | ✅ VERIFIED |
| `backend/services/firebaseAdmin.js` | Identity / Auth | `Firebase Auth SDK` | Token verification & TOTP MFA | Firebase Auth (Preserved) | Sacred Invariant: Identity Auth | ✅ VERIFIED |

---

## Architectural Rules & Guarantees
1. **Zero Unexplained Direct Firestore Access**: Every frontend application state operation routes through `src/services/api/*` and the backend Repository Factory.
2. **Sacred Firebase Auth Invariant**: User authentication, sessions, and passwords remain in Firebase Auth. Database switching modifies application storage only and never logs users out or mutates user UIDs.
3. **Sacred Firebase Storage Invariant**: Storage assets (profile photos, resume uploads, logos) remain served through Firebase Storage URLs.
