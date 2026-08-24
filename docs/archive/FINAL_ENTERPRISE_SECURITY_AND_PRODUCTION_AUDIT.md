# FINAL ENTERPRISE SECURITY & PRODUCTION AUDIT

**Audit window:** 2026-08-21 (single senior-audit session, autonomous)
**Auditor:** Arena.ai Agent Mode (senior security/platform audit)
**Branch:** `arena/01a02322-resumepilotai` (session branch; branched from `main`)

---

## 1. Baseline SHA

| Item | Value |
|---|---|
| Authoritative baseline commit | `38273af004e9e61bc36a21c5204d1e394971a2e3` |
| Verified at session start | ✅ (`git rev-parse HEAD` == baseline; clean tree) |
| Rollback tag (local) | `enterprise-audit-baseline` → `38273af` |

## 2. Final SHA

| Item | Value |
|---|---|
| Fully-tested code SHA | `a3011402254630e111938bf7c7ba5ac840f7c218` (+ final docs/COMMIT_SHA commit on top) |
| `backend/COMMIT_SHA` | set to tested SHA; `scripts/deploy-live.mjs` re-derives it from `HEAD` at deploy time |
| Pushed to | `origin/arena/01a02322-resumepilotai` only |
| Production deploy | **NOT executed from this sandbox** — `scripts/deploy-live.mjs` requires the owner's `airesume` SSH hop, which is unreachable from the audit sandbox (egress restricted to npm/GitHub/PyPI). Deploy must be run by the owner; the script itself enforces backup → SHA → build → verify ordering |

## 3. M2M Audit — THE critical finding, independently PROVEN

> "M2M service accounts can be created, rotated and revoked, but may not actually authenticate against the core operational APIs."

**CONFIRMED TRUE at baseline.** Proof (live HTTP, in-memory Firestore data plane, real middleware chain):

```
x-api-key → GET  /api/enterprise/m2m/context          → 200  (only wired endpoint)
x-api-key → GET  /api/enterprise/resources             → 401 AUTH_REQUIRED
x-api-key → POST /api/enterprise/resources             → 401 AUTH_REQUIRED
x-api-key → GET  /api/enterprise/usage/ai              → 401 AUTH_REQUIRED
x-api-key → GET  /api/enterprise/audit                 → 401 AUTH_REQUIRED
x-api-key → POST /api/enterprise/ai/generate-content   → 401 AUTH_REQUIRED
x-api-key → GET  /api/enterprise/workspaces            → 401 AUTH_REQUIRED
```

RCA: the zero-trust boundary (`backend/index.js`) accepted only Firebase bearer tokens for `/api/enterprise/**`; `authenticateServiceApiKey()` existed and built a correct service principal, but the router never consumed it except on `/m2m/context`. Keys were real credentials with no operational surface.

**FIXED (first-class M2M, fail closed, additive):**
- New `backend/enterprise/enterpriseAuth.js`: the `/api/enterprise/**` boundary now accepts **exactly one** credential per request — bearer OR `x-api-key`. Both present ⇒ `400 AMBIGUOUS_CREDENTIALS`.
- Auth path now: `x-api-key` → hash lookup → key verification (timing-safe) → service account → tenant resolution → ACTIVE-tenant check → workspace resolution (server-side; client values can only restrict) → server-side scopes → synthetic service principal (`actorType: service`) → normal `requireTenantPermission` RBAC → endpoint → audit → per-account rate limit.
- **Fail-closed allowlist** (`M2M_ALLOWED_ENDPOINTS`): data plane + read-only governance only. Control plane (memberships, service accounts, configuration, grants, lifecycle, platform, queue writes, test-email) returns `403 M2M_OPERATION_NOT_PERMITTED` for service keys **even with elevated scopes** (verified).
- `TENANT`-scoped vs `WORKSPACE`-scoped service accounts; only TENANT-scoped humans may create tenant-scoped keys.
- Per-service-account rate limiter (keyed by principal, never the raw key).
- Plaintext key returned exactly once; never persisted, logged, re-served, or audited (asserted in tests).

## 4. M2M Capability Matrix (post-fix, all verified live)

| API | Human Auth | M2M Auth | Required scope | Tenant-scoped | Workspace-scoped | Tested |
|---|---|---|---|---|---|---|
| `GET/POST /enterprise/resources` | ✅ | ✅ | `resource.read` / `resource.create` | ✅ | ✅ | ✅ 200/201/403/401 |
| `GET/PATCH/DELETE /enterprise/resources/:id` | ✅ | ✅ | `resource.read` / `resource.update` | ✅ (404 cross-ws) | ✅ | ✅ |
| `POST /enterprise/ai/generate-content` | ✅ | ✅ | `ai.use` (shares tenant AI quota) | ✅ | ✅ | ✅ (provider-less env ⇒ policy 403/502/503, never 401/403-RBAC) |
| `GET /enterprise/usage/ai(/events)` | ✅ | ✅ | `tenant.usage.read` | ✅ | ✅ | ✅ |
| `GET /enterprise/audit` | ✅ | ✅ | `tenant.audit.read` | ✅ | ✅ | ✅ |
| `GET /enterprise/workspaces` `/teams` `/configuration` `/roles-matrix` | ✅ | ✅ | `workspace.read` / `tenant.read` | ✅ | ✅ | ✅ |
| `GET /enterprise/m2m/context` | n/a | ✅ any valid key | — | ✅ | ✅ | ✅ |
| `POST /enterprise/storage/token|verify` | ✅ | ✅ | `resource.read` | ✅ | ✅ | ✅ (allowlisted; HMAC purpose-bound) |
| Control plane (members/service-accounts/config/grants/lifecycle/platform/queue-writes/test-email) | ✅ humans | ❌ **always 403** | n/a | n/a | n/a | ✅ 11 probes |

## 5. Security findings (all dispositioned)

| # | Finding | Severity | Disposition |
|---|---|---|---|
| S1 | M2M keys could not authenticate operational APIs (above) | CRITICAL | **FIXED** |
| S2 | Support grants resolved a context but could not authorize any subsequent request (dead-end break-glass) | HIGH | **FIXED** — `x-support-grant-id` + bearer now resolves the grant per request; allowlisted diagnostic/repair endpoints; RBAC from grant scopes |
| S3 | Support grants were workspace-only; tenant-wide diagnostics impossible without over-scoping | MEDIUM | **FIXED** — TENANT vs WORKSPACE blast radius; narrowing validated server-side |
| S4 | Repair scopes for support not policy-gated in UI/backend symmetry | MEDIUM | **FIXED** (backend already gated; UI now mirrors + explains) |
| S5 | Email CTA could, in theory, carry a supplied non-https/placeholder URL in production | MEDIUM | **FIXED** — dispatch falls back to server-derived console URL when `assertNoForbiddenEmailHost` fails |
| S6 | Ambiguous dual credentials (bearer + api key) implicitly possible | LOW | **FIXED** — explicit 400 |
| S7 | Member identities truncated in IAM/Workspaces/Teams surfaces (opaque `xxxx…`), hindering access review | MEDIUM (UX/governance) | **FIXED** — full principal everywhere |
| S8 | 1280×800 horizontal overflow on Overview/topbar | LOW (UX) | **FIXED** |
| S9 | M2M had no per-identity request budget | MEDIUM | **FIXED** — per-account limiter; tenant AI quota shared (no bypass) |
| S10 | Live mailbox + production deploy unreachable from sandbox | n/a | **ACCEPTED** (environmental; documented §7/§16) |

## 6. Support / Break-Glass findings

- Grants remain explicit, time-bound (5–480 min), scoped, approval-controlled, audited, revocable.
- `workspaceScope` no longer blocks legitimate tenant-wide operations: TENANT-scoped grants exist; WORKSPACE grants stay pinned.
- Verified live: grant created in UI → support bearer + grant id reads audit (200); control-plane (memberships) ⇒ 403 `SUPPORT_OPERATION_NOT_PERMITTED`; revoke in UI ⇒ immediate 403; expired ⇒ 403; wrong engineer ⇒ 403.
- Principal-selection UX: input renamed to "Support Engineer Identity Code" with guidance + format validation (directory-verified server-side; no client trust), blast-radius selector, live countdown, blast-radius column.

## 7. Email findings

- Chain traced: enterprise action → `dispatchNotification` → provider → CTA = `enterpriseConsoleUrl({tab, tenant, workspace})` (server-derived origin; `PUBLIC_APP_URL`/`WEBSITE_NAME`+`PROTOCOL`; production enforces https + rejects placeholder/loopback) → `/enterprise?tab=…&tenant=…&workspace=…` → login return path handled by SPA context bootstrap → module + action.
- Template/URL tests: **13/13 pass** (`enterprise-email-links`, `public-app-url`).
- Open-redirect: no redirect endpoint; CTA params are UUID-validated server-side (`assertUuid`) and tab-normalized client-side; `sanitizeAbsoluteHttpUrl` + new production fail-closed fallback.
- **Real mailbox test: NOT POSSIBLE in sandbox** (no SMTP credentials; production host unreachable). Disposition ACCEPTED with compensating controls (truthful delivery states `DELIVERED/DELIVERY_FAILED`, outbox logging, test-email endpoint for admins).

## 8. UX/UI findings

- All 14 modules render from live backend data with zero `Data unavailable` states and zero page errors (Playwright).
- Security tab: scope-aware create dialog, one-time reveal, rotate/revoke with confirm, live posture (MFA/SSO/session/encryption/break-glass), new scope badges + M2M quick reference.
- Support tab: blast-radius selector, countdown, guidance-first identity input.
- Users/Workspaces/Teams: full identities; drawers readable.
- Responsive verified at 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844, 375×667 — **zero horizontal overflow** (screenshots in `scratch/live-backend-audit/`).
- Deep links, refresh, back/forward, command palette all pass against the real backend.

## 9. Missing capabilities (deliberate, documented)

- M2M queue-job enqueue remains human-only: outbox worker re-authorization supports Firebase principals only; allowing service issuers would require an issuer-aware resolver (future OIDC/SCIM work). Fail-closed today.
- SCIM/OIDC provisioning, customer-managed KMS: roadmap, not faked.

## 10. Bugs found & fixed (code)

1. M2M not wired to operational APIs (S1). 2. Break-glass dead-end (S2/S3). 3. `handleRevoke` referenced undefined `accounts` (name display). 4. Members identity truncation (S7). 5. 1280 overflow (S8). 6. Legacy browser script `window.confirm` assumption + modal race. 7. Email CTA production hardening (S5).

## 11. RCA summary

Root causes clustered in (a) an auth boundary that predated M2M (bearer-only), (b) break-glass designed as display-only, (c) cosmetic truncation that defeated identity governance, (d) layout min-widths vs 1280 class desktops. Each fixed at the architectural layer with fail-closed defaults; no consumer feature flags touched (§18 verified: zero changes outside `src/enterprise/**`, `backend/enterprise|routes|security|services/**`, tests, docs).

## 12–13. Fixes & tenant-isolation evidence

Tenant isolation suite (`enterprise-m2m-first-class.test.js`, 16/16):
- Key A vs tenant B resource: read/update/delete ⇒ **404**; `x-tenant-id`/query spoof ⇒ **404**; body `tenantId/workspaceId` spoof on create ⇒ resource lands in key's tenant; `x-workspace-id` spoof ⇒ **404**; scope header spoof ⇒ **403**.
- Workspace-scoped key: sees only own workspace; cross-ws read 404; create pins to own ws. Tenant-scoped key spans; narrowing via header validated. Non-owner TENANT-key creation ⇒ 403.
- Suspended tenant ⇒ keys 403 `TENANT_INACTIVE` immediately.

## 14. Playwright evidence

| Suite | Result |
|---|---|
| `tests/enterprise-live-backend.spec.js` (REAL backend, authenticated) | **10/10** |
| `tests/enterprise-e2e.spec.js` (fixture) | **22/22** (was 21/22 at baseline — fixed) |
| `tests/test-enterprise-browser.mjs` (legacy) | **28/28** (was failing at baseline) |
| `tests/enterprise-ui.test.mjs` | 23/23 |
Screenshots: `scratch/live-backend-audit/` (32 files; inspected: overview, security incl. one-time key reveal, support grant with countdown, mobile/tablet/desktop).

## 15. Full regression results (final state)

| Suite | Result |
|---|---|
| `npm run test:security` | 22 + 173 pass, 0 fail |
| `npm run test:product` | 301 + 1 + 8 + 3 pass, 0 fail |
| `npm run test:enterprise` | 173 + 23 pass, 0 fail (incl. 16 new M2M first-class tests) |
| `npm run lint` | 0 errors (570 pre-existing warnings) |
| `npm run build` | ✅ |
| `npm run audit:production` | 0 high vulnerabilities |
| Browser suites | 10/10 + 22/22 + 28/28 |

No skipped tests counted as pass anywhere.

## 16. Production verification

- Sandbox egress cannot reach `airesume.projectdemo.guru` (verified: connection blocked) and cannot SSH for `deploy-live.mjs`. **Production deploy intentionally not executed here.**
- Compensating: the entire surface was verified against the identical code running locally with the real middleware/DB stack; deploy script enforces backup→SHA→build→verify and refreshes `backend/COMMIT_SHA` from HEAD.
- Owner action: run `node scripts/deploy-live.mjs` from an environment with the `airesume` SSH key; then confirm `/api/readyz` enterprise block reports `dataPlaneConfigured: true`.

## 17. Performance

- M2M auth path: single SHA-256 hash lookup + constant-time compare; no added round trips beyond existing context reads (tenant+workspace+config in one `Promise.all`).
- Per-account limiter is in-memory (express-rate-limit) — O(1).
- No measurable regression in suite timings (e2e 2.7 m unchanged).

## 18. SWOT

**Strengths** — Zero-trust boundary with explicit public allowlist; server-derived tenancy everywhere; hashed one-time keys; durable Firestore outbox with signed envelopes; truthful posture UIs; deep test matrix.
**Weaknesses** — Single-region Firestore data plane; no OIDC/SCIM; in-memory limiters don't span instances (mitigated by tenant quota guard which is Firestore-atomic).
**Opportunities** — Issuer-aware outbox re-auth to unlock M2M queue jobs; customer-managed keys; SIEM export of tenant audit.
**Threats** — Credential stuffing against support identity (mitigated: directory + role check at grant time); key exfiltration (mitigated: rotation/revocation immediacy + per-account budgets + audit attribution).

Disposition of every weakness/threat: S1–S9 **FIXED**, S10 & multi-instance limiter **ACCEPTED/MITIGATED** (documented), none hidden.

## 19. Remaining risks

1. Production SMTP/SSO configuration unknown from sandbox — verify after owner deploy.
2. 570 lint warnings (pre-existing, cosmetic).
3. AI provider keys not present in test env — provider path verified via policy-fail-closed contract only.

## 20. Rollback

- `git revert a301140..HEAD` or reset to `38273af` (tag `enterprise-audit-baseline`); changes are additive modules + scoped edits; consumer paths untouched; rollback is safe and lossless for tenants.

## 21. Final GO / NO-GO

All freeze-gate items verified **except** two environment-impossible ones (live mailbox, production deploy) which are ACCEPTED with compensating controls and explicit owner runbook.

**GO — recommend FREEZE** of the Enterprise surface at the final SHA on `arena/01a02322-resumepilotai`, with the owner-run production deploy as the single remaining manual step.
