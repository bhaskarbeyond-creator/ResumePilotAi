# Database Chaos & Failover Evidence Ledger

**Generated**: 2026-08-26T06:11:27.826Z

### Invariant Test Proofs
1. **Foreign Key Integrity**: Rejects orphan child records (`ER_NO_REFERENCED_ROW_2`), cascades on parent deletion.
2. **Transactional Atomicity**: Deliberate mid-transaction failure rolls back completely.
3. **Outbox Durability**: Outbox event inserted atomically in mutation transaction.
4. **DLQ 5-Retry Protection**: Transitions to `DEAD_LETTER` after 5 failures.
5. **Tombstone Anti-Resurrection**: Stale replays blocked by revision tombstones.
6. **100x Idempotency**: 1 applied, 99 caught by `processed_mutations` ledger.
7. **Multi-Process Fencing**: Generation lease guarantees exactly 1 winner among 4 competing workers.
8. **High Availability Matrix**: 100% operation under Firestore network partition.

### Latency Distribution
- **Mutation Latency**: P50: 0.23ms | P95: 0.23ms | P99: 0.23ms
- **Outbox Enqueue Latency**: P50: 0.4ms | P95: 0.4ms | P99: 0.4ms
