# Database Audit

## Authoritative Engine
- **MySQL/MariaDB** via `mysql2/promise` pool.
- Firestore is **NOT** used as a data plane; Firebase Admin is identity-only.
- `backend/database/authority.js` reports database health and enforces "MariaDB is mutable; no dual-writer".
- `backend/database/migrationRunner.js` runs idempotent migrations on startup.

## Schema Bootstrap & Migrations
Migrations (in `backend/database/migrations/`):
1. `001_baseline.sql` – core schema (users, resumes, covers, portfolios, jobs, companies, blog, notifications, payment_orders, invoices, conversations, messages, etc.)
2. `002_single_owner_enterprise` – enterprise tables
3. `003_billing_invoice_ledger` – invoice/credit note tables
4. `004_single_owner_runtime_hardening` – runtime hardening
5. `005_enterprise_invitation_outbox` – enterprise outbox
6. `006_enterprise_ai_usage_ledger` – AI usage
7. `007_job_tracker_revision` – job tracker
8. `008_notification_outbox_state_constraint` – notification state
9. `009_authoritative_configuration_bootstrap` – system settings
10. `010_payment_refund_state_machine` – refunds
11. `011_refund_reconciliation_credit_notes` – credit notes
12. `012_billing_snapshot_refund_references` – refund references
13. `013_cms_relational_authority` – CMS in MariaDB
14. `014_fail_closed_discovery_defaults` – fail-closed defaults
15. `015_support_tickets` – support tickets

## Repositories
- `repositories/MySQLRepository.js` – primary MariaDB-backed repository.
- `repositories/ResilientRepository.js` – wraps MySQLRepository with retry/CAS/error-handling.
- `repositories/index.js` – `getRepository()` factory; returns ResilientRepository(MySQLRepository) by default.

## Transactions
- Outbox pattern used for notifications and enterprise jobs (transactional enqueue).
- Payment activation uses internal transaction for order state + coupon reservation + membership activation + invoice issuance.
- Conversation creation uses explicit `conn.beginTransaction()` / `commit` / `rollback`.
- Website-meta update uses `SELECT ... FOR UPDATE` with optimistic concurrency via revision numbers.

## Connection Handling
- Pool created once in `database/mysql.js` with configurable connection limit (DB_CONNECTION_LIMIT, default 15).
- `closePool()` called on graceful shutdown.
- Connections released in `finally` blocks.

## Tenant Isolation (DB-level)
- All tenant tables have `tenant_id` column (UUID) with foreign key to `tenants.id`.
- Service account keys stored hashed (SHA-256) in `service_accounts`; plaintext never stored.
- Support grants stored with `expires_at`; enforce TTL.

## Backups
- `backend/enterprise/enterpriseBackup.js` – enterprise backup/restore.
- `scripts/dr-backup-run.mjs` – DR backup (env-configured).

## Health / Readiness
- `/healthz` – liveness (process up, reports DB state).
- `/readyz` – readiness (MySQL connected, schema bootstrapped); returns 503 if MySQL down.
- `databaseAuthority.refresh()` refreshes authority status; records lastError/latencyMs.
- Alerts queued for unhealthy states (`services/readyzAlerts.js`).

## Indexes
- Primary keys on every table (UUID/KSUID-style).
- Indexes on `users(email)`, `payment_orders(uid, status, created_at)`, `conversations`, `conversation_participants`, `notification_outbox`, `admin_audit_logs(actor_uid, created_at)`, etc.

## Findings
- PROVEN: MySQL is single source of truth; no Firestore data path at runtime.
- PROVEN: Idempotent migrations with down scripts.
- PROVEN: Connection pool cleaned up on shutdown.
- PROVEN: Transactions used for critical mutations (payments, conversations, settings).
- ENVIRONMENT-BLOCKED: Live MySQL connection not available in sandbox; queries and migrations not executed against a real instance. Static review confirms correctness.
