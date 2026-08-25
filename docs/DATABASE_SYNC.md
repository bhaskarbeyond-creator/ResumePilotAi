# Intelligent Bidirectional Synchronization & Outbox Engine

## 1. Outbox Pattern
For writes originating in MySQL mode, mutations insert a replication event directly into the `sync_outbox` table in the **same database transaction** before commit:
```sql
BEGIN;
UPDATE resumes SET ...;
INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload, version, source_engine, content_hash, status)
VALUES ('ev_123', 'resumes', 'res_456', 'UPSERT', '{...}', 2, 'mysql', 'hash_sha256', 'PENDING');
COMMIT;
```

## 1b. Reverse Outbox (Firestore → MySQL)
For writes originating in Firestore mode, repository-mediated mutations
(`FirestoreRepository`: resumes, users, portfolios, covers) commit an event
document to the `sync_outbox_fs` **Firestore collection atomically with the
data write** (same transaction or batch):

```
sync_outbox_fs/{autoId}: {
  entityType, entityId, operation, payload (plain JSON + user_id),
  version, contentHash, status: PENDING, attemptCount: 0, sourceEngine: 'firestore'
}
```

The background worker drains this collection into the MySQL standby:
- events are **claimed** atomically (compare-and-set PENDING/RETRYING → PROCESSING);
- fresh PROCESSING leases from other workers are respected; **stale leases
  (>120s) are reclaimed** after a worker crash;
- application goes through `replicateToMySQL()` with the monotonic revision
  guard (resumes);
- failures retry with **exponential backoff** (min 1s × 2^attempts, capped at
  5 minutes) and **dead-letter after 5 attempts**;
- the `database-settings` pre-switch gate drains both outboxes and blocks a
  switch while either has pending/dead-letter events.

Coverage note: the reverse outbox captures repository-mediated writes (the CRUD
surface all `/api/resumes`, `/api/users`, `/api/portfolios`, `/api/covers`
routes use). Non-repository direct Firestore writes (auth profile hooks,
notifications, CMS) are reconciled by `scripts/live-firestore-to-mysql-sync.mjs`.

---

## 2. Deterministic Content Hashing
To prevent unnecessary sync churn and detect true conflicts, payloads are hashed using SHA-256 after stripping non-deterministic metadata:
- Removed fields: `updated_at`, `created_at`, `lastPing`, `_seconds`, `_nanoseconds`.
- Sorted JSON key serialization guarantees identical hashes for logically identical objects.

---

## 3. Idempotency, Backoff & Dead-Letter Queue
- **Idempotency**: Retried events do not duplicate records or cause state regression. Both outboxes use monotonic revision guards and `INSERT ... ON DUPLICATE KEY UPDATE` semantics.
- **Exponential Backoff**: Failed events transition to `RETRYING` with delay: `Math.min(300000, 1000 * 2^retry_count)`.
- **Dead-Letter Queue**: Events exceeding 5 retries transition to `DEAD_LETTER` status, generating an alert in Super Admin Database Settings for manual review.
- **Lease reclaim**: MySQL `PROCESSING` rows and Firestore `PROCESSING` documents whose lease is older than 120 seconds are automatically returned to the retry queue after a worker crash — no event is silently lost.

---

## 4. Conflict Resolution Engine
- **No-Op Match**: If `mysql_hash === firestore_hash`, change is marked `SYNCED` without write overhead.
- **Higher Version Precedence**: When valid monotonic revisions exist, the higher version wins.
- **Ambiguous Conflicts**: Conflicting records are logged to `sync_conflicts` with full JSON payloads from both engines.

---

## 5. Engine State & Switch Mutex
- The authoritative runtime engine state is `backend/database/engine_state.json`
  (atomic write + rename). Every switch also mirrors the state into the
  `database_engine_state` MySQL control table; divergence between the two is
  surfaced in the Super Admin database settings as `engineStateConsistency`.
- Concurrent switch requests are serialized by an in-process mutex and rejected
  with HTTP 409 while a switch is in flight (single PM2 instance topology).
