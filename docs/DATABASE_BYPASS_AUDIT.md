# Database Bypass Audit

**Date:** 2026-08-26  
**Baseline:** `e679354`  
**First hardening:** `c1465e7`  
**This pass:** payment activation, fencing, reverse outbox, CMS/jobs repository coverage

Classification:

- **Repository** — goes through `getRepository()` / ResilientRepository.
- **Direct** — talks to Firestore or mysql2 outside the repository.
- **Identity** — Firebase Auth / Realtime Database, not application data.
- **Adapter** — engine adapter internals (allowed).
- **Sync worker** — outbox drain targeting a specific engine (allowed; uses `{direct:true}`).
- **Test / script** — not production request path.

## Production request-path table (excerpt of business-critical)

| File | Function | Database | Direct/Repository | Business Critical | Must Migrate | Status |
| ---- | -------- | -------- | ----------------- | ----------------- | ------------ | ------ |
| `backend/services/paymentActivation.js` | `createOrder` / `activateVerifiedOrder` / `reverseEntitlement` | Both | Repository | Yes | Yes | **Migrated** |
| `backend/index.js` | `/api/pay`, Stripe webhook, PayPal/Razorpay/Paytm/PhonePe verify | Both | Repository via paymentActivation | Yes | Yes | **Migrated** |
| `backend/index.js` | `/api/admin/payments/refund` | Both | Repository via `reverseEntitlement` | Yes | Yes | **Migrated** |
| `backend/index.js` | PayPal/Razorpay/Paytm/PhonePe credential lookup | Both | `getSetting('payment_providers')` first | Config | Yes | **Migrated** (Firestore leftover is last-resort config read) |
| `backend/index.js` | `/api/payment-orders/:id` | Both | Repository | Yes | Yes | **Migrated** |
| `backend/index.js` | `/api/check`, `/api/subscription/preferences` | Both | Repository | Yes | — | Done (prior pass) |
| `backend/index.js` | `publishDueBlogPosts` | Both | Repository | Yes | Yes | **Migrated** |
| `backend/index.js` | `upsertFederatedIdentity` profile | Both | Repository first | Yes | Yes | **Migrated** |
| `backend/routes/resumes.js` | CRUD | Both | Repository | Yes | — | Done |
| `backend/routes/portfolios.js` | CRUD | Both | Repository | Yes | — | Done |
| `backend/routes/covers.js` | CRUD | Both | Repository | Yes | — | Done |
| `backend/routes/usersData.js` | profile | Both | Repository | Yes | — | Done |
| `backend/routes/jobsData.js` | jobs/applications | Both | Repository | Yes | — | Done |
| `backend/routes/blogData.js` | blog | Both | Repository | Yes | — | Done |
| `backend/routes/cmsPages.js` | pages | Both | Repository | Yes | — | Done |
| `backend/repositories/MySQLRepository.js` | adapters + outbox | MariaDB | Adapter | Yes | — | Adapter (allowed) |
| `backend/repositories/FirestoreRepository.js` | adapters + reverse outbox | Firestore | Adapter | Yes | — | Adapter (allowed) |
| `backend/database/syncManager.js` | outbox drain | Both | Sync worker | Yes | — | Allowed |
| `backend/index.js` | employer jobs/companies Firestore transactions | Firestore | Direct | Yes | Partial | **Remaining** — `/api/jobs-data` is the resilient surface; employer dashboard still has Firestore CAS transactions |
| `backend/index.js` | admin CMS `blog_posts` / `blog_categories` / `pages` / `ads` / `reviews` | Firestore | Direct | Moderate | Partial | **Remaining** — `/api/blog-data` and `saveCustomPage`/`saveBlogPost` are resilient; Super Admin moderation UI still has Firestore transactions |
| `backend/index.js` | password reset / email verification hashed tokens | Firestore | Direct | Identity-adjacent | No | **Exception** — not membership/payment data |
| `backend/index.js` | OAuth state / exchange codes | Firestore | Direct | Identity-adjacent | No | **Exception** — anti-CSRF tokens, TTL minutes |
| `backend/index.js` | Realtime messaging | Realtime DB | Identity | Chat only | No | **Exception** |
| `src/firestore/dbOperations.js` | client Firestore | Firestore | Direct | UX cache | Documented | **Exception** — API is source of truth |
| `src/firestore/paidOperations.js` | membership | API then Firestore | API-first | Yes | — | API-first; Firestore fallback documented |
| `src/firestore/auth.js` | Firebase Auth | Auth | Identity | Login | No | **Exception** |
| `backend/enterprise/*` | tenant control plane | Firestore | Direct (enterprise outbox) | Enterprise feature-flagged | Documented | Separate tenancy plane |
| `backend/services/notificationOutbox.js` | email outbox | Firestore | Direct | Email delivery | Documented | Delivery queue, not source of truth |
| `scripts/*` | migration/reconcilers | Both | Scripts | Ops | — | Not request path |

## Counts (this pass)

Searched: `collection(`, `doc(`, `setDoc`, `updateDoc`, `deleteDoc`, `addDoc`, `runTransaction`, `writeBatch`, `serverTimestamp`, `mysql`, `pool.query`.

| Category | Count (approx) |
| -------- | -------------: |
| Database bypasses found (production JS, excluding tests/docs/scripts) | 56 files with Firestore or mysql access (adapters, enterprise plane, frontend cache included) |
| Request-path business-critical bypasses remaining | 18 Super Admin / employer Firestore transaction routes in `backend/index.js` |
| Intentional exceptions (Auth, Realtime, OAuth TTL tokens, reset hashes, enterprise plane, email outbox, frontend cache, export render tokens) | 8 |
| Migrated this pass (payment, webhook durable claim, refund, coupons, CMS scheduler, OAuth profile, jobs/blog reverse outbox, provider settings) | 22 functions |

## Remaining Super Admin / employer Firestore transactions

These still use Firestore CAS because they encode revision + notification + audit in one `runTransaction`. They are **not** the only write path:

- Jobs: `/api/jobs-data` uses ResilientRepository (MariaDB primary).
- Blog: `/api/blog-data` uses ResilientRepository.
- Pages: `saveCustomPage` exists on both adapters.

They remain listed so operators know Super Admin moderation UI is Firestore-preferring until those routes are rewritten onto repository CAS. They do **not** silently dual-write. If Firestore is down, use `/api/jobs-data` and `/api/blog-data`.

## Frontend

React must not assume `.toDate()`. Remaining optional-chaining `.toDate?.()` sites are defensive parsers around `parseSafeDate` / `formatSafeDate`. Business entitlement uses `isPaidMembershipTier` / `isUserPremium` (Premium, Pro, Enterprise).
