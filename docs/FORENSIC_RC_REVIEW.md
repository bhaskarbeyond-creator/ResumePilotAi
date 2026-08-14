# Forensic release-candidate review

Date: 2026-08-15. Scope: tracked application/backend source, rules, routes, browser storage, business-state displays, mocks, debug output, TODO/FIXME, and release tooling.

## FIX NOW — resolved in this pass

| Finding | Priority | Resolution |
|---|---:|---|
| Browser user bootstrap queried other accounts by email and attempted client-side data copying/identity merge. Rules usually denied it, but it produced noisy failures and represented an unsafe cross-account design. | P0 | Removed discovery/copy/merge behavior. New profiles bind only to `fire.auth().currentUser.uid`, start Basic, and rely on provider/server linking. |
| Checkout could reconstruct an identity from `localStorage` when no verified Firebase session existed. | P0 | Removed identity-independent storage fallback; checkout accepts AuthContext/props/current Firebase user only. API calls remain authenticated and same-origin. |
| Resume Validation returned random missing fields, fixed mock recommendations and fixed “AI” scores without calling AI. | P1 | Replaced with deterministic canonical-resume completeness and content heuristics; renamed it Resume Validation and computes a reproducible completeness score. |
| Naukri endpoint returned fabricated companies, salaries and jobs while claiming scraper success. | P1 | Endpoint now returns 501 `SCRAPER_NOT_CONFIGURED`; no demo listings are emitted. |
| Featured job/employer pages fell back to fabricated data and random candidate match percentages. | P1 | Empty/failure states are truthful; images are sanitized; random match values were removed. |
| Employer/application queries omitted known indexes, sampled unrelated collection documents for debugging and performed redundant client sorting. | P2 | Added deployable composite indexes, server ordering, removed sampling/PII logs and redundant sorting, and propagate query errors to existing retry UI. |
| Direct Firebase sign-out paths could leave Resume/Cover/interview/legacy identity state for the next account. | P0 | Auth listener clears the centralized account-scoped browser-key inventory whenever Firebase emits no user; explicit sign-out clears it before ending the session. Checkout no longer consumes legacy identity caches. |
| Browser source logged Resume, application, company, job, user, membership and form payloads. | P1 | Removed payload-bearing logs and added a repository-wide regression inventory. Non-sensitive development/diagnostic logs are classified separately rather than removed blindly. |
| Notification defaults invented payment amount, renewal plan, invoice number and ATS score when callers omitted authoritative values. | P1 | Defaults now say unavailable/not measured rather than fabricating business facts. |
| Welcome entitlement display called an authoritative server check, then attempted a direct browser downgrade and sent ignored client membership/expiry fields. | P0 | Client now sends no business-state inputs, displays the server result only, and no browser membership mutation function remains. |
| Remaining job/application order TODOs were locally actionable. | P2 | Added Firestore indexes and restored ordered queries; no TODO/FIXME remains in application/backend JS. |

## INTENTIONAL / ACCEPTED

| Finding | Rationale |
|---|---|
| Service-worker authenticated caching disabled | Prevents cross-account Cache Storage/IndexedDB disclosure; safe encryption/revocation/conflict architecture is absent. |
| English fallback and literal UI candidates | Existing product semantics are preserved. Professional translation and legal/product copy approval are required before migration. A deterministic inventory is committed. |
| Server operational `console.warn`/`console.error` | Needed for local diagnostics; request IDs and safe logging rules remain. Production aggregation/redaction requires infrastructure. |
| Legacy server-owned transactions in billing ledger | Retained for historical compatibility, explicitly labelled by source, never used to activate entitlement. |
| Static sitemap excludes dynamic content | Prevents accidental private indexing. Dynamic sitemap requires deployed server/edge integration. |
| Empty catches around optional browser storage/cleanup/parser fallbacks | Accepted only where failure is non-authoritative and cannot be surfaced usefully; durable mutations use explicit results. |
| Provider/sample content in Admin email/template previews | Clearly scoped preview fixtures, not operational state or public data. |

## REQUIRES EXTERNAL ENVIRONMENT / APPROVAL

- Firebase rules/index deployment and emulator execution (Java unavailable).
- Identity Platform, OAuth and provider reauthentication staging.
- Payment provider, SMTP/IMAP/Twilio and live PDF/browser journeys.
- Professional translation and legal copy review for inventoried strings.
- Central logs/metrics/alerts, distributed rate limits, backups, restore drills and production topology.
- Dynamic sitemap generation and edge HTTP 404 verification.
- Legal retention/invoice/GST/SAC decisions and independent accessibility/security/privacy testing.

No known P0/P1 code defect from this forensic inventory remains open locally.
