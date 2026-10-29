# Open blockers — recovery snapshot 2026-10-29

**Verdict: BLOCKED — NOT PRODUCTION-READY.** Current base `aa24147245daa6c027d046f1f7ae6f8fc703be46`; working changes are on `arena/76eeea4d-resumepilotai`. No push to `main`/`dev`, PR, merge, deployment, production-data operation, or financial transaction is authorized. The user requested a push to the active feature branch only; that does not clear release gates.

## Evidence-backed release gates still open

1. **MariaDB 11.4 and durable workflows.** No disposable database is configured and `127.0.0.1:3306` refuses connections. The default full backend suite is **1,290 pass / 57 fail / 0 skip of 1,347**. With `RUN_MARIADB_INTEGRATION=false`, **1,292 pass / 25 fail / 30 skipped**; the 30 skipped cases explicitly require a disposable MariaDB database, and the remaining failures still hit DB-backed rate-limit/storage paths (or related identity setup). This is not a pass. Provision only a disposable, migrated MariaDB 11.4 database; rerun migrations, ownership/tenant, payment ledger, outbox, audit, profile concurrency, export-token, OAuth and token-lifecycle tests. Never point acceptance tests at production data.
2. **Full application/browser E2E.** The configured `npm test` Playwright workflow was attempted without bypassing its disposable-DB preflight. `scripts/start-ai-engine-e2e.cjs` refused to start because explicit disposable DB settings were absent; **no full Playwright test ran**. The separate Mandate 9 UI run passed **7/7 with API routes mocked/intercepted** and is not backend/database E2E. Run the full suite only after a disposable DB and the required test identity are provisioned.
3. **Firebase identity credentials.** No Firebase Admin ADC/service credentials are configured. Mandate 9B user status calls log a Google OAuth token/ADC credential error and return 500; those identity-administration workflows remain unverified. Configure test-only credentials through the secure environment, never in chat.
4. **Payment providers and webhook replay.** Payment unit suite passes **43/43**, but no live provider sandbox, settlement, refund, or database ledger workflow was exercised. Existing webhook-event storage contains metadata rather than a signed provider event; replay therefore returns 409 `WEBHOOK_REPLAY_UNAVAILABLE` and does not change payment state. Retrieval and shared idempotent reprocessing have not been implemented. Do not label payment replay complete or run real financial transactions without explicit authorization.
5. **Accepted capability and finding backlog.** The historical M8E denominator remains **112 accepted capabilities**, **11.61% strict full parity**, and **0% historical dynamic runtime/browser claim execution**. Registers now preserve all 112 rows, 5 provisional proposals separately, all 56 original DISC IDs/aliases, and M9-P01, but this recovery has not freshly re-adjudicated every capability or finding. Historical parity is not upgraded by route/unit tests.
6. **Distribution / hosting.** `npm run build` succeeds and syncs 341 files; lint succeeds with 0 warnings/errors across 246 files. Post-build security checks pass for root/public configs and public discovery documents, but **`dist/.htaccess` is absent and the check skips it as an optional build/deployment artifact**. The build synchronizer intentionally preserves operator-managed config; deployment target, proxy layout, and the correct `dist` Apache configuration are not confirmed. Do not copy a config blindly: the root config refers to `api/index.php`, which is not part of the current frontend build output.
7. **Runtime/toolchain and deployment governance.** The environment is Node 22.22.3; installed Firebase packages warn that they require Node `>=24.12.0`. The build passes here, but production runtime compatibility is unresolved. GitHub branch-protection API access returned 403, so protection is unknown. No deployment environment or release approver was available.

## Verified local work (scope-limited)

- Targeted payment-settings RBAC, DISC-055 route registration, and webhook refusal/storage-error regressions: **16/16 passed** (Express/Supertest with injected test identities/repositories; no live MariaDB).
- Retired notification route, platform registration, and webhook regression subset: **7/7 passed**.
- Payment suite: **43/43 passed**; enterprise suite: **187/187 passed**. Enterprise tests use simulated/in-memory test paths and log DB refusals; neither suite proves a real DB/provider transaction.
- Runtime whole-backend literal route inventory: **457** effective method+literal-path registrations; **457** exact keys; **0** exact duplicates; **0** unresolved route or mount patterns. This proves registration uniqueness for the exported Express app, not workflow correctness.
- Post-change forensic integrity: **393/393** protected `developer-review/` files match baseline paths, sizes, and SHA-256.

## Next authorized verification sequence

1. Provision a disposable migrated MariaDB 11.4 database and test-only Firebase identity credentials in the execution environment; verify the database name matches the Playwright disposable-DB guard.
2. Run the full backend suite, migration gate, payment/enterprise suites, and database-backed acceptance/E2E tests; investigate each failure, do not weaken assertions or convert mocks to workflow proof.
3. Run configured full Playwright against the real app/backend/database, then accessibility and responsive checks, with actual runtime evidence.
4. Resolve webhook replay safely (provider event retrieval plus shared idempotent processor) or keep it explicitly unavailable; complete provider sandbox flows without real charges.
5. Confirm Node runtime support, production proxy/Apache config and `dist/.htaccess` policy with the actual hosting target.
6. Reconcile remaining capabilities/findings and regenerate registers/evidence. Only then consider a reviewed PR; do not merge or deploy this blocked patchset.
