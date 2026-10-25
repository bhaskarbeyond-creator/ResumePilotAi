# (b) Migration plan — forward + rollback, ordering constraints, dry-run checklist

**NOT EXECUTED — DDL-GATED. Nothing below has been run against any database. Design only.**
Companion to `schema-proposal.md` (statement text lives there; this doc is the operational plan).

---

## 1. Phasing and gates

| Phase | Store | Gate to execute | Reversible how |
|---|---|---|---|
| **A** | Engine-owned SQLite (`FREELMAPI_METRICS_DB`): scoped rebuilds + additive columns + `routing_decisions` | Reviewer approval of this package (no MariaDB window required — engine-owned store, F-18 in-place precedent) | File-level backup restore; or inverse rebuild (§3) |
| **B** | MariaDB migrations `028` + `029` | **DDL window** + existing `migrationRunner` (ledger + `GET_LOCK` + sha256, `migrationRunner.js:7-89`) | Paired `.down.sql` via the same runner |
| **C** | Code activation (scope threading, decisionId generation/propagation, ledger writes) behind capability probes + env flags | After A (for scoped evidence) and after B (for durable ledger writes); each independently flag-gated, default **off** | Flag flip — instant, no DDL |

Phase C is deliberately split so a partial environment (e.g., SQLite-only sandbox) gets scoped
evidence without the MariaDB ledger, and the ledger writer self-disables when `migrationStatus()`
reports 028/029 absent (never emits unknown-column SQL).

## 2. Ordering constraints (hard)

1. **A.1 before A.2/A.3:** `provider_metrics` rebuild first (smallest table, proves the
   rebuild-on-open machinery) — then cooldowns, then `request_log` ALTERs. All three run at
   persistence-open, idempotently, guarded by `PRAGMA table_info` / marker checks so a restart
   mid-phase never double-applies.
2. **A before C-scoping:** code that writes `scope_key != 'platform'` must never run against an
   unrebuilt table (INSERT would violate the old PK). Enforced by a capability flag set only after
   the guarded rebuild succeeds (`persistence.scopedSchema === true`).
3. **B.028 before B.029:** the ledger table exists before `enterprise_ai_usage.decision_id` can
   reference it logically (no FK, but the join target must exist first for the post-checks).
4. **B before C-ledger:** the fire-and-forget insert activates only when `migrationStatus()` shows
   028 applied (checksum-verified, not name-matched).
5. **Deploy order in production:** migrate (A auto at open; B via runner) → verify post-checks →
   enable flags per-instance → observe one full traffic hour before fleet-wide enable.
6. **Rollback order is the exact reverse:** flags off → 029.down → 028.down → (A rollback only if
   required, §3).

## 3. Rollback design

### Phase A (SQLite)
- **Pre-step (mandatory):** copy the `FREELMAPI_METRICS_DB` file before first open with the new
  code (`cp metrics.db metrics.db.pre-A.bak`). For `:memory:` deployments there is nothing to roll
  back — restart returns the old empty store.
- **Rollback = restore the .bak file** and redeploy pre-A code. Acceptable data loss: observations
  recorded between A and rollback (re-learnable evidence, no money/security impact).
- **Documented fail-open edge:** restoring an *empty/older* cooldown set means fewer active
  cooldowns — providers look healthier than they are for up to one window (30 min). This is the
  pre-existing semantics of any metrics reset (F-13 route does exactly this deliberately) and is
  accepted; quota/admission paths are untouched either way.
- Inverse rebuild scripts (scoped → unscoped) are provided in the execution PR as
  `persistence.rollback.test.js` fixtures — not needed in the common case (file restore).

### Phase B (MariaDB)
- `029` down: `DROP INDEX idx_ent_ai_usage_decision; DROP COLUMN decision_id;` — loses the join
  column only; `enterprise_ai_usage` money/token data untouched (verified: the column is additive
  and NULL for all pre-existing rows, so DROP loses at most post-028 join keys).
- `028` down: `DROP TABLE IF EXISTS ai_routing_decisions;` — loses the observability ledger.
  **Explicit acceptance:** decision history is observability data, not a system of record; quota
  (`ai_usage`), billing (`enterprise_ai_usage` rows themselves), and audit trails are unaffected.
- Runner mechanics: downs execute through the same `migrationRunner` path (ledger row removal +
  checksum), under the same `GET_LOCK` — no hand-run SQL in production, ever.

### Phase C
- Env flags off (`FREELMAPI_TENANT_SCOPED_EVIDENCE=0`, `FREELMAPI_DECISION_LEDGER=0`) — behavior
  returns to `bb2b82b` semantics with zero DDL. Scoped rows already written remain readable by the
  platform path (they simply stop being produced; `scope_key='platform'` queries ignore them).

## 4. Dry-run checklist (executable verbatim the moment a window opens)

Sandbox parity first (the whole rehearsal runs on the MariaDB-WASM bridge + `:memory:`/file SQLite
— the same harness used for the S1/S2 probes):

**Phase A rehearsal**
- [ ] A0. `FREELMAPI_METRICS_DB=/tmp/preA-metrics.db` file store; run one legacy-code /v1 call to
      seed rows; stop.
- [ ] A1. `cp /tmp/preA-metrics.db /tmp/preA-metrics.db.bak`; record `SELECT COUNT(*)` for all three
      tables (expected numbers written into the run log).
- [ ] A2. Start new code; verify guarded rebuild ran exactly once (log line + `PRAGMA table_info`
      shows `scope_key` on all three tables; `routing_decisions` exists).
- [ ] A3. Row-count parity: every rebuilt table has the same count as A1, all rows
      `scope_key='platform'`; `PRAGMA integrity_check` → `ok`; `PRAGMA foreign_key_check` → empty.
- [ ] A4. Idempotence: restart twice; no double-apply, counts stable.
- [ ] A5. Behavior parity with flag OFF: re-run the certified S1 probe scenario (61 calls) —
      served sequence must equal the S1 AFTER transcript byte-for-byte on provider/model/exploration
      columns (platform path unchanged).
- [ ] A6. Flag ON smoke: dedicated-BYOK failure produces a `scope_key='uid:{hash}'` cooldown row;
      platform traffic still sees `platform` rows only (queries from (c) test plan, run live).
- [ ] A7. Rollback drill: restore `.bak` with legacy code; A1 counts return; app healthy.

**Phase B rehearsal (bridge)**
- [ ] B0. Fresh bridge datadir; `initializeSchema` (applies 001–027); snapshot `migrationStatus()`.
- [ ] B1. Drop `028_*.sql` + `029_*.sql` + downs into `backend/database/migrations/`; run
      `runMigrations()`; verify ledger rows 028/029 with sha256 checksums; `SHOW CREATE TABLE
      ai_routing_decisions` matches proposal §4.1; `SHOW COLUMNS FROM enterprise_ai_usage LIKE
      'decision_id'` → 1 row.
- [ ] B2. Concurrency guard: two parallel `runMigrations()` calls — second is a no-op under
      `GET_LOCK` (existing runner test pattern).
- [ ] B3. Down round-trip: run `029.down` then `028.down`; `migrationStatus()` clean;
      `enterprise_ai_usage` back to baseline columns; re-up applies cleanly again.
- [ ] B4. Legacy-app compatibility: pre-C code against post-B schema — full backend suite green
      (additive columns must not break existing INSERTs; `mysqlEnterpriseRepository.js:408` insert
      is column-explicit, verified).

**Phase C rehearsal**
- [ ] C0. Flags ON end-to-end: one /v1 call → wire `routing_decision.decisionId` present (UUIDv4
      shape) → same id in telemetry entry, SQLite `routing_decisions`, `request_log.decision_id`,
      and MariaDB `ai_routing_decisions`; enterprise-path call joins to
      `enterprise_ai_usage.decision_id`.
- [ ] C1. Quota unchanged: A.6 probe restated (`ai_usage` charged identically; decision ledger
      insert failure — simulated by flag-off/absent-table — never affects the response or charge).
- [ ] C2. Full gate: backend suite SUITE_EXIT=0 + the eight post-DDL integration tests from (c) +
      eslint 0/0 + lockfiles 0 bytes vs `bd2d016`.

**Production window script (B only; A ships with the deployable and self-applies at open)**
- [ ] P1. Backup verification: `mysqldump --single-transaction` of `enterprise_ai_usage` +
      `mysqldump --no-data` full schema; restore-tested on staging.
- [ ] P2. `runMigrations()` under maintenance flag; time-boxed 5 min; abort = downs.
- [ ] P3. Post-checks B1/C0 on production canary instance; one traffic hour observation;
      fleet flag enable; 24 h review of `ai_routing_decisions` growth vs retention note.

## 5. Explicit non-goals of this plan

- No change to `backend/database/mysql.js` connection/pool logic (the runner import at line 6 is
  the only touch point and it already exists).
- No auth middleware or global rate limiter changes anywhere in A/B/C.
- No data backfill, no retroactive decision ids, no tenant attribution invented for historical rows.
- Nothing in this document has been executed against any database at draft time.
