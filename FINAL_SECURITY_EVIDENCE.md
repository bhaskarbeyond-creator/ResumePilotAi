# Final evidence-driven security validation

Validation date: 2026-08-14  
Branch: `arena/019ffe7b-resumepilotai`

## A. Implemented and locally validated

- **Authentication/RBAC:** Firebase bearer verification with revocation checks; exact public-route allowlist; role permissions; verified-email gates; recent-auth gates; namespaced admin aliases. HTTP and policy tests pass.
- **Admin/identity lifecycle:** no email/hostname/UID-pattern admin bootstrap; role, employer, suspension, deletion, and complimentary-entitlement changes cross audited server endpoints.
- **XSS:** all 147 resume-template HTML sinks call the central rich-text sanitizer. CMS/blog/application/print sinks use reviewed profiles. Active HTML, SVG, MathML, event, URL, data-image, CSS network-load, and print attacks pass locally.
- **URL/token leakage:** navigation parser rejects active schemes, URL credentials, protocol-relative URLs, controls, and encoded CR/LF. Firebase bearer injection is same-origin `/api/` only. OAuth/reset tokens use URL fragments where application-controlled.
- **Password reset:** 256-bit token shape, SHA-256 at-rest identifier, newest-token state, email binding, expiry, atomic lease, single use, refresh-token revocation, password policy, and response timing floor are directly exercised by deterministic tests.
- **OAuth local logic:** state-cookie binding, wrong state/session rejection, provider binding, expiry, replay rejection, PKCE derivation/input, verified identity, one-time exchange, identity conflict, and automatic email-link attack rejection are directly tested.
- **MFA source invariants:** Firebase native TOTP enrollment/sign-in/unenrollment APIs are used; enrollment requires authentication and verified email; custom-token LinkedIn/GitHub flow cannot bypass enrolled MFA; QR generation is local; no TOTP secret or reusable backup code is stored by the application.
- **Payments local logic:**
  - Stripe SDK webhook signatures accept authentic fixtures and reject tampering/wrong secrets.
  - Stripe intent binding tests wrong order, UID, plan, amount, currency, and intent.
  - PayPal fixtures test wrong provider state/order/reference/UID/amount/currency.
  - Razorpay fixtures test valid/invalid HMAC and wrong capture/order/amount/currency.
  - Paytm and PhonePe fixtures test success, pending/failure, amount, and currency mismatches.
  - Order states, duplicate events, latest-order refund targeting, and membership-extension math are tested.
- **Entitlement integrity:** server-owned catalogs and caller UID, owner-bound payment orders, transactional activation, server coupons, no browser entitlement date, fail-closed provider absence, and PDF/DOCX entitlement enforcement.
- **SSRF:** private/reserved/mapped/transition IPv4/IPv6 and local-name classifiers, HTTPS host allowlists, metadata/loopback literals, and URL userinfo/suffix confusion are tested. PDF browser egress and SMTP/IMAP DNS pinning are implemented and statically checked.
- **Abuse controls:** HTTP tests cover cross-account notification rejection, contact honeypot/validation/throttling, account limiter identity, oversized payloads, and unverified-user AI/payment denial.
- **Secret scanning:** every tracked textual file is checked for major provider/private credential forms and hardcoded password assignments. Operational scripts are also checked for disabled TLS verification.
- **Dependencies:** root and backend production/development audits report zero current findings with the checked-in lockfiles and overrides.
- **Build/static quality:** production build passes; ESLint has zero errors. Strong gates are errors for undefined identifiers, hook-order violations, switch lexical declarations, duplicate cases, unsafe prototype calls, and related correctness hazards.

## B. Implemented but externally unvalidated

- Firestore and Realtime Database deny-by-default rules and adversarial suites are implemented and CI-wired, but not executed locally because Java is unavailable.
- Firebase Identity Platform TOTP runtime enrollment, challenge, unenrollment, recovery/support handling, and multi-provider behavior.
- GitHub/LinkedIn production OAuth callback registration and providers' live PKCE/token behavior.
- Stripe CLI/test-mode event ordering and PayPal/Razorpay/Paytm/PhonePe sandbox schemas, refunds, callbacks, and reconciliation.
- SMTP/IMAP against real CA-valid servers, fallback behavior, bounce/complaint processing, and delivery suppression.
- Workload Identity/ADC and effective cloud IAM.
- Apache/static-host CSP headers on every production hostname and every payment/auth browser flow.
- Proxy hop/client-IP behavior through the actual load balancer/CDN/Apache/PHP chain.
- Development-tooling override compatibility for a complete Firebase Emulator run; Firebase CLI startup/version parsing works, but Java prevents Emulator startup.

## C. Remaining technical risks

- Short-window rate buckets, SMTP circuit state, export concurrency, and some background coordination are process-local and multiply/reset in a multi-instance deployment.
- PayPal/Razorpay/Paytm/PhonePe do not yet have complete, validated server webhook reconciliation comparable to Stripe.
- Recurring billing is partial. Current provider flows primarily create one-time orders/intents; `autoRenew` is not proof of a provider recurring agreement.
- Paytm/PhonePe refund APIs are not enabled. PayPal/Razorpay refund paths need sandbox contract proof.
- Coupon maximum-use concurrency/abandoned reservation cleanup requires production TTL/reconciliation validation.
- Native Firebase/Identity Platform recovery policy is external. The application intentionally has no reusable backup-code feature, so backup-code reuse is not an applicable local test.
- Custom-token GitHub/LinkedIn accounts cannot be automatically linked to an existing email/MFA account; an authenticated account-linking flow is not implemented.
- PDF Chromium still uses `--no-sandbox`; production isolation requires a dedicated non-root render worker/container and network policy.
- Image-resume import is disabled pending quarantined storage, malware scanning, and content disarm/reconstruction.
- Account merge/restore is disabled pending a provider-aware transactional implementation.
- Centralized logging, PII-redaction assurance, SIEM alerting, durable email outbox, dead-letter handling, and SLO monitoring are incomplete.
- Backup/restore and cross-store deletion (including RTDB/log/provider retention) lack a tested production runbook and restore drill.
- Lint warnings and large frontend bundles remain engineering/availability debt even though lint errors are zero.

## D. Required operational actions

1. **Immediately rotate the historically committed SSH password**, audit authorized keys/sessions/logs, and check password reuse. Follow `docs/HISTORICAL_CREDENTIAL_RESPONSE.md` without testing the old password.
2. Restrict or rotate the historical Firebase web API key and review its usage/quotas.
3. Confirm the historical Razorpay test key pair is disabled or intentionally retained; rotate it if unnecessary.
4. Coordinate an approved Git history purge after rotation if repository owners require removal from reachable objects, forks, and caches.
5. Install `.github/workflows/security-ci.yml` and `.github/workflows/codeql.yml` from `docs/ci-templates/` using an identity with workflow permission; follow `docs/CI_SECURITY_INSTALLATION.md`.
6. Enable branch protection requiring the installed Security CI and CodeQL checks; verify an intentional failure blocks merge.
7. Configure production secret-manager injection, Workload Identity, least-privilege IAM, TTL policies, provider budgets, and shared rate limiting.
8. Configure and test centralized logs, alerting, reconciliation jobs, incident response, backups, restore, and deletion retention.


## E. Required production validation

- Run both Firebase Emulator suites under Java 21, then deploy rules to staging and execute real query/index/ownership tests.
- Execute all five payment-provider sandbox matrices: legitimate success, wrong order/UID/amount/currency, signature failure, replay, duplicate/out-of-order events, cancellation, retry, refund, dispute, and renewal where recurring billing is intended.
- Run Stripe CLI webhook tests and provider-side accounting reconciliation.
- Exercise OAuth wrong/expired/replayed state and provider PKCE failures against registered staging apps.
- Exercise Firebase TOTP enrollment, sign-in challenge, recent-auth changes, device loss, recovery/support, factor removal, and provider combinations.
- Run CSP in report-only mode, then enforce after Firebase, Maps, PayPal, Razorpay, Paytm, PhonePe, and admin flows are clean.
- Validate SMTP/IMAP TLS, failover, bounces, suppression, and abuse controls with real providers.
- Conduct multi-instance race/load tests, DAST, CodeQL, independent penetration testing, and a backup/restore exercise.

## F. Test results

- `npm run test:security`: **PASS** — root static/XSS/MFA suite plus backend OAuth/payment/reset/auth/RBAC/rate-limit/SSRF/HTTP suite.
- `npm --prefix backend test`: **PASS**.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS with 0 errors**; warnings remain and are reported separately.
- `npm run audit:production`: **PASS, 0 findings**.
- `npm run audit:all`: **PASS, 0 findings**.
- `npm run test:firebase-rules`: **NOT RUN / NOT PASSED** — command is correctly wired but exits before Emulator startup because `java` is unavailable.
- Workflow YAML templates: parsed locally; **not active on GitHub**.
- Provider sandbox tests: **not run**; deterministic local fixtures are not represented as provider certification.

## G. Final readiness assessment

**Production-ready pending external validation** for the hardened codebase only.

This is **not production certification** and not a 10/10 claim. Go-live remains blocked until the historical SSH credential is rotated, Firebase rules execute successfully in Java-enabled CI/staging, required GitHub workflows are active and required, cloud IAM/secrets/proxy controls are proven, and all enabled payment/OAuth/MFA/mail providers pass their production-equivalent validation matrices.
