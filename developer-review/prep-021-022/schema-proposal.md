# (a) Schema proposal — tenant-scoped cooldowns + tenant-scoped metrics + `decisionId` propagation

**NOT EXECUTED — DDL-GATED. Design only. Every statement requiring DDL is flagged `[DDL]`.**
Verified against frozen tip `bb2b82b` (line refs inline). Zero new dependencies.

---

## 1. Current state (verified)

### 1.1 Engine-owned SQLite (`backend/freellmapi/services/persistence.js`)

Opened via `node:sqlite` `DatabaseSync` on `FREELMAPI_METRICS_DB` (path or `:memory:`), WAL mode
(`persistence.js:94-96`). Tables created at open (`persistence.js:97-133`):

| Table | Columns | Key | Notes |
|---|---|---|---|
| `provider_metrics` | provider, model, requests, successes, failures, total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at | `PRIMARY KEY (provider, model)` | **platform-scoped only** — no tenant dimension |
| `provider_cooldowns` | provider, model, expires_at, reason, strikes, updated_at | `PRIMARY KEY (provider, model)` | durable hydration source for CooldownManager |
| `request_log` | id (AUTOINCREMENT), provider, model, ok, status, latency_ms, prompt_tokens, completion_tokens, created_at | ring, pruned at `MAX_LOG_ROWS = 5000` (`persistence.js:24,212`) | F-18 precedent: token columns were added in place via `ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info` (`persistence.js:139-142`), with the comment *"no MariaDB migration is involved"* |

Rolling window reads: `getRollingAggregates({windowMs=30min, limit=500, maxSamples=10})` scans
`request_log WHERE created_at >= ?` (`persistence.js:355-364`) — no scope filter exists.

### 1.2 In-memory cooldown manager (`backend/freellmapi/services/cooldown.js`)

`CooldownManager.cooldowns = Map` keyed `provider[:model]` (lowercased, `_makeKey`,
`cooldown.js:55-59`); hydrates from `provider_cooldowns` on attach (`cooldown.js:23-47`);
`isOnCooldown(provider, model)` checks specific-then-provider key with lazy expiry cleanup. **No
tenant dimension.**

### 1.3 Router recording paths (`backend/freellmapi/services/router.js`)

- `_recordMetrics({scoped, ...})` (`router.js:652-660`): **`if (scoped) return;`** — dedicated-BYOK
  observations are sink-holed (the F-09 sanctuary protects the platform rank by *discarding* tenant
  evidence rather than storing it tenant-scoped). Call sites pass
  `scoped: Boolean(candidate.isDedicatedByok)` (`router.js:836,869,1090,1113,1127`).
- Cooldown checks skip dedicated-BYOK candidates (`router.js:245`); platform aggregates are read
  only for non-BYOK tiers (`router.js:259-260`).
- `tenantContext` already reaches selection (`router.js:193-260`): `allowedModels`,
  `restrictedModels`, `primaryModel`, `allowedProviders`, `customProviderKeys`, and `tenantId`
  exists in the plumbing (`aiRuntime.js:1803,1849-1850`; discovery cache is already tenant-keyed:
  `router.discovery.getCachedState(pId, tenantId)`, `aiRuntime.js:1808`).

### 1.4 Telemetry (`backend/services/aiRouting/routingTelemetry.js`)

`RoutingTelemetry` in-memory bounded ring (`maxEntries` ctor, `aiRouting/index.js:53`); `record()`
**already carries `tenantId` (default `'platform'`)** (`routingTelemetry.js` record shape, line ~70).
No `decisionId` field.

### 1.5 MariaDB (migrations `backend/database/migrations/`, runner `migrationRunner.js`)

- Runner: numbered `NNN_name.sql` + paired `.down.sql`, `schema_migrations` ledger with sha256
  checksum + `GET_LOCK('resumepilot:mariadb:schema-migrations')` (`migrationRunner.js:7-89`);
  invoked from `backend/database/mysql.js:6` (`runMigrations`, `migrationStatus`). **Next free
  number: 028.**
- `ai_usage` (baseline `001_baseline.sql:675-687`): **daily counter rows**, `PRIMARY KEY (day_key,
  uid_hash)`, columns day_key/uid_hash/uid/email/count/limit_used/last_used_at (+ `tenant_id` and
  `scope` written by `backend/security/abuse.js:409,437`). It is an aggregate ledger — **not a
  per-request table**; a per-request `decisionId` cannot live here without changing its PK
  semantics (rejected alternative, §4.4).
- `enterprise_ai_usage` (`001_baseline.sql:887-899`): **per-request enterprise ledger** — id PK,
  tenantId, workspaceId, principalId, dayKey, model, prompt/completion/total tokens,
  costEstimate, recordedAt, `INDEX (tenantId, dayKey)`. Insert at
  `backend/enterprise/mysqlEnterpriseRepository.js:408`. Natural MariaDB join point for
  `decision_id`.

---

## 2. Design principles

1. **Scope dimension, not table explosion:** one new key component `scope_key` (`'platform'`
   default) threads through the engine-owned stores. `'platform'` rows behave exactly as today —
   the platform-key path is byte-identical when no tenant scope is supplied (regression containment).
2. **Credential-physics honesty:** cooldown scope follows the *credential that failed*:
   - platform-key failure → `scope_key='platform'` cooldown (a shared upstream limit is real for
     everyone; tenant-scoping it away would fabricate availability),
   - dedicated-BYOK failure → cooldown scoped to that tenant only (today it is sink-holed),
   - plus a new **tenant-penalty** row kind (`reason='tenant-penalty'`) so governance can bench an
     abusive tenant on a provider without benching the provider platform-wide.
3. **Privacy:** engine SQLite never stores raw uid/email — `scope_key` is `tenant:{tenantId}` for
   enterprise principals (tenantId already stored durably in MariaDB enterprise tables) and
   `uid:{uid_hash}` for individual dedicated-BYOK scopes (uid_hash is the existing platform
   convention, `ai_usage.uid_hash`).
4. **decisionId is additive everywhere:** generated once per routed request, propagated to wire
   (`routing_decision.decisionId`), telemetry ring, SQLite ring, and (post-window) the durable
   MariaDB ledger + `enterprise_ai_usage.decision_id`. Consumers ignoring unknown fields are
   unaffected; no existing field changes shape.
5. **Fail-open on evidence, fail-closed on money:** losing metrics/cooldown/decision data must
   never break routing (existing try/catch discipline, `router.js:659`, `cooldown.js:52`) and never
   touches quota charging (`ai_usage` paths in `security/abuse.js` are not modified).

---

## 3. Phase S1 — engine-owned SQLite (no MariaDB window needed; still `[DDL]`, reviewer-approval-gated)

### 3.1 `provider_metrics` → scoped  `[DDL: table rebuild — SQLite cannot ALTER a PK]`

```sql
-- [DDL] rebuild, run inside one transaction at persistence open, idempotent,
-- guarded by PRAGMA table_info check (F-18 precedent pattern, persistence.js:139-142)
CREATE TABLE provider_metrics_v2 (
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  scope_key     TEXT NOT NULL DEFAULT 'platform',
  requests          INTEGER NOT NULL DEFAULT 0,
  successes         INTEGER NOT NULL DEFAULT 0,
  failures          INTEGER NOT NULL DEFAULT 0,
  total_latency_ms  INTEGER NOT NULL DEFAULT 0,
  last_latency_ms   INTEGER NOT NULL DEFAULT 0,
  last_status       INTEGER,
  p95_latency_ms    INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (provider, model, scope_key)
);
INSERT INTO provider_metrics_v2
  SELECT provider, model, 'platform', requests, successes, failures,
         total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at
  FROM provider_metrics;
DROP TABLE provider_metrics;
ALTER TABLE provider_metrics_v2 RENAME TO provider_metrics;
-- [DDL]
CREATE INDEX idx_provider_metrics_scope ON provider_metrics (scope_key, updated_at);
```

### 3.2 `provider_cooldowns` → scoped + credential-kind  `[DDL: table rebuild]`

```sql
CREATE TABLE provider_cooldowns_v2 (
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  scope_key      TEXT NOT NULL DEFAULT 'platform',
  credential_kind TEXT NOT NULL DEFAULT 'platform',  -- 'platform' | 'byok' | 'tenant-penalty'
  expires_at     INTEGER NOT NULL,
  reason         TEXT,
  strikes        INTEGER NOT NULL DEFAULT 1,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (provider, model, scope_key)
);
INSERT INTO provider_cooldowns_v2
  SELECT provider, model, 'platform', 'platform', expires_at, reason, strikes, updated_at
  FROM provider_cooldowns;
DROP TABLE provider_cooldowns;
ALTER TABLE provider_cooldowns_v2 RENAME TO provider_cooldowns;
-- [DDL]
CREATE INDEX idx_provider_cooldowns_scope ON provider_cooldowns (scope_key, expires_at);
```

### 3.3 `request_log` → scoped + decision id  `[DDL: additive ALTER only — no rebuild]`

```sql
-- [DDL] F-18-precedent pattern: PRAGMA table_info guard, then in-place ADD COLUMN
ALTER TABLE request_log ADD COLUMN scope_key  TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE request_log ADD COLUMN decision_id TEXT;               -- nullable; honest NULL for pre-migration rows
-- [DDL]
CREATE INDEX idx_request_log_scope    ON request_log (scope_key, created_at);
CREATE INDEX idx_request_log_decision ON request_log (decision_id);
```

`getRollingAggregates` gains a `scopeKey = 'platform'` parameter; the query becomes
`WHERE created_at >= ? AND scope_key = ?` (the existing `idx_request_log_created` scan is replaced
by the composite index; platform-path results are provably identical because every pre-existing row
carries `scope_key='platform'`).

### 3.4 New engine-local decision ring  `[DDL: new table]`

```sql
CREATE TABLE IF NOT EXISTS routing_decisions (
  decision_id         TEXT PRIMARY KEY,          -- crypto.randomUUID() (node built-in)
  created_at          INTEGER NOT NULL,
  scope_key           TEXT NOT NULL DEFAULT 'platform',
  mode                TEXT,                      -- auto|quality|speed|balanced|manual
  requested_model     TEXT,
  chosen_provider     TEXT,
  chosen_model        TEXT,
  exploration         TEXT,                      -- 'cold-start' | NULL (S1 wire field)
  quality_evidence    TEXT,                      -- 'curated-tier:<t>' | 'unknown' | NULL
  observed_latency_ms INTEGER,                   -- NULL-when-unknown (F-18 discipline)
  observation_count   INTEGER,
  outcome             TEXT,                      -- 'success' | 'failure' | 'fallback'
  status              INTEGER,
  latency_ms          INTEGER,
  prompt_tokens       INTEGER,                   -- NULL-when-unknown
  completion_tokens   INTEGER                    -- NULL-when-unknown
);
-- [DDL]
CREATE INDEX idx_routing_decisions_created ON routing_decisions (created_at);
CREATE INDEX idx_routing_decisions_scope   ON routing_decisions (scope_key, created_at);
```

Ring-bounded like `request_log` (prune at 5000 by `created_at`, same DELETE-max pattern,
`persistence.js:212`). **No `fallback_chain` blob in v1** — keeps the row sanitized-by-construction
(F-20: no provider internals; the sanitized `fallbacks[]` stays a wire/telemetry-route concern).
This table is the *engine-local* join target; durable cross-restart/cross-instance joins are
Phase S2's MariaDB ledger.

### 3.5 CooldownManager changes (code, no DDL)

`_makeKey(provider, model)` → `_makeKey(provider, model, scopeKey='platform')` producing
`scope|provider[:model]`; `isOnCooldown(provider, model, {scopeKey})` checks, in order:
tenant-penalty row for scope → byok row for scope → specific → provider-wide **platform** row (a
platform-credential cooldown legitimately applies to everyone, principle 2). Hydration
(`cooldown.js:23-47`) reads the scoped table; persistence writes carry `scope_key` +
`credential_kind`. The F-14 last-resort release (`router.js:262-280`) operates within the
requesting scope only — a tenant's last-resort release must never clear a platform cooldown
(explicit rule; test-enforced in (c)).

---

## 4. Phase S2 — MariaDB (DDL-window-gated) `[DDL: all of §4]`

### 4.1 Migration `028_ai_routing_decision_ledger.sql`  `[DDL]`

```sql
CREATE TABLE IF NOT EXISTS ai_routing_decisions (
    decision_id         CHAR(36)     NOT NULL PRIMARY KEY,   -- crypto.randomUUID()
    created_at          DATETIME(3)  NOT NULL,
    day_key             VARCHAR(10)  NOT NULL,               -- denormalized for retention/partition pruning
    scope               VARCHAR(16)  NOT NULL,               -- 'platform' | 'tenant' | 'individual'
    tenant_id           VARCHAR(128) NULL,                   -- NULL for non-enterprise (honest NULL)
    uid_hash            VARCHAR(40)  NULL,                   -- existing hashing convention; NULL for platform-key traffic
    mode                VARCHAR(16)  NULL,
    requested_model     VARCHAR(128) NULL,
    chosen_provider     VARCHAR(64)  NULL,
    chosen_model        VARCHAR(128) NULL,
    exploration         VARCHAR(16)  NULL,
    quality_evidence    VARCHAR(32)  NULL,
    observed_latency_ms INT          NULL,
    observation_count   INT          NULL,
    outcome             VARCHAR(16)  NULL,
    status              SMALLINT     NULL,
    latency_ms          INT          NULL,
    prompt_tokens       INT          NULL,                   -- NULL-when-unknown (F-18)
    completion_tokens   INT          NULL,
    INDEX idx_ard_tenant_day  (tenant_id, day_key),
    INDEX idx_ard_uid_day     (uid_hash, day_key),
    INDEX idx_ard_created     (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`028_ai_routing_decision_ledger.down.sql`: `DROP TABLE IF EXISTS ai_routing_decisions;`

**No FK constraints** (deliberate): write paths differ per engine (freeLLM router vs aiRouting vs
enterprise repository) and the ledger must never block or fail a request (principle 5) — joins are
logical, documented here. **Retention:** day_key + created_at index supports an ops `DELETE ...
WHERE day_key < ?` policy; no automatic deletion in v1 (documented ops task, mirrors existing
ledger practice).

### 4.2 Migration `029_enterprise_ai_usage_decision_id.sql`  `[DDL]`

```sql
ALTER TABLE enterprise_ai_usage
    ADD COLUMN decision_id CHAR(36) NULL,
    ADD INDEX idx_ent_ai_usage_decision (decision_id);
```

Down: `ALTER TABLE enterprise_ai_usage DROP INDEX idx_ent_ai_usage_decision, DROP COLUMN decision_id;`
(verified reversible on MariaDB 13.1 embedded via the sandbox bridge in the dry-run, (b) §4).

### 4.3 Write path (code, post-migration)

`decisionId = crypto.randomUUID()` generated once in `router.routeCompletion` at decision time →
(a) attached to `routingDecision` (wire passthrough already exists — `backend/index.js:3047`-family
`_freellmapi.routing_decision`, S1 proved the passthrough with `exploration`); (b) into
`telemetry.record({decisionId, ...})`; (c) into SQLite `routing_decisions` + `request_log.decision_id`
same transaction-less best-effort path as `recordRequest`; (d) **after response flush**, a
fire-and-forget insert into `ai_routing_decisions` (guarded by `migrationStatus` capability probe so
pre-028 instances never emit unknown-column SQL); (e) `enterprise_ai_usage` insert
(`mysqlEnterpriseRepository.js:408`) gains the nullable `decision_id` value when present.

### 4.4 Rejected alternatives (recorded so they are not re-litigated)

- **`decisionId` on `ai_usage`:** rejected — `ai_usage` PK is `(day_key, uid_hash)` *counter* rows;
  one row aggregates a whole day of requests, so a per-request join key is semantically impossible
  without re-PK-ing the quota ledger (blast radius on the F-01/F-27 money path — hard no).
- **MariaDB-only evidence scoping (move metrics/cooldowns into MariaDB):** rejected — the engine
  store is deliberately MariaDB-independent (`:memory:` sandbox mode, embedded-WASM environments),
  and hot-path ranking reads must not traverse the pool.
- **Per-tenant table copies (`provider_metrics_t_<id>`):** rejected — unbounded table count,
  migration-hostile, breaks `getRollingAggregates` single-scan.
- **Behavioral fingerprinting to tier mesh aliases:** rejected in Decision 3; see the runbook's
  evidence tiers (fingerprint = supporting evidence only, never sufficient).

---

## 5. Backfill strategy

**None — by design.** All new columns are nullable or carry `DEFAULT 'platform'`; all new tables
start empty. Pre-migration history honestly has no decision ids and no tenant scope (`NULL` /
`'platform'`), and the docs will say so — no fabricated retroactive attribution. The SQLite
rebuilds copy existing rows verbatim into `'platform'` scope (shown inline in §3.1/§3.2), which is
a *preservation* copy, not a backfill: no new information is invented. Ring tables roll over
naturally (5000-row cap); MariaDB ledger growth is bounded by the retention policy note in §4.1.

## 6. Complete `[DDL]` statement inventory (the DDL-GATED surface)

| # | Store | Statement class | Window needed |
|---|---|---|---|
| 1 | SQLite `provider_metrics` | rebuild (CREATE/INSERT-SELECT/DROP/RENAME) + 1 index | none (reviewer approval only) |
| 2 | SQLite `provider_cooldowns` | rebuild + 1 index | none (reviewer approval only) |
| 3 | SQLite `request_log` | 2 × ADD COLUMN + 2 indexes | none (reviewer approval only) |
| 4 | SQLite `routing_decisions` | CREATE TABLE + 2 indexes | none (reviewer approval only) |
| 5 | MariaDB `ai_routing_decisions` | CREATE TABLE (migration 028) + down | **DDL window** |
| 6 | MariaDB `enterprise_ai_usage` | ADD COLUMN + ADD INDEX (migration 029) + down | **DDL window** |

Nothing in this package has been executed. `backend/database/mysql.js`, auth middleware, and the
global rate limiter are untouched by the design (the ledger write path is additive and post-response).
