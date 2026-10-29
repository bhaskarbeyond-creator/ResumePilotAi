# Mandate 11A — Backend Engines: Verification, Evidence and Delivery Report

Date: 2026-10-30
Repository: `bhaskarbeyond-creator/ResumePilotAi`
Session branch (delivery ref): `arena/bf19806c-resumepilotai`
Base commit: `c3655a08ff7dfc49702f77179d2996245cd3aad9` (`main`)
Scope: DISC-012, DISC-048, DISC-034, DISC-050, DISC-022, FS-M8A-05, DISC-039, DISC-043, FP-A15, DISC-028

---

## 1. Verdict

**PASS — scope complete, with four explicitly BLOCKED external-environment verifications.**

Every mandated endpoint exists, is mounted at the intended unprefixed path, is exercised
over HTTP against the real Express application and a real MariaDB instance, and every
mandate test passes with **0 skipped**. Persistence, uniqueness, concurrency and
transaction boundaries are asserted against the database, not against mocks.

Four items could not be executed in this sandbox and are reported as **BLOCKED**, not as
passing (details in §7):

| Blocked item | Why | What *was* verified |
| --- | --- | --- |
| Delivery through a real SMTP provider | No SMTP credentials/network in the sandbox | The real delivery pipeline (claim → render → MIME build → `services/mailer.js` call → DELIVERED acknowledgement) runs end-to-end with only the transport function replaced |
| Verification against live public DNS | Sandbox DNS cannot hold our TXT record | TXT parsing/state machine is verified with an injected resolver; the *real* resolver path is verified to fail closed (never fabricates success) |
| Real Firebase email → principal resolution | No Firebase credentials | The enterprise invite flow is verified against the real DB/registry/service; only the `admin.auth()` directory call is doubled |
| `mariadb-migration-gate.test.js` (destructive suite) | The WASM bridge cannot drop and re-create a table inside one process lifetime (ghost-table limitation); the same failure reproduces on unmodified `main` | The identical drop-all → apply-32-migrations operation succeeds on a fresh bridge lifetime (§5), and 031/032 down→up→verify round-trips cleanly |

## 2. Method and environment

| Component | What was used |
| --- | --- |
| Database | MariaDB 13.1.0 (embedded WASM) via `scripts/dev-db/mariadb-sandbox-bridge.mjs`, MySQL wire protocol on `127.0.0.1:3306` |
| Schema | Real migration runner (`database/migrationRunner.js`), all 001–032 applied, 75 tables, ledger checksum-verified |
| HTTP | `supertest` against the real `backend/index.js` application |
| Auth | `security/auth.setTokenVerifierForTests` (repository's own test seam) — real `requireAuth`, real RBAC middleware |
| Mail | `services/mailer.setSendMailForTests` (repository's own seam), reset in every `test.after` |
| DNS | `services/customDomains` injectable resolver, default `dns.promises` |
| Frontend | `npm ci`, `oxlint`, `tsc -b && vite build` |

### Test doubles used (exhaustive list)

1. `services/mailer` transport function — genuine external boundary (SMTP).
2. DNS `resolveTxt` — genuine external boundary (authoritative DNS).
3. Firebase `admin.auth().getUserByEmail` / `getUser` — genuine external boundary (identity directory), injected through the same `createTenantService({ admin })` seam production uses.

No database, no router, no business service, no template engine and no outbox machinery is
mocked. No test is skipped, and no assertion is relaxed to make a failure disappear.

### Canonical database-suite command

```bash
cd backend
RUN_MARIADB_INTEGRATION=true DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root \
DB_PASSWORD= DB_NAME=airesume_test MARIADB_TEST_ALLOW_RESET=true NODE_ENV=test \
node --test --test-concurrency=1 --test-force-exit test/<suite>.test.js
```

Suites self-declare their database dependency through `test/helpers/mandate11a.js`
(`mariaTest`): with no database configured they **skip with an explicit
"NOT VERIFIED" reason** and never silently pass.

---

## 3. Requirement → evidence matrix

Legend: **PASS** = executed and asserted · **BLOCKED** = not executable in this environment, honestly reported · **FAIL** = executed and failing · **NOT IMPLEMENTED** = absent.

### 3.1 Billing / invoices (DISC-012, DISC-048)

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| B1 | `GET /api/billing/invoices` returns `{success, invoices, total}` | PASS | `billing-invoices-contract.test.js` test 1–3 |
| B2 | `limit` default 20, max 100, `offset` accepted | PASS | tests 2 (default 20 on 25 invoices), 3 (`limit=101` → 400 `INVALID_PAGINATION`) |
| B3 | `status` filter ∈ `ISSUED \| PAID \| REFUNDED` | PASS | test 3 (each filter returns only matching state; `paid-refunded` → 400 `INVALID_INVOICE_STATUS`) |
| B4 | `GET /api/billing/invoices/:id` (owner-scoped) | PASS | test 4; foreign id → 404 (test 5) |
| B5 | `GET /api/billing/invoices/:id/html` → `text/html; charset=utf-8` | PASS | test 6 (content-type, `X-Content-Type-Options: nosniff`, CSP `default-src 'none'`) |
| B6 | HTML escaped, no external JS | PASS | test 7 (injected `<img onerror>`/`"` appears only as `&lt;`/`&quot;`; no live `<img>`/`<script>`; no `http(s)://` asset reference) |
| B7 | `GET /api/admin/billing/invoices` with `payments.read` | PASS | tests 8–10 (admin 200; unauthorised role 403; `payments.read` enforced by both router and `security/policy.js`) |
| B8 | `startDate`/`endDate` filters, inverted range rejected | PASS | tests 10, 12 |
| B9 | No raw driver/transport codes leaked on 5xx | PASS | test 11 (`ECONNREFUSED` → `BILLING_REQUEST_FAILED`) |
| B10 | Amounts come from the persisted snapshot, no recomputation | PASS | tests 4, 13 (invoice math asserted against `invoices.payload`) |

### 3.2 Enterprise seat quota (DISC-034, DISC-050)

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| E1 | `POST /api/enterprise/members/invite`, roles OWNER/ADMIN/MEMBER/VIEWER | PASS | `enterprise-seat-quota.test.js` tests 2, 3 (201 for each grantable role; `INVALID_ROLE` for anything else) |
| E2 | 201 on success with invitation + seat usage | PASS | test 2 |
| E3 | 409 `SEAT_LIMIT_REACHED` at capacity | PASS | tests 4, 5 |
| E4 | Atomic seat reservation (concurrent invites cannot oversubscribe) | PASS | test 11: 4 concurrent invites against 2 free seats → exactly 2×201 + 2×409, DB holds exactly 3 memberships for `seatLimit=3` |
| E5 | `GET /api/enterprise/members/seats` → `{success, seatLimit, seatsUsed, seatsRemaining, pendingInvites}` | PASS | test 7 (exact key set + values; per-tenant isolation) |
| E6 | Pending invitation holds a seat; expiry releases it | PASS | tests 5, 6 |
| E7 | Removing a member frees a seat | PASS | test 10 |
| E8 | Duplicate invite does not consume a second seat | PASS | test 9 (`INVITATION_ALREADY_PENDING`, `MEMBER_ALREADY_EXISTS`) |
| E9 | Tenant isolation (no cross-tenant seat read) | PASS | test 7 (`candidate` requesting another tenant → 403/404) |
| E10 | Invitation audited + queued in the same transaction | PASS | test 2 (`enterprise_audit_events` `TENANT_INVITATION_CREATED`, `notification_outbox` row bound to the invitation) |
| E11 | Failed invite leaves no reservation | PASS | test 12 (404 workspace → `seatsUsed` unchanged, no outbox row) |

### 3.3 Notification outbox worker (DISC-022, FS-M8A-05)

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| O1 | `processPendingOutboxMessages({batchSize = 25, pool})` exposed | PASS | `services/notificationOutbox.js` exports it (delegating to `services/outboxWorker.js`); `notification-outbox-worker.test.js` imports the canonical export |
| O2 | Oldest-due-first, bounded batch | PASS | tests 1, 2 (batch of 2 then remainder; `batchSize` > 100 or ≤ 0 → `INVALID_BATCH_SIZE`) |
| O3 | DELIVERED marking + `provider_accepted` + attempt count | PASS | test 3 |
| O4 | Failure → RETRYING with backoff and sanitized error | PASS | test 4 (`last_error` ≤ 500 chars, single line, no credentials) |
| O5 | Dead-letter on the 5th failure and never retried | PASS | test 5 (state `DEAD_LETTER`, a further batch does not touch it) |
| O6 | One failing message does not abort the batch | PASS | test 6 |
| O7 | Expired-lease recovery | PASS | test 7 |
| O8 | Unsupported template never marked DELIVERED | PASS | test 8 |
| O9 | `POST /api/admin/system/outbox/process` (write permission) | PASS | tests 9, 10 (admin 200; candidate 403; unauthenticated 401) |
| O10 | `GET /api/admin/system/outbox/stats` without recipients/bodies | PASS | test 11 (only aggregate counts; no address appears in the payload) |
| O11 | Durability across processes | PASS | test 12 (row claimed and delivered over a second, independent mysql2 connection) |
| O12 | `text/calendar; method=REQUEST; charset=UTF-8` alternative part | PASS | test 13 |

### 3.4 Portfolio publishing (DISC-039, DISC-043)

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| P1 | `POST /api/portfolios/:id/publish` | PASS | `portfolio-publishing-slug.test.js` tests 5–10 |
| P2 | Slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–40 chars | PASS | test 6 |
| P3 | Reserved words → 400 `RESERVED_SLUG` | PASS | test 6 (`admin`, `api`, `public`, … for all four state codes) |
| P4 | Conflict → 409 `SLUG_ALREADY_EXISTS` | PASS | test 8 (other portfolio owns the slug, DB unique index arbitrates) |
| P5 | Database-level uniqueness | PASS | test 8 (assertion on `uq_portfolios_slug` behaviour, not an app pre-check) |
| P6 | Concurrent slug claims cannot both succeed | PASS | test 9 |
| P7 | `GET /api/public/portfolios/:slug` **and** `GET /api/portfolios/public/:slug` share one service/DTO | PASS | test 11 (byte-identical DTO from both aliases; frontend contract `frontend/src/lib/portfolio.ts` preserved) |
| P8 | Public DTO allowlist (no owner identity) | PASS | test 2 + test 11 (id/title/theme/slug/isPublished/publishedAt/metadata/data only) |
| P9 | Unpublishing removes public access immediately | PASS | test 10 |
| P10 | Drafts/unknown slugs → 404 on both public routes | PASS | test 12 |
| P11 | `POST /api/portfolios/:id/custom-domain` with real DNS TXT verification | PASS (verification logic) / BLOCKED (live DNS) | tests 13–17 |
| P12 | Only the token digest is stored; plaintext returned once | PASS | test 4, test 13 |
| P13 | A domain cannot be claimed twice | PASS | test 14 (DB unique key + 409) |
| P14 | Matching TXT → VERIFIED; non-matching → stays PENDING | PASS | test 15 |
| P15 | Throttled verification, expired token cannot verify | PASS | test 16 (429 `DOMAIN_VERIFICATION_THROTTLED`, 409 `DOMAIN_VERIFICATION_EXPIRED`) |
| P16 | Unreachable DNS never yields success | PASS | test 17 (`DNS_LOOKUP_FAILED`, status stays unverified) |

### 3.5 Interview scheduling (FP-A15, DISC-028)

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| I1 | New `backend/routes/interviews.js` mounted at `/api/employer/interviews` (no duplicated prefix) | PASS | `index.js:537`; `employer-interview-slots.test.js` all tests hit `/api/employer/interviews/...` |
| I2 | Migration `031_interview_slots.sql` + `.down.sql` | PASS | §5 (apply → down → re-apply → verify) |
| I3 | `GET /slots` (own slots, date window) | PASS | tests 1, 4 |
| I4 | `POST /slots`, durations 15/30/45/60 | PASS | test 2 (20 min → `INVALID_DURATION`; mismatch → `DURATION_MISMATCH`) |
| I5 | Overlap guard | PASS | test 3 (overlap/contained → 409 `SLOT_OVERLAP`; adjacent allowed) |
| I6 | DB-level guarantees (`chk_interview_slot_duration`, `chk_interview_slot_interval`, `uq_interview_slot_employer_start`) | PASS | test 3 (direct INSERTs rejected by MariaDB) |
| I7 | Concurrency guard on creation (unique key backstop) | PASS | test 3 duplicate-key assertion |
| I8 | `DELETE /slots/:id`, 409 when booked | PASS | tests 5, 7 |
| I9 | `POST /slots/:id/book` atomic single winner | PASS | test 7 (two concurrent bookings → exactly one 201, one 409 `SLOT_ALREADY_BOOKED`; DB holds the winner's application id) |
| I10 | RFC 5545 iCalendar, `text/calendar; method=REQUEST; charset=UTF-8` | PASS | test 8 (MIME part, CRLF-only, DTSTART/DTEND/UID/ATTENDEE) |
| I11 | Sent via `services/mailer.js` to persisted addresses only | PASS (pipeline) / BLOCKED (live SMTP) | test 8 (real outbox worker → mailer), test 9 (request-supplied addresses ignored; no address ⇒ no invitation) |
| I12 | Booking rules (application belongs to slot's employer, eligible status, actor authorization) | PASS | test 6 |
| I13 | Calendar download for the owning employer only | PASS | test 10 |

---

## 4. Test results (executed)

### 4.1 Mandate suites — fresh schema, fresh database process

| Suite | Tests | Pass | Fail | Skipped |
| --- | --- | --- | --- | --- |
| `billing-invoices-contract.test.js` | 13 | 13 | 0 | 0 |
| `notification-outbox-worker.test.js` | 13 | 13 | 0 | 0 |
| `portfolio-publishing-slug.test.js` | 17 | 17 | 0 | 0 |
| `enterprise-seat-quota.test.js` | 12 | 12 | 0 | 0 |
| `employer-interview-slots.test.js` | 10 | 10 | 0 | 0 |
| **Total** | **65** | **65** | **0** | **0** |

### 4.2 Regression tests touched by this mandate

| Suite | Tests | Result | Note |
| --- | --- | --- | --- |
| `database-ownership-completeness.test.js` | 3 | PASS | new tables registered in `database/ownership.js` (`interview_slots`, `portfolio_custom_domains`) |
| `enterprise-invitation-atomic.test.js` | 3 | PASS | fake-pool harness extended to answer the new in-transaction seat queries; transaction assertions unchanged and still prove one begin/one commit and rollback on outbox failure |

### 4.3 Payment suites (explicit regression requirement)

`npx node --test test/payment-reconciliation.test.js test/payments.test.js test/payment-activation.test.js`
→ **43 tests, 43 pass, 0 fail, 0 skipped**. (An earlier note in this session that
`payments.test.js` failed with `MODULE_NOT_FOUND` no longer reproduces on either branch; it
was a stale local artifact, not a repository defect.)

### 4.4 Whole backend suite — authoritative run

`npm test` in this repository does **not** produce a clean baseline: it includes the
destructive `mariadb-migration-gate.test.js`, which drops every table mid-run. Any
database-backed suite that runs afterwards is then starved of its schema. The same cascade
occurs on unmodified `main`.

| Run | Command | Tests | Pass | Fail | Skipped |
| --- | --- | --- | --- | --- | --- |
| Baseline `main` (`c3655a0`), all 179 files | `npm test` | 1449 | 1415 | 34 | 0 |
| Branch, all 179 files | `npm test` | 1514 | 1456 | 58 | 0 |
| Baseline `main`, destructive gate excluded (178 files) | `node --test --test-concurrency=1 --test-force-exit $(ls test/*.test.js \| grep -v mariadb-migration-gate)` | 1439 | 1434 | **5** | 0 |
| **Branch, destructive gate excluded (178 files)** | same command | 1505 | 1502 | **3** | 0 |

The last row is the apples-to-apples regression signal: **the branch has zero new failures
and two fewer than `main`.** The 65 additional tests are the five new mandate suites.
The 24 extra failures in the raw `npm test` row are the destructive gate wiping the shared
schema before `notification-outbox-worker`, `portfolio-publishing-slug` and
`employer-interview-slots` run; each of those suites passes 13/13, 17/17 and 10/10 when the
schema is intact, and the identical cascade is present on `main`.

`main`'s five failures (two of which the branch does not exhibit) are listed in §9.

### 4.4 Frontend

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci` | 281 packages, exit 0 |
| Lint | `npm run lint` (`oxlint`) | 0 warnings, 0 errors, 249 files |
| Build | `npm run build` (`tsc -b && vite build` + dist sync) | success, 343 files synchronised |

No frontend source file was modified; the existing `GET /api/portfolios/public/:slug`
contract (`frontend/src/lib/portfolio.ts`) is preserved and covered by test 11.

### 4.5 Failure attribution (branch, gate excluded)

| # | Failing test | Counted | Verdict |
| --- | --- | --- | --- |
| 1 | `Naukri ingestion returns a coded 501 rather than fabricating listings` | 1 | **Pre-existing** — reproduced on unmodified `main`; `/api/jobs` `POST /:id` matches `naukri` before the dedicated 501 route |
| 2–3 | `POST /api/admin/users/:uid/status …`, `PATCH /api/admin/users/:uid …` (via `Mandate 9B Contract Coverage`) | 2 | **Pre-existing** — reproduced on unmodified `main`; both require a Firebase OAuth token this sandbox cannot mint |

Nothing else fails. Every mandated suite and every suite this mandate touched passes.

The two remaining `main` failures (`down round-trip: 029.down -> 028.down -> re-up …`,
`parallel runMigrations under GET_LOCK …`) did not reproduce on the branch. They are
state/order-sensitive migration-runner tests, so this report claims only that they passed
here — not that the branch fixes them.

---

## 5. Migration evidence

Environment: MariaDB 13.1.0 (embedded WASM bridge), database `airesume_test`.

**Rollback → re-apply of the new migrations (031, 032):**

```
before:        { interview_slots: true, portfolio_custom_domains: true }
ledger:        031 interview_slots      checksum 6f216642…68c3
               032 portfolio_custom_domains checksum 23204a45…5cfb
applied down:  031_interview_slots.down.sql
applied down:  032_portfolio_custom_domains.down.sql
after down:    { interview_slots: false, portfolio_custom_domains: false }
reapply:       applied [031 (3 ms), 032 (4 ms)], pending [], current true
after up:      { interview_slots: true, portfolio_custom_domains: true }
constraints:   chk_interview_slot_duration (CHECK), chk_interview_slot_interval (CHECK),
               fk_interview_slots_application (FK), fk_interview_slots_employer (FK),
               chk_portfolio_domain_status (CHECK), chk_portfolio_domain_attempts (CHECK),
               chk_portfolio_domain_expiry (CHECK), fk_portfolio_domain_owner (FK),
               fk_portfolio_domain_portfolio (FK), PRIMARY keys
unique keys:   uq_interview_slot_employer_start,
               uq_portfolio_custom_domain, uq_portfolio_domain_portfolio
verify:        {"mode":"verify","applied":[],"pending":[],"current":true}
```

**Full chain from empty schema (fresh database process):**

```
dropped all tables
applied: 32 migrations, pending: 0, current: true
tables after: 75
max ledger version: 032
```

Note: the same drop-all → apply operation executed *twice inside one bridge process
lifetime* fails at `002_single_owner_enterprise.sql` with `Table 'airesume_test.users'
doesn't exist` — a documented limitation of the WASM bridge (re-created tables are not
visible in the same lifetime), reproduced identically on unmodified `main`. A fresh
bridge process applies the whole chain cleanly, which is what the table above records.

---

## 6. API inventory (new or extended)

| Method | Path | Auth / policy | Response (selected) |
| --- | --- | --- | --- |
| GET | `/api/billing/invoices` | bearer, owner-scoped | `{success, invoices[], total, limit, offset}`; `limit` 1–100 (default 20), `offset` 0–1e6, `status` ISSUED/PAID/REFUNDED |
| GET | `/api/billing/invoices/:id` | bearer, owner-scoped | `{success, invoice}`; foreign/missing → 404 |
| GET | `/api/billing/invoices/:id/html` | bearer, owner-scoped | `text/html; charset=utf-8`, CSP `default-src 'none'`, `nosniff`, `private, no-store` |
| GET | `/api/admin/billing/invoices` | `payments.read` | `{success, invoices[], total, limit, offset}`; `startDate`, `endDate`, `status`, `search` |
| POST | `/api/enterprise/members/invite` | `tenant.members.invite` | 201 `{success, invitation{…}, seatUsage{…}}`; 400/403/404/409 `SEAT_LIMIT_REACHED`/503 |
| GET | `/api/enterprise/members/seats` | `tenant.members.read` \| `tenant.read` \| `tenant.members.manage` | `{success, seatLimit, seatsUsed, seatsRemaining, pendingInvites, activeMembers, ownersIncluded, limitReached}` |
| POST | `/api/admin/system/outbox/process` | `system.config.write` | `{success, processed, successes, failures, batchSize}`; `batchSize` 1–100 |
| GET | `/api/admin/system/outbox/stats` | `system.config.read` \| `system.config.write` | `{success, pending, delivered, deadLetter, total, states, maxAttempts}` |
| POST | `/api/portfolios/:id/publish` | bearer, owner-scoped | `{success, portfolio{id, slug, isPublished, publishedAt, revision}}`; 400 `RESERVED_SLUG` / 409 `SLUG_ALREADY_EXISTS` |
| GET | `/api/public/portfolios/:slug` | public | `{success, portfolio{…}}`; 404 draft/unknown |
| GET | `/api/portfolios/public/:slug` | public | same DTO through the same service (frontend contract) |
| POST | `/api/portfolios/:id/custom-domain` | bearer, owner-scoped | 201 `{success, domain, verificationToken, status, expiresAt, instructions, verificationRecord{TXT}}` |
| POST | `/api/portfolios/:id/custom-domain/verify` | bearer, owner-scoped | `{success, verified, status, …}`; 409 expired, 429 throttled |
| GET | `/api/portfolios/:id/custom-domain` | bearer, owner-scoped | `{success, customDomain}` / 404 |
| GET | `/api/employer/interviews/slots` | bearer + employer claim | `{success, slots[]}`; `startDate`, `endDate` |
| POST | `/api/employer/interviews/slots` | bearer + employer claim | 201 `{success, slot}`; 400 validation, 409 `SLOT_OVERLAP` |
| DELETE | `/api/employer/interviews/slots/:id` | bearer + employer claim | `{success, deleted, slotId}`; 409 `SLOT_BOOKED`, 404 |
| POST | `/api/employer/interviews/slots/:id/book` | bearer (candidate or slot owner) | 201 `{success, booking, invitations, calendar, mime}`; 409 `SLOT_ALREADY_BOOKED` |
| GET | `/api/employer/interviews/slots/:id/calendar` | bearer + employer claim | `text/calendar` attachment for a booked slot |

Mount points are exactly `/api/billing`, `/api/admin/billing`, `/api/admin/system/outbox`,
`/api/employer/interviews`, `/api/public/portfolios` — no router re-adds a duplicated
prefix (no `/api/billing/api/admin/...`).

---

## 7. Security report

### 7.1 Authentication and authorization

- Every owner surface re-asserts authentication inside the router (`requireAuth`) in
  addition to the global `/api` boundary; anonymous calls return 401 (billing test 1,
  outbox test 9, interviews test 1, portfolios test 5).
- Administrative surfaces are gated twice: `security/policy.js` (URL → permission) and the
  router (`requirePermission`). `GET /api/admin/billing/invoices` is explicitly mapped to
  `payments.read`; without that mapping it would have inherited the generic
  `system.config.read|write` default — a real permission bypass that this mandate closes.
  `POST /api/admin/system/outbox/process` is classified as an administrative **mutation**
  (`system.config.write`), not a read.
- Enterprise seat surfaces resolve tenant context server-side; the client-supplied
  `x-tenant-id` can only *select among* tenants the caller already belongs to. A caller
  without a membership receives 403/404 (test 7).
- Employer interview surfaces additionally require the verified `employer` claim; candidate
  booking is authorized by persisted ownership of the application (or the slot), never by
  a request field.

### 7.2 Tenant / owner isolation

- Billing queries are scoped by `user_id = session uid` in SQL; a foreign invoice is
  indistinguishable from a missing one (404, never 403).
- The public portfolio projection is an explicit allowlist (`id, title, theme, slug,
  isPublished, publishedAt, metadata, data`), asserted by test 2/11; owner uid/e-mail and
  repository internals cannot leak through a future field addition.
- Seat counting is per tenant and includes owner-consumed seats and live pending
  invitations; expired invitations are expired inside the counting transaction so they
  cannot pin capacity.

### 7.3 Injections and output encoding

- Invoice HTML: every dynamic value is HTML-escaped; no `<script>`, no inline handlers, no
  remote assets; response carries `Content-Security-Policy: default-src 'none'`,
  `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`. Test 7 proves
  an injected `<img onerror>` survives only as escaped text.
- iCalendar: RFC 5545 TEXT escaping for `\`, `;`, `,`, newline; control characters
  stripped; header/attendee values sanitized to a single line; lines folded at 75 octets
  without splitting UTF-8; CRLF only. A candidate-supplied name cannot inject a calendar
  property.
- SQL: all statements are parameterised; the only identifier interpolation is the
  migration-runner-controlled table name in the destructive gate, which validates the
  identifier against `/^[A-Za-z0-9_]+$/`.

### 7.4 DNS verification (custom domains) — SSRF and spoofing posture

- Hostname validation rejects schemes, ports, paths, userinfo, IP literals, single-label
  hosts and reserved internal suffixes (`.local`, `.internal`, `.localhost`, `.invalid`,
  `.test`, `.example`, `.arpa`) before any lookup.
- Verification performs **TXT lookups only** — no HTTP fetch to the claimant's host, so the
  feature cannot be used as an SSRF primitive.
- Only `sha256(token)` is persisted; the plaintext token is returned once at registration.
  Comparison is constant-time (`crypto.timingSafeEqual` on hex digests).
- 30 s throttle (`429 DOMAIN_VERIFICATION_THROTTLED`), 7-day token TTL
  (`409 DOMAIN_VERIFICATION_EXPIRED`), and resolver failure/timeout always ends in a
  non-verified state (`DNS_LOOKUP_FAILED`) — never a success.

### 7.5 Outbox and error disclosure

- Operator endpoints expose aggregate counts only — no recipients, subjects or bodies
  (test 11 asserts this).
- `batchSize` is bounded server-side (1–100); an operator payload cannot drive an
  unbounded batch.
- Failure text stored in `last_error` is flattened, redacted (`password=`/`token=`/URL
  credentials) and truncated to 500 characters.
- Every new router maps 5xx to authored codes (`BILLING_REQUEST_FAILED`,
  `OUTBOX_OPERATION_FAILED`, `INTERVIEW_SCHEDULING_FAILED`,
  `PORTFOLIO_PUBLICATION_UNAVAILABLE`, `CUSTOM_DOMAIN_UNAVAILABLE`), so raw driver or
  transport codes (`ECONNREFUSED`, `ER_LOCK_WAIT_TIMEOUT`) never reach a client.
- Invitations and bookings are queued in the same transaction as the business write, and
  both new mail paths address only persisted records. Test 9 (interviews) proves a
  request-supplied `to`/`email`/`recipient` is ignored, and that an application without a
  persisted valid address produces no invitation at all.

### 7.6 Scheduler claim (explicitly limited)

`services/outboxWorker.processPendingOutboxMessages` is the same orchestrator used by the
interval worker. Automatic periodic processing exists **only** when
`NOTIFICATION_OUTBOX_WORKER_ENABLED=true` (default interval 15 s, clamped 5–300 s). That
flag is not enabled in this environment, so this report claims:

- **verified:** the worker logic, the admin-triggered batch, and scheduled-path parity
  (the scheduled dispatch now also attaches the `text/calendar` part);
- **NOT verified:** that a deployed environment has the scheduler switched on.

---

## 8. Changed-file inventory

### New files (23)

| File | Purpose |
| --- | --- |
| `backend/database/migrations/031_interview_slots.sql` | `interview_slots` schema: FK to `users`/`applications`, CHECK interval + duration whitelist, unique `(employer_id, start_time)`, indexes |
| `backend/database/migrations/031_interview_slots.down.sql` | Reverses 031 (`DROP TABLE IF EXISTS interview_slots`) |
| `backend/database/migrations/032_portfolio_custom_domains.sql` | `portfolio_custom_domains`: digest-only token, one domain per portfolio and per claim (two unique keys), status/expiry CHECKs |
| `backend/database/migrations/032_portfolio_custom_domains.down.sql` | Reverses 032 |
| `backend/enterprise/memberSeats.js` | Pure seat policy: role vocabulary, role→tenant-role mapping, assignable roles, cap resolution, usage computation, 409 error factory |
| `backend/routes/billing.js` | Owner invoice list/detail/HTML + administrative ledger router |
| `backend/routes/interviews.js` | Employer interview slots, booking, calendar download |
| `backend/routes/outboxAdmin.js` | Operator outbox batch + stats endpoints |
| `backend/routes/publicPortfolios.js` | Canonical `GET /api/public/portfolios/:slug` |
| `backend/services/billingDocuments.js` | Invoice DTO/projection + printable HTML renderer (no recomputation, full escaping) |
| `backend/services/customDomains.js` | Domain normalisation, token issuance/digest, TXT verification, throttle/TTL state machine |
| `backend/services/interviewIcal.js` | Pure RFC 5545 builder: escaping, CRLF, 75-octet folding, stable UID/sequence, MIME part |
| `backend/services/interviewScheduling.js` | Transactional slot create/list/delete/book + outbox invitation enqueue |
| `backend/services/outboxWorker.js` | Bounded batch processor over the existing claim/retry/dead-letter machinery + delivery adapter |
| `backend/services/portfolioPublishing.js` | Slug policy, publish/unpublish with DB-arbitrated uniqueness |
| `backend/services/publicPortfolio.js` | Shared public DTO + allowlist used by both public aliases |
| `backend/test/helpers/mandate11a.js` | DB fixtures and gated `mariaTest` helper for the mandate suites |
| `backend/test/billing-invoices-contract.test.js` | 13 billing contract tests |
| `backend/test/notification-outbox-worker.test.js` | 13 outbox worker tests |
| `backend/test/portfolio-publishing-slug.test.js` | 17 publishing/slug/custom-domain tests |
| `backend/test/enterprise-seat-quota.test.js` | 12 seat quota tests |
| `backend/test/employer-interview-slots.test.js` | 10 interview scheduling tests |
| `developer-review/MANDATE-11A-VERIFICATION.md` | This report |

### Modified files (11)

| File | Change |
| --- | --- |
| `backend/index.js` | Mounts the five routers at their exact prefixes; public allowlist entry for `/public/portfolios/:slug`; scheduled outbox worker now runs one worker batch per tick and passes the calendar part to the dispatcher |
| `backend/services/invoiceService.js` | Added paging/status/summary/count/admin-query helpers on top of the existing business service (no duplicate invoice engine, no recomputation) |
| `backend/services/notificationOutbox.js` | Re-exports `processPendingOutboxMessages` (canonical entry point), `claimDueEvent`/`processOutboxOnce`/`finishAttempt` unchanged |
| `backend/routes/email.js` | `dispatchNotification` accepts an optional RFC 5545 calendar part so outbox-delivered invitations carry `text/calendar` on both delivery paths |
| `backend/routes/portfolios.js` | Publish/unpublish + custom-domain register/verify/read endpoints |
| `backend/routes/enterprise.js` | `POST /members/invite` and `GET /members/seats` |
| `backend/enterprise/mysqlTenantRegistry.js` | In-transaction seat guard inside `grantMembership`; `getSeatUsage`; `_readSeatLimitInTransaction` / `_countSeatsInTransaction` |
| `backend/enterprise/tenantService.js` | `inviteMember` (role authorization before identity resolution) and `getSeatUsage` |
| `backend/security/policy.js` | Admin billing → `payments.read`; outbox stats read; outbox process write |
| `backend/database/ownership.js` | Registered `interview_slots` and `portfolio_custom_domains` as single-owner MariaDB domains |
| `backend/test/enterprise-invitation-atomic.test.js` | Fake-pool harness answers the new in-transaction seat queries (assertions unchanged) |

No frontend file was modified. No build output (`dist/`, `frontend/dist`) is tracked.

---

## 9. Pre-existing defects observed (out of mandate scope, not introduced here)

| Defect | Evidence | Baseline behaviour |
| --- | --- | --- |
| `GET /api/jobs/naukri` returns 503 instead of 501 (`degraded-endpoint-semantics.test.js`) | `/api/jobs` router's `POST /:id` handler matches `naukri` before the dedicated route | reproduced on a clean worktree of unmodified `main` |
| `mandate9b-contracts.test.js` admin user-status subtests return 500 | Firebase Admin cannot mint a Google OAuth token without credentials | reproduced on unmodified `main` |
| `mariadb-migration-gate.test.js` (destructive) | WASM bridge cannot drop + re-create tables within one lifetime | reproduced on unmodified `main`; the equivalent operation passes on a fresh bridge process |

---

## 10. Residual risks

1. SMTP acceptance, DNS propagation and Firebase directory behaviour are exercised only at
   their boundaries; production credentials were not available.
2. The database engine under test is MariaDB 13.1.0 (embedded WASM) behind a fidelity-limited
   bridge: prepared statements (`COM_STMT_*`) are unsupported and a single process serialises
   transactions. Concurrency assertions therefore prove *database-enforced* invariants
   (unique keys, conditional UPDATEs, row locks) rather than throughput.
3. Automatic outbox scheduling is configuration-dependent (see §7.6).
4. Seat `pendingInvites` counts INVITED memberships whose invitation is PENDING and
   unexpired; a tenant that never accepts invitations still consumes quota by design.
5. Custom-domain traffic routing (serving the portfolio on the verified hostname) is not
   part of this mandate: only claim + verification state is implemented.

---

## 11. Git delivery report

- Deliverable branch: **`arena/bf19806c-resumepilotai`** (the branch Arena tracks for this
  session; the mandate's proposed name `arena/mandate11a-backend-engines` cannot be created
  because this agent may only work on, and push to, the session branch).
- Base: `c3655a0` on `main`; no rebase, no force-push, no shared-branch modification.
- Commit contains exactly the 34 mandate files listed in §8 plus this report.
- `main`/`dev` untouched; no deployment performed.
