# Security control evidence matrix

Status vocabulary:

- **Local PASS** — implementation is exercised by a passing local automated test.
- **Static PASS** — source/configuration invariant is checked locally, but no live provider/runtime was used.
- **Implemented / external** — code exists; authoritative validation requires a provider, cloud project, network, or production-equivalent runtime.
- **Partial** — a meaningful part exists, but an enterprise control is incomplete.
- **Not implemented** — no complete control exists; product path is disabled or must remain blocked.

| Boundary | Implementation evidence | Test/evidence | Status |
|---|---|---|---|
| Default API authentication | `backend/security/auth.js`, `/api` boundary in `backend/index.js` | Missing, malformed, and injected-token HTTP tests | Local PASS |
| Route RBAC and recent auth | `backend/security/policy.js` | Admin alias, namespaced alias, stale-admin, SUPER_ADMIN permission tests | Local PASS |
| Firestore authorization | `SecurityRules.txt` | `tests/firestore.rules.test.mjs` exists and is wired to Emulator command | Implemented / external (Java Emulator not run locally) |
| Realtime Database authorization | `Realtime_database_Security_rules.txt`; server-only writes | `tests/database.rules.test.mjs` exists and is wired to Emulator command | Implemented / external (Java Emulator not run locally) |
| XSS / rich content | `src/utils/sanitizeHtml.js`; all 147 CV sinks use `sanitizeRichText` | 21 root security/XSS/MFA tests include active HTML, SVG, MathML, URL, data image, and CSS attacks | Local PASS |
| Navigable URL safety | Central URL parser and reviewed stored-content boundaries | Parser differential and encoded-CRLF tests | Local PASS |
| Printable HTML | One centralized sanitized print sink | Script/event/CSS network-load tests | Local PASS |
| CSP / static headers | `.htaccess`, `public/.htaccess`, no inline bootstrap | Static CSP invariant test | Static PASS; deployed-header behavior external |
| Password reset | Hashed 256-bit token, active-token state, lease, expiry, refresh-token revocation | `backend/test/reset.test.js` plus HTTP timing test | Local PASS for state/policy; Firebase runtime external |
| Email verification | Authenticated issuance, hashed state, UID/email binding, lease | Shared reset-state validators and route/static review | Static PASS; mail/Firebase runtime external |
| OAuth state / replay / PKCE | `backend/security/oauth.js`, Firestore single-use state/exchange, HttpOnly state cookie | Invalid/wrong/expired/replayed state, PKCE input, cookie, exchange tests | Local PASS for local logic; provider acceptance external |
| OAuth account linking | Provider-specific UID; no automatic email linking | Account-link and identity-conflict tests | Local PASS |
| OAuth MFA bypass | Custom-token OAuth rejects users with enrolled MFA | Deterministic account-link/MFA test and MFA source invariant | Local PASS for bypass decision; Identity Platform external |
| Native TOTP MFA | `src/services/mfaService.js` uses Firebase native enrollment/assertion/unenrollment | Static implementation/invariant tests | Static PASS; Firebase Identity Platform runtime external |
| MFA recovery | Delegated to Firebase/provider support policy | No local provider recovery test | Partial / external |
| Backup code reuse | Application issues and stores no backup codes | Test proves no generated/stored reusable backup-code implementation | Not applicable; no application backup-code feature |
| AI authentication / quota | Server-only provider calls, account burst limiter, Firestore daily quota | Auth, verified-email, account-limit, key/static tests | Local PASS for boundary; provider budget/Firestore runtime external |
| Stripe webhook signature | Stripe SDK raw-body construction and verified webhook route | Authentic/tampered/wrong-secret deterministic Stripe test | Local PASS |
| Stripe binding/replay/reversal | Order/intent/UID/plan/amount/currency checks; event ledger; latest-order reversal | Deterministic binding, duplicate-event, renewal and reversal tests | Local PASS for logic; Stripe CLI/sandbox external |
| PayPal verification | Server-created order and exact provider response binding | Wrong state/order/UID/reference/amount/currency fixtures | Local PASS for response validator; sandbox external |
| Razorpay verification | Server-created order, HMAC, provider capture fetch | Valid/invalid signature and wrong capture/order/amount/currency fixtures | Local PASS for response validator; sandbox external |
| Paytm verification | Owner-bound internal order and status/amount/currency checks | Success/pending/wrong amount/wrong currency fixtures | Local PASS for response validator; sandbox schema/signature external |
| PhonePe verification | Owner-bound internal order, HTTPS PhonePe redirect allowlist, status/amount checks | Success/pending/wrong amount fixtures | Local PASS for response validator; sandbox schema/signature external |
| Payment idempotency | Deterministic Stripe order IDs, provider event IDs, transactional activation | Replay states and duplicate provider-event tests | Local PASS for local logic; distributed/provider ordering external |
| Refunds | Stripe webhook reversals; admin Stripe/PayPal/Razorpay refund calls; latest-order guard | Refund-target guard test | Partial; provider refund APIs/webhooks external, Paytm/PhonePe refunds not enabled |
| Cancellation / renewal | Server-owned preference request; membership extension math | Renewal math test | Partial; current orders are primarily one-time payments, not proven provider subscriptions |
| Coupon integrity | Server-owned lookup/discount, reservation, post-activation usage | Static/code review; no Firestore transaction Emulator fixture yet | Partial / external concurrency validation |
| SSRF network classification | `backend/security/network.js`; pinned SMTP/IMAP DNS; fixed provider destinations | IPv4/IPv6/metadata/local-name/URL allowlist tests | Local PASS for classifier; DNS/provider network external |
| PDF renderer SSRF | Same-origin-only Playwright request interception | Static invariant plus source review | Static PASS; browser exploit/container isolation external |
| SMTP/IMAP TLS | Required encryption, CA verification, SNI, DNS pinning | Static TLS test and network helper tests | Static PASS; real servers external |
| Email/SMS abuse | Owner recipient binding; route/account limits; SMS admin only | Cross-recipient and rate-limit HTTP tests | Local PASS for process-local boundary; distributed limit external |
| Contact abuse | Server-only collection, validation, honeypot, per-source rate | HTTP validation/honeypot/limit tests | Local PASS |
| Messaging abuse | Job-application-authorized conversation creation; server writes; account limit | HTTP auth tests; RTDB write-denial suite external | Partial until Emulator executes |
| Secret exposure in current tree | Current files scrubbed; no browser provider secrets; secret-store reads denied | Every tracked text file credential-pattern test | Local PASS for current tree |
| Historical credentials | Current values removed; response runbook documents evidence without values | Git history review | Unresolved operational incident until rotation/history action |
| Dependency security | Root/backend overrides and current lockfiles | Full and production `npm audit` | Local PASS at review time |
| Lint/static quality | Strong rules for undefined variables, hook order, switch hazards | ESLint | Local PASS with warnings remaining |
| CI security workflow | Complete templates and installation runbook | YAML/source review; Firebase CLI version smoke | Implemented but inactive; GitHub workflow permission required |
| CodeQL | Template uses `security-extended` | Template review only | Implemented but inactive |
| Workload Identity / IAM | Admin adapter supports ADC | Code path and local limited-mode startup | Implemented / external |
| Distributed rate limiting | Durable daily AI quota; process short-window buckets | Single-process tests | Partial; shared limiter not implemented |
| Central monitoring / SIEM | Request IDs and audit documents | Source review | Partial; centralized sink/alerts/retention not implemented |
| Backup / restore | Dangerous browser merge/restore disabled; server recursive deletion | Static/source review | Partial; backup/restore drill and complete cross-store lifecycle not implemented |
