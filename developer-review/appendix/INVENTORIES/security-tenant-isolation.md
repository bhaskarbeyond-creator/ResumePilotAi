# Security & Tenant-Isolation Inventory

**Discovery method:** `find backend/security -type f`, direct reads of
`backend/index.js` (global middleware chain), `backend/routes/resumes.js`, and
`backend/enterprise/enterpriseAuth.js`.

## 1. `backend/security/` module inventory (19 files)

| File | Role (from name/usage context) |
|---|---|
| `auth.js` | `requireAuth`, `optionalAuth`, `requirePermission`, `requireSuperAdmin`, `isSuperAdmin`, `hasSecondFactor`, `superAdminMfaEnforced`, `issueLocalTestToken` — core authn/authz primitives, confirmed by their import list in `backend/index.js` |
| `abuse.js` | Rate limiting / abuse detection; explicitly called out in `HANDOVER-CLOSURE-2026-10-28.md` as a "Hard-Boundary File" frozen byte-identical against a prior verified commit |
| `adminAudit.js` | `createAdminAuditMiddleware` — admin action audit logging |
| `aiGovernance.js` | AI usage governance middleware (`aiGovernanceMiddleware`, referenced at `backend/index.js` mount of `/api/ai`) |
| `employerClaim.js` | Recruiter/employer "claim" workflow (ownership verification for public exports, per DIR-071 comment in `backend/index.js`) |
| `entitlements.js` | `resolveEffectiveEntitlement`, `isMembershipActive` — single-source-of-truth entitlement/membership gate (explicitly called out in a code comment as replacing older duplicated gates — "DIR-022 removed the local isPaidMembershipTier(...) ... gates") |
| `exportTokens.js` | `createExportRenderToken`/`consumeExportRenderToken`/`discardExportRenderToken` — short-lived token pattern for export rendering, reducing exposure of long-lived credentials during PDF/DOCX generation |
| `headers.js` | Likely security-header generation (consistent with root `scripts/generate-security-headers.mjs` and `npm run security:headers:check`) — not opened in this session |
| `inMemoryCounterStore.js` | Rate-limit counter backend (non-durable; contrasted with a MariaDB-backed durable counter mentioned in code comments) |
| `network.js` | Not opened in this session |
| `oauth.js` | PKCE-based OAuth helper functions: `hashOpaque`, `createPkceChallenge`, `parseCookies`, `assertStateBinding`, `assertStateRecord`, `assertVerifiedIdentity`, `assertAccountLinkSafe`, `assertExchangeRecord` |
| `payments.js` | `assertInternalOrder`, `validateStripePaymentIntent`, `validatePayPalOrder`, `validateRazorpayPayment`, `validatePaytmPayment`, `validatePhonePePayment` |
| `policy.js` | `enforceApiPolicy` — the RBAC/entitlement gate applied globally to `/api/*` |
| `reset.js` | Password reset: `hashToken`, `isOpaqueToken`, `assertPasswordPolicy`, `minimumEnumerationDelay` (name strongly suggests a deliberate timing-attack/enumeration mitigation) |
| `sanitize.js` | Not opened in this session (input sanitization, name-inferred) |
| `secretVault.js` | Not opened in this session (see DISC-004 evidence limitations) |
| `shareTokens.js` | `issueShareToken`/`verifyShareToken`/`projectPublicResume` — used by `resumes.js`'s public-share endpoint |
| `urlHelper.js` | Not opened in this session |
| `webhookGuard.js` | `verifyStripeSignature`, `verifyRazorpaySignature`, `toWebhookRejection`, `recordWebhookRejection`, `REPLAY_WINDOW_SECONDS` — cryptographic webhook verification with an explicit replay-window constant |

## 2. Authentication model (verified from `backend/index.js`)

- Authentication is enforced **globally** for all `/api/*` requests via a single
  middleware registered before any router mount (`backend/index.js` ~line 464), not
  per-router. Public paths are allow-listed by an explicit `isPublicApiPath()` function
  using a combination of an exact-match `Set` and specific anchored regexes (not a broad
  wildcard), e.g.:
  ```
  || /^\/resumes\/public\/[a-zA-Z0-9_-]+$/i.test(pathname)
  || /^\/resumes\/public\/token\/v1\.[A-Za-z0-9_-]{1,160}\.[A-Za-z0-9_-]{22}$/.test(pathname)
  ```
  This is a verified positive finding: public exceptions are narrow and
  pattern-anchored, not a blanket bypass.
- Enterprise routes (`/api/enterprise/*`) use a **separate** middleware
  (`createEnterpriseAuthMiddleware`) supporting three distinct credential kinds
  (human bearer token, M2M `x-api-key`, and a "support break-glass" grant via
  `x-support-grant-id`), which explicitly rejects ambiguous requests presenting more
  than one credential kind at once (`400 AMBIGUOUS_CREDENTIALS`) — a verified fail-closed
  design choice.
- M2M service accounts are documented (comment-level, not independently
  implementation-traced — see UVS-001) to have their tenant/workspace pinned
  server-side from the API key record, with client-supplied `x-tenant-id`/
  `x-workspace-id` able only to restrict, never expand, authority.

## 3. Role/permission primitives observed

`requirePermission`, `requireSuperAdmin`, `requireRecentAdminAuthentication`,
`hasSecondFactor`, `superAdminMfaEnforced` — names imported in `backend/index.js`,
indicating a role model with at least: ordinary authenticated user, an "ADMIN" role
(referenced in `docs/ai-settings/security-review.md`'s own RBAC description as scoped to
"Quota Governance" only), "SUPPORT" and "AUDITOR" roles (also from that doc), and a
"SuperAdmin" role with its own recent-authentication and MFA-enforcement requirements. A
full role × route × action matrix (mandate §6.2) was **not** constructed in this session
— `DEFERRED`. The pre-existing `docs/ai-settings/rbac-matrix.md` file (inside the audited
repo) appears to already contain a role matrix **for the AI-settings admin surface
specifically**; it was not read in full in this session and does not cover the whole
application's route surface.

## 4. Verified-safe findings (not defects — recorded for completeness per mandate §1.3)

- No client-exposed (`VITE_*`) secret-by-provider-model variable found (see
  `environment-config.md` §2).
- `resumes.js` consistently scopes every data operation by `req.user.uid`, sourced only
  from the globally-enforced, server-verified `requireAuth` middleware (see
  `routes.md` §3) — RC not applicable, this is a direct positive observation.
- Webhook signature verification (`verifyStripeSignature`/`verifyRazorpaySignature`) is
  invoked as a guard explicitly documented to run **before** the provider SDK's own event
  construction, with an explicit replay-window constant — reduces risk of
  webhook-replay-based entitlement fraud.

## 5. Open items (not yet confirmed — see `UNVERIFIED-SUSPICIONS.md`)

- UVS-001: `authenticateServiceApiKey` implementation not traced end-to-end.
- `backend/security/sanitize.js`, `secretVault.js`, `network.js`, `urlHelper.js`,
  `headers.js` not opened in this session.
- CORS actual allowed-origin value not inspected beyond confirming the env var name and
  that `cors()` middleware is applied (`backend/index.js` line ~339) — the specific
  allow-list logic (`configuredOrigins` parsing, around line 323) was located but not
  fully read for correctness (e.g., does it reject a wildcard `*` in production?).
  `DEFERRED`.

## Negative-findings statement

**What was searched:** File names and directly-imported function names in
`backend/index.js`, plus full-content reads of `resumes.js` and
`enterpriseAuth.js` only. **What this does NOT establish:** The correctness of any
individual security function's *implementation* beyond the two files fully read. A
role × route × action matrix, a full CORS-policy correctness check, and a full trace of
`sanitize.js`/`secretVault.js` are all `DEFERRED`.
