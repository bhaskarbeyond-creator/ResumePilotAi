# Historical discrepancy status index — incomplete triage

Baseline `0512c0cfbca7a2fd6a3911e65b72621385f9b10f`. IDs and headings transcribed from `developer-review/DISCREPANCY-LOG.md`. This index does not establish acceptance, deduplication, root cause, or complete per-finding acceptance criteria; consult the historical register. The aliases DISC-042 and DISC-046 are recorded there as merged into DISC-030. All other historical findings are NOT STARTED unless explicitly listed below.

| ID | Historical title | Current status |
|---|---|---|
| DISC-001 | Two parallel, divergent frontend source trees create active-implementation ambiguity | NOT STARTED |
| DISC-002 | Inconsistent project identity across repository metadata | NOT STARTED |
| DISC-003 | Release governance explicitly declares the project below its own production-readiness bar, with three unexecuted human-gated verification bars | NOT STARTED |
| DISC-004 | Production AI-provider credentials are unprovisioned placeholders, blocking end-to-end verification of every AI-dependent feature | NOT STARTED |
| DISC-005 | No pinned Node.js engine version across three independent dependency manifests | NOT STARTED |
| DISC-006 | Content-Security-Policy weakens inline-style protection (`'unsafe-inline'` on `style-src-attr`/`style-src-elem`) | NOT STARTED |
| DISC-007 | `reference-code/` baseline mixes source, build artifacts, and a committed binary archive, weakening its validity as a clean parity baseline | NOT STARTED |
| DISC-008 | Five WCAG 2.1 AA violations on the public landing and pricing pages (one critical) | NOT STARTED |
| DISC-009 | The claimed backend test count (1,356) is not reproducible; the runner discovers 1,315 | NOT STARTED |
| DISC-010 | Baseline migration header claims MySQL compatibility while later migrations are MariaDB-only | NOT STARTED |
| DISC-011 | `freellmapi-admin-e2e.spec.ts` hardcodes `localhost:5173`, contradicting the project's own Playwright configuration (:4000 + `webServer`) | NOT STARTED |
| DISC-012 | The accessibility suite's `ime_dev_user` shim does not authenticate the router, so "authenticated surface" assertions silently run against the login page | NOT STARTED |
| DISC-013 | Thirty legacy capabilities were not ported to the active frontend, with no recorded retirement decision | NOT STARTED |
| DISC-014 | Nine admin capabilities render from fabricated state, including a false assertion that a security action succeeded | NOT STARTED |
| DISC-015 | Portfolios created with the legacy page editor are permanently read-only | NOT STARTED |
| DISC-016 | Half of the backend's operation surface (192 of 384) is unreachable from the modern UI | NOT STARTED |
| DISC-017 | Internationalisation, product analytics, per-route SEO and the offline shell were removed wholesale | NOT STARTED |
| DISC-018 | Prior published figures for the legacy tree were understated by roughly 4.5× | NOT STARTED |
| DISC-019 | OAuth provider breadth regressed from four integrations to one | NOT STARTED |
| DISC-020 | Employer rejection feedback is written to a field the MySQL adapter never persists; the CAS counter is likewise inert | NOT STARTED |
| DISC-021 | Applicant-scoped application reads are not field-projected, unlike the sibling endpoint | NOT STARTED |
| DISC-022 | A Facebook provider is constructed and advertised while no sign-in path exists | NOT STARTED |
| DISC-023 | The legacy inventory counted a test file, inflating its own baseline by one | NOT STARTED |
| DISC-024 | The V4 reachability register was wrong in both directions: 45 operations under-classified, 14 over-classified, 1 absent | NOT STARTED |
| DISC-025 | 17 client-side paths are served by no backend operation — blog, queue console, moderation, operations and user-status actions 404 at runtime | IN PROGRESS — queue and coupon subset only; see contract dispositions |
| DISC-026 | Admin controls fabricate success after swallowing a failed write (suspend user, backup, cache purge, blog delete) | NOT STARTED |
| DISC-027 | 17 client-call paths (27 call sites) have no registered backend operation | NOT STARTED |
| DISC-028 | Recruiter "Message candidate" posts to a non-existent route and displays "Message Dispatched!" | NOT STARTED |
| DISC-029 | Support help desk has no backend at all; tickets, replies and status changes are fabricated | NOT STARTED |
| DISC-030 | Moderation queue is a fixture and both decisions target unregistered routes | NOT STARTED |
| DISC-031 | User manager renders fabricated accounts when the API fails, and the status toggle targets a missing route | NOT STARTED |
| DISC-032 | Employer portal messaging is component state only; the real messaging stack is unused on the employer side | NOT STARTED |
| DISC-033 | Employer Team Seats screen is local state: invites "succeed" without a request | NOT STARTED |
| DISC-034 | Team member management (list/add/remove) removed from the enterprise teams tab while its API survives | NOT STARTED |
| DISC-035 | Audit trail narrowed to the newest 100 events; JSON export and deep links removed | NOT STARTED |
| DISC-036 | 100 template ids are generated from 5 structural archetypes; 51 bespoke layouts and 4 cover templates are gone | NOT STARTED |
| DISC-037 | Eight email-administration subfeatures are unexposed in the UI while their endpoints remain server-only | NOT STARTED |
| DISC-038 | Voice interview mode removed entirely: 2,432 lines of speech/audio code, zero replacement | NOT STARTED |
| DISC-039 | Blog editor downgraded from TipTap rich text to a Markdown textarea; the entire blog data path is unregistered | NOT STARTED |
| DISC-040 | Legacy download helpers (PDF/DOCX) have no recorded disposition in the share and job-editor rows | NOT STARTED |
| DISC-041 | The reachability register never scanned a router that is not named `router` — 8 live operations and 6 "missing" client paths were audit artefacts | NOT STARTED |
| DISC-042 | MERGED INTO DISC-030 — Admin moderation writes to endpoints that do not exist while equivalent REST operations do | NOT APPLICABLE — historical merge alias to DISC-030 |
| DISC-043 | The public job board calls `GET /api/jobs`, an operation that does not exist; the real public listing is `/api/jobs-data` | NOT STARTED |
| DISC-044 | Employer→candidate email has no backend route, and the service that would send it is orphaned | NOT STARTED |
| DISC-045 | Checkout validates coupons against a non-existent endpoint, then applies hardcoded promo codes locally | IMPLEMENTED — NOT VERIFIED (browser/DB) |
| DISC-046 | MERGED INTO DISC-030 — The moderation tab renders fixture records and never reads the backend | NOT APPLICABLE — historical merge alias to DISC-030 |
| DISC-047 | An empty support inbox still displays fixture tickets | NOT STARTED |
| DISC-048 | The resume photo upload accepts 5 MB into a request body the API caps at 256 KB | NOT STARTED |
| DISC-049 | M7's provenance claim is false in two ways, and the ref it says preserves the foreign commit does not exist | NOT STARTED |
| DISC-050 | The public contact form reports success without sending a request | IMPLEMENTED — NOT VERIFIED (browser/DB) |
| DISC-051 | The public jobs page requests an operation that does not exist, and its filters are ignored even on the operation that does | NOT STARTED |
| DISC-052 | The create-ticket modal has no focus trap, no Escape handling, no scroll lock and no focus return | NOT STARTED |
| DISC-053 | The shared unread-message poller and the global unread badge are gone; what replaced them stops polling on error | NOT STARTED |
| DISC-054 | Three team-management operations have no production implementation, and team leads have nowhere to be stored | NOT STARTED |
| DISC-056 | The in-memory test double ignores repository query options, so acceptance runs cannot validate visibility | NOT STARTED |
| DISC-055 | Four route blocks are declared twice in `backend/routes/platform.js`, the second copy can never run, and the two copies of the payment-settings read disagree on authorization | NOT STARTED |
