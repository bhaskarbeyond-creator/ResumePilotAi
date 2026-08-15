# ResumePilot AI operations runbook

## Deployment gates

1. Deploy as a non-root application user. Keep API and PDF renderer in separate containers when possible.
2. Apply Firestore and Realtime Database rules plus `firestore.indexes.json`; confirm TTL is enabled for `export_render_tokens.expiresAt`.
3. Use Workload Identity for Firebase Admin and a deployment Secret Manager for provider credentials. Do not inject secrets into `VITE_*` variables.
4. Run one or more notification worker instances with Firestore access. Set either `NOTIFICATION_OUTBOX_WORKER_ENABLED=true` on worker-capable instances or `NOTIFICATION_OUTBOX_EXTERNAL_WORKER=true` on API-only instances.
5. Set `PDF_RENDERER_ISOLATED=true` only after PDF execution is actually isolated in a non-root sandboxed worker/container with seccomp/AppArmor, memory/CPU limits, a read-only root filesystem, temporary-file quota, and an egress policy denying private/metadata networks.

## Health and alerting

- `/healthz` proves only that the process can answer HTTP. Alert after three consecutive failures.
- `/readyz` reports Firebase readiness and explicitly reports providers as `NOT_CHECKED`. Do not use it as proof that AI, payment, SMTP, OAuth, or Twilio providers are healthy.
- Alert when `notification_outbox.state == DEAD_LETTER`, when the oldest `NOTIFICATION_QUEUED`/`RETRYING` event is older than five minutes, or when a delivery lease remains expired.
- Alert on repeated `ACCOUNT_*_INCOMPLETE`, payment webhook validation failures, scheduler failures, export timeouts, and readiness failures.
- Correlate API logs with `X-Request-Id`; redact authorization headers, tokens, credentials, Resume/Profile payloads, email bodies, and payment secrets.

## Notification recovery

1. Inspect dead-letter `attemptCount`, bounded `lastError`, event ID, and authoritative recipient metadata.
2. Correct provider/configuration failure before retrying.
3. Retry by transactionally changing `DEAD_LETTER` to `RETRYING`, deleting lease fields, and setting `nextAttemptAt` to the current server timestamp. Never clone the record or change its deterministic ID.
4. Provider acceptance is `DELIVERY_ATTEMPTED`, not mailbox delivery. Reconcile final delivery only from authenticated provider webhooks.

## Payment reconciliation

- Treat `payment_orders` as the business ledger. Never grant membership from analytics, invoices, browser callbacks, or notification state.
- Reconcile provider captures/webhooks against UID, internal order, provider order/payment ID, amount, currency, and expected state.
- Reprocess only idempotent provider events. Investigate mismatches; do not force `ACTIVE` from the Admin browser.
- Refund entitlement only after provider refund confirmation and retain the audited financial record.

## Backup and restore

- Schedule encrypted Firestore exports and Realtime Database backups to a separate project/account with retention and immutable-delete policy.
- Back up deployment configuration without secret values; secrets are restored from Secret Manager versions.
- Quarterly restore drill: restore into an isolated project, apply rules/indexes, validate owner/public isolation, compare payment-order counts and hashes, verify Blog/Custom Page publication, then destroy the drill project.
- Record RPO/RTO, export IDs, checksums, restore duration, and data discrepancies. A backup is not considered valid until restored.

## Incident and disaster recovery

- Credential exposure: disable provider credential, rotate in Secret Manager, revoke Firebase sessions where relevant, inspect audit/request IDs, then redeploy.
- Cross-account suspicion: disable affected route, preserve audit logs, revoke sessions, verify Firestore/Realtime rules, and run owner-isolation tests before reopening.
- Region/provider outage: fail closed for payments and entitlement; queue retryable email; preserve drafts locally only through UID-scoped recovery; do not fabricate successful state.
- PDF exploit suspicion: stop the render worker, preserve container evidence, rotate service identity, and keep API/payment workers isolated.

## Required exercises

Staging must execute payment-provider reconciliation, OAuth callback, MFA recovery, account deletion partial-failure recovery, notification dead-letter replay, scheduler concurrency, backup restore, PDF malicious-document, and User A → logout → User B delayed-callback journeys before production approval.
