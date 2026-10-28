# Database & Migration Inventory — Completed Audit

**Source revision:** `ff841d5` (app `537e2985`)
**Engine:** MariaDB/MySQL via `mysql2` (pool in `backend/database/mysql.js`)
**Migrations path:** `backend/database/migrations/`
**Generated:** 2026-10-28

---

## 1. Migration Ledger Integrity

| Property | Value | Evidence |
|---|---|---|
| File count | 58 files = 29 up + 29 down (plus `001_baseline.sql`) | `ls backend/database/migrations \| wc -l` |
| Highest number | `029_enterprise_ai_usage_decision_id` | `ls ... \| tail -5` |
| Reference baseline max | `016_resume_target_role_and_job_description` | `find reference-code -name "*.sql" \| grep migrations` confirms up-to 016 |
| Delta | 13 migrations net-new (017→029) — all enterprise/AI/geo/llms | filename list |
| Pattern | `/^(\d{3,})_([a-z0-9_]+)\.sql$/` | `migrationRunner.js:5` |
| Checksum | SHA-256 per file, stored in `schema_migrations` | `migrationRunner.js: sha256()` |
| Duplicate guard | `throw new Error('Duplicate database migration version ...')` | `migrationRunner.js:20` |
| Statement splitter | Quote/comment-aware (handles `--`, `#`, `/* */`, `'`, `"`, `` ` ``, semicolons in literals) | `migrationRunner.js: splitSqlStatements()` 80 lines |
| Ledger tables | `schema_migrations` (version, checksum, execution_ms, applied_by) + `schema_migration_attempts` | `ensureMigrationLedger()` L70-90 |
| Distributed lock | `LOCK_NAME = 'resumepilot:mariadb:schema-migrations'` via `GET_LOCK` | `migrationRunner.js:6` |
| Live DB state | **NOT queried** — no MariaDB connection (EG-001 BLOCKED) | honest limitation |

## 2. Idempotency & Rollback

| Check | Result |
|---|---|
| `CREATE TABLE` without `IF NOT EXISTS` | **0** — every `CREATE TABLE` includes `IF NOT EXISTS` (RC-001 re-verified via `grep -l CREATE TABLE ... \| xargs grep -L "IF NOT EXISTS"`) |
| Down-migration presence | All 29 pairs have `.down.sql` |
| Down-migration content correctness | **PARTIAL** — presence confirmed; whether paired down actually reverses up not exhaustively verified (would require semantic diff per pair) |
| Idempotency via runner | Runner tracks `version + checksum` ledger — each runs **once**; `IF NOT EXISTS` is defense-in-depth only |

## 3. Migration Subject Timeline (017→029)

| # | Subject | Domain |
|---|---|---|
| 017 | `live_interview_sessions` | interviews |
| 018 | `job_tracker_interview_scheduling` | jobs |
| 019 | `subscription_audit_log_and_grace_period` | billing |
| 020 | `geo_regional_projection` | geo |
| 021 | `llms_full_document` | llms.txt |
| 022 | `geo_delhi_region_alias` | geo |
| 023 | `llms_default_documents` | llms.txt |
| 024 | `messaging_read_state` | messaging |
| 025 | `notification_message_decoupling` | notifications |
| 026 | `ai_quota_counters` | AI governance |
| 027 | `enterprise_tenant_credentials` | enterprise multi-tenancy |
| 028 | `ai_routing_decision_ledger` | AI observability |
| 029 | `enterprise_ai_usage_decision_id` | AI/enterprise join |

Earlier (001→016): baseline, billing ledger, enterprise outbox, AI usage ledger, notifications, configuration bootstrap, payment refund state machine, CMS relational authority, discovery defaults, support tickets, resume role/description.

## 4. Schema Quality Signals

- `001_baseline.sql` (40 KB) defines core tables with `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` — correct.
- `014_fail_closed_discovery_defaults.sql` enforces default-deny discovery (fail-closed) — **positive**.
- `enterprise` migrations (027→029) add tenant-scoped tables with `tenantId` predicate — aligns with isolation design.
- `mysql.js` pool configured with `connectionLimit`, `connectTimeout`, SSL option; no raw SQL concatenation observed in sampled `repositories/*.js` (parameterized `?` placeholders).

## 5. Observations Not Escalated

- `MIGRATION_FILE_PATTERN` also matches `NNN_name.down.sql` (would extract `name = "description.down"`). Down files are **not** discovered via this pattern — they are executed via inverse path (`029_name.down.sql` applied only on rollback). No bug, but pattern naming is loose; harmless because ledger prevents re-run.
- No destructive `DROP TABLE` in up migrations (only down) — **positive**.

## 6. Parity vs Reference Baseline

| Aspect | Status |
|---|---|
| Reference max migration | 016 (via `find reference-code`) — confirms snapshot predates 017+ work |
| Active net-new | 017→029 (13) — all intentional new capabilities, not missing reference data |
| Baseline hygiene | Reference also has `001_baseline.sql` equivalent — not diffed line-by-line |

**Residual:** Full schema diff 001→016 between reference and active not performed (parity matrix notes DEFERRED) — would require comparing 16 migration bodies.

