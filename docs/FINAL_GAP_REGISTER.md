# Final Gap Register & Defect Remediation Log

## 1. Resolved Defect Register

| Defect ID | Description | Severity | Originating Component | Root Cause | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GAP-01** | User 360 returns HTTP 503 under Firestore quota exhaustion | **CRITICAL** | `backend/routes/adminUsers.js` | Direct `requestDb.collection('users').doc(uid).get()` in `Promise.all` | **RESOLVED** | `backend/test/zero-trust-firestore-isolation.test.js:test1` |
| **GAP-02** | Direct browser Firestore `onSnapshot` listeners in React tree | **HIGH** | `src/main.jsx`, `BuildResume.jsx`, `CoverLetter.jsx` | Client listening to `data/public_config` | **RESOLVED** | `tests/unauthorized-firestore-access.test.mjs` |
| **GAP-03** | Admin Audit Logs screen vulnerable to Firestore quota limits | **HIGH** | `backend/security/adminAudit.js`, `backend/routes/adminAudit.js` | Direct Firestore collection reads without MySQL primary table | **RESOLVED** | Added `admin_audit_logs` & `security_audit_logs` MySQL tables + `backend/test/zero-trust-firestore-isolation.test.js:test4` |
| **GAP-04** | AI Entitlement calculation fails if Firestore quota exceeded | **MEDIUM** | `backend/services/adminAiEntitlement.js` | Unhandled Firestore error on `ai_usage` doc read | **RESOLVED** | Sourced user membership directly from MariaDB with fail-safe fallbacks |
| **GAP-05** | Public subscription config queries Firestore directly | **MEDIUM** | `src/firestore/dbOperations.js` | `getSubscriptionStatus` called `fire.firestore()` | **RESOLVED** | Sourced via REST API `GET /api/platform/public-config` |

---

## 2. Active System Invariants & Zero-Tolerance Policies
- **Invariant 1**: Standby failures must NEVER become primary application failures.
- **Invariant 2**: Zero direct Firestore network calls from the browser client.
- **Invariant 3**: 100% of user data and business entities are stored authoritatively in MariaDB.
- **Invariant 4**: Monotonic sequence-guaranteed outbox synchronization to Firestore standby.
