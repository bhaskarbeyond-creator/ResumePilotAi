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

---

## 2. Deterministic Content Hashing
To prevent unnecessary sync churn and detect true conflicts, payloads are hashed using SHA-256 after stripping non-deterministic metadata:
- Removed fields: `updated_at`, `created_at`, `lastPing`, `_seconds`, `_nanoseconds`.
- Sorted JSON key serialization guarantees identical hashes for logically identical objects.

---

## 3. Idempotency, Backoff & Dead-Letter Queue
- **Idempotency**: Retried events do not duplicate records or cause state regression.
- **Exponential Backoff**: Failed events transition to `RETRYING` with delay: `Math.min(300000, 1000 * 2^retry_count)`.
- **Dead-Letter Queue**: Events exceeding 5 retries transition to `DEAD_LETTER` status, generating an alert in Super Admin Database Settings for manual review.

---

## 4. Conflict Resolution Engine
- **No-Op Match**: If `mysql_hash === firestore_hash`, change is marked `SYNCED` without write overhead.
- **Higher Version Precedence**: When valid monotonic revisions exist, the higher version wins.
- **Ambiguous Conflicts**: Conflicting records are logged to `sync_conflicts` with full JSON payloads from both engines.
