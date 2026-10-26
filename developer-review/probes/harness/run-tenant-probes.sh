#!/usr/bin/env bash
# R15 tenant probe legs — A.15r1 / A.15r2 / A.16 on the TIP tree with the
# feature flags ON (FREELMAPI_TENANT_SCOPED_EVIDENCE=1, FREELMAPI_DECISION_LEDGER=1).
# These are NEW-behaviour legs (no baseline pairing — the baseline tree has no
# scoped-evidence code to compare against; the platform-scope byte-equality
# proof with flags OFF lives in run-platform-probes.sh).
#
# A.16 applies migrations 028/029 to the PROBE database only. The production
# ledger is never touched (mandate boundary).
set -u -o pipefail

ROOT=/home/user/ResumePilotAi
OUT=$ROOT/developer-review/probes/2026-10-26
H=$ROOT/developer-review/probes/harness
ALPHA_PORT=8791
BETA_PORT=8792
ENGINE_PORT=8085

BRIDGE_PID=""; STUB_A=""; STUB_B=""; ENGINE_PID=""
cleanup() { for p in "$ENGINE_PID" "$STUB_A" "$STUB_B" "$BRIDGE_PID"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; }
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

prep_db() { # DB_NAME APPLY_MIGRATIONS(0|1)
  (cd "$ROOT/backend" && timeout 60 env NEWDB="$1" NODE_ENV=development node -e "
    const m = require('mysql2/promise');
    (async () => {
      const c = await m.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '' });
      await c.query('DROP DATABASE IF EXISTS ' + process.env.NEWDB);
      await c.query('CREATE DATABASE ' + process.env.NEWDB);
      await c.end(); process.exit(0);
    })()" >/dev/null 2>&1)
  (cd "$ROOT/backend" && timeout 120 env DB_NAME="$1" DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= NODE_ENV=development \
    node -e "require('./database/mysql').initializeSchema({mode:'apply'}).then(r=>{process.exit(r.success?0:1)})" >/dev/null 2>&1)
  echo "prep_db $1: schema exit $?"
  # 028/029 need no manual application: initializeSchema -> runMigrations reads
  # backend/database/migrations/ (schema_migrations ledger), so probe databases
  # already carry the decision-ledger DDL. (Run 2 proved this: the manual
  # ALTER hit ER_DUP_FIELDNAME.) The leg's ddl-probe line verifies the column.
}

start_stubs() { # BETA_AUTHFAILS
  NAME=alpha PORT=$ALPHA_PORT MODEL=gpt-4o MODE=ok DELAY=150 node "$H/stub-openai-compat.mjs" > /tmp/probe-tenant-stub-alpha.log 2>&1 &
  STUB_A=$!
  NAME=beta PORT=$BETA_PORT MODEL=llama-3.1-8b-instant MODE=ok DELAY=150 AUTHFAILS="$1" node "$H/stub-openai-compat.mjs" > /tmp/probe-tenant-stub-beta.log 2>&1 &
  STUB_B=$!
  sleep 1
}
stop_stubs() { kill "$STUB_A" "$STUB_B" 2>/dev/null; STUB_A=""; STUB_B=""; sleep 1; }

start_engine() { # DB_NAME METRICS_FILE ENGINE_LOG
  if (exec 3<>/dev/tcp/127.0.0.1/$ENGINE_PORT) 2>/dev/null; then echo "FATAL: port $ENGINE_PORT busy" >&2; exit 1; fi
  ( cd "$ROOT/backend" && exec env NODE_ENV=development PORT=$ENGINE_PORT DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME="$1" \
    TEST_AUTH_HMAC_SECRET=sandbox-hmac-secret-resumepilot-2026 FREELMAPI_API_KEYS=audit-platform-key-123 \
    AI_BURST_LIMIT=200 AI_BURST_WINDOW_MS=60000 \
    FREELMAPI_METRICS_DB="$2" \
    FREELMAPI_TENANT_SCOPED_EVIDENCE=1 FREELMAPI_DECISION_LEDGER=1 \
    ENTERPRISE_ENCRYPTION_KEYS="$KEYS_BUNDLE" \
    PREVIEW_SUPER_ADMIN_EMAILS=superadmin@probe.test \
    PREVIEW_ENTERPRISE_MEMBER_EMAILS=t1-owner@probe.test,t2-owner@probe.test,a16-owner@probe.test \
    OPENAI_API_KEY=key-alpha-123456 OPENAI_BASE_URL="http://127.0.0.1:${ALPHA_PORT}/v1" \
    GROQ_API_KEY=key-beta-123456 GROQ_BASE_URL="http://127.0.0.1:${BETA_PORT}/v1" \
    node index.js ) > "$3" 2>&1 &
  ENGINE_PID=$!
}
stop_engine() {
  [ -n "$ENGINE_PID" ] && kill "$ENGINE_PID" 2>/dev/null
  ENGINE_PID=""
  for _ in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/$ENGINE_PORT) 2>/dev/null || break; sleep 0.5; done
  sleep 1
}

run_tenant_leg() { # LEG BETA_AUTHFAILS APPLY_MIGRATIONS(0|1)
  local leg="$1"
  local db="ime365_probe_tip_${leg}"
  local metrics="/tmp/probe-metrics-${leg}.db"
  rm -f "$metrics" "$metrics-wal" "$metrics-shm"
  prep_db "$db" "$3"
  start_stubs "$2"
  echo "-- tenant leg $leg: engine boot (db $db, metrics $metrics, flags ON)"
  start_engine "$db" "$metrics" "/tmp/probe-engine-${leg}.log"
  TARGET_BACKEND="$ROOT/backend" ENGINE_PORT=$ENGINE_PORT DB_NAME="$db" LEG="$leg" \
    TARGET_LABEL="tip-flags-on" METRICS_DB_FILE="$metrics" \
    ALPHA_PORT=$ALPHA_PORT BETA_PORT=$BETA_PORT \
    ENTERPRISE_ENCRYPTION_KEYS="$KEYS_BUNDLE" \
    node "$H/leg-tenant.mjs" > "$OUT/${leg}-tip-flags-on.jsonl" 2> "/tmp/probe-leg-${leg}.err"
  local leg_exit=$?
  echo "   leg exit $leg_exit -> $OUT/${leg}-tip-flags-on.jsonl ($(wc -l < "$OUT/${leg}-tip-flags-on.jsonl") lines)"
  [ "$leg_exit" != 0 ] && tail -3 "/tmp/probe-leg-${leg}.err"
  stop_engine
  stop_stubs
  return $leg_exit
}

FAILURES=0
run_tenant_leg a15r1 "key-t1-byok" 0 || FAILURES=$((FAILURES+1))
run_tenant_leg a15r2 "" 0 || FAILURES=$((FAILURES+1))
run_tenant_leg a16 "" 0 || FAILURES=$((FAILURES+1))

echo "=============================="
echo "TENANT_PROBE_LEG_EXIT_CODES=$FAILURES (0 = all legs completed; see verdict lines in transcripts)"
[ "$FAILURES" = 0 ] && exit 0 || exit 1
