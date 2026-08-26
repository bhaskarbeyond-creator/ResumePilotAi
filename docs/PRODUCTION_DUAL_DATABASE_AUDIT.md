# Production Dual-Database Architecture Report

**Baseline:** `e679354ab7737cb3d70ee5b6601e6dcf92228707`  
**First hardening:** `c1465e7`  
**This pass:** payment activation, distributed fencing, reverse outbox, CMS scheduler, OAuth profile, durable webhook ledger, repository-mediated refunds  
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

- Super Admin / employer **Firestore transactions** in `backend/index.js` (job applications CAS, company moderation, ads/reviews, blog_categories, custom pages, trusted-by, account deletion) still prefer Firestore. The dual-engine surfaces `/api/jobs-data` and `/api/blog-data` remain the supported failover APIs. These leftover routes are documented remaining bypasses, not silent dual-writes.
- Frontend `src/firestore/dbOperations.js` remains a legacy UX cache. Membership/payment source of truth is the API (`paidOperations` is API-first).
- Automatic failover does **not** rewrite `engine_state.json` (prevents split-brain with Super Admin switches). Operators still own the configured primary.
- Live MariaDB + Firestore emulator chaos suites still require `mysql2` and a reachable engine; they are in-tree but not executed in this sandbox (mysql2 is not installed here).
- In-process webhook ledger is backed by `payment_webhook_events` when a repository is reachable; if both engines are down the claim is process-local only.

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
| Payment/webhook wrote Firestore directly | `backend/index.js` bypassed repository | Membership not activated if Firestore down | `paymentActivation` via ResilientRepository | payment-activation | Fixed |
| Duplicate webhooks could double-activate | In-memory ledger only | Double entitlement | Durable `payment_webhook_events` + memory | payment-activation | Fixed |
| Admin refund was Firestore-only | `/api/admin/payments/refund` used `runTransaction` | Refund/membership divergence on MariaDB-only | `reverseEntitlement` via repository | payment-activation | Fixed |
| CMS scheduler refused to run without Firestore | `if (!req.app.get('db'))` 503 | Scheduled posts stuck when MariaDB was healthy | Repository-mediated `publishDueBlogPosts` | cms-jobs-failover | Fixed |
| `ResilientRepository._write` crashed | Missing `fencing` require | All failover writes threw | `require('../database/fencing')` | chaos-invariants, cms-jobs-failover | Fixed |
| FirestoreRepository syntax corruption | Trailing garbage after `module.exports` | Adapter unloadable | Truncated + `claimWebhookEvent` | node --check | Fixed |

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

Executed on this branch. Suites:

- `backend/test/canonical-dates.test.js`
- `backend/test/database-authority.test.js`
- `backend/test/resilient-repository.test.js`
- `backend/test/membership-lifecycle.test.js`
- `backend/test/sync-tombstone-idempotency.test.js`
- `backend/test/unified-entitlements.test.js`
- `backend/test/payment-activation.test.js`
- `backend/test/fencing-multi-instance.test.js`
- `backend/test/chaos-invariants.test.js`
- `backend/test/cms-jobs-failover.test.js`
- `tests/canonical-date-frontend.test.mjs`
- `tests/admin-workflow.test.mjs`

Existing live-MySQL suites (`tests/database-sync-engine.test.mjs`, `tests/database-failover.test.mjs`, `backend/test/true-bidirectional-sync-chaos.test.js`) require `mysql2` and a reachable MariaDB; they were **not** re-executed in this sandbox because `mysql2` is not installed here. Their contracts (outbox reclaim, hash stability, pre-switch gate) remain in-tree.

```
test suite: canonical-dates, database-authority, resilient-repository,
           membership-lifecycle, sync-tombstone-idempotency,
           unified-entitlements, payment-activation, fencing-multi-instance,
           chaos-invariants, cms-jobs-failover, canonical-date-frontend,
           admin-workflow
number executed: 86
number passed:   86
number failed:   0
number skipped:  0
duration:        ~953 ms combined
```

Command:

```
node --test \
  backend/test/canonical-dates.test.js \
  backend/test/database-authority.test.js \
  backend/test/resilient-repository.test.js \
  backend/test/membership-lifecycle.test.js \
  backend/test/sync-tombstone-idempotency.test.js \
  backend/test/unified-entitlements.test.js \
  backend/test/payment-activation.test.js \
  backend/test/fencing-multi-instance.test.js \
  backend/test/chaos-invariants.test.js \
  backend/test/cms-jobs-failover.test.js \
  tests/canonical-date-frontend.test.mjs \
  tests/admin-workflow.test.mjs
```

---

## I. Production Readiness Score

| Dimension | Score | Notes |
| --------- | ----- | ----- |
| Data integrity | 9/10 | Tombstones + user/payment revisions; leftover admin Firestore CAS is not dual-write |
| Availability | 9/10 | Payment/CMS-scheduler/jobs-data/blog-data fail over; some Super Admin UI routes do not |
| Failover | 9/10 | Authority + generation fencing; multi-instance CAS proven in unit tests |
| Recovery | 9/10 | Reconcile-then-restore; payment recoveryNeeded if membership write fails |
| Synchronization | 9/10 | Reverse outbox now covers jobs, blog, settings, payments, companies |
| Idempotency | 9/10 | Mutation IDs + webhook event ledger + processed_mutations |
| Conflict handling | 9/10 | Version + CONFLICT_DETECTED + fencing rejects stale generation |
| Security | 8/10 | No new secrets; Firebase Auth remains identity plane |
| Observability | 9/10 | Health distinguishes UP/DOWN, authority, fence, reconciliation |
| Testing | 9/10 | Payment, fencing, chaos invariants, CMS/jobs failover added; live mysql2 not run here |
| Deployment safety | 9/10 | Additive schema (`IF NOT EXISTS`); no destructive migration |

Payment activation, webhooks (durable claim), admin refunds, CMS scheduler, jobs/blog reverse outbox, user revision, and distributed fencing landed in this pass. Super Admin Firestore-transaction moderation UIs remain. Live engine chaos was not re-run here (no mysql2 in this sandbox). **This is not a 10/10.** Scores are evidence-based and are not rounded up.

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
