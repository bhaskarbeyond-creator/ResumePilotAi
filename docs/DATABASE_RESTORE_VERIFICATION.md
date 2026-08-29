# Database Restore Verification & DR Evidence

Generated: 2026-08-29T03:10:00Z
Last Audit: 2026-08-29T02:35:00Z (empirical read-only production audit)
Target Production Database: `u727965524_airesume` (MariaDB 11.8.8-log)
Target Production Host: `https://airesume.projectdemo.guru`
Verification Harness: `scripts/lib/remote-db-restore-verify.cjs` + `scripts/verify-backup-rollback.mjs`

---

## Evidence Classification

| Label | Definition |
|---|---|
| **VERIFIED** | Empirical evidence exists from production testing. |
| **NOT VERIFIED** | Evidence is unavailable or insufficient. |

---

## 1. Snapshot Restore Drill Verdict

```
========================================================================================
SNAPSHOT RESTORE DRILL VERDICT: VERIFIED (PASS)
========================================================================================
Note: This verifies that the snapshot artifact is valid, complete, and
structurally restorable. It does NOT verify full end-to-end database
restore into a running MariaDB instance (see RTO section).
========================================================================================
```

---

## 2. Backup Artifact Metadata & Cryptographic Integrity

| Property | Verified Value |
|---|---|
| **Database Name** | `u727965524_airesume` |
| **Backup Timestamp** | `1787972070645` (`2026-08-29T02:54:30.645Z`) |
| **Artifact Path** | `/home/u727965524/deploy_backups/db_snapshots/mariadb-snapshot-u727965524_airesume-1787972070645.sql.gz` |
| **Artifact Size** | `3,748,198 bytes` (`3.575 MB`) |
| **Compression Engine** | Gzip (`.sql.gz`) |
| **Dump Flags** | `mysqldump --single-transaction --quick --routines --triggers` |
| **SHA-256 Checksum** | `a14fdded7d908ca3a7aae1ea803a2ce1c46b5638f45add7ebedeae01e5813bfd` |
| **Snapshot Generation Duration** | `360 ms` |
| **Integrity Hash Match** | **`true`** (Cryptographic match confirmed) |
| **Total Snapshots on Server** | **1** (single manual snapshot) |

---

## 3. Structural Decompression & Schema Analysis — VERIFIED

The compressed backup artifact was streamed through decompression and parsed to verify schema and data completeness:

- **Total SQL Statements / Lines:** `3,398 lines`
- **Decompression Duration:** `54 ms`
- **Total Verification Duration:** `66 ms`
- **Total Tables Reconstituted (`CREATE TABLE`):** **`76 / 76` tables**
- **Data Insertion Streams (`INSERT INTO`):** `33` INSERT statements across `29` populated domain tables
- **Foreign Key Constraints:** **`25`** relational FK rules present
- **Check Constraints:** **`79`** check constraint rules present

### Critical Table Data Verification:

| Table | INSERT Statements | Data Present |
|---|---|---|
| `users` | 1 | ✓ |
| `resumes` | 3 | ✓ |
| `schema_migrations` | 1 (14 rows) | ✓ |
| `system_settings` | 1 | ✓ |

**Verdict: RECOVERABLE** — All critical tables contain data in the snapshot.

### Migration Ledger Verification Inside Backup:

All **14 versioned migrations** confirmed present:

1. `001` - `baseline`
2. `002` - `single_owner_enterprise`
3. `003` - `billing_invoice_ledger`
4. `004` - `single_owner_runtime_hardening`
5. `005` - `enterprise_invitation_outbox`
6. `006` - `enterprise_ai_usage_ledger`
7. `007` - `job_tracker_revision`
8. `008` - `notification_outbox_state_constraint`
9. `009` - `authoritative_configuration_bootstrap`
10. `010` - `payment_refund_state_machine`
11. `011` - `refund_reconciliation_credit_notes`
12. `012` - `billing_snapshot_refund_references`
13. `013` - `cms_relational_authority`
14. `014` - `fail_closed_discovery_defaults`

---

## 4. Rollback Readiness Verification Suite — VERIFIED

Executed via `node scripts/verify-backup-rollback.mjs`:

```
verify-backup-rollback: verifying rollback readiness

  [PASS ] backup artifact exists
  [PASS ] backup artifact is non-trivial
  [PASS ] backup artifact is recent
  [PASS ] rollback target resolves to a real commit
  [PASS ] rollback target is an ancestor of HEAD
  [PASS ] production health captured before rollback
  [INFO ] rollback procedure (not executed)

================================================================
verify-backup-rollback
================================================================
  PASS 5   FAIL 0   BLOCKED 0   SKIPPED 0
  VERDICT: PASS
  Evidence: test-results/backup-rollback.json
================================================================
```

---

## 5. MariaDB Configuration Audit — VERIFIED

The following configuration was audited directly from the live production MariaDB instance:

### Durability Assessment

| Parameter | Value | Assessment |
|---|---|---|
| `innodb_flush_log_at_trx_commit` | **`2`** | OS-BUFFERED: Up to ~1 second of committed transactions could be lost on **OS crash** (not MySQL crash). This is a hosting provider configuration. |
| `sync_binlog` | **`0`** | Binary log (if enabled) would NOT be flushed per-commit. Currently moot as binlog is disabled. |
| `innodb_doublewrite` | **`ON`** | Partial-write crash protection. ✓ |
| `innodb_flush_method` | **`O_DIRECT`** | Avoids OS double-buffering. ✓ |

**Durability Verdict:** OS-buffered durability. Safe against MySQL process crashes (redo log is written). Up to ~1 second of data loss possible on unexpected OS/kernel crash.

### Binary Log Status

| Parameter | Value | Impact |
|---|---|---|
| `log_bin` | **`0` (DISABLED)** | No binary logs are generated. |
| `log_bin_basename` | `null` | No binary log files exist. |
| `binlog_format` | `MIXED` | Configuration only; not active. |
| `expire_logs_days` | `0` | No retention policy (moot — binlog disabled). |
| `binlog_expire_logs_seconds` | `0` | No retention policy (moot). |
| `server_id` | `1` | Standard standalone ID. |

**PITR Verdict: NOT VERIFIED / STRUCTURALLY IMPOSSIBLE** — Binary logging is disabled at the server level. The application user does not have privileges to enable it.

### User Privileges

```sql
GRANT USAGE ON *.* TO `u727965524_airesume`@`127.0.0.1`
  IDENTIFIED BY PASSWORD '*01927141...'
  WITH MAX_USER_CONNECTIONS 75 MAX_STATEMENT_TIME 120.000000

GRANT ALL PRIVILEGES ON `u727965524_airesume`.* TO `u727965524_airesume`@`127.0.0.1`
```

- `ALL PRIVILEGES` scoped to application database only ✓
- `MAX_USER_CONNECTIONS 75` — connection limit enforced by server ✓
- `MAX_STATEMENT_TIME 120s` — query timeout enforced by server ✓
- No SUPER or BINLOG MONITOR privilege ✗ (cannot inspect or enable binary logs)

---

## 6. Summary Metrics (Honest Assessment)

| Metric | Value | Status |
|---|---|---|
| **Snapshot Parse Verification** | 76/76 tables, 14/14 migrations, 66 ms | **VERIFIED** |
| **Snapshot Integrity** | SHA-256 confirmed | **VERIFIED** |
| **Rollback Readiness** | 5/5 PASS | **VERIFIED** |
| **RPO** | Cannot be established (no automated schedule, no binlog) | **NOT VERIFIED** |
| **RTO** | Only component times measured; no end-to-end test | **NOT VERIFIED** |
| **PITR** | `log_bin=0`; structurally impossible | **NOT VERIFIED** |
| **Offsite Backup** | No tools, no destination, no copies | **NOT VERIFIED** |
| **Full DB Restore into MariaDB** | Parse-verified only; not loaded into actual MariaDB instance | **NOT VERIFIED** |

---

## 2026-08-29 addendum — restore verification status

The 2026-08-29 structural verification above (76/76 tables, 14/14 migrations,
SHA-256 match) remains valid for the artifact it inspected.

**It is not a restore test.** Parsing a dump proves the artifact is well-formed;
loading it into a running MariaDB proves it is restorable. The latter has never
been performed against production-shaped data.

| Check | Verdict |
|---|---|
| Artifact integrity (SHA-256) | **VERIFIED** (prior audit) |
| Structural parse (tables/migrations) | **VERIFIED** (prior audit) |
| Full restore into a running MariaDB | **NOT VERIFIED** |
| Post-restore row-level reconciliation | **NOT VERIFIED** |

Automated drill: `tests/certification/backup-restore.test.mjs` performs a real
backup → `DROP DATABASE` → restore → reconciliation cycle, but is gated behind
`RUN_MARIADB_BACKUP_RESTORE_DRILL=true` and a disposable loopback database. It is
**skipped** wherever MariaDB is unavailable, so it currently contributes no
evidence.

To produce real evidence:

```bash
# CI or any host with a disposable MariaDB
export RUN_MARIADB_BACKUP_RESTORE_DRILL=true
export MARIADB_TEST_ALLOW_RESET=true
export NODE_ENV=test
node --test tests/certification/backup-restore.test.mjs
```

Restore procedure and safety rails: **[`docs/BACKUP_RUNBOOK.md`](./BACKUP_RUNBOOK.md)** §5.
Recovery scenarios: **[`docs/DISASTER_RECOVERY_RUNBOOK.md`](./DISASTER_RECOVERY_RUNBOOK.md)**.
