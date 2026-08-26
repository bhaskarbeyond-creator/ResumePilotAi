# 📖 ResumePilot AI — Master Production Runbook & Operations Manual

```
================================================================================
PRODUCTION RUNBOOK: DUAL-DATABASE RESILIENCE & OPERATIONS
Authoritative Revision: 0e28dcf8562872feeab184a2815c7f5873c4e721
Platform: ResumePilot AI (Local: https://ai-resume-builder.local | Prod: https://airesume.projectdemo.guru)
Architecture: Application-Data Independent + Bidirectional Sync + Asymmetric Control-Plane
================================================================================
```

---

## 📑 Table of Contents
1. [Standard Normal Operations](#1-standard-normal-operations)
2. [MariaDB Failure & Automatic Failover](#2-mariadb-failure--automatic-failover)
3. [Firestore Failure & Local Serving Mode](#3-firestore-failure--local-serving-mode)
4. [Catastrophic Dual Database Outage](#4-catastrophic-dual-database-outage)
5. [Worker Process Crash & Lease Recovery](#5-worker-process-crash--lease-recovery)
6. [Network Partition & Stale Writer Fencing](#6-network-partition--stale-writer-fencing)
7. [Post-Outage Recovery & Bidirectional Reconciliation](#7-post-outage-recovery--bidirectional-reconciliation)
8. [Conflict Resolution & Manual Remediation](#8-conflict-resolution--manual-remediation)
9. [DLQ Telemetry & Message Replay](#9-dlq-telemetry--message-replay)
10. [Payment Recovery & Entitlement Repair](#10-payment-recovery--entitlement-repair)
11. [Backup & Point-in-Time Restore](#11-backup--point-in-time-restore)
12. [Zero-Downtime Rollback Procedure](#12-zero-downtime-rollback-procedure)

---

## 1. Standard Normal Operations

### Architecture State
- **Primary Write Engine**: MariaDB 10.4+ (InnoDB transactional authority).
- **Secondary Replication Target**: Google Cloud Firestore (Autonomous standby replica).
- **Consensus Lease**: `database_authority.mode = 'NORMAL'`, `operationalAuthority = 'MARIA'`.
- **Sync Outbox**: Transactions atomically write to `sync_outbox` (InnoDB). Background sync worker drains to Firestore at $<50\text{ms}$ microtask latency.

### Routine Health Checks
- **Health Endpoint**: `GET https://airesume.projectdemo.guru/api/healthz`
  - Expected: `{"status": "ok", "databases": {"authority": {"mode": "NORMAL"}}}`
- **Sync Health Telemetry**: `GET /api/platform/sync-health`
  - Expected: `activeConflicts = 0`, `deadLetterCount = 0`, `syncLagSeconds < 5`.
- **Automated Parity Monitor**:
  ```bash
  node scripts/data-parity-monitor.mjs
  ```

---

## 2. MariaDB Failure & Automatic Failover

### Trigger Condition
- MariaDB crashes, network disconnects, or connection pool exhausts ($3\times$ consecutive timeouts or connection refused).

### Automatic System Action
1. **Immediate Failover**: `ResilientRepository` catches MariaDB down and redirects reads/writes to `FirestoreRepository`.
2. **Reverse Outbox Enqueue**: Writes atomically append to `sync_outbox_fs` collection in Firestore.
3. **Lease Acquisition**: Standby workers acquire generation leases in `settings/sync_worker_state` with generation token increment ($N \rightarrow N+1$).
4. **Zero Downtime**: Users continue creating resumes, submitting applications, and buying subscriptions directly on Firestore.

### Operator Actions
1. Inspect PM2 logs: `pm2 logs airesume-backend --lines 100`
2. Check MariaDB service status: `systemctl status mariadb` or `D:\xampp\mysql_start.bat`
3. Identify root cause (OOM, disk full, connection limit).
4. Restart MariaDB service: `systemctl restart mariadb`

---

## 3. Firestore Failure & Local Serving Mode

### Trigger Condition
- Google Cloud outage, client quota limit (`8 RESOURCE_EXHAUSTED`), or network partition to Firestore.

### Automatic System Action
1. **Local Serving**: MariaDB continues servicing 100% of read and write traffic with zero degradation.
2. **Outbox Backlog Accumulation**: Mutations accumulate in `sync_outbox` table in `PENDING` or `RETRYING` state.
3. **Exponential Backoff**: Ingestion worker backs off to avoid hammering Google Cloud quotas ($1\text{s}, 2\text{s}, 4\text{s}, \dots, 300\text{s}$).

### Operator Actions
1. Check Google Cloud Status Dashboard for Firestore outages.
2. Check API quota consumption in Google Cloud Console.
3. Ensure MariaDB disk has sufficient storage for outbox queues during prolonged outages.

---

## 4. Catastrophic Dual Database Outage

### Trigger Condition
- Both MariaDB and Firestore are simultaneously unreachable.

### Automatic System Action
1. **Fail-Closed Protection**: System returns `HTTP 503 SERVICE_UNAVAILABLE` with structured retry headers.
2. **Zero Mutation Simulation**: The backend never fabricates fake success responses; all data invariants remain uncorrupted.

### Operator Actions
1. Triage MariaDB first to restore primary database authority.
2. Verify local connectivity: `mysql -u root -p ai_resume_builder`
3. Restart backend service once at least one database is UP: `pm2 restart airesume-backend`

---

## 5. Worker Process Crash & Lease Recovery

### Trigger Condition
- Active Node.js sync worker process is terminated via `SIGKILL`, OOM, or unhandled exception.

### Automatic System Action
1. **Lease Expiry**: The crashed worker's heartbeat stops. Stale lease expires after TTL ($20\text{s}$ in MariaDB, $120\text{s}$ in Firestore).
2. **Recovery Worker Election**: Replacement worker acquires recovery generation $N+1$.
3. **Stale In-Flight Sweep**: Outbox events left in `PROCESSING` status are reset to `PENDING` and re-processed.

---

## 6. Network Partition & Stale Writer Fencing

### Trigger Condition
- Network splits application cluster into isolated partitions.

### Automatic System Action
1. **Generation Fencing**: The partition holding the authoritative store increments the generation token.
2. **Stale Writer Quarantine**: Isolated nodes attempting writes with old generations receive `STALE_GENERATION_REJECTED`.
3. **Re-connection Safety**: Upon partition heal, isolated nodes discover higher generation, drop stale authority, and reconcile without split-brain.

---

## 7. Post-Outage Recovery & Bidirectional Reconciliation

### Recovery Workflow
When the downed database comes back online:
1. **Drain Reverse Outbox**: If MariaDB returned, `processFirestoreOutbox()` claims `sync_outbox_fs` events and runs `replicateToMySQL()`.
2. **Monotonic Verification**: Incoming revisions overwrite older revisions only. If MariaDB already holds a newer version, the stale packet is discarded with zero corruption.
3. **Drain Forward Outbox**: If Firestore returned, `processSyncQueue()` claims `sync_outbox` and runs `replicateToFirestore()`.
4. **Transition to Normal Mode**: Once queues reach depth 0, mode returns to `NORMAL`.

---

## 8. Conflict Resolution & Manual Remediation

### Detection
- Conflicts occur when two writes modify the same record with the same revision number on divergent branches.

### Automated Resolution
- **Monotonic Version Guard**: The version with the higher integer revision wins. If revisions are identical, the existing branch is preserved, and the incoming event is flagged as `CONFLICT_DETECTED`.

### Manual Inspection & Remediation
1. Query active conflicts:
   ```sql
   SELECT * FROM sync_conflicts WHERE resolution = 'PENDING' ORDER BY created_at DESC;
   ```
2. Inspect payloads and decide winning revision:
   ```sql
   UPDATE sync_conflicts SET resolution = 'RESOLVED_MANUAL', notes = 'Kept branch A' WHERE id = '<conflict_id>';
   ```

---

## 9. DLQ Telemetry & Message Replay

### Dead-Letter Threshold
- Events fail after 5 attempts with exponential backoff and transition to `status = 'DEAD_LETTER'`.

### Inspection & Replay via Admin Console
1. Navigate to `/adm/queues` in Super Admin Console.
2. Inspect the failure reason in `last_error`.
3. Click **Replay Event** or run via API:
   ```bash
   curl -X POST https://airesume.projectdemo.guru/api/admin/queues/replay \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"eventId": "<event_id>"}'
   ```

---

## 10. Payment Recovery & Entitlement Repair

### Deduplication Guarantee
- Webhooks are claimed atomically in `payment_webhook_events` before subscription activation.

### Entitlement Repair Procedure
If a user reports subscription activation failure after a network glitch:
1. Locate payment intent: `SELECT * FROM payment_orders WHERE uid = '<user_uid>' ORDER BY created_at DESC;`
2. Run entitlement activation service:
   ```bash
   node -e "
   const { activateUserMembership } = require('./backend/services/paymentActivation');
   activateUserMembership('<user_uid>', 'Pro', 30).then(console.log);
   "
   ```

---

## 11. Backup & Point-in-Time Restore

### MariaDB Full Backup
```bash
mysqldump -u root -p --single-transaction --routines --triggers ai_resume_builder > /backups/mariadb_$(date +%Y%m%d_%H%M%S).sql
```

### MariaDB Full Restore
```bash
mysql -u root -p ai_resume_builder < /backups/mariadb_latest.sql
```

### Post-Restore Sync Synchronization
1. After restoring MariaDB from backup, trigger full reverse outbox sync:
   ```bash
   node -e "
   const { processFirestoreOutbox } = require('./backend/database/syncManager');
   const admin = require('./backend/services/firebaseAdmin');
   processFirestoreOutbox(admin.firestore(), 500).then(console.log);
   "
   ```

---

## 12. Zero-Downtime Rollback Procedure

If a deployed commit contains a critical defect:
1. Revert to previous certified baseline in Git:
   ```bash
   git checkout <PREVIOUS_CERTIFIED_COMMIT_SHA>
   ```
2. Build and deploy:
   ```bash
   npm run build
   python scripts/deploy_production.py
   ```
3. Verify live health:
   ```bash
   curl -s https://airesume.projectdemo.guru/api/healthz | jq
   ```
