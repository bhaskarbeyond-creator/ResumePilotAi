#!/usr/bin/env bash
# R15 platform probe legs — A.9r3 / A.9r4 / A.10r3 on BOTH targets:
#   baseline = clean clone at tag verified-bb2b82b (/home/user/verify-clean-bb2b82b)
#   tip      = current branch tip, feature flags OFF (defaults)
# Byte-equality on the normalized comparison surface per leg = the C.1
# hard-stop gate. Transcripts + verdicts land in-tree under
# developer-review/probes/2026-10-26/.
#
# REBUILT HARNESS: the original /tmp/probe scripts were lost (not snapshot-
# persisted); this reconstructs the documented scenarios from
# developer-review/engine-audit-2026-10-24.md.
set -u -o pipefail

ROOT=/home/user/ResumePilotAi
BASE=/home/user/verify-clean-bb2b82b
OUT=$ROOT/developer-review/probes/2026-10-26
H=$ROOT/developer-review/probes/harness
ALPHA_PORT=8791
BETA_PORT=8792
ENGINE_PORT=8085

BRIDGE_PID=""; STUB_A=""; STUB_B=""; ENGINE_PID=""
cleanup() {
  for p in "$ENGINE_PID" "$STUB_A" "$STUB_B" "$BRIDGE_PID"; do
    [ -n "$p" ] && kill "$p" 2>/dev/null
  done
}
trap cleanup EXIT

echo "== R15 platform probe run: $(date -u '+%Y-%m-%dT%H:%M:%SZ') =="
echo "baseline tree: $BASE ($(cd "$BASE" && git rev-parse --short HEAD))"
echo "tip tree:      $ROOT ($(cd "$ROOT" && git rev-parse --short HEAD))"

# ── bridge (fresh datadir, owns :3306) ─────────────────────────────────────
rm -rf /tmp/probe-datadir && mkdir -p /tmp/probe-datadir
BRIDGE_DATA_DIR=/tmp/probe-datadir node "$ROOT/scripts/dev-db/mariadb-sandbox-bridge.mjs" > /tmp/probe-bridge.log 2>&1 &
BRIDGE_PID=$!
for _ in $(seq 1 60); do (exec 3<>/dev/tcp/127.0.0.1/3306) 2>/dev/null && break; sleep 0.5; done
sleep 8
echo "bridge up (pid $BRIDGE_PID)"

prep_db() { # TREE DB_NAME — fresh per-leg database: rate-limiter/quota/cooldown
  # carry-over between legs invalidated the first a9r4 run (RATE_LIMITED storm);
  # the original audit runs also re-ran legs with fresh state (documented precedent).
  (cd "$1/backend" && timeout 60 env NEWDB="$2" NODE_ENV=development node -e "
    const m = require('mysql2/promise');
    (async () => {
      const c = await m.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '' });
      await c.query('DROP DATABASE IF EXISTS ' + process.env.NEWDB);
      await c.query('CREATE DATABASE ' + process.env.NEWDB);
      await c.end();
      process.exit(0);
    })()" >/dev/null 2>&1)
  (cd "$1/backend" && timeout 120 env DB_NAME="$2" DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= NODE_ENV=development \
    node -e "require('./database/mysql').initializeSchema({mode:'apply'}).then(r=>{process.exit(r.success?0:1)})" >/dev/null 2>&1)
  echo "prep_db $2 via $1: exit $?"
}

start_stubs() { # ALPHA_MODEL ALPHA_DELAY BETA_MODEL BETA_DELAY
  NAME=alpha PORT=$ALPHA_PORT MODEL="$1" MODE=ok DELAY="$2" node "$H/stub-openai-compat.mjs" > /tmp/probe-stub-alpha.log 2>&1 &
  STUB_A=$!
  NAME=beta PORT=$BETA_PORT MODEL="$3" MODE=ok DELAY="$4" node "$H/stub-openai-compat.mjs" > /tmp/probe-stub-beta.log 2>&1 &
  STUB_B=$!
  sleep 1
}
stop_stubs() { kill "$STUB_A" "$STUB_B" 2>/dev/null; STUB_A=""; STUB_B=""; sleep 1; }

start_engine() { # TREE_BACKEND DB_NAME ENGINE_LOG
  # Stale-engine guard: a polluted port silently invalidates a leg (observed
  # once during the rebuild: an orphaned engine answered for the tip target).
  if (exec 3<>/dev/tcp/127.0.0.1/$ENGINE_PORT) 2>/dev/null; then
    echo "FATAL: port $ENGINE_PORT busy before engine boot — stale engine" >&2
    exit 1
  fi
  # exec-in-subshell: $! IS the node pid (no cd-chain backgrounding trap).
  # AI_BURST_LIMIT: the /v1 admission limiter defaults to 12 req/60 s
  # (security/abuse.js, env-tunable by design). The 61-call A.9r4 sequence
  # needs the sequence to run uninterrupted; both targets get the identical
  # value and it is disclosed in every transcript header. The limiter stays
  # ACTIVE (200/60s), not disabled.
  ( cd "$1" && exec env NODE_ENV=development PORT=$ENGINE_PORT DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME="$2" \
    TEST_AUTH_HMAC_SECRET=sandbox-hmac-secret-resumepilot-2026 FREELMAPI_API_KEYS=audit-platform-key-123 \
    AI_BURST_LIMIT=200 AI_BURST_WINDOW_MS=60000 \
    FREELMAPI_METRICS_DB=:memory: \
    OPENAI_API_KEY=key-alpha-123456 OPENAI_BASE_URL="http://127.0.0.1:${ALPHA_PORT}/v1" \
    GROQ_API_KEY=key-beta-123456 GROQ_BASE_URL="http://127.0.0.1:${BETA_PORT}/v1" \
    PREVIEW_SUPER_ADMIN_EMAILS=superadmin@probe.test \
    node index.js ) > "$3" 2>&1 &
  ENGINE_PID=$!
}
stop_engine() {
  [ -n "$ENGINE_PID" ] && kill "$ENGINE_PID" 2>/dev/null
  ENGINE_PID=""
  for _ in $(seq 1 20); do
    (exec 3<>/dev/tcp/127.0.0.1/$ENGINE_PORT) 2>/dev/null || break
    sleep 0.5
  done
  sleep 1
}

run_leg() { # LEG TREE_BACKEND DB_NAME LABEL ALPHA_MODEL ALPHA_DELAY BETA_MODEL BETA_DELAY
  local leg="$1"
  start_stubs "$5" "$6" "$7" "$8"
  for target in baseline tip; do
    local tree db label
    if [ "$target" = baseline ]; then tree="$BASE/backend"; label=baseline-bb2b82b;
    else tree="$ROOT/backend"; label=tip-flags-off; fi
    db="ime365_probe_${target}_${leg}"
    prep_db "$(dirname "$tree")" "$db"
    echo "-- leg $leg target $label: engine boot (db $db)"
    start_engine "$tree" "$db" "/tmp/probe-engine-${leg}-${target}.log"
    TARGET_BACKEND="$tree" ENGINE_PORT=$ENGINE_PORT DB_NAME="$db" LEG="$leg" TARGET_LABEL="$label" \
      ALPHA_PORT=$ALPHA_PORT BETA_PORT=$BETA_PORT \
      node "$H/leg-platform.mjs" > "$OUT/${leg}-${label}.jsonl" 2> "/tmp/probe-leg-${leg}-${target}.err"
    echo "   leg exit $? -> $OUT/${leg}-${label}.jsonl ($(wc -l < "$OUT/${leg}-${label}.jsonl") lines)"
    stop_engine
  done
  stop_stubs
  node "$H/compare-transcripts.mjs" "$OUT/${leg}-baseline-bb2b82b.jsonl" "$OUT/${leg}-tip-flags-off.jsonl" \
    > "$OUT/${leg}-byte-equal-verdict.txt"
  local verdict_exit=$?
  echo "== leg $leg byte-equal verdict: exit $verdict_exit ($(head -3 "$OUT/${leg}-byte-equal-verdict.txt" | tail -1))"
  return $verdict_exit
}

FAILURES=0
run_leg a9r3  "$BASE" x x gpt-4o 0 llama-3.1-8b-instant 3000 || FAILURES=$((FAILURES+1))
run_leg a10r3 "$BASE" x x gemini-1.5-pro 150 llama-3.1-8b-instant 3000 || FAILURES=$((FAILURES+1))
run_leg a9r4  "$BASE" x x gpt-4o 150 llama-3.1-8b-instant 3000 || FAILURES=$((FAILURES+1))

echo "=============================="
echo "PLATFORM_PROBE_FAILURES=$FAILURES"
[ "$FAILURES" = 0 ] && exit 0 || exit 1
