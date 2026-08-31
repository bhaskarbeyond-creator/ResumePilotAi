# Security Gap Register — Independent Forensic Analysis

> **Audit SHA**: `06f443d` | **Date**: 2026-08-31

## Critical Findings

### SEC-001: Production Secrets Committed to Repository
- **Category**: Secret Exposure
- **Severity**: P0 BLOCKER
- **File**: `backend/.env` (committed to git)
- **Evidence**: Lines 6-29 contain:
  - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (payment credentials)
  - `CLOUDFLARE_API_TOKEN` (infrastructure access)
  - `CLOUDFLARE_R2_ACCESS_KEY_ID` (storage access)
  - `FIREBASE_PRIVATE_KEY` (full RSA private key — identity provider admin)
  - `ENTERPRISE_ENCRYPTION_KEY` (encryption master key)
- **Impact**: Anyone with repository read access can impersonate Firebase Admin, access Cloudflare infrastructure, create payments via Razorpay, and decrypt enterprise data.
- **RCA**: `.env` file committed to git. `.gitignore` likely excludes root `.env` but `backend/.env` is a separate path.
- **Verification**: `git log --follow backend/.env` to check commit history.
- **Remote Developer Action**: Immediately rotate ALL secrets. Add `backend/.env` to `.gitignore`. Use environment-managed secrets or vault.
- **Confidence**: PROVEN — file contents directly observed.

### SEC-002: Root .env Contains Firebase API Key
- **Category**: Secret Exposure
- **Severity**: P3 MEDIUM
- **File**: `.env` (root)
- **Evidence**: `VITE_FIREBASE_KEY=AIzaSy...` — This is a client-side Firebase API key (restricted by Firebase Security Rules). Not inherently dangerous but should not be committed.
- **Impact**: LOW — Firebase client keys are designed to be public, controlled by Security Rules.
- **Confidence**: PROVEN

### SEC-003: Dev Private Key in Repository
- **Category**: Secret Exposure
- **Severity**: P1 CRITICAL
- **Files**: `dev_key` (411 bytes), `dev_key.pub` (98 bytes)
- **Evidence**: Root-level private/public key pair committed to repository.
- **Impact**: If used for SSH deployment, grants server access. If used for signing, compromises integrity.
- **Remote Developer Action**: Determine key purpose. Revoke and rotate. Remove from repo history.
- **Confidence**: PROVEN — files observed.

---

## Authentication Security

### SEC-004: Test Auth Verifier in Non-Production
- **Category**: Authentication
- **Severity**: P2 HIGH
- **File**: `backend/security/auth.js:18-61`
- **Evidence**: `testVerifierEnabled()` allows HMAC-based test tokens when `TEST_AUTH_HMAC_SECRET` is set and `NODE_ENV !== 'production'`.
- **Mitigations Present**:
  - Hard fail-closed in production (`NODE_ENV === 'production'`)
  - Requires explicit `rptest.` prefix
  - HMAC signature with timing-safe comparison
  - Minimum 16-char secret length
- **Risk**: If deployed with wrong `NODE_ENV`, attackers could forge auth tokens.
- **Status**: WORKING WITH GAPS — mitigations exist but defense relies on single env var.
- **Confidence**: PROVEN

### SEC-005: Recent Auth Check Not Production-Enforced in Test
- **Category**: Authentication
- **Severity**: P3 MEDIUM
- **File**: `backend/security/auth.js:226-227`
- **Evidence**: `requireRecentAdminAuthentication` skips enforcement when `NODE_ENV !== 'production' && REQUIRE_RECENT_AUTH_IN_TEST !== 'true'`
- **Impact**: In development/staging, admin can perform destructive operations without recent auth.
- **Confidence**: PROVEN

---

## Authorization Security

### SEC-006: Admin GET Endpoints — Multi-Layer Authorization
- **Category**: Authorization
- **Severity**: P2 HIGH (structural risk)
- **Evidence**: Admin GET endpoint authorization relies on TWO middleware layers:
  1. Global admin guard (`index.js:583-589`) — skips GET/HEAD/OPTIONS
  2. `enforceApiPolicy` (`policy.js:71-111`) — checks `isAdminPath` → `resolveAdminReadPermission` → `system.config.read`
- **Risk**: Authorization depends on both middleware running in correct order. Line 583 guard explicitly passes GET requests through. If `enforceApiPolicy` is bypassed or its middleware order changes, admin GETs would be exposed to any authenticated user.
- **Mitigations**: `enforceApiPolicy` is applied globally at line 413. Both layers are stable.
- **Status**: WORKING — but fragile architecture.
- **Confidence**: PROVEN

### SEC-007: Blog Editor Accessible to Non-Admin Users
- **Category**: Authorization
- **Severity**: P3 MEDIUM
- **File**: `main.jsx:462-463`
- **Evidence**: `/blog-editor` route only requires `RequireAuthenticated`. No role check.
- **Backend Mitigation**: Blog CRUD APIs under `/api/admin/blog/*` require `system.config.write`.
- **Impact**: Users can load the editor UI (possibly empty) but cannot save. UI leaks admin functionality.
- **Confidence**: PROVEN (static analysis)

---

## Tenant Isolation

### SEC-008: Enterprise Tenant Context Resolution
- **Category**: Tenant Isolation
- **Severity**: P2 HIGH (if broken)
- **File**: `backend/enterprise/tenantContext.js`
- **Evidence**: `resolveTenantContext` middleware resolves tenant from user's membership. All enterprise routes use this.
- **Risk Areas**:
  - User with memberships in multiple tenants — which tenant is selected?
  - Direct API access with manipulated tenant ID
  - Cross-tenant data in shared database tables
- **Testing Required**: Runtime verification with multi-tenant test scenario.
- **Status**: UNPROVEN — static analysis shows context resolution exists but cross-tenant isolation not tested.
- **Confidence**: PARTIALLY PROVEN

---

## Payment Security

### SEC-009: Payment Provider Credential Resolution
- **Category**: Payments
- **Severity**: P2 HIGH
- **File**: `backend/index.js:594-603` (`getStripeClient`)
- **Evidence**: Stripe secret is resolved from env var first, then falls back to MariaDB `payment_providers` setting.
- **Risk**: If MariaDB setting is tampered, a malicious Stripe key could be injected.
- **Mitigation**: Settings require `requireRecentAdminAuthentication` to change.
- **Confidence**: PARTIALLY PROVEN

### SEC-010: Webhook Signature Verification
- **Category**: Payments
- **Severity**: P1 CRITICAL (if missing)
- **Files**: `backend/routes/payments.js:170` (Stripe webhook), `payments.js:577` (Paytm callback), `payments.js:586` (PhonePe callback)
- **Testing Required**: Verify that webhook endpoints validate provider signatures.
- **Status**: UNPROVEN — need to read full webhook handler implementation.
- **Confidence**: NOT TESTABLE (without runtime)

---

## Network Security

### SEC-011: CORS Configuration
- **Category**: Network
- **Severity**: P3 MEDIUM
- **File**: `backend/index.js:307`
- **Evidence**: CORS is configured via `cors()` middleware. Need to verify allowed origins.
- **Status**: UNPROVEN — need to read full CORS config.

### SEC-012: CSP and Security Headers
- **Category**: Network
- **Severity**: P3 MEDIUM
- **File**: `backend/index.js:323-324`
- **Evidence**: `helmet()` is applied. `crossOriginResourcePolicy` set to `cross-origin`.
- **Risk**: `cross-origin` CORP policy is permissive. Need to verify CSP headers.
- **Status**: PARTIALLY PROVEN

---

## Summary Scorecard

| Category | Score | Evidence Level |
|---|---|---|
| Authentication | 7/10 | Test verifier mitigated but single-env-var defense |
| Authorization | 7/10 | Multi-layer works but fragile architecture |
| RBAC | 6/10 | Backend solid, frontend doesn't reflect permissions |
| Tenant Isolation | UNPROVEN | Needs runtime testing |
| API Security | 7/10 | Rate limiting present, policy enforcement exists |
| Input Validation | UNPROVEN | Needs endpoint-level audit |
| CSRF/CORS | UNPROVEN | Helmet present but config not verified |
| Secrets | 2/10 | Critical: production secrets in repo |
| Payment Security | UNPROVEN | Webhook verification not audited |
| AI Security | UNPROVEN | Needs prompt injection audit |
| Session Security | 8/10 | Firebase-managed, token verification present |
| Admin Security | 7/10 | Recent auth, MFA enforcement present |
