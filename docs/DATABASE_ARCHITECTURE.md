# Dual-Database Engine Architecture (Firestore + MySQL/MariaDB)

## 1. System Overview
ResumePilot AI implements a resilient **Repository Pattern with Dynamic Runtime Engine Switching** and **Intelligent Asynchronous Standby Replication**.

```text
                        ┌──────────────────────────────────────────────┐
                        │              Client / Browser                │
                        │    (BuildResume, Dashboard, Admin Console)   │
                        └──────────────────────┬───────────────────────┘
                                               │ REST API (/api/*)
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │             Backend Router Layer             │
                        │     (/api/resumes, /api/platform, etc.)      │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │          Repository Factory Layer            │
                        │         getRepository(getActiveEngine())    │
                        └──────────────┬────────────────┬──────────────┘
                                       │                │
                      if DB_ENGINE='mysql'            if DB_ENGINE='firestore'
                                       │                │
                                       ▼                ▼
          ┌──────────────────────────────────┐    ┌──────────────────────────────────┐
          │         MySQLRepository          │    │       FirestoreRepository        │
          ├──────────────────────────────────┤    ├──────────────────────────────────┤
          │ • Hostinger MariaDB Local Socket │    │ • Google Cloud Firestore (GCP)   │
          │ • InnoDB 26 Relational Tables    │    │ • Document & Subcollections      │
          │ • ACID Row Locks (FOR UPDATE)    │    │ • Revision Transactions          │
          │ • Durable Outbox Replication     │    │ • Change Capture Replication     │
          │ • Latency: ~16ms                 │    │ • Latency: ~250ms - 650ms        │
          └──────────────────────────────────┘    └──────────────────────────────────┘
```

---

## 2. Core Architectural Pillars

### Pillar 1: Unified Repository Interface
Both `FirestoreRepository` and `MySQLRepository` conform to an identical method signature and semantic contract across all entities:
- Resumes (`getResumes`, `getResume`, `saveResume`, `deleteResume`, `publishResume`)
- Users (`getUser`, `saveUser`, `deleteUser`)
- Portfolios (`getPortfolios`, `getPortfolio`, `savePortfolio`, `deletePortfolio`)
- Covers (`getCovers`, `getCover`, `saveCover`, `deleteCover`)
- Jobs (`getJobs`, `getJob`, `saveJob`, `deleteJob`)
- Blog (`getBlogPosts`, `getBlogPost`, `saveBlogPost`, `deleteBlogPost`)
- Custom Pages (`getCustomPages`, `getCustomPage`, `saveCustomPage`, `deleteCustomPage`)
- Settings (`getSetting`, `saveSetting`)

### Pillar 2: Active / Passive Standby Model
At any given timestamp, exactly one database engine is the **Authoritative Primary** (`ACTIVE`). The secondary engine operates as a **Synchronized Standby** continuously replicated via durable background queues.

### Pillar 3: Multi-Process Durability
The active engine state is persisted in `database_engine_state` table in MariaDB and `engine_state.json` on disk, ensuring atomic consistency across multiple Node.js workers and PM2 process restarts with zero split-brain risk.
