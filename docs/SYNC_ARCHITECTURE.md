# Sync Architecture

```
Application
  → Canonical Domain API (ISO dates, membership enums, mutation ids)
    → ResilientRepository (single write authority + read fallback)
      → MariaDB adapter  (PRIMARY)
      → Firestore adapter (SECONDARY)
        → Durable outbox / reverse outbox
          → Tombstones / processed mutations / conflict ledger / fencing
```

Naive dual-write (`await mysql.save(); await firestore.save()`) is forbidden.

## Outbox (MariaDB → Firestore)

- Table: `sync_outbox`
- Inserted in the same connection/transaction as the primary mutation wherever the adapter uses a transaction (resumes, users). Other entities enqueue immediately after the write; a failed enqueue is logged as CRITICAL rather than acknowledged as fully replicated.
- Fields: `id` (mutation id `ev_…`), `entity_type`, `entity_id`, `operation`, `payload`, `version`, `content_hash`, `status`, `retry_count`
- Worker: `processSyncQueue` — PENDING/RETRYING → PROCESSING (lease) → SYNCED / RETRYING / DEAD_LETTER
- Stale PROCESSING lease reclaim: 120 seconds
- Transient errors (quota, unavailable): RETRYING with backoff
- Permanent errors: DEAD_LETTER after 5

## Reverse outbox (Firestore → MariaDB)

- Collection: `sync_outbox_fs`
- Committed in the same batch/transaction as the Firestore write for resumes, users, portfolios, covers, **jobs, applications, blog, custom pages, trusted_by, settings, notifications, contact, payment_orders, coupons, companies**
- Claim: PENDING/RETRYING → PROCESSING with `claimedAt`; stale PROCESSING (>120s) is reclaimable
- Apply: `replicateToMySQL` with monotonic revision + tombstone guard

## Mutation IDs

- Format: `ev_<base36time>_<hex>` for sync events (existing tests require `ev_` prefix)
- Payment: `pay_<base36time>_<hex>`
- Same id applied N times = once (`processed_mutations` / `payment_webhook_events` durable ledger + process-local Map)

## Revisions

| Entity | Version field | Conflict |
| ------ | ------------- | -------- |
| Resume | `revision` | Higher wins; equal hash no-op |
| User | `revision` (column + document) | Higher wins; membership fields travel with the user |
| Payment order | `revision` | Activation is strongly consistent on write-authority |
| Job / application / blog / company / page | `revision` | Higher wins |
| Settings | `revision` | SINGLE_OWNER on configured primary |

An older revision never overwrites a newer one.

## Tombstones

- Table: `sync_tombstones` `(entity_type, entity_id, version, mutation_id, source_engine)`
- DELETE records a tombstone. UPSERT with version ≤ tombstone version is refused.
- A missing document is never treated as “recreate me”.

## Fencing / split-brain

- `database_authority.generation` (durable) + in-process `fencing.js`
- Failover CAS-bumps generation. Stale writers throw `STALE_FENCE_GENERATION`.
- Automatic failover does not rewrite Super Admin `engine_state.json`.

## Payment workflow

```
Provider webhook / verify
  → claim event id in `payment_webhook_events` (duplicate → ack, no re-activate)
  → load order via ResilientRepository
  → if ACTIVE + same providerPaymentId → idempotent return
  → if ACTIVE + different id → conflict
  → write-authority: order ACTIVE + user membership (canonical dates)
  → outbox / reverse outbox
  → if membership write fails after order ACTIVE: recoveryNeeded=true (never silent)
```

## Clock skew

Commit time is server-controlled (`CURRENT_TIMESTAMP`, Firestore `serverTimestamp`, or `new Date().toISOString()` in the canonical layer). Client clocks are not conflict winners.

## Observability

`getSyncHealthStatus()`: pending, processing, retrying, dead letters, conflicts, worker heartbeat.  
`/api/health/databases`: engine status + authority mode + fence generation.
