# Security validation status

Last local review: 2026-08-14

This document deliberately does **not** certify the application for production. It separates controls validated in this checkout from provider/runtime checks that cannot be proven locally.

## Implemented and locally validated

### Browser content and XSS

- All 147 resume-template rich-text sinks now call the centralized DOMPurify profile.
- Blog, CMS, application-cover-letter, and printable-document rendering use centralized profiles.
- Entity-encoding `dangerouslySetInnerHTML` wrappers were replaced with React text nodes.
- Dynamic navigation reviewed during this pass uses the centralized URL parser at identified stored-content boundaries.
- Printable invoice HTML passes through one reviewed sink; scripts, event attributes, active CSS URLs, imports, frames, objects, and forms are removed.
- Adversarial tests cover script/event payloads, SVG/MathML, `javascript:` URLs, data-SVG images, CSS network loads, protocol-relative URLs, URL credentials, and encoded CR/LF.
- Apache header configuration includes CSP, HSTS, clickjacking, MIME-sniffing, referrer, permissions, and cross-origin policies. Inline bootstrap JavaScript was moved into the bundled source so `script-src` does not require `unsafe-inline`.

### API authentication and authorization

- Firebase ID tokens are verified with revocation checks at the default API boundary.
- Public routes are an explicit exact-match allowlist.
- Route policy enforces verified email, administrative permissions, recent authentication for high-risk operations, and SUPER_ADMIN-only role/credential changes.
- Former aliases such as `/api/auth/purge-orphaned-auth`, email logs/templates/resend, generic SMS, diagnostics, and test routes are covered by policy.
- Email/hostname/UID-pattern client admin backdoors and public first-admin initialization were removed. Roles come only from Firebase custom claims; ADMIN cannot grant roles or rotate Firebase credentials.
- User role, suspension, and complimentary entitlement administration crosses an audited server endpoint; Firebase Auth accounts are disabled/revoked transactionally with server-owned profile state.
- CORS is exact-origin based; wildcard project subdomains are no longer trusted.
- Request sizes, request IDs, structured errors, global IP limits, per-account notification/AI/export/scraper limits, and bounded PDF concurrency are implemented.
- Contact submissions cross a server-only moderation boundary with validation, honeypot handling, and per-source throttling; direct Firestore contact writes are denied.
- Integration tests attack missing/invalid tokens, admin aliases, unverified AI/payment use, cross-account email recipients, CORS suffix confusion, forged Stripe input, legacy payment bypasses, client-supplied entitlement dates, malformed provider confirmations, and oversized JSON.

### Firebase data authorization

- Firestore and Realtime Database both have deployment configuration and root deny-by-default rules.
- Firestore rules separate owner data, public approved content, employer-owned jobs, applicant-owned applications, admin data, billing state, secrets, reset tokens, and webhook/order ledgers.
- Client writes cannot set role, Premium membership, payment status, suspension, verification, or provider order state.
- Shared resumes carry an immutable owner and explicit publication marker.
- Realtime messages bind sender identity; participants are immutable after conversation creation; lookup/index writes are participant-bound.
- An adversarial Firestore Emulator suite is present in `tests/firestore.rules.test.mjs`.

### Authentication, OAuth, reset, and MFA

- Password reset tokens are 256-bit, hashed at rest, account-bound, single-use, leased transactionally, superseded by newer requests, and expire after 15 minutes.
- Password reset responses and minimum response timing are enumeration-resistant; password changes do not reactivate suspended users and revoke existing refresh tokens.
- Email verification is authenticated at issuance, UID/email-bound, hashed, superseding, leased, and single-use.
- GitHub/LinkedIn flows use PKCE, one-time server-side state, an HttpOnly SameSite state cookie, verified provider email, and a 60-second one-time Firebase custom-token exchange.
- Unsigned base64/localStorage OAuth sessions and direct SDK fallback identities were removed.
- OAuth does not auto-link by email and therefore cannot bypass an existing password/MFA policy.
- TOTP enrollment/sign-in/unenrollment uses Firebase Identity Platform native MFA. Secrets are no longer stored in Firestore or sent to a third-party QR service; QR generation is local.

### AI cost and secret boundary

- User AI requests use authenticated same-origin backend routes only.
- Browser build-time provider secrets and anonymous PHP AI proxies were removed/retired.
- Provider credentials are server-owned; client-supplied AI keys are rejected by user AI routes.
- Per-account burst limits and transactional daily quotas apply before provider invocation.
- Basic and Premium daily limits are server selected; quota state is server-only.
- Admin provider tests use fixed server destinations, not browser-supplied URLs.

### Payments

- Stripe, PayPal, Razorpay, Paytm, and PhonePe use server-owned catalogs and verified caller UID; browser amount/currency/user fields are ignored.
- Missing credentials fail closed; demo/soft-verification success paths were removed.
- PayPal and Razorpay orders are created on the server and bound to internal orders.
- Razorpay requires a timing-safe signature check plus provider-side captured-payment/amount verification.
- Paytm and PhonePe status is checked against an owner-bound internal order and server amount.
- Entitlement activation is transactional and idempotent. The browser only displays success after server state is `ACTIVE`.
- Stripe webhook signatures, event idempotency, metadata/amount/currency checks, failure events, refunds, and disputes are handled. Reversal does not remove a later legitimate purchase.
- Legacy arbitrary-amount Razorpay and client-expiry entitlement endpoints fail closed.

### Network, mail, and secret handling

- Reserved/private IPv4 and IPv6 ranges, mapped IPv6, transition/documentation ranges, local names, and insecure URLs are rejected by network helpers.
- SMTP/IMAP DNS results are validated and pinned for the connection to close DNS-rebinding TOCTOU; TLS certificate verification and SNI are mandatory.
- SMTP/IMAP configuration tests and dispatch reject unencrypted transports.
- PDF rendering blocks all network requests except the application origin and data/blob resources, preventing stored image/font SSRF.
- Firebase Admin v14 is used through a narrow modular adapter and supports Workload Identity/Application Default Credentials. Legacy service-account JSON auto-loading was removed.
- Local fallback secret files are written atomically with mode `0600`.

### Local evidence

- `npm run test:security`: PASS (XSS/static security tests plus backend unit/integration tests).
- `npm --prefix backend test`: PASS (19 tests at the time of this report).
- `npm run build`: PASS.
- `npm run lint`: PASS with **0 errors and 682 legacy warnings**; warnings remain technical debt.
- `npm run audit:production`: PASS at the high-severity gate.
- Frontend production audit: Critical 0, High 0, Moderate 2.
- Backend production audit: Critical 0, High 0, Moderate 6 (transitive Firebase Admin/Google client chain).

## Implemented but requiring external validation

1. Run `npm run test:firestore` with Java 21 and the Firebase Emulator. The local sandbox had no Java runtime and blocked JRE download, so the suite was implemented but could not be executed here.
2. Deploy Firestore and Realtime Database rules to a non-production Firebase project; run real client query/index tests and confirm existing documents match the new owner/status fields.
3. Enable Firebase Identity Platform TOTP MFA and test enrollment, reauthentication, recovery/support policy, multi-device behavior, and every Firebase sign-in provider.
4. Configure GitHub and LinkedIn production callback allowlists; validate PKCE/state/cookie behavior, denied consent, verified-email absence, duplicate email, and multi-instance state storage.
5. Validate Stripe webhook events using Stripe CLI and provider test mode, including replay, out-of-order success/failure, partial/full refund, dispute, delayed webhook, and later-purchase reversal.
6. Validate PayPal, Razorpay, Paytm, and PhonePe sandbox contracts against the exact current provider API schemas, status amount fields, capture timing, webhook/callback allowlists, replay behavior, refunds, and INR availability.
7. Confirm the India catalog prices/GST (`234.82`, `470.82`, `588.82 INR`) with product/finance and move tax/catalog administration behind audited server configuration before price changes.
8. Validate SMTP primary/fallback and IMAP against real CA-valid certificates, credential rotation, DNS failover, delivery suppression, bounce handling, and a shared rate-limit store.
9. Put account/global rate limits and OAuth transient records on production-grade shared infrastructure where multiple backend instances are used. Firestore quotas/state are durable; short-window process buckets are per instance.
10. Deploy the CSP in report-only mode first, exercise Firebase, Google/Facebook auth, PayPal, Razorpay, Paytm, Maps, exports, and admin pages, then enforce after resolving any legitimate blocked origins.
11. Configure `TRUST_PROXY_HOPS` only if the backend is not reached through the checked-in loopback PHP/Apache proxy; verify real client IP and spoofed `X-Forwarded-For` behavior at the load balancer.
12. Validate Workload Identity/ADC, IAM least privilege, Firestore TTL policies for token/state/quota documents, secret rotation, backups, alerting, centralized logs, and incident response.
13. Run CodeQL and the security CI templates from `docs/ci-templates/`. Arena's GitHub App could push source code but lacked GitHub's `workflows` permission, so workflow files could not be installed under `.github/workflows` in this session.
14. Perform DAST/SAST, malware/file-upload testing, dependency license review, browser compatibility, accessibility, load/DoS testing, and an independent penetration test in a production-equivalent environment.

## Known remaining risks / not yet complete

- 682 lint warnings remain; many are unused legacy code and hook dependency warnings. Lint has no errors, but warnings should be burned down rather than hidden indefinitely.
- Frontend bundles remain very large; this is primarily performance/availability debt.
- Six backend and two frontend production `moderate` dependency findings remain transitive. They have no high/critical finding at this time but require upstream monitoring.
- The PDF renderer uses Chromium `--no-sandbox` for container compatibility. Egress is blocked at the browser context and HTML is sanitized, but production should run the renderer in a dedicated locked-down sandboxed worker/container.
- Firebase custom-token OAuth is intentionally blocked from auto-linking existing email/MFA accounts. A separate authenticated account-linking flow is not implemented.
- Native LinkedIn/GitHub MFA requires configuring those providers through Firebase/Identity Platform OIDC. The custom-token compatibility flow refuses accounts with enrolled MFA instead of bypassing the second factor.
- Provider refund handling beyond Stripe still requires provider webhook implementations and external contract validation.
- Local process rate buckets are not a substitute for a distributed Redis/rate-limit service in a horizontally scaled deployment.
- File upload malware scanning, content disarm/reconstruction, and a quarantined object-storage pipeline remain to be implemented.
