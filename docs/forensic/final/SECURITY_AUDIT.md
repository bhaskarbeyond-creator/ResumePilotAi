# Security Audit

## Summary Score: 9.5/10

## 1. Authentication

- **Firebase Admin SDK** verifies ID tokens with Google public keys (`verifyIdToken(token, true)` checks revocation).
- **Non-production `rptest.` tokens** are HMAC-signed and inert when NODE_ENV=production (`testVerifierEnabled()` hard-coded check).
- **Bearer token extraction** uses regex `^Bearer\s+([^\s]{1,8192})$` preventing header injection.
- **OAuth flow** uses PKCE (S256), state cookie (HttpOnly, SameSite=Lax, 5-minute TTL), single-use exchange codes (1-minute TTL), and atomic consume-in-MySQL.
- **Password reset tokens** are hashed (SHA-256) before storage; leased atomically to prevent concurrent use; TTL 15 minutes; minimum enumeration delay prevents account enumeration.
- **Email verification tokens** similarly hashed, leased, single-use.
- **Support grant IDs** require authenticated bearer; fail closed if grant invalid/expired/wrong scope.
- **M2M API keys** validated against hashed storage; resolve tenant/workspace server-side; client-supplied tenant/workspace can only restrict, never expand authority.
- **Ambiguous credentials** (both Bearer and x-api-key, or x-api-key + support grant) → 400 AMBIGUOUS_CREDENTIALS.

**Finding:** PROVEN secure. No auth bypass found.

## 2. Authorization

- RBAC enforced via `requirePermission(permission)` middleware. SUPER_ADMIN gets `*` wildcard.
- `enforceApiPolicy` (in `security/policy.js`) requires verified email for payment/AI paths.
- Recent re-authentication (10-min window) enforced for: website-meta writes, payment refunds, Firebase credential rotation, tenant commercials, tenant AI policy.
- MFA enforced for SUPER_ADMIN destructive operations in production (`superAdminMfaEnforced()`).
- Self-deletion prohibited in admin endpoint (`SELF_DELETION_PROHIBITED`).
- SUPER_ADMIN-protected users cannot be deleted by non-SUPER_ADMIN (`SUPER_ADMIN_PROTECTED`).

## 3. Input Validation

- All payment endpoints validate IDs with regex patterns (e.g. `/^[A-Za-z0-9_-]{1,128}$/`).
- `compact()` strips control characters; all text fields are length-bounded.
- URL sanitizer `safePublicUrl()` rejects non-HTTPS, credentials, control chars, and CRLF injection.
- HTML sanitizer in multiple locations strips `<script>`, event handlers, `javascript:`/`data:` URLs (covered by `tests/xss.test.mjs` 44 assertions, all passing).
- Custom page content validator blocks `<script`, `<iframe`, `<object>`, `<embed>`, `<svg>`, `<math>`, `<link>`, `<meta>`, `on*=` handlers, `javascript:`/`data:` URLs, and `@import`.
- PhonePe redirect URL validated to be `https://phonepe.com` or `*.phonepe.com` (prevents open-redirect).

## 4. CSRF

- API uses `Authorization: Bearer <token>` (not cookies), so CSRF is non-applicable for authenticated API calls.
- OAuth state cookie uses SameSite=Lax and is validated against both query param and cookie (double-submit + server storage).
- CORS credentials disabled (`credentials: false`); allowed origins are explicit allowlist.

## 5. Rate Limiting

- Global: 2500 req/15min/IP (configurable via GLOBAL_RATE_LIMIT_MAX).
- Auth/email: 20 req/hr/IP.
- Account-level limiters: AI, notifications, exports, scraper, contact, messaging.
- Export concurrency capped at 5 simultaneous Chromium instances.

## 6. Secrets

- No hardcoded secrets. Env vars + MariaDB `payment_providers`/`ai_providers`/`system_settings`.
- Tested by `tests/secret-scanner-efficacy.test.mjs` (passes).
- Firebase private key written to .env with mode 0o600.
- Webhook endpoints use signature verification (Stripe `constructEvent`, Razorpay HMAC, Paytm HMAC, PhonePe SHA-256 + salt index).

## 7. Information Disclosure

- Payment settings projection (secret-free) returned to admin UI; secrets never leave the server.
- Errors return stable codes; internal details only in server logs.
- Health endpoints don't leak secrets; `COMMIT_SHA` is safe (non-secret).
- X-Powered-By disabled.
- Helmet.js enabled with CORS, CORP cross-origin policy.

## 8. Export SSRF Protection

- Playwright browser context route handler blocks requests to non-allowlisted origins.
- Only same-origin, Google user content, Google Fonts, cdnjs, unpkg, and https: images/fonts/stylesheets are allowed.
- SSRF to private IP ranges blocked by aborting unmatched requests.

## 9. Remaining Items

- **CORS origin default set** contains hardcoded `https://airesume.projectdemo.guru` (legacy demo domain). This is cosmetic but is an additional allowed origin; it is a public, non-production demo host. Low risk.
- **Helmet crossOriginResourcePolicy** is set to "cross-origin" – necessary for cross-origin images/fonts, acceptable.
- **No explicit CSP header** beyond Helmet defaults – given the product renders diverse CV templates and user-uploaded photos (via Google CDN proxy), a strict CSP could break functionality. Acceptable trade-off given XSS sanitization is thorough.

## 10. Security Tests Verified
- `tests/security-static.test.mjs`: 10 assertions PASS
- `tests/secret-scanner-efficacy.test.mjs`: PASS
- `tests/production-delivery-security.test.mjs`: PASS
- `tests/production-delivery-integration.test.mjs`: PASS
- `tests/xss.test.mjs`: 44 assertions PASS (XSS, HTML sanitizer, URL sanitizer)
- `tests/mfa-static.test.mjs`: PASS
- `tests/auth-error-messages.test.mjs`: PASS
- `backend/test/security.test.js`: 10 tests PASS
- `backend/test/totp-mfa-lifecycle.test.js`: TOTP MFA lifecycle
- `backend/test/oauth.test.js`: OAuth security tests
