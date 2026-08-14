# Release candidate validation matrix

Date: 2026-08-15. This matrix separates evidence available in the repository from work requiring external systems. “Locally verified” is not a production certification.

## Locally verified

| Area | Evidence |
|---|---|
| Product regressions | Consolidated Node suites cover AI contracts, Resume persistence/workflow, Portfolio, CMS, Admin, Profile/account, Job Tracker, i18n inventory/interpolation, analytics privacy, templates, sanitization, and release metadata. |
| Security | Static secret/TLS/XSS/MFA/OAuth/payment checks and backend deterministic provider/route/policy tests. |
| Rendering | All 51 CV and four cover-template entry points server-render representative data. |
| Build and lint | Production Vite build and repository ESLint command. |
| Dependency state | Root and backend production dependency audits through `npm run audit:production`. |
| SEO | Public static route metadata, dynamic Blog/Portfolio metadata, private-route noindex rules, robots exclusions, static sitemap, and explicit 404 route. |
| PWA privacy | Manifest remains installable; service-worker data caching is intentionally disabled and legacy registrations are removed. No Cache Storage or IndexedDB authenticated data path exists. |
| Maintenance | Public config is audited; web shell blocks non-admin routes, preserves `/login`, and bypasses `/adm` only after a Firebase role claim. |
| Readiness | `/healthz` reports process liveness. `/readyz` fails when Firebase Admin is unavailable and marks providers not actively probed as `NOT_CHECKED`. |

Run `npm run test:rc` for the consolidated command. It emits `PASS`, `FAIL`, and `NOT EXECUTED / ENVIRONMENT BLOCKED` separately and exits nonzero for locally executable failures.

## Requires staging

| Area | Required validation |
|---|---|
| Firebase rules | Firestore and Realtime Database emulator execution with Java, then deployment against staging rules/indexes. |
| Firebase Identity Platform | Email verification/update, password reset, native TOTP enrollment/challenge/removal/re-enrollment, expired challenge, lost device, and provider reauthentication. |
| OAuth | LinkedIn/GitHub/Facebook/Google callback URLs, PKCE/state, account-link conflicts, revoked consent, and MFA interaction using staging apps. |
| Payments | Stripe, PayPal, Razorpay, Paytm, and PhonePe sandbox order creation, callback/webhook verification, idempotency, failure, refund, invoice, and entitlement reconciliation. |
| SMTP/IMAP/SMS | Credential loading, TLS, test delivery, bounce/failure handling, IMAP connectivity, Twilio delivery, and safe logs. |
| Browser journeys | Authenticated Chromium runs for Journeys A–G, keyboard/focus checks, account switching, responsive layouts, downloads, and popup-blocked retry. |
| PDF | Chromium PDF pagination, font fidelity, RTL, large Resume/Portfolio, timeout/failure/retry, private render-token consumption, and byte-level output checks. |
| CMS scheduler | Multi-instance transactional publication with deployed composite indexes and operational trigger configuration. |
| Search/indexing | Deployed 404 status behavior, canonical host redirects, dynamic sitemap strategy, robots fetch, and search-engine inspection. |

## Requires production infrastructure or independent review

| Area | Requirement |
|---|---|
| Workload Identity / Secret Manager | Confirm no long-lived service-account files, least-privilege runtime identities, rotation, access audit, and secret injection. |
| Distributed rate limiting/quotas | Shared durable store behavior across multiple instances, failover, clock boundaries, and alert thresholds. |
| Monitoring | Central structured log ingestion, request-ID search, dashboards and alerts for auth, authorization, AI quota/provider, payment/webhook/refund, email, export, database, scheduler, and deletion failures. |
| Backups/restore | Firestore/Auth/Storage backup schedules, restore drills, RPO/RTO, encrypted retention, and deletion-retention interaction. |
| Deployment topology | TLS termination, proxy headers, CORS host inventory, CSP headers, cache headers, health/readiness probes, rolling deploys, scheduler singleton/concurrency, and region failure. |
| Legal/accounting | Exact invoice numbering/GST/SAC requirements, billing/security retention periods, erasure exceptions, privacy disclosures, and data-processing agreements. |
| Independent testing | Screen-reader/contrast audit, penetration test, payment compliance review, privacy/legal review, and load/capacity tests. |

## Intentional limitations

- Authenticated offline caching remains disabled because safe cross-account encryption, key lifecycle, revocation, and conflict synchronization are not available in the current architecture.
- Static sitemap lists stable routes only. Dynamic Blog and Portfolio URLs require a deployment-backed sitemap generator before search submission.
- Readiness does not spend money or send traffic to AI/payment/mail providers. Their state remains `NOT_CHECKED` until an authorized staging probe runs.
- Browser/PDF, emulator, and provider checks must not be inferred from static tests.
