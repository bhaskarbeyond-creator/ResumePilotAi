# RECONCILIATION — suite-count delta (Ruling 3) and SQLite-vs-MariaDB evidence (Ruling 4)

Status: PREP BRANCH DESIGN DOCUMENT — nothing here is executed.
Audited branch state at time of writing: `bb2b82b` frozen, zero tracked changes, this
directory untracked and being relocated out of the tree per Ruling 2.

## 1. Ruling 3 — reconciliation of 1236 (developer sandbox) vs 1251 (verifier, native MariaDB)

### 1.1 Clean-room re-run (requested by Ruling 3, item 1)

Performed in a fresh `git clone` of `/home/user/ResumePilotAi` detached at
`bb2b82bfa4937a515652d8f1b55995edd1da261b` — no dirty state, no shared
node_modules, no shared caches; `npm ci` inside the clone.

| Attribute | Value |
| --- | --- |
| Runner | `bash scripts/dev-db/run-sandbox-suite.sh` (the repo's canonical sandbox runner, WASM MariaDB bridge, default exclusion) |
| Discovery glob | `ls test/*.test.js \| grep -v mariadb-migration-gate` (script line 25) → **150 files** (151 on disk) |
| Results (clone) | **tests 1232 · pass 1232 · fail 0 · skipped 0 · exit 0 · wall 101 s** |
| Results (main tree, same protocol, same day) | **tests 1236 · pass 1236 · fail 0 · skipped 0 · exit 0** |
| Results (verifier, native MariaDB) | **tests 1251 · pass 1251 · fail 0 · skipped 0**, 151 files |

### 1.2 Root cause of the +15 — `backend/test/mariadb-migration-gate.test.js`

The delta is exactly the 15 tests of `mariadb-migration-gate.test.js`
(`node --test` on that file alone reports `# tests 15`, reproduced twice).
The file is **excluded from the sandbox protocol by design**, on the record:

- `scripts/dev-db/sandbox-suite-protocol.md` line 3: the gate is *"destructive (it drops
  every table and re-applies the full migration ledger)"*; line 25: the discovery glob
  filters it out; line 33: `EXCLUDE="${EXCLUDE:-mariadb-migration-gate}"` — it is
  *"exercised separately on native MariaDB in CI."*
- The gate's own header: it rejects MySQL or MariaDB < 11.4 because
  *"a substitute engine must never be reported as target-database evidence."* The
  sandbox engine is lite4mariadb 13.1.0-embedded (WASM) — a substitute engine.
- Isolated run of the gate on a pristine sandbox schema: **1 pass / 14 fail** —
  it cannot pass against the WASM substitute, by construction, not by defect.
- Contamination proof (why the exclusion exists): forcing the gate into the suite
  (`EXCLUDE=zzz-no-match-zzz`, 151 files) drops the tables mid-suite; the 25 subsequent
  database-dependent tests fail with `ER_NO_SUCH_TABLE` (observed: tests 1244, pass 1219,
  fail 25), and the sandbox DB is left unrecoverable without a full datadir wipe.

Therefore **1251 = 1236 + 15**: the verifier ran full discovery (151 files) against
native MariaDB ≥ 11.4, where the gate passes; the sandbox protocol number covers
150 files because the gate is documented as native-MariaDB-only. Neither count is a
miscount; they are two documented scopes of the same suite.

### 1.3 The ±4 reporting wobble (1232 vs 1236), fully attributed

Diffing the TAP name lists of the clone and main-tree runs isolates exactly four
tests, all from `backend/test/ai-governance-entitlement.test.js`, and all four are the
file's **last four declarations** (lines 440, 446, 462, 477 of 494). Run standalone,
the file reports **25/25 in both trees** — identical substance. The loss is a
tail-truncation race in TAP reporting under `--test-force-exit` (the runner's process
can exit before the last subtest results flush). It is timing-dependent, not
environment-substantive: 1232 + 4 = 1236, and 1236 + 15 = 1251 closes the ledger
exactly.

### 1.4 Correction note (one line, for the prep branch docs — NOT a bb2b82b rewrite)

To be inserted into §8.7 (and the audit appendix) when the prep branch lands:

> Suite-count clarification: 1236 is the sandbox-protocol scope (150 files —
> `mariadb-migration-gate.test.js` excluded per `scripts/dev-db/sandbox-suite-protocol.md`
> as destructive/native-only); 1251 is full discovery (151 files) on native MariaDB;
> both are green, and 1251 = 1236 + the gate's 15 tests.

No history rewrite of `bb2b82b` is proposed or performed.

## 2. Ruling 4 — file:line evidence: engine telemetry is SQLite, with no MariaDB migration

All lines verified at `bb2b82b` in the clean clone.

| # | Claim | Evidence |
| --- | --- | --- |
| i | SQLite handle / init | `backend/freellmapi/services/persistence.js:32-33` (`resolveDatabasePath`, `FREELMAPI_METRICS_DB`), `:53` (`require('node:sqlite')`), `:70` (`this.path = filePath`), `:94` (`this.db = new sqlite.DatabaseSync(this.path)`) |
| ii | Metrics read path | `persistence.js:355` (`getRollingAggregates`), `:364` (`SELECT provider, model, ok, status, latency_ms, created_at FROM request_log WHERE created_at >= ? …`); consumers `backend/freellmapi/router.js:260`, `backend/freellmapi/selectionPolicy.js:433` |
| iii | Cooldown write path | `persistence.js:220` (`recordCooldown`), `:230` (`INSERT INTO provider_cooldowns …`); caller `backend/freellmapi/cooldown.js:81` (`setCooldown`) → `:113` (`this._persist(...)`) |
| iv | "No MariaDB migration" comment | `persistence.js:136`: *"…product schema; no MariaDB migration is involved."* |
| v | Next migration number + ledger | `backend/database/migrations/` ends at `027_enterprise_tenant_credentials.sql` → next is **028**; ledger table `schema_migrations` created at `backend/database/migrationRunner.js:83`; `MIGRATION_DIRECTORY` at `migrationRunner.js:7` |

Negative proof (greps over `backend/database/*.sql`, `backend/database/*.js`, and the
whole `backend/` tree): **zero references** to `provider_metrics`, `provider_cooldowns`,
or `request_log` outside `backend/freellmapi/**` and its tests. The claim stands; there
is nothing to retract.

Consequence for Ruling 5 gating: **Phase A** (SQLite-scoped rebuilds: selection,
saturation, and decision-record sinks in `persistence.js`/`router.js`/`cooldown.js`)
touches **no MariaDB surface at all** — it needs per-file reviewer approval only, never
a DDL window. **Phase S2** (MariaDB migrations `028_ai_routing_decisions` +
`029_enterprise_ai_usage_decision_id`) remains correctly DDL-window-gated.

## 3. Reproduction commands

```bash
git clone /home/user/ResumePilotAi verify-clean-bb2b82b
cd verify-clean-bb2b82b && git checkout --detach bb2b82bfa4937a515652d8f1b55995edd1da261b
cd backend && npm ci --no-audit --no-fund
bash scripts/dev-db/run-sandbox-suite.sh        # expect: fail 0, exit 0, tests 1232–1236 (see §1.3)
```
