# Database Ownership Matrix

Generated: 2026-08-28T15:56:33Z

## Architecture Actually Observed Locally

The checked-out application is MariaDB-authoritative for application data. Firebase Authentication is retained for identity. PostgreSQL application ownership was not found in active runtime code during this pass; all production repository wiring resolves to MySQL/MariaDB.

| Domain | Owner database | Authoritative tables / store | Write path | Read path | Consistency / sync | Failure behavior | Backup / retention | Index/constraint verification | Migration status | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Identity tokens / external user auth | Firebase Auth | Firebase Auth user directory | Firebase SDK/Admin Auth | Firebase SDK/Admin Auth | External identity source; app stores profile reference | Auth unavailable blocks auth flows only | Firebase provider controls | NOT VERIFIED live | Retained | NOT VERIFIED live, static VERIFIED |
| User profile | MariaDB | `users` | `/api/users-data/profile`, repository `saveUserWithRevisionGuard` | `getUser` | Single-owner ACID | 503 controlled DB error after fix | DB backup required | Unit/integration only | Migrated | FIXED |
| Resumes / autosave | MariaDB | `resumes`, `public_resumes` | `/api/resumes/:id` | `/api/resumes` | Single-owner ACID + revision guard | 503 controlled DB error | DB backup required | Unit/integration only | Migrated | VERIFIED locally |
| Portfolios | MariaDB | `portfolios` | `/api/portfolios` | `/api/portfolios`, public slug reads | Single-owner ACID | 503 controlled DB error | DB backup required | Unit/integration only | Migrated | VERIFIED locally |
| Cover letters | MariaDB | `covers` | `/api/covers` | `/api/covers` | Single-owner | 503 controlled DB error | DB backup required | Unit/integration only | Migrated | VERIFIED locally |
| Jobs / companies / applications | MariaDB | `jobs`, `companies`, `applications`, `job_tracker` | employer/job APIs and tracker APIs | public/admin/employer APIs | Single-owner; app-level owner checks | 503 controlled DB error | DB backup required | Unit/integration only | Migrated | VERIFIED locally |
| Billing / payments / invoices | MariaDB | `payment_orders`, `payment_webhook_events`, `invoices`, `credit_notes`, coupons | Provider endpoints/webhooks | owner/admin APIs | ACID, idempotency, immutable invoice snapshots | fail-closed, no client-authored payment truth | Legal retention required | Unit/integration only | Migrated | VERIFIED locally |
| Notifications / outbox | MariaDB | `notifications`, `notification_outbox` | lifecycle transactions | notification APIs/workers | Durable transactional outbox | skipped DB drill without disposable DB | Backup required | Runtime drill partially skipped | Migrated | NOT VERIFIED full failure drill |
| Enterprise tenants/control plane | MariaDB | enterprise tables | `/api/enterprise` routers | `/api/enterprise` routers | Tenant context/RBAC and outbox | Requires live tenant tests | Backup required | Unit/integration only | Migrated | NOT VERIFIED live |
| CMS/blog/static catalogs | MariaDB | `blog`, `custom_pages`, `trusted_by`, `reviews`, `system_settings` | admin APIs | public/admin APIs | Single-owner revisioned writes | 503 controlled DB error | Backup required | Unit/integration only | Migrated | VERIFIED locally |
| AI settings / provider secret projections | MariaDB + env | `system_settings` and server env | admin APIs | server-only loaders / secret-free projections | No browser secret exposure | Provider failures controlled | Secrets not in repo | Static tests | Migrated | VERIFIED locally |

## PostgreSQL

No active PostgreSQL owner was verified in the local runtime. Claims that PostgreSQL owns document/search/AI domains are **NOT VERIFIED** for this repository state.
