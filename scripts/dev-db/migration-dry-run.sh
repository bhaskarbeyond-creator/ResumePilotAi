#!/usr/bin/env bash
# PH4-ENGINE-022 migration dry-run — the exact checklist for the real DDL window.
#
#   bash scripts/dev-db/migration-dry-run.sh [--sandbox]
#
# Modes:
#   --sandbox   self-contained: starts a throwaway lite4mariadb bridge, runs the
#               full checklist, tears everything down. NEVER touches any real DB.
#   (default)   runs against the configured real MariaDB (DB_HOST/DB_USER/...)
#               — intended for the one-time production/staging DDL window after
#               a reviewed backup. Refuses to run the destructive down
#               round-trip unless ALLOW_DOWN_ROUNDTRIP=1 AND DB_HOST is not prod.
#
# Steps (each prints PASS/FAIL and the script exits non-zero on any FAIL):
#   1. preflight: migrationStatus clean-or-explainable; discover 028/029
#   2. apply: runMigrations (GET_LOCK-guarded, ledger-recorded, checksummed)
#   3. post-checks: ai_routing_decisions shape + indexes; enterprise_ai_usage.decision_id
#   4. legacy-insert compatibility (insert WITHOUT decision_id, then delete)
#   5. parallel no-op: two concurrent runMigrations
#   6. OPTIONAL down round-trip (029.down -> 028.down -> re-up) — non-prod only
#   7. final: migrationStatus zero pending, zero mismatches
#
# Set -u -o pipefail; no -e (steps must report individually).
set -u -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$ROOT/backend"
SANDBOX=0
[[ "${1:-}" == "--sandbox" ]] && SANDBOX=1

PASS=0; FAIL=0
step() { # step NAME COMMAND...
  local name="$1"; shift
  if "$@" > /tmp/dry-run-step.out 2>&1; then
    echo "PASS  $name"; PASS=$((PASS+1))
  else
    echo "FAIL  $name"; sed 's/^/      /' /tmp/dry-run-step.out | head -12; FAIL=$((FAIL+1))
  fi
}
node_step() { # node_step NAME 'js code'
  local name="$1"; shift
  if (cd "$BACKEND" && node -e "$1") > /tmp/dry-run-step.out 2>&1; then
    echo "PASS  $name"; PASS=$((PASS+1))
  else
    echo "FAIL  $name"; sed 's/^/      /' /tmp/dry-run-step.out | head -12; FAIL=$((FAIL+1))
  fi
}

BRIDGE_PID=""
cleanup() { [[ -n "$BRIDGE_PID" ]] && kill "$BRIDGE_PID" 2>/dev/null; }
trap cleanup EXIT

if [[ "$SANDBOX" == 1 ]]; then
  echo "== sandbox mode: throwaway lite4mariadb bridge =="
  rm -rf /tmp/mig-dry-run-datadir && mkdir -p /tmp/mig-dry-run-datadir
  BRIDGE_DATA_DIR=/tmp/mig-dry-run-datadir BRIDGE_PORT=13306 \
    node "$ROOT/scripts/dev-db/mariadb-sandbox-bridge.mjs" >/tmp/mig-dry-run-bridge.log 2>&1 &
  BRIDGE_PID=$!
  for _ in $(seq 1 60); do
    if (exec 3<>/dev/tcp/127.0.0.1/13306) 2>/dev/null; then break; fi
    sleep 0.5
  done
  export DB_HOST=127.0.0.1 DB_PORT=13306 DB_USER=root DB_PASSWORD= DB_NAME=mig_dryrun NODE_ENV=test
  # Baseline schema first (the real window starts from a fully-migrated DB).
  (cd "$BACKEND" && DB_HOST=127.0.0.1 DB_PORT=13306 DB_USER=root DB_PASSWORD= DB_NAME=mig_dryrun NODE_ENV=development \
    node -e "require('./database/mysql').initializeSchema({mode:'apply'}).then(r=>{process.exit(r.success?0:1)})" >/dev/null 2>&1) \
    && echo "PASS  sandbox baseline schema initialized" && PASS=$((PASS+1)) \
    || { echo "FAIL  sandbox baseline schema"; exit 1; }
  ALLOW_DOWN_ROUNDTRIP=1  # sandbox is always safe for the destructive leg
fi

echo "== PH4-ENGINE-022 migration dry-run (028/029) =="

node_step "preflight: 028/029 discovered, ledger readable" "
const { getPool } = require('./database/mysql');
const { discoverMigrations, migrationStatus } = require('./database/migrationRunner');
(async () => {
  const discovered = discoverMigrations().filter(m => ['028','029'].includes(m.version));
  if (discovered.length !== 2) throw new Error('expected 028+029 discovered, got ' + discovered.length);
  const pool = getPool();
  await pool.query('SELECT 1'); // baseline schema must already be present
  const status = await migrationStatus(pool);
  console.log('pending=' + status.pending.map(p => p.version).join(',') + ' mismatches=' + status.mismatches.length);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
"

node_step "apply: runMigrations (lock-guarded, idempotent)" "
const { getPool } = require('./database/mysql');
const { runMigrations } = require('./database/migrationRunner');
(async () => {
  const result = await runMigrations(getPool(), { mode: 'apply', environment: process.env });
  console.log('applied=' + JSON.stringify(result.applied.map(r => r.version)));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
"

node_step "post-check: ai_routing_decisions shape + indexes + no FK" "
const { getPool } = require('./database/mysql');
(async () => {
  const c = await getPool().getConnection();
  const [cols] = await c.query('SHOW COLUMNS FROM ai_routing_decisions');
  const names = cols.map(r => r.Field);
  for (const f of ['decision_id','created_at','day_key','scope','tenant_id','uid_hash','mode','requested_model','chosen_provider','chosen_model','exploration','quality_evidence','observed_latency_ms','observation_count','outcome','status','latency_ms','prompt_tokens','completion_tokens'])
    if (!names.includes(f)) throw new Error('missing column ' + f);
  const [idx] = await c.query('SHOW INDEX FROM ai_routing_decisions');
  const keys = new Set(idx.map(r => r.Key_name));
  for (const k of ['PRIMARY','idx_ard_tenant_day','idx_ard_uid_day','idx_ard_created'])
    if (!keys.has(k)) throw new Error('missing index ' + k);
  const [create] = await c.query('SHOW CREATE TABLE ai_routing_decisions');
  if (/FOREIGN KEY/i.test(create[0]['Create Table'])) throw new Error('unexpected FK');
  const [dcol] = await c.query(\"SHOW COLUMNS FROM enterprise_ai_usage LIKE 'decision_id'\");
  if (dcol.length !== 1 || dcol[0].Null !== 'YES') throw new Error('decision_id column missing/not nullable');
  c.release(); process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
"

node_step "legacy-insert compatibility (pre-C shape still writes)" "
const { getPool } = require('./database/mysql');
const crypto = require('crypto');
(async () => {
  const c = await getPool().getConnection();
  const suffix = crypto.randomBytes(6).toString('hex');
  const tenantId = 'dry-run-tenant-' + suffix;
  const id = 'dryrun-' + suffix;
  try {
    // enterprise_ai_usage carries fk_ent_ai_tenant: seed a disposable tenant first.
    await c.query('INSERT INTO enterprise_tenants (id, slug, displayName, isolationTier, lifecycleState) VALUES (?, ?, ?, ?, ?)',
      [tenantId, 'slug-' + tenantId, 'Migration dry-run tenant', 'STANDARD', 'ACTIVE']);
    await c.query('INSERT INTO enterprise_ai_usage (id, tenantId, workspaceId, principalId, dayKey, provider, model, operation, eventKey, correlationId, policyVersion, promptTokens, completionTokens, totalTokens, costEstimate, costMicros, recordedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, tenantId, null, 'dry-run-principal', '2026-01-01', 'p', 'm', 'dry-run', 'evt-' + id, 'corr', 1, 1, 2, 3, 0, 0, new Date()]);
    const [rows] = await c.query('SELECT decision_id FROM enterprise_ai_usage WHERE id = ?', [id]);
    if (rows[0].decision_id !== null) throw new Error('legacy row must keep NULL decision_id');
  } finally {
    await c.query('DELETE FROM enterprise_tenants WHERE id = ?', [tenantId]).catch(() => {});
    await c.query('DELETE FROM enterprise_ai_usage WHERE id = ?', [id]).catch(() => {});
    c.release();
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
"

node_step "parallel runMigrations: second run is a clean no-op" "
const { getPool } = require('./database/mysql');
const { runMigrations } = require('./database/migrationRunner');
(async () => {
  const [a, b] = await Promise.all([
    runMigrations(getPool(), { mode: 'apply', environment: process.env }),
    runMigrations(getPool(), { mode: 'apply', environment: process.env }),
  ]);
  if (a.applied.length || b.applied.length) throw new Error('expected both runs to be no-ops');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
"

DOWN_ALLOWED=0
if [[ "${ALLOW_DOWN_ROUNDTRIP:-0}" == 1 ]]; then
  case "${DB_HOST:-}" in *prod*|*production*) ;; *) DOWN_ALLOWED=1 ;; esac
fi
if [[ "$DOWN_ALLOWED" == 1 ]]; then
  node_step "down round-trip: 029.down -> 028.down -> re-up" "
const fs = require('fs'), path = require('path');
const { getPool } = require('./database/mysql');
const { runMigrations, migrationStatus, splitSqlStatements } = require('./database/migrationRunner');
const dir = path.join(__dirname, 'database', 'migrations');
(async () => {
  const c = await getPool().getConnection();
  for (const v of ['029', '028']) {
    const file = fs.readdirSync(dir).find(n => n.startsWith(v + '_') && n.endsWith('.down.sql'));
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const stmt of splitSqlStatements(sql)) await c.query(stmt);
    await c.query('DELETE FROM schema_migrations WHERE version = ?', [v]);
  }
  const [gone] = await c.query(\"SHOW TABLES LIKE 'ai_routing_decisions'\");
  if (gone.length) throw new Error('028.down failed to drop the table');
  const mid = await migrationStatus(getPool());
  const pendingVersions = mid.pending.map(p => String(p.version));
  if (!pendingVersions.includes('028') || !pendingVersions.includes('029')) throw new Error('pending must list 028/029 after downs');
  const re = await runMigrations(getPool(), { mode: 'apply', environment: process.env });
  const final = await migrationStatus(getPool());
  if (final.pending.length || final.mismatches.length) throw new Error('re-up left pending/mismatches');
  c.release(); console.log('re-applied=' + JSON.stringify(re.applied.map(r => r.version))); process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
"
else
  echo "SKIP  down round-trip (set ALLOW_DOWN_ROUNDTRIP=1 on a non-prod host to enable)"
fi

node_step "final: migrationStatus clean" "
const { getPool } = require('./database/mysql');
const { migrationStatus } = require('./database/migrationRunner');
(async () => {
  const status = await migrationStatus(getPool());
  if (status.pending.length) throw new Error('pending: ' + status.pending.map(p => p.version).join(','));
  if (status.mismatches.length) throw new Error('mismatches: ' + JSON.stringify(status.mismatches));
  console.log('ledger rows: ' + status.applied.length);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
"

echo "=============================="
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" == 0 ]] && exit 0 || exit 1
