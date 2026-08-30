# Backup & Disaster Recovery — Evidence-Based Specification

Generated: 2026-08-29T03:08:00Z
Last Audit: 2026-08-29T02:35:00Z (empirical read-only production audit)
Target System: ResumePilot AI Production Datastore
Authoritative Database: MariaDB 11.8.8-MariaDB-log (`u727965524_airesume`)
Production Host: `https://airesume.projectdemo.guru`

---

## Release identity reconciliation (added 2026-08-29T03:39Z)

This document's findings remain valid, but it must not be read as the current release-identity
record. Reconciled against `origin/main` on 2026-08-29:

```text
AUTHORITATIVE_REMOTE_MAIN_SHA = f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b
PRODUCTION_RELEASE_SHA        = f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b   (observed 2026-08-29T03:39:00.604Z)
```

Production reported `778adf20cc18cdc2e5becca8ec98fc98ccd2b648` at `2026-08-29T03:23:37.649Z`
and `f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b` at `2026-08-29T03:39:00.604Z`. Production was
redeployed during the audit window and now matches `origin/main`.

**Superseded status:** the "no automated backup schedule" finding below is addressed by
`ops/dr/install-backup-schedule.sh` + `scripts/dr-backup-run.mjs` — but as **DESIGNED**, not
**VERIFIED**. Nothing in this document is upgraded to VERIFIED until it has been executed
against production.

Current programme status, exact SHAs, and full evidence:
**[`docs/DR_CLOUD_FIRST_HARDENING.md`](./DR_CLOUD_FIRST_HARDENING.md)**

---

---

## Evidence Classification Legend

This document uses strict evidence-based status labels:

| Label | Definition |
|---|---|
| **VERIFIED** | Empirical evidence exists from production testing or audit. |
| **DESIGNED** | Architecture exists in documentation/code but has not been exercised end-to-end. |
| **READY** | Can be activated but has not been required or tested in production. |
| **NOT VERIFIED** | Evidence is unavailable or insufficient to confirm the capability. |

> **Rule:** `DESIGNED` is never promoted to `VERIFIED` without empirical evidence.

---

## 1. Current Backup Architecture

### What Exists (VERIFIED)

ResumePilot AI has an **on-demand snapshot engine** for MariaDB:

```
                          ┌────────────────────────┐
                          │   MariaDB 11.8.8-log   │
                          │   (Live Primary DB)    │
                          └───────────┬────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │       On-Demand Snapshot Engine (mysqldump)      │
             │       --single-transaction --quick --routines    │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │     Local Recovery Tier          │
                    ├─────────────────────────────────┤
                    │ • Path: deploy_backups/         │
                    │ • Gzip compressed (.sql.gz)     │     STATUS: VERIFIED
                    │ • SHA-256 Checksum Verified     │
                    │ • Sub-second snapshot (360ms)   │
                    └─────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │   Offsite DR Tier (Independent) │
                    ├─────────────────────────────────┤
                    │ • NOT CONFIGURED                │     STATUS: NOT VERIFIED
                    │ • No offsite backup tools       │
                    │ • No cloud storage destination  │
                    │ • No automated upload           │
                    └─────────────────────────────────┘
```

### Backup Inventory (Audited 2026-08-29)

| Property | Verified Value |
|---|---|
| **Snapshot files on server** | **1** (single manual snapshot) |
| **Latest snapshot** | `mariadb-snapshot-u727965524_airesume-1787972070645.sql.gz` |
| **Snapshot size** | `3,748,198 bytes` (3.575 MB) |
| **SHA-256** | `a14fdded7d908ca3a7aae1ea803a2ce1c46b5638f45add7ebedeae01e5813bfd` |
| **Created** | `2026-08-29T02:54:31.003Z` |
| **Tables verified** | 76 / 76 |
| **Migrations verified** | 14 / 14 |
| **Snapshot generation time** | 360 ms |
| **Streaming parse verification** | 82 ms |

### Scheduled/Automated Backups

| Property | Verified Value |
|---|---|
| **User crontab** | `NO CRONTAB` — no automated backup schedule exists |
| **Pre-deployment snapshot** | VERIFIED — deployment script creates snapshot before activation |
| **Periodic/daily snapshot** | **NOT CONFIGURED** |
| **Offsite sync** | **NOT CONFIGURED** |

### 3-2-1 Compliance Assessment

| Requirement | Status |
|---|---|
| **3 copies of data** | **NOT MET** — only 2 copies exist (live DB + 1 local snapshot) |
| **2 different media** | **PARTIAL** — InnoDB + compressed SQL dump, but same host |
| **1 offsite copy** | **NOT MET** — no offsite backup exists |

**3-2-1 Compliance: NOT VERIFIED**

---

## 2. Recovery Objectives — Honest Assessment

### RPO (Recovery Point Objective)

```
┌───────────────────────────────────────────────────────────┐
│              RECOVERY POINT OBJECTIVE (RPO)                │
├───────────────────────────────────────────────────────────┤
│                    NOT VERIFIED                            │
│                                                           │
│ Reason: No automated backup schedule exists.              │
│ Single manual snapshot only. Binary logging DISABLED.     │
│                                                           │
│ Current worst case: ALL data since last manual snapshot   │
│ could be lost (hours, days, or weeks depending on when    │
│ the last snapshot was taken).                              │
│                                                           │
│ Pre-deployment snapshots reduce deployment RPO to ~0      │
│ for deployment-related failures only.                     │
└───────────────────────────────────────────────────────────┘
```

**RPO calculation methodology:**

```
Actual RPO = MAX(time since last backup, time since last binlog archive)
```

| Factor | Value | Source |
|---|---|---|
| Full backup frequency | Manual / pre-deployment only | crontab audit |
| Incremental backup frequency | None | No incremental backup configured |
| Binary log retention | N/A | `log_bin = 0` (DISABLED) |
| Binary log archival | N/A | Binary logging disabled |
| Binary log upload frequency | N/A | No offsite tools installed |
| Replication lag | N/A | No replication configured |
| Latest recoverable timestamp | Snapshot creation time only | Single snapshot |
| Maximum transaction loss window | **Unbounded** (all data since last snapshot) | No continuous capture |

**RPO: NOT VERIFIED** — Cannot be established without automated backup schedule and/or binary logging.

### RTO (Recovery Time Objective)

```
┌───────────────────────────────────────────────────────────┐
│              RECOVERY TIME OBJECTIVE (RTO)                 │
├───────────────────────────────────────────────────────────┤
│                    NOT VERIFIED                            │
│                                                           │
│ Component measurements (not end-to-end):                  │
│   • Snapshot decompression + parse: 82 ms                 │
│   • PM2 restart + healthcheck: ~3-5 seconds (measured)    │
│                                                           │
│ NOT measured end-to-end:                                  │
│   • Failure detection time                                │
│   • Backup acquisition time (from offsite if host down)   │
│   • Full database restore into MariaDB                    │
│   • Binary log replay (N/A — binlog disabled)             │
│   • Application startup + migration verification          │
│   • DNS propagation (if host change required)             │
└───────────────────────────────────────────────────────────┘
```

| Recovery Phase | Measured Duration | Status |
|---|---|---|
| T0 → T1: Failure detection | Depends on monitoring | NOT MEASURED |
| T1 → T2: Backup acquisition | Local: instant / Offsite: N/A | PARTIAL |
| T2 → T3: Database restore | Parse verified (82 ms) / Full restore: NOT MEASURED | PARTIAL |
| T3 → T4: PITR (binlog replay) | N/A (binlog disabled) | NOT APPLICABLE |
| T4 → T5: Application start + healthcheck | ~3–5 seconds (Scenario A) | VERIFIED |
| **Total RTO** | **NOT VERIFIED** | End-to-end not measured |

**RTO: NOT VERIFIED** — Only component durations measured; end-to-end recovery not timed.

---

## 3. Point-In-Time Recovery (PITR)

### Status: NOT VERIFIED / STRUCTURALLY IMPOSSIBLE

```
┌───────────────────────────────────────────────────────────┐
│                    PITR ASSESSMENT                         │
├───────────────────────────────────────────────────────────┤
│  Binary Logging (log_bin):     DISABLED (0)               │
│  Binary Log Basename:          null                       │
│  Binlog Format:                MIXED (config only)        │
│  Expire Logs Days:             0                          │
│  Binlog Expire Seconds:        0                          │
│  Server ID:                    1                          │
│                                                           │
│  VERDICT: PITR is STRUCTURALLY IMPOSSIBLE.                │
│           No binary logs are being generated.             │
│           Recovery can only restore to the exact point    │
│           of the last full snapshot.                      │
│                                                           │
│  REQUIRED TO ENABLE:                                      │
│  1. Hosting provider (Hostinger) must enable log_bin=ON   │
│     in MariaDB server configuration (my.cnf)              │
│  2. Application user needs BINLOG MONITOR privilege       │
│  3. Binary log archival/rotation must be configured       │
└───────────────────────────────────────────────────────────┘
```

> **Note:** The MariaDB server configuration is managed by the hosting provider. The application user (`u727965524_airesume`) has `ALL PRIVILEGES ON u727965524_airesume.*` but does not have server-level privileges (SUPER, BINLOG MONITOR) required to enable or inspect binary logs.

---

## 4. Offsite Backup Assessment

### Status: NOT VERIFIED

| Check | Result |
|---|---|
| rclone installed | NOT INSTALLED |
| restic installed | NOT INSTALLED |
| aws CLI installed | NOT INSTALLED |
| gsutil installed | NOT INSTALLED |
| s3cmd installed | NOT INSTALLED |
| borgbackup installed | NOT INSTALLED |
| duplicity installed | NOT INSTALLED |
| Offsite destination configured | NONE |
| Offsite upload schedule | NONE |
| Offsite retention policy | NONE |

**No independent copy of backups exists outside the production host.** If the production host suffers catastrophic failure (disk failure, data center outage, hosting account issue), all local backups are lost with it.

---

## 5. Backup Security Assessment

| Check | Result | Status |
|---|---|---|
| Backup files outside web root | `/home/u727965524/deploy_backups/` (not in `public_html/`) | **VERIFIED** |
| User-scoped filesystem permissions | Files owned by application user | **VERIFIED** |
| Backup encryption at rest | None — plain gzip SQL dump | **NOT VERIFIED** |
| Immutable/append-only storage | No — standard filesystem | **NOT VERIFIED** |
| Independent backup credentials | No — same application user | **NOT VERIFIED** |
| Application cannot delete all backups | No — application user owns backup directory | **NOT VERIFIED** |
| Production DB credentials in backup | Yes — dump contains user grants with password hash | **DESIGNED** (inherent to mysqldump) |
| Backup integrity hashes maintained | SHA-256 computed on creation | **VERIFIED** |

---

## 6. Recovery Point Timeline

Current state as of the 2026-08-29 audit:

```
Today (2026-08-29)
 └── 02:54 UTC — mariadb-snapshot-u727965524_airesume-1787972070645.sql.gz
     └── (only recovery point available)

No older snapshots exist.
No binary logs available.
No offsite copies exist.
```

**"If the database is destroyed at 14:37 UTC today, the newest recoverable point is 02:54 UTC (11h43m of data loss)."**

---

## 7. Disaster Recovery Playbooks

### Scenario A: Accidental Data Deletion / Corrupted Table

1. Identify affected user/tenant and timestamp of accidental operation.
2. Restore latest pre-incident snapshot to verify it contains the lost data.
3. Extract specific record rows (e.g. `resumes`, `covers`) and re-insert into live primary with incremented `revision`.
4. **Data loss window:** All changes between the snapshot and the incident are lost.
5. **PITR replay:** NOT AVAILABLE (`log_bin=0`).

### Scenario B: Severe Hardware / Host Failure

1. Provision target host with Node.js 20.x, PM2, and MariaDB 11.8.x.
2. Retrieve backup — **currently only local**, so this requires the local disk to still be accessible (e.g. via hosting provider recovery).
3. Restore database schema and data from the latest snapshot.
4. Deploy application bundle from repository release SHA.
5. Update Cloudflare DNS origin IP to point to the new host.
6. Run `npm run certify:identity` and `npm run certify:endpoints`.
7. **Risk:** If local disk is inaccessible, no offsite backup exists to recover from.

### Scenario C: Failed Code or Database Migration Deployment

1. Deployment script creates automatic pre-deployment snapshot.
2. Execute rollback via [`scripts/deploy-production-direct.mjs`](file:///d:/xampp/htdocs/ai-resume-builder/scripts/deploy-production-direct.mjs) pointing to previous good SHA.
3. Restore pre-deploy snapshot from `/home/u727965524/deploy_backups/` if schema was altered.
4. Restart PM2 and verify healthcheck.
5. **RPO for deployment failures:** ~0 seconds (pre-deployment snapshot).

---

## 8. Recommendations for Improvement

### Priority 1: Automated Backup Schedule (Achievable Immediately)
- Add cron job for periodic snapshots (every 6 hours recommended).
- Establishes measurable RPO of ≤ 6 hours.
- Retain last 7 days of snapshots (28 files).

### Priority 2: Offsite Backup (Requires Cloud Storage Setup)
- Install `rclone` on the server.
- Configure upload to S3-compatible or GCS bucket.
- Establishes 3-2-1 compliance.

### Priority 3: Binary Logging (Requires Hosting Provider Action)
- Request Hostinger to enable `log_bin=ON` with `binlog_format=ROW`.
- Request `BINLOG MONITOR` privilege for application user.
- Enables PITR and continuous recovery.

### Priority 4: Backup Encryption (Achievable Immediately)
- Encrypt snapshots with AES-256-GCM before writing to disk.
- Store encryption key separately from backup files.
