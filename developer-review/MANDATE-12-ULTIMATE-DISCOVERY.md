# Mandate 12-ULTIMATE — Phase Zero Discovery Summary

Written **before** implementation. Every statement below was verified against the checked-out
repository, not assumed from the mandate text.

## 1. Git integrity

| Check | Result |
|---|---|
| Branch | `arena/737c1ad4-resumepilotai` (session-pinned) |
| `git rev-parse HEAD` | `5dd54cfc63bdfa2e035fffd13660a9c8268a8849` — matches the expected baseline |
| `5dd54cfc` in history | Yes, HEAD of this checkout (`merge: mandate 12B hardening … into dev`) |
| Working tree | Clean; no uncommitted or untracked files at discovery time |
| Merge conflicts | None |
| `2722f112` referenced by the mandate | Not present in this repository's object database; treated as unverifiable history rather than fact |
| `dev` / `main` refs | Not fetched into this sandbox; only the session branch is authoritative here |

**Consequence:** the mandate's "293 passing" figure is a historical claim. It is not reused as evidence.
All counts in the completion report come from tests executed in this environment.

## 2. Documented-but-missing artefacts

- `developer-review/TRUE-REALITY-COMPLETION-STANDARD.md` **does not exist** in this repository.
  The nearest equivalents are `developer-review/HANDOVER.md`, `FINAL-ACCEPTANCE-REPORT.md` and
  `developer-review/README.md`. The mandate's cited "authoritative standard" is therefore unresolvable;
  the repository's own conventions plus the mandate text were used as the standard.

## 3. Migration reconciliation

- Migration directory: `backend/database/migrations/`, convention `NNN_name.sql` plus a manual
  `NNN_name.down.sql` rollback script. 32 numbered migrations exist (001–032, 63 files).
- Filename pattern enforced by the runner: `^(\d{3,})_([a-z0-9_]+)\.sql$`.
- Runner (`backend/database/migrationRunner.js`): ledger table `schema_migrations`
  (version, name, checksum, execution_ms, applied_by) + `schema_migration_attempts`; advisory lock
  `resumepilot:mariadb:schema-migrations`; checksum-drift detection; statements executed one at a time
  through `splitSqlStatements` (so **no procedures / custom delimiters**); migrations are applied inside an
  externally-managed connection, not an explicit transaction, so each file must be statement-idempotent
  (`IF NOT EXISTS` patterns are already used, e.g. migration 024).
- **033, 034, 035 and 036 are all free.** There is no migration 035 in this repository despite the
  mandate's implication; 035 is therefore allocated to the employer-settings table (see §6), keeping the
  sequence dense and deterministic.
- No existing `application_evaluations`, `revoked_sessions` or employer-settings table exists.
- `enterprise_tenants` (001_baseline) has **no** `seat_quota`, `monthly_ai_credits` or `custom_domain`
  column. Identifiers are `VARCHAR(128)`; `slug` is unique; states are `VARCHAR(50)`.
- Existing seat policy source is `enterprise_tenant_configurations.commercials.seatLimit` (JSON) — not a
  column on the tenant row.

## 4. Workstream 1 — messaging read cursor (`backend/index.js`)

- Route: `POST /api/messages/conversations/:conversationId/read`, inline in `backend/index.js`
  (~line 2213), not in a router module.
- Tables: `conversations(id, application_id, deleted_at, created_at)`,
  `conversation_participants(conversation_id, user_id, created_at, last_read_message_id, last_read_at)`
  (read columns added by migration 024), `conversation_messages(id, conversation_id, sender_id, text,
  timestamp BIGINT)`.
- Canonical ordering already used by the read path: `ORDER BY timestamp DESC, id DESC`
  (`GET …/messages`), i.e. **(timestamp, id) lexicographic**, not timestamp alone.
- Defects confirmed in source:
  1. participant row absence returns **404**, so a non-participant cannot be distinguished from a missing
     conversation and the mandate's 403 contract is not met;
  2. `req.body.lastReadAt` is written directly (`Number(req.body?.lastReadAt) || Date.now()`), a
     client-controlled timestamp;
  3. the supplied `lastReadMessageId` is never verified to exist, belong to the conversation, or be newer
     than the stored cursor — only a regex shape check;
  4. `GREATEST(COALESCE(last_read_message_id,''), ?)` compares opaque ids, so correctness depends on the
     id format rather than on the canonical ordering;
  5. the UPDATE runs outside a transaction/row lock.
- Frontend callers: `frontend/src/pages/employer/portal.tsx` (id only) and
  `frontend/src/lib/messages.ts` (`lastReadMessageId` + `lastReadAt` — client timestamp to be removed).

## 5. Workstream 2 — employer settings

- `frontend/src/pages/employer/portal.tsx` `handleSaveSettings` writes a hard-coded error string and
  persists nothing; the form renders "No settings were saved" / "Values below are unsaved".
- **There is no `backend/routes/employer.js`** (the mandate names it). Employer HTTP surfaces live inline
  in `backend/index.js` (`/api/employer/companies…`, `/api/employer/jobs…`) plus
  `backend/routes/interviews.js` mounted at `/api/employer/interviews`.
- **`company_profiles` does not exist.** The canonical employer company record is `companies`
  (`id, owner_id, name, …, extra_json, revision`) with an existing CAS-protected
  `PATCH /api/employer/companies/:companyId`.
- Employer authorization is the claim `req.user.claims.employer === true` (`isEmployerAccount` in
  `index.js`, `requireEmployer` in `jobsData.js`/`interviews.js`). `ENTERPRISE_ADMIN` is a *tenant* role
  with its own surfaces; it holds no employer-scoped permission in this model, so it is **not** granted
  access to another party's employer settings.
- No settings table, no `settings_json` column. Decision: a dedicated `employer_settings` table (migration
  035) keyed by the employer's verified uid — one row per employer, no duplicate of `companies.name`
  authority (the company name field is a hiring-communication display name, seeded once from the primary
  company record).
- Frontend test runner is Playwright (`npm --prefix frontend test`); build is `tsc -b && vite build`.
  No toast primitive is installed (only `@radix-ui/react-toast` as a dependency, no wrapper), so the
  settings UI uses an explicit `role="status"` confirmation region.

## 6. Workstream 3 — interview scorecards

- `GET/PUT /api/jobs-data/applications/:id/evaluate` exist in `backend/routes/jobsData.js`, both behind
  `requireEmployer` and both scoped by `applications.employer_id = req.user.uid`, PUT wrapped in a
  transaction with `SELECT … FOR UPDATE`.
- **No `application_evaluations` table exists**; the current implementation dual-writes only
  `applications.rating`, `applications.notes` and `applications.extra_json.evaluationRecommendation`.
  Those three remain the legacy contract and must keep working.
- Current recommendation vocabulary is `Move to Offer | Reject | Hold` (backend allow-list *and* the
  frontend select in `CandidateReviewDrawer.tsx`). The mandate requires
  `STRONG_YES | YES | NEUTRAL | NO | STRONG_NO`. Both surfaces will speak the canonical vocabulary while
  the legacy labels keep being accepted and are mapped for backward compatibility.
- `applications.id` is `VARCHAR(128)`; the route's id pattern is `[A-Za-z0-9:_-]{1,300}`. Reviewer identity
  is the server-side `req.user.uid` (`VARCHAR(128)`).

## 7. Workstream 4 — tenant quotas and custom domains

- `MySqlTenantRegistry.updateTenantProfile({ tenantId, displayName })` updates **only** `displayName`;
  `seatQuota` / `monthlyAiCredits` / `customDomain` are silently discarded. `validateTenantRecord` projects
  no quota fields.
- `TenantService.updateTenantProfile` / `updateTenantProfileAsPlatform` forward only `displayName`.
- `PATCH /api/platform/tenants/:tenantId` (platform.js) accepts only `displayName` (2–120 chars) and
  echoes the registry row back.
- `validateTenantRecord` requires a UUID tenant id and an allowed lifecycle state; it derives
  `createdAt/updatedAt` from snake_case columns.

## 8. Workstream 5 — seat enforcement

**This is materially already implemented** and must not be duplicated:

- `MySqlTenantRegistry.grantMembership()` opens a transaction, locks the workspace row, then locks the
  **tenant row** (`SELECT id FROM enterprise_tenants WHERE id = ? FOR UPDATE`), then counts seats inside
  that transaction (`_countSeatsInTransaction`, which also expires lapsed invitations) and calls
  `assertSeatCapacity`, then writes the membership, workspace membership and invitation.
- `enterprise/memberSeats.js` owns the policy (`SEAT_LIMIT_REACHED`, HTTP 409) and
  `POST /api/enterprise/members/invite` already maps it to 409.
- Existing DB-backed suite: `backend/test/enterprise-seat-quota.test.js` (+ `enterprise-invitation-atomic.test.js`).
- Remaining gap for this mandate: the commercial cap is read only from
  `enterprise_tenant_configurations.commercials.seatLimit`; the purchased quota is not persisted on the
  tenant row, so `seat_quota` from workstream 4 would never affect enforcement. The two sources must be
  reconciled (most-restrictive wins) rather than replaced.
- **Baseline deviation, deliberate:** the mandate proposes `seat_quota INT NOT NULL DEFAULT 5`. A NOT NULL
  default of 5 would retroactively cap every existing enterprise tenant (most are provisioned through
  `commercials.seatLimit`) at five seats. The column is therefore `INT NULL DEFAULT NULL` where NULL means
  "not configured" (the established `resolveSeatLimit` semantics), and validation rejects anything that is
  not a positive integer.

## 9. Workstream 6 — operator session revocation

- `backend/security/auth.js`: `verifyToken` (Firebase `verifyIdToken` or the non-production `rptest` HMAC
  verifier), `verifyLocalTestToken`, `resolveUser`, `requireAuth` / `optionalAuth`. No `jti` exists and no
  revocation state is consulted, so a previously issued ID token stays valid until natural expiry.
- `POST /api/platform/operators/:uid/revoke-sessions` exists in `platform.js` but only calls
  `admin.auth().revokeRefreshTokens(uid)` (refresh tokens only) after an audit entry.
- `backend/test/operators-iam.test.js` asserts that legacy route's 200 + `success: true` + `/revoked/i`
  message — preserved.
- **Token facts that determine the revocation key:** Firebase ID tokens carry a server-signed `iat`
  (seconds) and `exp`; `auth_time` is optional. The `rptest` harness tokens carry `auth_time` and an
  optional `exp`, and are minted by `issueLocalTestToken`. A per-user, server-authoritative cutoff compared
  against the signed `iat` is therefore the only reliable user-level revocation mechanism available without
  introducing a session id into every token.
- `frontend/src/components/admin/AdminSecurityTab.tsx` renders a hard-coded example operator directory
  with the notice "Operator session revocation is unavailable here; no credentials are revoked by this
  screen." The real directory is `GET /api/platform/operators`.

## 10. Test infrastructure reality

- `node_modules` is **not** committed; `npm install --prefix backend` was required (346 packages).
- Backend suites: `npm --prefix backend test` (`backend/test/*.test.js`) and
  `npm --prefix backend run test:enterprise` (`backend/enterprise-test/*.test.js`).
- DB-backed suites gate on `RUN_MARIADB_INTEGRATION` + a disposable `DB_*` target
  (`backend/test/helpers/disposableMariaDb.js`: requires `NODE_ENV=test`, a database name containing
  test/ci/cert/sandbox/scratch, loopback host unless explicitly allowed).
- `developer-implemented/TESTS/unit/*.test.mjs` are HTTP/contract suites run directly with `node --test`.
- **No MariaDB server exists in this sandbox**: no `mysqld`/`mariadbd` binary, no MySQL client, no
  Docker, and no package-manager network path (`apt` has no permission and no reachable mirror). Real
  MariaDB execution is an environment gate, not an implementation choice — it is reported as an
  outstanding verification gate rather than simulated.

## 11. Defect-characterising tests that must change

`developer-implemented/TESTS/unit/mandate12b-contracts.test.mjs` currently **asserts the defects as
passing behaviour**: that the read route does *not* verify the message belongs to the conversation, that
`app.patch('/api/employer/settings')` does *not* exist, and that the portal still says
"No settings were saved". Those assertions invert once the mandate is implemented and are rewritten to
assert the corrected contract. `mandate11f-contracts.test.mjs` asserts the client sends `lastReadAt`; that
assertion is replaced by the server-authoritative contract.
