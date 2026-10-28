# Database Inventory — `backend/database/`

**Discovery method:** `find backend/database/migrations -type f`, direct read of
`backend/database/migrationRunner.js`, and a filename-pattern grep for `CREATE TABLE` /
`IF NOT EXISTS`.

**Important caveat (mandate §4.3):** No live database connection was established. All
conclusions below are based on repository artifacts (migration SQL files and the runner's
own source), **not** a live `information_schema` query against a running MariaDB/MySQL
instance. Live-database schema facts (actual applied state, actual index statistics,
actual row counts) are `RUNTIME VERIFICATION DEFERRED`.

## 1. Migration file inventory

- **Database engine:** MariaDB/MySQL (confirmed: `backend/database/mysql.js` import in
  `backend/index.js`; `mysql2` dependency in `backend/package.json`; migration runner
  comment references "MariaDB"; `developer-review/HANDOVER-CLOSURE-2026-10-28.md`
  explicitly names "MariaDB cluster").
- **Migration count:** 57 files total under `backend/database/migrations/` (up + down
  pairs). Naming convention: `NNN_description.sql` (up) and
  `NNN_description.down.sql` (down), enforced by the runner's own regex
  `/^(\d{3,})_([a-z0-9_]+)\.sql$/` (down files are presumably matched by a different
  mechanism not confirmed in this session, since the regex above would also match
  `NNN_description.down.sql` incorrectly as name=`description.down` — **this specific
  regex-vs-filename interaction was not traced far enough to confirm correct behavior;
  flagged here as a candidate for `UNVERIFIED-SUSPICIONS.md` in a follow-up session, not
  added in this session due to budget.**)
- **Highest migration number observed directly:** `029` (`029_enterprise_ai_usage_decision_id.sql` / `.down.sql`), consistent with
  `HANDOVER-CLOSURE-2026-10-28.md`'s statement "Migrations 001 through 029 intact."
- **Idempotency check performed:** See `appendix/REFUTED-CANDIDATES.md` RC-001 — all
  `CREATE TABLE` statements across all migration files include `IF NOT EXISTS`.
- **Down-migration (rollback) correctness:** Presence of a `.down.sql` file was confirmed
  for every sampled `up` migration (e.g. `020`–`029`, 10 pairs observed). Content-level
  correctness of each down-migration (does it actually and safely reverse its paired
  up-migration?) was **not** verified — `DEFERRED`.
- **Migration runner integrity design (verified from source):**
  `backend/database/migrationRunner.js` computes a SHA-256 checksum per discovered
  migration file and raises an error on duplicate version numbers
  (`throw new Error('Duplicate database migration version ${migration.version}')`). It
  also implements a custom SQL statement splitter that is quote/comment-aware (handles
  `--`, `#`, and `/* */` comment styles and quoted strings containing semicolons) rather
  than a naive `.split(';')`, which is a verified positive engineering signal (reduces
  risk of a migration silently truncating at a semicolon inside a string literal).
- **Locking:** A `LOCK_NAME = 'resumepilot:mariadb:schema-migrations'` constant is defined
  in the runner, implying a distributed lock is taken during migration execution
  (protecting against concurrent migration runs across multiple app instances) — the
  actual lock-acquisition code path was not traced to confirm it is used correctly
  (e.g., released on failure) — `DEFERRED`.

## 2. Recent migration subject matter (from filenames, `020`–`029`)

| # | Subject |
|---|---|
| 020 | `geo_regional_projection` |
| 021 | `llms_full_document` |
| 022 | `geo_delhi_region_alias` |
| 023 | `llms_default_documents` |
| 024 | `messaging_read_state` |
| 025 | `notification_message_decoupling` |
| 026 | `ai_quota_counters` |
| 027 | `enterprise_tenant_credentials` |
| 028 | `enterprise_ai_routing_decision_ledger` |
| 029 | `enterprise_ai_usage_decision_id` |

This sequence is consistent with the "Multi-tenancy & isolation" and "Routing-decision
correctness" dimensions described in `developer-review/ceiling-table-r17.md` (inside the
audited repo), corroborating that migrations 026-029 back the AI-routing/enterprise
feature set discussed in DISC-003/DISC-004/UVS-003.

## 3. Reference-baseline migration comparison

`reference-code/backend/database/migrations/016_resume_target_role_and_job_description.sql`
is the only reference-baseline migration file confirmed by name in this session (via a
targeted "*resume*" search, not an exhaustive listing of
`reference-code/backend/database/migrations/`). This establishes that the reference
baseline's own migration history reached at least `016` before being snapshotted,
compared to the active implementation's `029+`. **A full listing of
`reference-code/backend/database/migrations/` was not performed in this session —
DEFERRED.**

## 4. Raw SQL / query inventory

**Not performed in this session.** Mandate §4.4 calls for identifying raw SQL,
dynamically assembled queries, tenant-scoping predicates, and parameterization across
`backend/repositories/` and `backend/database/`. Only the migration files and the runner
itself were inspected; the actual query layer (`backend/repositories/*.js`) was enumerated
as a directory but not opened. **DEFERRED — see `UNVERIFIED-SUSPICIONS.md` UVS-005 and
`ENVIRONMENT-GAPS.md` EG-006.**

## Negative-findings statement

**What was searched:** `backend/database/migrations/*.sql` file names and `CREATE TABLE`
content patterns only.
**What this does NOT establish:** Whether every table referenced by application code
(`backend/repositories/`) actually has a corresponding migration (schema-to-query
consistency, mandate §6.3), whether foreign keys/indexes are correctly defined for every
hot query path, or whether any migration has ever partially failed in production. All of
these require either a live database inspection or a full read of every migration body
plus every repository query — both `DEFERRED`.
