# Production Database Architecture & Technical Specification

Generated: 2026-08-29T03:00:00Z
Target System: ResumePilot AI
Authoritative Store: MariaDB 11.8.8-MariaDB-log (`u727965524_airesume` on `127.0.0.1:3306`)
Identity Plane: Firebase Authentication (Tokens & MFA Only)
Production Host: `https://airesume.projectdemo.guru`
Release Commit SHA: `778adf20cc18cdc2e5becca8ec98fc98ccd2b648`

---

## 1. Executive Summary & Authoritative Principles

ResumePilot AI enforces a **single-owner, cloud-first, ACID-compliant database architecture** centered on **MariaDB 11.8.8-log**. 

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RESUMEPILOT AI TOPOLOGY                           │
├──────────────────────────┬──────────────────────────────────────────────────┤
│ AUTHORITATIVE DATA STORE │ MariaDB 11.8.8-log (DB: u727965524_airesume)     │
│ IDENTITY & AUTH PLANE    │ Firebase Authentication (Identity & MFA Only)    │
│ FIRESTORE DATA PLANE     │ REMOVED (0 Clients, 0 Stores, 0 Endpoints)       │
│ QUEUE & OUTBOX ENGINE    │ MariaDB Transactional Outbox                     │
│ ATOMIC QUOTA STORE       │ MariaDB Atomic Quotas (`mariadb-atomic`)         │
│ ENCRYPTION ENGINE        │ ServerKey AES-256-GCM Envelope Encryption        │
│ POSTGRESQL STATUS        │ INACTIVE / NOT REQUIRED                          │
│ REDIS STATUS             │ INACTIVE / NOT REQUIRED                          │
└──────────────────────────┴──────────────────────────────────────────────────┘
```

### Core Architecture Invariants:
1. **Single Authoritative Data Plane:** MariaDB is the sole source of truth for all domain entities (Users, Resumes, Portfolios, Covers, Jobs, Payments, Invoices, Outbox, Settings). No secondary database maintains application state.
2. **Zero Split-Brain / Competing Authorities:** Firestore has been completely removed. PostgreSQL and Redis are inactive. Dual-write patterns and eventual-consistency bridges are prohibited for core financial, identity, and resume records.
3. **Transactionally Bound Side Effects:** Domain events and outbox tasks commit in the *same* database transaction as the business mutation via the MariaDB Transactional Outbox.
4. **Optimistic Revision Locking:** All concurrent mutations utilize Compare-And-Swap (CAS) revision guards (`revision = revision + 1 WHERE revision = ?`), preventing lost updates without heavy pessimistic row locking.
5. **Fail-Closed Availability Semantics:** If MariaDB becomes unreachable, the application fails closed with controlled HTTP 503 errors (`DATABASE_UNAVAILABLE`). It never fabricates placeholder data or silently falls back to unverified cache stores.

---

## 2. MariaDB 11.8.8-log Engine Configuration (Live Verified)

Empirical telemetry extracted directly from production MariaDB instance (audit: 2026-08-29):

| Configuration Variable | Production Value | Architectural Rationale |
|---|---|---|
| **Server Version** | `11.8.8-MariaDB-log` | Long-term stable release with advanced JSON and transactional optimizations. |
| **Character Set & Collation** | `utf8mb4 / utf8mb4_unicode_ci` | Full 4-byte UTF-8 support for multilingual resume content, emojis, and symbols. |
| **InnoDB Buffer Pool Size** | `107,803,049,984 bytes` (~100.4 GB) | Retains working datasets and indexes entirely in RAM, minimizing disk I/O. |
| **InnoDB Log File Size** | `32,212,254,720 bytes` (~30.0 GB) | Large redo log capacity accommodating high-throughput write bursts and crash recovery. |
| **Transaction Isolation** | `READ-COMMITTED` | Eliminates gap-lock contention; enhances concurrency while guaranteeing committed reads. |
| **Max Connections** | `2,000` (Max Used: `425`, Current: `66`) | Substantial concurrency headroom without memory exhaustion risks. |
| **Slow Query Log** | `ON` (`long_query_time: 3.0s`) | Continuous audit of queries exceeding latency budget. Zero slow queries recorded. |
| **Total Query Volume** | `72.83+ Billion queries` (Average: `13,275 QPS`) | Proven sustained production workload. |
| **innodb_flush_log_at_trx_commit** | **`2`** | OS-BUFFERED: redo log written per commit but flushed by OS (~1s loss on OS crash). Hosting provider setting. |
| **sync_binlog** | **`0`** | Binary log not synced per commit. Currently moot (binlog disabled). |
| **log_bin** | **`0` (DISABLED)** | Binary logging is disabled at the server level. PITR is structurally impossible. |
| **innodb_doublewrite** | `ON` | Partial-write crash protection enabled. |
| **Database Size** | `10.75 MB` | Entire working dataset fits in memory. |
| **Buffer Pool Hit Ratio** | `99.9689%` | Near-perfect RAM cache efficiency. |

---

## 3. Domain Model & Table Schema Topology

The database houses **76 normalized tables** partitioned across 10 functional domains:

```
                               ┌─────────────────────────┐
                               │       users (id)        │
                               └────────────┬────────────┘
                                            │
        ┌───────────────────┬───────────────┼───────────────┬───────────────────┐
        │ 1:N               │ 1:N           │ 1:N           │ 1:N               │ 1:N
        v                   v               v               v                   v
┌──────────────┐    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐    ┌──────────────┐
│   resumes    │    │  portfolios  │ │   covers    │ │ job_tracker  │    │payment_orders│
│ (user_id,rev)│    │ (user_id,rev)│ │(user_id,rev)│ │ (user_id,rev)│    │ (user_id)    │
└───────┬──────┘    └──────────────┘ └─────────────┘ └──────────────┘    └──────┬───────┘
        │ 1:1                                                                   │ 1:N
        v                                                                       v
┌──────────────┐                                                         ┌──────────────┐
│public_resumes│                                                         │   invoices   │
│ (owner_uid)  │                                                         │  (order_id)  │
└──────────────┘                                                         └──────────────┘
```

### Table Domain Mapping:
1. **Identity & Profile:** `users`, `user_revisions`, `admin_audit_logs`, `security_audit_logs`.
2. **Resumes & Documents:** `resumes`, `public_resumes`, `canonical_documents`, `covers`, `portfolios`.
3. **Jobs & Career CRM:** `jobs`, `companies`, `applications`, `job_tracker`.
4. **Billing & Subscriptions:** `payment_orders`, `payment_webhook_events`, `invoices`, `credit_notes`, `coupons`, `coupon_redemptions`.
5. **Durable Queues & Outbox:** `notification_outbox`, `enterprise_outbox`.
6. **Enterprise Tenancy:** `enterprise_tenants`, `enterprise_memberships`, `enterprise_policies`, `enterprise_audit_log`, `enterprise_invitations`.
7. **AI & Quotas:** `ai_usage`, `tenant_quotas`, `system_settings`.
8. **CMS & Content:** `blog`, `custom_pages`, `trusted_by`, `contact_messages`, `reviews`.

---

## 4. Connection Pooling & Node.js Resource Governance

Connection management is centralized in [`backend/database/mysql.js`](file:///d:/xampp/htdocs/ai-resume-builder/backend/database/mysql.js) utilizing `mysql2/promise`:

- **Pool Sizing:**
  - `connectionLimit`: Default `15` (dynamically bounded 1–100 via `DB_CONNECTION_LIMIT`).
  - `queueLimit`: Default `200` (bounded 1–10,000 via `DB_QUEUE_LIMIT`).
  - `waitForConnections`: `true`.
- **Timeouts & Keepalive:**
  - `enableKeepAlive`: `true` with initial delay `10,000 ms`.
  - `idleTimeout`: `60,000 ms` to prune stale worker sockets.
  - `connectTimeout`: `8,000 ms` to fail fast on network degradation.
- **Safety Invariants:**
  - `multipleStatements: false` strictly enforced to prevent multi-statement injection vulnerabilities.
  - `timezone: 'Z'` guarantees all timestamp calculations use UTC.

---

## 5. Transactional Outbox Pattern & Background Workers

Side effects (email notifications, webhook deliveries, enterprise sync) are decoupled via the transactional outbox:

```
[ HTTP Request ] 
       │
       ▼
[ START TRANSACTION ]
   ├── 1. Write Business Entity (e.g. INSERT payment_orders)
   └── 2. Enqueue Outbox Event (INSERT notification_outbox: NOTIFICATION_QUEUED)
[ COMMIT ]
       │
       ├────────────────────────────────────────┐
       ▼                                        ▼
[ HTTP 200 OK Response ]             [ Background Outbox Daemon ]
                                                │
                                                ├── 1. Acquire Lease (UPDATE lease_owner, lease_expires_at)
                                                ├── 2. Dispatch via SMTP/Provider
                                                └── 3. Transition to DELIVERED or RETRYING (Exponential Backoff + Jitter)
```

- **Lease Durability:** Leases expire after 120s; crashed workers are safely reclaimed without event loss.
- **Dead-Letter Queue:** Events exceeding 5 attempts transition to `DEAD_LETTER` with error stack traces preserved.
- **Idempotency:** SHA-256 hashed event keys prevent duplicate task ingestion.

---

## 6. Migration Governance & Schema Versioning

- **Migration Engine:** Version-controlled runner ([`backend/database/migrationRunner.js`](file:///d:/xampp/htdocs/ai-resume-builder/backend/database/migrationRunner.js)) executing discrete, atomic DDL migrations with SHA-256 checksum validation.
- **Active Ledger:** 14 applied migrations (001–014) verified in production with 0 pending and 0 mismatches.
- **Zero-Downtime DDL:** All schema modifications utilize `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and backward-compatible constraints.

---

## 7. Operational Resilience & Failure Behavior

| Scenario | System Reaction | Data Integrity Guarantee | Status |
|---|---|---|---|
| **MariaDB Unreachable** | Express middleware catches pool timeout; returns HTTP 503 `DATABASE_UNAVAILABLE`. | Zero data written to unauthorized fallback stores; zero data fabricated. | **VERIFIED** (mysql-outage.test.mjs 6/6 PASS) |
| **Worker Process Crash** | PM2 auto-restarts daemon; unacknowledged outbox leases expire and are picked up. | Exactly-at-least-once task delivery guaranteed. | **VERIFIED** (PM2 restart: 1,272 ms) |
| **Duplicate Webhook** | Idempotency guard checks `payment_webhook_events` primary key; returns HTTP 200 without duplicate billing. | No duplicate invoice or subscription records. | **DESIGNED** |
| **Concurrent Edit Collision** | CAS guard detects revision mismatch (`affectedRows === 0`); returns HTTP 409 Conflict. | Zero lost updates. | **DESIGNED** |

> **Important distinction:** The system exhibits **fail-closed behavior** (HTTP 503, zero data fabrication) when the database is unavailable. This is NOT the same as **database failover** — no secondary database exists that can take over writes. There is no HA failover capability.
>
> - **Database failure behavior (fail-closed): VERIFIED**
> - **Database failover (HA): NOT VERIFIED** — standalone primary, no replica, no automatic failover target.

---

## 2026-08-29 addendum — live architecture confirmation

`/api/readyz` at 2026-08-29T03:52Z confirms the architecture invariants
independently of any document:

```json
{
  "status":"ready",
  "authoritativeDatabase":"MARIADB",
  "checks":{
    "mysql":{"status":"READY","version":"11.8.8-MariaDB-log","host":"127.0.0.1","database":"u727965524_airesume"},
    "schema":"INITIALIZED",
    "identityProvider":"CONFIGURED",
    "firestoreDataPlane":"REMOVED",
    "enterprise":{"dataProvider":"mysql","encryption":"server-key","quotaStore":"mariadb-atomic","queue":"mysql-transactional-outbox"}
  }
}
```

| Invariant | Verdict |
|---|---|
| MariaDB authoritative | **VERIFIED** (live) |
| Firestore removed | **VERIFIED** (live) |
| Firebase identity-only | **VERIFIED** (live) |
| Queue = MariaDB transactional outbox (no Redis) | **VERIFIED** (live) |
| Quota store = MariaDB atomic (no Redis) | **VERIFIED** (live) |
| PostgreSQL absent | **VERIFIED** (live — no Postgres in the stack) |

These seven checks are now asserted continuously by
`scripts/dr-observability.mjs`, which fails closed: a violating value from any
source fails the check, and an unreported value fails it too.

### Recovery posture of this architecture

| Property | Status |
|---|---|
| Automated backup | **NOT CONFIGURED** (automation built, not scheduled) |
| Offsite copy | **NOT CONFIGURED** |
| PITR | **NOT AVAILABLE** (`log_bin = 0`; no server restart on shared hosting) |
| Replication | **NOT CONFIGURED** |
| 3-2-1 | **NOT MET** |

Full analysis: **[`docs/DR_CLOUD_FIRST_HARDENING.md`](./DR_CLOUD_FIRST_HARDENING.md)**.
