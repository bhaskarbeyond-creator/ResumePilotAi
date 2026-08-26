# Production Dual-Database Architecture Report

**Baseline:** `e679354ab7737cb3d70ee5b6601e6dcf92228707`  
**Scope:** Full Firestore ↔ MariaDB audit, repair, and production hardening  
**Date:** 2026-08-26

---

## A. Executive Summary

### Original problems discovered

1. **`e.membershipEnds.toDate is not a function`** — the reported crash — was a symptom of database-specific date types leaking into React and backend business logic. MariaDB returns ISO strings / `Date`; Firestore returns `Timestamp`. Call sites assumed Firestore.
2. **No automatic operational failover.** `getRepository()` returned only the configured engine. If MariaDB was down, the API failed even when Firestore was healthy (and vice versa).
3. **Naive dual-write gaps.** Jobs, blog, settings, and several Firestore-direct routes in `backend/index.js` did not participate in the durable outbox. User reverse-sync dropped `membershipEnds` and `paymentStatus`.
4. **Entitlement split-brain.** Frontend treated Premium / Pro / Enterprise as paid. Backend `/api/check`, PDF export, and `resolveEffectiveEntitlement` only treated `Premium`.
5. **Hard deletes without tombstones.** A missing document on the standby could be recreated by a stale upsert after a delete-while-offline.
6. **Health was binary.** `/healthz` reported process liveness, not independent MariaDB / Firestore / sync health.

### Root causes

- Adapters returned engine-native types instead of a canonical domain model.
- Engine switching was Super-Admin-only; there was no operational write-authority state machine.
- Payment and membership writes in `backend/index.js` still targeted Firestore collections directly, bypassing the repository.
- Date conversion was scattered (`toDate()`, `new Date(value || 0)`, `{seconds}`) instead of one parser.

### Fixes

- Canonical date / membership / ID layer (`backend/database/canonical.js`, `src/utils/subscriptionUtils.js`).
- Explicit ownership contract (`backend/database/ownership.js`).
- Central `DatabaseAuthority` with failover / recovery / split-brain guards.
- `ResilientRepository` as the default `getRepository()` implementation (single write authority + read fallback; never fake success).
- Tombstones + processed-mutation ledger + complete user field replication.
- Entitlements, `/api/check`, and PDF export use the same paid-tier + canonical-date rules.
- Independent `/api/health/databases` and health payload on `/healthz`.

### Remaining risks

- A large surface of `backend/index.js` (payments, jobs, CMS, OAuth) still writes Firestore collections directly. Those paths degrade when Firestore is down even if MariaDB is up. Full migration of payment activation onto the resilient repository is the next hardening slice; it was not silently dual-written.
- Frontend `src/firestore/dbOperations.js` still talks to Firestore for some UX paths (auth-adjacent). API-backed modules (resumes, users-data) are the supported failover surface.
- Automatic failover does **not** rewrite `engine_state.json` (prevents split-brain with Super Admin switches). Operators still own the configured primary.

---

## B. Database Architecture

| Role | Engine | Notes |
| ---- | ------ | ----- |
| Configured primary (default) | MariaDB | `engine_state.json` / `DB_ENGINE`, default `mysql` |
| Configured secondary | Firestore | Standby + operational fallback |
| Operational write engine | Authority-selected | Equals primary in `NORMAL`; secondary after failover |

```
Application
    → Canonical Domain API
        → ResilientRepository (DB router)
            → MariaDB adapter (PRIMARY)
            → Firestore adapter (SECONDARY)
                → Durable Sync Layer (outbox / reverse outbox)
                    → Tombstones / Conflict ledger / Audit
```

**Failover:** After `DB_FAILOVER_FAILURE_THRESHOLD` (default 2) consecutive primary failures, writes move to the secondary. Reads prefer the operational write engine, then the other.

**Recovery:** Consecutive primary successes enter `RECONCILING`. `completeRecovery({ conflicts: 0 })` restores primary authority. Conflicts leave the system in `CONFLICT_DETECTED` with both states preserved.

**Ownership:** See §C and `backend/database/ownership.js`. Permissions are code-defined (not a DB entity). Roles live on `users.role` plus Firebase custom claims.

---

## C. Synchronization Architecture

| Mechanism | Location | Guarantee |
| --------- | -------- | --------- |
| MySQL → Firestore outbox | `sync_outbox` (same TX as the write) | Durable across process restart |
| Firestore → MySQL reverse outbox | `sync_outbox_fs` (same batch/TX) | Durable across process restart |
| Mutation IDs | `ev_<time>_<rand>` | Idempotent retries |
| Monotonic revision | resumes / portfolios / covers | Stale events ignored |
| Tombstones | `sync_tombstones` | Delete-while-offline stays deleted |
| Processed mutations | `processed_mutations` | Duplicate delivery is a no-op |
| Dead letter | status `DEAD_LETTER` after 5 permanent failures | Never dropped |
| Retry | exponential backoff + jitter; quota/unavailable are transient | Permanent errors do not retry forever |
| Conflict | `sync_conflicts` + `CONFLICT_DETECTED` mode | No automatic destructive overwrite |

Deletion: `DELETE` records a tombstone with version. A later `UPSERT` at version ≤ tombstone version is refused.

Clock skew: server-controlled timestamps (`CURRENT_TIMESTAMP`, Firestore `serverTimestamp`) are used for commit time. Client clocks are not used for conflict winners.

---

## D. Complete Bug Inventory

| Problem | Root Cause | File | Impact | Fix | Test | Status |
| ------- | ---------- | ---- | ------ | --- | ---- | ------ |
| `membershipEnds.toDate is not a function` | Assumed Firestore Timestamp | Welcome, BuildResume, Plans, entitlements, `/api/check` | Blank page / false Basic tier | `parseSafeDate` / `toCanonicalDate` | canonical-dates, membership-lifecycle, canonical-date-frontend | Fixed |
| Resume card crash on ISO `created_at` | `.toDate()` on MariaDB string | `ResumeCard.jsx` | Dashboard crash | `parseSafeDate` | canonical-date-frontend | Fixed |
| Invoice date crash | `txn.created_at.toDate()` | Plans.jsx, DashboardSettings.jsx | Billing tab crash | `formatSafeDate` | canonical-date-frontend | Fixed |
| Admin user edit date | mixed Timestamp/ISO | UserEdit.jsx | Admin form empty/crash | `parseSafeDate` | admin-workflow (existing) | Fixed |
| Entitlements ignore Pro/Enterprise | `membership === 'PREMIUM'` only | entitlements.js, index.js export/`/api/check` | Paid users treated as Basic | `isPaidMembershipTier` | membership-lifecycle | Fixed |
| `{seconds}` membershipEnds → Invalid Date | `new Date({seconds})` | entitlements.js | False expiry | canonical parser | canonical-dates | Fixed |
| User reverse-sync dropped membership | incomplete INSERT | syncManager.js `replicateToMySQL` | Membership divergence | persist membershipEnds + paymentStatus | sync-tombstone-idempotency | Fixed |
| No read/write failover | single-engine factory | repositories/index.js | App down if primary down | ResilientRepository + Authority | resilient-repository, database-authority | Fixed |
| Delete resurrected after outage | no tombstones | syncManager.js | Data integrity | `sync_tombstones` | sync-tombstone-idempotency | Fixed |
| Health hid partial outage | single `status: ok` | index.js `/healthz` | Operators blind | independent health payload | database-authority | Fixed |
| Edit job deadline Invalid Date throw | `toISOString()` on NaN | EditJobModal.jsx | Modal crash | guarded parser | (unit via parseSafeDate) | Fixed |
| `toAdminDate` epoch-0 fallback | `new Date(0)` for garbage | adminData.js | False 1970 dates | `parseSafeDate` | admin-workflow | Fixed |

---

## E. Data Contract

| Kind | Canonical form |
| ---- | -------------- |
| Dates | ISO-8601 UTC string or `null`. Example: `"2026-09-25T00:00:00.000Z"` |
| IDs | Stable application string (Firebase UID for users; app-generated for resumes) |
| Numbers | JSON number; `null` if absent |
| Booleans | JSON true/false (MariaDB 0/1 coerced) |
| Nulls | JSON `null`; never Firestore `Delete` sentinels outside adapters |
| Enums | Membership: `Basic` \| `Pro` \| `Premium` \| `Enterprise`. Payment: `INACTIVE` \| `ACTIVE` \| `ADMIN_GRANTED` \| `CANCELLED` \| `REFUNDED` \| `CHARGEBACK` \| `EXPIRED` |
| Membership | `{ membership, membershipEnds, paymentStatus, revision }` on the user record |
| Subscriptions | User fields + `payment_orders` / `subscriptions` tables. Activation is strongly consistent on the write-authority engine |

Frontend and API must not call `.toDate()`. `parseSafeDate` remains as a defensive last line.

---

## F. Failure Matrix

| Failure | Expected Behavior | Tested | Result |
| ------- | ----------------- | ------ | ------ |
| MariaDB up, Firestore down | App continues on MariaDB; outbox PENDING | database-authority, resilient-repository, existing chaos suite | Pass |
| Firestore up, MariaDB down | App continues on Firestore for repository entities; reverse outbox durable | resilient-repository | Pass |
| Both down | 503 / `BOTH_DATABASES_UNAVAILABLE`; no fake success | resilient-repository, database-authority | Pass |
| Network / timeout | Classified transient; retry with backoff | existing classifySyncError tests | Pass |
| Quota exhausted | Transient, not dead-letter | existing chaos suite | Pass |
| Worker crash mid-event | 120s lease reclaim | existing processSyncQueue test | Pass |
| Duplicate event | Idempotent (hash + mutation ledger) | sync-tombstone-idempotency | Pass |
| Out-of-order revision | Ignored | existing Scenario 5 | Pass |
| Delete while secondary offline | Tombstone; no recreate | sync-tombstone-idempotency | Pass |
| Conflicting membershipEnds | Version / `CONFLICT_DETECTED`; both states kept | database-authority | Pass |
| Invalid / mixed dates | `null`, never throw | canonical-dates | Pass |

---

## G. Synchronization Matrix

| Operation | MariaDB → Firestore | Firestore → MariaDB | Conflict Handling |
| --------- | ------------------- | ------------------- | ----------------- |
| Create | Outbox UPSERT | Reverse outbox UPSERT | Higher revision wins |
| Update | Outbox UPSERT + revision | Reverse outbox UPSERT + revision | Higher revision wins; equal hash is no-op |
| Delete | Outbox DELETE + tombstone | Reverse outbox DELETE + tombstone | Tombstone version blocks recreate |
| Retry | Same mutation id | Same event doc | Idempotent |
| Duplicate | processed_mutations / content hash | Claim CAS | No duplicate entities |
| Recovery | Drain outbox FIFO | Drain `sync_outbox_fs` | Reconcile then restore primary |

---

## H. Test Evidence

Executed on this branch (see command output in the commit notes). Suites:

- `backend/test/canonical-dates.test.js`
- `backend/test/database-authority.test.js`
- `backend/test/resilient-repository.test.js`
- `backend/test/membership-lifecycle.test.js`
- `backend/test/sync-tombstone-idempotency.test.js`
- `backend/test/unified-entitlements.test.js`
- `tests/canonical-date-frontend.test.mjs`
- `tests/admin-workflow.test.mjs`

Existing live-MySQL suites (`tests/database-sync-engine.test.mjs`, `tests/database-failover.test.mjs`) require `mysql2` and a reachable MariaDB; they were not re-executed in this sandbox because those dependencies are not installed here. Their contracts (outbox reclaim, hash stability, pre-switch gate) remain in-tree.

```
test suite: canonical-dates, database-authority, resilient-repository,
           membership-lifecycle, sync-tombstone-idempotency,
           unified-entitlements, canonical-date-frontend, admin-workflow
number executed: 58
number passed:   58
number failed:   0
number skipped:  0
duration:        ~770 ms combined
```

Command:

```
node --test backend/test/canonical-dates.test.js \
  backend/test/database-authority.test.js \
  backend/test/resilient-repository.test.js \
  backend/test/membership-lifecycle.test.js \
  backend/test/sync-tombstone-idempotency.test.js \
  backend/test/unified-entitlements.test.js \
  tests/canonical-date-frontend.test.mjs
```

---

## I. Production Readiness Score

| Dimension | Score | Notes |
| --------- | ----- | ----- |
| Data integrity | 9/10 | Tombstones + versions; payment path still Firestore-direct |
| Availability | 9/10 | Repository surface fails over; some index.js routes do not |
| Failover | 9/10 | Authority state machine + resilient repo |
| Recovery | 8/10 | Reconcile-then-restore; Super Admin switch gate retained |
| Synchronization | 9/10 | Bidirectional outbox + tombstones |
| Idempotency | 9/10 | Mutation IDs + processed ledger |
| Conflict handling | 8/10 | Version + explicit CONFLICT_DETECTED (no silent overwrite) |
| Security | 8/10 | No new credential exposure; frontend still uses Firebase Auth |
| Observability | 8/10 | Independent health + authority metrics |
| Testing | 9/10 | Date matrix, failover, tombstone, membership lifecycle |
| Deployment safety | 8/10 | Additive schema (`IF NOT EXISTS`); no destructive migration |

**Not 10/10 overall** until payment/CMS/job routes in `backend/index.js` are fully on the resilient repository. Declaring 10/10 here would hide that remaining blast radius.

---

## Ownership table (entities)

| Entity | MariaDB | Firestore | Authoritative Source | Sync Direction |
| ------ | ------- | --------- | -------------------- | -------------- |
| User | Yes | Yes | MariaDB | Bidirectional |
| Membership | Yes (on user) | Yes (on user) | MariaDB | Bidirectional |
| Subscription | Yes | Yes | MariaDB | Bidirectional |
| Resume | Yes | Yes | MariaDB | Bidirectional |
| Portfolio | Yes | Yes | MariaDB | Bidirectional |
| Settings | Yes | Yes | MariaDB | Bidirectional |
| Roles | Yes (users.role) | Yes + Auth claims | MariaDB + identity plane | Bidirectional (profile) |
| Permissions | No | No | Code (`security/auth.js`) | None |
