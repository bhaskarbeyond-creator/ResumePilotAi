# Canonical backend suite — failure triage (V5)

Command: `cd backend && npm test`  →  `backend/scripts/run-tests-with-annotations.js`
Log: `Evidence/logs/v5/backend-canonical-suite.log`  (exit 1)

| measure | value |
|---|---:|
| tests discovered | 1,315 |
| executed | 1,315 |
| passed | 1,269 |
| failed | 46 |
| skipped | 0 |
| blocked at harness level | 0 |
| exit code | 1 |

The repo script sets `RUN_MARIADB_INTEGRATION=true` and `MARIADB_TEST_ALLOW_RESET=true` by default, so
this is the canonical run. An earlier V5 attempt (`backend-suite.log`) invoked `node --test test/`
directly, resolved it to a nonexistent module, and produced 1 test / 0 pass / 1 fail — that log is
invalid and is not cited anywhere.

## Failure causation

| cause | failures |
|---|---:|
| DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | 40 |
| DB-ABSENT — 503 APPLICATION_DATABASE_UNAVAILABLE | 4 |
| DB-ABSENT — assertion on a DB-backed route (mechanism cited below) | 2 |

All 46 failures are attributable to the absent database. 246 `ECONNREFUSED 127.0.0.1:3306`
occurrences appear in the log; the 503 responses are the application's own
`APPLICATION_DATABASE_UNAVAILABLE` guard (`backend/index.js:617-620`), not an unrelated crash. Two
failures do not print the refusal itself, so they are attributed at the handler:
`GET /api/admin/audit-logs` answers 503 under the same guard, and the webhook-replay handler
(`routes/platform.js:1812`) calls `getPool().query()` and maps the failure to a generic 500.

**This is a causation claim, not a clean-bill claim.** These code paths were never executed against a
real database here, so nothing in this file shows that they would pass with MariaDB present. It shows
only that the observed failures are explained by its absence.
That is a statement about *causation*, not a claim that the app is correct — the code paths behind
these tests were never executed here.

## Per-failure detail

| # | test | location | cause | first error line |
|---:|---|---|---|---|
| 1 | Enterprise Role View & Simulation Security Architecture | `/home/user/ResumePilotAi/backend/test/enterprise-role-view-simulation.test.js:38:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 2 | Forensic MariaDB ↔ API Data Lineage Validation Suite | `/home/user/ResumePilotAi/backend/test/forensic-data-lineage.test.js:35:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 3 | FreeLLMAPI: Express app mounts /v1/models and the operator-gated /v1/status | `/home/user/ResumePilotAi/backend/test/freellmapi-engine.test.js:266:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 4 | FreeLLMAPI: POST /v1/chat/completions returns an OpenAI-shaped completion | `/home/user/ResumePilotAi/backend/test/freellmapi-engine.test.js:696:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 5 | FreeLLMAPI: POST /v1/chat/completions streams text/event-stream chunks | `/home/user/ResumePilotAi/backend/test/freellmapi-engine.test.js:763:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 6 | FreeLLMAPI: POST /v1/messages handles Anthropic format and SSE streaming | `/home/user/ResumePilotAi/backend/test/freellmapi-engine.test.js:810:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 7 | FreeLLMAPI: POST /v1/search exposes Tavily results with the platform key | `/home/user/ResumePilotAi/backend/test/freellmapi-engine.test.js:871:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 8 | FreeLLMAPI: transparent 429 failover through the public HTTP surface | `/home/user/ResumePilotAi/backend/test/freellmapi-engine.test.js:909:1` | DB-ABSENT — 503 APPLICATION_DATABASE_UNAVAILABLE | Expected values to be strictly equal: |
| 9 | clean MariaDB 11.4 ownership, concurrency, outbox, payment, and deletion integration | `/home/user/ResumePilotAi/backend/test/mariadb-migration-gate.test.js:57:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 10 | CERTIFICATION: public configuration loads from MariaDB only | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | expected 200 "OK", got 503 "Service Unavailable" |
| 11 | CERTIFICATION: llms.txt is default-off, claim-validated, audited, and MariaDB-backed | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | expected 404 "Not Found", got 503 "Service Unavailable" |
| 12 | CERTIFICATION: authentication is enforced on protected routes (identity-plane only) | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | authenticated profile read should be authorized even when no profile exists, got 503 |
| 13 | CERTIFICATION: user profile create/read/update with optimistic revision guard (MySQL transactions) | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | expected 200 "OK", got 503 "Service Unavailable" |
| 14 | CERTIFICATION: resume create -> list -> load -> edit -> publish -> delete (MySQL persistence) | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | expected 200 "OK", got 503 "Service Unavailable" |
| 15 | CERTIFICATION: cross-user access is denied (multi-tenant zero-trust) | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | expected 200 "OK", got 503 "Service Unavailable" |
| 16 | CERTIFICATION: favourites are MySQL-backed and owner-scoped | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | expected 200 "OK", got 503 "Service Unavailable" |
| 17 | CERTIFICATION: stats read + authenticated increments (MySQL) | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — 503 APPLICATION_DATABASE_UNAVAILABLE | expected 200 "OK", got 503 "Service Unavailable" |
| 18 | CERTIFICATION: public reviews use relational owner and phrases use canonical documents | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | expected 200 "OK", got 503 "Service Unavailable" |
| 19 | CERTIFICATION: contact messages persist to MySQL | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | expected 202 "Accepted", got 503 "Service Unavailable" |
| 20 | CERTIFICATION: export render token lifecycle is MySQL-durable | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Export token store unavailable: connect ECONNREFUSED 127.0.0.1:3306 |
| 21 | CERTIFICATION: OAuth state & exchange codes are MySQL-backed (single-use) | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 22 | CERTIFICATION: password-reset token store is MySQL-backed and latest-token-wins | `/home/user/ResumePilotAi/backend/test/mariadb-only-integration.test.js:28:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 23 | CERTIFICATION: admin surfaces operate with MySQL (users list, audit write) | `backend/test/mariadb-only-integration.test.js:368` | DB-ABSENT — `GET /api/admin/audit-logs` returns the 503 database-unavailable guard; the assertion only allows 200/403 | The expression evaluated to a falsy value: |
| 24 | 028/029 are applied by the runner with checksums matching the checked-in files | `/home/user/ResumePilotAi/backend/test/migrations-028-029.test.js:32:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 25 | ai_routing_decisions matches the proposal shape: PK, columns, three indexes | `/home/user/ResumePilotAi/backend/test/migrations-028-029.test.js:32:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 26 | enterprise_ai_usage gains the nullable indexed decision_id join column | `/home/user/ResumePilotAi/backend/test/migrations-028-029.test.js:32:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 27 | legacy column-explicit INSERTs keep working post-029; decision_id rides along when present | `/home/user/ResumePilotAi/backend/test/migrations-028-029.test.js:32:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 28 | down round-trip: 029.down -> 028.down -> re-up restores the baseline exactly | `/home/user/ResumePilotAi/backend/test/migrations-028-029.test.js:32:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 29 | parallel runMigrations under GET_LOCK: the second concurrent run is a clean no-op | `/home/user/ResumePilotAi/backend/test/migrations-028-029.test.js:32:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 30 | RBAC Forensic: Super Admin has authoritative access to all platform and system configuration endpoints | `/home/user/ResumePilotAi/backend/test/rbac-role-visibility-forensic.test.js:41:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 31 | RBAC Forensic: Auditor is strictly limited to Audit, Security, and Read-Only domains; System Configuration and Operators are blocked | `/home/user/ResumePilotAi/backend/test/rbac-role-visibility-forensic.test.js:69:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 32 | RBAC Forensic: Sensitive Credentials Redaction Contract (Zero Plaintext Secrets Leaked) | `/home/user/ResumePilotAi/backend/test/rbac-role-visibility-forensic.test.js:174:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 33 | one-time export render data endpoint is public only through an opaque token | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:74:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 34 | email settings projections expose configured state without runtime credentials | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:124:1` | DB-ABSENT — 503 APPLICATION_DATABASE_UNAVAILABLE | Expected values to be strictly equal: |
| 35 | Twilio settings persist in the canonical MySQL secret namespace without response disclosure | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:15:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 36 | Ads create and revision-safe delete persist through audited backend routes | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:15:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 37 | job application submission and employer status transitions are atomic, audited, and revision safe | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:15:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 38 | employer job create, pause, edit, and delete routes are owned, audited, and revision safe | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:15:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 39 | generic settings preserve omitted and blank backend secrets without browser disclosure | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:15:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 40 | email runtime save rejects unencrypted or malformed transport configuration | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:315:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 41 | loading non-secret AI settings does not require recent authentication | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:336:1` | DB-ABSENT — 503 APPLICATION_DATABASE_UNAVAILABLE | Expected values to be strictly equal: |
| 42 | fresh authorized admin reaches revisioned AI settings persistence without secret disclosure | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:15:33` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 43 | fresh authorized admin provider test reaches the dedicated AI route with useful errors | `/home/user/ResumePilotAi/backend/test/routes.integration.test.js:374:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 44 | Authentication, Token Lifecycle & Re-Authentication Architecture | `/home/user/ResumePilotAi/backend/test/session-reauth-lifecycle.test.js:71:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | connect ECONNREFUSED 127.0.0.1:3306 |
| 45 | Payment Webhooks Diagnostic: returns sanitized events stream and rejects unauthorized callers | `/home/user/ResumePilotAi/backend/test/superadmin-remediation-pass.test.js:113:1` | DB-ABSENT — ECONNREFUSED 127.0.0.1:3306 | Expected values to be strictly equal: |
| 46 | Payment Webhooks Replay: requires SuperAdmin authorization and validates event ID | `backend/test/superadmin-remediation-pass.test.js:142` | DB-ABSENT — `platform.js:1812` calls `getPool().query(...)`; the pool throws with no server, the catch maps it to 500 `REPLAY_FAILED` instead of the expected 404 | Expected values to be strictly equal: 500 !== 404 |
