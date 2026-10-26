# H.3 — Production observation cycle (R14.3 package)

**Status: PACKAGE — human execution pending. Nothing here is pre-credited; the tenant-scoped
evidence / decision-ledger / tenant key-pool dimensions stay capped until one completed cycle's
evidence is returned.**

## Why a production cycle is required

Three landed capabilities cannot be certified from the sandbox alone:

1. **C.1 tenant-scoped evidence** (`FREELMAPI_TENANT_SCOPED_EVIDENCE=1`): sandbox probes prove
   platform-scope byte-equality with the flag OFF and scoped semantics in unit tests; only real
   multi-tenant traffic proves the blast-radius claim in vivo (a failing tenant benches ONLY its
   own scope; platform cooldowns are never cleared by tenant-scoped events — F-14).
2. **C.2 decision ledger** (`FREELMAPI_DECISION_LEDGER=1`): requires the real DDL window for
   migrations 028/029 (`developer-review/probes/2026-10-26/r12-migration-dry-run-sandbox.txt`
   proves the scripts in WASM; the production ledger was never touched, by mandate).
3. **C.5 tenant key pools**: pools flow through the existing 027 `enterprise_tenant_credentials`
   envelope in production; the sandbox proves the router/pool shapes, not real key material
   lifecycle (rotation, revocation, per-key 429s benching only the failing credential).

## The cycle (operator time ≈ 25 min total; wall-clock duration 14 days)

- **Day 0 (15 min):** deploy the current tip with both flags OFF (defaults). Record the
  pre-cycle baseline block of `observation-form.md`. Apply 028/029 during the scheduled DDL
  window using `backend/database/migrations/028_ai_routing_decision_ledger.sql` +
  `029_enterprise_ai_usage_decision_id.sql` (down scripts exist for rollback). Flip both flags
  to `1` and restart. Record the deploy block.
- **Days 1–13 (≈ 1 min/day, optional):** fill the daily-check row if anything looks off; the
  cycle is passive — no synthetic traffic required.
- **Day 14 (10 min):** fill the exit-criteria block from telemetry:
  - F-22 routing telemetry route (`GET /api/admin/ai/routing-telemetry`, super-admin)
  - SQLite: `routing_decisions` ring (`PRAGMA integrity_check`), `request_log.decision_id` fill
  - MariaDB: `enterprise_ai_usage.decision_id` fill rate; `provider_cooldowns` scoped rows
    (`scope_key`, `credential_kind`) vs platform rows
  - `provider_metrics` scoped rebuild idempotence is NOT re-run in production (sandbox-certified);
    record only whether any scoped anomaly was observed.
- **Sign-off:** operator + engine owner. Return the filled form; the score moves only against the
  returned artifact.

## Rollback (any time, ≤ 5 min)

1. Set both flags back to `0`, restart — every C.1/C.2 code path is flag-guarded and
   byte-identical with flags OFF (certified 10× + byte-equal probe legs A.9r3/A.9r4/A.10r3).
2. If 028/029 must be reverted: run the `.down.sql` scripts in the next DDL window. The
   capability probe means pre-028 instances emit zero unknown-column SQL, so reverting the DDL
   while flags are OFF is a no-op for the request path.
3. Record the rollback in the form's incident section with timestamps and trigger.

## Exit criteria (all must hold; any failure = cycle restarts after fix)

- Zero cross-tenant benching events (a tenant-scoped cooldown never benched another tenant or
  the platform scope).
- Zero platform-cooldown clears attributable to tenant-scoped activity (F-14 guard held).
- `decision_id` join integrity ≥ 99% between `enterprise_ai_usage`, `request_log` and the
  `routing_decisions` ring for the observed window (ring pruning may legitimately drop the
  oldest tail — record the ring size, don't chase pruned rows).
- No sustained p50 latency regression > 5% vs the day-0 baseline attributable to the flags.
- Zero unknown-column SQL errors on any instance (capability probe working).

Fill-in form: `observation-form.md` in this directory.
