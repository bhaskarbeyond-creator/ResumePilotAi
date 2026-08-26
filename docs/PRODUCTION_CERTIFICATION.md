# Production Dual-Database Certification

**Date:** 2026-08-26  
**Baseline:** `e679354`  
**First hardening:** `c1465e7`  
**Second hardening:** `20ae869`  
**This closure pass:** see FINAL COMMIT

This document is evidence-based. **NOT TESTED** and **FAIL** are not converted into PASS.

## Environment

| Layer | This sandbox |
| ----- | ------------ |
| Unit tests | Executed (Node 22) |
| `mysql2` npm package | Installed under `backend/node_modules` |
| Live MariaDB server | **Not available** — `apt-get install mariadb-server` failed (Debian mirrors unreachable) |
| Firestore emulator | **Not executed** — `firebase-tools` / emulator not installed |
| Chaos vs real engines | **Not executed** |

## Certification matrix

| Requirement | Evidence | Result |
| ----------- | -------- | ------ |
| MariaDB failure | Unit: ResilientRepository + chaos-invariants + resilient-mutations | PASS (unit) / **NOT TESTED live** |
| Firestore failure | Unit: authority + repository | PASS (unit) / **NOT TESTED emulator** |
| Both unavailable | Unit: 503 `BOTH_DATABASES_UNAVAILABLE` | PASS (unit) |
| Automatic failover | Unit: DatabaseAuthority threshold | PASS (unit) / **NOT TESTED live** |
| Recovery | Unit: `completeRecovery` | PASS (unit) / **NOT TESTED live** |
| Reconciliation | Unit: RECONCILING → RECOVERED | PASS (unit) / **NOT TESTED live** |
| Conflict handling | Unit: CONFLICT_DETECTED, CAS | PASS (unit) |
| Tombstones | Unit: sync-tombstone-idempotency | PASS (unit) |
| Idempotency | Unit: payment, applications, deletion | PASS (unit) |
| Payment | Unit: payment-activation | PASS (unit) / **NOT TESTED live chaos** |
| Membership | Unit: membership-lifecycle | PASS (unit) |
| Jobs | Unit: cms-jobs-failover + mutations | PASS (unit) |
| CMS | Unit: cms-jobs-failover + mutations | PASS (unit) |
| Companies | Unit: resilient-mutations | PASS (unit) |
| Applications | Unit: resilient-mutations CAS | PASS (unit) |
| Account deletion | Unit: durable workflow | PASS (unit) |
| Multi-worker fencing | Unit: fencing-multi-instance | PASS (unit) / **NOT TESTED multi-process + MariaDB `database_authority`** |
| Manual switch race | Unit: `assertManualSwitchAllowed` | PASS (unit) |
| Security parity | Fallback uses same repository + auth middleware | PASS (code audit) |
| Data-loss test | Unit chaos invariants | PASS (unit) / **NOT TESTED live** |
| Real MariaDB suites | `tests/database-failover.test.mjs` 3/3 (no live server required for those 3). `true-bidirectional-sync-chaos.test.js` **not run** (needs mysqld) | PARTIAL |
| Firestore emulator | Not run | **NOT TESTED** |

## 10/10 gate

Cannot certify **10/10**. Live MariaDB process and Firestore emulator were not available in this environment. Remaining Firestore `runTransaction` paths exist for Super Admin **settings** (AI/quota/payment-settings/system-health), identity-adjacent tokens, and some admin list reads.

Supported employer/CMS/jobs/companies/applications/ads/reviews/pages/trusted-by/refund/payment mutations now go through `resilientMutations` / `paymentActivation` / `accountDeletion` → ResilientRepository.
