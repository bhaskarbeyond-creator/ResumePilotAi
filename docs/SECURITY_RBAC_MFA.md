# ResumePilot AI — Security, RBAC & MFA Architecture

> **Authoritative Security Architecture Specification**  
> **Source Commit:** `8c7905f`  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Zero-Trust Security Paradigm

ResumePilot AI implements zero-trust authorization across all network and process boundaries:

1. **Client Identity Disregard**: The backend gateway **never** trusts identity, roles, permissions, or plan entitlements sent in JSON request bodies.
2. **Cryptographic Identity Extraction**: The caller's identity is resolved solely from the validated Firebase Admin Auth JWT in the `Authorization: Bearer <token>` header.
3. **Fail-Closed Default**: Any request to an `/api/*` endpoint that is not in the explicit `publicApiPaths` whitelist is rejected with `HTTP 401 AUTH_REQUIRED` before reaching application code.
4. **Secret Isolation**: Secret API keys (NVIDIA, Gemini, OpenAI, Groq, Stripe, Razorpay, SMTP passwords) are stored exclusively in server-side Firestore secret vaults (`settings/ai_providers`, `settings/subscriptions`) and are never returned in client payloads.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Permission / Action | ANONYMOUS | USER | ADMIN | SUPER_ADMIN | TENANT_MEMBER |
|---------------------|:---------:|:----:|:-----:|:-----------:|:-------------:|
| View Public Pages (`/`, `/jobs`, `/blog`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Build & Download Resumes / Portfolios | ❌ | ✅ | ✅ | ✅ | ✅ |
| AI Content Generation | ❌ | ✅ (Quota) | ✅ | ✅ | ✅ (Tenant Quota) |
| Access Admin Console (`/adm/*`) | ❌ | ❌ | ✅ | ✅ | ❌ |
| View System Health & Audit Logs | ❌ | ❌ | ✅ | ✅ | ❌ |
| Modify AI Provider Keys / Settings | ❌ | ❌ | ❌ | ✅ (MFA) | ❌ |
| Manage Payment Gateways & Catalogs | ❌ | ❌ | ❌ | ✅ (MFA) | ❌ |
| Decommission / Suspend Tenants | ❌ | ❌ | ❌ | ✅ (MFA) | ❌ |
| Assign Operator Roles | ❌ | ❌ | ❌ | ✅ (MFA) | ❌ |
| Access Enterprise Console (`/enterprise`) | ❌ | ❌ | ❌ | ❌ | ✅ (Scoped) |

---

## 3. Four P0 TOTP MFA Security Invariants

The platform mathematically and programmatically enforces 4 core MFA invariants tested in `backend/test/totp-mfa-lifecycle.test.js` (246/246 tests passing):

```
1. AUTHENTICATED != MFA_AUTHENTICATED
   A standard authenticated bearer token (without second-factor verification claim)
   is immediately rejected when attempting Super Admin operations.

2. RECENT_AUTH != MFA_VERIFIED
   Having a freshly signed-in password session (auth_time < 10m) does NOT bypass
   the requirement for an enrolled second-factor TOTP claim.

3. STALE_AUTH != FRESH_AUTH
   Even if a user has enrolled TOTP, if their credentials auth_time exceeds
   the 10-minute freshness threshold, destructive mutations return RECENT_AUTH_REQUIRED.

4. AUDITED_MUTATIONS
   Every successful Super Admin mutation records an immutable, structured event in
   the Firestore collection 'security_audit_logs' with actorUid, IP, and X-Request-Id.
```

---

## 4. Rate Limiting & Abuse Defense

- **Global Gateway Limiter**: 2,500 requests per 15-minute window per IP / UID.
- **Sensitive Auth Limiter**: 20 requests per hour for password resets and verification emails.
- **AI Quota Engine**: Enforces strict daily account generation limits and per-minute burst ceilings (`aiAccountLimiter`).
- **Export Throttler**: Protects headless Playwright PDF generation from resource exhaustion (`exportAccountLimiter`).
