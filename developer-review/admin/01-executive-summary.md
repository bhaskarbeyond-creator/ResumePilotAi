# 01 — Executive Summary

**Subject:** Admin Control Plane (platform staff + super-admin) of the new `frontend/` + `backend/`.
**Verdict:** **Not releasable as an administrative control plane.** The backend is functionally capable and in places genuinely well engineered; the *new admin console* is a partially-wired prototype that, in 12 of its 14 tabs, presents fabricated data and reports success for operations that never occurred. The RBAC model that both layers depend on is hard-coded, internally inconsistent, and missing an entire class of guarantee.

---

## 1. What was reviewed

The repository holds four trees (see `README.md` §2). The **legacy reference** is `reference-code/` (live-production snapshot at SHA `24ada353`, declared immutable in `reference-code/README.md`) plus `src/` (the SPA source that produced it). The **new system** is `frontend/` (a TypeScript rewrite) and `backend/` (the service layer).

The single most important structural finding is this:

> **The admin backend was not rewritten. It is the legacy admin backend carried forward.** `diff reference-code/backend/routes/adminUsers.js backend/routes/adminUsers.js` yields **zero lines**; `security/adminAudit.js` and `routes/adminAudit.js` likewise; `security/auth.js` differs only by the `optionalAuth` refactor; the role→permission map (`backend/security/auth.js:63-88`) is byte-identical to legacy. What was rewritten — and what regressed — is the **frontend console**.

Consequence: this review separates two very different remediation tracks. The backend needs *targeted policy hardening* (8 of the 22 defects are backend-side, 2 of them Critical). The frontend needs *completion*, not patching: it is missing 27 of 59 legacy capabilities (46 %) and misrepresents 23 of the 24 surfaces it does have.

---

## 2. Coverage at a glance

59 legacy capabilities were inventoried and classified (§03). Coverage outcome across all 59 (§04):

| Coverage status | Count | Share | Note |
|---|---|---|---|
| Covered correctly | **1** | 2 % | Only maintenance + system-health settings (CAP-048): the sole capability whose read shape, write shape, revision handling and error reporting all match the server |
| Covered but flawed | **23** | 39 % | Surface exists but is fixture-backed, contract-broken (wrong path **or wrong response shape**), or authorised away from the role that needs it |
| Missing | **27** | 46 % | Includes the entire Tenants Registry, Admin Audit Trail tab, Feature Flags, Messages, and 14 of the 31 settings screens (12 genuine gaps + 2 correctly obsolete) |
| Over-engineered | **1** | 2 % | CAP-014 super-admin role-view *simulation* — a client-side impersonation mode that changes no server decision, built while the real capability model (INV-3) is absent |
| Intentionally redesigned | **7** | 12 % | Documented in §07 with rationale and intent-preservation proof |

**The headline:** the legacy console exposed 24 tab-level routes and 31 configuration screens in 29,777 lines. The new console exposes 15 tabs and 5 configuration sections in 8,252 lines — a 72 % reduction in surface, of which only a minority is justified by consolidation. Three legacy capability families have **no** equivalent anywhere in the new UI: **Tenants Registry**, **Admin Audit Trail (as a reachable surface)**, and **Feature Flags**.

---

## 3. Critical findings (read these first)

### CF-1 — The admin console displays fabricated platform data as if it were live *(RCA-001, Critical)*

Every data tab seeds React state from a hard-coded constant (`DEFAULT_USERS`, `INITIAL_EVENTS`, `DEFAULT_TICKETS`, `DEFAULT_28_SERVICES`, …) and then loads real data with a guard that **refuses to replace the fixture with an empty result** and a `catch` that keeps the fixture on error. Example, `frontend/src/components/admin/AdminUsersTab.tsx:174-183`:

```js
const res = await get('/admin/users');
if (res?.users && Array.isArray(res.users) && res.users.length > 0) setUsers(res.users);
} catch { /* Keep baseline */ }
```

`[PROBE-002]` on a clean install returns `{"success":true,"users":[]}` for `GET /api/admin/users` — the console therefore renders four fictional people (including “Alex Rivera, SUPER_ADMIN, Northwind Careers (Owner)”) as the platform's user directory, and an operator can act on them. Same pattern in `AdminSecurityTab.tsx:159,177,181`, `AdminContentMarketingTab.tsx:66-111`, `AdminAttentionTab.tsx:79`, `AdminModerationTab.tsx:116-118`, `AdminBlogManagementTab.tsx:86`, `AdminQueuesTab.tsx:114-115`, `AdminDashboardTab.tsx:40`, `AdminHealthTab.tsx:50,508`, `AdminHelpDeskTab.tsx:117`, `AdminOperationsTab.tsx:48-52`.

In a security console, fabricated data is not a cosmetic placeholder — it is a **false assurance of state**.

### CF-2 — Mutations report success after failing (*RCA-002, Critical)*

Mutations are wrapped in `.catch(() => {})`, then local state is optimistically updated and a success message is shown. Verified instances (`[PROBE-003]` shows the target routes return `404 NOT_FOUND`):

| User action | Code | What the operator is told | What actually happened |
|---|---|---|---|
| Suspend a user | `AdminUsersTab.tsx:203-225` | “User … marked as SUSPENDED” | `POST /api/admin/users/:uid/status` → **404**, no such route |
| Copy a password-reset link | `AdminUsersTab.tsx:260-281` | “One-time password reset link copied to clipboard” | Request failed; a **fabricated** `?reset_token=sec_rst_<Date.now()>` URL is minted client-side |
| Trigger MariaDB backup | `AdminOperationsTab.tsx:118-131` | “MariaDB hot backup snapshot completed successfully” | `POST /api/admin/operations/backup` → **404** |
| Purge caches | `AdminOperationsTab.tsx:135-145` | “route and model caches purged across nodes” | `POST /api/admin/operations/cache-clear` → **404** |
| Approve employer | `AdminModerationTab.tsx:150-160` | “approved & verified badge assigned” | `POST /api/admin/employer-applications/:id/verify` → **404** |
| Delete blog post | `AdminBlogManagementTab.tsx:126-134` | “Article … deleted successfully” | `DELETE /api/blog/posts/:id` → **404** |
| Retry / purge DLQ | `AdminQueuesTab.tsx:173-208,262,285` | “re-dispatched” | `POST /api/admin/queues/dead-letter-queue/*` → **404** |
| Reply to a ticket | `AdminHelpDeskTab.tsx:157-175` | Reply appears in-thread as `STAFF` | Route exists; on any failure the message is still appended locally |

An operator who suspends a compromised account and is told it succeeded, when it did not, has been materially misled by the control plane. This is the highest-consequence defect class in the set and the reason the console cannot ship.

### CF-3 — Step 1 of a documented account-takeover chain exists: an `ADMIN` can strip MFA from a `SUPER_ADMIN` *(RCA-005, Critical)*

`backend/routes/adminUsers.js:1079-1098` authorises `POST /api/admin/users/:uid/unenroll-mfa` on `users.update` **with no target-rank check**, then calls `updateUser(uid,{multiFactor:{enrolledFactors:[]}})` and `revokeRefreshTokens(uid)`. The sibling handler `PATCH /:uid` *does* protect super-admin targets (`adminUsers.js:758-770`) — proving the protection was intended and was simply not applied here. Paired with `POST /:uid/send-password-reset` (`:1000`, same missing rank check), an `ADMIN` holds the complete chain against a `SUPER_ADMIN` account. `[PROBE-002]` confirms ADMIN is authorised on that handler (status `500 app/invalid-credential` = passed authorisation, failed only because Firebase is unconfigured here).

### CF-4 — The roles designed to read the audit trail cannot read it *(RCA-004, Critical)*

`AUDITOR` exists to read `audit.read`; both the handler (`backend/routes/adminAudit.js:14`) and the legacy sidebar (`src/components/admin/sidebar/sidebar.jsx:22`) grant it. But `backend/security/policy.js:79` defaults every unmatched `/admin/*` read to `'system.config.read'`, which is granted to **no role at all** (Appendix A.2). `[PROBE-003]`: `GET /api/admin/audit-logs` → `AUDITOR 403`, `ADMIN 403`, `SUPER_ADMIN 503` (authorised, DB down). The audit trail is super-admin-only, and the new console has no audit tab anyway (§CF-1 table, CAP-007).

### CF-5 — The platform role model is code, not configuration, and its vocabulary has drifted *(RCA-007, RCA-008, RCA-009)*

* Roles are an 8-entry frozen object literal (`backend/security/auth.js:63-88`). **No `admin_roles`, `permissions`, or `role_permissions` table exists in any migration** (`grep -rn "CREATE TABLE" backend/database/migrations/*.sql`). Names, bundles and even the *existence* of a permission are deploy-time facts.
* **8 permissions are required by code yet granted to no role** — including `system.config.read` (required at 13 call sites). **24 permissions are granted to a role yet required nowhere** — including `users.delete`, `tenants.write`, `notifications.send`.
* The concrete user-visible consequence: **`ADMIN` can write 25 surfaces it cannot read.** `[PROBE-002]`: `POST /api/admin/settings/branding` → `400 ADMIN_SETTINGS_REVISION_REQUIRED` (authorised) while `GET /api/admin/settings/branding` → `403` (denied). Same asymmetry for `/api/admin/pages`, `/api/admin/trusted-by`, `/api/admin/companies`, `/api/platform/announcements`.
* Two independent authorisers coexist — route middleware (`requirePermission`, 61 routes) and a hard-coded path-string table (`enforceApiPolicy`, 60 routes) — and they disagree (§08.3). Four routes in `backend/routes/platform.js` are registered twice with **divergent guards** (`:1670`/`:1846`, `:1707`/`:1883`, `:1727`/`:1903`, `:1809`/`:1985`); the second copies are dead code whose only effect is to make the file lie about its own policy.

### CF-6 — Recoverable security flows have no recovery UI *(RCA-012, High)*

The backend requires step-up authentication (`RECENT_AUTH_REQUIRED`, `SUPER_ADMIN_MFA_REQUIRED`) on every destructive control-plane mutation (`backend/security/auth.js:265-306`). Legacy shipped a first-class handler: `src/components/admin/AdminReauthPrompt.jsx` plus `src/services/adminReauth.js` re-authenticates and **retries the paused operation**. The new frontend contains no equivalent (`grep -rn "RECENT_AUTH_REQUIRED" frontend/src` returns only the AI-settings quota hook). Every super-admin destructive action in the new console therefore fails with an opaque error and no path forward — which is precisely the condition under which operators start asking for the control to be removed. The legacy MFA posture banner (`src/components/admin/Admin.jsx:810-825`) is likewise gone.

### CF-7 — Four of the five settings panels cannot save, and repairing them naively would publish a credential *(RCA-013, High)*

The generic settings write is the best-engineered path in the backend: it requires a valid `expectedRevision` inside a row-locked transaction (`backend/index.js:3885-3892`), whitelists the category, normalises the payload, and writes its audit row in the same transaction. **Four of the five console panels do not send `expectedRevision`** (`AdminSettingsTab.tsx:880-886,1024-1034,1179-1187,661`), so every save fails with a `400` the UI renders as "Failed to save". Only the modules panel sends it — which is why the module toggles are the one settings surface that works.

The second half is worse. The integrations panel writes `twilioSid`/`twilioToken` into the `integrations` category, but the canonical route is `/api/admin/twilio-settings` (`index.js:4845`). Because secret classification is by **field name** (`isPrivateAdminSettingKey`, `:3658-3664`) and `twilioToken` matches none of the patterns, a *successful* write would place that token in `public_config`, which the **unauthenticated** `GET /api/platform/public-config` (`routes/platform.js:227-256`) serves verbatim. The defect is latent only because the write currently fails.

> **Ordering is a security control:** the classification fix must land *before* the revision fix. A developer who "unblocks the save button" first ships a credential leak.

---

## 4. Defect count by severity

| Severity | Count | IDs |
|---|---|---|
| Critical | **6** | RCA-001, RCA-002, RCA-003, RCA-004, RCA-005, RCA-006 |
| High | **11** | RCA-007, RCA-008, RCA-009, RCA-010, RCA-011, RCA-012, RCA-013, RCA-014, RCA-015, RCA-021, RCA-022 |
| Medium | **3** | RCA-016, RCA-017, RCA-019 |
| Low | **2** | RCA-018, RCA-020 |
| **Total** | **22** | §06 |

(RCA-003 is counted Critical because 13 of the console's API calls target routes that do not exist — it is the mechanical cause of half of CF-2.)

---

## 5. Top recommendations (full set and detail in §10)

| # | Recommendation | Fixes | Severity addressed | Effort |
|---|---|---|---|---|
| **REC-001** | Remove every fixture constant from the admin console and replace each with an explicit `loading / empty / error / live` state; delete the "keep baseline" pattern in all 12 tabs; add a single `<AdminDataSurface>` wrapper that cannot render data without a provenance tag (`live` \| `error`). | RCA-001 | Critical | M |
| **REC-002** | Make every console mutation fail loudly: remove the 14 `.catch(() => {})` sites; do not mutate local state or show success unless the response is 2xx; delete the client-minted reset-link fallback. | RCA-002 | Critical | M |
| **REC-003** | Close the 13 frontend→backend contract breaks, per the mapping table in Appendix A.5 (e.g. `POST /admin/employer-applications/:id/verify` → `PATCH /api/admin/employer-applications/:uid`; `DELETE /blog/posts/:id` → `DELETE /api/blog-data/:id`). Add a contract test that enumerates every `api-client` call string and asserts it resolves to a registered Express route. | RCA-003 | Critical | S |
| **REC-004** | Add a target-privilege ceiling to all user-mutating handlers (`unenroll-mfa`, `revoke-sessions`, `send-password-reset`, `ai-entitlement`, `PATCH /:uid`): a caller may never act on an account whose role outranks its own, and `SUPER_ADMIN` targets are actionable only by `SUPER_ADMIN`. Extract one guard, `assertCanActOnTarget()`, and call it from all five. | RCA-005, RCA-006 | Critical | S |
| **REC-005** | Replace the frozen `PERMISSIONS` literal with a database-backed policy: `admin_roles(id,name,is_system)`, `admin_role_permissions(role_id,resource,action)`, `admin_user_roles(uid,role_id)`, resolved through a single `resolvePermissions(user)` with `manage ⊃ write ⊃ read` action hierarchy and an audited opt-in super-admin bypass. Seed the four built-in roles from the current literal so behaviour is preserved on day one. | RCA-007, RCA-009, INV-3 | Critical | L |
| **REC-006** | Consolidate the two authorisers: `enforceApiPolicy` becomes a **thin** call into the same `requirePermission` engine driven by a declarative route→(resource,action) manifest; delete the path-string read/mutation tables (`backend/security/policy.js:54-101`) and grant `system.config.read` (or its replacement `config:read`) to `ADMIN`, `AUDITOR`, `SUPPORT` as appropriate. | RCA-004, RCA-007, RCA-008 | Critical | M |
| **REC-007** | Rebuild the Tenants Registry end-to-end: `GET /api/admin/tenants` (list + filters + pagination) which does not exist today, plus a real console tab consuming it; reuse `tenantService.registry` rather than inventing a new path. | RCA-014, CAP-006 | High | M |
| **REC-008** | Restore the Admin Audit Trail as a first-class surface: a `TabId='audit'`, a real table bound to `GET /api/admin/audit-logs`, and the policy entry that lets `AUDITOR`/`ADMIN` read it. | RCA-004, CAP-007 | Critical | S |
| **REC-009** | Add step-up recovery: port `AdminReauthPrompt` + `adminReauth` request interception into the new frontend, and surface `MFA` posture in the console header. | RCA-012 | High | M |
| **REC-010** | Delete or complete the module toggles: of 18 toggles, only 4 have any backend consumer (`enableMessagesModule` `backend/index.js:600`, `enablePortfolioModule` `backend/routes/portfolios.js`, `enableLinkedinAuthModule`/`enableGithubAuthModule` health-report only). Either wire each to a real gate or remove it from the dashboard; do not claim “Instant Global Propagation” (`AdminSettingsTab.tsx:480`). | RCA-011 | High | M |
| **REC-012** | Repair the settings write contract in a **fixed order**: (a) extend the secret-key classifier so an invented field name like `twilioToken` can never be published, then (b) send `expectedRevision` from all 11 settings call sites, map `409` to a reload prompt, route Twilio through `/api/admin/twilio-settings`, and rename integration fields to the names `platformHealth.js` actually reads. | RCA-013 | High | M |

Fifteen further recommendations (REC-011, REC-013…REC-026) cover the remaining settings fields, capability-derived navigation, feature flags, audit completeness, the config census, dead code, test coverage, observability, provisioning and the release gate. §10 carries the full set with acceptance criteria.

---

## 6. Key intentional divergences from legacy (full register §07)

| ID | Divergence | Why it is correct |
|---|---|---|
| DIV-001 | Legacy's 31 separate settings screens collapsed into 5 sections | The legacy split was navigational, not semantic: 12 of the 31 screens wrote to two underlying `system_settings` roots and differed only by field names. Consolidation is defensible **provided** the fields survive — 14 screens do not, and 10 more are present but cannot save (§04, RCA-013). |
| DIV-004 | New console gates tabs by a **role switch** instead of legacy's permission table (`RequireTabPerm`) | Rejected as an improvement: it is a *regression*. Recorded in §07 as **DIV-004 = intentional-but-wrong**, with the required correction in REC-014. |
| DIV-006 | New console has no command palette in the admin shell | The Cuba shell owns ⌘K globally (`cuba-app-shell.tsx`); the *entity search* (legacy `adminEntitySearch.js`) is not replaced — flagged as a gap in CAP-015, not accepted. |
| DIV-008 | `SUPPORT`/`AUDITOR` tab sets hard-coded (2 and 5 tabs) | Documented as a **deliberate least-privilege narrowing** relative to legacy (where `SUPPORT` could reach 11 tabs) — this divergence is *correct in intent*, wrong in mechanism (hard-coded rather than permission-derived). |
| DIV-011 | `SUPER_ADMIN` cannot be created or demoted via API (`adminUsers.js:322`, `:762`) | Correct as a break-glass protection, but incomplete: it moves super-admin lifecycle out-of-band with no audited path (RCA-010). |
| DIV-015 | Audit writes are transactional in the settings path (`index.js:3956-3964`) but best-effort in the generic middleware (`adminAudit.js:194-196`) | Mixed. The transactional path is a genuine improvement over legacy; the best-effort path is carried over and should be fixed (RCA-022). |

---

## 7. What is genuinely good (do not regress it)

The review is not uniformly negative, and a remediation plan that rewrites the strong parts would waste the only mature work in the set:

1. **Health telemetry** (`GET /api/platform/operational-status`, `backend/services/platformHealth.js`, 793 lines) is real and correctly role-projected (`platform.js:271-286` strips host/PID/memory/rss/heap from non-super responses) and per-service probing works. The *server* is the mature artefact; the client mis-reads it (`services` array treated as a map — RCA-003), which is why the tab shows fixtures. Fix the client, keep the server.
2. **Settings persistence** (`backend/index.js:3843-3978`) is the best-engineered control-plane write path in the system: row-locked transaction, optimistic `expectedRevision`, payload normalisation, per-category whitelists, and an audit row written **inside the same transaction**.
3. **Super-admin step-up enforcement** (`auth.js:265-306`) is strict and correct — MFA + `auth_time` freshness, failing closed in production.
4. **Tenant RBAC** (`backend/enterprise/constants.js:18-66`, `tenantPolicy.js`) already implements the exact model REC-005 proposes for the platform plane: named role bundles, a permission whitelist, and **tenant-defined custom roles** stored in `enterprise_tenant_configurations.customRoles`. The pattern exists in-repo; it simply was not applied one layer up.
5. **Legacy's own honest self-documentation** in `src/components/admin/Admin.jsx:560-700` records why permission-derived tab gating was implemented — the new console discarded both the code and the reasoning.

---

## 8. Decision requested

| Decision | Options | Recommendation |
|---|---|---|
| Ship the admin console as-is behind a feature flag? | (a) no, (b) yes with operator training | **(a)**. CF-1/CF-2 mean an operator cannot distinguish working from non-working controls; training cannot fix an interface that states falsehoods. |
| Remediate backend policy first or complete the console first? | (a) backend first, (b) console first, (c) parallel tracks | **(c)**, with REC-004 (account-takeover chain) and REC-003 (contract breaks) pulled into a **single emergency sprint** ahead of both, because they are small, self-contained, and close a live escalation path. |

Both questions are answered in detail, with trade-offs, in §11 (RR-001, RR-002).
