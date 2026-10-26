#!/usr/bin/env bash
# R15 tenant probe legs — A.15r1 / A.15r2 / A.16 on the TIP tree, flags ON
# (FREELMAPI_TENANT_SCOPED_EVIDENCE=1, FREELMAPI_DECISION_LEDGER=1).
#
# Design (disclosed in leg-tenant.mjs header): the legs drive the REAL engine
# singleton in-process (backend/freellmapi completeChat / resetCooldowns — the
# exact functions the HTTP routes call) with a URL-rewriting fetchImpl pointing
# registry baseUrls at local OpenAI-compatible stubs, because dedicated-BYOK
# candidates dispatch to the registry's real provider baseUrl by design and the
# sandbox has no external egress. The HTTP route layer (preview-login, tenant
# resolution, deny-by-default aiPolicy CAS grant, X-Tenant-Id, scoped
# reset-state route echoes) was proven live in tenant run 3 and is cited in the
# archiving commit. 028/029 need no manual application: initializeSchema ->
# runMigrations applies backend/database/migrations/ (schema_migrations ledger).
set -u -o pipefail

ROOT=/home/user/ResumePilotAi
OUT=$ROOT/developer-review/probes/2026-10-26
H=$ROOT/developer-review/probes/harness
ALPHA_PORT=8791
BETA_PORT=8792

BRIDGE_PID=""; STUB_A=""; STUB_B=""
cleanup() { for p in "$STUB_A" "$STUB_B" "$BRIDGE_PID"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

K1=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
KEYS_BUNDLE="{\"v1\":\"$K1\"}"

echo "== R15 tenant probe run: $(date -u '+%Y-%m-%dT%H:%M:%SZ') =="
echo "tip tree: $ROOT ($(cd "$ROOT" && git rev-parse --short HEAD))"

rm -rf /tmp/probe-tenant-datadir && mkdir -p /tmp/probe-tenant-datadir
BRIDGE_DATA_DIR=/tmp/probe-tenant-datadir node "$ROOT/scripts/dev-db/mariadb-sandbox-bridge.mjs" > /tmp/probe-tenant-bridge.log 2>&1 &
BRIDGE_PID=$!
for _ in $(seq 1 60); do (exec 3<>/dev/tcp/127.0.0.1/3306) 2>/dev/null && break; sleep 0.5; done
sleep 8
echo "bridge up (pid $BRIDGE_PID)"

prep_db() { # DB_NAME
  (cd "$ROOT/backend" && timeout 60 env NEWDB="$1" NODE_ENV=development node -e "
    const m = require('mysql2/promise');
    (async () => {
      const c = await m.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '' });
      await c.query('DROP DATABASE IF EXISTS ' + process.env.NEWDB);
      await c.query('CREATE DATABASE ' + process.env.NEWDB);
      await c.end(); process.exit(0);
    })()" >/dev/null 2>&1)
  (cd "$ROOT/backend" && timeout 180 env DB_NAME="$1" DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= NODE_ENV=development \
    node -e "require('./database/mysql').initializeSchema({mode:'apply'}).then(r=>{process.exit(r.success?0:1)})" >/dev/null 2>&1)
  echo "prep_db $1: schema exit $?"
}

start_stubs() { # BETA_AUTHFAILS
  NAME=alpha PORT=$ALPHA_PORT MODEL=gpt-4o MODE=ok DELAY=150 node "$H/stub-openai-compat.mjs" > /tmp/probe-tenant-stub-alpha.log 2>&1 &
  STUB_A=$!
  NAME=beta PORT=$BETA_PORT MODEL=llama-3.1-8b-instant MODE=ok DELAY=150 AUTHFAILS="$1" node "$H/stub-openai-compat.mjs" > /tmp/probe-tenant-stub-beta.log 2>&1 &
  STUB_B=$!
  sleep 1
}
stop_stubs() { kill "$STUB_A" "$STUB_B" 2>/dev/null; STUB_A=""; STUB_B=""; sleep 1; }

run_tenant_leg() { # LEG BETA_AUTHFAILS
  local leg="$1"
  local db="ime365_probe_tip_${leg}"
  local metrics="/tmp/probe-metrics-${leg}.db"
  rm -f "$metrics" "$metrics-wal" "$metrics-shm"
  prep_db "$db"
  start_stubs "$2"
  echo "-- tenant leg $leg: in-process engine (db $db, metrics $metrics, flags ON)"
  TARGET_BACKEND="$ROOT/backend" DB_NAME="$db" LEG="$leg" \
    TARGET_LABEL="tip-flags-on" METRICS_DB_FILE="$metrics" \
    ALPHA_PORT=$ALPHA_PORT BETA_PORT=$BETA_PORT \
    ENTERPRISE_ENCRYPTION_KEYS="$KEYS_BUNDLE" \
    timeout 300 node "$H/leg-tenant.mjs" > "$OUT/${leg}-tip-flags-on.jsonl" 2> "/tmp/probe-leg-${leg}.err"
  local leg_exit=$?
  echo "   leg exit $leg_exit -> $OUT/${leg}-tip-flags-on.jsonl ($(wc -l < "$OUT/${leg}-tip-flags-on.jsonl") lines)"
  [ "$leg_exit" != 0 ] && tail -3 "/tmp/probe-leg-${leg}.err"
  stop_stubs
  return $leg_exit
}

FAILURES=0
run_tenant_leg a15r1 "key-t1-byok" || FAILURES=$((FAILURES+1))
run_tenant_leg a15r2 "" || FAILURES=$((FAILURES+1))
run_tenant_leg a16 "" || FAILURES=$((FAILURES+1))

echo "=============================="
echo "TENANT_PROBE_LEG_EXIT_CODES=$FAILURES (0 = all legs completed; see verdict lines in transcripts)"
[ "$FAILURES" = 0 ] && exit 0 || exit 1
