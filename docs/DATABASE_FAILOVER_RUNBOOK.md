# Database Failover Runbook

Default: **MariaDB = primary**, Firestore = secondary / operational fallback.  
Automatic failover **does not** rewrite `engine_state.json` (prevents split-brain with Super Admin switches).

## Health

```
GET /api/health/databases
GET /healthz          # includes databases.authority + mariadb/firestore status
GET /api/admin/database-settings   # outbox depth, worker heartbeat (authz)
```

Interpret:

| Field | Meaning |
| ----- | ------- |
| `mariadb.status` | UP / DOWN / UNKNOWN |
| `firestore.status` | UP / DOWN / UNKNOWN |
| `authority.mode` | NORMAL, MARIADB_DEGRADED, MARIADB_FAILED_OVER, FIRESTORE_DEGRADED, RECONCILING, RECOVERED, CONFLICT_DETECTED, BOTH_UNAVAILABLE |
| `authority.operationalWriteEngine` | Where new writes go |
| `authority.fenceGeneration` | Monotonic fencing token. Stale writers must stop. |
| `authority.reconciliation` | IDLE / RUNNING / CONFLICT |

Never treat the process as healthy if `mode === BOTH_UNAVAILABLE` or dead-letter count > 0.

## Scenario: MariaDB failure

1. Observe consecutive primary failures (`DB_FAILOVER_FAILURE_THRESHOLD`, default 2).
2. Authority moves writes to Firestore. Generation bumps. Alert `AUTOMATIC_FAILOVER`.
3. Application continues. Reverse outbox (`sync_outbox_fs`) records Firestore mutations.
4. Do **not** flip Super Admin engine switch unless you intend a lasting primary change.
5. When MariaDB returns: probes succeed `DB_RECOVERY_SUCCESS_THRESHOLD` (default 2) times → `RECONCILING`.
6. Drain `sync_outbox_fs` into MariaDB. If conflicts: `CONFLICT_DETECTED` — preserve both, do not auto-overwrite.
7. `completeRecovery({conflicts:0})` restores MariaDB as write authority (new generation).

## Scenario: Firestore failure

1. Mode `FIRESTORE_DEGRADED`. Writes stay on MariaDB.
2. `sync_outbox` accumulates MySQL → Firestore events.
3. When Firestore returns, the worker drains the outbox. Tombstones prevent resurrection.

## Scenario: both unavailable

1. Mode `BOTH_UNAVAILABLE`.
2. Writes return **503**. Never fake success.
3. Restore either engine, then follow recovery above.

## Manual Super Admin primary switch

1. Run pre-switch gate (`flushAndVerifyBeforeSwitch`): pending = 0, dead letters = 0, conflicts = 0, measured parity 100%.
2. Switch via existing database admin API / `engine_state.json`.
3. If automatic failover is in progress, **stop**. Manual switch during failover is a split-brain risk. Check `fenceGeneration` and `mode` first.
4. After switch, confirm `/api/health/databases` `configuredPrimary` and `operationalWriteEngine` match intent.

## Multi-instance

- Write generation is a fencing token. Only the CAS winner advances generation.
- Lease TTL: `DB_AUTHORITY_LEASE_MS` (default 15000).
- Outbox rows use 120s lease reclaim. Duplicate workers are safe (idempotent mutation ids).

## Conflict resolution

1. Stop automatic destructive sync.
2. Inspect `sync_conflicts` (PENDING).
3. Choose RESOLVED_MYSQL or RESOLVED_FIRESTORE explicitly.
4. Resume recovery.

## Payment during failover

Payment activation uses ResilientRepository. A webhook may arrive on either engine. Provider event ids are claimed once. If membership write fails after order ACTIVE, the order is marked `recoveryNeeded` — do not capture twice; replay activation.

## Alerts

| Alert | Action |
| ----- | ------ |
| PRIMARY_FAILURE / AUTOMATIC_FAILOVER | Verify Firestore healthy; do not flip engine_state |
| PROLONGED_FALLBACK | Page on-call if fallback > 15 min |
| QUEUE_BACKLOG | Check worker heartbeat; scale/restart worker |
| DEAD_LETTER | Inspect payload; never delete blindly |
| CONFLICT | Manual resolution |
| BOTH_UNAVAILABLE | Incident — restore any engine |
| SPLIT_BRAIN_PREVENTION | Another instance already owns generation — do not force |
| PAYMENT_ACTIVATION_PARTIAL | Replay membership from ACTIVE order |
