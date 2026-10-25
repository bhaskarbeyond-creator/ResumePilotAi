#!/usr/bin/env bash
# Deterministic sandbox suite protocol (see sandbox-suite-protocol.md).
# Usage: LOG=/tmp/x.log scripts/dev-db/run-sandbox-suite.sh [grep-pattern-for-files]
set -Eeuo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="${LOG:-/tmp/sandbox-suite.log}"
EXCLUDE="${EXCLUDE:-mariadb-migration-gate}"

rm -rf "$HOME/.cache/ime365-tools/mariadb-data"
node "$REPO/scripts/dev-db/mariadb-sandbox-bridge.mjs" > /tmp/bridge.log 2>&1 &
BRIDGE_PID=$!
trap 'kill $BRIDGE_PID 2>/dev/null || true' EXIT

# wait for the wire endpoint
for _ in $(seq 1 60); do
  if (exec 3<>/dev/tcp/127.0.0.1/3306) 2>/dev/null; then break; fi
  sleep 0.5
done

cd "$REPO/backend"
for DB in airesume_test ime365_sandbox; do
  DB_NAME=$DB DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= NODE_ENV=development \
    node -e "require('./database/mysql').initializeSchema({mode:'apply'}).then(r=>{process.exit(r.success?0:1)})" >/dev/null 2>&1
done

FILES=$(ls test/*.test.js | grep -v "$EXCLUDE" || true)
NODE_ENV=test RUN_MARIADB_INTEGRATION=true FREELMAPI_METRICS_DB=:memory: \
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME=airesume_test \
MARIADB_TEST_ALLOW_RESET=true \
node --test --test-reporter=tap --test-concurrency=1 --test-force-exit $FILES > "$LOG" 2>&1 || true

grep -E "^# (tests|pass|fail|skipped)" "$LOG" || true
grep "^not ok" "$LOG" || true
