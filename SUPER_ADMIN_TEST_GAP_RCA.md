# SUPER ADMIN TEST GAP — ROOT CAUSE ANALYSIS & PREVENTION PROTOCOL

**Audit Date**: 2026-09-01  
**Subject**: Why Previous Test Suites Missed Admin CRUD Deficiencies & How Testing is Permanently Hardened  

---

## 1. The Blind Spot Analysis

The previous test suite (390+ unit tests, 41 E2E routes) reported 100% green while real CRUD actions (such as Promo Coupon creation and Phrase deletion) were broken at runtime.

### Why Tests Missed These Deficiencies:
1. **Shallow Status Code Assertion**: Tests asserted HTTP 200 on page loads or API authorization checks, but never executed a full **Create → Direct SQL Check → Read-back → Update → Delete → Direct SQL Check** lifecycle against live MariaDB.
2. **In-Memory Mocks**: Unit tests ran against `InMemoryRepository` rather than the live `MySQLRepository` with real SQL queries and table constraints.
3. **Frontend Mocking**: Frontend unit tests mocked API helper methods rather than executing real HTTP roundtrips.
4. **Silent Error Swallowing in Components**: Components with unhandled promise rejections did not throw uncaught errors to the window level, making headless browser tests believe the page operated cleanly.

---

## 2. Permanent Structural Prevention Protocol

To ensure no similar defect can ever escape:
1. **Mandatory Direct SQL Assertion in All Mutation Tests**: Every integration test that performs an admin mutation MUST query MariaDB directly using `mysql2/promise` to verify the exact row data before declaring success.
2. **Automated Cross-Layer Contract Scanner**: `scripts/forensic-superadmin-full-contract-hunt.mjs` automatically verifies that 100% of frontend `apiCall` / `fetch` endpoints map to registered Express routes and valid repository methods.
3. **Negative Invariant Testing**: `scripts/adversarial-superadmin-gap-hunt-execution.mjs` verifies that invalid revisions trigger 409 CAS conflicts, missing revisions trigger 400, non-admin callers trigger 403, and anonymous callers trigger 401.
4. **Zero-Swallow Catch Policy**: All React error catches must update state with an actionable error message and rollback optimistic toggles.
