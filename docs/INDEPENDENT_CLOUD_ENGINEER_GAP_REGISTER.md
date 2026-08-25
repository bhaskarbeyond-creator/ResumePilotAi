# RESUMEPILOT AI — INDEPENDENT CLOUD ENGINEER GAP REGISTER

**Audited release:** `c49fac08f9dcfcee53a333a0e999050735d3821e` (`uat-release-2026-08-26`)
**Remediation branch:** `arena/01a03aa4-resumepilotai` (controlled branch, branched from the audited SHA)
**Register date:** 2026-08-26

Severity scale: **P0 CRITICAL** · **P1 HIGH** · **P2 MEDIUM** · **P3 LOW** · **NON-BLOCKING** · **NOT A DEFECT**

Every defect below was reproduced against real code. Nothing is recorded speculatively, and items
that look like defects but are defensible design are listed under **NOT A DEFECT** with reasoning.

| ID | Severity | Title | State |
|---|---|---|---|
| P1-01 | P1 HIGH | Plain ADMIN could switch the production database engine and run destructive DB admin | **FIXED + regression-tested** (not deployed) |
| P1-02 | P1 HIGH | Database-switch parity gate fails **open** when the parity probe cannot run | **FIXED + regression-tested** (not deployed) |
| P1-03 | P1 HIGH | Monotonic revision guard fails **open**, allowing stale-event data regression | **FIXED + regression-tested** (not deployed) |
| P1-04 | P1 HIGH | Live production Enterprise plane is UNAVAILABLE (encryption keys unconfigured) | **OPEN — BLOCKED on production access** |
| P1-05 | P1 HIGH | Live production worker/feature configuration drifts from the committed PM2 template | **OPEN — BLOCKED on production access** |
| P2-01 | P2 MEDIUM | Frozen release shipped with 1 failing test; "0 failed" certification claim false | **FIXED** (test corrected) |
| P2-02 | P2 MEDIUM | Certified test count (676) does not match reality; 286-test backend suite omitted from the tally | **OPEN** (documentation) |
| P2-03 | P2 MEDIUM | Three UAT evidence citations point to files that do not exist | **OPEN** (documentation) |
| P2-04 | P2 MEDIUM | Authoritative release SHA appears in none of the 74 documents | **OPEN** (documentation) |
| P2-05 | P2 MEDIUM | Revision guard protects only the `resumes` entity type | **OPEN** (post-UAT) |
| P3-01 | P3 LOW | `engine_state.json` is tracked in git and mutated by the test suite | **OPEN** (post-UAT) |
| P3-02 | P3 LOW | Notification retry uses exponential backoff without jitter | **OPEN** (post-UAT) |
| P3-03 | P3 LOW | `/api/readyz` reports `status:"ready"` while three subsystems are DISABLED | **OPEN** (post-UAT) |

---

## P1-01 — Missing SUPER_ADMIN / step-up authorization on the database-engine switch

**Severity:** P1 HIGH (privilege escalation on a destructive production operation)

**Claim disproved:** UAT-16 preconditions state *"Super Admin + TOTP"* for the database failover gate.

**Evidence.** `backend/routes/databaseAdmin.js` imported `requireSuperAdmin` but never called it.
The only guard on the whole router was:

```js
router.use(requirePermission('system.config.write'));
```

`backend/security/auth.js` grants `system.config.write` to the **ADMIN** role, not only
`SUPER_ADMIN`. The router is mounted at `/api/admin/database-settings` (`backend/index.js:315`).

**Reproduction** (real HTTP through the real Express middleware, pre-fix):

```
SUPPORT  -> HTTP 403 "FORBIDDEN"          (positive control: RBAC works)
ADMIN    -> HTTP 400 "INVALID_ENGINE"     (authorisation PASSED, handler executed)
ADMIN initialize-schema -> HTTP 500       (handler ran; attempted real MySQL connect)
```

The 400 is decisive: authorization succeeded and the handler performed its own input validation.
`initialize-schema` returned 500 only because no MySQL exists in the audit sandbox — i.e. the
destructive path was genuinely reached.

**Impact.** Any ADMIN-role account — without Super Admin role, without TOTP, without recent
re-authentication — could switch the live primary database engine, re-initialize the production
schema, prune the sync outbox, or replay dead letters.

**Fix applied.** Added `requireRecentAdminAuthentication` (which enforces SUPER_ADMIN + MFA +
`auth_time` within `SENSITIVE_AUTH_MAX_AGE_MS`) to every mutating route:
`POST /` (engine switch), `/initialize-schema`, `/prune-outbox`, `/retry-dead-letter`, `/sync-now`.
Read-only routes (`GET /`, `/sync-status`, `/conflicts`, `/dead-letter`) and the read-only
reachability probe `/test-connection` were deliberately left at ADMIN level so diagnostics are not
over-restricted.

**Post-fix verification:**

```
SUPPORT  -> HTTP 403 "FORBIDDEN"
ADMIN    -> HTTP 403 "FORBIDDEN"
ADMIN initialize-schema -> HTTP 403 "FORBIDDEN"
GET / (ADMIN) -> HTTP 200            (read access preserved)
```

**Regression tests:** 5 tests in `backend/test/independent-audit-regressions.test.js` (P1-01 group).

---

## P1-02 — Database-switch parity gate fails open

**Severity:** P1 HIGH (defeats the core "zero data loss" switch invariant)

**Claim disproved:** UAT-16 — *"Switch allowed only at 100% parity"*; certification row 2 — *"100% Lossless Replication"*.

**Evidence.** In `backend/database/syncManager.js`, `flushAndVerifyBeforeSwitch()`:

```js
let parityPercentage = 100;          // <-- optimistic default
if (adminFirestore) {
    try { /* measure parity */ } catch (_) {}   // <-- swallowed
}
const safeToSwitch = ... && parityPercentage === 100;
```

Parity was *assumed* at 100% and only lowered if the probe happened to succeed. The adjacent catch
even carried the comment *"Firestore unavailable: parity gate below already fails the switch"* —
which was false, because that same Firestore outage also made the parity probe throw and be
swallowed. The same fail-open applied when `adminFirestore` was `null`.

This function is on the live Super Admin switch path (`backend/routes/databaseAdmin.js:251`).

**Reproduction** (real `flushAndVerifyBeforeSwitch()` with every Firestore read rejecting), pre-fix:

```json
{ "safeToSwitch": true, "pendingCount": 0, "conflicts": 0,
  "deadLetters": 0, "parityPercentage": 100, "reason": null }
```

With Firestore completely unreachable and parity never measured, the gate authorised the switch.

**Impact.** A database switch could be executed during a Firestore outage on the belief that the
standby was at 100% parity, causing silent data loss — the exact scenario the gate exists to
prevent.

**Fix applied.** Parity now starts at `0` and is raised to `100` **only** when the probe runs and
both sides match. A missing Firestore handle or a throwing probe yields `parityPercentage = 0` and a
descriptive `parityError` that is surfaced in the block reason.

**Post-fix verification:**

```json
{ "safeToSwitch": false, "parityPercentage": 0,
  "reason": "Pre-switch validation blocked: Standby parity is UNVERIFIED
             (Parity probe failed: 9 UNAVAILABLE: Firestore unreachable)
             — a normal zero-data-loss switch requires measured 100% parity" }
```

**Regression tests:** 2 tests (probe throws; handle absent).

---

## P1-03 — Monotonic revision guard fails open

**Severity:** P1 HIGH (silent data regression / lost update)

**Claim disproved:** UAT-16 — *"Monotonic revision preserved"*; certification row 2 — *"Monotonic Revision Guard"*.

**Evidence.** `replicateToFirestore()`, `resumes` branch:

```js
try {
    const existingSnap = await ref.get();
    if (existingSnap.exists && existingRevision > incomingVersion) return; // stale, skip
} catch (_) {}                                  // <-- guard silently disabled
await ref.set({ ...data, revision: incomingVersion }, { merge: true });   // <-- writes anyway
```

If the guard's own read failed (a routine transient Firestore error), the stale check was skipped
and the stale event was written unconditionally.

**Reproduction** (real `replicateToFirestore()`), pre-fix — with a control case:

```
CONTROL — guard read succeeds (doc at revision 9), replaying revision 1
          [SyncWorker] Monotonic guard: Stale version 1 ignored (Firestore is at revision 9)
          writes = []                       guard blocked stale write: true
DEFECT  — guard read THROWS, replaying revision 1
          writes = [{"id":"resume-stale-001","revision":1,"title":"ANCIENT STALE CONTENT"}]
          stale write landed (regression): true
```

The control proves the guard logic is correct; the defect case proves it is bypassed on read
failure. Firestore would regress revision 9 → revision 1.

**Impact.** Out-of-order or replayed outbox events during transient Firestore errors overwrite
newer resume data with older data. Because the event is then marked SYNCED, the loss is invisible.

**Fix applied.** Removed the swallowing catch so the read failure propagates. `processSyncQueue()`
already handles thrown errors correctly — it increments `retry_count`, sets `RETRYING`, and
dead-letters after `max_retries` — so the event is retried rather than either regressing data or
being dropped.

**Post-fix verification:** control still blocks (writes = `[]`); defect case now writes nothing and
propagates `"9 UNAVAILABLE: transient Firestore read failure"` to the outbox.

**Regression tests:** 2 tests (guard blocks stale revision; guard fails closed on read error).

---

## P1-04 — Live production Enterprise plane is UNAVAILABLE

**Severity:** P1 HIGH (UAT-blocking for the Enterprise workflows) — **OPEN**

**Claims disproved:** "AES-256-GCM encryption … VERIFIED (10/10)"; "Enterprise Multi-Tenancy …
Zero Cross-Tenant Leaks … VERIFIED (10/10)"; UAT-14 and UAT-15 "Live Enterprise Console Tested — PASS".

**Live evidence, measured during this audit:**

```
GET /api/readyz
  checks.enterprise.encryption        : "none"
  checks.enterprise.dataProvider      : "firestore"
  checks.enterprise.dataPlaneConfigured: true
GET /api/service-availability
  enterpriseTenancy                   : false
```

**Causal chain (fully traced in code).**

1. `backend/index.js:3687` → `encryption: enterpriseRuntime.encryption?.provider || 'none'`
2. `backend/enterprise/tenantService.js:54` → `encryption: this.encryptionProvider ? describe() : { provider: 'none', securityLevel: 'ENCRYPTION_UNAVAILABLE_FAIL_CLOSED' }`
3. `backend/enterprise/encryptionProvider.js` → `createEncryptionProvider()` returns **`null`** when no key is configured
4. ∴ `ENTERPRISE_ENCRYPTION_KEYS` / `ENTERPRISE_ENCRYPTION_KEY` are **not set in production**
5. `backend/services/platformHealth.js:594` → state = `UNAVAILABLE`, reason: *"Enterprise tenancy is constructed but encryption is unavailable; encrypted resource operations fail closed."*
6. `platformHealth.js:1636` → `enterpriseTenancy: usable('enterprise-tenancy')` → `false`
7. `firestoreEnterpriseRepository.sealPayload()` → any classification other than `PUBLIC` (default is `PRIVATE`) throws **503 `ENTERPRISE_ENCRYPTION_UNAVAILABLE`**

**Impact.** In live production, Enterprise tenant **resource** create/update operations fail closed
with 503, and any previously encrypted resource becomes unreadable. UAT-14 (Organization Setup) and
UAT-15 (AI Quota Governance) cannot pass live.

**Important nuance — this is not a code defect.** The cryptography is real and correct:
AES-256-GCM envelope encryption, per-value random data keys, master-key wrapping, key versioning,
GCM auth tags, and a genuinely fail-closed posture. The defect is a **production configuration
gap**. `ecosystem.config.js` correctly templates `ENTERPRISE_ENCRYPTION_KEYS`.

**Remediation (requires host access — BLOCKED from this sandbox):** set
`ENTERPRISE_ENCRYPTION_KEYS='{"v1":"<openssl rand -base64 32>"}'` and
`ENTERPRISE_ENCRYPTION_ACTIVE_KEY=v1` in the production environment, restart PM2, then re-verify
that `/api/readyz` reports `encryption:"server-key"` and `/api/service-availability` reports
`enterpriseTenancy:true`. Store the key in the secret store; never commit it.

---

## P1-05 — Production configuration drift vs the committed PM2 template

**Severity:** P1 HIGH (UAT-blocking for notification-dependent workflows) — **OPEN**

**Claims disproved:** "Communication & Email … Notification Outbox, SMTP Delivery Worker,
Exponential Retry Backoff … VERIFIED (10/10) … Outbox Drained Cleanly"; Enterprise garbage
collection verified.

**Side-by-side:**

| Setting | `ecosystem.config.js` (committed) | Live `/api/readyz` (measured) |
|---|---|---|
| `NOTIFICATION_OUTBOX_WORKER_ENABLED` | `'true'` | **`notificationOutbox: "DISABLED"`** |
| `TENANT_GC_WORKER_ENABLED` | `'true'` | **`tenantGc: "MANUAL_SCRIPT_ONLY"`** |
| `ENTERPRISE_ENCRYPTION_KEYS` | set (placeholder) | **`encryption: "none"`** |
| `CMS_SCHEDULER_ENABLED` | `'false'` | `cmsScheduler: "DISABLED"` ✅ consistent |
| `PDF_RENDERER_ISOLATED` | not set | `pdfIsolation: "REQUIRES_ISOLATED_WORKER"` |

**Impact.** Notification emails are queued but **no worker drains the outbox in production**, so
notifications do not get delivered — this affects UAT-12 ("Status update persisted with email
notification"). Deleted enterprise tenants are not garbage-collected automatically. The deployed
environment does not match the release artefact, which is deployment drift by definition.

**Remediation (requires host access — BLOCKED):** reconcile the production environment with
`ecosystem.config.js`, restart, and re-verify `/api/readyz`.

---

## P2-01 — Frozen release shipped with a failing test

**Severity:** P2 MEDIUM — **FIXED**

`backend/test/platform-health-rbac.test.js:101` failed on the frozen release:

```
not ok 176 - SUPER_ADMIN may read every operational-status surface
  /api/platform/operational-status/firestore must be readable by SUPER_ADMIN, got 404
  404 !== 200
```

**Root cause.** The health engine models exactly one active primary: it pushes `id:'database'`
when MySQL is active and `id:'firestore'` when Firestore is active
(`platformHealth.js:493–539`, `isMySQL` branch). The test hardcoded `firestore` as an
always-present surface, so it can only pass on a Firestore-primary release. Since the shipped
default is MySQL, the test failed. Note the sibling ADMIN test in the same file deliberately omits
that path — the SUPER_ADMIN test was the outlier.

This is a **test defect**, not a product defect: the 404 with stable error code
`SERVICE_NOT_FOUND` is correct behaviour and is asserted by another test in the same file.

**Fix applied.** Replaced the hardcoded list with an engine-agnostic assertion that is *strictly
stronger* than the original: it enumerates `snapshot.services[].id` returned by the live snapshot,
asserts the active primary descriptor is present, and asserts SUPER_ADMIN can read **every**
published service surface. Result: 15/15 pass.

---

## P2-02 — Certified test count does not match reality

**Severity:** P2 MEDIUM — **OPEN** (documentation integrity)

The certification's 676 total is internally consistent (28 + 27 + 362 + 210 + 49) but does not
correspond to the repository:

- It **omits `backend/test/*.test.js` entirely** — 286 tests, and the suite containing the one failure.
- "Database Sync, Parity & Failover: 27" — measured **21**.
- "High-Fidelity DOCX & PDF Export: 49" — measured **38** for the five export test files.
- Actual frozen-release total across all suites: **919 tests, 918 pass, 1 fail**.
- `npm test` alone (`test:security` + `test:product`): **688 tests, 687 pass, 1 fail**.

The claim "0 FAILED / 0 SKIPPED / 0 BLOCKED" is **false as written** (1 failure); the skipped,
cancelled, todo and flaky portions are accurate.

---

## P2-03 — UAT evidence citations reference non-existent files

**Severity:** P2 MEDIUM — **OPEN** (documentation integrity)

`docs/UAT_READINESS_MATRIX.md` cites automated evidence that does not exist:

| UAT | Cited file | Status |
|---|---|---|
| UAT-13 (Support) | `backend/test/auth-middleware.test.js` | ❌ missing |
| UAT-14 (Enterprise isolation) | `backend/test/tenant-isolation.test.js` | ❌ missing |
| UAT-15 (Enterprise AI quota) | `backend/test/tenant-quota.test.js` | ❌ missing |

Coverage for these areas exists under other filenames, so this is a citation defect rather than
missing tests — but a reviewer following the matrix cannot reproduce the stated evidence, and these
are the three most security-sensitive workflows in the pack.

---

## P2-04 — Authoritative SHA absent from all documentation

**Severity:** P2 MEDIUM — **OPEN**

`grep -rl "c49fac08f9dcfcee53a333a0e999050735d3821e" docs/*.md` → **0 matches** across 74 documents.
The documents carry 20+ other unrelated 40-hex SHAs (most frequent: `a29c1dea1433291118d955aef28bd85d7f3e9486`, 7 occurrences). Every certification document is therefore stale with respect to the release it certifies. Per Rule 4, documentation that cannot be tied to the exact SHA is not release identity evidence.

---

## P2-05 — Revision guard covers only the `resumes` entity type

**Severity:** P2 MEDIUM — **OPEN** (post-UAT)

The monotonic revision guard exists only in the `resumes` branch of `replicateToFirestore()`.
`users`, `portfolios`, `covers`, `settings` and `payment_orders` replicate with a plain
`ref.set({...}, {merge:true})` and no revision comparison, so out-of-order events for those
entities can still regress data. Recorded rather than fixed: broadening the guard touches many
replication paths and is not required for UAT correctness of the resume workflow.

---

## P3-01 — `engine_state.json` tracked in git and mutated by tests

**Severity:** P3 LOW — **OPEN** (post-UAT)

`backend/database/engine_state.json` is tracked (`git ls-files` confirms) and is the authoritative
startup engine selector. `tests/database-switch-safety.test.mjs` test 5 performs a real idempotent
`switchActiveEngine()`, which rewrites the file. After a test run:

```
-  "switchedAt": "2026-08-25T19:12:13.710Z",
+  "switchedAt": "2026-08-25T21:33:46.119Z",
```

The engine **value** is unchanged (the concurrency test properly snapshots and restores in a
`finally` block), so the operational risk is low — but the working tree is left dirty after a test
run, which breaks the "clean working tree" release gate and could mask a genuine engine change
during diff review. File restored to its committed state during this audit.

---

## P3-02 — Notification retry has no jitter

**Severity:** P3 LOW — **OPEN** (post-UAT)

`notificationOutbox.js`: `retryDelay(n) = min(60min, 60s * 2^(n-1))`, `MAX_ATTEMPTS = 5`.
Deterministic exponential backoff with **no jitter**. A bulk provider outage would make all failed
events due at the same instants (60s, 2m, 4m, 8m), producing a retry stampede. The certification
claims "Exponential Retry Backoff" — accurate; jitter was never claimed.

---

## P3-03 — `/api/readyz` reports `ready` with DISABLED subsystems

**Severity:** P3 LOW — **OPEN** (post-UAT)

Production returned `"status":"ready"` while simultaneously reporting
`notificationOutbox:"DISABLED"`, `cmsScheduler:"DISABLED"`, `tenantGc:"MANUAL_SCRIPT_ONLY"`.
The payload is individually honest, but an orchestrator keying on `status` alone would treat the
node as fully ready. Readiness should be degraded (or the disabled workers excluded from the
readiness contract) when a subsystem required for UAT is off.

---

## NOT A DEFECT (investigated and cleared)

| Item | Why it is not a defect |
|---|---|
| `TESTABLE_SERVICES` includes `'firestore'` unconditionally | Legitimate: Firestore is the standby, and `POST /operational-status/firestore/test` is a read-only reachability probe. Probing the standby while MySQL is primary is correct operator behaviour. |
| `platformHealth.js:376` `enterpriseEnabled = isMySQL ? true : …` | Intentional: under MySQL-primary the Enterprise plane lives in Firestore regardless of the env flag; the health engine then evaluates real tenancy configuration and encryption readiness separately. |
| 788 ESLint warnings | All `no-unused-vars`-class warnings in test/scratch files; 0 errors; build and lint exit 0. Non-blocking hygiene. |
| 71 empty `catch (_) {}` blocks repo-wide | Sampled across `syncManager`, `index.js`, `MySQLRepository`, `platform.js`, `aiRuntime`: the great majority guard best-effort telemetry, lease release, and optional JSON parsing. The three genuinely dangerous instances (P1-02 ×2, P1-03 ×1) were reproduced and fixed; the rest are defensible. |
| `enterprise-tenancy` reported `DISABLED` when the rollout flag is off | Explicitly documented in code as *"a deliberate rollout gate, not an outage"* with dedicated remediation text. Honest reporting, not a fault. |
| Shallow clone / 1-commit history | An artefact of the audit environment, not of the release. Recorded as BLOCKED for history-dependent forensics rather than as a product defect. |

---

## Remediation status summary

| Category | Count | Fixed on branch | Open (needs production access) | Open (post-UAT) |
|---|---|---|---|---|
| P0 | 0 | — | — | — |
| P1 | 5 | 3 (P1-01, P1-02, P1-03) | 2 (P1-04, P1-05) | — |
| P2 | 5 | 1 (P2-01) | 3 (P2-02, P2-03, P2-04 documentation) | 1 (P2-05) |
| P3 | 3 | 0 | — | 3 |

**Code changes on `arena/01a03aa4-resumepilotai`:**

```
backend/database/syncManager.js            | 52 ++++++++++++++++--------
backend/routes/databaseAdmin.js            | 12 +++----
backend/test/platform-health-rbac.test.js  | 23 +++++++++--
backend/test/independent-audit-regressions.test.js | new file, 9 tests
```

**Not deployed.** These fixes exist only on the audit branch. Live production still runs
`c49fac08f9dcfcee53a333a0e999050735d3821e`, which contains P1-01, P1-02 and P1-03.
