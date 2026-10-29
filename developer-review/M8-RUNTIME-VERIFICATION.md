# M8 §7 — Runtime Verification: what was executed, what was blocked, and why

**Mandate:** 8, §7 — priority P1. Establish dependencies with exact checks, start the real backend
and frontend, run R-01…R-10, capture HTTP/console/persistence evidence, and **label every conclusion**
as static, test-executed or runtime-verified.
**Revision:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9`
**Logs:** `Evidence/logs/m8-runtime-probe.log`, `m8-backend-suite.log`, `m8-frontend-typecheck.log`,
`m8-http-probe.log`, `m8-http-probe-authenticated.log`, `m8-scenarios.log`

---

## 1. Environment — measured, not assumed

| Dependency | Check | Result at `a2ecb96` |
|---|---|---|
| MariaDB / MySQL server | `command -v mariadb mysqld mariadbd mysql` | **all absent**; no `docker`/`podman`; `libaio` absent (so the pip fallback that supplies `libaio.so.1` was the only candidate and there is no server binary to link it to) |
| npm registry | `curl https://registry.npmjs.org/` | **200** — reachable |
| PyPI | `curl https://pypi.org/` | **200** — reachable |
| GitHub | `curl https://github.com/`, `codeload.github.com` | 200 / 301 — reachable |
| Playwright browser CDN | `curl https://cdn.playwright.dev/`, `playwright.azureedge.net` | **unreachable** (000) |
| MariaDB download host | `curl https://mariadb.com/` | **unreachable** (000) — no server bundle can be fetched |
| Browser binaries | `ls ~/.cache/ms-playwright`, `command -v chromium google-chrome` | **absent** |
| Provider credentials | env scan for `OPENAI/ANTHROPIC/GEMINI/GOOGLE_APPLICATION/RAZORPAY/STRIPE/PAYPAL/FIREBASE/SMTP` | **0** |
| Backend dependencies | `npm ci --ignore-scripts` in `backend/` | installed (346 packages, lockfile untouched) |
| Frontend dependencies | `npm ci --ignore-scripts` in `frontend/` | installed (280 packages, lockfile untouched) |

Consequence: MariaDB, browsers and provider calls remain **impossible** in this environment; nothing
below substitutes for them. What *became* possible in M8 — because npm was reachable — is real
execution of the Node backend and the frontend typecheck.

## 2. What executed

### 2.1 Backend test suite — test-executed

`cd backend && npm test` → `Evidence/logs/m8-backend-suite.log`

| Metric | Value |
|---|---:|
| Tests run | **1,315** |
| Pass | **1,269** |
| Fail | **46** |
| Suites | 5 |
| Wall clock | 72.7 s |
| Exit code | 1 |

**Every one of the 46 failures is attributable to the absent database, not to application logic.**
Attribution was made per failure from the log, not by assumption: 37 carry
`connect ECONNREFUSED 127.0.0.1:3306` in their own assertion output, 7 are `503 Service Unavailable`
/ `503 !== 200` from the fail-closed database path, and 2 are downstream consequences of the same
cause (`mariadb-only-integration.test.js` audit write with no DB; `superadmin-remediation-pass.test.js`
replay of an unknown event id answering `500` instead of `404` because the lookup cannot reach the
store). No failure indicates a defect that would exist with a database present; equally, **none of
the DB-backed assertions was proven** by this run.

Targeted run used to establish that the enterprise chain in `M8-SUBFEATURE-CLOSURE.md` is exercised:
`node --test enterprise-test/enterprise-completeness.test.js` → **20/20 pass** (includes
`platform tenants` list/suspend/reactivate and team `leadPrincipalId` round-trip).

### 2.2 Frontend typecheck — test-executed

`cd frontend && npx tsc -b` → exit **0**, empty output (`m8-frontend-typecheck.log`). The modern tree
compiles under its own project references. This proves type-level integrity, not behaviour.

### 2.3 Real backend over HTTP — runtime-verified (with substitutions, labelled)

Two probe runs, both against the real `backend/index.js`:

- `m8-http-probe.log` — unauthenticated, `NODE_ENV=development`, `IN_MEMORY_REPOSITORY=1`, port 5061.
- `m8-http-probe-authenticated.log` and `m8-scenarios.log` — same, with a **local HMAC test identity**
  (`TEST_AUTH_HMAC_SECRET`, `rptest.` tokens minted for `SUPER_ADMIN` and `USER`).

Two substitutions must be stated with every result: **the repository was `InMemoryRepository`, not
MariaDB**, and **identity was the non-production HMAC verifier, not Firebase**. Neither is a
production proof; both exercise the real Express stack, the real middleware chain, the real route
table and the real handlers.

Finding that changes how static 404 claims may be read: unauthenticated, an unknown `/api/*` path
answers **401 AUTH_REQUIRED** (the zero-trust boundary runs before routing), so a 401 says nothing
about route existence. Only an authenticated probe distinguishes "no route" from "no permission".

| Probe | Observed | Reading |
|---|---|---|
| `GET /healthz` | 200 `{"status":"ok"}` | process healthy |
| `GET /readyz` | 503 `mysql UNAVAILABLE` | fail-closed readiness, correct without a DB |
| `GET /api/service-availability` | 200 | the endpoint FP-G23 says lost its consumer still works |
| `GET /api/jobs` (user) | **404 NOT_FOUND "API route not found"** | contract gap confirmed at runtime |
| `GET /api/jobs-data` (user) | 200 `{"jobs":[]}` | the registered listing works |
| `GET /api/blog/posts` (super-admin) | **404 NOT_FOUND** | blog contract gap confirmed |
| `GET /api/blog-data` | 200 `{"posts":[]}` | the real blog read operation works |
| `POST /api/billing/validate-coupon` | **404 NOT_FOUND** | client-unique path |
| `POST /api/coupons/validate` | 404 `{"valid":false,"error":"Coupon code \"ABC\" does not exist."}` | same status, **different body shape** — the route exists and answered the question |
| `GET /api/platform/status` | **404 NOT_FOUND** | client path |
| `GET /api/admin/platform/status` | 400 `TENANT_ID_REQUIRED` | operation exists; needs `tenantId` |
| `GET /api/admin/queues` | **404 NOT_FOUND** | client path |
| `GET /api/platform/queues` | 503 `QUEUE_QUERY_UNAVAILABLE` | operation exists; needs a DB |
| `POST /api/platform/queues/purge` | **410 DEAD_LETTER_PURGE_RETIRED** | deliberate retirement, as the source says |
| `POST /api/admin/users/:uid/status` | **404 NOT_FOUND** | client path |
| `PATCH /api/admin/users/:uid` | 500 `app/invalid-credential` | operation exists; Firebase Admin absent |
| `POST /api/admin/employer-applications/:uid/verify` | **404 NOT_FOUND** | client path |
| `PATCH /api/admin/employer-applications/:uid` | 404 `{"error":"Employer application not found."}` | operation exists (different shape) |
| `POST /api/admin/jobs/:id/moderate` | **404 NOT_FOUND** | client path |
| `PATCH /api/admin/jobs/:id` | 404 `{"code":"NOT_FOUND","error":"Job not found."}` | operation exists (different shape) |
| `POST /api/admin/operations/backup` | **404 NOT_FOUND** | no backup trigger exists |
| `POST /api/admin/operations/cache-clear` | **404 NOT_FOUND** | no cache purge exists |
| `POST /api/notify/email` | **404 NOT_FOUND** | no generic email operation exists |
| `POST /api/contact` | 503 `RATE_LIMIT_UNAVAILABLE` | admission control needs the DB; the endpoint exists |
| `GET /api/enterprise/platform/tenants` | 404 `ENTERPRISE_DISABLED` | code exists, deployment gates it off |
| `POST /api/support/tickets` | 500 `ECONNREFUSED 3306` | `services/supportTickets` talks to MariaDB directly |

### 2.4 R-05 executed end to end (DISC-048 no longer inferred)

`POST /api/resumes/res-audit-01` with a 120 KB base64 photo → **200**; the same request with a
~400 KB base64 photo (a ~300 KB JPEG, well under the advertised 5 MB) → **413 PAYLOAD_TOO_LARGE**
(`{"code":"PAYLOAD_TOO_LARGE","message":"Request payload is too large"}`). DISC-048 moves from
"Medium-High, status inferred" to **runtime-verified** for the status code; the 5 MB-vs-256 KB
mismatch is now observed, not computed.

## 3. R-01 … R-10 status

**Machine-readable twin:** `Evidence/artifacts/m8-scenarios.json` — per scenario: revision, environment
(substitutions named), commands, verbatim observations, the assertions that held and those that did not,
what blocked it, and which log carries the raw output. Prose below is the same information for a human
reader; if the two ever disagree, the artifact is the record and the prose is the defect.

| ID | Scenario | Status in M8 | What was actually observed |
|---|---|---|---|
| R-01 | Moderation approval persists | **PARTIAL — runtime (API leg)** | `POST …/verify` → 404 route-not-found; `PATCH …/:uid` → 404 "Employer application not found" (route exists). The persistence leg needs MariaDB. Browser leg not run. |
| R-02 | Suspend via the real contract | **PARTIAL — runtime (API leg)** | `POST /admin/users/:uid/status` → 404 route-not-found; `PATCH /admin/users/:uid` → 500 `app/invalid-credential` (Firebase Admin absent). Neither 200 nor a DB write could be shown. |
| R-03 | Backup / cache purge do not lie | **PASS — runtime** | Both client controls 404 with `API route not found`. Nothing can report success from a real operation because no operation exists. |
| R-04 | Dead-letter retry / purge | **PARTIAL — runtime** | `GET /platform/queues` → 503 (needs DB); `POST /platform/queues/purge` → **410 by design**; retry → 500 ECONNREFUSED. The policy is observed; the data plane is not. |
| R-05 | Resume photo within the body budget | **PASS — runtime** | 120 KB → 200; ~400 KB → **413**. |
| R-06 | Server-rendered export | **BLOCKED** | `POST /api/export-docx` → 503 `RATE_LIMIT_UNAVAILABLE` (admission control needs the DB). The DOCX handler was never reached. |
| R-07 | Support ticketing end to end | **BLOCKED (DB), PARTIAL static** | `POST /api/support/tickets` → 500 ECONNREFUSED: the service bypasses the repository. Route existence proven; no ticket created. |
| R-08 | Job board lists jobs | **PASS — runtime** | `/api/jobs` 404 vs `/api/jobs-data` 200; the page's request cannot succeed. |
| R-09 | Rejection email delivery | **PASS — runtime (negative)** | `POST /api/notify/email` → 404. No email operation exists to deliver anything. |
| R-10 | Coupon validation and price integrity | **PARTIAL — runtime** | `/api/coupons/validate` answered `404 {"valid":false,"does not exist"}` (route works, code unknown); `/api/billing/validate-coupon` answered 404 route-not-found. Order creation not attempted (payments need real credentials). |

**Score: 4 PASS (R-03, R-05, R-08, R-09), 4 PARTIAL (R-01, R-02, R-04, R-10), 2 BLOCKED (R-06, R-07).**
No scenario is reported as end-to-end verified: none of them reached a durable store.

## 4. Browser and frontend runtime — blocked, with the exact gate

- `frontend` was never served to a browser: no browser binary exists and the Playwright browser CDN is
  unreachable, so `npm test` (`playwright test`) cannot install or launch a browser.
- The frontend *build* was therefore not exercised either. Only `tsc -b` ran (exit 0).
- Consequently no DOM assertion, no console capture, no screenshot and no user journey exists in M8.
  `Evidence/artifacts/playwright-results/**` in the package are earlier artefacts and are **not**
  evidence of M8 execution.

## 5. MariaDB — blocked, and what would unblock it

No server binary, no container runtime, and the only host that serves MariaDB builds
(`mariadb.com`) is unreachable. PyPI offers `libaio-bins` but no server; the npm registry offers no
server bundle; GitHub release assets are served from a CDN this sandbox cannot reach.

To run the database half, an environment needs one of: a MariaDB 11.4 binary already present, a
container runtime with a cached image, or network access to a MariaDB mirror. With that, the
following become executable without any further work: the 46 DB-attributable test failures, R-01's
persistence leg, R-04's queue rows, R-06's export, R-07's ticket persistence, and everything in
`RUNTIME-TEST-HARNESS-M7.md` that asserts row state.

## 6. What this section proves and does not prove

**Proves** — the backend starts and serves; the route table behaves as the register says (unknown API
paths 404, known ones answer with their own error shapes, one retired operation returns 410); the
`/api/jobs` and `/blog/posts*` gaps are real at runtime; the 256 KB body limit rejects a 400 KB
payload with 413; the frontend typechecks; 1,269 backend tests pass.

**Does not prove** — anything about MariaDB persistence, Firebase identity, provider integrations,
browser behaviour, upload flows beyond the body limit, or production readiness. Every claim in this
package that depends on those remains static or unverified.
