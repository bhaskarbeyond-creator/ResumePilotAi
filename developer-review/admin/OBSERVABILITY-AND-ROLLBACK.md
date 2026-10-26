# Observability, operations and rollback — evidence

**Requirement:** observability, deployment, operations and a rollback drill, implemented and
evidenced (step 5 of the extended mandate).
**Owner of the claim:** this document. Every number below is produced by a command that appears
next to it, or by a test that fails if the number stops being true.

---

## 1. What was missing, stated precisely

Before this step the admin plane had three of the four things an on-call operator needs, and
they were not connected to each other:

| Need | Before | Where it was |
|---|---|---|
| Liveness of each subsystem | ✅ | `GET /api/platform/operational-status` → `services/platformHealth.js` probes each dependency and freezes a per-service record (`state`, `reason`, `configuration`, `critical`) |
| Durable history | ✅ | `enterprise_observability_rollups`, read by `GET /api/platform/observability` (`routes/platform.js:868`) |
| Structured log lines | ✅ (partial) | `admin.audit.denial_unrecorded`, `admin.policy.no_rule`, `config.write_failed`, `rbac.write_failed` — each a JSON line with a `requestId` |
| **Fast counters an alert can be written against** | ❌ | Nowhere. `REC-025` named the gap: *"Emit counters `admin_audit_write_failures`, `admin_action_total{action,outcome}`, `admin_denied_total{code}`"* |

A log line answers "what happened to request `req-abc`". It cannot answer "how many audit rows
were lost in the last five minutes", because answering that requires shipping logs to a log
store and querying them — and the moment you most need the answer is the moment the database
that would store it is the thing that is broken.

---

## 2. What was built

`backend/services/operationalMetrics.js` — an in-process counter registry, four counters, no
dependency:

| Counter | Labels | Question it answers | Alerts on it |
|---|---|---|---|
| `admin_action_total` | `action`, `outcome` | Is the admin plane being used, and are mutations succeeding? | `rate(admin_action_total{outcome="FAILURE"}[5m]) > 0.1 × rate(admin_action_total[5m])` for 10 m |
| `admin_denied_total` | `code`, `role`, `route` | Who is being refused what, where? | `rate(admin_denied_total{code="FORBIDDEN"}[5m]) > 0.5` sustained 10 m (a spike means either an operator was demoted by a config change or a credential is being probed) |
| `admin_audit_write_failures` | `surface` (`middleware`/`denial`/`route`) | **Did an action happen with no trail?** | `increase(admin_audit_write_failures[5m]) > 0` — page immediately, any non-zero value |
| `config_write_total` | `outcome` | Are configuration writes succeeding, conflicting or failing? | `increase(config_write_total{outcome="FAILED"}[15m]) > 0`; `CONFLICT` is not an alert (two operators, one row) |

Where each increment is wired — one line per code path, so a missing counter is visible as an
absent line rather than as a wrong number:

| Counter | Wired at | Why there |
|---|---|---|
| `admin_action_total` | `security/adminAudit.js` post-response middleware, **after** the audit row persists | An action counted before its row exists would report a mutation the trail cannot show — the one discrepancy an incident review must never have to reconcile |
| `admin_denied_total` | `security/policy.js` `denyAndCount()`, all six refusal branches; `security/denialAudit.js` | The policy engine is the largest producer of 403s; counting at the source means a denial is counted even when the audit store is down |
| `admin_audit_write_failures` | `security/adminAudit.js` (middleware), `security/denialAudit.js` (denial), `routes/config.js` + `routes/adminRbac.js` mappers (route) | Every path that can lose a row is represented; the `surface` label says which one did |
| `config_write_total` | `routes/config.js` `PUT /:key` success and catch | The outcome vocabulary is the caller's (`CONFLICT`, `READ_ONLY`, `INVALID`, `FAILED`), not the driver's |

### Surfaces

| Surface | Auth | Content |
|---|---|---|
| `GET /api/platform/metrics` | `security.read` (manifest rule `platform-health`) | Prometheus text (`text/plain; version=0.0.4`), `Cache-Control: no-store`. `Accept: application/json` returns the same data as structure |
| `GET /api/platform/operational-status` | `security.read` | The health snapshot **plus** `metrics`, attached at response time so a 30 s snapshot cache cannot make a counter look stale |
| `GET /api/platform/observability` | `security.read` | Durable rollups (unchanged) |

No database read is involved in a scrape. That is the design decision, recorded as
`ADR-007`: *the alarm must survive the outage it is meant to report*.

### Why the counters cannot leak

A metrics endpoint is read by monitoring agents and pasted into incident tickets. Three
defences, each pinned by a test in `test/observability-metrics.test.js`:

1. **Closed vocabularies** — outcomes, roles (`OTHER` for anything unrecognised) and route shapes.
2. **Route normalisation** — `/api/admin/users/9f3c2a11-…/ai-entitlement` becomes
   `/api/admin/users/:id/ai-entitlement`; two instances are one series.
3. **A hard ceiling** — 500 series per counter, then an `__overflow__` bucket and a
   `droppedSeries` count. Overflow is *visible*, because silently dropping would hide the
   cardinality bug behind the metric that exists to expose it.

---

## 3. SLOs and what a breach means

These are the targets the admin plane is operated against. They are stated as user-visible
behaviour, not as process metrics, because a CPU number is not an SLO.

| SLO | Target | Measured by | Test that pins the mechanism |
|---|---|---|---|
| Capability census availability | 99.9 % monthly | `admin_action_total` on the capability route + the `e2e` smoke job | `test/performance-budget.test.js` (≤ 32 KB, ≤ 200 ms) |
| Configuration census latency | p95 ≤ 200 ms, ≤ 1 store read per request | `test/performance-budget.test.js` cache assertion | `test/mariadb-query-budget.test.js` (1 round trip cold, 1 batched read warm) |
| Configuration census under load | p95 ≤ 1 000 ms at 20 concurrent | `test/load-sustained.test.js` | 200 requests, zero 5xx |
| Control-plane reads under operator load | p95 ≤ 750 ms at 50 concurrent | `test/load-concurrency.test.js` | 50 operators, zero 5xx |
| **Audit completeness** | 100 % — every mutation has a row | `admin_audit_write_failures` must stay 0 | `test/config-edge-coverage.test.js`, `test/admin-rbac-edge-coverage.test.js` (exactly one semantic row per mutation) |
| Authority resolution latency | p95 ≤ 5 ms (in-process, cached) | `runtimeLimits` zero-query assertion | `test/runtime-limits.test.js` (500 reads, zero queries) |
| Rate limiter fidelity | sheds at the configured rate, never 5xx | `load-sustained` 5xx assertion | `test/runtime-limits.test.js` |

**Audit completeness is the only SLO with a 100 % target and a page.** The others degrade; that
one is a truth claim about the system — an action with no trail cannot be reviewed, and the
compliance posture is built on the assumption that it is complete.

---

## 4. Deployment

`DEPLOYMENT-RUNBOOK.md` is the operational document (pre-flight, migration, verification,
rollback, granting a role, break-glass, post-deploy checks, required configuration). This
section is the *observability half* of the same procedure — what an operator does that the
runbook's steps do not cover.

### 4.1 Scrape configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: resumepilot-admin
    metrics_path: /api/platform/metrics
    scheme: https
    scrape_interval: 30s
    scrape_timeout: 5s
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/resumepilot-scrape-token
    static_configs:
      - targets: ['api.example.com']
```

The service account behind that token needs exactly one permission: `security.read`. It does
not need `system.config.write`, and it must not be a SUPER_ADMIN — a scrape token that can
change configuration turns monitoring into an attack path. Creation is one
`POST /api/admin/rbac/grants/:uid` with a stated reason, and it lands in the audit trail like
any other authority change.

### 4.2 Order of operations on a deploy

1. **Before** the container swap: `GET /api/platform/operational-status` and record
   `summary.overall` + `metrics`.
2. Migrate (`DEPLOYMENT-RUNBOOK.md §2`).
3. Swap, then wait for `summary.overall` to return to the recorded value.
4. Confirm `admin_audit_write_failures{surface="middleware"}` is **0** — a non-zero value after
   a deploy is the fastest signal that `028_admin_rbac` / `029_config_overrides` did not apply.
5. Confirm the counters are *moving*: one deliberate refused request
   (`curl` an admin route with a USER token) must appear as
   `admin_denied_total{code="FORBIDDEN"}`. A counter that never moves and a counter that is
   broken look identical from a dashboard.

### 4.3 What a rollback does to the counters

The registry is in-process: **a restart resets every counter to zero.** This is deliberate and
has one operational consequence worth stating — an alert written as
`increase(admin_audit_write_failures[5m]) > 0` is reset-safe, while one written as
`admin_audit_write_failures > 0` is not (it would page forever on a value that a restart
cleared, or worse, be silenced by one). Use `increase()`, never the raw value, and never
`resets()`-derived logic on these counters.

`metrics.snapshot()` reports `since` (process start) and `uptimeMs`, so a dashboard can tell
"zero because nothing happened" from "zero because it just restarted".

---

## 5. Rollback drill

Three layers, from cheapest to most expensive:

| Layer | Command | Proves | Runs here? |
|---|---|---|---|
| Application | `git revert <sha>` + redeploy | The code returns to the previous behaviour; no schema change is involved in REC-025 (counters are process-local, the route is additive) | yes (git) |
| Schema | `npm run migration:drill` (`backend/`) | Every migration applies forward twice (idempotency), then backwards twice (reversibility), with a schema checksum comparison | **no** — needs MariaDB (`OI-005-6`); it runs in the CI `migration-drill` job |
| Schema, contract | `test/migration-drill-contract.test.js` (6) | The drill refuses a production-looking database name before touching anything, its splitter handles `DELIMITER` blocks, every forward migration is reversible or carries a declared exemption | yes |
| Schema, chain | `test/migration-rollback-drill.test.js` | Empty → forward chain → markers → every `.down.sql` in reverse → documented residue only → re-apply | **no** — needs MariaDB; CI only |
| Live | `DEPLOYMENT-RUNBOOK.md §4` | The documented rollback procedure, step by step, including what not to do | procedure |

### Why the counters make a rollback cheaper

Before `metrics`, the first evidence of a bad deploy was a user report. A bad authority change
now shows up as `admin_denied_total` for a role that should be permitted, within one scrape
interval, with the route in the label — which is enough to decide revert-vs-fix without
reproducing anything. That is the operational argument for the counter, as distinct from the
security argument for the audit row.

---

## 6. Evidence index

| Claim | Command | Result |
|---|---|---|
| The counters move when something happens | `NODE_ENV=test node --test test/observability-metrics.test.js` | **17 / 17 pass** |
| Nothing else regressed | `NODE_ENV=test npm run test:tiers` | **101 tests, 99 pass, 2 conditional skips (database-gated), 0 fail** |
| The scrape needs no database | same file, "serves Prometheus text without touching the database" | pass — the app is required with no pool configured |
| A lost audit row is caught in one scrape | same file, "a write whose audit row cannot be written answers 503 and increments the failure counter" | pass — 503 + `surface="route"` = 1 |
| Denials are attributable by role and route | same file, two attribution cases | pass |
| No label can carry an email, uid, token or free text | same file, "no label carries an email, a uid, a token or free text" | pass |
| The ceiling holds and is visible | same file, cardinality case | pass — 501 series, `droppedSeries` counted |
| The endpoint is admin-only | same file, boundary case | pass — 401 anonymous, 403 for USER/SUPPORT, 200 for AUDITOR |
| The health snapshot carries the counters | same file, "embedded in the operational status" | pass |
| Nothing broke | `NODE_ENV=test npm run test:coverage` | **241 / 241 pass**, **98.82 / 87.23 / 97.95 / 98.82**, gate exit 0 |
| `operationalMetrics.js` is covered | `coverage-summary.json` | **100 % statements, 85.48 % branches** (single file; the global gate is 85 %) |
