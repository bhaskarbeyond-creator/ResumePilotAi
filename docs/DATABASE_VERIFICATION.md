# Database Parity & Reconciliation Verification

## 1. Automated Verification Commands

| Command | Purpose | Expected Output |
| :--- | :--- | :--- |
| `npm run test:db-parity` | Runs Repository Contract Parity & Switch Safety Test Suites | 10 passed, 0 failed |
| `node --test backend/test/database-admin.test.js` | Runs Super Admin API and RBAC Security Tests | 5 passed, 0 failed |
| `npm run db:verify` | Runs Live Table & Collection Parity Reconciliation Matrix | Tabular report with parity status |
| `npm run db:migrate:firestore-to-mysql -- --dry-run` | Runs Simulation Migration without writing to DB | 0 errors |
| `npm run build` | Validates Production Frontend Bundle Compilation | Exit code 0 |

---

## 2. Parity Test Matrix Results

```text
▶ Dual-Database Repository Parity Test Suite
  ✔ 1. FirestoreRepository creates, retrieves, and updates resume drafts with revisions
  ✔ 2. FirestoreRepository rejects conflicting concurrent saves (RESUME_CONFLICT)
  ✔ 3. FirestoreRepository supports publish and unpublish lifecycle
  ✔ 4. MySQLRepository contracts match FirestoreRepository exactly (100% symmetric methods)
  ✔ 5. User and Setting domain methods are symmetric across repositories
✔ Dual-Database Repository Parity Test Suite (PASS)

▶ Database Engine Switching Safety Test Suite
  ✔ 1. getActiveEngine returns either firestore or mysql
  ✔ 2. testEngineConnectivity handles known and unknown engines safely
  ✔ 3. switchActiveEngine rejects invalid database names
  ✔ 4. switchActiveEngine fails safely if target database is unreachable
  ✔ 5. Safe idempotent switch when target engine matches current engine
✔ Database Engine Switching Safety Test Suite (PASS)

▶ Database Admin RBAC Security Test Suite
  ✔ 1. Unauthenticated request to /api/admin/database-settings is rejected with 401
  ✔ 2. Plain USER request to /api/admin/database-settings is rejected with 403
  ✔ 3. ADMIN / SUPER_ADMIN can read database settings and connectivity status
  ✔ 4. Test connection endpoint validates engine argument
  ✔ 5. Test connection to firestore returns connectivity report
✔ Database Admin RBAC Security Test Suite (PASS)
```

---

## 3. Rollback & Fallback Verification
- **Direction 1 (Firestore -> MySQL)**: Verified via pre-flight check and persistent state.
- **Direction 2 (MySQL -> Firestore)**: Verified via immediate toggle in Super Admin UI, instant reversion to Firestore data plane without logging out users or altering Firebase Authentication state.
