# Production deployment checklist

Every item requires explicit evidence; unchecked items are not configured by repository code alone.

## Source and CI
- [ ] Protect production branch; require review, signed/verified commits as policy requires, and passing RC checks.
- [ ] Enable CI for `npm ci`, `npm run test:rc`, lockfile consistency and artifact retention.
- [ ] Enable CodeQL, secret scanning, push protection and Dependabot for root/backend ecosystems.
- [ ] Confirm GitHub App has workflow-file permission before activating repository workflows.

## Runtime identity and secrets
- [ ] Use Workload Identity/runtime service identity; do not deploy service-account JSON files.
- [ ] Store Firebase, OAuth, AI, payment, SMTP/IMAP and Twilio secrets in the platform Secret Manager.
- [ ] Grant least privilege, record access audit, define rotation and emergency revocation.
- [ ] Confirm no secret enters Vite/browser environment or public configuration.

## Firebase
- [ ] Create separate staging/production projects and authorized domains.
- [ ] Run Firestore/Realtime emulators and deploy reviewed rules.
- [ ] Deploy `firestore.indexes.json`; wait for indexes before traffic.
- [ ] Configure Identity Platform providers, TOTP MFA, email templates and token/session policy.
- [ ] Configure Storage CORS/rules only if object uploads are enabled.
- [ ] Establish Firestore/Auth export and restore procedures.

## Domains, proxy and transport
- [ ] Configure production `WEBSITE_NAME`, exact CORS origins and OAuth callback URLs.
- [ ] Configure DNS, TLS certificates, renewal and HTTPS/HSTS redirects.
- [ ] Forward trusted proxy headers correctly; reject spoofed forwarding headers at the edge.
- [ ] Apply CSP, frame, MIME, referrer and permissions policies at CDN/proxy and verify them externally.
- [ ] Verify canonical-host redirects, HTTP 404 behavior, robots and sitemap delivery.
- [ ] Review Apache/PHP proxy files; remove them from deployment if the Node same-origin backend is authoritative, otherwise configure identical auth/TLS/timeout controls.
- [ ] Ensure CDN never caches authenticated API responses, private exports or HTML containing account state.

## OAuth and authentication
- [ ] Validate Google/Facebook/LinkedIn/GitHub app review, callback, PKCE/state, denied consent and account conflict flows.
- [ ] Run email verification/update, reset, native TOTP enrollment/challenge/remove/re-enroll, expired challenge and lost-device support flows.
- [ ] Verify recent-auth enforcement and revocation across multiple instances.

## Payments and invoices
- [ ] Configure Stripe, PayPal, Razorpay, Paytm and PhonePe sandbox then production credentials.
- [ ] Verify signed webhook/callback endpoints, replay ledger, idempotency and exact amount/currency/UID/plan binding.
- [ ] Run success, pending, failed, cancelled, chargeback and refund reconciliation.
- [ ] Confirm invoice number allocation, GST/SAC/tax/discount rounding, supplier/customer snapshots and legal retention with Finance/Legal.
- [ ] Alert on webhook failure, reconciliation drift and incomplete refund/entitlement updates.

## AI, email and background work
- [ ] Validate each configured AI provider/model/fallback, timeouts, quotas, cancellation, output parsing and cost alerts.
- [ ] Validate SMTP TLS/delivery/bounce, IMAP TLS, Twilio delivery and credential failure behavior.
- [ ] Enable CMS scheduler on trusted workers; verify deployed index, multi-instance idempotency and failure alerts.
- [ ] Configure durable/distributed rate-limit and AI quota stores across instances.

## PDF/browser worker
- [ ] Install pinned Chromium and fonts in the worker image.
- [ ] Verify sandbox policy, resource/time/concurrency limits and private one-time render tokens.
- [ ] Test all templates, large/Unicode/RTL data, pagination, download, timeout, retry and popup blocking.

## Monitoring and operations
- [ ] Ingest structured logs and index request IDs without resume contents, tokens, secrets or unnecessary PII.
- [ ] Configure dashboards/alerts for readiness, auth/authorization, AI provider/quota, payment/webhook/refund, email, export, database, scheduler and deletion failures.
- [ ] Define on-call runbooks, escalation and safe diagnostic access.
- [ ] Configure liveness `/healthz` and readiness `/readyz` probes with appropriate thresholds.
- [ ] Run load/capacity tests and rolling-deploy/failover tests.

## Backups, privacy and release
- [ ] Define RPO/RTO, encrypted backup retention and execute a restore drill.
- [ ] Approve billing/security retention and account-erasure exceptions with Legal.
- [ ] Complete DPIA/privacy, accessibility, penetration and payment-compliance reviews.
- [ ] Run authenticated staging Journeys A–G and User A/User B cache isolation.
- [ ] Record exact deployed commit, build artifact digest, configuration version and rollback plan.
