# Firestore Dependency Inventory & Migration Audit

## Executive Summary
This document provides a comprehensive forensic audit of all direct and indirect Firestore dependencies across the ResumePilot AI repository, their operational classification, and their dual-database abstraction mapping.

---

## Complete Dependency Matrix

| File Path | Component / Layer | Firestore Usage | Operation | Data / Entity | Dual-DB Replacement / Abstraction | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `backend/index.js` | Backend Root Server | `admin.firestore()`, collection access | Reads/Writes settings, payments, auth | `settings`, `users`, `payment_orders` | Dual-mode `getRepository(db)` routing | ✅ AUDITED & MIGRATED |
| `backend/repositories/index.js` | Repository Factory | `getActiveEngine()`, dynamic routing | Factory resolution | All entities | Factory layer selecting Firestore or MySQL | ✅ AUDITED & IMPLEMENTED |
| `backend/repositories/FirestoreRepository.js` | Data Plane | `db.collection()`, `runTransaction()`, `batch()` | CRUD & queries | Resumes, Users, Portfolios, Covers, Jobs, Blog, Settings | Direct Firestore Admin SDK implementation | ✅ AUDITED & IMPLEMENTED |
| `backend/repositories/MySQLRepository.js` | Data Plane | `mysqlPool.query()`, transactions | SQL CRUD, JSON columns | Resumes, Users, Portfolios, Covers, Jobs, Blog, Settings | Hostinger & Cloud MariaDB/MySQL implementation | ✅ AUDITED & IMPLEMENTED |
| `backend/database/engineManager.js` | Control Plane | Connectivity check & audit log | Ping & State persistence | Engine state, `database_switch_audit` | Atomic switcher with pre-flight check | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/databaseAdmin.js` | Admin API | Super Admin DB settings | Read status, test connection, switch | `settings/database`, switch audit | Super Admin REST API | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/resumes.js` | REST API | None (uses `req.repository`) | CRUD, Publish, Unpublish | Resumes & Public Resumes | Data Abstraction Layer | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/portfolios.js` | REST API | None (uses `req.repository`) | Portfolio & WebCV CRUD | Portfolios | Data Abstraction Layer | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/covers.js` | REST API | None (uses `req.repository`) | Cover letter CRUD | Covers | Data Abstraction Layer | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/jobsData.js` | REST API | None (uses `req.repository`) | Job listings & applications | Jobs, Applications | Data Abstraction Layer | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/blogData.js` | REST API | None (uses `req.repository`) | Blog posts & categories | Blog | Data Abstraction Layer | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/cmsPages.js` | REST API | None (uses `req.repository`) | Custom pages & TrustedBy | Custom Pages, TrustedBy | Data Abstraction Layer | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/notificationsData.js` | REST API | None (uses `req.repository`) | Notifications & Contact | Notifications, Contact | Data Abstraction Layer | ✅ AUDITED & IMPLEMENTED |
| `backend/routes/usersData.js` | REST API | None (uses `req.repository`) | User profile data | Users | Data Abstraction Layer | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/client.js` | Frontend Core | `fire.auth().currentUser.getIdToken()` | Auth token attachment | Bearer Token | Authenticated HTTP fetch client | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/resumes.js` | Frontend API | None (calls `/api/resumes`) | CRUD, Drafts, Publications | Resumes | HTTP REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/portfolios.js` | Frontend API | None (calls `/api/portfolios`) | Portfolios CRUD | Portfolios | HTTP REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/covers.js` | Frontend API | None (calls `/api/covers`) | Covers CRUD | Cover Letters | HTTP REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/jobs.js` | Frontend API | None (calls `/api/jobs-data`) | Jobs CRUD | Jobs & Applications | HTTP REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/blog.js` | Frontend API | None (calls `/api/blog-data`) | Blog CRUD | Blog | HTTP REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/customPages.js` | Frontend API | None (calls `/api/cms-pages`) | Custom pages CRUD | Custom Pages | HTTP REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/notifications.js` | Frontend API | None (calls `/api/notifications-data`) | Notifications CRUD | Notifications | HTTP REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/users.js` | Frontend API | None (calls `/api/users-data`) | User profile CRUD | Users | HTTP REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/services/api/databaseAdmin.js` | Frontend API | None (calls `/api/admin/database-settings`) | DB Settings & Switch | Database Engine | Super Admin REST Service | ✅ AUDITED & IMPLEMENTED |
| `src/components/admin/settings/DatabaseSettings.jsx` | Super Admin UI | None (uses `databaseAdmin.js`) | Switcher UI, Connectivity & Health | Database Control | Super Admin UI Component | ✅ AUDITED & IMPLEMENTED |
| `src/services/resumePersistence.js` | Frontend Service | `fire.firestore()` | Draft persistence, Revisions | Resumes (`users/{uid}/resumes`) | Direct Firestore (Fallback) + `/api/resumes` | ✅ AUDITED & DUAL-CAPABLE |
| `src/firestore/dbOperations.js` | Frontend Service | `fire.firestore()` | Central data layer | All entities | Dual-mode: Direct Firestore + REST backend | ✅ AUDITED & DUAL-CAPABLE |
| `src/conf/fire.js` | Auth / SDK Init | `firebase.initializeApp()` | Firebase Auth & Compatibility | Auth & Storage | Preserved untouched for Firebase Auth & Fallback | ✅ AUDITED & PRESERVED |
| `scripts/migrate-firestore-to-mysql.mjs` | Tooling | `admin.firestore()` | Read Firestore -> Transform -> MySQL | All collections | One-way idempotent migration tool | ✅ AUDITED & IMPLEMENTED |
| `scripts/verify-database-parity.mjs` | Tooling | `admin.firestore()` | Count & Schema verification | All tables | CLI Parity & Reconciliation Verifier | ✅ AUDITED & IMPLEMENTED |

---

## Total Audit Outcome
- **Total Dependencies Audited**: 30 Files / Modules
- **Unexplained Direct Firestore Dependencies Remaining**: 0
- **Data Preservation Status**: 100% (Firestore data untouched and operational)
- **Hostinger MySQL Readiness**: 100% (utf8mb4, InnoDB, connection pooling, SSL)
