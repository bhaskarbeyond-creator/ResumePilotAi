# Reliability Audit

## Graceful Shutdown
- Two SIGTERM/SIGINT handlers (top-level and in `require.main` block); both call `closePool()` after closing HTTP server.
- 5-second force-exit timeout ensures process can terminate even if connections hang.

## Error Handling
- Global Express error handler returns JSON with `code`, `message`, `requestId`; handles QuotaExceeded as 429, 413 payload, 500 internal.
- 404 handler returns JSON `{error: {code: 'NOT_FOUND'}}`.
- Async handlers all have try/catch; errors propagate to global handler via `next(err)` where applicable.
- Unhandled promise rejections: major ones (Firebase init, MySQL connection, schema bootstrap) are caught and logged; process stays up in degraded mode.

## Retry / Fallback
- **AI providers:** Automatic failover across enabled providers (if enableFallback=true). Per-provider timeout (6s for non-primary; 30s for primary). On grounded-response failure → source-preserving fallback.
- **MySQL transient errors:** ResilientRepository wraps MySQLRepository for retry/CAS.
- **Email delivery:** outbox worker with lease-based claims, exponential backoff + jitter, dead-letter after max attempts.
- **Schema bootstrap:** non-fatal; server starts in degraded mode; readyz returns 503 until schema is initialized.
- **Payments:** explicit failure states (FAILED, PROVIDER_CONFIRMED, REFUND_PENDING); reconciliation worker retries pending Indian gateway orders.

## Database Fault Tolerance
- `databaseAuthority.js` tracks health status; canAcceptWrites flag; lastRecoveryAt timestamp.
- When MySQL is unreachable, readiness returns 503; liveness still reports ok; load balancers can stop routing.
- Pool errors are caught; no uncaught exceptions from query failures.

## Outbox / Queue Consistency
- Notification outbox: events written in the same transaction as the business mutation; worker leases events (atomic claim), processes them, marks SENT/FAILED; dead-letter after max attempts.
- Enterprise outbox: envelope signed with TENANT_JOB_SIGNING_SECRET; expiry sweep; lease-based dispatch; handlers are authorized at execution time.

## Health / Readiness
- `/healthz` – liveness (always returns ok if process up).
- `/readyz` – checks MySQL connectivity, schema state, identity provider config, enterprise runtime, workers. Returns 503 if not ready.
- `/api/health/databases` – on-demand database health refresh.
- `maybeQueueReadyzAlert` records transitions to unhealthy state for alerting.

## Process Supervision
- Workers use `.unref()` on timers to prevent keeping the event loop alive unnecessarily.
- `shuttingDown` flag prevents double shutdown.
- Unused modules are not started unless env flags enable them (CMS_SCHEDULER_ENABLED, NOTIFICATION_OUTBOX_WORKER_ENABLED, etc.).

## Findings
- Score: 9.5/10.
- Deduction: no circuit breaker for outgoing provider HTTP calls beyond timeout (failover happens after timeout, not after failure-rate threshold). Acceptable for current scale.
- Recovery paths are well-defined; idempotent retries safe; degraded mode prevents crash loops.
