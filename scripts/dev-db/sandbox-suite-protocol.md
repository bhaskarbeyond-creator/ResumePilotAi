# Sandbox full-suite protocol (WASM MariaDB bridge)

The destructive `mariadb-migration-gate.test.js` drops every table and re-applies
the chain. On the WASM engine a mass `DROP TABLE` sequence can leave the engine
unable to re-open re-created tables (same class as the documented
`credit_notes` defect in `scripts/dev-db/README.md` — "Run DDL rollback gates on
native MariaDB"). When that happens, every later MariaDB-only suite fails with
`ER_NO_SUCH_TABLE` although the code is correct.

Deterministic sandbox protocol (matches CI semantics minus the native-only DDL gate):

```bash
# 1. fresh engine state
rm -rf ~/.cache/ime365-tools/mariadb-data
node scripts/dev-db/mariadb-sandbox-bridge.mjs &          # keep running

# 2. pre-migrate BOTH databases (27 migrations each)
cd backend
for DB in airesume_test ime365_sandbox; do
  DB_NAME=$DB DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= \
  NODE_ENV=development node -e "require('./database/mysql').initializeSchema({mode:'apply'})"
done

# 3. run the suite with the same env as scripts/run-tests-with-annotations.js,
#    excluding ONLY the destructive native-MariaDB DDL gate
NODE_ENV=test RUN_MARIADB_INTEGRATION=true FREELMAPI_METRICS_DB=:memory: \
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME=airesume_test \
MARIADB_TEST_ALLOW_RESET=true \
node --test --test-reporter=tap --test-concurrency=1 --test-force-exit \
  $(ls test/*.test.js | grep -v mariadb-migration-gate)
```

`mariadb-migration-gate.test.js` is exercised separately on native MariaDB in CI
(`scripts/start-ci-mariadb.sh`); its exclusion here is an environment
limitation, not a test skip in product code.
