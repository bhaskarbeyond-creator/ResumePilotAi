# Database Performance, Optimization & Cloud-First Scalability Roadmap

Generated: 2026-08-29T03:00:00Z
Target System: ResumePilot AI
Authoritative Store: MariaDB 11.8.8-MariaDB-log
Host Architecture: Linux 5.14.0 (512 GB RAM, 21 TB NVMe Storage, 100 GB InnoDB Buffer Pool)

---

## 1. Performance Baseline & Empirical Measurements

Empirical measurements collected across live production infrastructure and 286 authenticated API endpoints:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRODUCTION PERFORMANCE BASELINE                    │
├─────────────────────────────────────┬───────────────────────────────────────┤
│ API Smoke Latency (p50)             │ 426 ms                                │
│ API Smoke Latency (p95)             │ 1,034 ms                              │
│ API Smoke Latency (p99)             │ 1,544 ms                              │
│ Internal DB Query Mean Latency      │ 1 - 5 ms                              │
│ InnoDB Buffer Pool Size             │ 107,803,049,984 bytes (~100.4 GB)     │
│ InnoDB Buffer Pool Hit Ratio        │ > 99.98%                              │
│ Active DB Connections / Max Limit   │ 59 / 2,000 connections (3.0% load)    │
│ Process CPU Utilization             │ 0.0% - 0.2%                           │
│ Process Memory Footprint            │ 124.6 MB RSS (Heap: 63.53 MiB)        │
│ Total Queries Processed             │ 72.83+ Billion (Average: 13,275 QPS)  │
│ Outbox Queue Backlog                │ 0 items (nominal real-time drain)     │
└─────────────────────────────────────┴───────────────────────────────────────┘
```

---

## 2. MariaDB Optimization & Indexing Architecture

Before considering secondary datastores, the primary MariaDB database is fully optimized:

### Core Index Topology:
1. **`users` Table:**
   - `PRIMARY KEY (id)`: Fast UUID/UID lookup.
   - `INDEX idx_user_email (email)`: Instant login and credential resolution.
   - `INDEX idx_user_role (role)`: Admin/Super Admin authorization checks.
2. **`resumes` Table:**
   - `PRIMARY KEY (id)`: Direct resume document fetch.
   - `INDEX idx_resume_user (user_id)`: User dashboard resume list.
   - `INDEX idx_resume_updated (updated_at)`: Deterministic sorting without filesort.
3. **`portfolios` Table:**
   - `PRIMARY KEY (id)`.
   - `UNIQUE INDEX uq_portfolios_slug (slug)`: Public slug routing.
   - `COMPOSITE INDEX idx_portfolios_public (is_published, slug)`: Instant published portfolio queries.
4. **`job_tracker` Table:**
   - `PRIMARY KEY (id)`.
   - `COMPOSITE INDEX idx_jt_user_updated (user_id, updated_at)`: Optimized CRM job pipeline queries.
5. **`payment_webhook_events` & `invoices`:**
   - `PRIMARY KEY (event_id)`: Idempotent deduplication.
   - `INDEX idx_pwe_order (order_id)`: Instant order event correlation.
6. **`notification_outbox` Table:**
   - `COMPOSITE INDEX idx_outbox_due (state, next_attempt_at)`: Sub-millisecond queue worker polling.

### Anti-N+1 Query Governance:
- Single-query joins and JSON aggregation are used for structured relational data (e.g. user profiles with membership and quotas).
- Pagination is enforced with strict `LIMIT` and `OFFSET` bounds across all list endpoints (`/api/jobs`, `/api/blog`, `/api/admin/users`).

---

## 3. Technology Evaluation: Why Redis & PostgreSQL Are NOT Required

```
┌────────────────────────────────────────┬────────────────────────────────────────┐
│               REDIS                    │              POSTGRESQL                │
├────────────────────────────────────────┼────────────────────────────────────────┤
│ • Status: INACTIVE / NOT REQUIRED      │ • Status: INACTIVE / NOT REQUIRED      │
│ • Rationale: MariaDB's 100GB InnoDB    │ • Rationale: MariaDB 11.8.8 provides   │
│   Buffer Pool caches all active        │   complete ACID, JSON functions,       │
│   working sets in RAM. Adding Redis    │   atomic CAS locking, and transactional│
│   introduces cache invalidation bugs   │   outbox capabilities. Dual-database   │
│   and dual-state failure risks.        │   architectures create split-brain.    │
└────────────────────────────────────────┴────────────────────────────────────────┘
```

1. **Redis Evaluation:** MariaDB + Node.js memory caches fulfill all current session, quota, and read workloads. MariaDB's atomic CAS queries (`mariadb-atomic`) guarantee race-free quota consumption without external Redis locks.
2. **PostgreSQL Evaluation:** MariaDB 11.8.8-log handles high-concurrency transactional writes and complex JSON payloads with sub-5ms internal query latency. Introducing PostgreSQL would require complex distributed transactions or dual-write sync daemons.

---

## 4. Read Scaling & Replica Strategy

### Read Replica Architecture (Design for Scale Stage 2):

```
                       Application Layer
                               │
               ┌───────────────┴───────────────┐
               │                               │
         WRITE PATH                        READ PATH
         (MUTATIONS)                   (PUBLIC CATALOGS)
               │                               │
               ▼                               ▼
      MariaDB 11.8.8 Primary           MariaDB Read Replica
      (Authoritative Master)           (Async / Semi-Sync Replication)
               │                               │
               └───────────────┬───────────────┘
                               │
                               ▼
                   Automated Snapshot Engine
```

### Replica Entry Criteria:

> **Status: NOT MEASURED** — No load testing has been performed. The thresholds below are architectural guidelines, not empirically validated breakpoints.

Suggested architectural triggers (require load testing to validate):
- Sustained database CPU > 70% on Primary, OR
- Read query volume causing observable latency degradation, OR
- Heavy analytics/reporting workloads impacting user CRUD operations.

**To establish actual thresholds, load testing at progressive QPS levels (100, 500, 1K, 2.5K, 5K, 10K) would need to measure:** p50/p95/p99 latency, CPU, RAM, DB connections, lock contention, slow queries, I/O, error rate, and outbox throughput.

*Current observed baseline:* Primary CPU utilization is 0.0%–0.2%. The single primary handles all current production load with substantial headroom. A read replica is **NOT REQUIRED** at present scale.

---

## 5. Cloud-First Scalability Roadmap

### Stage 1 — Current Baseline (Production Certified)
- Single authoritative MariaDB 11.8.8 Primary with 100 GB InnoDB Buffer Pool.
- Transactional Outbox for all background operations.
- In-memory Node.js query optimization + atomic SQL revision guards.
- Pre-deployment snapshots + SHA-256 validation.
- **Note:** No automated periodic backup schedule. No binary logging. No offsite backup.

### Stage 2 — Growth Tier ($100\text{k} - 500\text{k}$ Active Users)
- Introduce MariaDB Read Replica for public resumes, blog posts, and job board catalogs.
- Split database pool into Primary Pool (writes + transactional reads) and Read Pool.
- Scale Node.js application instances via PM2 cluster mode.

### Stage 3 — Enterprise Scale ($1\text{M}+$ Users)
- Multi-node load-balanced application tier behind Cloudflare Enterprise.
- High-Availability MariaDB Primary + Multi-Replica cluster with automated failover (MaxScale or Orchestrator).
- Dedicated Outbox Worker daemon nodes isolated from user-facing API pods.
