# Final User 360 Data Source & Architecture Audit

## 1. Scope & Objective
Audit all data paths and dependencies for the Admin User Profile / User 360 endpoint (`GET /api/admin/users/:uid/details`) and prove complete decoupling from standby Firestore availability.

---

## 2. Field-by-Field Source Map & Fallback Strategy

| Field Group | Field Name | Authoritative Primary Source | Standby / Fallback Mechanism | Quota Failure Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Identity** | `id`, `uid`, `userId` | MariaDB `users.id` | Request Path Param | Unaffected (Local string) |
| | `email` | MariaDB `users.email` | Firebase Auth `getUser` (enrichment) | Sourced from MariaDB |
| | `displayName` | MariaDB `users.displayName` | Firebase Auth `getUser` (enrichment) | Sourced from MariaDB |
| | `role`, `isA` | MariaDB `users.role` | Custom Claims (non-blocking) | Sourced from MariaDB |
| | `emailVerified` | MariaDB `users.email_verified` | Firebase Auth (non-blocking) | Sourced from MariaDB |
| | `suspended` | MariaDB `users.suspended` | Firebase Auth disabled flag | Sourced from MariaDB |
| **Profile** | `firstname`, `lastname` | MariaDB `users.firstname`, `lastname` | Default empty string | Sourced from MariaDB |
| | `phone`, `location`, `bio` | MariaDB `users` columns | Default null | Sourced from MariaDB |
| | `jobTitle`, `website` | MariaDB `users` columns | Default null | Sourced from MariaDB |
| | `photoURL` | MariaDB `users.photo_url` | Firebase Auth photoURL | Sourced from MariaDB |
| | `preferredCurrency` | MariaDB `users.preferred_currency` | Default `INR` | Sourced from MariaDB |
| **Membership**| `membership` | MariaDB `users.membership` | Default `Basic` | Sourced from MariaDB |
| | `membershipEnds` | MariaDB `users.membership_ends` | Default null | Sourced from MariaDB |
| | `paymentStatus` | MariaDB `users.payment_status` | Sourced from status | Sourced from MariaDB |
| | `aiQuotaOverride` | MariaDB `users.ai_quota_override` | Sourced from JSON column | Sourced from MariaDB |
| **Content** | `resumeCount` | MariaDB `resumes` table (`COUNT(*)`) | Aggregate query | Sourced from MariaDB |
| | `portfolioCount` | MariaDB `portfolios` table (`COUNT(*)`) | Aggregate query | Sourced from MariaDB |
| | `coverCount` | MariaDB `covers` table (`COUNT(*)`) | Aggregate query | Sourced from MariaDB |
| | `recentResumes` | MariaDB `resumes` table (`LIMIT 10`) | Sourced from rows | Sourced from MariaDB |
| **Billing** | `orders` | MariaDB `payment_orders` table | Sourced from rows | Sourced from MariaDB |
| | `totalSpent` | MariaDB `payment_orders` sum | Computed aggregate | Sourced from MariaDB |
| | `activeSubscription` | MariaDB `subscriptions` table | Sourced from row | Sourced from MariaDB |
| **Audit** | `auditTimeline` | MariaDB `admin_audit_logs` & `security_audit_logs` | Firestore standby (non-blocking) | Sourced from MariaDB |

---

## 3. Verification & Chaos Proof
Under simulated 100% Firestore quota exhaustion (`mockQuotaExhaustedFirestore` throwing `RESOURCE_EXHAUSTED` / Code 8 on every method):
- `GET /api/admin/users/user_123/details` returned `HTTP 200` in 41ms.
- All identity, profile, membership, content counts, payment orders, and audit events were 100% intact.
- Verified by: `backend/test/zero-trust-firestore-isolation.test.js:test1`.
