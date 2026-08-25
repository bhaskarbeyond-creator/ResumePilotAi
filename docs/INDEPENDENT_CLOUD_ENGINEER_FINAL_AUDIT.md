# RESUMEPILOT AI — FINAL INDEPENDENT CLOUD ENGINEER AUDIT

**Independent auditor:** Independent Cloud / Principal Engineer (acting independently of the certifying Principal Developer)
**Audit date:** 2026-08-26 (Asia/Calcutta)
**Audited release:** `c49fac08f9dcfcee53a333a0e999050735d3821e`
**Release tag:** `uat-release-2026-08-26`
**Production:** `https://airesume.projectdemo.guru`
**Remediation branch:** `arena/01a03aa4-resumepilotai`

---

## 1. Executive verdict

### 🔴 NOT READY FOR UAT

The Principal Developer's certification is **PARTIALLY AGREED — and DISAGREED on its central claims.**

The release *identity* is genuinely sound: HEAD, the annotated tag, `/api/healthz` and
`/api/platform/version` all agree on the exact 40-character SHA. The codebase is unusually
disciplined — zero `TODO`/`FIXME`/`HACK` markers, zero npm vulnerabilities at moderate severity, a
clean lint exit, a successful build, and a health engine that honestly reports `DISABLED` rather
than faking green. The Enterprise encryption is real AES-256-GCM envelope cryptography with a
genuinely fail-closed posture. That is all confirmed with evidence.

But the certification's headline claims do not survive independent verification:

1. **"676/676 tests, 0 failed" is false.** The frozen release had **1 failing test**. Measured
   totals are 919 tests across all suites (688 via `npm test`), not 676 — the tally omits the
   286-test backend integration suite, which is exactly where the failure lived.
2. **Three P1 defects were reproduced and proven**, two of which defeat the invariants the
   certification certifies: the database-switch parity gate **failed open** (authorising a switch
   with Firestore down and parity never measured), the monotonic revision guard **failed open**
   (allowing a stale event to regress data), and the database-engine switch was reachable by a
   **plain ADMIN** with no Super Admin role and no TOTP — contradicting UAT-16's stated
   "Super Admin + TOTP" precondition.
3. **Live production does not match the release artefact.** `/api/readyz` reports
   `encryption:"none"`, `notificationOutbox:"DISABLED"`, `tenantGc:"MANUAL_SCRIPT_ONLY"`;
   `/api/service-availability` reports `enterpriseTenancy:false`. The Enterprise plane is
   **UNAVAILABLE** in production and **no worker drains the notification outbox**. The committed
   `ecosystem.config.js` templates all of these as enabled — this is deployment drift.
4. **Documentation is stale**: the authoritative SHA appears in **0 of 74** documents, and three
   UAT evidence citations point to files that do not exist.

Per Rule 29, a P1 finding requires certification to stop. Three P1s were fixed on a controlled
branch with regression tests; two remain open because they require production host access this
audit does not have. **The fixes are not deployed — production still runs the audited SHA and still
contains P1-01/02/03.**

| Gate | Result |
|---|---|
| Exact SHA verified | ✅ PASS |
| Release tag verified | ✅ PASS |
| Clean working tree (at audit start) | ✅ PASS |
| Build verified | ✅ PASS (5.00s, exit 0) |
| Tests verified | ❌ FAIL as shipped (1 failure); ✅ PASS post-fix (928/928) |
| Security verified | ✅ PASS (0 vulns, 28/28 security tests) |
| Secrets verified | ✅ PASS |
| Database verified | ⚠️ PARTIAL (code+test only) |
| Firestore verified | ⚠️ PARTIAL |
| Field parity verified | ❌ NOT VERIFIED live |
| Bidirectional sync verified | ❌ FAIL pre-fix (P1-03) |
| Database switch verified | ❌ FAIL pre-fix (P1-01, P1-02) |
| User verified | ⚠️ PARTIAL |
| Employer verified | ⚠️ PARTIAL |
| Support verified | ✅ PASS (independently re-proven) |
| Enterprise verified | ❌ FAIL (live plane UNAVAILABLE) |
| Super Admin verified | ❌ FAIL pre-fix (P1-01) |
| Payments verified | ⚠️ PARTIAL (Stripe not operational live) |
| Notifications verified | ❌ FAIL (live worker DISABLED) |
| AI verified | ⚠️ PARTIAL |
| Control Plane verified | ⚠️ PARTIAL |
| Self-healing verified | ⚠️ PARTIAL |
| Backup verified | ⚠️ PARTIAL (Enterprise plane ✅ in test; production dump BLOCKED) |
| Restore verified | ⚠️ PARTIAL (Enterprise plane ✅ in test incl. catastrophic-loss drill; MySQL restore NOT VERIFIED) |
| DR verified | ⚠️ PARTIAL (Enterprise DR drill ✅ 6/6; production-scale DR NOT VERIFIED) |
| Production verified | ❌ FAIL (config drift) |
| UAT-01..18 verified | ❌ FAIL (0 fully confirmable) |
| No P0 | ✅ PASS (0 found) |
| No P1 | ❌ FAIL (5 found; 3 fixed, 2 open) |
| No UAT-blocking defect | ❌ FAIL |

---

## 2. Release identity

| Artefact | Value | Match |
|---|---|---|
| `git rev-parse HEAD` | `c49fac08f9dcfcee53a333a0e999050735d3821e` | ✅ |
| `git rev-parse uat-release-2026-08-26^{commit}` | `c49fac08f9dcfcee53a333a0e999050735d3821e` | ✅ |
| Annotated tag object | `b19579f34d4502b3957e4cfdc37b25db452f77ea` → commit `c49fac08…21e` | ✅ |
| Tag message | "Final 10/10 Production & UAT Certification Release" | — |
| `GET /api/healthz` | `{"status":"ok","firebaseAdminConfigured":true,"commitSha":"c49fac08f9dcfcee53a333a0e999050735d3821e"}` | ✅ |
| `GET /api/platform/version` | `{"commitSha":"c49fac08f9dcfcee53a333a0e999050735d3821e","service":"resumepilot-backend","apiVersion":"platform-v2"}` | ✅ |
| Working tree at audit start | `git status --porcelain` → empty | ✅ |
| Certification documents | `grep -rl c49fac08…21e docs/*.md` → **0 of 74 files** | ❌ |
| Commit history | `is-shallow-repository` → `true`; `rev-list --count HEAD` → `1`; parent `4fdb56f3b329d656263c6a0fb6fe657a668ad2d9` absent | ⚠️ BLOCKED |

**Conclusion:** code, tag and live deployment agree exactly. **Documentation does not.** Production
is *not* stale and the tag is *not* stale; the documents are (GAP P2-04). The shallow clone blocks
history-dependent forensics (bisecting when a defect was introduced, confirming no untagged
production hotfix) — recorded as BLOCKED, not converted to PASS.

---

## 3. Code audit

Scope: entire repository — 2,566 files; `backend/` 177 files; `src/`, `scripts/`, `tests/` (112 test files).

**Clean findings:**
- `TODO`/`FIXME`/`HACK`/`XXX` across `backend src scripts tests`: **5 hits, all false positives** (the literal `xxx` inside placeholder emails and an ATS stop-word list). Genuine debt markers: **zero**.
- `npm audit --audit-level=moderate`: **0 vulnerabilities** (root and backend).
- `npm run lint`: exit 0, **788 warnings, 0 errors**.
- `npm run build`: exit 0, built in 5.00s.
- No hardcoded production credentials: `.env.example` and `ecosystem.config.js` contain placeholders only.

**Silent-catch review.** 71 empty `catch (_) {}` blocks repo-wide. Sampled across `syncManager`,
`index.js`, `MySQLRepository`, `platform.js` and `aiRuntime`: the majority guard best-effort
telemetry, lease release and optional JSON parsing — defensible. **Three were genuinely dangerous
and all three were reproduced and fixed** (P1-02 ×2, P1-03 ×1). This is the single most productive
line of enquiry in the whole audit: the fail-open defects were hiding inside idiomatic
"best-effort" error handling.

**Dead code found:** `requireSuperAdmin` was imported into `databaseAdmin.js` and never called — the
direct cause of P1-01. An unused import in a security router is a meaningful signal.

---

## 4. Architecture ↔ implementation reconciliation

| Architecture claim | Implementation reality | Verdict |
|---|---|---|
| Dual database engine, MySQL primary + Firestore standby | Real: `engineManager`, `syncManager`, `sync_outbox` + `sync_outbox_fs`, lease-based workers | **REAL** |
| Bidirectional sync with monotonic revision guard | Real, but guard covered only `resumes` and failed open on read error | **PARTIAL** (P1-03 fixed, P2-05 open) |
| Firestore-native Enterprise plane, path-partitioned | Real: `tenants/{uuid}/…`, `assertContext`, fail-closed encryption | **REAL** (but not configured live) |
| AES-256-GCM Enterprise encryption | Real envelope encryption with key versioning; **provider is `null` in production** | **REAL code / DEAD in production** |
| Notification outbox with worker, retry, DLQ | Real implementation; **worker disabled in production** | **REAL code / DEAD in production** |
| Control Plane consoles | `platformHealth.js` (1,758 lines) derives every descriptor from live probes | **REAL** (authenticated depth BLOCKED) |
| Self-healing / automation | Runbooks and policy documented; autonomous scope not exercisable here | **PARTIAL** |
| 12 SRE runbooks | Documented in `docs/CONTROL_PLANE_RUNBOOK_CATALOG.md` | **DOCUMENTED** |

No UI-only or mocked console was identified in the code reviewed. The health engine contains an
explicit integrity statement — *"Nothing here is hardcoded to 'healthy', no counter is invented, and
an unreadable source is reported as UNKNOWN rather than zero"* — and the live responses corroborate it.

---

## 5. Database audit

- Active engine: **MySQL**, per `engineManager.getActiveEngine()` default and committed
  `engine_state.json` (`{"engine":"mysql","previousEngine":"firestore"}`).
- Switch is explicit-only: `POST /api/admin/database-settings` with `force` for emergency failover.
  No automatic promotion path exists.
- In-process switch mutex `switchInProgress`; concurrent attempt → **409 `already in progress`**,
  asserted by `database-switch-safety.test.mjs` test 6.
- **Defect found and fixed:** the parity gate (P1-02) failed open.
- **Defect found and fixed:** authorization (P1-01) permitted ADMIN.
- Note: the in-process mutex is single-instance safe only. `ecosystem.config.js` sets
  `instances: 1`, and the code documents that a multi-instance deployment needs the
  `database_engine_state` switch lock. Correct as shipped, but a scaling trap.

## 6. Firestore audit

- Firestore-native Enterprise plane preserved: `tenantCollection()` → `tenants/${assertUuid(tenantId)}/${name}`.
- Tenant context mandatory: `assertContext()` throws `TENANT_CONTEXT_REQUIRED` (403) without both `tenantId` and `principalId`.
- Scope enforcement: `assertResourceInScope()` treats the tenant boundary as absolute and applies the workspace boundary for workspace-scoped contexts.
- Cross-tenant isolation tested by `enterprise-firestore-isolation.test.js`, `tenant-adversarial.test.js`, `tenant-foundation.test.js` — all pass within the 187-test enterprise suite.
- **No migration, flattening or weakening** of Firestore-native Enterprise data was found. The Firestore preservation requirement is satisfied in code.
- **Live caveat:** with `encryption:"none"`, the encrypted data-plane paths are inoperative in production (P1-04).

## 7. Field parity audit

`FIRESTORE_MYSQL_FIELD_LEVEL_RECONCILIATION.md` asserts 35 collections → 28 tables with zero
missing replicated fields. Code support is real (`calculateContentHash()` canonical SHA-256,
`computeContinuousParity()`), and 21/21 parity tests pass.

**Status: NOT VERIFIED at field level.** This audit had no database access, so per-collection
field-level comparison (IDs, timestamps, nested JSON, financial subunits, GST fields, revision,
content hashes) could not be independently performed. Document-and-table counts were explicitly not
treated as evidence. Additionally the *gate* that asserts 100% parity was itself broken (P1-02),
which undermines reliance on it.

## 8. Sync audit

Both directions exist and are exercised: `replicateToFirestore` / `replicateToMySQL`,
`processSyncQueue` (MySQL→Firestore) and `processFirestoreOutbox` (`sync_outbox_fs`, Firestore→MySQL).

Verified: lease reclaim for stale `PROCESSING` rows (>120s → `RETRYING`), retry counting,
dead-letter at `max_retries`, content-hash comparison, retention pruning (7 days).

**Where events could be silently lost — found and fixed:** P1-03. A stale event whose guard read
failed was written anyway and then marked `SYNCED`, making the regression invisible. Post-fix the
error propagates to the existing retry/DLQ path.

**Residual (P2-05):** the revision guard covers only `resumes`. `users`, `portfolios`, `covers`,
`settings` and `payment_orders` replicate without revision comparison.

## 9. Database switch audit

Pre-fix, the switch violated three of the required preconditions:

| Required | Pre-fix | Post-fix |
|---|---|---|
| 100% parity (measured) | ❌ assumed 100% on probe failure | ✅ 0 + block reason |
| Zero pending events | ✅ enforced | ✅ |
| Zero conflicts | ✅ enforced | ✅ |
| Zero dead letters | ✅ enforced (both outboxes) | ✅ |
| Target database health | ⚠️ not part of the gate | ⚠️ unchanged |
| Authorization (Super Admin) | ❌ ADMIN permitted | ✅ SUPER_ADMIN + MFA + recent auth |
| Mutex | ✅ 409 on concurrency | ✅ |
| Audit | ✅ `switchedBy`, `switchedAt` persisted | ✅ |

Rollback: `previousEngine` is persisted, enabling manual revert. Emergency failover remains explicit
(`force:true`, recorded as `EMERGENCY_FAILOVER(actor)`). No unrestricted automatic promotion exists.
Split-brain is prevented by the single-instance assumption plus the in-process mutex — adequate as
deployed, fragile if scaled.

## 10. Security audit

Verified with evidence: constant-time comparison (`crypto.timingSafeEqual` with length check) for
Razorpay signatures; Stripe `constructEvent` over a raw body with `express.raw()` mounted before
`express.json()`; amount/currency validation in subunits for Razorpay, PayPal and Paytm; TOTP MFA
gating Super Admin destructive ops; server-side `auth_time` step-up; a credential scanner with
regression tests for a prior `remote.env` incident; XSS sink centralisation tests; path-traversal
test (`safe-internal-path.test.mjs`).

**Privilege escalation: found and fixed (P1-01).** Independent rate-limiting, CSRF, IDOR and
injection testing beyond the existing suites was **not** performed — recorded as BLOCKED rather
than inferred from the presence of `helmet` and `express-rate-limit`.

## 11. User audit / 12. Employer audit

Both are covered by passing automated suites (`resume-workflow`, `resume-persistence`,
`profile-workflow`, `profile-concurrency`, `job-tracker`, `portfolio-*`, `interview-coach-*`,
`ats-score*`, `employer-lifecycle`, `account-isolation`). API-level authorization for protected
operations is asserted in those suites.

**Live authenticated verification: BLOCKED** — the audit sandbox holds no user or employer
credentials. Employer-A-cannot-access-Employer-B isolation is therefore verified in test, not live.

## 13. Support audit

**Independently re-proven.** `SUPPORT` holds only `users.read`, `email.logs.read`, `tenants.read`,
`tickets.manage` — no `system.config.write`, no `tenants.write`, no `system.config.*` mutation.

Measured through the real middleware: `POST /api/admin/database-settings` with a SUPPORT token →
**HTTP 403 FORBIDDEN**. Post-fix this holds for every destructive route. `platform-health-rbac.test.js`
confirms SUPPORT is denied the platform health control plane (403).

Enforcement is **API-level, not merely hidden UI buttons**. ✅ **VERIFIED.**

Note: UAT-13's cited evidence file `backend/test/auth-middleware.test.js` does not exist (P2-03),
so the *documented* evidence was invalid even though the underlying control is real.

## 14. Enterprise audit

Two-tenant adversarial isolation is genuinely tested (`enterprise-pilot-e2e`, `tenant-adversarial`,
`enterprise-firestore-isolation`) and passes in the 187-test suite, with the encryption key
configured *in test*.

**Live: UNAVAILABLE (P1-04).** Production reports `encryption:"none"` and
`enterpriseTenancy:false`; encrypted resource operations fail closed with 503. Tenant provisioning,
suspension, restoration, deletion and GC could not be exercised live. **NOT VERIFIED live.**

## 15. Super Admin audit

Firebase JWT verification, role authorization, TOTP enforcement (`SUPER_ADMIN_MFA_REQUIRED`) and
recent-authentication requirements are all real and tested. Audit logging is present
(`admin_audit_logs`).

**Privilege escalation found and fixed (P1-01).** The database control plane was the gap: it was
the one privileged surface missing its Super Admin guard.

## 16. Payment audit

Razorpay HMAC-SHA256 with constant-time comparison; Stripe webhook authenticity via
`constructEvent`; PayPal/Paytm/PhonePe order, amount and currency validation; internal order
binding assertions (`ORDER_BINDING_MISMATCH`); allowed-state whitelists.

**Live:** `service-availability` → `razorpay:true`, `stripe:false`, `paypal:false`. The
certification's "Razorpay, Stripe … VERIFIED (10/10)" is only partly true in production.
No real-money testing was performed. Sandbox webhook and duplicate-webhook behaviour: **BLOCKED**.

## 17. Notification audit

Real transactional outbox: `queueEmailInTransaction` writes inside the caller's transaction,
deterministic `outboxId = sha256(channel\0eventId)` gives idempotency, lease-based claim
(`LEASE_MS = 2min`), `MAX_ATTEMPTS = 5`, exponential backoff `60s·2^(n-1)` capped at 1h, terminal
`DEAD_LETTER` state, tenant-context re-authorization that fails closed.

**Live: worker DISABLED (P1-05).** Nothing drains the queue in production, so delivery cannot occur.
**No jitter (P3-02)** — a bulk outage would synchronise retries.

## 18. AI audit

`aiRuntime.js` implements provider selection with ordered fallback, per-request deadlines
(`fetchWithDeadline`, `AI_PROVIDER_TIMEOUT`), a reduced timeout for non-final candidates (6s), and
JSON-repair fallbacks. Quota and entitlement enforcement is deterministic
(`adminAiEntitlement.js`, `unified-entitlements.test.js` — 276 assertions pass), so AI cannot bypass
authorization. Live provider configuration is reported `NOT_CHECKED`; no circuit breaker was
identified (retries are per-request, not stateful) — recorded as an observation, not a defect.

## 19. Control Plane audit

`platformHealth.js` publishes ~40 service descriptors (`backend-api`, `database`/`firestore`,
`authentication`, `encryption`, `enterprise-tenancy`, `consumer-platform`, `admin-platform`,
`super-admin-platform`, `email-smtp`, `notification-dispatcher`, OAuth providers, `payments-*`,
`twilio-sms`, `naukri-ingestion`, `cloudflare`, `ai-providers`, `backend-process`,
`notification-outbox`, `queue`, `dlq`, `enterprise-outbox`, `background-workers`, `scheduled-jobs`,
`cache`, `object-storage`, `pdf-service`), each with state, configuration posture, reason,
dependency, retryability, error category, remediation text and affected features/APIs/UI modules.

**Classification: REAL / FULLY OPERATIONAL at the engine layer.** Secrets never cross the boundary
(only booleans, non-secret hostnames, provider names, counts) — asserted by
`platform-health-rbac.test.js` test 12. Anonymous access correctly returns 401 `AUTH_REQUIRED`
(observed live). Deeper console-by-console verification is **BLOCKED** without Super Admin
credentials.

## 20. Self-healing audit

Policy and runbook documentation exist (`CONTROL_PLANE_AUTOMATION_POLICY.md`,
`CONTROL_PLANE_SELF_HEALING_ARCHITECTURE.md`, `CONTROL_PLANE_FAILURE_MATRIX.md`). Bounded
automation is evidenced by the switch mutex, retry caps (`max_retries`, `MAX_ATTEMPTS = 5`),
lease expiry and drain-loop iteration caps (`iterations < 10`, `reverseIterations < 10`).
Destructive operations are human-gated and, post-fix, Super Admin-gated.

No evidence was found of AI holding SQL, shell or filesystem authority. Autonomous *execution*
could not be observed live: **PARTIALLY VERIFIED.**

## 21. Backup / restore / DR audit

**Correction to an earlier statement in this audit.** An initial reading recorded restore as
"NOT VERIFIED — no executed restore drill observable in-repo". That was wrong, and the corrected
finding follows.

`scripts/verify-backup-rollback.mjs` exists but is a **deploy-readiness** verifier, not a database
backup verifier: it checks that a backup artefact exists, is recent (`MAX_BACKUP_AGE_MIN`, default
120) and non-trivial (`MIN_BACKUP_BYTES`, default 1024), and that `ROLLBACK_SHA` resolves and is an
ancestor of `HEAD`. It performs no checksum verification and explicitly does not roll back.

The real backup/restore machinery is `backend/enterprise/enterpriseBackup.js`, and it is genuinely
tested — **6/6 passing**, including a catastrophic-loss drill:

```
ok - tenant snapshot export includes partition tree and control plane with verified checksums
ok - snapshot tampering is detected by checksum verification
ok - restore: dry-run performs zero writes, apply restores, and rollback re-applies the previous snapshot
ok - restore refuses documents that do not belong to the snapshot tenant
ok - Disaster Recovery: full tenant snapshot, catastrophic loss, and verified restore
ok - Disaster Recovery: partial-failure recovery — re-running restore is idempotent
```

This covers snapshot → simulated catastrophic loss → verified restore → reconciliation, SHA-256
checksum verification, tamper detection, dry-run with zero writes, rollback re-applying the previous
snapshot, idempotent re-run after partial failure, and cross-tenant document refusal. That is real
DR verification, not a mock.

**Corrected statuses:**

| Layer | Status |
|---|---|
| Enterprise tenant-plane **BACKUP** with SHA-256 checksums | ✅ **VERIFIED** (test) |
| Enterprise tenant-plane **RESTORE** incl. catastrophic-loss drill, rollback, idempotency | ✅ **VERIFIED** (test) |
| Production daily automated dump | ⚠️ **BLOCKED** (no host access; only local `backups/local-backup-pre-cert.tar.gz`, 23,767,281 bytes, is observable) |
| Production-scale MySQL/`mysqldump` **RESTORE** drill with schema + FK + application-startup validation | ❌ **NOT VERIFIED** |

The certification's unqualified "RESTORE TEST: PASS (VERIFIED)" is therefore **overstated rather
than false**: it holds for the Enterprise plane and is unproven for the MySQL primary. UAT-18's
citation of `verify-backup-rollback.mjs` for "SHA-256 integrity" points at the wrong mechanism
(GAP P2-03).

## 22. Deployment / PM2 audit

`ecosystem.config.js`: single forked instance, `max_memory_restart 600M`, `autorestart`,
`max_restarts 10`, `restart_delay 4000`. Sensible and matches the documented single-instance
assumption that the switch mutex depends on.

**Deployment drift confirmed (P1-05):** the template enables the notification worker, tenant GC and
encryption keys; production reports all three unconfigured/disabled. Secrets are placeholders in
the template (correct). `engine_state.json` being tracked in git is a drift hazard (P3-01).

## 23. Test audit

Forensic review of the claimed battery, measured with the project's own runner.

| Suite | Claimed | Measured (frozen) | Measured (post-fix) |
|---|---|---|---|
| Security static (4 files) | 28 | **28 / 28 / 0** | 28 / 28 / 0 |
| `backend/test/*.test.js` | *omitted* | **286 / 285 / 1 FAIL** | **295 / 295 / 0** |
| `test:product` | 362 | **374 / 374 / 0** | 374 / 374 / 0 |
| `test:db-parity` | 27 | **21 / 21 / 0** | 21 / 21 / 0 |
| Enterprise (backend + UI) | 210 | **187 + 23 = 210 / 0** | 210 / 0 |
| Export (5 files) | 49 | **38 / 38 / 0** | 38 / 38 / 0 |
| **TOTAL** | **676** | **919 / 918 / 1 FAIL** | **928 / 928 / 0** |

- **PASSED:** 918 (frozen) → 928 (post-fix)
- **FAILED:** 1 (frozen) → 0 (post-fix)
- **SKIPPED:** 0 · **CANCELLED:** 0 · **TODO:** 0 · **BLOCKED:** 0 · **FLAKY:** 0 (the failure was deterministic across 3 runs)

**Tests providing false confidence — the central test-suite finding:** the three P1 defects sat in
code paths with **no negative-path coverage**. No test asked what happens when the parity probe
throws, when the revision-guard read throws, or when a plain ADMIN calls the switch. The suites were
broad and genuine (real assertions, real persistence, real authorization, adversarial tenant cases)
but systematically optimistic about infrastructure failure. That single blind spot accounts for all
three P1s.

## 24. UAT audit (UAT-01 … UAT-18)

`BLOCKED` denotes authenticated live verification this audit could not perform. No workflow is
marked PASS from documentation alone.

| ID | Role / Feature | Automated evidence (verified to exist & pass) | Live evidence | Status |
|---|---|---|---|---|
| UAT-01 | Candidate — Authentication | ✅ `account-lifecycle-regression` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-02 | Candidate — Resume builder / templates | ✅ `resume-workflow`, `template-render` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-03 | Candidate — AI summary | ✅ `admin-ai-settings`, `ai-admin` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-04 | Candidate — PDF/DOCX export | ✅ `docx-client-journey`, `template-quality-gate` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-05 | Candidate — Public WebCV | ✅ `public-discovery` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-06 | Candidate — Portfolio | ✅ `portfolio-templates`, `portfolio-data` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-07 | Candidate — Cover letter AI | ✅ `cross-module-journeys` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-08 | Candidate — Job tracker Kanban | ✅ `job-tracker` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-09 | Candidate — AI interview coach | ✅ `interview-coach-lifecycle` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-10 | Employer — Company profile | ✅ `employer-lifecycle` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-11 | Employer — Job posting | ✅ `employer-lifecycle` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-12 | Employer — Applicant review + email | ✅ `employer-lifecycle` | ❌ notification worker DISABLED live | **FAIL (live)** |
| UAT-13 | Support — read-only diagnostics | ⚠️ cited `auth-middleware.test.js` **missing**; independently re-proven 403 on DB switch | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-14 | Enterprise — tenant provisioning | ⚠️ cited `tenant-isolation.test.js` **missing**; equivalent suites pass | ❌ `enterpriseTenancy:false` live | **NOT VERIFIED** |
| UAT-15 | Enterprise — AI quota governance | ⚠️ cited `tenant-quota.test.js` **missing** | ❌ Enterprise plane UNAVAILABLE | **NOT VERIFIED** |
| UAT-16 | Super Admin — database failover gate | ✅ cited tests exist & pass — **but gate failed open (P1-02) and ADMIN was authorised (P1-01)** | ❌ fixes not deployed | **FAIL** |
| UAT-17 | Super Admin — operator mgmt / revocation | ✅ `totp-mfa-lifecycle` | BLOCKED | **PARTIALLY VERIFIED** |
| UAT-18 | Platform — DR backup & integrity | ✅ Enterprise DR drill 6/6 (snapshot→loss→restore, checksums, tamper detection, rollback, idempotency); ⚠️ cited `verify-backup-rollback.mjs` verifies artefact age/size + git SHA, **not** SHA-256 integrity | ❌ no production MySQL restore evidence | **PARTIALLY VERIFIED** |

**Result: 0 PASS · 13 PARTIALLY VERIFIED · 2 FAIL (UAT-12, UAT-16) · 3 NOT VERIFIED (UAT-14, UAT-15, and UAT-13 whose cited evidence is missing though the control itself was independently re-proven).**
The claimed "18/18 PASS, 0 failed, 0 blocked" is **disproved**.

## 25. Performance audit

No load, latency, throughput, memory or connection-pool measurement could be performed from this
sandbox; production host metrics are inaccessible. The certification's "0% CPU, 172.6MB RAM" is a
single observation and is not evidence of sustained performance — the certification itself presents
it as a point-in-time reading.

Identifiable *structural* risks: polling-based workers (`ENTERPRISE_OUTBOX_INTERVAL_MS=15000`,
sync poll 3000ms) rather than push; a single PM2 instance as a throughput ceiling and as the sole
holder of the switch mutex; no jitter in notification retry (P3-02); 500 kB+ bundle chunks flagged
by the build. **PERFORMANCE: NOT VERIFIED.**

## 26. Failure / chaos review

| Scenario | Detection | Containment | Recovery | Verified |
|---|---|---|---|---|
| Firestore outage during switch | ❌ none pre-fix — parity assumed 100% | ❌ switch authorised | — | **Reproduced (P1-02), fixed** |
| Stale/replayed sync event + read error | ❌ none pre-fix | ❌ data regressed | ❌ marked SYNCED | **Reproduced (P1-03), fixed** |
| Worker crash mid-event | ✅ lease >120s reclaimed → RETRYING | ✅ | ✅ | VERIFIED (code+test) |
| Poison event | ✅ `max_retries` → DEAD_LETTER | ✅ | ✅ admin replay route | VERIFIED (code+test) |
| Queue surge | ✅ batch caps, drain-loop iteration caps | ✅ | ✅ | VERIFIED (code) |
| Notification provider failure | ✅ backoff + DLQ | ⚠️ no jitter | ⚠️ no worker live | PARTIAL |
| MySQL outage | ✅ ping probe → UNAVAILABLE | ✅ | ✅ | VERIFIED (code) |
| AI provider 429/503 | ✅ timeout + fallback chain | ✅ | ✅ | VERIFIED (code+test) |
| Enterprise encryption key missing | ✅ health engine reports it | ✅ fail-closed 503 | ⚠️ manual config | VERIFIED (live) |
| Concurrent switch | ✅ 409 `already in progress` | ✅ | ✅ | VERIFIED (test) |
| Payment webhook failure / duplicate | ✅ signature + idempotency | ✅ | ⚠️ | PARTIAL (BLOCKED live) |
| Audit-log read failure | ✅ reported as `auditSource:'unavailable'`, best-effort | ✅ | ✅ | VERIFIED (code) |

## 27. SWOT — Control Plane

**STRENGTHS**
- **Honest health engine (HIGH value).** ~40 descriptors derived from live probes with explicit refusal to fake green; unreadable sources reported `UNKNOWN`. Live responses corroborate the code. *Evidence:* `platformHealth.js` + `/api/readyz` truthfully reporting `DISABLED`.
- **Fail-closed security posture.** Encryption, tenant context and notification tenant re-authorization all fail closed. *Evidence:* `sealPayload` 503; `assertContext` 403.
- **Strong release identity discipline.** SHA matches across code, tag and two live endpoints.
- **Clean engineering hygiene.** 0 debt markers, 0 vulnerabilities, 0 lint errors, clean build.
- **Real cryptography.** AES-256-GCM envelope encryption with key versioning and honest `managedKms:false` self-description.

**WEAKNESSES**
- **Fail-open error handling in critical gates (P1, HIGH impact).** Three P1s traced to swallowed exceptions. *Mitigation:* fixes applied; add lint/test policy requiring justification for empty catches in `backend/database`.
- **No negative-path coverage for infrastructure failure (HIGH impact).** Root cause of all three P1s. *Mitigation:* 9 regression tests added; extend the pattern to remaining gates.
- **Configuration drift between artefact and production (P1).** *Mitigation:* add a startup assertion that fails readiness when a template-declared worker is unconfigured.
- **Single-instance dependency (MEDIUM).** The switch mutex is in-process. *Mitigation:* implement the documented `database_engine_state` cross-process lock before scaling.
- **Documentation drift (P2).** Authoritative SHA in 0/74 docs; 3 invalid evidence citations. *Mitigation:* generate the SHA and test counts into the certification from CI.

**OPPORTUNITIES**
- Startup configuration contract validation (would have caught P1-04/P1-05 immediately).
- Jitter in notification retry; circuit breaker for AI providers.
- Extend the revision guard to all replicated entity types (P2-05).
- Cross-process switch lock to unlock horizontal scaling.
- CI gate that fails when a certification document's cited test files do not exist.

**THREATS**
- **Un-deployed P1 fixes (HIGH).** Production still runs the audited SHA containing P1-01/02/03.
- **Silent data loss during a Firestore blip** if a switch or replication occurs pre-fix.
- **Undelivered notifications** degrading UAT-12 and user trust.
- **Enterprise UAT cannot proceed** until encryption keys are configured.
- **Single-instance SPOF** for both availability and switch safety.

## 28. Evidence matrix

See **`docs/INDEPENDENT_CLOUD_ENGINEER_EVIDENCE_MATRIX.md`** (mandatory deliverable, produced in this audit).

## 29. Gap register

See **`docs/INDEPENDENT_CLOUD_ENGINEER_GAP_REGISTER.md`** (mandatory deliverable, produced in this audit).

Summary: **0 P0 · 5 P1 (3 fixed, 2 open-blocked) · 5 P2 (1 fixed) · 3 P3.**

## 30. Final decision

### 🔴 NOT READY FOR UAT

**PRINCIPAL DEVELOPER CERTIFICATION: PARTIALLY AGREED / DISAGREED on central claims.**

Agreed: release identity, MySQL-primary architecture, Firestore-native Enterprise design, security
test coverage, zero vulnerabilities, clean build, Support RBAC, payment signature handling, the
quality of the health engine, and — on correction during this audit — the Enterprise backup/restore
and DR implementation, which is genuinely tested (6/6, including a catastrophic-loss drill with
SHA-256 checksums, tamper detection, dry-run, rollback and idempotency).

Disagreed: "676/676 tests, 0 failed"; "100% parity"; "Monotonic revision guard"; "Super Admin + TOTP
database switch"; "AES-256-GCM encryption verified" as a *live* property; "Enterprise verified";
"Notifications verified"; "Restore verified" as an unqualified platform property; and "18/18 UAT
workflows PASS".

**Required before UAT can be certified:**

1. Deploy the `arena/01a03aa4-resumepilotai` fixes through the release process, then verify the new
   SHA at `/api/healthz` and `/api/platform/version`, and re-run the affected verification.
2. Configure `ENTERPRISE_ENCRYPTION_KEYS` in production; confirm `/api/readyz` reports
   `encryption:"server-key"` and `/api/service-availability` reports `enterpriseTenancy:true` (P1-04).
3. Reconcile production workers with `ecosystem.config.js`; confirm `notificationOutbox` and
   `tenantGc` are no longer `DISABLED` / `MANUAL_SCRIPT_ONLY` (P1-05).
4. Re-issue the certification documents with the correct SHA, correct test counts, and valid
   evidence citations (P2-02, P2-03, P2-04).
5. Perform a **production-scale MySQL** restore drill with schema, foreign-key and
   application-startup verification before claiming platform-wide DR. The Enterprise tenant-plane
   DR drill is already verified (6/6) and does not need repeating.
6. Re-verify UAT-12, UAT-14, UAT-15 and UAT-16 live with real credentials.

Post-UAT (non-blocking, do not gate UAT): P2-05 revision-guard coverage, P3-01 tracked engine state,
P3-02 retry jitter, P3-03 readiness semantics.
