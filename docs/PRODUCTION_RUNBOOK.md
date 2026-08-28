# ResumePilot AI Production Runbook

## Scope and authority

This runbook covers the current production architecture:

- **Firebase Authentication** is the identity plane only.
- **MariaDB** is the only application-data authority for the legacy/product and enterprise transactional domains.
- No application-data request may fall back to a Firebase database product, a browser cache, or another database when MariaDB is unavailable.
- Required asynchronous delivery uses a MariaDB transactional outbox. An accepted queue write is not evidence that an email or downstream action was delivered.

If MariaDB cannot safely serve a mutation, return a controlled failure and retain the caller's local recovery state. Never switch owners during an incident.

## 1. Release prerequisites

Before approving a production release:

1. Confirm the candidate is a full commit SHA on `main`; never deploy an uncommitted worktree.
2. Run the repository quality gates and a fresh production build.
3. Run the isolated MariaDB migration verifier against the supported MariaDB version.
4. Record a recent, restorable backup reference and an approved change identifier.
5. Run authenticated Chromium journeys at the required 375, 768, 1024, and 1440 pixel viewports.
6. Verify controlled MariaDB, identity-provider, queue-worker, and PDF-renderer failure paths.
7. Obtain the protected production-environment approval.

A unit test, static test, process-liveness check, or successful build is not production proof. Missing evidence must be recorded as `NOT VERIFIED`.

## 2. Secure identity configuration

Prefer **Workload Identity** or Application Default Credentials for Firebase Admin Authentication. Do not place a service-account JSON file in the repository or web root. Long-lived private keys are a last-resort deployment secret and must be rotated through the identity provider.

Firebase web configuration contains public client identifiers, but it still belongs only in the approved frontend variables. Server credentials, database passwords, AI keys, OAuth secrets, payment secrets, signing keys, and SMTP passwords must never use a `VITE_` variable or appear in a browser response.

After identity configuration changes, verify:

- a valid Firebase ID token is accepted;
- a missing, malformed, expired, or revoked token is rejected;
- email verification and recent-authentication gates remain enforced;
- MFA claims are required on protected administrator workflows;
- Firebase Admin is not initialized with any application-data database adapter.

## 3. MariaDB configuration and migrations

The application discovers ordered migrations from `backend/database/migrations`. Applied versions and checksums are recorded in `schema_migrations`; mismatches and unknown applied versions fail closed.

Production migration application requires:

- `DB_BACKUP_REFERENCE` — immutable reference to a verified backup;
- `DB_BACKUP_VERIFIED_AT` — verification time inside the allowed age window;
- `DB_MIGRATION_CHANGE_ID` — approved change/ticket identifier;
- `DB_MIGRATION_MODE=apply` only during the approved change window.

Normal application startup should use verify mode. Never patch a production table manually to bypass a pending migration.

### Pre-migration checks

```sql
SELECT version, name, checksum, applied_at
FROM schema_migrations
ORDER BY version;

SELECT outcome, version, error_message, completed_at
FROM schema_migration_attempts
ORDER BY completed_at DESC
LIMIT 20;
```

Run `npm run verify:mariadb:migrations` against an isolated database before production. The verification must perform clean apply, rollback, and reapply; it does not substitute for a production backup.

## 4. Health and readiness

Public probes:

- `GET /healthz` — process and MariaDB authority summary.
- `GET /readyz` — readiness; returns non-success when required dependencies or migrations are not ready.
- `GET /api/health/databases` — MariaDB authority and migration status.
- `GET /api/service-availability` — boolean public feature availability without secret/configuration values.
- `GET /api/platform/version` — deployed commit identity.

Operator probes (authenticated and permission-gated):

- `GET /api/platform/operational-status`
- `GET /api/platform/operational-status/api-matrix`
- `POST /api/platform/operational-status/refresh`
- `GET /api/admin/database-settings`

Do not infer dependency health from a running Node process. Readiness must be based on a real MariaDB query, migration status, and the explicitly modeled dependency checks.

## 5. MariaDB outage

Expected behavior:

1. Reads and writes that need application data fail with controlled 503-class responses.
2. No hidden fallback or alternate owner is activated.
3. Browser editors retain only account-scoped recovery state and do not claim a save succeeded.
4. Payment, account-deletion, and outbox mutations must not report success unless their authoritative transaction committed.

Operator actions:

1. Declare the incident and freeze schema/deployment changes.
2. Inspect `/readyz`, `/api/health/databases`, connection saturation, disk space, replica status, and recent database errors.
3. Restore MariaDB connectivity without changing data ownership.
4. Verify `SELECT 1`, migration-ledger consistency, and critical constraints.
5. Run owner-scoped smoke reads before reopening writes.
6. Inspect queue depth, leases, dead letters, and payment idempotency records.
7. Run an authenticated browser save/reload and a stale-revision rejection.

Do not claim recovery from liveness alone.

## 6. Notification and enterprise outboxes

Two MariaDB-backed queues are operationally distinct:

- `notification_outbox` for email delivery;
- `enterprise_outbox` for tenant-bound asynchronous jobs.

A worker claims rows with a lease. Expired leases can be reclaimed. Retry uses bounded attempts and backoff. Exhausted work moves to a **dead-letter** state and is not silently discarded.

Inspect through:

- `GET /api/admin/database-settings/dead-letter`
- the Super Admin queue/operations surfaces;
- tenant-scoped enterprise queue APIs for enterprise jobs.

Bulk replay is intentionally forbidden. Review one item, confirm the owning tenant/account and idempotency key, correct the dependency, and replay through the appropriate individual route. Enterprise replay remains tenant-authorized (`POST /api/enterprise/queue/replay`).

Never edit an outbox payload in place. Never call a queued item "delivered" until the terminal provider-accepted state is recorded.

## 7. PDF renderer and export-token isolation

PDF rendering requires an isolated worker declaration in production. If isolation is not configured, readiness and the Admin health surface must report `REQUIRES_ISOLATED_WORKER`; process availability is not equivalent to safe rendering.

Export render tokens are opaque, hashed at rest, single-use, transactionally consumed, short-lived, and indexed by `expires_at`. The service opportunistically deletes expired rows in bounded batches. A leaked, replayed, expired, or malformed token must fail closed.

During renderer incidents:

1. Disable or drain new export work at the edge.
2. Terminate stuck Chromium children and inspect memory/file-descriptor limits.
3. Verify token rows cannot be consumed twice.
4. Verify private exports remain owner-bound and public exports require an explicit publication row.
5. Re-enable only after an actual PDF opens and its content matches the stored MariaDB revision.

## 8. Backup and restore

### Backup requirements

Use a database-native, encrypted backup with a consistent transaction snapshot. Include routines/triggers if used by the deployment. Store it outside the application host under restricted access. Record:

- database/server version;
- start/end timestamps;
- backup object/version identifier;
- SHA-256 or provider integrity identifier;
- encryption/key reference;
- operator and change identifier.

Never put a database password directly on a shared command line or in this runbook.

### Restore drill

1. Create an isolated database on the supported MariaDB version.
2. Restore the selected backup.
3. Run migration verify mode; do not silently mutate the restored evidence database.
4. Run foreign-key/integrity checks and compare critical table counts.
5. Verify representative users, resumes and revisions, publications, applications, payment idempotency records, account-deletion ledgers, notification outbox, enterprise tenant records, and audit logs.
6. Run authenticated API and browser journeys against the isolated restore.
7. Record elapsed restore time and evidence. Only then mark the backup `VERIFIED`.

A backup that has not been restored is `NOT VERIFIED`.

## 9. Account-deletion recovery

Application-data cleanup commits before the external identity deletion. The deletion ledger records `IDENTITY_PENDING` if Firebase Authentication deletion cannot complete.

- Do not recreate or reactivate application data to hide an identity-provider failure.
- Retry the same deletion mutation idempotently after identity recovery.
- Verify the subject's personal data is removed or pseudonymized as designed.
- Verify other applicants retain their application history when an employer is deleted.
- Verify only the response's `retainedRecordTypes` remain under legal/security retention.

## 10. Payment recovery

Provider event identifiers and internal order IDs are idempotency boundaries. Never capture or activate from a browser assertion alone.

For a disputed activation:

1. Locate the internal payment order and provider event.
2. Verify amount, currency, account binding, provider signature/status, and current entitlement revision.
3. Confirm whether activation committed.
4. Use the audited repair path only when the provider and internal ledger agree.
5. Re-run invoice and entitlement checks; do not create a replacement payment record to mask inconsistency.

## 11. Rollback

Use the approval-gated production workflow in `.github/workflows/production-release.yml` and `docs/SAFE_PRODUCTION_WORKFLOW.md`. Roll back only to a known-good full commit SHA from `main`.

Application rollback does not automatically roll back schema. Before a release with a migration, document whether the previous application is forward-compatible. If a schema down migration is required:

1. freeze writes;
2. take and verify a new backup;
3. execute the checked-in down migration in an isolated copy first;
4. obtain explicit approval;
5. run the production rollback;
6. verify integrity, readiness, and browser behavior.

Never use force-push, direct web-root copying, `sshpass`, disabled host-key checking, or an unreviewed private key.

## 12. Post-release verification

Verify the deployed commit through `/api/platform/version`, then exercise:

- sign-in, sign-out, reset, OAuth as configured, reauthentication, and MFA gates;
- profile, resume autosave/conflict/reload, publication/unpublication, and export;
- portfolio, cover letter, ATS/AI failure paths, jobs/applications/job tracker;
- billing entitlement and invoice integrity without making an unintended charge;
- Admin and Super Admin RBAC, tenant isolation, audit visibility, and queue states;
- 375/768/1024/1440 responsive and keyboard/accessibility states;
- database rows/revisions corresponding to the exercised actions.

Record each outcome as `VERIFIED`, `FIXED`, `NOT VERIFIED`, or `DEFERRED`. Do not declare the platform certified while required live, browser, database, recovery, or production evidence remains `NOT VERIFIED`.
