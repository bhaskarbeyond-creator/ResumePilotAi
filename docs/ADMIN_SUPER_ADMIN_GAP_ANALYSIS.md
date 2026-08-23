# Admin + Super Admin forensic gap analysis

## Baseline findings and fixes

| Finding in candidate baseline | Evidence | Fix implemented |
| --- | --- | --- |
| `backend/COMMIT_SHA` was UTF-16 with BOM and did not represent the checkout | `od` showed `ff fe` and NUL bytes | committed ASCII SHA; runtime validates/decode-tolerates legacy UTF-16; `/api/platform/version` and frontend build marker added |
| Razorpay settings page called `GET /api/admin/payment-settings`, but only a POST Admin route existed; the GET implementation lived at `/api/platform/payment-settings` | frontend `getAdminPaymentSettings` vs Express route inventory | frontend now calls the real `/api/platform/payment-settings`; response is masked, revisioned, and secret-safe |
| Payment blank fields had no deliberate clear contract | `setSubscriptionsData` always sent blank secret fields | empty/masked preserves; `clearSecrets` explicitly deletes Firestore-only credentials; env-managed clear returns 409; UI Clear controls added |
| Platform feature flag writer fetched `req.app.get('admin')`, which was never set | `backend/routes/platform.js` | uses `firebaseAdmin`, validates storage, transactionally audits |
| Enterprise flag was effectively environment-only in router/client while Firestore feature flag existed | sync `enterpriseFeatureEnabled()` in route/client | async effective flag is used by Enterprise/M2M routers, health, availability, and browser context |
| Several `fetchAdminWithReauth` callers treated `{response,data}` as a raw Response | `dbOperations.js` call sites | shared client now has canonical envelope plus compatibility facade; important Admin reads migrated to API contracts |
| Admin directory read profile fields only and could show stale roles/disabled/MFA | `getAllUsers` direct Firestore read | `/api/admin/users` joins Firebase Auth identity with Firestore profile; User Manager uses it |
| Tenant detail was only a list row and rename was handed off to a possibly unavailable Enterprise context | `/api/platform/tenants/:tenantId` and drawer | detail API and platform rename mutation added; drawer shows enterprise detail sections |
| Admin user UI exposed role/delete actions to plain Admin users | Users Manager row actions | controls are Super Admin-only and server routes enforce the same boundary |
| Queue/command-center health used zeros/healthy defaults when source unavailable | `inspectOutbox`, queue UI, command signals | null/unavailable values and source metadata; no fake healthy signal |
| API inventory and live scripts used stale fixed count/broad expected statuses | existing scripts/docs | source-generated 269-entry manifest; verifier requires response evidence and no broad 5xx whitelist; optional count only |
| Existing static tests contained commented payment assertions | `tests/admin-ai-settings.test.mjs`, `admin-settings-regression.test.mjs` | meaningful payment route/loader assertions restored; payment lifecycle unit tests added |
| Tracked certification scripts contained credentials | security-static failure | all credential values now required from environment and never printed |
| Admin alias `/admin` was a dead route | Enterprise app switcher links | route redirect preserves nested paths/query/hash |

## Remaining PARTIAL/UNVERIFIED items

- **LIVE:** production authentication, real Firebase claims, MFA, provider credentials, Firestore indexes, live mutations, CDN SHA, and responsive browser execution are not available here.
- **Infrastructure secrets:** Firebase Admin private key, KMS/Secret Manager, Cloudflare, SMTP, payment, OAuth, and Twilio secrets remain deployment-owned; the UI exposes status/remediation only.
- **Worker liveness:** worker flags and outbox samples are observable; a separate external worker heartbeat is not implemented by this Firebase-only architecture.
- **Provider tests:** Razorpay/Stripe/PayPal/Paytm/PhonePe live provider test calls require real accounts and are intentionally not run in CI.
- **Legacy public reads:** public review/ad/category readers retain public Firestore reads because the rules allow read-only public content; moderation reads use new Admin APIs.

No item above is presented as PASS without the Local Developer runbook.
