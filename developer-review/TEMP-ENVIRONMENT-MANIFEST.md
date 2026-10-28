# Temporary Environment Manifest

**Purpose:** record exactly what runtime environment was provisioned for the
`PARTIAL — BLOCKED` → runtime-verification pass of the Senior Architectural
Mandate v3 audit, so that every result in `TEST-EXECUTION-REPORT.md` and
`BROWSER-VERIFICATION-REPORT.md` can be reproduced or falsified by another
developer.

**Status of this environment:** temporary, isolated, disposable. It is **not** a
deployment, it is **not** production, and nothing outside `developer-review/`
was modified (see §11 Scope integrity).

---

## 1. Environment and operating system

| Field | Value |
|---|---|
| OS | Debian GNU/Linux 12 (bookworm) |
| Kernel | `6.1.158+` (x86_64) |
| vCPU | 2 |
| RAM | 3,939 MB total |
| Disk | 21 GB (`/dev/root`), ~20 GB free at start |
| Privilege | uid 1001 (`user`), member of `sudo`; **passwordless sudo available** |
| Container/systemd | No systemd, no Docker, no Podman (no container runtime of any kind) |
| Machine-readable capture | `Evidence/env/environment.json` |

### 1.1 Network reachability (measured, not assumed)

| Host | Result |
|---|---|
| `registry.npmjs.org` | **reachable** (HTTP 200) |
| `pypi.org` / `files.pythonhosted.org` | **reachable** |
| `github.com`, `api.github.com`, `codeload.github.com` | **reachable** (API + git) |
| `deb.debian.org` (apt) | **blocked** — `SSL_ERROR_SYSCALL` / connection failed |
| `cdn.playwright.dev` | **blocked** — `curl` exit 000 |
| `release-assets.githubusercontent.com` (GitHub release *assets*) | **blocked** — `SSL_ERROR_SYSCALL` on redirect target |
| `archive.mariadb.org` | **blocked** — `curl` exit 000 |
| `dev.mysql.com` / `cdn.mysql.com` | **blocked** — `curl` exit 000 |
| `fonts.googleapis.com` | **blocked** (observed in-browser: `net::ERR_CONNECTION_CLOSED`) |

Consequence: only **npm** and **PyPI** tarballs (plus git/API) can supply
binaries. This single constraint determined every substitution documented below.

---

## 2. Repository revision under test

| Field | Value |
|---|---|
| Remote | `https://github.com/bhaskarbeyond-creator/ResumePilotAi.git` |
| Branch | `arena/393531fe-resumepilotai` |
| HEAD commit | `a7d08a2fa67b44aefe4692405b470fa6b174d29f` |
| Commit date | 2026-10-28 19:15:08 +0000 |
| Commit subject | `docs(audit): complete Senior Architectural Mandate v3 — provenance, requirement register, evidence index, …` |
| Working tree at start | clean |
| History available locally | single commit (publish-squashed checkout); the previously cited `ff841d5` / `537e2985` objects are **not** present in this clone |

**Provenance caveat, stated plainly:** this pass executed against the audit-branch
checkout `a7d08a2`, whose tree is the published `developer-review/` package layered
on the application revision the earlier pass audited. Because `ff841d5` is not
fetchable here, the application-vs-audit delta could **not** be recomputed by
`git diff` in this session. Mitigation: every runtime result below reports
`commitSha` emitted by the application itself — `GET /api/health` returns
`"commitSha":"a7d08a2fa67b44aefe4692405b470fa6b174d29f"` (see
`Evidence/logs/backend-http-probe.log`), and `backend/COMMIT_SHA` is
`a7d08a2fa67b44aefe4692405b470fa6b174d29f` as well.

---

## 3. Runtime and dependency tooling

| Component | Version | How obtained |
|---|---|---|
| Node.js | **v22.22.3** | preinstalled in the sandbox |
| npm | **10.9.8** | preinstalled |
| Python | 3.11.2 | preinstalled (used only for wheel extraction/inspection) |
| gcc / make | gcc 12.2.0 / GNU make | preinstalled |
| Playwright (@playwright/test) | **1.64.1** | `npm ci` in `frontend/` from `frontend/package-lock.json` |
| @axe-core/playwright | **4.14.0** | `npm ci` in `frontend/` |
| oxlint | per `frontend/package-lock.json` | `npm ci` |
| PHP | **absent** | — |
| Apache httpd / `mod_headers` / `mod_rewrite` | **absent** | no apt, no compile path in budget |
| MariaDB / MySQL server (original) | **absent** | see §5 |
| Docker / Podman / Testcontainers | **absent** | no container runtime |

Install command actually used (both trees, lockfile-exact, no manifest changes):

```bash
cd backend  && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1 npm ci --no-audit --no-fund   # 346 packages
cd frontend && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1 npm ci --no-audit --no-fund   # 280 packages
```

`package.json` / `package-lock.json` were **not** edited, regenerated or committed
(verified: `git status` shows no change outside `developer-review/`).
Engine warnings (`@firebase/* require node >=24.12.0`) were emitted and are
recorded as an environment note, not a defect.

---

## 4. Browser and Playwright

Playwright's own browser download is impossible here (`cdn.playwright.dev`
blocked). The repository **already depends on `@sparticuz/chromium@^149.0.0`**
(root `package.json`), and the repository's own Playwright configs support
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Both facts were used:

| Component | Value |
|---|---|
| Browser binary source | `@sparticuz/chromium@149.0.0` npm tarball (`registry.npmjs.org`), `bin/chromium.br` brotli-decompressed with Node `zlib.brotliDecompressSync` |
| Browser build | `Chromium 149.0.7827.0` |
| Extra shared libraries | `al2023.tar.br` from the same package, extracted to `libs/lib`, exported via `LD_LIBRARY_PATH` (needed `libnspr4.so` etc.) |
| Headless shell | not used; full Chromium binary |
| Launch flags | `--no-sandbox --disable-dev-shm-usage --disable-gpu` |
| Playwright version | 1.64.1 (`npx playwright --version`) |
| Screenshot capability | verified (45 full-page screenshots in `Evidence/screenshots/`) |

---

## 5. Database — what was and was not possible

### 5.1 Genuine MariaDB: NOT PROVISIONABLE (blocker EG-007)

Attempts, in order, each actually executed:

| # | Attempt | Outcome |
|---|---|---|
| 1 | `sudo apt-get update` / install `mariadb-server` | `deb.debian.org` unreachable (`Connection failed`), no index → cannot install |
| 2 | GitHub-hosted MariaDB bintar (`archive.mariadb.org` URL used by the `hostdb` npm registry package) | host blocked (`curl` exit 000) |
| 3 | GitHub **release assets** (musl-static MySQL, portable builds) | `release-assets.githubusercontent.com` blocked — `SSL_ERROR_SYSCALL` after the 302 from `github.com` |
| 4 | npm registry search `mariadb`, `mysqld`, `mariadb-server`, `embedded`, `portable`, `binaries` (250 results scanned) | only connectors, MCP servers, an ancient downloader (`mariadb-bin@10.0.15`, targets blocked mariadb.org), and `lite4mariadb` (MariaDB compiled to WebAssembly with an embedded, single-process API — **no MySQL wire protocol**, so `mysql2` cannot connect) |
| 5 | PyPI — full `https://pypi.org/simple/` index (47.8 MB) grepped for mariadb/mysql server artifacts | only client connectors (`mariadb-binary` = Connector/Python) |
| 6 | Docker/Testcontainers route (`@testcontainers/mariadb`) | no container runtime in the sandbox |
| 7 | Build MariaDB from source via `codeload` | rejected: requires cmake/ninja/boost/pcre2/ncurses/openssl dev headers that apt cannot supply; multi-hour build on 2 vCPU, outside a disposable-test-infrastructure budget |

**Conclusion:** no MariaDB 11.4 artifact is obtainable inside this sandbox. This
is a hard, reproducible environmental blocker, not an omission.

### 5.2 Substitute SQL engine actually used (MySQL 5.7.29)

| Field | Value |
|---|---|
| Artifact | npm `mysql-server-5.7-lin-x64@1.0.0` (`registry.npmjs.org`), Debian-built `mysqld`, 34.6 MB unpacked |
| Version | `5.7.29` — `MySQL Community Server (GPL)` |
| Missing shared lib | `libaio.so.1` — supplied from PyPI wheel `libaio-bins 0.0.1` (`libaio.so.1.0.1`), placed on `LD_LIBRARY_PATH` |
| Datadir | `/tmp/tempenv/mysql57/data` (outside the repository) |
| Port | `3306`, bound `127.0.0.1` only |
| Database | `airesume_test` (name deliberately contains `test`) |
| Data | **synthetic only** — created empty; populated exclusively by the repository's own checked-in `001_baseline.sql` plus rows written through the app's API during verification. No production data was read, copied or connected to. |
| sql_mode | MySQL 5.7 default (`ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,…`) — differs from MariaDB 11.4 defaults; recorded as a fidelity difference |

### 5.3 Why the substitute cannot be presented as target-database evidence

1. The repository's own gate (`backend/test/mariadb-migration-gate.test.js`)
   refuses it. Executed live:
   `not ok 1 — error: 'target engine must be MariaDB, received 5.7.29'`
   (`Evidence/logs/mariadb-gate-refusal.log`).
2. The migrations themselves are MariaDB-specific. Probe
   (`developer-review/tools/migration-fidelity-probe.cjs`) result:
   **29 migrations discovered, 1 applied, first failure at `002_single_owner_enterprise.sql`** —
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1`
   → `ER_PARSE_ERROR` (MySQL 5.7 has no `ADD COLUMN IF NOT EXISTS`). 57 tables exist
   after migration 001; migrations 002–029 cannot be applied at all.

Therefore **all** runtime evidence in this pass carries the label
`SUBSTITUTE-ENGINE` and is **never** reported as MariaDB/acceptance evidence.

### 5.4 Application repository modes actually exercised

| Mode | How | Purpose |
|---|---|---|
| **In-memory repository** (app-supported; `DEGRADED_MODE_REPOSITORY=inmemory`, the app's own local/E2E mode) | `backend/index.js` booted with no `DB_HOST` | Proves the Express app, middleware chain, auth, RBAC and security headers run with no database at all |
| **MySQL 5.7 substitute + baseline schema** | `DB_HOST=127.0.0.1 DB_NAME=airesume_test`, migration 001 applied | Lets asset/route/UI tests execute against a real SQL round-trip |

---

## 6. Web server / application runtime

`apache2` is absent and cannot be installed. Investigation of whether Apache is
*required* for any executed test:

* No backend test and no Playwright spec starts or asserts against Apache.
  `backend/test/*` uses `supertest` against the Express app object, or real
  `http.Server` on loopback.
* The Apache-related repository checks are **static**: `npm run test:security`
  compares `.htaccess`/`public/.htaccess` header blocks against the canonical
  policy with `mod_headers` never being executed. Executed and passing
  (see `Evidence/logs/security-checks.log`).
* `.htaccess`/`api/index.php` proxying is therefore **not** runtime-verified in
  this pass (recorded as an unmet criterion, not a pass).

Application runtime actually started (Express 5.2.1, `backend/index.js`):

```
PORT=8080 NODE_ENV=test TEST_AUTH_HMAC_SECRET=<sandbox-local test value>
# run A: no DB_* variables            -> in-memory repository mode
# run B: DB_HOST=127.0.0.1 DB_NAME=airesume_test -> substitute schema
```

Live service inventory while verifying:

| Port | Service | Bind | Disposable |
|---|---|---|---|
| 4000 | Vite dev server (`frontend`, `npx vite`) | `0.0.0.0` | yes |
| 5173 | second Vite dev server (only because `freellmapi-admin-e2e.spec.ts` hardcodes `http://localhost:5173`) | `0.0.0.0` | yes |
| 8080 | Express API (`backend/index.js`) | `0.0.0.0` | yes |
| 3306 | `mysqld` 5.7.29 substitute | `127.0.0.1` | yes |

`frontend/vite.config.ts` already sets `server.allowedHosts: ['.e2b.app']` and
proxies `/api` → `http://localhost:8080`, so the app is reachable from the
sandbox preview URL without any config change.

---

## 7. Test configuration and synthetic-data strategy

* Backend suites: repository's own runner `backend/scripts/run-tests-with-annotations.js`
  (`node --test`, TAP reporter, `--test-concurrency=1 --test-force-exit`), **unmodified**.
* Enterprise/payments suites: repository npm scripts, unmodified.
* Playwright: repository **spec files unmodified**, driven by audit-only configs in
  `developer-review/tools/` that mirror the repository's project names, viewports
  and `snapshotPathTemplate` (so visual tests compare against committed
  baselines rather than writing new ones) but omit the `webServer` block that
  requires MariaDB.
* Synthetic data: no production data of any kind. Identities are the app's own
  non-production `POST /api/auth/preview-login` (uid derived as
  `local_<sha256(email)>`), plus `localStorage.ime_dev_user` for surface rendering.
  No live provider, payment or object-storage credential was used, fabricated or
  requested.

### 7.1 Environment variables used (sensitive values redacted)

| Variable | Value class |
|---|---|
| `NODE_ENV` | `test` |
| `PORT` | `8080` |
| `TEST_AUTH_HMAC_SECRET` | sandbox-local throwaway literal, **[REDACTED]** — enables the app's test-only signed identity verifier; not a production secret |
| `DEGRADED_MODE_REPOSITORY` | `inmemory` (run A only) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_NAME` | `127.0.0.1` / `3306` / `root` / `airesume_test` |
| `DB_PASSWORD` | empty (disposable local server) |
| `MARIADB_TEST_ALLOW_RESET` | `true` (only for the disposable-DB gate probe) |
| `RUN_MARIADB_INTEGRATION` | `false` for the broad pass, `true` only for the gate-refusal probe |
| `FREELMAPI_METRICS_DB` | `:memory:` |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | `/tmp/tempenv/chromium/chromium` |
| `LD_LIBRARY_PATH` | `/tmp/tempenv/chromium/libs/lib` (browser), `/tmp/tempenv/mysql57/lib` (mysqld) |
| Firebase / Stripe / PayPal / Razorpay / Paytm / Sentry / SMTP credentials | **not set, not requested, not fabricated** |

---

## 8. Commands to create, start, stop and clean up

```bash
# ── create ────────────────────────────────────────────────────────────────
mkdir -p /tmp/tempenv/{chromium,mysql57,src}

# browser (npm tarball; Playwright CDN is blocked)
cd /tmp/tempenv/chromium && npm pack @sparticuz/chromium@149.0.0 && tar xzf sparticuz-chromium-149.0.0.tgz
node -e 'const z=require("zlib"),f=require("fs");for(const n of ["chromium","al2023.tar"])f.writeFileSync("/tmp/tempenv/chromium/"+n,z.brotliDecompressSync(f.readFileSync("/tmp/tempenv/chromium/package/bin/"+n+".br")))'
mkdir -p libs && tar xf al2023.tar -C libs && chmod +x chromium && ./chromium --version   # Chromium 149.0.7827.0

# sql engine substitute (MySQL 5.7 from npm) + its missing libaio from PyPI
cd /tmp && npm pack mysql-server-5.7-lin-x64@1.0.0 && tar xzf mysql-server-5.7-lin-x64-1.0.0.tgz
curl -sSL "$(curl -s https://pypi.org/pypi/libaio-bins/json | jq -r .urls[0].url)" -o libaio.whl
python3 -c 'import zipfile;zipfile.ZipFile("/tmp/libaio.whl").extractall("/tmp/libaio-x")'
mkdir -p /tmp/tempenv/mysql57/{lib,data,tmp,mysql-files} && cp /tmp/libaio-x/libaio/libaio.so.1* /tmp/tempenv/mysql57/lib/
LD_LIBRARY_PATH=/tmp/tempenv/mysql57/lib /tmp/mysql57/package/server/mysqld \
  --no-defaults --initialize-insecure --basedir=/tmp/mysql57/package/server --datadir=/tmp/tempenv/mysql57/data

# app dependencies (lockfile-exact)
cd /home/user/ResumePilotAi/backend  && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
cd /home/user/ResumePilotAi/frontend && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci

# ── start ─────────────────────────────────────────────────────────────────
LD_LIBRARY_PATH=/tmp/tempenv/mysql57/lib /tmp/mysql57/package/server/mysqld --no-defaults \
  --basedir=/tmp/mysql57/package/server --datadir=/tmp/tempenv/mysql57/data \
  --tmpdir=/tmp/tempenv/mysql57/tmp --socket=/tmp/tempenv/mysql57/tmp/mysql.sock \
  --secure-file-priv=/tmp/tempenv/mysql57/mysql-files --port=3306 --bind-address=127.0.0.1 &

cd /home/user/ResumePilotAi/backend && NODE_ENV=test \
  TEST_AUTH_HMAC_SECRET=local-test-auth-hmac-secret-super-secure-32chars PORT=8080 \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME=airesume_test node index.js &

cd /home/user/ResumePilotAi/frontend && npx vite --host 0.0.0.0 --port 4000 --strictPort &
cd /home/user/ResumePilotAi/frontend && npx vite --host 0.0.0.0 --port 5173 --strictPort &   # freellmapi spec only

# ── test (examples; full matrix in TEST-EXECUTION-REPORT.md) ──────────────
cd /home/user/ResumePilotAi/backend && RUN_MARIADB_INTEGRATION=false node scripts/run-tests-with-annotations.js
cd /home/user/ResumePilotAi && npm run test:enterprise && npm run test:payments && npm run test:security
cd /home/user/ResumePilotAi/frontend && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/tempenv/chromium/chromium \
  LD_LIBRARY_PATH=/tmp/tempenv/chromium/libs/lib \
  npx playwright test -c ../developer-review/tools/playwright.audit.config.ts tests/engine-integrity.spec.ts

# ── stop / clean up ───────────────────────────────────────────────────────
#    (the harness stopped every background service at the end of this pass)
pkill -f 'vite --host' ; pkill -f 'node index.js' ; pkill -f 'mysqld --no-defaults'
rm -rf /tmp/tempenv /tmp/mysql57 /tmp/libaio.whl /tmp/libaio-x /tmp/hostdb
DROP DATABASE airesume_test;   # disposable, synthetic data only
```

---

## 9. Known differences from production / the intended acceptance environment

| # | Difference | Effect on evidence |
|---|---|---|
| 1 | No MariaDB 11.4; MySQL 5.7.29 substitute; only migration 001 of 29 applicable | DB-layer semantics, MariaDB-only DDL, and all 30 MariaDB-gated tests remain **unverified** |
| 2 | No Apache / `mod_headers` / `mod_rewrite` / PHP proxy | `.htaccess` routing, SPA fallback, `api/index.php` proxy, and served-header behaviour unverified at runtime |
| 3 | No live provider credentials (AI, Stripe/PayPal/Razorpay/Paytm/PhonePe, S3, Firebase, SMTP) | All external integrations exercised only through the app's own code paths/mocks; **no live-provider test** was run |
| 4 | `fonts.googleapis.com` blocked | Text renders with fallback fonts → visual-regression baselines differ by 3–7 %; all 20 screenshot comparisons failed for this reason (see Browser report §5) |
| 5 | Chromium 149 from `@sparticuz/chromium`, not Playwright's own build | Chromium/Playwright version pairing untested; no evidence found of incompatibility (all non-visual browser suites pass) |
| 6 | Node 22.22.3 vs `@firebase/*` engine requirement `>=24.12.0` | npm emitted `EBADENGINE` warnings; no runtime failure observed in executed paths |
| 7 | 2 vCPU / 3.9 GB RAM, loopback only | Performance/latency figures are not production-representative |
| 8 | Firebase Admin initialized "without credentials (limited local mode)" | Firebase-dependent flows (real auth) unverified |

---

## 10. Components that could not be provisioned — exact reasons

| Component | Reason (verifiable) | Impact |
|---|---|---|
| MariaDB 11.4 (server + client) | §5.1 — apt mirrors, `archive.mariadb.org`, GitHub release assets and `dev.mysql.com` all blocked; no MariaDB server on npm/PyPI; no container runtime; no feasible source build | 30 MariaDB-gated tests skipped; migration 002–029 unexecutable; 14 backend tests fail on missing tables |
| Apache httpd 2.4 | not installed, apt blocked, no prebuilt artifact on npm/PyPI, building httpd+APR+PCRE is outside a disposable-test budget | Apache-layer routing/headers unverified (no executed test requires it) |
| PHP 8.x | not installed, apt blocked | `api/index.php` proxy unverified |
| Docker/Podman | no runtime available, cannot be installed | Testcontainers/DB-container strategy unavailable |
| Playwright CDN Chromium | `cdn.playwright.dev` blocked | substituted with `@sparticuz/chromium` (§4) — **resolved** |
| Live third-party credentials | not present and must not be fabricated (§ mandate) | live-provider integrations unverified |
| Google Fonts | blocked network | visual-regression comparability degraded |

---

## 11. Scope integrity (reversible, no production impact)

* All temporary runtime state lives outside the repository:
  `/tmp/tempenv`, `/tmp/mysql57`, `/tmp/libaio*`, `/tmp/hostdb`, `/tmp/npm-mariadb.json`.
* The only in-repository writes are under `developer-review/`:
  reports, `tools/` (audit-only configs + probe scripts), `Evidence/` (logs,
  screenshots, JSON), plus an ephemeral `developer-review/tools/node_modules`
  symlink to `frontend/node_modules` (git-ignored, removed at cleanup).
* Application source, configuration, schemas, migrations and dependency
  manifests were **not** modified. Verified by
  `git status --porcelain | grep -v '^.. developer-review/'` returning empty
  (see `FINAL-ACCEPTANCE-REPORT.md` §8).
* Generated build output (`frontend/dist/`) is git-ignored; the one-off
  Playwright artifacts that Playwright wrote into the repository's snapshot
  directory during a first, mis-configured run were **deleted** (5 files) and
  the run repeated with the repository's own project names — see
  `BROWSER-VERIFICATION-REPORT.md` §5.1 for why that matters.
* No git history was rewritten; no force-push; no production service, DNS,
  vhost or credential was touched.
