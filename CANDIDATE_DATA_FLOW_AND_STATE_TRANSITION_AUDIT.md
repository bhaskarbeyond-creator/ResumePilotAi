# Candidate data flow and state-transition audit

## Sources of truth and contracts inspected

| Entity | Source / transformations / access | State and mutation contract | Actual evidence and remaining gap |
|---|---|---|---|
| Identity/session | Firebase identity; conf/fire.js; main AuthWrapper; backend security/auth | authenticated/expired/signed-out; return path and account-scoped clearing | Source traced, existing local/static tests; no real identity session |
| Profile | users table; DashboardSettings normalizes source profile; profilePersistence expected revisions | input → saving → saved/conflict/error; auth identity email is authoritative | Existing profile tests run in product stage; real concurrent DB write/read-back blocked |
| Resume | canonical resume document; local draft/recovery is not authoritative server save | dirty version → saving → revision acknowledgement; failed navigation guard; publication revision separate from source revision | Builder binding/persistence guards checked; current source untouched; real refresh/version conflict blocked |
| Public resume | explicit public_resumes snapshot/projection, not private draft | private → explicit published snapshot → updated/revoked; getPublicResume enforces isPublished + explicit mode | Backend source inspected; authenticated/public/revoked cache journey not executed |
| Templates/export | template catalog → TemplateRenderer → SmartResumeComposer for CVs or CoverN components; separate DOCX theme mapping | input → rendered pages → local PDF / generator DOCX; production adds saved revision/entitlement/render-token gates | 220 fixture checks; 55 PDFs parsed/name verified, 51 DOCX XML employment/name verified. No live saved record → file pipeline. Missing glyphs and visual parity remain. |
| Job application vs tracker | applications table vs job_tracker; resume attached to application | owner submit / employer status/revision transitions vs personal kanban stage | Source anchors/tests exist; transition enumeration and DB replay/concurrency not complete |
| CBT interview | uid-scoped browser session/history + generated questions and local report | setup/active/completed/interrupted; completion/history restoration | Existing local lifecycle tests pass in product stage; no full browser/provider journey |
| Live interview | live_interview_sessions, opaque session id, revisions/idempotency keys; service-owned context | create → turns → complete/abandon/expiry | Routes/client source traced; server/provider/DB end-to-end blocked |
| Portfolio | portfolios owner data, slug availability and public projection | edit/save/publish/private/delete; optimistic conflict | Sanitization/template tests; live slug collision/revoke/ownership unverified |
| AI admission/usage | identity/tenant policy + MariaDB quota counters → provider routing → result/usage | admission rejected/quota exhausted/provider failed/completed; refunds/accounting need exact tracing | Many AI tests fail governance 503 before exercising target assertions; ai_quota_counters ownership declaration missing. Not verified. |
| Payments | provider orders/events → paymentActivation → subscriptions/transactions; callback/reconciler paths | pending/paid/failed/refunded and expiry; trusted provider evidence, not browser assertion | No payments made; actual state-machine/concurrency/callback signature tests blocked |
| Notification outbox | MariaDB transactional notification_outbox; enqueue with business mutation | NOTIFICATION_QUEUED → DELIVERY_ATTEMPTED → DELIVERED / RETRYING / DEAD_LETTER; lease expiry/reclaim | Source + existing unit tests. At-least-once SMTP delivery: crash after acceptance may redeliver. Never label exactly-once. Real worker/database unavailable. |

## P-21 notification flow verified locally

1. DashboardMain passes positional `showToast(type,title,text)`.
2. Component mount establishes a lifecycle generation. Each load carries a request sequence and generation. Superseded loads cannot change state.
3. `platform.apiJson` constructs authenticated request when a session exists. In this browser lab no real session exists and HTTP is intercepted; auth is not bypassed in production.
4. GET must return a notifications array. Missing array becomes explicit error rather than fabricated empty success.
5. Per-row action acquires synchronous id lock; bulk acquires mutually exclusive bulk lock. Controls reflect those locks. Two synchronous clicks cannot dispatch twice before React commits disabled state.
6. Row optimistic read state commits on success or rolls back that row on failure. Bulk snapshot rollback is safe from overlapping local row writes because those actions are locked out.
7. Generation guard prevents state and toast callbacks from an unmounted lifecycle. Bulk success uses the correct positional parent callback.
8. Real backend router's PATCH validates id/read-only body and updates `WHERE id = ? AND user_id = ?`. Bulk constrains `user_id` and unread state. Simulated SQL tests reject unexpected query shapes and cross-owner writes.
9. Browser fixture retains simulated records across reload so UI read-back can be exercised; **this is not database persistence**. No SQL audit trail or request-id join was established for this journey.

### State transitions covered

| Start | Event | End / invalid event rule | Evidence |
|---|---|---|---|
| initial/loading | valid GET | loaded (rows or empty) | browser load |
| loading | failed/malformed GET | error with retry, not caught-up | FI-10/11 |
| loaded unread | row PATCH pending | optimistic read + busy | FI-02 |
| row pending | repeated same row / bulk | rejected locally (no second request) | FI-02 |
| row pending | rejection | prior row read state + visible error | FI-05–08 |
| row pending | success | committed UI/read-back fixture | browser retry/reload |
| loaded with unread | bulk POST pending | all-read optimistic + rows disabled | FI-03 |
| bulk pending | row/repeated bulk | rejected locally | FI-03 |
| bulk pending | rejection | prior snapshot + error/retry | FI-09 |
| any request pending | unmount | no subsequent component side effects | FI-04; StrictMode FI-01 |

No revision/compare-and-swap was added to notifications. Cross-tab lost updates and an indefinitely hung request are residual risks, not covered by local action locks. Backend transaction semantics and user isolation across the complete middleware stack remain mandatory live-integration gates.
