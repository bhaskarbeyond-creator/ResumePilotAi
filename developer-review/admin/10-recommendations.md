# 10 — Recommendations and Required Modifications

**Contract for every entry.** Each recommendation names the exact file(s)/route(s)/table(s) to change, the defect it closes, the acceptance criteria that make it done, the risk of making the change, an effort estimate, and how a verifier proves it. Effort: **S** ≤ 1 engineer-day, **M** 2–5 days, **L** > 5 days (single engineer, including tests). Nothing here authorises implementation — this document specifies the modification; it does not perform it.

**Sequencing principle.** Three constraints dominate the order, and they are not negotiable:

1. **REC-004 and REC-003 before everything else.** One closes a live escalation path (`ADMIN` → strip `SUPER_ADMIN` MFA); the other makes 13 console operations actually work. Both are small and self-contained.
2. **REC-012 step (a) — secret classification — must precede REC-012 step (b) — revision fix.** Fixing the revision contract first would activate a write path that publishes a Twilio auth token on an unauthenticated endpoint (RCA-013).
3. **REC-005 and REC-006 before any new tab is built.** Building UI against the current permission model encodes the inverted `ADMIN` risk profile (§08 §4.4) into more screens.

**Phase plan**

| Phase | Contents | Gate to exit the phase |
|---|---|---|
| **0 — Emergency (≤ 1 sprint)** | REC-004, REC-003, REC-002, the classification half of REC-012 | Account-takeover chain closed; no console action reports success after a 404; no secret-valued key can reach `public_config` |
| **1 — Truth and authority** | REC-001, REC-005, REC-006, REC-008, REC-012 (revision half), REC-015 | No fixtures in admin tabs; one authorisation engine; audit trail readable by AUDITOR; settings save; before/after audited |
| **2 — Restore coverage** | REC-007, REC-009, REC-010, REC-011, REC-013, REC-014, REC-019, REC-020, REC-021 | Every MUST-intent capability in §04 has a working surface or a recorded, dated deferral |
| **3 — Governance and durability** | REC-016, REC-017, REC-018, REC-022, REC-023, REC-024, REC-025, REC-026 | INV-1…INV-6 asserted in CI; no justification row in §09 is unjustified |

---

## Phase 0 — Emergency

### REC-001 — Delete every fixture and make provenance explicit
**Fixes** RCA-001 · **Severity** Critical · **Effort** M · **Phase** 1

| | |
|---|---|
| **Files** | `frontend/src/components/admin/AdminDashboardTab.tsx:40-47`; `AdminUsersTab.tsx:174-183` (and `DEFAULT_USERS`); `AdminSecurityTab.tsx:147-181`; `AdminContentMarketingTab.tsx:66-111`; `AdminAttentionTab.tsx:79`; `AdminModerationTab.tsx:116-118`; `AdminBlogManagementTab.tsx:86`; `AdminQueuesTab.tsx:114-115,237`; `AdminHelpDeskTab.tsx:117`; `AdminOperationsTab.tsx:48-52`; `AdminHealthTab.tsx:50,508`; new `frontend/src/components/admin/shared/AdminDataSurface.tsx`; `frontend/src/hooks/use-api-hooks.ts:326-346` |
| **Change** | Delete every `useState(FIXTURE)`, every `if (len > 0) setX`, every `\|\| FALLBACK` numeric default. Replace each tab's data region with `<AdminDataSurface status={…} data={…} error={…} emptyMessage={…}>`, which renders exactly one of `loading / empty / error / live` and a provenance chip. Bind the dashboard to `GET /api/platform/command-center` (`routes/platform.js:621`). |
| **Acceptance criteria** | 1) `grep -c "DEFAULT_USERS\|INITIAL_EVENTS\|DEFAULT_TICKETS\|DEFAULT_28_SERVICES\|INTIAL_ITEMS" frontend/src/components/admin/*.tsx` = 0. 2) With the API stubbed to reject, every tab renders an `error` state and **zero** numeric KPIs. 3) With the API returning an empty collection, every tab renders `empty` and does not resurface a fixture. 4) Every data region renders a provenance chip whose value is one of `LIVE`/`EMPTY`/`UNAVAILABLE`/`LOADING`. |
| **Risk** | Product-perception risk (dashboards look emptier in dev). Mitigation: provenance chip makes the change legible; seed a dev-only fixture *server-side* so demos still show data through an honest path. |
| **Verification** | Vitest per tab: (a) reject → assert `data-testid="admin-surface-error"` present, no `data-testid="kpi-value"`; (b) empty payload → `admin-surface-empty`; (c) payload → values match payload exactly. |

### REC-002 — Make every mutation fail loudly
**Fixes** RCA-002 · **Severity** Critical · **Effort** M · **Phase** 0

| | |
|---|---|
| **Files** | `frontend/src/components/admin/AdminUsersTab.tsx:203-225,260-281`; `AdminOperationsTab.tsx:118-145`; `AdminModerationTab.tsx:150-160`; `AdminBlogManagementTab.tsx:126-134`; `AdminQueuesTab.tsx:173-208,262,285`; `AdminHelpDeskTab.tsx:157-188`; `frontend/src/lib/api-client.ts` (add `mutate<T>()`) |
| **Change** | Remove all 14 `.catch(() => {})` sites. Add `mutate<T>()` that resolves only on `2xx` and throws a typed `ApiError{status, code, message}` otherwise. Update local state only from the response body. Delete the client-side reset-link minting (`sec_rst_<Date.now()>`) — the link must come from the server or the action must fail. |
| **Acceptance criteria** | 1) `grep -c "catch(() => {})" frontend/src/components/admin/*.tsx` = 0. 2) Stubbed `500` on each mutation → error toast, no state change, no success string rendered. 3) A failed reset-link request leaves the clipboard untouched and shows a failure message. 4) Every mutation's success path uses the server's returned record, not a locally constructed one. |
| **Risk** | Medium — until REC-003 lands, 10 mutations will visibly fail. Ship in the same sprint. |
| **Verification** | Per-mutation test matrix (mutate → stub status ∈ {200, 400, 404, 500}) asserting DOM state and state-variable state. |

### REC-003 — Close the 13 frontend→backend contract breaks
**Fixes** RCA-003 · **Severity** Critical · **Effort** S · **Phase** 0

| | |
|---|---|
| **Files** | `AdminUsersTab.tsx` (`POST /admin/users/:uid/status` → `PATCH /api/admin/users/:uid` with `{suspended}`); `AdminQueuesTab.tsx` (→ `POST /api/platform/queues/retry` `{jobId}`, `POST /api/platform/queues/purge` `{jobId}`); `AdminOperationsTab.tsx` (→ `/api/platform/maintenance` (`platform.js:547,576`), backup status `/api/platform/backup-status`); `AdminModerationTab.tsx` (→ `PATCH /api/admin/employer-applications/:uid`, `PATCH /api/admin/jobs/:jobId`); `AdminBlogManagementTab.tsx` (→ `GET /api/blog-data`, `DELETE /api/blog-data/:id`); `AdminDashboardTab.tsx` (→ `GET /api/platform/command-center`); tenants callers → `/api/enterprise/platform/tenants` |
| **Change** | Remap all 13 paths per Appendix A.5; adapt request payloads to the real handler signatures (three are not 1:1). Add a contract test that extracts every call string from `frontend/src` and asserts it resolves against the Express route table. |
| **Acceptance criteria** | 1) All 13 remapped; each returns non-404 for `SUPER_ADMIN` in a live environment. 2) `npm run certify:contracts` resolves 100 % of FE call strings; 0 unresolved. 3) The contract test fails the build when a new unresolved path is added. |
| **Risk** | Low; two payload shapes change (`queues/retry` takes `jobId`, employer verification takes `uid` not application `id`). |
| **Verification** | The contract test itself, plus Appendix A.3's probe matrix re-run showing no 404s on FE-called paths. |

### REC-004 — Add a target-privilege ceiling to every user-mutating handler
**Fixes** RCA-005, RCA-006 · **Severity** Critical · **Effort** S · **Phase** 0

| | |
|---|---|
| **Files** | new `backend/security/targetAuthority.js` (`assertCanActOnTarget`, `roleRank`); `backend/routes/adminUsers.js` (`unenroll-mfa`, `revoke-sessions`, `send-password-reset`, `ai-entitlement`, `PATCH /:uid`, `delete-user`); `backend/security/auth.js` (export a `roleRank(role): number`) |
| **Change** | Define `SUPER_ADMIN(40) > ADMIN(30) > AUDITOR(20) = SUPPORT(20) > ENTERPRISE_ADMIN(10) > … > USER(0)`. Every user mutation: `if (roleRank(target) >= roleRank(caller) && caller !== SUPER_ADMIN) → 403 TARGET_OUTRANKS_CALLER`, with `SUPER_ADMIN → SUPER_ADMIN` explicitly permitted. Add `requireRecentAdminAuthentication` semantics for ADMIN (a new `requireRecentAuth` variant that does **not** begin with the super-admin precondition) on `unenroll-mfa`. |
| **Acceptance criteria** | 1) `ADMIN` → `unenroll-mfa` on a `SUPER_ADMIN` uid returns `403 TARGET_OUTRANKS_CALLER` (today: `500` = allowed). 2) `ADMIN` → same on another `ADMIN` returns non-403. 3) `SUPER_ADMIN` → `SUPER_ADMIN` permitted (INV-2 preserved). 4) `AUDITOR`/`SUPPORT` remain non-mutating. 5) A stale session on `unenroll-mfa` returns a distinguishable `403 RECENT_AUTH_REQUIRED`. 6) Every denial writes an audit row with `action=TARGET_AUTHORITY_DENIED`. |
| **Risk** | Low code risk; **behaviour change** — admins lose the ability to rescue a locked-out root account. That is intended; the break-glass answer is §11 RR-003. |
| **Verification** | The 4×2 caller/target matrix as a checked-in test (8 mutations × 4 targets = 32 assertions). Probe re-run of `[PROBE-004]`. |

---

## Phase 1 — Truth and authority

### REC-005 — Replace the frozen permission literal with database-backed role bundles
**Fixes** RCA-009, INV-3, LD-03, LD-05 · **Severity** Critical · **Effort** L · **Phase** 1

| | |
|---|---|
| **Files** | new migration `backend/database/migrations/028_admin_rbac.sql` (`admin_roles(id,name,is_system)`, `admin_role_permissions(role_id,resource,action)`, `admin_user_roles(uid,role_id,granted_by,granted_at,expires_at)`); `backend/security/auth.js:63-88` (delete literal), `:190-197` (`permissionsFor` → `resolvePermissions`), `:198` (`requirePermission` → hierarchy-aware); new `backend/services/adminRbac.js`; seed script mirroring the current 23/7/4 permission sets |
| **Change** | Permissions become `resource:action` pairs with `manage ⊃ write ⊃ read`. Resolution: DB bundles ∪ explicit `admin_user_roles` grants; **drop** the `claims.permissions` union. Seed the four built-in roles from the current literal so day-one behaviour is byte-identical. Role change and grant change write an audit row with before/after. A super-admin bypass becomes an explicit, audited opt-in (`bypass_reason` required). |
| **Acceptance criteria** | 1) For each built-in role, DB resolution == today's literal (golden test). 2) `GRANT audit:read TO AUDITOR` via API takes effect without restart and produces an audit row. 3) `system.config:manage` implies `system.config:read` (hierarchy test). 4) `claims.permissions` no longer influences authorisation (negative test). 5) Zero permissions required-but-unassigned: every `requirePermission` string exists in ≥1 bundle. |
| **Risk** | **High** — hot path, lockout potential. Mitigation: dual-run for one release (log `db_perms ≠ literal_perms` divergence, alert on any), then flip. Rollback = revert the resolver to the literal (kept in the migration source). |
| **Verification** | Golden-set test per role; grant/revoke E2E; Appendix A.2 census regenerated as a test fixture; `[PROBE-002]` matrix re-run and diffed. |

### REC-006 — One authorisation engine with a declarative route manifest
**Fixes** RCA-004, RCA-007, RCA-008 · **Severity** Critical · **Effort** M · **Phase** 1

| | |
|---|---|
| **Files** | new `backend/security/routeManifest.js` (generated, then reviewed); `backend/security/policy.js:3-101` (delete `ADMIN_PREFIXES`/`ADMIN_EXACT`/`resolveAdminReadPermission`/`resolveAdminMutationPermission`; keep `enforceApiPolicy` as a thin adapter or remove); `backend/index.js` mount; every `requirePermission(...)` site aligned to the manifest |
| **Change** | Declare `route → (resource, action)` once. Generate the manifest from the current route table, then *assert* it reproduces today's allow/deny matrix before deleting the path tables. Specifically correct the eight mis-resolutions from Appendix A.2: `audit-logs*` → `audit:read`; `settings*` GET → `system.config:read`; `settings*` POST → `system.config:manage`; `pages*` → `content:manage`; coupons → `payments:read`; `messages*` → `messages:read`; etc. |
| **Acceptance criteria** | 1) The full 145-route × 5-role matrix is identical before and after, except the 8 intentional corrections. 2) `AUDITOR` receives `200` on `GET /api/admin/audit-logs`. 3) `ADMIN` receives `200` on `GET /api/admin/settings/:category` for readable categories (paired with REC-012 or the panel still cannot save). 4) No route in `/api/admin\|/api/platform` is reachable without a manifest entry (CI assertion). |
| **Risk** | **High** — a wrong manifest entry can open or close production. Mitigation is procedural: generate, diff, assert matrix equivalence, then deploy. Never hand-author the manifest. |
| **Verification** | Appendix A.3 matrix as a checked-in fixture; route-manifest coverage test = 100 %; `[PROBE-002]` re-run per role. |

### REC-007 — Rebuild the Tenants Registry end-to-end
**Fixes** RCA-014, CAP-006 · **Severity** High · **Effort** M · **Phase** 2

| | |
|---|---|
| **Files** | new `frontend/src/components/admin/AdminTenantsTab.tsx`; `console.tsx:50-66` (+`tenants`), `:81-104` (capability-derived); backend: add `GET /api/platform/tenants` (list) alongside the existing detail route (`routes/enterprise.js:608` `GET /platform/tenants` returns the list; `platform.js:1444` is detail) — consolidate on **one** namespace; reuse `tenantService.registry` |
| **Change** | List (search, plan, status, seats, last-activity) + detail (config, members count, lifecycle history) + suspend/reactivate with a mandatory typed reason. Suspend writes `enterprise_tenant_configurations.status` and an audit row with before/after. |
| **Acceptance criteria** | 1) List paginates and filters server-side. 2) Suspend requires a reason and writes `before=ACTIVE/after=SUSPENDED` to `admin_audit_logs`. 3) Suspended tenant's authenticated calls return `403 TENANT_SUSPENDED`. 4) Reactivate restores all three. 5) Only `SUPER_ADMIN` (or a granted `tenants:manage`) can suspend; `AUDITOR` read-only. |
| **Risk** | Medium — customer-impacting action. Confirmation dialog naming the tenant, reason field, and a 5-second undo window (reactivate is in the same screen). |
| **Verification** | E2E on a seeded tenant: suspend → assert DB, audit, and a 403 from the tenant's own token; reactivate → assert restoration. |

### REC-008 — Restore the Admin Audit Trail as a first-class surface
**Fixes** RCA-004, CAP-007 · **Severity** Critical · **Effort** S · **Phase** 1

| | |
|---|---|
| **Files** | new `frontend/src/components/admin/AdminAuditTab.tsx`; `console.tsx` (+`audit` in `VALID_TABS`, add to AUDITOR/ADMIN sets); consume the existing hook `frontend/src/hooks/use-api-hooks.ts:442`; backend `GET /api/admin/audit-logs`, `/stats`, `/:id` (present) |
| **Change** | Table of audit events with filters (actor, action, target, date range, outcome), a detail drawer showing `metadata` and — after REC-015 — `before`/`after`; export to CSV for auditors. |
| **Acceptance criteria** | 1) Acting as `AUDITOR`, the tab lists events and paginates. 2) Filters are server-side (no client filtering of a capped page). 3) Detail shows actor, timestamp, action, target, outcome, and `before`/`after` when present. 4) `AUDITOR` cannot mutate anything from this screen. 5) Empty state is explicit (no fixture). |
| **Risk** | Low; read-only. One policy question: whether to redact actor emails for AUDITOR (§11 RR-004). |
| **Verification** | Executing an admin action then loading the tab as AUDITOR shows the event; probe `/api/admin/audit-logs` → 200 for AUDITOR (closes RCA-004). |

### REC-009 — Restore step-up recovery in the client
**Fixes** RCA-012, CAP-016, CAP-017 · **Severity** High · **Effort** M · **Phase** 2

| | |
|---|---|
| **Files** | new `frontend/src/lib/admin-reauth.ts` (interceptor) + `frontend/src/components/admin/AdminReauthDialog.tsx`; `frontend/src/lib/api-client.ts:120-180`; shell header for MFA posture; reference implementation `src/components/admin/AdminReauthPrompt.jsx` + `src/services/adminReauth.js` |
| **Change** | On `403` with `error.code === 'RECENT_AUTH_REQUIRED'`, queue the request, show the dialog (password or federated popup), replay on success, expose cancel (`REAUTH_CANCELLED`). Show `MFA enrolled / not enrolled` and the freshness window in the shell header. |
| **Acceptance criteria** | 1) A stale-session refund opens the dialog (not a generic error). 2) Successful reauth completes the original request exactly once. 3) Cancel aborts and mutates nothing. 4) Concurrent actions queue rather than opening N dialogs. 5) MFA posture is visible in the header. |
| **Risk** | Low; the legacy implementation is the spec and was production-tested. |
| **Verification** | Test with `REQUIRE_RECENT_AUTH_IN_TEST=true` and an aged `auth_time` claim: assert dialog → replay → single mutation; assert cancel path. |

### REC-010 — Wire or remove the 18 module toggles
**Fixes** RCA-011 · **Severity** High · **Effort** M · **Phase** 2

| | |
|---|---|
| **Files** | `frontend/src/components/admin/AdminSettingsTab.tsx:356-500` (`MODULE_DEFINITIONS`, and the "Instant Global Propagation" caption at `:484`); backend consumers per Appendix A.7 |
| **Change** | For each of the 18 keys: (a) wired — add a server-side gate at every consumer, returning `403 MODULE_DISABLED`; or (b) unwired — remove the toggle and the key from `MODULE_DEFINITIONS`. Correct the caption to list which flags are restart-required. |
| **Acceptance criteria** | 1) Every key in `MODULE_DEFINITIONS` has ≥1 non-definition consumer **or** is deleted. 2) A census test in CI enforces (1) and fails the build otherwise. 3) For each wired flag: off → endpoint returns `403 MODULE_DISABLED`; on → 200. 4) Caption states restart requirement per flag. |
| **Risk** | Medium: gating 14 features touches many handlers. Prefer removal for keys with no near-term consumer. |
| **Verification** | Appendix A.7 census test + one behavioural test per wired flag. |

### REC-011 — Restore the missing settings fields and categories
**Fixes** RCA-013 (field scope), CAP-029…058 · **Severity** High · **Effort** L · **Phase** 2

| | |
|---|---|
| **Files** | `frontend/src/components/admin/AdminSettingsTab.tsx` (all 5 panels); `backend/index.js:3555-3557` (`GENERIC_ADMIN_SETTING_CATEGORIES` — already contains every category needed) |
| **Change** | Add the 11 missing surfaces (`firebase` status, `socialAuth`, `jobScraper`, `watermark`, `security` limits, `exportPdf` switches, `orders`/transactions, `pages`/CMS, `blog` engine, `ads`, `analytics`) and the 10 broken panels' fields, each bound to an existing category with server validation. Watermark, security limits and job-scraper are pure field additions (categories already accepted). |
| **Acceptance criteria** | 1) Every category in `GENERIC_ADMIN_SETTING_CATEGORIES` is either editable in the console or explicitly listed as "API-only, reason: …" in the UI. 2) No console field writes a category/key the server does not accept (contract test). 3) Each new field has a validation rule and appears in the audit `changedFields`. |
| **Risk** | Medium: surface area grows; keep the 5-section structure (5 groups, more fields) rather than restoring 31 screens (DIV-001). |
| **Verification** | Category-coverage test: for each allowlisted category, saving a probe value succeeds and re-reads identically. |

### REC-012 — Repair the settings write contract (ordered: classification first)
**Fixes** RCA-013, CFG-017…020, 024…027, 033 · **Severity** High · **Effort** M · **Phase** 0 (step a) / 1 (step b)

| | |
|---|---|
| **Files** | `backend/index.js:3658-3664` (`isPrivateAdminSettingKey`); `frontend/src/components/admin/AdminSettingsTab.tsx` (11 call sites + `revision` state); `backend/index.js:3885-3892`, `:4250-4256` (unchanged — the contract is correct) |
| **Change (a) FIRST** | Extend the private-key classifier to catch the invented names (`twilioToken`, `twilioAuthToken`, `recaptchaSecret`, …) and add a **test** that walks every category's projected payload and asserts no key matches `/(secret\|token\|password\|keySecret\|private)/i`. Do this **before** any write path starts working. |
| **Change (b)** | One settings client: read `revision` from `GET /api/admin/settings/:category` (already returned, `index.js:3831`) or `/api/admin/payment-settings`, send `expectedRevision` on every write, map `409` to a "reload and re-apply" state. Route Twilio through `/api/admin/twilio-settings` (`index.js:4845`) and delete the `integrations.twilio*` fields. Rename integration fields to the consumed names (`googleMapsApiKey`, `recaptchaSecretKey` — `platformHealth.js:488-497`). |
| **Acceptance criteria** | 1) All 10 panels save; the value re-reads identically. 2) A concurrent-tab save produces the 409 reload prompt, not silent loss. 3) `GET /api/platform/public-config` contains no key matching the secret regex. 4) Maps/reCAPTCHA report configured after a save. 5) Twilio writes only through the canonical route and produces `TWILIO_SETTINGS_UPDATED`. |
| **Risk** | **Medium-high, order-critical.** Doing (b) before (a) publishes a Twilio auth token on an unauthenticated endpoint. This is the one recommendation where the order is a security control. |
| **Verification** | (a) secret-projection test across all categories; (b) per-panel save/re-read + 409 test; (c) `curl /api/platform/public-config` grep for secret-shaped keys = 0. |

---

## Phase 2 — Restore coverage (continued)

### REC-013 — Feature Flags console + Operations consolidation
**Fixes** RCA-015, CAP-049 · **Severity** High · **Effort** S · **Phase** 2

| | |
|---|---|
| **Files** | new `frontend/src/components/admin/AdminFeatureFlagsPanel.tsx`; `AdminOperationsTab.tsx`; consume `GET/PUT /api/platform/feature-flags` (`platform.js:1637,1646`), `featureFlagService.js` |
| **Change** | Flag list with description, owner, scope, restart-required, current value; toggle requires step-up (already enforced server-side) and names the blast radius in a confirmation. |
| **Acceptance criteria** | 1) Seven flags listed with metadata. 2) Toggle → DB change + audit row + `restart-pending` badge. 3) Non-SA roles cannot see the panel; direct `PUT` returns 403 for them. 4) No fixture, explicit empty state. |
| **Risk** | Low. Three flags stop workers — confirmation text must say so. |
| **Verification** | Toggle test + `[PROBE-002]` role assertions (SA 200, ADMIN 403). |

### REC-014 — Capability-derived navigation and tab access
**Fixes** RCA-019, DIV-004, DIV-008 · **Severity** High · **Effort** M · **Phase** 2

| | |
|---|---|
| **Files** | new `GET /api/admin/capabilities` (returns resolved `resource:action` set for the session); `frontend/src/pages/admin/console.tsx:50-104,137,218`; `frontend/src/components/shell/cuba-app-shell.tsx:276,407-424` |
| **Change** | Server publishes capabilities; tabs, nav groups and in-page controls derive from them. Delete the `isSupport/isAuditor/else-all` switch. Fail **closed** for an unknown role (zero tabs + explanatory screen). Legacy's `RequireTabPerm` table (`src/components/admin/Admin.jsx:840-960`) is the migration source. |
| **Acceptance criteria** | 1) Rendered tab set == probed reachable set for each of the 5 synthetic roles. 2) Unknown role → zero tabs (not all tabs). 3) Adding a permission in the DB changes the nav without a deploy. 4) No nav item renders for a resource the session cannot read. |
| **Risk** | Low (backend already enforces). Depends on REC-005. |
| **Verification** | Role × tab snapshot tests generated from the capability fixture. |

### REC-015 — Audit completeness: before/after, scope, fail-closed
**Fixes** RCA-016, RCA-022, INV-6 · **Severity** High · **Effort** M · **Phase** 1

| | |
|---|---|
| **Files** | `backend/database/migrations/029_audit_values.sql` (`before_value JSON NULL`, `after_value JSON NULL`, `scope ENUM('platform','tenant','module') NULL`); `backend/index.js:3945-3965`; `backend/security/adminAudit.js:110-205,194-196`; `backend/routes/adminPlatformOperations.js` (0 audit calls today) |
| **Change** | Persist redacted `before`/`after` on every settings write (images already in memory inside the transaction); add explicit recording to `adminPlatformOperations.js` and `index.js` handlers; make audit failure fail the request for state-changing operations (`503 AUDIT_WRITE_FAILED`) and log-and-count for sensitive reads. |
| **Acceptance criteria** | 1) Currency INR→USD produces `before={"currency":"INR"}`, `after={"currency":"USD"}`, `scope=platform`. 2) Secret rotation produces masked values only. 3) With `INSERT` revoked on `admin_audit_logs`, a settings save returns `503` and does **not** persist. 4) Every mutating handler in `adminPlatformOperations.js` produces a row. |
| **Risk** | Medium: mandatory audit converts an audit outage into a control-plane outage (accepted trade for mutations — §11 RR-005). Redaction failure is the real hazard. |
| **Verification** | Before/after assertion test; redaction test; audit-failure injection test; coverage grep (every mutating route has a recorder or a documented exemption). |

### REC-016 — Platform configuration census surface
**Fixes** RCA-017, CAP-050 · **Severity** Medium · **Effort** S · **Phase** 3

| | |
|---|---|
| **Files** | new `frontend/src/components/admin/AdminPlatformConfigTab.tsx`; consume `GET /api/platform/configuration` (`platform.js:1670`); `services/platformConfiguration.js:338-480` |
| **Change** | Grouped, read-only census: value, source (`env`/`db`), owner, restart-required, and a link that either resolves to a real console location or states "no UI — API only". |
| **Acceptance criteria** | 1) Every census entry renders with a non-empty owner. 2) No deep link resolves to a removed tab (the legacy failure). 3) Read-only (no write control). 4) SA-only. |
| **Risk** | Low. |
| **Verification** | Snapshot test of ~90 entries + link-resolution test. |

### REC-017 — Delete dead code and non-enforced contract comments
**Fixes** RCA-018, RCA-020 · **Severity** Low · **Effort** S · **Phase** 3

| | |
|---|---|
| **Files** | `backend/routes/platform.js:1846-1985` (delete the four duplicate blocks); comments at `AdminSettingsTab.tsx:12,484`, `AdminHelpDeskTab.tsx:156` |
| **Change** | Remove the second registrations; add a CI assertion that no `(method, path)` is registered twice in a router; replace contract comments that no test enforces with a reference to the enforcing test or delete them. |
| **Acceptance criteria** | 1) `grep -c "router.get('/payment-settings'"` = 1 (and equivalents). 2) Route-uniqueness test passes. 3) Full probe matrix unchanged before/after. 4) No comment claims a contract that a test does not enforce. |
| **Risk** | Very low (dead code). |
| **Verification** | Route-uniqueness test + probe matrix diff. |

### REC-018 — Replace the role-view simulation with a server-verified projection
**Fixes** RCA-021, CAP-014 · **Severity** High · **Effort** S · **Phase** 3

| | |
|---|---|
| **Files** | `frontend/src/components/shell/cuba-app-shell.tsx:276,283-317`; `backend/routes/platform.js:2027` (`POST /role-view-audit`) |
| **Change** | Interim: gate the switcher on `SUPER_ADMIN` and require the audit write to succeed before switching (a failed audit = no switch). Target: delete the simulation and use REC-014's capability projection, which shows the true reduced view for any role. |
| **Acceptance criteria** | 1) As `ADMIN`, the switcher is absent. 2) As `SUPER_ADMIN`, one switch = one audit row; a failed audit write cancels the switch. 3) The rendered view under simulation matches the capability projection exactly (or the simulation is removed). |
| **Risk** | Low; product may value the demo affordance (§11 RR-004). |
| **Verification** | Role tests + audit-failure injection. |

### REC-019 — User 360 aggregate view
**Fixes** CAP-010 · **Severity** Medium · **Effort** M · **Phase** 3

| | |
|---|---|
| **Files** | new `GET /api/admin/users/:uid/360` (compose existing reads: profile, memberships, documents, AI entitlement, recent audit); new `AdminUserDrawer.tsx` |
| **Change** | One screen per user: identity, tenancy, entitlement, documents, audit history — each section stating its own source and failure. |
| **Acceptance criteria** | 1) One request returns all sections (no N+1 across tabs). 2) Each section degrades independently (`error` per section, not per page). 3) Sensitive reads emit an audit row. 4) Respects the target-privilege ceiling (REC-004). |
| **Risk** | Medium: aggregation endpoint can become an authorisation shortcut — enforce per-section authorisation server-side. |
| **Verification** | Per-section authorisation matrix + latency budget test. |

### REC-020 — Complete tenant lifecycle and the staff roster
**Fixes** RCA-014 (part 2), CAP-013 · **Severity** High · **Effort** M · **Phase** 2

| | |
|---|---|
| **Files** | `AdminTenantsTab.tsx` (decommission, GC actions); new `AdminOperatorsTab.tsx` consuming `GET/POST /api/platform/operators` (`platform.js:1304,1342`), `revoke-sessions` (`:1402`); backend `platform.js:1547` decommission, `:1587` garbage-collect |
| **Change** | Operator roster with role, MFA status, last sign-in, session revocation; tenant decommission and GC behind confirmation + reason. |
| **Acceptance criteria** | 1) Roster reflects live claims (MFA enrolled y/n, last sign-in). 2) Revoke-sessions ends the target's sessions within one token lifetime. 3) Decommission/GC require typed confirmation and write audit rows. 4) Both SA-only, matching the backend. |
| **Risk** | Medium: session revocation is disruptive; GC is irreversible. Two-step confirmation + audit. |
| **Verification** | E2E: revoke → target's next call 401; GC on a seeded tombstone → row count drops to 0 and audit row present. |

### REC-021 — Restore the remaining management surfaces
**Fixes** CAP-018…027, 043, 045, 054, 055, 058 · **Severity** High · **Effort** L · **Phase** 2

| | |
|---|---|
| **Files** | new tabs: `AdminJobsTab.tsx` (`PATCH /api/admin/jobs/:jobId`), `AdminCompaniesTab.tsx` (`GET`/`PATCH /api/admin/companies*`), `AdminEmployerApplicationsTab.tsx` (`PATCH /api/admin/employer-applications/:uid`), `AdminReviewsTab.tsx`, `AdminPagesTab.tsx`, `AdminPhrasesTab.tsx`, `AdminLandingPagesTab.tsx`, `AdminTrustedByTab.tsx`, `AdminMessagesTab.tsx`, `AdminOrdersTab.tsx` (or extend `AdminContentMarketingTab`) |
| **Change** | Build each against its real backend (all listed routes exist — Appendix A.1). Consolidate related ones (blog + blog-engine + landing claims; content + announcements + ads) to avoid re-creating 24 fragmented tabs (DIV-003). |
| **Acceptance criteria** | 1) Each capability in the list has a reachable surface with list/detail/write. 2) No new tab uses a fixture (REC-001 wrapper enforced). 3) Each write produces an audit row (REC-015). 4) Nav derived from capabilities (REC-014), not hard-coded. |
| **Risk** | Medium: breadth. Do not start until REC-001/002/014 are merged, or the new tabs will reproduce the same defect class. |
| **Verification** | Per-surface CRUD E2E through the console, not the API. |

### REC-022 — Consolidate credential ownership (email, SMS, payment secrets)
**Fixes** CFG-020, CFG-033, DIV-017 dependency · **Severity** Medium · **Effort** S · **Phase** 3

| | |
|---|---|
| **Files** | `index.js:4826-4915` (Twilio), `routes/email.js:1662,1829` (SMTP), `index.js:3291,4219` (payments), `platform.js:1707` (payment projection) |
| **Change** | One rule, documented and enforced: a credential has exactly one write route, one read projection, and one precedence order (env > db). Delete the competing `integrations.*` writers. Surface "deployment-managed" state instead of an editable field. |
| **Acceptance criteria** | 1) Each credential key appears in exactly one write route. 2) A contract test asserts no console field posts a credential-shaped key to a generic settings category. 3) Env-managed credentials render read-only with an explanation (matches `index.js:4853`). |
| **Risk** | Low. |
| **Verification** | Credential-writer census test; UI test for read-only state. |

---

## Phase 3 — Governance and durability

### REC-023 — Test coverage for the control plane
**Fixes** Appendix A.6 (14 of 15 tabs untested) · **Severity** High · **Effort** L · **Phase** 3

| | |
|---|---|
| **Files** | new `frontend/src/components/admin/__tests__/`; new `backend/test/admin-rbac.matrix.test.js`; extend `scripts/verify-admin-superadmin-live.mjs` |
| **Change** | Three suites: (1) **contract** — every FE call string resolves to a registered route; (2) **authorisation matrix** — the 145-route × 5-role table as a fixture; (3) **surface** — per tab: loading/empty/error/live + one mutation success and one failure. |
| **Acceptance criteria** | 1) ≥1 test per tab (15 tabs). 2) Contract suite fails on any unresolved path. 3) Matrix suite fails on any guard change without a fixture update. 4) Coverage of `frontend/src/components/admin/**` ≥ 60 % lines. |
| **Risk** | Low, but the matrix suite will initially fail loudly on the 8 mis-resolutions — land REC-006 first or mark them `test.failing` with tickets. |
| **Verification** | CI green on all three suites; mutation of a guard causes a red build (verified once by hand). |

### REC-024 — Make the six invariants a release gate
**Fixes** INV-1…INV-6 · **Severity** High · **Effort** M · **Phase** 3

| | |
|---|---|
| **Files** | `scripts/verify-admin-superadmin-live.mjs` (root `package.json` `certify:admin`); new `scripts/verify-invariants.mjs` |
| **Change** | `npm run certify:admin` must assert: (INV-1) every capability in a manifest has a live route + a UI route; (INV-2) SA passes all probes and every SA-block is declared in an allowlist with a reason; (INV-3) every role resolves from DB and the hierarchy holds; (INV-4) every CFG row has a key or a justification record; (INV-5) FE-visible ⊆ BE-permitted (the §08 matrix, generated); (INV-6) a canary settings write produces a before/after audit row. |
| **Acceptance criteria** | 1) Script exits non-zero when any invariant regresses (verify by deliberately breaking one). 2) Runs in CI on every PR touching `backend/security/**` or `frontend/src/components/admin/**`. 3) Output is a machine-readable JSON + a human summary. |
| **Risk** | Low; the risk is a brittle gate that gets disabled. Keep assertions behavioural (probe-based), not textual. |
| **Verification** | Deliberate-regression drills for each of the six. |

### REC-025 — Observability for admin actions
**Fixes** RCA-022 (detection half), SW-24 · **Severity** Medium · **Effort** S · **Phase** 3

| | |
|---|---|
| **Files** | `backend/security/adminAudit.js`; metrics surface in `platformHealth.js`; alert rules |
| **Change** | Emit counters `admin_audit_write_failures`, `admin_action_total{action,outcome}`, `admin_denied_total{code}`; alert on any audit write failure and on `TARGET_AUTHORITY_DENIED` spikes. |
| **Acceptance criteria** | 1) Metrics visible in `/api/platform/operational-status`. 2) An injected audit-write failure appears within one scrape. 3) Denials are attributable by role and route. |
| **Risk** | Low. |
| **Verification** | Inject a failure; assert the metric increments and the alert fires in staging. |

### REC-026 — Document and instrument super-admin provisioning
**Fixes** RCA-010, DIV-011 · **Severity** High · **Effort** S · **Phase** 3

| | |
|---|---|
| **Files** | `docs/admin/super-admin-provisioning.md`; extend `GET /api/platform/operators` (attestation view, role filter); new reconciliation job |
| **Change** | Written runbook (role-based, not person-based) for granting/revoking root; an attestation view listing every root account with MFA state and last sign-in; a scheduled reconciliation comparing Firebase custom claims against `admin_*` records with an alert on divergence. |
| **Acceptance criteria** | 1) Runbook reviewed by the security owner. 2) Attestation view lists all root accounts with MFA state. 3) Reconciliation emits `admin.root_accounts_mismatch`; non-zero pages the on-call. 4) Every provisioning event produces an audit row. |
| **Risk** | Low technical; the runbook must not name individuals. |
| **Verification** | Deliberately create an out-of-band root account → reconciliation flags it within one cycle. |

---

## Coverage check: does every defect and gap have a home?

| Item | Recommendations |
|---|---|
| RCA-001…022 | 001,002,003,004,005,006,007,008,009,010,011,012,013,014,015,016,017,018,019,020,021,022 — **22/22 mapped** |
| INV-1…INV-6 | INV-1 → REC-007/008/013/014/020/021 · INV-2 → REC-026 (+REC-016 for explanation) · INV-3 → REC-005 · INV-4 → REC-011/012/016 · INV-5 → REC-006/014/024 · INV-6 → REC-015/024 |
| CFG-001…034 | 14 unjustified → REC-011 (field) + REC-012 (contract) + REC-016 (census); 9 broken → REC-012; 8 justified → REC-016 (read-only exposure) |
| CAP gaps (27 missing) | REC-007 (006), REC-008 (007), REC-013 (049), REC-019 (010), REC-020 (013, 006 part 2), REC-021 (018–027, 043, 045, 054, 055, 058), REC-011 (033, 035, 040, 047, 050 partial) |
| Divergences (18) | REJECT-verdict DIV-003 → REC-014/021 · DIV-004 → REC-014 · DIV-007 → REC-009 · DIV-018 → REC-005 · ACCEPT-CONDITIONAL follow-ups → REC-011/012/015/016/026 |

---

*Cross-references: capabilities §04 · root causes §06 · divergences §07 · invariants §08 · configuration §09 · residual risk §11.*
