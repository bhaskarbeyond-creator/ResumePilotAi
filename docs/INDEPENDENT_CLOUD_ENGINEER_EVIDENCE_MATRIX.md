# RESUMEPILOT AI — INDEPENDENT CLOUD ENGINEER EVIDENCE MATRIX

**Audit role:** Independent Cloud / Principal Engineer (acting independently of the certifying Principal Developer)
**Audit date:** 2026-08-26 (Asia/Calcutta)
**Audited release (claimed authoritative):** `c49fac08f9dcfcee53a333a0e999050735d3821e`
**Release tag:** `uat-release-2026-08-26`
**Production URL:** `https://airesume.projectdemo.guru`

> **How to read this matrix.** Every row was produced from a tool call executed during this audit.
> `VERIFIED` requires the applicable evidence layers to agree. `PARTIALLY VERIFIED` means some
> layers agree and others are absent or contradict. `NOT VERIFIED` means the claim could not be
> substantiated. `BLOCKED` means access prevented verification — never converted to PASS.
>
> **Live-evidence caveat that governs many rows:** the audit sandbox can reach production over
> HTTPS for unauthenticated endpoints only. It has no Super Admin, Employer, Enterprise or Support
> credentials, and cannot reach MySQL, Firestore or the production host. Any claim resting on
> *authenticated* live behaviour is therefore `BLOCKED`, not `PASS`.

---

## 1. Release identity

| Claim | Code Evidence | Test Evidence | Live Evidence | Documentation | Status |
|---|---|---|---|---|---|
| Git HEAD == `c49fac08f9dcfcee53a333a0e999050735d3821e` | `git rev-parse HEAD` → `c49fac08f9dcfcee53a333a0e999050735d3821e` | n/a | n/a | n/a | **VERIFIED** |
| Tag `uat-release-2026-08-26` targets the same commit | `git rev-parse uat-release-2026-08-26^{commit}` → `c49fac08…21e`; annotated tag object `b19579f34d4502b3957e4cfdc37b25db452f77ea` | n/a | n/a | Tag message: "Final 10/10 Production & UAT Certification Release" | **VERIFIED** |
| Deployed package == authoritative SHA | n/a | n/a | `GET /api/healthz` → `"commitSha":"c49fac08f9dcfcee53a333a0e999050735d3821e"` | — | **VERIFIED** |
| `/api/platform/version` reports authoritative SHA | n/a | n/a | → `{"commitSha":"c49fac08f9dcfcee53a333a0e999050735d3821e","service":"resumepilot-backend","apiVersion":"platform-v2"}` | — | **VERIFIED** |
| Working tree clean at audit start | `git status --porcelain` → empty (0 lines) | — | — | — | **VERIFIED** |
| Certification documents carry the authoritative SHA | — | — | — | `grep -rl c49fac08…21e docs/*.md` → **0 of 74 docs**; docs instead contain 20+ unrelated 40-hex SHAs | **NOT VERIFIED** (documentation stale — see GAP P2-04) |
| Full commit history available for forensic review | `git rev-parse --is-shallow-repository` → `true`; `git rev-list --count HEAD` → `1`; `.git/shallow` present; parent `4fdb56f3b329d656263c6a0fb6fe657a668ad2d9` not present locally | — | — | — | **BLOCKED** (shallow clone; history-dependent forensics impossible) |

**Release identity conclusion:** the code, tag and live deployment agree exactly on the full
40-character SHA. The *documentation layer* does not: the authoritative SHA appears in none of the
74 markdown documents. Per Rule 4 the SHA identity is sound; per Rule 3 the four-layer
reconciliation fails on documentation.

---

## 2. Test battery (the "676/676, 0 failed" claim)

Measured on the frozen release **before** any audit modification, using the project's own runner.

| Claim | Code Evidence | Test Evidence (measured) | Live Evidence | Documentation | Status |
|---|---|---|---|---|---|
| "Static Security & Credential Scanning: 28 Passed" | 4 test files present | `node --test tests/security-static.test.mjs tests/secret-scanner-efficacy.test.mjs tests/xss.test.mjs tests/mfa-static.test.mjs` → **28 tests / 28 pass / 0 fail** | — | Matches | **VERIFIED** |
| "Product, Template & Candidate Journey: 362 Passed" | 44 files in `test:product` | first `node --test` block of `npm run test:product` → **362 / 362 / 0** | — | Matches | **VERIFIED** |
| "Enterprise IAM & Multi-Tenant: 210 Passed" | `backend/enterprise-test/*.test.js` (23 files) + `tests/enterprise-ui.test.mjs` | backend enterprise → **187 / 187 / 0**; enterprise-ui → **23 / 23 / 0**; 187+23 = **210** | — | Matches | **VERIFIED** |
| "Database Sync, Parity & Failover: 27 Passed" | 4 files in `test:db-parity` | `npm run test:db-parity` → **21 tests / 21 pass**, not 27 | — | **Mismatch (21 ≠ 27)** | **PARTIALLY VERIFIED** |
| "High-Fidelity DOCX & PDF Export: 49 Passed" | `docx-export`, `docx-parity`, `export-authorization`, `export-pipeline`, `export-tokens` | those 5 files → **38 tests / 38 pass**, not 49 | — | **Mismatch (38 ≠ 49)** | **PARTIALLY VERIFIED** |
| **"TOTAL 676 PASSED (100% PASS RATE), 0 FAILED, 0 SKIPPED"** | — | Actual frozen-release totals: **919 tests, 918 pass, 1 FAIL**. `npm test` (test:security + test:product) alone = **688 tests, 687 pass, 1 fail** | — | The 676 tally **omits `backend/test/*.test.js` (286 tests)** — the very suite containing the failure | **DISPROVED** |
| "0 skipped / 0 blocked / 0 flaky" | — | `# skipped 0`, `# cancelled 0`, `# todo 0` across all suites; 3 consecutive runs of the failing test failed identically (not flaky) | — | Skipped/flaky portion accurate | **PARTIALLY VERIFIED** |
| Backend integration suite passes | 43 files in `backend/test/` | **286 tests / 285 pass / 1 FAIL** — `platform-health-rbac.test.js:101` "SUPER_ADMIN may read every operational-status surface", `AssertionError: 404 !== 200` on `/api/platform/operational-status/firestore` | — | Not mentioned anywhere in the certification | **NOT VERIFIED** (GAP P2-01) |
| "0 vulnerabilities (`audit --level=moderate`)" | — | `npm audit --audit-level=moderate` → `found 0 vulnerabilities`; `npm --prefix backend audit --audit-level=moderate` → `found 0 vulnerabilities` | — | Matches | **VERIFIED** |
| "Production build 0 errors" | — | `npm run build` → `✓ built in 5.00s`, exit 0 | — | Matches | **VERIFIED** |
| Lint clean | `eslint.config.js` | `npm run lint` → exit 0, **788 problems (0 errors, 788 warnings)** | — | Certification does not disclose the 788 warnings | **PARTIALLY VERIFIED** |

**Post-remediation totals (branch `arena/01a03aa4-resumepilotai`):** backend **295/295** (9 new
regression tests added), product **374/374**, security-4 **28/28**, db-parity **21/21**,
enterprise **187/187**, enterprise-ui **23/23** → **928 tests, 928 pass, 0 fail, 0 skipped**.

---

## 3. Database, Firestore, parity and sync

| Claim | Code Evidence | Test Evidence | Live Evidence | Documentation | Status |
|---|---|---|---|---|---|
| MySQL is the active primary engine | `backend/database/engineManager.js` default `'mysql'`; committed `backend/database/engine_state.json` → `{"engine":"mysql","previousEngine":"firestore","switchedAt":"2026-08-25T19:12:13.710Z"}` | db suites run green under mysql | Not directly exposed unauthenticated | `DATABASE_ARCHITECTURE.md` agrees | **VERIFIED** |
| Firestore-native Enterprise plane preserved (path partitioning) | `firestoreEnterpriseRepository.tenantCollection()` → `tenants/${assertUuid(tenantId)}/…`; `assertContext()` throws `TENANT_CONTEXT_REQUIRED` (403) without tenant+principal | `enterprise-firestore-isolation`, `tenant-adversarial`, `tenant-foundation` all pass (part of 187) | `BLOCKED` (needs authenticated tenant) | `DATABASE_ARCHITECTURE.md` | **PARTIALLY VERIFIED** |
| Enterprise resource encryption = AES-256-GCM | `encryptionProvider.js`: `ALGORITHM='AES-256-GCM'`, `createCipheriv('aes-256-gcm')`, envelope encryption with per-value random data key, key versioning, `failClosed()` | `enterprise-secrets-hardening.test.js` asserts throw when key absent | **`GET /api/readyz` → `enterprise.encryption: "none"`** — i.e. `encryptionProvider === null` in production | Certification claims "AES-256-GCM encryption … VERIFIED (10/10)" | **DISPROVED FOR LIVE PRODUCTION** (GAP P1-04) |
| "100% parity / field-level losslessness" | `computeContinuousParity()`, `calculateContentHash()` (SHA-256 canonical hash) | 21/21 db-parity tests pass | `BLOCKED` (no DB access) | `FIRESTORE_MYSQL_FIELD_LEVEL_RECONCILIATION.md` asserts 35 collections → 28 tables | **PARTIALLY VERIFIED** (code+test only; live parity unmeasurable here) |
| Bidirectional sync (MySQL→Firestore and Firestore→MySQL) | `replicateToFirestore()`, `replicateToMySQL()`, `processSyncQueue()`, `processFirestoreOutbox()` (`sync_outbox_fs`) | `database-sync-engine`, `firestore-reverse-outbox`, `edge-case-sync-matrix` pass | `BLOCKED` | `DATABASE_SYNC.md` | **PARTIALLY VERIFIED** |
| Idempotency / lease reclaim / DLQ | Stale-lease reclaim (`status='PROCESSING' AND updated_at < NOW()-120s` → RETRYING); retry → `DEAD_LETTER` at `max_retries` | Covered in sync suites | `BLOCKED` | — | **PARTIALLY VERIFIED** |
| **Monotonic revision guard protects against stale events** | `syncManager.js` guard wrapped in `try { … } catch (_) {}` — read failure silently bypassed the guard | **No test covers guard-read failure** | n/a | UAT-16 asserts "Monotonic revision preserved" | **DISPROVED — reproduced** (GAP P1-03, now fixed) |
| Database switch requires measured 100% parity | `flushAndVerifyBeforeSwitch()`: `let parityPercentage = 100;` then `try {…} catch (_) {}` — probe failure left parity at 100 | **No test covers Firestore-down during the gate** | n/a | UAT-16: "Switch allowed only at 100% parity" | **DISPROVED — reproduced** (GAP P1-02, now fixed) |
| Database switch restricted to Super Admin + TOTP | `databaseAdmin.js` imported `requireSuperAdmin` but **never called it**; only `router.use(requirePermission('system.config.write'))`, which ADMIN also holds | **No test covered ADMIN on the switch route** | n/a | UAT-16 preconditions: "Super Admin + TOTP" | **DISPROVED — reproduced** (GAP P1-01, now fixed) |
| Emergency failover explicitly controlled (no auto-promotion) | Switch requires explicit `POST` with `force:true`; `switchInProgress` in-process mutex; 409 on concurrent attempt | `database-switch-safety.test.mjs` test 6 asserts 409 `already in progress` | `BLOCKED` | — | **VERIFIED (code+test)** |
| No unrestricted automatic database promotion | No auto-switch path found; engine only changes via explicit route or `engine_state.json` | — | — | — | **VERIFIED** |

---

## 4. Security, RBAC, MFA

| Claim | Code Evidence | Test Evidence | Live Evidence | Documentation | Status |
|---|---|---|---|---|---|
| RBAC matrix defined per role | `backend/security/auth.js` `PERMISSIONS`: `SUPER_ADMIN:['*']`, `SUPPORT:['users.read','email.logs.read','tenants.read','tickets.manage']`, plus ADMIN/AUDITOR/ENTERPRISE_*/EMPLOYER/USER | `admin-rbac-contract.test.js` passes | — | — | **VERIFIED** |
| Support cannot switch databases / perform destructive ops | SUPPORT lacks `system.config.write`; router-level guard denies | **Independently re-proven**: `POST /api/admin/database-settings` with SUPPORT → **HTTP 403 FORBIDDEN** | `BLOCKED` (no Support credentials) | UAT-13 claims PASS | **VERIFIED (code+test)** |
| TOTP MFA enforced for Super Admin | `requireSuperAdmin()` → 403 `SUPER_ADMIN_MFA_REQUIRED` when `superAdminMfaEnforced() && !hasSecondFactor()`; Firebase-native second factor from JWT claims | `totp-mfa-lifecycle.test.js`, `mfa-static.test.mjs` pass | `BLOCKED` | — | **PARTIALLY VERIFIED** |
| Step-up / recent authentication for sensitive ops | `requireRecentAdminAuthentication()` uses server-side `auth_time`, `SENSITIVE_AUTH_MAX_AGE_MS` default 10 min, fails closed in production | Used by `/operational-status/:serviceId/test` | `BLOCKED` | — | **VERIFIED (code)**; was **absent** on DB switch pre-fix (P1-01) |
| Payment signature verification is constant-time | `safeEqual()` → `crypto.timingSafeEqual` with length check; Razorpay HMAC-SHA256 over `orderId\|paymentId` | `payments.test.js` passes | `BLOCKED` (sandbox mode only) | — | **VERIFIED (code+test)** |
| Stripe webhook authenticity | `express.raw()` mounted **before** `express.json()` for `/api/stripe-webhook`; `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` | `payments.test.js` | `BLOCKED` | — | **VERIFIED (code)** |
| Amount/currency validation in subunits | `validateRazorpayPayment` / `validatePayPalOrder` / `validatePaytmPayment` compare `Number(payment.amount)` and normalized currency, reject on mismatch | `payments.test.js` | `BLOCKED` | — | **VERIFIED (code+test)** |
| No secrets in tracked files | Dedicated scanner tests incl. regression for a prior `remote.env` incident | 28/28 security tests incl. "tracked files contain no recognizable private credentials" | — | — | **VERIFIED** |
| No TODO/FIXME/HACK debt markers | `grep -riE "\b(TODO\|FIXME\|HACK\|XXX)\b"` over `backend src scripts tests` → 5 hits, **all false positives** (the literal `xxx` in placeholders/word-lists) | — | — | — | **VERIFIED** |
| No hardcoded production credentials | `.env.example` and `ecosystem.config.js` contain placeholders only (`REPLACE_WITH_openssl_rand_base64_32`, `project-id`) | secret-scanner tests pass | — | — | **VERIFIED** |

---

## 5. Subsystem certification claims vs live production state

All live values below were read from production during this audit.

| Claim | Code Evidence | Test Evidence | **Live Evidence (measured)** | Documentation | Status |
|---|---|---|---|---|---|
| "Enterprise verified / Zero Cross-Tenant Leaks" | Fail-closed `sealPayload()` throws 503 `ENTERPRISE_ENCRYPTION_UNAVAILABLE` for any non-`PUBLIC` classification (default is `PRIVATE`) | 210/210 enterprise tests pass **with keys configured in-test** | `GET /api/readyz` → `encryption:"none"`; `GET /api/service-availability` → **`"enterpriseTenancy": false`** | Certification: VERIFIED (10/10) | **NOT VERIFIED — live Enterprise plane UNAVAILABLE** (P1-04) |
| "Notification Outbox + SMTP worker + exponential retry" | `notificationOutbox.js`: `MAX_ATTEMPTS=5`, `BASE_RETRY_MS=60s`, `MAX_RETRY_MS=1h`, lease `2min`, DLQ state, Firestore transactions | `notification-outbox.test.js`, `notification-lifecycle.test.js` pass | `GET /api/readyz` → **`notificationOutbox:"DISABLED"`**; `GET /api/readyz` → `smtp:"NOT_CHECKED"` | Certification: VERIFIED (10/10), "Outbox Drained Cleanly" | **NOT VERIFIED LIVE** (P1-05) |
| Enterprise tenant garbage collection | `TENANT_GC_WORKER_ENABLED` gate; grace period 7 days | `tenant-purge-regression.test.js` passes | `GET /api/readyz` → **`tenantGc:"MANUAL_SCRIPT_ONLY"`** | Certification claims GC verified | **NOT VERIFIED LIVE** (P1-05) |
| CMS scheduler | `CMS_SCHEDULER_ENABLED` gate | `cms-scheduler.test.js` passes | `GET /api/readyz` → `cmsScheduler:"DISABLED"` | — | **VERIFIED as intentionally disabled** |
| PM2 template matches deployed environment | `ecosystem.config.js` templates `NOTIFICATION_OUTBOX_WORKER_ENABLED:'true'`, `TENANT_GC_WORKER_ENABLED:'true'`, `ENTERPRISE_ENCRYPTION_KEYS:{…}` | — | Production reports all three as unconfigured/disabled | `ecosystem.config.js` | **DISPROVED — deployment drift** (P1-05) |
| "Razorpay, Stripe … 15/15 Billing Tests Pass" | Both providers implemented | 15 billing tests pass | `GET /api/service-availability` → `razorpay:true`, **`stripe:false`**, `paypal:false`, `paytm:false`, `phonepe:false` | Certification: VERIFIED (10/10) | **PARTIALLY VERIFIED — Stripe not operational live** |
| OAuth providers | `oauth.js` resolver | `oauth.test.js`, `oauth-resolver.test.mjs` pass | `service-availability` → `github:false`, `linkedin:false` | UAT-01 claims "Google Sign-In" verified | **PARTIALLY VERIFIED** |
| AI multi-provider failover | `aiRuntime.js`: `fetchWithDeadline` timeout, per-candidate timeout, provider loop | `ai-runtime`, `ai-adversarial-and-stress`, `ai-ecosystem` pass | `readyz` → `aiProviders:"NOT_CHECKED"` | Certification: VERIFIED (10/10) | **PARTIALLY VERIFIED** |
| Backup created with SHA-256 checksums | `scripts/verify-backup-rollback.mjs` present; `create-production-freeze-backup.mjs` present | — | Repo contains only `backups/local-backup-pre-cert.tar.gz` (23,767,281 bytes) — a **local** artefact; no production backup verifiable from here | Certification: "Daily Automated Backup Dump" | **BLOCKED** (no host access) |
| **Restore verified** | — | No executed restore drill observable in-repo | No production restore evidence obtainable | Certification: "RESTORE TEST: PASS (VERIFIED)" | **NOT VERIFIED** — a backup file existing is not proof of DR |
| Platform health consoles are real, not UI-only | `platformHealth.js` (1758 lines) derives every descriptor from runtime probes; explicit comment "Nothing here is hardcoded to 'healthy'"; publishes `DISABLED`/`NOT_CONFIGURED` honestly | `platform-health-rbac.test.js` 15/15 (post-fix) | `/api/platform/operational-status` → 401 `AUTH_REQUIRED` for anonymous (correct); deeper inspection `BLOCKED` | — | **PARTIALLY VERIFIED** |
| Health endpoint honesty | Reports `DISABLED`, `NOT_CONFIGURED`, `UNAVAILABLE`, `UNKNOWN` rather than faking green | `degraded-endpoint-semantics.test.js` passes | `/api/readyz` returned `status:"ready"` **while** 3 subsystems were `DISABLED` | — | **PARTIALLY VERIFIED** (see P3-03) |

---

## 6. UAT-01 … UAT-18 automated-evidence integrity

Every path cited in `docs/UAT_READINESS_MATRIX.md` was checked for existence.

| Cited evidence file | Exists? | Verdict |
|---|---|---|
| `backend/test/ai-admin.test.js` | ✅ | valid |
| `backend/test/totp-mfa-lifecycle.test.js` | ✅ | valid |
| `scripts/verify-backup-rollback.mjs` | ✅ | valid |
| 16 × `tests/*.test.mjs` citations | ✅ | all valid |
| **`backend/test/auth-middleware.test.js`** (UAT-13, Support) | ❌ **MISSING** | **invalid citation** |
| **`backend/test/tenant-isolation.test.js`** (UAT-14, Enterprise) | ❌ **MISSING** | **invalid citation** |
| **`backend/test/tenant-quota.test.js`** (UAT-15, Enterprise AI quota) | ❌ **MISSING** | **invalid citation** |

The three missing files are precisely the evidence for the three most security-sensitive UAT
workflows: Support restrictions, Enterprise tenant isolation, and Enterprise AI quota governance.
Equivalent *coverage* does exist under other names (`enterprise-firestore-isolation.test.js`,
`tenant-adversarial.test.js`, `tenant-foundation.test.js`, `admin-rbac-contract.test.js`), so this
is a **documentation-integrity defect (P2-03)**, not an absence of testing — but the cited
evidence as written cannot be reproduced by a reviewer.

---

## 7. Summary of measured vs claimed

| Dimension | Claimed | Independently measured | Agreement |
|---|---|---|---|
| Authoritative SHA | `c49fac08…21e` | `c49fac08…21e` (HEAD, tag, `/api/healthz`, `/api/platform/version`) | ✅ |
| Authoritative SHA in docs | implied present | present in **0 of 74** docs | ❌ |
| Total tests | 676 | **919** (frozen) / **928** (post-fix) | ❌ |
| Passed | 676 | 918 (frozen) / 928 (post-fix) | ❌ |
| Failed | 0 | **1** (frozen) / 0 (post-fix) | ❌ frozen |
| Skipped / blocked / flaky | 0 / 0 / 0 | 0 / 0 / 0 | ✅ |
| Vulnerabilities | 0 | 0 (root + backend, moderate) | ✅ |
| MySQL primary | yes | yes (`engine_state.json`, engineManager default) | ✅ |
| Firestore standby | yes | code + reverse-outbox present | ✅ (code) |
| 100% parity | yes | **unmeasurable here**; gate demonstrably failed open | ❌ |
| Field-level losslessness | yes | code+tests only | ⚠️ partial |
| AES-256-GCM | yes | code yes; **live `encryption:"none"`** | ❌ live |
| Enterprise isolation | yes | tests yes; **live plane UNAVAILABLE** | ❌ live |
| Notifications | verified | tests yes; **live `DISABLED`** | ❌ live |
| Backup | verified | local artefact only | ⚠️ blocked |
| Restore | verified | **no evidence obtainable** | ❌ not verified |
| 18/18 UAT workflows | PASS | 0 independently confirmable as full PASS | ❌ |
