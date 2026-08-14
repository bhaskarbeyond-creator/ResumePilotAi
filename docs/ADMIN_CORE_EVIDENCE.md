# Admin core operational evidence

Validated on 2026-08-14 against the reachable grafted history and the protected CMS commit `f5be659`. This is the first Phase 3 Admin slice; CMS files and Profile workflows are kept out of this commit.

## OLD vs CURRENT vs INTENDED

| Area | OLD / pre-slice behavior | CURRENT / intended behavior |
|---|---|---|
| Admin shell | The header hard-coded a demo administrator email, external demo URL, inert search box, and unconditional `SYSTEM ONLINE`. Auth left a listener attached and considered a local-storage UID while checking access. | Access is based only on the current Firebase user and verified role claim. The listener is unsubscribed, loading/denied states are explicit, the real signed-in email is shown, logout works, the live-site link is same-origin, and `/healthz` drives a refreshable reachable/degraded label. |
| Dashboard metrics | “Live metrics” and percentage trends were invented. Missing reads displayed zero. Subscription fields were passed in the wrong order and every record displayed Active. | Three data sources load concurrently. Missing values display Unavailable, no trend is inferred, legacy aliases normalize canonically, expiry/status is derived only when evidence exists, and empty/error/retry/table states are explicit. |
| Settings navigation | Sidebar/header dots inferred provider health from browser-visible key fields, including redacted fields, and labelled systems 100% operational without a probe. | Navigation indicators show selection only. Settings headers say “Configuration panel”; provider/service health appears only in the verified health summary. No provider secret is returned. |
| Health settings | “Full diagnostics” called an unsupported route type, then substituted Online/Ready/Configured defaults for missing results. Save ignored failed persistence and claimed maintenance restricted public users although the shell does not enforce a lock. | `/api/admin/health-summary` returns only backend/Firebase reachability and server-side configured booleans. It makes no live-provider claim. Maintenance configuration uses a recent-auth backend route, bounded input, public config, and `SYSTEM_HEALTH_SETTINGS_UPDATED` audit records. The UI explicitly documents that infrastructure controls are still required for an access lock. |
| User lookup | “Email or ID” accepted an email input but queried email only, logged personal records, and dropped Firestore document IDs when `userId` was absent. | Exact validated UID performs one document read; email uses bounded exact lookup; no PII is logged; canonical document ID fallback prevents wrong/empty targets. Loading, empty, error, refresh, and live-region states are explicit. |
| User changes | Role, suspension, and membership toggles executed immediately from potentially stale rows. Admin grants had no confirmation. | Every privileged/financial user change has an explicit labelled confirmation. The client sends expected role/suspension/membership. The backend compares Firebase/Auth and Firestore state, returns `ADMIN_TARGET_CHANGED` on stale targets, permits exactly one mutation per request, preserves self-protection and permission checks, and audits successful changes. |
| Employer review | Approve/reject/reactivate executed immediately and did not verify loaded application status; rejection reason was normally empty. | Confirmation identifies the target and loaded status. Reject/revoke requires a bounded reason. Backend compares expected status before custom-claim changes, returns a stale-target conflict, revokes tokens, and audits the result. |
| User deletion | Related cleanup exceptions were swallowed and the endpoint still claimed all owned data was deleted. Auth/profile deletion order made retry difficult; authored CMS posts were orphaned. | UID/email and SUPER_ADMIN checks use Auth plus profile fallback. Portfolio, published portfolio, applications, employer record, notifications, blog posts, and profile-tree cleanup are tracked. Partial cleanup creates `USER_DELETION_INCOMPLETE`, returns failure with retry guidance, and keeps the profile row until related cleanup succeeds where possible. Success lists only the stores actually handled. |
| CSV export | Spreadsheet formula values could execute when an admin opened CSV output; object URLs were not released. | Every cell is quoted/escaped and formula-leading values are neutralized; the object URL is revoked and no-data feedback is accessible. |
| Generic settings | Panels wrote directly to an unreadable Firestore document, cached redacted settings across accounts in `localStorage`, ignored `{success:false}`, and could overwrite stale categories. | Generic categories use a recent-auth backend endpoint, bounded normalization, secret/public split stores, changed-field audit records, per-category revisions, and conflict rejection. Browser cache recovery was removed. Secret storage documents now deny browser reads and writes. SMTP runtime save results are checked before success. |
| Job moderation | Admin job status/feature/delete used direct SDK writes with no audit or stale check. Notifications usually failed under owner-scoped rules, delete could orphan applications, search fired a full collection read per keypress, and confirmation used `window.confirm`. | Recent-auth backend transactions verify loaded state, allow one mutation, write employer notifications and audit events, and reject stale rows. Jobs with applications must be archived. Direct admin SDK mutation is denied by rules. Dialogs are accessible, search is debounced, stale loads are ignored, status filters reduce reads, and pagination clamps after deletes. |
| Company moderation | Approve/reject/feature operations wrote directly through the SDK, had no stale protection/audit/confirmation, accepted blank rejection reasons, and rendered untrusted image URLs. | Recent-auth backend transactions verify status/feature/timestamps, require rejection reasons, notify owners, and audit each change. Direct admin SDK writes are denied, confirmation is accessible, and admin image previews use the shared URL sanitizer. |
| Reviews and global rating | Review create/delete and rating updates used unawaited direct SDK writes, had no audit or confirmation, reported false success, created records without approved status, rendered a false “Active” metric, and truncated fractional ratings with `parseInt`. | Recent-auth backend routes validate/bound records, publish explicit approved reviews, revision-check deletes, audit create/delete/rating changes, and deny direct review writes. The UI confirms destructive/global changes, reports backend failures, refreshes stale results, and averages only valid finite ratings. |
| Contact messages | PII was logged, loading/errors were shown as an empty inbox, “Search” and “Filter” buttons were inert, Today counts reparsed locale-only strings, rows used indexes as identity, and no pagination existed. | Firestore document identity and real timestamps are preserved without logging content. The view has distinct loading/error/empty states, retry, working text/date filters, deterministic date calculations, accessible expansion semantics, and 20-row pagination. |

## Security and integrity controls

- Admin shell authorization remains claim-based; browser email/profile fields never grant access.
- `/api/admin/*` still requires `system.config.write`; user/employer updates additionally use existing fine-grained permissions and recent authentication.
- Health responses expose configured booleans only—never provider keys, SMTP credentials, payment secrets, or Firebase private keys.
- User role and suspension continue to update Firebase Auth server-side and revoke refresh tokens.
- Membership remains a server-side administrative entitlement with bounded duration and `payments.manage` authorization.
- Stale-target checks happen before side effects. Multi-field user mutations are rejected to avoid partial mixed operations.
- Deletion audit records distinguish complete from incomplete cleanup.
- Generic configuration secrets are written only to a server-owned document denied to browser reads/writes; curated redacted fields alone enter `public_config`.
- Job moderation is backend-only for administrators; employer-owned pending edits retain their existing rule path.
- No analytics metric is used as billing, entitlement, or user-state truth.

## Performance measurements

These are operation-count/critical-path improvements, not synthetic production latency claims:

- Dashboard’s three independent reads changed from sequential callbacks to one `Promise.allSettled` critical path (sum of three response times becomes approximately their maximum while preserving partial-error reporting).
- Exact UID lookup changed from an ineffective email collection query to one document read.
- Sidebar and Settings headers no longer issue duplicate settings reads solely to calculate unverified colored dots.
- Job text search now performs at most one collection operation after a 350 ms idle period instead of one operation per keystroke; status equality is applied in Firestore before in-memory text filtering.
- Latest production build passed in 4.03 seconds; dependency chunk warnings are unchanged.

## Validation

- Admin targeted tests: 10/10.
- Product suite: 52/52 plus template render 1/1.
- Security suite: static/browser 22/22 plus backend 64/64.
- Backend integration covers stale-session rejection for maintenance, generic-settings, job, company, user, and employer operations and ordinary-user rejection for admin routes.
- Production build: passed in 4.03 seconds (latest message-view validation build).
- ESLint: 0 errors, 499 warnings (down from the protected 505-warning baseline).
- `git diff --check`: passed.

## Remaining limitations for continued Phase 3 work

- Some category-specific settings panels still need deeper semantic validation and runtime-provider integration tests even though their generic persistence boundary is now revisioned, audited, bounded, and split.
- Landing pages, trusted-by content, invoice/order tables, and their bulk/search/pagination workflows remain under active audit and are not certified by this slice.
- Firebase Auth and Firestore cannot be committed atomically together. Server failures are reported, but production reconciliation/alerting remains required for rare cross-service partial failures.
- Financial ledgers and legally retained billing records are intentionally not deleted by the user-admin cleanup endpoint; the later account-lifecycle evidence must define retention and erasure policy precisely.
- Account merge/restore functions remain intentionally disabled because no provider-aware transactional identity workflow exists; the UI still needs a focused disabled-state cleanup.
- Maintenance mode is stored and audited but the current application shell does not enforce access blocking.
- Live Firebase/Admin SDK, provider, payment, mail, browser automation, and production IAM validation were unavailable and are not claimed.
