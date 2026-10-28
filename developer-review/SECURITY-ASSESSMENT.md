# Security & Tenant-Isolation Assessment — Mandate v3 Completion

**Source revision:** `ff841d5` (app `537e2985`) — read-only inspection, no code modified
**Supplements:** `appendix/INVENTORIES/security-tenant-isolation.md` (base), `DISCREPANCY-LOG.md`, `EVIDENCE-INDEX.md` E-010
**Generated:** 2026-10-28

---

## 1. Authentication

**Verified from `backend/index.js` global middleware chain (~L464-535) + `backend/security/auth.js`:**

- Global gate: single `app.use('/api/*', ...)` chain enforces auth **before** any router mount. Public paths are an explicit allow-list via `isPublicApiPath()` — anchored regexes with exact length/charset constraints (e.g., share token `v1\.[A-Za-z0-9_-]{1,160}\.[A-Za-z0-9_-]{22}`), not wildcards — **PASS (positive)**.
- Enterprise routes use separate `createEnterpriseAuthMiddleware` supporting 3 credential kinds (bearer, M2M `x-api-key`, break-glass `x-support-grant-id`) with **fail-closed ambiguity rejection** (`400 AMBIGUOUS_CREDENTIALS` if >1 kind presented) — **PASS**.
- Firebase ID-token verification is authoritative (`backend/services/firebaseAdmin.js` via `FIREBASE_PROJECT_ID` + `FIREBASE_PRIVATE_KEY` / ADC). No client-supplied UID accepted.

**Residual:** Session/token lifetime not re-traced in depth; Firebase `auth_time` session-age check observed in `tenantService.js: enforceTenantSecurityPolicies` (max-minutes gate for enterprise) — **PARTIAL** (full JWT clock-skew handling DEFERRED).

## 2. Tenant Isolation — **RESOLVED SUSP-001**

### 2.1 M2M API Key Path (the previously unverified suspicion)

**Hypothesis in prior PARTIAL audit:** Comment in `enterpriseAuth.js` claims `x-tenant-id` can only restrict, never expand, but implementation not traced — could be P0 IDOR if violated.

**Resolution in this completion (E-010):**

1. `enterpriseAuth.js:27` imports `normalizeRequestedTenantId` from `tenantContext.js`.
2. `tenantContext.js:51-64` — `normalizeRequestedTenantId` **fails closed** on non-UUID input (`assertUuid` throws 400) and lowercases valid UUIDs. No tenant lookup occurs here.
3. `enterpriseAuth.js:170-172` — passes normalized IDs to `service.authenticateServiceApiKey`.
4. `tenantService.js:513-533` — **enforcement**:
   ```js
   if (requestedTenantId && assertUuid(requestedTenantId) !== account.tenantId)
     throw 404 SERVICE_TENANT_NOT_FOUND
   if (account.workspaceId && requestedWorkspaceId && assertUuid(...) !== account.workspaceId)
     throw 404 SERVICE_WORKSPACE_NOT_FOUND
   ```
   `account` is resolved **solely from DB row keyed by secretHash** (`mysqlServiceAccountStore.js:90-120`), never from client header. Workspace narrowing is validated against `registry.getWorkspace(account.tenantId)` — tenant-scoped.
5. `freezeContext()` (L133-195) re-validates `tenantId`/`workspaceId` as UUIDs, checks `membershipIsActive` + `tenantIsUsable`, validates `isolationTier`/`dataPlaneType`.

**Verdict:** Guarantee is **enforced**, not merely documented. Existing test `enterprise-m2m-first-class.test.js:329` explicitly asserts spoofing fails (404). **No P0**.

### 2.2 Human Enterprise Path

- `tenantService.js:resolveContext()` → `registry.resolveMembership()` (Firebase UID → tenant membership), then `validateTenantConfiguration()` + `enforceTenantSecurityPolicies()` (MFA for admins, SSO mode, session max age).
- Workspace scope derived server-side (`TENANT` for owners/admins, `WORKSPACE` otherwise) — never accepted from browser (`tenantContext.js: freezeContext` comment: `Workspace scope is derived by the server policy layer, never accepted from the browser.`).

### 2.3 Data-Plane Isolation

- `enterpriseMysql*` stores (mysql tenant registry, service account store, atomic counter, support grant) are tenant-keyed via `tenantId` predicate on every query — **observed** (no cross-tenant WHERE clause omission found in sampled files).
- Resource payloads encrypted via `encryptionProvider` (AES-256-GCM envelope, key ring `ENTERPRISE_ENCRYPTION_KEY` / `ENTERPRISE_ENCRYPTION_KEYS`) — **PASS**.

**Residual:** Full `backend/repositories/*` tenant-scoping not exhaustively checked (EG-006) — sampled `resumes.js` + `portfolios.js` show `req.user.uid` scoping; enterprise resource tables are tenant-keyed by design.

## 3. RBAC

Observed roles (from `backend/security/auth.js` imports in `backend/index.js` + `docs/ai-settings/rbac-matrix.md`):

| Role / Scope | Scope | Key routes |
|---|---|---|
| `USER` (authenticated candidate) | global | `/api/resumes/*`, `/api/ai/*` (with `enforceDailyAiQuota` + `aiGovernanceMiddleware`), `/api/portfolio*`, `/api/covers*` |
| `ADMIN` | platform | `/api/admin` (audit, users, platform ops) — quota governance only for AI settings per `security-review.md` |
| `SUPER_ADMIN` | platform | `/api/admin/ai-settings`, `/api/admin/database-settings`, `/api/admin/ai/*`, `/v1/status` gated |
| `SUPPORT` / `AUDITOR` | platform | deterministic 403 on AI settings (`admin-tab-forbidden`), read-only audit |
| M2M service account | tenant/workspace, `scopes` array | allow-listed endpoints only (`M2M_ALLOWED_ENDPOINTS` 22 entries, `SUPPORT_ALLOWED_ENDPOINTS` 17) |
| Break-glass grant | time-bound, scoped | enterprise diagnostics/repair |

**M2M endpoint allow-list** (`enterpriseAuth.js:32-80`): every enterprise data-plane read/write is explicitly listed; anything else → `403 M2M_OPERATION_NOT_PERMITTED` before handler.

**Gaps:** Full role×route×action matrix for all 20 routes not constructed (R-022 PARTIAL) — requires opening each route's `requirePermission` / `requireSuperAdmin` calls; sampled 4 routes confirm correct gating.

## 4. Security Headers & Transport

| Header | Value | Source |
|---|---|---|
| CSP | `default-src 'self'; script-src 'self' + allow-listed payment origins; style-src-attr/elem 'unsafe-inline'` | `.htaccess` L9 (E-007) |
| HSTS | `max-age=31536000; includeSubDomains; preload` | `.htaccess` |
| X-Frame-Options | `DENY` | `.htaccess` |
| X-Content-Type-Options | `nosniff` | `.htaccess` |
| Referrer-Policy | `no-referrer` | `.htaccess` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(self)` | `.htaccess` |
| CORP / COOP | `same-site` / `same-origin-allow-popups` | `headers.js` canonical table (DIR-040 fix) |

**CORS:** `cors({ origin: configuredOrigins })` in `backend/index.js` ~L323-339 — `configuredOrigins` parsed from `CORS_ALLOWED_ORIGINS` (single production origin `https://resumepilot.example` in `.env.example`); wildcard rejected for non-`development` `NODE_ENV` (code comment: `// production requires explicit origin list`) — **PASS** (actual deployed value EG-004 BLOCKED).

**Rate limiting:** `publicBrowseLimiter` vs `generalApiLimiter` (identityKey = `req.user.uid` or IP), `abuse.js` frozen Hard-Boundary File — **PASS**.

## 5. Secrets & Encryption

- No `VITE_*` secret exposure — `VITE_FIREBASE_KEY` is Browser API key (public by provider design), `VITE_RAZORPAY_KEY_ID` is publishable `key_id`, `VITE_GOOGLE_MAPS_API_KEY` is browser-restricted — verified per provider model (not name-pattern heuristic).
- Server secrets (`DB_PASSWORD`, 6 AI provider keys, `FIREBASE_PRIVATE_KEY`, OAuth secrets, `ENTERPRISE_ENCRYPTION_KEY`) are `process.env`-only, never in `VITE_*`.
- `secretVault.js` + `encryptionProvider` support versioned key ring + rotation — observed imports, not runtime-tested (EG-005).

## 6. Input Validation & Error Handling

- `resumes.js`: `SERVER_OWNED_RESUME_FIELDS` Set drops `id/userId/revision/isPublished/publishedAt/pbId` from client body; `sanitizeResumePayload` filters `expectedRevision` separately — server owns ownership/publication bookkeeping.
- `shareTokens.js`: `verifyShareToken` returns null on forged/truncated/rotated token → indistinguishable 404 (no oracle).
- 409 `RESUME_CONFLICT`/`RESUME_PUBLICATION_CONFLICT` with `remoteRevision` for optimistic concurrency — correct.
- `webhookGuard.js`: `verifyStripeSignature`/`verifyRazorpaySignature` + `REPLAY_WINDOW_SECONDS` — replay window enforced **before** SDK event construction.

## 7. Residual Risks & Recommendations

| Risk | Severity | Mitigation |
|---|---|---|
| CSP `unsafe-inline` on styles (DISC-006) | P3 | Migrate inline `style=` to class-based; add `report-uri` interim |
| Full RBAC matrix unverified for 16 routes | P2-process | Prioritize `ai.js`, `enterprise.js`, `adminUsers.js` in next pass |
| CORS deployed-origin value unconfirmed | P2 | Operator confirms `CORS_ALLOWED_ORIGINS` on prod |

**Overall security posture:** No P0/P1 confirmed. The previously highest-risk item (UVS-001 P0 candidate) is resolved as safe.

