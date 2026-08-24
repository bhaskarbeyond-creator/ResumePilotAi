# Local security test results

Execution date: 2026-08-14  
Environment: local Arena sandbox, Node.js 22  
Branch: `arena/019ffe7b-resumepilotai`

| Command / check | Result | Evidence summary |
|---|---|---|
| `npm run ci:security` | **PASS** | Completed lint, security tests, build, production audit, and all-dependency audit in sequence. |
| `npm run lint` | **PASS** | 0 errors; 558 warnings. |
| Root static/XSS/MFA test process | **PASS** | 22 tests passed, 0 failed. |
| Backend OAuth/payment/reset/auth/RBAC/rate-limit/SSRF/HTTP test process | **PASS** | 40 tests passed, 0 failed. |
| Aggregate `npm run test:security` | **PASS** | 62 tests passed, 0 failed. |
| `npm run build` | **PASS** | Vite production build completed. Non-failing bundle-size and dependency `eval` warnings remain. |
| `npm run audit:production` | **PASS** | Root 0 vulnerabilities; backend 0 vulnerabilities. |
| `npm run audit:all` | **PASS** | Root including dev tooling 0 vulnerabilities; backend including dev tooling 0 vulnerabilities. |
| Backend `node --check` for entry/security modules | **PASS** | Entry point, payments, OAuth, and reset modules parse successfully. |
| Workflow YAML parsing | **PASS** | `security-ci.yml` exposes `validate`; `codeql.yml` exposes `analyze`; expected triggers parsed. |
| Firebase CLI smoke | **PASS (limited)** | Firebase CLI version command executes. |
| `npm run test:firebase-rules` | **NOT EXECUTED** | Exit 1 before Emulator startup: Java executable unavailable. No rules test is represented as passed. |
| Live payment-provider sandboxes | **NOT EXECUTED** | No provider credentials/control-plane access; deterministic local fixtures only. |
| Live OAuth/MFA/SMTP/IMAP | **NOT EXECUTED** | Requires staging provider/Firebase/mail configuration. |
| GitHub-hosted Security CI / CodeQL | **NOT ACTIVE** | Templates validate locally but cannot be installed by the current GitHub App token. |

## Passing test coverage added for this evidence pass

- Stripe SDK webhook fixture signature, tamper, and wrong-secret behavior.
- Stripe order/intent/UID/plan/amount/currency binding.
- PayPal provider state/order/reference/UID/amount/currency mismatch cases.
- Razorpay HMAC and capture/order/amount/currency mismatch cases.
- Paytm and PhonePe completion/amount/currency mismatch cases.
- Provider event duplicate classification, order replay state, latest-order reversal, and membership renewal math.
- OAuth wrong session/state, provider mismatch, expiry, replay, PKCE verifier/challenge, malformed cookie, unverified identity, email-link attack, provider identity conflict, and MFA bypass decision.
- Password-reset token shape/hash, password policy, active-token replacement, email mismatch, expiry, used token, concurrent lease, stale lease, lease ownership, and enumeration delay.
- Native MFA implementation invariants, no secret storage, no application backup codes, local QR generation, and reauthentication before unenrollment.
- Tracked-secret and operational-script TLS scanning.
- Private/metadata/loopback/mapped network targets and HTTPS allowlist parser attacks.
- Removal of privileged test routes and replacement of debug health endpoints with `/healthz`.

## Non-passing warnings that remain

- 558 ESLint warnings, primarily legacy unused variables and effect dependency warnings.
- Vite reports large chunks.
- Vite reports direct `eval` inside the third-party `lottie-web` dependency; the enforcing CSP does not allow `unsafe-eval`, so expression-dependent animation behavior must be checked in deployed browser testing.
