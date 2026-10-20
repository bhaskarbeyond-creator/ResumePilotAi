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

## Module flags for tests (`set-public-module.mjs`)

Some candidate modules are gated by `public_config.modules` in `system_settings`
(seeded by migration 009; portfolios, messages and the job tracker are off by
default). The candidate E2E suite exercises both real states of a gate with:

```bash
. ~/.cache/ime365-tools/backend.env.sh   # DB_* as for the backend
node scripts/dev-db/set-public-module.mjs --module enablePortfolioModule --get
node scripts/dev-db/set-public-module.mjs --module enablePortfolioModule --value true
```

It changes one allowed key only (`enablePortfolioModule`, `enableMessagesModule`,
`enableJobTrackerModule`). It refuses anything but a loopback host and a
database whose name contains `sandbox`, `test` or `acceptance`, and it writes no
admin audit record, so it is test-environment configuration only. The specs
restore the shipped default (off) when they finish.

## Messaging test arrangement (`arrange-messaging-job.mjs`)

A conversation can only be opened for a job application, so the Messages E2E
needs one job owned by a second test identity. The employer route that would
create it cannot run locally: preview identities never carry the `employer`
claim that `POST /api/employer/companies` and `POST /api/employer/jobs` require
(both answer 403; the claim is a Firebase custom claim). The helper inserts that
one job row and nothing else:

```bash
. ~/.cache/ime365-tools/backend.env.sh   # DB_* as for the backend
node scripts/dev-db/arrange-messaging-job.mjs --create --job-id job_e2e_msg_example \
  --owner-uid local_<22 hex> --title "Platform Engineer" --company "Example Test Co"
node scripts/dev-db/arrange-messaging-job.mjs --remove
```

The owner must be a preview identity that has signed in once
(`POST /api/auth/preview-login` creates its user row). Everything after the job
goes through the real API: the application (`POST /api/jobs/:jobId/applications`),
the conversation (`POST /api/messages/conversations`), the messages and the read
cursors. `--remove` deletes what that flow leaves behind for every
`job_e2e_msg_*` job (conversation messages, participants and rows, the
notifications that name the job, the applications and the jobs). Security audit
records are kept. The same loopback and database-name guards apply.

The Notifications E2E (`frontend/tests/candidate/notifications.spec.ts`) uses the
same helper: notification rows are written by the backend when candidate A
applies and when the job owner changes the application's status
(`PATCH /api/job-applications/:id/status`). `--count n` (1 to 30, default 1)
inserts `n` jobs, `<job-id>_01` … `<job-id>_nn`, in one run, so a test can submit
more applications than one list page shows:

```bash
node scripts/dev-db/arrange-messaging-job.mjs --create --job-id job_e2e_msg_example \
  --owner-uid local_<22 hex> --title "Platform Engineer" --company "Example Test Co" --count 21
```

A count outside 1–30, or ids longer than the `job_e2e_msg_*` pattern allows,
exits 2 without touching the database.
