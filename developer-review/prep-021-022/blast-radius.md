# (d) Blast-radius estimate + per-file impact map (execution phase)

**NOT EXECUTED — DDL-GATED. Design only. Estimates assume the code described in (a)/(b)/(c) lands
in a future execution engagement; nothing here has been written or run.** Baseline for all
regression statements: frozen tip `bb2b82b`, suite 1236/1236.

---

## 1. Per-file impact map

| File | Est. Δ lines | Change class | Risk | Notes |
|---|---:|---|---|---|
| `backend/freellmapi/services/persistence.js` | ~130 | schema v2 guards + rebuild txn, scoped `recordRequest`/`getRollingAggregates`/cooldown CRUD, `routing_decisions` writer + ring prune, capability flags (`scopedSchema`, `supportsDecisionLedger`) | **MEDIUM** | Highest concentration; all writes stay best-effort (`try/catch`, never break routing — existing discipline at `:52`, `:659`). Rebuild runs once at open, idempotent. `:memory:` mode unaffected by rollback concerns |
| `backend/freellmapi/services/cooldown.js` | ~60 | `_makeKey(+scope)`, scoped `isOnCooldown`/`putOnCooldown`/`clearCooldown`, `credential_kind`, scoped hydration, last-resort-release scope guard | **MEDIUM** | Touches the F-12/F-14 certified surfaces; regression tripwires: existing cooldown tests + (c)1.1 items 7–9 |
| `backend/freellmapi/services/router.js` | ~45 | thread `scopeKey` from `tenantContext` into record/cooldown/aggregate calls; replace the `scoped:true` sink-hole with tenant-scope recording; generate + attach `decisionId`; post-response ledger write (fire-and-forget) | **HIGH-ATTENTION** | This file carries the certified S1 exploration block, F-03/F-07/F-14 logic and the P0-adjacent dispatch loop. Containment: scope threading is parameter-passing only; decision ordering untouched; the S1 9-test file + `freellmapi-rolling-rank` re-certify 10× at the execution commit; A.9r3/A.9r4 probe legs restated live |
| `backend/freellmapi/services/selectionPolicy.js` | ~8 | `observationFor` gains scope awareness at the router seam (policy function itself stays pure; aggregates arrive pre-scoped) | **LOW** | Pure-function contract preserved; picker untouched |
| `backend/services/aiRouting/routingTelemetry.js` | ~6 | `decisionId` field in `record()` (tenantId already exists) | **LOW** | Additive ring field; redaction re-proven by (c)2.8 |
| `backend/services/aiRuntime.js` | ~18 | wire `decisionId` into `_freellmapi.routing_decision` metadata; pass principal scope (uid_hash/tenantId) into router calls where absent | **MEDIUM** | File is large and central, but change is field-passing; F-05 engine-choice paths untouched |
| `backend/enterprise/mysqlEnterpriseRepository.js` | ~8 | `decision_id` in the `enterprise_ai_usage` INSERT (`:408`) + column-explicit insert verification | **LOW** | Insert is already column-explicit; nullable column = legacy-safe (checked by (b) B4) |
| `backend/database/migrations/028_*.sql` / `.down.sql` | 2 new files | CREATE TABLE + down | **LOW** | Additive table; no existing object touched |
| `backend/database/migrations/029_*.sql` / `.down.sql` | 2 new files | ADD COLUMN + INDEX + down | **LOW-MED** | ALTER on a live money-adjacent ledger; instant-add-column on MariaDB 13.1 (verified in dry-run B3); down drops only the nullable join column |
| `backend/test/` (new files per (c)) | ~450 (2 unit + 8 integration/e2e) | new tests only | **NONE** (additive) | No existing test edited; the 5 disclosed engagement-era test edits stay untouched |
| Docs (findings/rating/consumers/audit) | ~120 | closure rows + wire-contract notes at execution time | **NONE** | Mirrors kept byte-identical |

**Explicitly untouched (hard boundary, per mandate):** `backend/database/mysql.js` (the runner
import at `:6` already exists — no change needed), auth middleware, global rate limiter,
`backend/security/abuse.js` (quota money path — the design routes around it, never through it),
frontend/, lockfiles (zero new dependencies: `crypto.randomUUID`, `node:sqlite` and the existing
runner are all in-tree).

## 2. Aggregate estimate

- Source: **~275 lines across 7 existing files + 4 new SQL files** (2 migrations × up/down).
- Tests: **~450 lines, 10 new files**, zero existing-test edits.
- Execution window: **1–2 working days** of implementation + the certification/probe cycle
  (10× certs for 2 unit files; 8 integration files; 3 restated live probe legs), assuming the
  Phase-A rehearsal checklist passes first try.

## 3. Risk register (top 5, with containment)

1. **router.js regression on certified surfaces (S1/F-03/F-07/F-14).** Containment: parameter-only
   threading; flag-gated activation; full 1236-suite + S1/wave-1/wave-2 re-certification 10×;
   A.9r3/A.9r4 probe restatement as the live gate. Rollback = flag off (Phase C design).
2. **SQLite rebuild corrupting a production metrics file** (Phase A). Containment: mandatory
   pre-copy (b §4 A1), transaction-wrapped rebuild, `integrity_check` post-verify, restore drill
   automated in (c)2.3. Impact ceiling even on failure: re-learnable evidence only — no money,
   auth, or quota data lives in this store.
3. **Cross-tenant cooldown semantics over-promised** (the physics trap: platform-key 429s are
   shared-credential facts). Containment: design says so explicitly (a §2.2), test (c)1.1-7 and
   e2e (c)2.5 assert BOTH halves (tenant isolation AND platform-wide honesty for shared
   credentials); docs will carry the same sentence — no marketing-friendly overclaim.
4. **decisionId ledger write becoming a hot-path dependency.** Containment: post-response,
   fire-and-forget, capability-probed, fault-injection test (c)1.2-6 proves a failing ledger never
   touches the response or the charge.
5. **Migration 029 ALTER on `enterprise_ai_usage` in a live window.** Containment: nullable
   additive column (instant ADD on InnoDB/MariaDB 13.1), down verified in dry-run B3, money columns
   untouched, legacy-insert compatibility checked in B4 before any flag enable.

## 4. What does NOT change (regression contract, stated for the verifier)

- Wire shape: `_freellmapi.routing_decision` gains only `decisionId` (additive; `exploration`,
  `mode`, `qualityEvidence`, `observedLatencyMs`, `observationCount`, `fallbackFrom` unchanged).
- Quota/admission: `/v1` chain, `ai_usage` charging semantics, `AI_*_LIMIT` envs — byte-identical.
- Selection outcomes for platform-scope traffic with flags off: **identical by construction**
  (every pre-existing row/aggregate reads back as `scope_key='platform'`; probe (b) A5 requires
  byte-equal served sequences against the S1 AFTER transcript).
- Curated tier table, exploration cadence constants, manual/explicit/quality/BYOK-sanctuary
  guards: untouched.
