# Decision log — ResumePilot AI admin control plane

**Purpose.** Every decision that changed the repository, and every decision that was
made *for* the user under the standing instruction "decide and document, do not ask".
Each entry names the alternative, why it was not chosen, what it costs, and how to
undo it.

**Format.**

| Field | Meaning |
|---|---|
| **ID** | `D-nnn-n` — recommendation it serves, then sequence. `RR-nnn` entries are the pre-existing open decisions from `11-residual-risk-and-decisions.md`, now resolved. |
| **Status** | `ACCEPTED` (implemented), `PROVISIONAL` (implemented, reversible), `REVERSED` (superseded, with pointer). |
| **Invariants** | Which of INV-1…INV-6 the decision serves or constrains. |

---

## Part 1 — RR decisions, resolved

The analysis phase published ten decisions it could not make from the repository.
The execution mandate removed that constraint: no approval pauses. Each is now
resolved in the direction of *most reversible*, *invariant-consistent*, and *least
rework*.

### RR-001 — Can the console ship behind a feature flag while remediation proceeds?

**Resolved: NO automatic gate.** The console's read paths now depend on a real
authorisation engine (`security/routeManifest.js`), and 146 admin routes have named
rules, so "ship dark" would hide the parts that are already correct without
protecting anything. The flag remains available operationally
(`ADMIN_CONSOLE_ENABLED`), but is not required for safety.

- Alternative: keep the console dark until every MUST capability exists. Rejected —
  the console is the only way to *use* the fixed authority model (role editing,
  audited grants), so gating it would gate the remediation itself.
- Cost: incomplete surfaces are visible (audit trail, tenants list) — recorded as
  OPEN-ITEMS rather than hidden.

### RR-002 — Backend authority first, or console completeness first?

**Resolved: backend authority first, and it is done** (commits `1d47922`,
`b2803e1`, `5ace3e6`). Sequencing evidence: the console's capability logic reads
the backend's permission vocabulary; building tabs first would have encoded the
inverted ADMIN risk profile the analysis found.

- Reversible: yes, nothing in the frontend depends on the RBAC API yet.

### RR-003 — What is the break-glass path when the only super-admin is locked out?

**Resolved: out-of-band, documented, and now *structurally hard to need*.**
Three layers:

1. `SUPER_ADMIN` must retain the wildcard — `services/adminRbacAdministration.js`
   rejects a removal with `BREAK_GLASS_REMOVAL_BLOCKED` (test:
   `INV-2: the break-glass wildcard cannot be removed from SUPER_ADMIN`).
2. A database outage degrades to the pre-028 literal, so a broken `admin_roles`
   table cannot lock anyone out (`admin-rbac-resolver.test.js`, degradation test).
3. If every super-admin is still lost, the recovery path is SQL, documented in
   `DEPLOYMENT-RUNBOOK.md §6`.

- Alternative: a signed recovery token. Rejected — a second signing secret is a
  bigger attack surface than the lockout it prevents, and the lockout already
  requires simultaneous loss of all super-admins *and* the database credentials.

### RR-004 — Should the role-view simulation exist, and may AUDITOR see actor identities?

**Resolved: keep the server-side role-view audit, delete client-side simulation;
AUDITOR sees identities.** The identity of who viewed a record as another role is
compliance evidence; redacting it would make the audit trail useless for its only
purpose. The console's local simulation is removed when the audit tab is rebuilt
(OPEN-ITEM `OI-008-1`).

### RR-005 — How often are legacy-only capabilities actually used?

**Unresolvable from the repository, resolved by *ordering* instead of by fact.**
Capabilities are ordered by incident consequence, not by frequency: anything on the
account-takeover or money path first. Recorded so the ordering is not mistaken for
evidence.

### RR-006 — Object-storage adapter, or formally drop the capability?

**Resolved: keep the explicit 501.** A 501 is an honest statement of a missing
capability; a stub adapter would return success and lose the file. Unchanged from
the analysis.

### RR-007 — Retention periods (audit, AI usage, outbox)

**Resolved: retain indefinitely, with deletion gated behind an explicit operator
action.** The alternative — guessing a retention period — destroys evidence that a
compliance review may later require. Recorded in `OPEN-ITEMS.md` `OI-CFG-007` as
`UNRESOLVED — decision required` with the exact question for legal.

### RR-008 — Tenant-level configuration overrides?

**Resolved: platform-only, namespaced for later.** The settings key space is
`<category>.<key>` today; tenant scoping would require a `tenant_id` column on the
configuration tables and a resolver change on every read. Namespacing costs nothing
now and is reversible; the column is a schema decision that should be taken with
product input. Recorded as `OI-CFG-008`.

### RR-009 — AUDITOR scope: audit data only, or broad read?

**Resolved: broad read, including the audit trail.** Implemented: the manifest maps
`/admin/audit-logs*` to `audit.read` (so AUDITOR reaches its own domain) and its
bundle already carries `users.read`, `tenants.read`, `payments.read`,
`ai.usage.read`, `security.read`. Evidence: `admin-rbac-api.test.js`
("an auditor can read who-may-do-what") and `route-manifest.test.js`
("an AUDITOR reaches the audit trail").

- Residual: `/admin/settings` remains closed to AUDITOR. That is deliberate —
  configuration *content* is not compliance evidence, and opening it would leak
  secrets-bearing keys through the settings API.

### RR-010 — Is the new frontend the only admin client?

**Resolved: yes.** Consequence: the legacy path tables in `security/policy.js`
were replaceable rather than preserved. If a legacy client ever needed support, the
manifest is the single place to add a compatibility rule — a one-rule change, not a
second engine.

---

## Part 2 — Execution decisions (made during remediation)

### D-005-1 — Permission keys carry both `resource:action` and legacy dotted form

- **Status:** ACCEPTED · **Invariants:** INV-3 · **Commit:** `1d47922`
- **Decision:** the resolver's set contains `system.config:write` *and*
  `system.config.write` for every grant.
- **Why:** ~66 route handlers call `permissions.has('users.update')` directly.
  Normalising them all in one change would have mixed an authority change with a
  refactor, making a 66-file diff unreviewable against a security model.
- **Alternative rejected:** rewrite every call site to canonical keys. Cost: a
  mechanical diff over the entire admin plane, and a window in which a missed site
  silently denies.
- **Undo:** delete the alias push in `expandGrant` once call sites are migrated
  (tracked as `OI-005-3`).

### D-005-2 — Seven of the eight "unassigned" permissions were not gaps

- **Status:** ACCEPTED (analysis correction) · **Invariants:** INV-3
- **Decision:** only `messages.read` was granted (§B of migration 028). The other
  seven are any-of alternatives to a permission the role already holds, or are
  implied by the action hierarchy, or are deliberately SUPER_ADMIN-exclusive.
- **Evidence:** `routes/adminUsers.js:1181` (`users.export` any-of `users.read`),
  `:1075,1113,1135,1155` (`users.security.manage` any-of `users.update`),
  `index.js:4646-4650` (`payments.write`/`system.config.manage` any-of held keys),
  `enterprise/tenantService.js:72` (`tenant.support.access` any-of a role list),
  `security/policy.js:55` (`secrets.manage` gates the service-account key).
- **Why it matters:** granting all eight would have *widened* authority to fix a
  reporting artefact. The census that produced the original count is now a test
  (`admin-rbac-resolver.test.js`, "no requirement group is unreachable") that
  models any-of groups instead of counting strings.
- **Residual:** `secrets.manage` remains SUPER_ADMIN-exclusive and is declared in
  two tests; if it is ever granted to ADMIN, both fail.

### D-005-3 — The `claims.permissions` union is removed, not narrowed

- **Status:** ACCEPTED · **Invariants:** INV-3 · **Commit:** `1d47922` · **ADR-002**
- **Decision:** authority comes only from persisted roles and grants.
- **Why:** nothing in this codebase mints a `permissions` claim (grep: only `role`
  is ever written via `setCustomUserClaims`). Anything present is forged or stale,
  and cannot be audited.
- **Cost:** `test/superadmin-platform.test.js` asserted the opposite; the assertion
  was inverted with a comment. That is a contract change, not a lowered gate.

### D-006-1 — The manifest's defaults are declared, and *tracked*, not removed

- **Status:** ACCEPTED · **Invariants:** INV-1, INV-3 · **Commit:** `b2803e1`
- **Decision:** keep `default-admin-read` / `default-admin-write` as explicit
  catch-all rules, then make the pin list empty by modelling every route.
- **Why:** a hard fail-closed default would have 403'd ADMIN on dozens of reads in
  one commit with no UI test coverage. Making the default explicit and pinning its
  membership gives the same end state — zero routes on a default — without a
  big-bang authorisation change. Today the pin list is `[]` and the test fails if a
  new route lands on a default.
- **Undo:** none needed; the defaults are unreachable for the current route table.

### D-006-2 — Four behaviour corrections shipped inside the engine change

- **Status:** ACCEPTED · **Invariants:** INV-1, INV-3
- **Decision:** `audit-logs → audit.read`, `pages → content.manage`,
  `coupons → payments.read/.manage`, `settings →` named rules.
- **Why together:** the corrections are one line each *inside* the new manifest; as
  four separate commits they would have required four edits to the ladder that was
  about to be deleted.
- **Risk:** coupons mutations now require `payments.manage` rather than the generic
  `system.config.write`. Both ADMIN and SUPER_ADMIN hold it; SUPPORT/AUDITOR did not
  have the write path before. Verified by
  `route-manifest.test.js` ("reads and writes are decided independently") and the
  242-test regression batch.

### D-006-3 — Audit-log reads no longer need `system.config.read`

- **Status:** ACCEPTED · **Invariants:** INV-1, INV-5
- **Consequence to note:** an AUDITOR can now read who did what, which is the point
  of the role; an ADMIN keeps access via its own `audit.read`. This is the first
  case where the *policy* (manifest) is stricter than the old *default*, and it
  changes the frontend-visibility matrix in `SECURITY-AND-RBAC-PROOF.md §6`.

### D-005-4 — The RBAC write API is SUPER_ADMIN-only + step-up + typed reason

- **Status:** ACCEPTED · **Invariants:** INV-2, INV-3, INV-6 · **ADR-004**
- **Decision:** every authority mutation requires `requireSuperAdmin`,
  `requireRecentAdminAuthentication`, a ≥12-character reason, and writes an audit
  row with store-computed before/after.
- **Alternative rejected:** let `system.config.manage` holders edit roles. That is
  circular — the permission being edited is the permission that authorises editing.
- **Cost:** a single-super-admin deployment is a bottleneck for role changes. That
  is the correct bottleneck while the platform has no second-person approval.

### D-005-5 — No self-escalation: an operator may not widen a role they hold

- **Status:** ACCEPTED · **Invariants:** INV-2, INV-3
- **Decision:** reject with `SELF_ESCALATION_BLOCKED` when the caller's own role
  would gain permissions, and when granting any role to the caller's own uid.
- **Why:** "who approved this?" must not have the beneficiary as its answer. It
  also makes the audit trail meaningful: every widening has two identities in it.
- **Cost:** SUPER_ADMIN cannot grant itself a narrow permission (which is
  pointless — it already holds the wildcard) nor bootstrap a second super-admin
  from the same account. The second super-admin must already exist.

### D-005-6 — A no-op authority change writes no audit row

- **Status:** ACCEPTED · **Invariants:** INV-6
- **Decision:** `changed: false` returns `200` and records nothing.
- **Why:** an audit trail that records non-changes cannot be used to answer "what
  changed and when", because the answer includes events where nothing happened.
- **Test:** `INV-6: a no-op change writes no audit row`.

### D-005-7 — One audit row per authority change, written by the route

- **Status:** ACCEPTED · **Invariants:** INV-6
- **Decision:** `security/adminAudit.js` skips its generic post-response row for
  `/admin/rbac/*`; the route writes a richer row instead.
- **Why:** the generic middleware records the *client's* body as metadata. For an
  authority change that means the `before` value comes from the caller — a trail
  the caller can author. The skip list is `SELF_AUDITED_PREFIXES`, matched against
  `originalUrl` because Express restores the mount prefix before `res.end` runs
  (the bug this decision fixed, found by the first failing test run).

### D-005-8 — Grants take effect for the next request, not the next refresh

- **Status:** ACCEPTED · **Invariants:** INV-3
- **Decision:** `grantRole`/`revokeRole` await `preloadUserGrants(uid)` before
  responding.
- **Why:** the request path resolves grants lazily (it must never block an
  authorisation decision on a query). The write path is already awaiting the
  database, so it can fill the cache and make "grant takes effect immediately"
  literally true.
- **Evidence:** `admin-rbac-api.test.js` asserts the *first* subsequent
  `permissionsFor` call carries the new role.

### D-005-9 — `admin_roles` seeds all eight roles, including end-user roles

- **Status:** ACCEPTED · **Invariants:** INV-3
- **Decision:** EMPLOYER and USER are seeded too.
- **Why:** with a fully-seeded table, the literal fallback means exactly one thing
  — "the store is unavailable" — instead of "this role lives in code". A test
  asserts the seeded set equals the vocabulary's key set.
- **Alternative rejected:** seed only admin roles, letting end-user roles fall back
  permanently. That hides store outages behind normal-looking behaviour.

### D-005-10 — Platform-managed roles are read-only through this API

- **Status:** ACCEPTED · **Invariants:** INV-3, INV-4
- **Decision:** USER, EMPLOYER, ENTERPRISE_ADMIN, ENTERPRISE_MEMBER return `409
  PLATFORM_MANAGED_ROLE`.
- **Why:** tenant authority is owned by `enterprise/tenantPolicy.js` and
  `enterprise_tenant_configurations`. Two writable sources for one decision is how
  they diverge.
- **Cost:** an operator who wants to change a tenant role must use the enterprise
  API; documented in `DEPLOYMENT-RUNBOOK.md §5`.

### D-006-4 — Route inventory is a checked-in fixture, not a runtime crawl

- **Status:** ACCEPTED · **Invariants:** INV-1
- **Decision:** `backend/test/fixtures/admin-route-inventory.json` (152 rows) is
  refreshed by hand when routes are added; the test fails until the manifest names
  the new route.
- **Why:** Express 5 removed the route-walking internals the earlier enumeration
  used; a crawl would also miss routes registered conditionally. A fixture that
  must be updated makes the authorisation question part of the route change, which
  is the behaviour we want.
- **Cost:** the fixture can drift from the code if someone adds a route and never
  runs the suite. Mitigation: the coverage test is in the default
  `npm --prefix backend test` path.

### D-013-1 — Correcting the analysis where it was wrong

- **Status:** ACCEPTED · **Invariants:** all
- **Decisions corrected against the code, all recorded in the documents they
  affect:**
  1. "`system.config.manage` gates all generic settings writes
     (`policy.js:82-101`)" — the ladder returns `system.config.write`
     (`policy.js:93-101` at the analysed commit). ADMIN holds it; the actual
     blocker for setting writes was `expectedRevision` (`index.js:3888`) plus the
     unassigned `system.config.read` on the read half. Corrected in
     `06-rca-register.md` RCA-007 references and in `SECURITY-AND-RBAC-PROOF.md`.
  2. Migration 028's first draft decomposed `users.roles.manage` as
     `('users','roles')`. `parsePermission` splits at the **last** dot, so the key
     would have been `users.roles:manage` while the seed stored `users:roles` —
     a silent loss of `roles.manage` for ADMIN. Fixed to
     `('users.roles','manage')`; the golden seed test caught it.
  3. `adminRbac.js` imported `PERMISSIONS` from `security/auth.js`, which never
     exported it, and importing it from `auth.js` created a require cycle
     (`auth → adminRbac → auth`) whose symptom was `LEGACY_ROLE_PERMISSIONS`
     being `undefined` at first call. Fixed by extracting
     `security/permissionVocabulary.js` and importing from there.
  4. The store's `listUserGrants` returns one row per *(role, permission)* pair, so
     "roles held" must be de-duplicated before it reaches an audit row. Fixed in
     `services/adminRbacAdministration.js`, caught by the grants test.

---

## Part 3 — Console integrity decisions (Step 4)

### D-020-1 — A surface with no data renders no data

- **Status:** ACCEPTED · **Invariants:** INV-1, INV-5 · **RCA:** RCA-012 · **Evidence:**
  `frontend/src/components/admin/admin-data-state.ts`,
  `tests/unit/admin-users-tab.test.tsx`, `tests/unit/admin-attention-tab.test.tsx`

**Decision.** Administrative surfaces have exactly three renderable states — loading, ready,
failed — and `data` is `null` until a request succeeds. Sample rows are deleted, not hidden.
A failure renders `AdminErrorPanel` with the server's code, message and request id.

**What this deletes, file by file.**

| Surface | What was there | What is there now |
|---|---|---|
| `AdminUsersTab` | `DEFAULT_USERS` — five invented identities (`alex.rivera@…`, `spencer_bot@suspicious-net.org`, …) seeded as initial state; `const [, setLoading] = useState(true)` discarded the loading state; `loadUsers` swallowed the failure with `// Keep baseline` | `GET /api/admin/users` through `readDirectory`; skeleton → error panel → empty panel → table. A test asserts the invented names never appear, including after a `503` |
| `AdminUsersTab` actions | 9 handlers, of which 6 ended `await post(...).catch(() => {})` and then announced success unconditionally; quota override and counter reset changed local state and never called an API; the password-reset fallback **fabricated a link** (`?reset_token=sec_rst_${Date.now()}`) and told the operator it was copied | Every action calls the endpoint that owns it and reports the server's answer; failures arrive as `role="alert"` with the error code. `PUT /:uid/ai-entitlement`, `POST /:uid/ai-quota-reset`, `GET /:uid/export`, `POST /:uid/tenants`, `DELETE /:uid/tenants/:id`, `POST /:uid/unenroll-mfa` are now reachable from the UI |
| `AdminUsersTab` drawer | Documents tab rendered `Array.from({length: resumeCount})` with invented titles and a hard-coded `ATS 94%`; AI tab fell back to `usedToday ?? 18` and `dailyLimit ?? 100`; tenancy tab showed a fixed "Northwind Careers" membership | `GET /:uid/details` drives all four tabs: real resume titles and timestamps, real `effectiveLimit`/`usedToday`, real memberships, real audit timeline. Unknown numbers render as `—` |
| `AdminUsersTab` pickers | Role picker offered `SUPER_ADMIN`, which `PATCH /:uid` refuses with `SUPER_ADMIN_ROLE_FORBIDDEN`; provisioning asked for a password and a tenant, both of which the endpoint rejects (`CREATE_THEN_ASSIGN_TENANT`) | `ASSIGNABLE_ROLES` excludes `SUPER_ADMIN`; provisioning sends only `email`, `displayName`, `role`, `emailVerified` |
| `AdminUsersTab` view-as | Posted `{simulatedRole, targetUserId, action}` to `/platform/role-view-audit`, which reads `{targetRole, tenantId}` → every call was a `400 INVALID_ROLE` presented as a success | Posts `{targetRole}`; the endpoint's message is what the operator sees |
| `AdminAttentionTab` | Five invented incidents, a Refresh button that spun a spinner for 600 ms without a request, and an "Acknowledge" control that hid a row locally | `GET /api/platform/attention`; the payload's own `note` is displayed; Refresh re-issues the request |

**Alternatives considered.**

1. *Keep the sample rows behind a `demo` flag.* Rejected: the flag becomes a permanent
   second code path, and the failure mode it protects against (an operator acting on a
   non-existent account) is exactly the one that must be impossible.
2. *Keep "Acknowledge" and persist it server-side.* Rejected as scope, not as principle: the
   items are derived from live probes, so a persisted acknowledgement is a second source of
   truth that can disagree with the probe. Clearing the condition is the only correct clear.
   If operators need "I have seen this", that is an incident record, not a row filter — and it
   belongs in the ticket system this page explicitly is not (`routes/platform.js:1262`).

**Trade-offs.** An empty directory now looks empty rather than populated, so a broken
deployment is visible on first load. That is the point, and it costs a skeleton and an error
panel. Two extra reads per drawer open (`details` + `enterprise/tenants`), both bounded.

**Rollback.** Revert the commit; no schema, no API and no configuration change is involved.
The backend change in the same commit (`D-023-1`) is additive metadata and is safe to keep.

### D-021-1 — Strict TypeScript, applied to the surface being changed

- **Status:** ACCEPTED · **Invariants:** quality bar · **Evidence:** `frontend/tsconfig.strict.json`,
  `npm run typecheck:strict` in `.github/workflows/quality-gate.yml`

**Decision.** `frontend/tsconfig.app.json` sets `"strict": false`. Turning it on for the whole
app today is 203 errors across 30 files, concentrated in five screens outside this
remediation (`ResumePageComposer` 47, `portfolio-view` 36, `resume-builder` 25,
`interview-coach` 22, `support` 10). The admin plane therefore gets its own project —
`tsconfig.strict.json`, covering `src/components/admin/**`, `src/pages/admin/**` and
`tests/unit/**` — with `strict`, `noUnusedLocals`, `noImplicitOverride`, `noImplicitReturns`
on top of the existing `noUncheckedIndexedAccess`. It is enforced in CI and is at 0 errors.

**Why not just turn `strict` on everywhere.** Because it would be a 30-file refactor inside a
PR whose subject is the admin plane, and a reviewer cannot tell a semantic fix from a cast
added to silence the compiler. The ratchet is explicit: `OI-STRICT-1` lists the five files
and the error count, and each is converted in its own change.

**Trade-offs.** Two TypeScript projects to keep in sync; a new file under `src/components/admin`
is strict by default (good), and a new file elsewhere is not (unchanged from before).

**Rollback.** Delete the project and the CI step; nothing in the app depends on it.

### D-022-1 — A component tier that runs where the browser cannot

- **Status:** ACCEPTED · **Invariants:** quality bar (test tiers) · **Evidence:**
  `frontend/vitest.config.ts`, `frontend/tests/unit/**` (53 tests)

**Decision.** Behaviour that is not pixel-dependent is tested with vitest + jsdom + Testing
Library, not with Playwright. The Playwright suite remains the browser tier and runs in the
`e2e` CI job; this tier runs in seconds, needs no browser and no database, and covers exactly
the properties whose absence produced the defects: which state a surface renders, whether a
refused write is reported as a refusal, and whether the wire model is mapped honestly.

**Why not only Playwright.** It cannot run in this environment (no browser binary), and a tier
that only exists where a browser exists is a tier that gets skipped. The two tiers answer
different questions and both are needed.

**Trade-offs.** jsdom is not a browser: it does not compute layout, so it cannot prove a
44 px target or a contrast ratio — the static audits and Playwright do that. The 80/75/75/80
thresholds in `vitest.config.ts` are lower than the backend's because component branches
include defensive `??` paths that need a hostile API to reach; the measured values
(86.81 / 76.63 / 85.83 / 86.91) are recorded in `TEST-EVIDENCE.md §4`.

**Rollback.** Remove the two scripts and the config; no runtime code depends on it.

### D-023-1 — A suspension records its reason in the audit metadata

- **Status:** ACCEPTED · **Invariants:** INV-6 · **Evidence:** `backend/routes/adminUsers.js`
  (`changeReason`, both `USER_ADMIN_*` audit rows)

**Decision.** `PATCH /api/admin/users/:uid` accepts an optional `reason` (trimmed, capped at
500 characters) and carries it into the `metadata` of both the `USER_ADMIN_UPDATE_REQUESTED`
and `USER_ADMIN_UPDATED` rows, beside `before`/`after`. The console requires a reason (≥ 3
characters) before it will submit a suspension.

**Why.** The UI had an "audited suspension reason (required for compliance)" field that the
API never read — the reason was typed, required and discarded. Either the field goes or the
reason goes into the trail; INV-6 makes it the second. Additive field, no consumer breaks.

**Alternatives.** A separate `admin_audit_reasons` table (over-engineered for one field); a
mandatory reason on every PATCH (breaks the role/membership paths that have nothing to
explain, and would have required a client change for every caller).

**Rollback.** Ignore the field on the server; the extra metadata key is harmless.

### D-024-1 — The seven remaining seeded tabs read their real endpoints, or render nothing

- **Status:** ACCEPTED · **Invariants:** INV-1, INV-5 · **Evidence:**
  `frontend/src/components/admin/Admin{Security,HelpDesk,Queues,Moderation,BlogManagement,ContentMarketing,Health,Operations}Tab.tsx`,
  `frontend/tests/unit/admin-*.test.{ts,tsx}` (69 component tests)

**Decision.** Every remaining admin tab with sample rows was rebuilt on the endpoint that owns
the data, with `useAdminResource` for the three honest states and `describeAdminFailure` for
refusals. Where no endpoint exists, the surface is **removed and explained**, not faked:

- Security & audit → `/platform/security-events`, `/admin/audit-logs(+/stats)`,
  `/admin/users`, `/platform/announcements` (create/supersede/delete, `expectedRevision`).
  The "IP block" control is gone: no edge-proxy route exists.
- Help desk → `/admin/support/tickets` (+ messages, status `PATCH`). Replies and status
  changes that fail are reported as failures; the ticket list is never seeded.
- Outbox & dead letters → `/platform/queues`. The "Purge dead letters" button is gone —
  the route answers `410 DEAD_LETTER_PURGE_RETIRED` by design; "Retry all" is gone —
  the retry route accepts one notification dead letter and answers `400` otherwise. The
  page states that the payload is a sample (`summary.sampled`, `sampleSize`).
- Marketplace moderation → `/admin/employer-applications` (the route that sets the
  `employer` claim and revokes tokens — not the fictional `/verify`), `/admin/jobs`
  (exactly one field per request), `/admin/companies`, `/enterprise/tenants`.
- Blog → `/blog-data` (the mounted route; `/blog/posts` 404'd on every load and is why
  the sample articles were permanent). Deletes carry `expectedRevision`.
- Content & marketing → `/phrases` (whole-category replace, which is what the endpoint
  does) and `/reviews`. The "Trusted By logos" and "Landing pages & SEO" sections are
  removed: no schema, no route, no document type, and their rows carried invented
  conversion rates. Tracked as `OI-CMS-1`.
- Platform health → `/platform/operational-status` (+ detail + probe). `DEFAULT_28_SERVICES`
  and the merge that hid unlisted-but-down services are gone.
- Platform operations → `/admin/health-summary` + `/admin/system-health-settings`. The
  backup and cache-purge cards are gone (`OI-OPS-1`): both announced success for routes
  that do not exist, with a fabricated last-snapshot timestamp.

**Why remove rather than disable.** A disabled button preserves the lie at one remove ("it
will work later") and keeps the invented rows on screen. An absent control with a sentence
naming the missing route and the runbook path is checkable — and it is what `OI-001-1` /
`OI-TRUTH-1` acceptance demands.

**Alternatives.** Implement the missing routes (backup trigger, IP block, logo registry):
rejected — each needs a schema, an audited write and a drill before a console may offer it,
and inventing the backend to match an invented UI is the same defect upstream. Keep the
buttons and surface `501 Not Implemented`: rejected — a control that always fails is noise.

**Trade-offs.** Two marketing sections and two operations cards are gone from the console;
if the product intent wants them, they return as RECs with schema first. Coverage thresholds
for the component tier stay at 80/75/75/80 (`D-022-1`); the measured 83.90/77.83/82.77/84.47
now spans 14 modules instead of 6.

**Rollback.** `git revert` of the console-integrity commits restores the old tabs wholesale;
nothing else reads their exports except the admin router.

### D-025-1 — Fix the admin job-status filter by making the query parameter explicit

- **Status:** ACCEPTED · **Invariants:** INV-1 · **Evidence:**
  `frontend/src/components/admin/AdminModerationTab.tsx` (JobsPanel filter),
  `frontend/tests/unit/admin-moderation-registries.test.tsx`

**Decision.** `useAdminResource` refetches on `reload()`, not on loader identity (the loader
is held in a ref precisely to avoid infinite loops). The job-status filter is a query
parameter, so changing it calls `resource.reload()` explicitly instead of relying on the
callback identity changing. This is the pattern every future filtered read must follow.

**Why.** Without it the status chips changed `aria-pressed` while the rows stayed put — a
filter that filters nothing. Found by the filter-branch tests written to close the coverage
gap (`D-022-1`): the test drove the chip and asserted the refetch.

**Rollback.** Trivial; the hook semantics are unchanged.

### D-026-1 — Correcting the characterisation citations where they were wrong

- **Status:** ACCEPTED · **Invariants:** pack consistency · **Evidence:**
  `test/characterisation.test.js` (relabeled), `test/characterisation-divergences.test.js`

**Decision.** The characterisation suite labelled its pins with DIV numbers that
did not match `07-intentional-divergence-register.md` (e.g. "DIV-013:
configuration resolution order" while the register's DIV-013 is the
payment-settings read guard; "DIV-011: audit actions namespaced" while register
DIV-011 is the SUPER_ADMIN lifecycle). The pinned behaviours were real; the
citations were not. The blocks are relabelled to the decisions that actually
document them (ADR-001/002, D-005-1/7/9, RCA-005/006, INV-2/3/4, DIV-014), and a
second file adds pins for the register's remaining code-level divergences
(DIV-007/009/010/011/012/013/015/017).

**Why it matters.** A characterisation pin whose citation is wrong is worse than
no pin: it sends the next maintainer to the wrong decision and undermines the
"every divergence justified" claim.

**Rollback.** Revert both files; no runtime code depends on the labels.

### D-027-1 — The query-plan tier owns the two plans it found

- **Status:** ACCEPTED · **Invariants:** REC-020 (performance tier) · **Evidence:**
  `database/migrations/030_outbox_created_at_indexes.sql`, `repositories/MySQLRepository.js:706`,
  `test/query-plan-regression.test.js`

**Decision.** The query-plan regression registry (13 hot queries) found three
real defects on its first run: both outbox `ORDER BY created_at DESC LIMIT ?`
scans (`routes/platform.js:478,480`) had no index that could serve an unscoped
recency read, and the identity lookup wrapped its indexed column in `LOWER()`,
hiding `idx_user_email` (and redundantly so, under `utf8mb4_unicode_ci`). The
fixes are migration `030` (two recency indexes + their rollbacks) and the bare
`email = ?` predicate — with the collation premise pinned in the test so a future
collation change fails the gate instead of silently breaking equivalence.

**Alternatives.** Leave the plans and mark them `boundedScan` exceptions
(rejected: neither is bounded by an operator action); fix only the test to match
the code (rejected: that is how query-plan drift becomes an outage).

**Rollback.** `git revert` the migration and the one-line predicate change; the
registry entry for `email` then fails loudly, which is the intended signal.

### D-028-1 — The coverage gate is raised to the bar, and proven to fail

- **Status:** ACCEPTED · **Invariants:** INV-1…INV-6 (the gate is how every other claim stays
  true) · **ADR:** `decisions/ADR-006-coverage-gate-proven-to-fail.md` ·
  **Evidence:** `backend/.c8rc.json`, `backend/package.json` (`test:coverage`),
  `developer-review/admin/TEST-EVIDENCE.md §3`

**Decision.** The gate moved from `--branches=70 … --per-file=true` (which reported 82.52 %
branches against a 80 % floor) to `--statements=95 --lines=95 --functions=90 --branches=85
--per-file=false`, matching `.c8rc.json`. The 85 % branch floor is the 10/10 bar's number, not a
rounded-down version of the measured value, and the two configurations now agree so the
`check-coverage` line cannot contradict the rc file.

**Why not per-file.** `--per-file=true` with a 85 % floor fails on four modules whose remaining
branches are `pool.query` error arms. Raising the floor *and* keeping per-file would have failed
the build on code that is correct, which teaches the next maintainer to raise the exemption
rather than write the test. The honest arrangement is a global floor at the bar plus a named
open item (`OI-T-7`) that says exactly which files are under it and why.

**Proof it enforces.** With the floor raised to 99 on the same coverage data, `c8
check-coverage` exits 1 (`TEST-EVIDENCE.md §3`). A gate nobody has seen fail is a gate nobody
knows is wired.

**Alternatives.** (1) Leave 80 % and keep the "honest gap" paragraph — rejected: a
self-documented gap in a document whose purpose is proof is just a quieter failure. (2) Exclude
the four modules from `include` — rejected: that is falsifying the denominator.

**Rollback.** Lower the four numbers in `.c8rc.json` and the `check-coverage` flags together.
The tests stay; only the floor moves, so the measured percentages do not change.

### D-029-1 — `null` revision means "no stored row", and an audit failure is a 503

- **Status:** ACCEPTED · **Invariants:** INV-4, INV-6 · **RCA:** RCA-011 ·
  **Evidence:** `services/configService.js` (`expectedMatches`), `routes/config.js`
  (`STORE_FAILURE_CODES`), `test/config-edge-coverage.test.js` (16)

**Decision.** Two behaviours were wrong and are now the reverse, both found by the edge-coverage
suite rather than by review:

1. `writeConfigValue` treated `expectedRevision === null` as "skip the comparison". Any client
   that rendered a page before a row existed therefore sent `null` and overwrote whatever
   another operator had written in between — last-write-wins, the exact failure REC-015 exists
   to prevent. `null` now asserts "no value is stored" and is compared like any other
   expectation: against a stored row it is a `409 CONFIG_REVISION_CONFLICT` carrying
   `currentRevision`.
2. An audit-write failure answered 500. A 500 on a write tells the operator "it may have
   saved", which invites a second attempt that duplicates or contradicts the first. Store-level
   codes — `ECONNREFUSED`, `ER_NO_SUCH_TABLE`, `POOL_CLOSED`, `AUDIT_WRITE_FAILED` — are now
   503: nothing took effect, retry later.

**Client impact.** None. `AdminConfigTab.tsx:200` already sends the revision it rendered, so a
`null` only ever comes from a client that has seen no row — which is now the case where the
write is safe.

**Alternatives.** (1) Treat `null` as `0` — same hole one revision later, and it would make
"create" impossible to distinguish from "overwrite revision 0". (2) Keep 500 for audit
failures and document it — rejected: the documented error table is what clients code against,
and this one is indistinguishable from "unknown server error".

**Rollback.** Revert the `expectedMatches` block and `STORE_FAILURE_CODES`; the tests that pin
both will fail, which is the intended signal.
