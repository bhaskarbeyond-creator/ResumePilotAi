# Whole-System Production Certification Report

Generated: 2026-08-29T00:00:00+05:30

## Identity

1. Starting SHA: f434b90f32e560c4e8ca0eeb183f29ff2316f341
2. Final local SHA: ccdf0d4b0114971294cd072d5faee5ff167e237f
3. origin/main SHA: f434b90f32e560c4e8ca0eeb183f29ff2316f341
4. Production SHA: NOT VERIFIED as deployed artifact; unauthenticated health page returned the JSON below when accessible through Arena fetch tooling.
5. Production deployment timestamp: NOT VERIFIED — deployment was not performed in this turn.
6. Production artifact/build identifier: NOT VERIFIED.

Production health evidence captured:

```json
/api/platform/version => {"commitSha":"e915d6b358744ec27a77bfbc575555158118ec75","service":"resumepilot-backend","apiVersion":"platform-v2"}
/api/readyz => {"status":"ready","authoritativeDatabase":"mysql","checks":{"mysql":{"status":"READY","latencyMs":1,"version":"11.8.8-MariaDB-log","host":"127.0.0.1","database":"u727965524_airesume"},"schema":"INITIALIZED","identityProvider":"CONFIGURED","firestoreDataPlane":"REMOVED","enterprise":{"dataProvider":"mysql","dataPlaneConfigured":true,"encryption":"server-key","quotaStore":"firestore-atomic","queue":"mysql-transactional-outbox"}}}
/api/healthz => {"status":"ok","identityProviderConfigured":true,"firestoreDataPlane":"REMOVED","authoritativeDatabase":"mysql","commitSha":"e915d6b358744ec27a77bfbc575555158118ec75","databases":{"mariadb":{"status":"UP","healthy":true},"firestore":{"status":"UNKNOWN","healthy":null}},"authority":{"operationalWriteEngine":"mysql","operationalAuthority":"MARIA","canAcceptWrites":true}}
```

Local Python/curl TLS probes from the sandbox still failed with `SSLZeroReturnError`; Arena fetch tooling reached the same URLs. Production evidence is therefore limited to unauthenticated fetch responses, not authenticated browser/DB verification.

## Findings

| ID | Severity | Subsystem | Description | Root cause | Fix | Files changed | Migration | Test evidence | Playwright evidence | DB evidence | Production evidence | Failure-path evidence | Final status |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| RP-P0-001 | P0 | Database failure isolation / profile writes | During an established MariaDB outage, `POST /api/users-data/profile` could return a 400 validation error before enforcing the outage no-write contract. | Route validated `expectedRevision` before checking the database authority circuit. | Added pre-validation fail-closed guard using `databaseAuthority.canAcceptWrites()` and existing controlled 503 responder. | `backend/routes/usersData.js` | None | `node --test --test-force-exit --test-concurrency=1 tests/certification/mysql-outage.test.mjs` = 6/6 | NOT VERIFIED (browser unavailable) | Test uses controlled unreachable DB port 3399 | Production NOT DEPLOYED | VERIFIED by outage test | FIXED |
| RP-P1-002 | P1 | Resume builder UI copy / certifications | Certification date field failed product test and used less precise fallback copy “Date Issued” instead of required factual “Date Earned”. | Component fallback and English locale drifted from manual-entry contract. | Updated component fallback and English locale label to “Date Earned”. | `src/components/BuildResume/steps/CertificationsStep.jsx`, `src/locales/en/en.json` | None | `npm run test:product` = 383/383 + dependent suites pass | NOT VERIFIED (browser unavailable) | N/A | NOT DEPLOYED | N/A | FIXED |
| RP-P0-003 | P0 | Production runtime / observability | Production health fetched via Arena reports commit `e915d6b...`, not local branch work, includes `databases.firestore.status: UNKNOWN`, and `/api/readyz` reports enterprise `quotaStore: firestore-atomic`, which conflicts with the required MariaDB-only data-plane message. | Production appears to run an older artifact than this checkout; exact deployment state not independently accessible via SSH in this turn. | Not fixed in production. Local source health uses top-level `firestoreDataPlane: REMOVED` and local tenant service reports `mariadb-atomic`; production deploy required. | None | None | Fetch evidence above plus `/api/readyz` Arena fetch | NOT VERIFIED | NOT VERIFIED | Health/readyz JSON above | N/A | NOT VERIFIED |
| RP-P0-004 | P0 | Browser certification | Real Chromium verification could not run because Playwright browser download failed with network `ECONNRESET` and no system Chromium exists. | Sandbox could not download browser binary from Playwright CDN. | Not fixable in source. Documented blocker. | None | None | `npx playwright install chromium` failed | NOT VERIFIED | N/A | N/A | N/A | NOT VERIFIED |
| RP-P0-005 | P0 | Backup/restore/outbox durable drills | Runtime certification suite skipped disposable DB backup/restore and outbox drills without required env vars. | No isolated MariaDB certification database credentials in environment. | Not executed against DB. | None | None | `npm run certify:zero-firestore` showed backup/outbox skipped; `mysql-outage` now passes | N/A | NOT VERIFIED | N/A | Partial failure path only | NOT VERIFIED |
| RP-P1-006 | P1 | Certification / audit tooling integrity | `tests/feature-completeness-audit.mjs` claimed `10/10 PRODUCTION CERTIFIED` from static assertions and retained retired Firestore persistence descriptions. | Legacy audit script treated source inventory as production proof, violating the evidence hierarchy. | Downgraded optimistic COMPLETE claims without attached evidence to NOT_VERIFIED and changed the verdict/title so the script cannot certify production by itself. | `tests/feature-completeness-audit.mjs` | None | `node tests/feature-completeness-audit.mjs` now reports 54 NOT_VERIFIED and verdict `NOT VERIFIED FOR PRODUCTION CERTIFICATION` | N/A | N/A | N/A | Evidence-hierarchy failure path verified | FIXED |
| RP-P2-007 | P2 | Architecture documentation | `docs/SUPER_ADMIN_TARGET_OPERATING_MODEL.md` still described Firestore tenant context, Firestore quota transactions, and Firestore currency source of truth. | Historical TOM not updated after MariaDB ownership cutover. | Reworded active target model to MariaDB tenant context, MariaDB quota transactions, and MariaDB `system_settings.currency`. | `docs/SUPER_ADMIN_TARGET_OPERATING_MODEL.md` | None | Static grep after cleanup | N/A | N/A | N/A | N/A | FIXED |
| RP-P1-008 | P1 | Authentication UI / security messaging | Login/register/OAuth error handlers could echo raw Firebase/SDK error messages to end users for unmapped provider failures. | Error branches used `error.message`/`e.message` as the display fallback. | Added `getSafeAuthErrorMessage()` and routed login/register email and OAuth fallback errors through user-safe messages while preserving specific account-collision, popup, invalid-credential, and configuration guidance. | `src/utils/authErrorMessages.js`, `src/components/auth/login/Login.jsx`, `src/components/auth/register/Register.jsx`, `tests/auth-error-messages.test.mjs`, `package.json` | None | `npm run test:security:static` = 44/44 passed; `npm run lint` passed; `npm run build` passed | NOT VERIFIED (browser unavailable) | N/A | NOT DEPLOYED | Unmapped provider-internal error message no longer echoed in unit regression | FIXED |
| RP-P1-009 | P1 | CI migration gate / release safety | PR quality gate failed before lint/tests because `scripts/verify-mariadb-migrations.mjs` only accepted migrations through 012 while the repository contains 013 and 014. | The isolated migration verifier was not extended when CMS relational authority and fail-closed discovery-default migrations landed; migration 009 also used an ambiguous `data` reference in same-table `INSERT ... SELECT ... ON DUPLICATE KEY UPDATE`. | Updated the verifier to require latest version 014, validate 013 CMS columns/check constraint and 014 fail-closed public defaults, roll back 014/013 before 012-005, reapply 005-014 after rollback, and qualified migration 009 duplicate-update references as `system_settings.data`. | `scripts/verify-mariadb-migrations.mjs`, `backend/database/migrations/009_authoritative_configuration_bootstrap.sql` | Verifier logic and migration SQL disambiguation only; live isolated MariaDB rerun is pending CI because local sandbox has no `MARIADB_ADMIN_PASSWORD`/Docker DB. | `node --check scripts/verify-mariadb-migrations.mjs`, `npm run lint`, `npm run db:verify`, `npm run test:security:static` passed | N/A | NOT VERIFIED locally against MariaDB 11.4; expected to be verified by CI | GitHub PR check evidence showed failure at migration verifier step for old head `234b58d...` | Missing-env local run returns controlled requirement for isolated DB credentials | FIXED LOCALLY / NOT VERIFIED IN CI |

## Verification Performed

- `npm ci` and `npm --prefix backend ci`: dependencies installed, 0 npm audit vulnerabilities reported during install.
- `npm run test:security`: 481 tests, 457 passed, 24 skipped, 0 failed.
- `npm run test:security:static`: 44/44 passed after adding auth error sanitization regression coverage.
- `npm run lint`: passed after auth/UI changes.
- `npm run test:product`: 383 tests, 383 passed; additional template/doc suites passed (1, 8, and 3 tests respectively).
- `npm run db:verify`: 14/14 passed including zero-Firestore static checks.
- `node --check scripts/verify-mariadb-migrations.mjs`: syntax passed after extending migration verifier to version 014.
- Local `node scripts/verify-mariadb-migrations.mjs`: NOT VERIFIED against MariaDB because `MARIADB_ADMIN_PASSWORD` is absent in sandbox; GitHub CI is the intended isolated MariaDB evidence gate.
- `npm run test:enterprise`: backend enterprise suite plus enterprise UI tests passed; final UI test block showed 23/23 passed.
- `node --test --test-force-exit --test-concurrency=1 tests/certification/mysql-outage.test.mjs`: 6/6 passed after fix.
- `node tests/feature-completeness-audit.mjs`: legacy static audit now reports 54 NOT_VERIFIED and cannot certify production by itself.
- `npm run build`: succeeded; warning remains for large chunks and third-party lottie eval.
- `npm run audit:production` equivalent commands (`npm audit --omit=dev --audit-level=high` in root and backend): 0 vulnerabilities reported.

## Firestore Elimination Proof

Local proof only: `scripts/firestore-dependency-census.mjs` reports 0 prohibited production hits and `npm run db:verify` passed. Production proof is **NOT VERIFIED** because deployed health indicates an older SHA and still exposes a `databases.firestore` object.

## Firebase Auth Preservation Proof

Static/local proof only: security tests assert Firebase Auth/TOTP usage and Auth-only bundle constraints. Live email/password, OAuth, MFA enrollment/challenge/disable, and token refresh are **NOT VERIFIED** because real browser and production authenticated tests were blocked.

## MariaDB / PostgreSQL Architecture

MariaDB is the only verified local application-data owner. PostgreSQL is **NOT VERIFIED** as active in this checkout.

## Performance Measurements

No credible p50/p95/p99 production performance benchmark was executed. Performance is **NOT VERIFIED**.

## Three Adversarial Reviews

1. Hostile UAT: found certifications label defect; fixed. Browser UAT blocked.
2. Principal Architect: found profile outage fail-closed ordering defect; fixed. PostgreSQL ownership claims unverified.
3. Attacker + SRE: confirmed local MySQL outage test now rejects reads/writes with controlled 503 and no Firestore fallback. Full DB recovery/outbox/backup drills unverified.

## Final Decision

DEFERRED for production certification. Local defects RP-P0-001, RP-P1-002, RP-P1-006, RP-P2-007, RP-P1-008, and RP-P1-009 are FIXED with regression evidence. Whole-system production certification remains NOT VERIFIED because production deployment/live browser/database/backup/restore/outbox verification could not be completed in this turn.
