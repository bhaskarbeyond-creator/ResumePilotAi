# Database Independence Matrix

**Date:** 2026-08-26  
**Primary:** MariaDB  
**Secondary / operational fallback:** Firestore  
**Identity plane (not an application database):** Firebase Authentication

Legend for failure columns:

- **Continue** — supported business function remains available on the other engine.
- **Degrade** — identity or an external provider is unavailable; application data plane still works.
- **Stop** — both engines down, or an external provider (Stripe, SMTP) is required.

| Feature | MariaDB Only | Firestore Only | Both | MariaDB Failure | Firestore Failure | Data Loss Risk |
| ------- | -----------: | -------------: | ---: | --------------- | ----------------- | -------------- |
| Login (Firebase Auth) | No | Identity only | Auth tokens | Continue (Auth independent) | Degrade if Auth/Firestore Auth Admin needed | None for app data |
| OAuth LinkedIn/GitHub | Profile via repository | State tokens historically Firestore | Profile on both | Continue profile via Firestore fallback | Continue profile via MariaDB | Low — profile written through ResilientRepository |
| User profile | Yes | Yes | Bidirectional | Continue on Firestore | Continue on MariaDB | Low — outbox + revision |
| Membership | Yes (on user) | Yes (on user) | Bidirectional | Continue | Continue | Low — versioned user revision |
| Payment orders | Yes | Yes | Bidirectional | Continue (activation on Firestore) | Continue (activation on MariaDB) | Low — mutation id + webhook ledger |
| Subscription / entitlements | Yes | Yes | Bidirectional | Continue | Continue | Low — same canonical model |
| Resume | Yes | Yes | Bidirectional | Continue | Continue | Low — revision + tombstone |
| Portfolio | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Cover letter | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Dashboard (API-backed) | Yes | Yes | Bidirectional | Continue | Continue | Low |
| CMS blog (`/api/blog-data`, scheduler) | Yes | Yes | Bidirectional | Continue | Continue | Low — scheduler no longer requires Firestore to be configured |
| Admin refund | Yes | Yes | Bidirectional | Continue | Continue | Low — `reverseEntitlement` on write-authority |
| CMS pages (`custom_pages`) | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Jobs (`/api/jobs-data`) | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Companies | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Admin user directory (`/api/users-data`) | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Settings | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Export / PDF entitlement | Reads user via repository | Fallback | Both | Continue | Continue | None |
| Contact messages | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Notifications | Yes | Yes | Bidirectional | Continue | Continue | Low |
| Messaging (Realtime Database) | No | Realtime DB (not Firestore) | External | Continue | Continue | N/A — not a Firestore/MariaDB entity |
| Password reset tokens | No | Firestore (identity-adjacent) | Auth | Degrade reset email | Continue if MariaDB unused | Documented exception: hashed tokens, not business data |
| Stripe / PayPal / Razorpay | Persistence on write-authority | Persistence on write-authority | Both | Continue persistence | Continue persistence | Provider is external; order is durable |

## Intentional exceptions (not application-database dependence)

1. **Firebase Authentication** — identity provider. If Auth is down, login/token minting degrades. Profile, membership, resumes, payments still use MariaDB/Firestore.
2. **Firebase Realtime Database** — employer/candidate chat only. Not a substitute for Firestore as the application database.
3. **Payment providers (Stripe, PayPal, Razorpay, Paytm, PhonePe)** — external. Order and membership persistence is engine-independent; capturing money requires the provider.
4. **SMTP / email** — delivery, not source of truth.
5. **Frontend `src/firestore/dbOperations.js`** — legacy client cache. Authoritative paths are `/api/*` → ResilientRepository. Direct Firestore is fallback UX, not the payment/membership source of truth.

## Absolute invariant

If MariaDB disappears, supported application data operations continue on Firestore.  
If Firestore disappears, they continue on MariaDB.  
If both disappear, the API returns 503 `BOTH_DATABASES_UNAVAILABLE` and never fakes success.
