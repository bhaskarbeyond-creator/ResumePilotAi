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

init_db() { # TREE DB_NAME
  (cd "$1/backend" && timeout 120 env DB_NAME="$2" DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= NODE_ENV=development \
    node -e "require('./database/mysql').initializeSchema({mode:'apply'}).then(r=>{process.exit(r.success?0:1)})" >/dev/null 2>&1)
  echo "init $2 via $1: exit $?"
}
init_db "$BASE" ime365_probe_base
init_db "$ROOT" ime365_probe_tip

start_stubs() { # ALPHA_MODEL ALPHA_DELAY BETA_MODEL BETA_DELAY
  NAME=alpha PORT=$ALPHA_PORT MODEL="$1" MODE=ok DELAY="$2" node "$H/stub-openai-compat.mjs" > /tmp/probe-stub-alpha.log 2>&1 &
  STUB_A=$!
  NAME=beta PORT=$BETA_PORT MODEL="$3" MODE=ok DELAY="$4" node "$H/stub-openai-compat.mjs" > /tmp/probe-stub-beta.log 2>&1 &
  STUB_B=$!
  sleep 1
}
stop_stubs() { kill "$STUB_A" "$STUB_B" 2>/dev/null; STUB_A=""; STUB_B=""; sleep 1; }

start_engine() { # TREE_BACKEND DB_NAME ENGINE_LOG
  (cd "$1" && NODE_ENV=development PORT=$ENGINE_PORT DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME="$2" \
    TEST_AUTH_HMAC_SECRET=sandbox-hmac-secret-resumepilot-2026 FREELMAPI_API_KEYS=audit-platform-key-123 \
    FREELMAPI_METRICS_DB=:memory: \
    OPENAI_API_KEY=key-alpha-123456 OPENAI_BASE_URL="http://127.0.0.1:${ALPHA_PORT}/v1" \
    GROQ_API_KEY=key-beta-123456 GROQ_BASE_URL="http://127.0.0.1:${BETA_PORT}/v1" \
    PREVIEW_SUPER_ADMIN_EMAILS=superadmin@probe.test \
    node index.js > "$3" 2>&1 & echo $! > /tmp/probe-engine.pid)
  ENGINE_PID=$(cat /tmp/probe-engine.pid)
}
stop_engine() { [ -n "$ENGINE_PID" ] && kill "$ENGINE_PID" 2>/dev/null; ENGINE_PID=""; sleep 2; }

run_leg() { # LEG TREE_BACKEND DB_NAME LABEL ALPHA_MODEL ALPHA_DELAY BETA_MODEL BETA_DELAY
  local leg="$1"
  start_stubs "$5" "$6" "$7" "$8"
  for target in baseline tip; do
    local tree db label
    if [ "$target" = baseline ]; then tree="$BASE/backend"; db=ime365_probe_base; label=baseline-bb2b82b;
    else tree="$ROOT/backend"; db=ime365_probe_tip; label=tip-flags-off; fi
    echo "-- leg $leg target $label: engine boot"
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
