# Sandbox database and browser tooling

These tools exist for remote sandboxes that cannot run the normal stack: no native
MariaDB, no Docker, no apt mirror, and no access to the Playwright browser CDN.
**CI and production are unaffected.** They keep using native MariaDB 11.4
(`scripts/start-ci-mariadb.sh`) and the standard Playwright browsers.

| File | Purpose |
|---|---|
| `setup-sandbox-tools.sh` | Installs pinned tooling outside the repo (`~/.cache/ime365-tools`): `lite4mariadb@0.1.2` (MariaDB engine in WebAssembly) and `@sparticuz/chromium@153.0.0` (Chromium inside the npm tarball). |
| `mariadb-sandbox-bridge.mjs` | Loopback-only MySQL wire-protocol endpoint (default `127.0.0.1:3306`) that executes SQL on the real MariaDB engine. The backend connects **unmodified** through its normal `mysql2` pool. |
| `bridge-fidelity.test.mjs` | Proves the bridge behaves like MariaDB on the points the backend relies on: type parsing, errno/SQLSTATE → `err.code`, `insertId`, `CLIENT_FOUND_ROWS`, transaction isolation, implicit rollback, lock-wait timeout. |

## Typical session

```bash
scripts/dev-db/setup-sandbox-tools.sh                 # once per sandbox
node scripts/dev-db/mariadb-sandbox-bridge.mjs        # keep running (port 3306)
node --test scripts/dev-db/bridge-fidelity.test.mjs   # 9 checks

# Backend against the bridge, using the repository's non-production identity harness
cd backend && NODE_ENV=development DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root \
  DB_PASSWORD= DB_NAME=ime365_sandbox TEST_AUTH_HMAC_SECRET=<16+ random chars> node index.js
```

`TEST_AUTH_HMAC_SECRET` enables the existing local verifier in `backend/security/auth.js`
(`rptest.` tokens, inert when `NODE_ENV=production`) and `/api/auth/preview-login`. Tokens
still pass through the unchanged `requireAuth` middleware. Authentication is not bypassed.

## Honest limits

- The engine is **MariaDB 13.1.0-embedded**, not 11.4. Evidence produced through the bridge
  is labelled accordingly.
- The engine has a single session. The bridge serialises connections, and an open
  transaction owns the session. Concurrency is therefore stricter than InnoDB row
  locking: waits that would succeed on a real server can time out here with
  `ER_LOCK_WAIT_TIMEOUT`. Every such timeout is logged.
- Server-side prepared statements are rejected explicitly. The backend uses only `pool.query()`.
- Known engine defect: after the 012→011 down-migration sequence, `CREATE TABLE IF NOT EXISTS
  credit_notes` reports Note 1050 although the table cannot be opened. Run DDL rollback gates
  (`scripts/verify-mariadb-migrations.mjs`) on native MariaDB.
- Any credentials are accepted, which is why the listener refuses non-loopback addresses.
