# 08 — Admin Dashboard and Super-Admin Rights Analysis (RBAC)

**Purpose.** Prove or disprove six invariants about the admin control plane, with the mechanism of authorisation stated precisely enough that a reader can predict the outcome of any request without running it — and then verify that prediction against an executed probe.

**Method.** Two independent evidence bases:
1. **Static**: `backend/security/auth.js` (permission vocabulary and resolvers), `backend/security/policy.js` (path-string policy), the route census (Appendix A.1), and `frontend/src/pages/admin/console.tsx` / `cuba-app-shell.tsx` (visibility).
2. **Dynamic**: `[PROBE-002]`/`[PROBE-003]` — 26 representative `/api/admin|/api/platform` routes × 5 synthetic identities (`USER`, `SUPPORT`, `AUDITOR`, `ADMIN`, `SUPER_ADMIN`), executed against the real Express app with `setTokenVerifierForTests`. Interpretation rule: **`403` = denied; any other status = authorisation passed** (a `503` from an absent database proves the request reached business logic).

---

## 1. The authorisation model as implemented

### 1.1 Resolution order for any admin request

| # | Layer | Where | What it decides |
|---|---|---|---|
| 1 | `requireAuth` | `security/auth.js` (global, `index.js`) | Identity only; `401` if absent. |
| 2 | `enforceApiPolicy` | `security/policy.js:106`, mounted globally | For paths in `ADMIN_PREFIXES` (`:3`) or `ADMIN_EXACT` (`:9`): resolves a required permission from the **path string** (`resolveAdminReadPermission` `:54`, `resolveAdminMutationPermission` `:82`) and denies on absence. Unmatched admin reads default to `system.config.read` (`:79`). |
| 3 | Route middleware | per route | `requirePermission([...])` (`auth.js:198`), `requireSuperAdmin` (`:236`), `requireRecentAdminAuthentication` (`:265`), or none. **Note:** `requireRecentAdminAuthentication` opens with `if (!isSuperAdmin(req.user)) return 403` (`:276-280`), so it is a super-admin-only step-up — it does not and cannot protect an `ADMIN` action (INV-6/RCA-005 structural gap). |
| 4 | Handler | per route | Inline checks in 24 handlers; business logic. |

Layers 2 and 3 are **both** authorisation engines, evaluated in that order. When both exist the stricter wins, so the effective rule is `deny(layer2) ∨ deny(layer3)` — and because layer 2 is a path-prefix approximation, the effective rule frequently differs from what the handler's author intended (RCA-008).

### 1.2 Where permissions come from

```js
// backend/security/auth.js:190-197 (verbatim shape)
function permissionsFor(user) {
  const role = String(user?.role || '').toUpperCase();
  const bundle = PERMISSIONS[role] || [];
  const perUser = Array.isArray(user?.permissions) ? user.permissions : [];
  return [...bundle, ...perUser];          // ← union with an arbitrary claim
}
```

`PERMISSIONS` is `Object.freeze`d (`auth.js:63-88`) and **byte-identical to legacy** (`[DIFF-04]`). There is no `admin_roles`, `admin_role_permissions` or `admin_user_roles` table in any of the 27 migrations. `permissionsFor` performs **exact string matching**: `system.config.manage` does not imply `system.config.write`, which does not imply `system.config.read`. **There is no action hierarchy.**

### 1.3 Permission vocabulary census

Role bundles (`auth.js:63-88`, verbatim):

| Role | Count | Permissions |
|---|---|---|
| `SUPER_ADMIN` | 1 | `*` |
| `ADMIN` | 23 | `users.read/create/update/delete/roles.manage`, `tenants.read/write/manage`, `email.template.manage`, `email.logs.read`, `payments.manage`, `payments.read`, `notifications.send`, `ai.entitlements.manage`, `ai.usage.read`, `audit.read`, `security.read`, `tickets.manage`, `blog.write`, `blog.read`, `blog_management`, `content.manage`, `system.config.write` |
| `AUDITOR` | 7 | `users.read`, `tenants.read`, `email.logs.read`, `payments.read`, `ai.usage.read`, `audit.read`, `security.read` |
| `SUPPORT` | 4 | `users.read`, `email.logs.read`, `tenants.read`, `tickets.manage` |
| `ENTERPRISE_ADMIN` | 9 | tenant/workspace-scoped (see §1.5) |
| `ENTERPRISE_MEMBER` | 4 | `tenant.resumes.write`, `tenant.interviews.execute`, `tenant.ai.consume`, `workspace.read` |

**Required by code, granted to no role (8)** — every route behind them is super-admin-only in practice:

| Permission | Where it is required | Consequence |
|---|---|---|
| `system.config.read` | default for unmatched admin reads (`policy.js:79`); `ai-settings` (`policy.js:73`); email settings (`email.js:1662`); payment-settings (`platform.js:1883`) | All unlisted admin reads collapse to SA-only; `ADMIN` holds `.write` but not `.read` |
| `system.config.manage` | all generic settings mutations (`policy.js:82-101`) | **`ADMIN` cannot save any setting**, despite `system.config.write` |
| `secrets.manage` | secret-rotation paths (`policy.js:55`) | Only root may rotate secrets; no delegated path |
| `users.export` | export handler | No role can export |
| `users.security.manage` | security-posture mutations | No role can manage others' security settings |
| `payments.write` | payment mutations | Only root may refund/write payments |
| `messages.read` | messaging moderation | Nobody can read messages |
| `tenant.support.access` | tenant support impersonation | Nobody can use it |

**Granted to a role but required by no route (24).** These are decorative: `ADMIN`'s `blog.write`, `content.manage`, `notifications.send`, `tenants.write`, `tenants.manage`, `users.delete`, `users.roles.manage`, `blog_management` and 16 others appear in the literal but no handler calls `requirePermission` with them; the effective gate is the path policy (e.g. `ADMIN_EXACT`) instead. Consequence: reading the permission table does **not** tell you what a role can do — Appendix A.2 is the authoritative cross-check.

### 1.4 The role matrix, executed

`[PROBE-002]` — 26 routes × 5 identities. `403` = denied. `A` = `ADMIN`, `Ad` = `AUDITOR`, `S` = `SUPPORT`, `SA` = `SUPER_ADMIN`.

| Route | USER | S | Ad | A | SA | Note |
|---|---|---|---|---|---|---|
| `GET /api/admin/users` | 403 | 200 | 200 | 200 | 200 | least privilege correct |
| `GET /api/admin/users/:id/audit` | 403 | 403 | 200 | 200 | 200 | AUDITOR can audit a user… |
| `GET /api/admin/audit-logs` | 403 | 403 | **403** | **403** | 200 | …but not the audit trail (RCA-004) |
| `GET /api/platform/search` | 403 | 200 | 200 | 200 | 200 | entity search reachable, unused by FE |
| `GET /api/platform/operators` | 403 | 403 | 403 | 403 | 200 | SA-only as intended |
| `GET /api/platform/tenants/:tenantId` | 403 | 403 | 403 | 403 | 200 | SA-only; no list route used by FE |
| `GET /api/platform/configuration` | 403 | 403 | 403 | 403 | 200 | SA-only |
| `GET /api/admin/settings` | 403 | 403 | 403 | **403** | 200 | ADMIN denied config read despite `.write` |
| `GET /api/admin/ai-settings` | 403 | 403 | 403 | 403 | 200 | resolves to `system.config.read` |
| `GET /api/admin/pages` | 403 | 403 | 403 | 403 | 200 | ADMIN denied despite `content.manage` |
| `GET /api/admin/coupons` | 403 | 403 | 403 | 403 | 200 | ADMIN denied despite `payments.manage` |
| `GET /api/admin/blog/posts` | 403 | 403 | 403 | 403 | 200 | **404 for SA** — route does not exist |
| `POST /api/admin/queues/retry` | 403 | 403 | 403 | 403 | 404 | phantom (FE calls it) |
| `GET /api/platform/queues` | 403 | 403 | 200 | 200 | 200 | AUDITOR included |
| `GET /api/platform/backup-status` | 403 | 403 | 200 | 200 | 200 | |
| `GET /api/platform/attention` | 403 | 403 | 200 | 200 | 200 | |
| `GET /api/platform/encryption` | 403 | 403 | 200 | 200 | 200 | |
| `GET /api/admin/subscriptions` | 403 | 403 | 200 | 200 | 200 | |
| `GET /api/admin/health-summary` | 403 | 403 | 200 | 200 | 200 | |
| `GET /api/admin/companies` | 403 | 403 | 200 | 200 | 200 | AUDITOR may read companies |
| `GET /api/admin/database-settings` | 403 | 403 | 403 | 403 | 200 | SA-only, unmasked |
| `GET /api/admin/system-health-settings` | 403 | 403 | 403 | 403 | 200 | |
| `POST /api/admin/payments/refund` | 403 | 403 | 403 | 403 | 200 | SA-only — inconsistent with `payments.manage` |
| `POST /api/admin/delete-user` | 403 | 403 | 403 | 403 | 200 | SA-only |
| `POST /api/admin/users/:id/unenroll-mfa` | 403 | 403 | 403 | **500** | 500 | **ADMIN reaches it; no step-up** (RCA-005) |
| `POST /api/platform/role-view-audit` | 403 | 403 | 403 | **403** | 200 | the audited action is unavailable to the roles that use it (RCA-021) |
| `PUT /api/platform/feature-flags/:flag` | 403 | 403 | 403 | 403 | 200 | flags reachable only by raw PUT (RCA-015) |

Three patterns are visible in the matrix and are the substance of §2:

* **Pattern P1 — the default permission poisons reads.** Every route that is not in `ADMIN_EXACT`/`ADMIN_PREFIXES` resolves to `system.config.read`, which nobody has. Eight of the eleven `403`-for-`ADMIN` rows above are this, not a deliberate decision.
* **Pattern P2 — write implies nothing.** `ADMIN` holds `payments.manage`, `content.manage`, `blog.write` and is still denied the corresponding reads/writes; and holds `system.config.write` but not `.read`/`.manage`.
* **Pattern P3 — the sensitive mutations are stricter than the reads around them.** `delete-user`, `payments/refund`, `database-settings`, `system-health-settings` are SA-only while their siblings are ADMIN-accessible. This looks like least privilege but is undocumented and inconsistent (`payments.manage` grants nothing).

### 1.5 Tenant RBAC (contrast — used as the model for REC-005)

| Aspect | Platform plane | Tenant plane |
|---|---|---|
| Role definition | frozen literal in `security/auth.js:63-88` | `backend/enterprise/constants.js:18-66` + `customRoles` JSON column (`mysqlTenantRegistry.js`) |
| Permission shape | flat strings (`system.config.write`) | `resource:action` pairs, e.g. `workspace.manage` |
| Configurable by customers? | **No** — requires a deploy | **Yes** — `GET/PUT /api/enterprise/roles-matrix` (`routes/enterprise.js`), validated by `normalizeCustomRoles` |
| Storage | none (code) | `enterprise_tenant_configurations.customRoles` |
| Audit of changes | none | recorded through the tenant policy path |
| Hierarchy | **none** (exact match) | `manage ⊃ write ⊃ read` enforced in `tenantPolicy.js` |

The model INV-3 requires already exists in this repository, one layer down (DIV-018).

---

## 2. The six invariants — verdicts

Each verdict is a claim about the **new** system (new frontend + new backend). "Met" requires evidence that the invariant holds for every surface, not a majority.

### INV-1 — Every Must-exist / Should-exist capability is reachable from the dashboard
**Verdict: NOT MET — 27 of 59 capabilities have no surface.**

| Sub-claim | Status | Evidence |
|---|---|---|
| Every MUST-intent capability has a route in the console | ✗ | 12 legacy tab routes have no successor (§04 §3); 14 of 33 MUST-intent capabilities are Missing |
| Every capability that exists is reachable by the role that needs it | ✗ | `AUDITOR` cannot reach the audit trail (P1); `ADMIN` cannot save any setting (P2); SUPPORT cannot reach messages moderation because *no one* can (`messages.read` unassigned) |
| Every reachable capability functions | ✗ | 23 of 24 existing surfaces are flawed; only CAP-048 is correct end to end (§04) |
| Missing capabilities are recorded rather than silently dropped | ✓ | This review. Before it: no mapping existed anywhere in the repo |

*What "partially" would mean and why it is not enough:* 32 of 59 capabilities have *a* surface. Reachability is not a headcount — a dashboard from which the audit trail and the tenant registry cannot be opened does not satisfy "every Must-exist capability is reachable", regardless of how many tabs exist.

### INV-2 — Super-admin has unconditional complete rights; no hard-coded restriction blocks any path
**Verdict: PARTIALLY VIOLATED — authorisation is complete, but five hard-coded blocks apply to `SUPER_ADMIN` itself, two of which have no alternative path.**

| # | Block | Kind | Justified? | Alternative path |
|---|---|---|---|---|
| B1 | `SUPER_ADMIN` cannot be created or demoted via API (`adminUsers.js:322`, `:762`) | hard-coded role guard | **Yes** (break-glass protection) | **None** — out-of-band only, unaudited (RCA-010) |
| B2 | Infrastructure fields read-only: `exportPdf.websiteDomain`, `backendExportUrl`, `chromiumPath` (`index.js:3848-3851`) | value-level guard | Yes | Deployment config (correct owner) |
| B3 | `storage` category `501 STORAGE_PROVIDER_UNSUPPORTED` (`index.js:3852-3859`) | capability guard | Yes | None — adapter not implemented (honest refusal) |
| B4 | Twilio credentials cannot be cleared when env-managed (`index.js:4853`) | precedence guard | Yes — env wins | Deployment config |
| B5 | `superAdminMfaEnforced` (`auth.js:230`) blocks SA-session actions without MFA, and `requireRecentAdminAuthentication` blocks stale sessions | security precondition | Yes | Complete MFA / re-authenticate |

Authorisation itself is genuinely unconditional: `PERMISSIONS.SUPER_ADMIN = ['*']` and `isSuperAdmin` (`auth.js:219`) short-circuits `requirePermission`; every probed SA-owned route returns non-403 for SA. **The violation is not "SA is denied something it should reach" but "SA's own lifecycle (B1) is outside the audited system, and B2/B3/B5 present as failures rather than as explained refusals."** INV-2's wording — *"no hard-coded restriction blocks any path"* — is literally breached by B1–B5; the review's position is that B2/B3/B4/B5 are correct restrictions that must be **explained in the UI** (so they are not mistaken for defects), and B1 must be replaced by an audited, dual-approved path (REC-026).

**Additional hazard for REC-004.** The target-privilege ceiling must be written so `SUPER_ADMIN → SUPER_ADMIN` remains permitted and `SUPPORT`/`AUDITOR` cannot become mutating roles; otherwise REC-004 would itself violate INV-2.

### INV-3 — Admin roles are configurable permission bundles over resource×action, with an action hierarchy, plus an audited opt-in super-admin bypass
**Verdict: NOT MET for the platform plane. MET for the tenant plane.**

| Requirement | Platform plane | Evidence | Tenant plane |
|---|---|---|---|
| Roles are data, editable without a deploy | ✗ | frozen literal `auth.js:63-88`; no role tables in 27 migrations | ✓ `customRoles` + `/roles-matrix` |
| Permissions expressed as resource × action | ✗ | flat dotted strings, `permissionsFor` exact match | ✓ `tenant.members.manage`, `workspace.read` |
| `manage` implies `write` implies `read` | ✗ | `system.config.write` without `.read`/`.manage` (LD-03) | ✓ enforced in `tenantPolicy.js` |
| Audit trail on role change | ✗ | no role-change audit; no role change UI | ✓ tenant role edits recorded |
| Super-admin bypass is opt-in and audited | ✗ | `*` wildcard is unconditional; nothing records its use | n/a |
| Per-user grant is explicit and persisted | ✗ | `claims.permissions` union (`auth.js:190-197`) — unpersisted, unaudited (LD-05) | ✓ role assignment persisted |

This is the invariant with the widest gap and the cheapest fix in principle, because the required pattern exists in-repo (REC-005).

### INV-4 — Every business-affecting value is dashboard-configurable with validation/default/audit, unless justified as code-level
**Verdict: NOT MET.** Of the values catalogued in §09 (CFG-001…CFG-034): **3 are dashboard-configurable with validation + revision guard + audit** (CFG-021, 022, 034); **9 have a dashboard field but cannot persist** today (RCA-013) plus 1 with split contracts (CFG-033); **22 are code/env-only**, of which **8 are justified** (deployment-owned values, protocol caps, security invariants) and **14 are unjustified** (AI plan quotas, four rate limits, three retention windows, admin session TTL, queue sample size, audit sensitive-read list, template catalogue). Additionally, `system.config.manage` being granted to no role means that even the 3 working values are SA-only in practice (P2).

### INV-5 — UI hiding is not authorization; a frontend-visibility ↔ backend-enforcement matrix exists
**Verdict: MET as a property (the backend enforces), NOT MET as an artefact (no matrix existed before this document).** 66 of 145 distinct routes (46 %) have **no** route-level permission middleware and rely on the path-string policy alone (24 of them add an inline handler check); of those, the policy's default (`system.config.read`) is misaligned with handler intent in 8 probed cases. The matrix is §3 below.

### INV-6 — Configuration changes are audited with actor, timestamp, before/after, scope
**Verdict: PARTIAL — actor/timestamp/action/target are recorded; before/after and scope are absent; writes are not guaranteed to be recorded at all.**

| Element | Status | Evidence |
|---|---|---|
| Actor | ✓ | `admin_audit_logs.actor_uid` ([SQL-001]:503), populated by `createAdminAuditMiddleware` and by the settings transaction |
| Timestamp | ✓ | `created_at` |
| Action / target | ✓ | `action`, `target` columns |
| **Before value** | **✗** | not captured; the pre-image exists in memory (`index.js:3893-3908`) and is discarded |
| **After value** | **✗** | not captured; `changedFields` (field *names*) is recorded instead (`:3945-3952`) |
| **Scope** (platform / tenant / module) | **✗** | no scope column; tenant vs platform actions are distinguishable only by parsing `target` |
| Guaranteed to be written | **✗** | best-effort middleware swallows failures (`security/adminAudit.js:194-196`); `adminPlatformOperations.js` and `index.js` handlers record nothing (RCA-022) |

---

## 3. Frontend-visibility ↔ backend-enforcement matrix (INV-5)

**Why this matrix exists.** The console's visibility logic (`console.tsx:81-104`) and the shell's nav (`cuba-app-shell.tsx:407-424`) are client-side. The security question is never "what does the UI hide?" but "what happens when the request is sent anyway?". Each row is the console surface, the roles that can *see* it, and the enforcement outcome when a role that cannot see it sends the request directly.

Legend: **E** = hidden **and** enforced (safe); **V** = visible **and** enforced (safe, honest); **D** = visible but denied on the wire (UX defect — the operator is shown a control that always fails); **H** = hidden but *allowed* on the wire (**hazard**: a UI-only control that is not a control).

| Surface (tab / action) | Visible to | Backend gate | Enforcement for non-permitted role | Class |
|---|---|---|---|---|
| `dashboard` | all roles | `GET /platform/operational-status`, `/platform/attention` | 403 for SUPPORT (`[PROBE-002]`), 200 for AUDITOR | **D** — SUPPORT sees fabricated KPIs it must not act on |
| `health` | SA, ADMIN, AUDITOR | `requireAdmin` + policy | 403 for SUPPORT | **V** |
| `queues` (list) | SA, ADMIN, AUDITOR | `/platform/queues` | 403 for SUPPORT | **V** |
| `queues` (retry/purge) | SA, ADMIN, AUDITOR | route **404** for every role | n/a — route absent | **D** (deeper: RCA-003) |
| `operations` (maintenance) | SA, ADMIN, AUDITOR | `POST /admin/system-health-settings` (recent auth) | 403 for non-admin | **V** |
| `operations` (backup/cache) | SA, ADMIN, AUDITOR | route **404** | n/a | **D** |
| `attention` | SA, ADMIN, AUDITOR | `/platform/attention` | 403 for SUPPORT | **V** |
| `users` (list) | SA, ADMIN, AUDITOR, SUPPORT | `users.read` via policy | 403 for others | **V** |
| `users` (role change) | SA, ADMIN | `PATCH /admin/users/:uid` | **allowed for ADMIN against a SUPER_ADMIN target** | **H** — see RCA-006 |
| `users` (suspend) | SA, ADMIN, AUDITOR, SUPPORT | route **404** (policy would allow SUPPORT) | n/a — but *if* implemented per policy, SUPPORT could suspend | **H (latent)** |
| `users` (unenroll MFA) | SA, ADMIN | reachable by ADMIN, **no step-up, no target ceiling** | **500 for ADMIN against SA** = allowed | **H** — RCA-005 |
| `users` (reset link) | SA, ADMIN, AUDITOR, SUPPORT | route exists; FE fabricates a link on failure | permitted by policy for the same set | **H** — fabricated credential artefact |
| `support` (reply) | SA, ADMIN, AUDITOR, SUPPORT | `POST …/messages` (policy `tickets.manage` → mismatch) | AUDITOR holds no `tickets.manage` ⇒ 403 expected, FE swallows | **D** |
| `moderation` | SA, ADMIN | `PATCH /admin/employer-applications/:uid` (real) / FE calls a 404 route | 403 for AUDITOR | **D** |
| `blog` | SA, ADMIN | FE paths **404**; real `blog-data` requires `blog.write`/`blog.read` | 403 for AUDITOR | **D** |
| `content` | SA, ADMIN | announcements routes real (`platform.js:977-1120`); FE calls none | 403 for AUDITOR | **D** |
| `ai-settings` | SA only (probe) | `system.config.read` → SA-only | 403 for ADMIN/AUDITOR | **D** — visible to ADMIN, always fails |
| `email` | SA, ADMIN | `email.template.manage` / `system.config.read` (`email.js:1662`) | 403 for AUDITOR | **V** |
| `security` | SA, ADMIN, AUDITOR | `/platform/security-events` | 403 for SUPPORT | **V** |
| `settings` (read any category) | visible to SA/ADMIN; enforced SA-only | `system.config.read` default (`policy.js:79`) | 403 for ADMIN | **D** — panel rendered, every read 403 |
| `settings` (write any category) | visible to SA/ADMIN | `system.config.manage` (nobody but SA) | 403 for ADMIN | **D** |
| `settings` → `codeInjection` | visible to SA/ADMIN | SA-only + recent auth (`policy.js`, `index.js:3748`) | 403 for ADMIN | **D** |
| `modules` toggles | visible to SA/ADMIN | `system.config.manage` | 403 for ADMIN | **D** |
| Role-view switcher (shell) | **all roles** | `POST /platform/role-view-audit` SA-only | 403 for ADMIN; switch still applies locally | **H** — the UI changes what the operator believes, not what the server does (RCA-021) |
| Nav items (13 groups) | **all roles** (`cuba-app-shell.tsx:416-424`) | various | mixed 403 | **D** — dead links for every non-SA role |

**Tally (25 rows):** **V = 7**, **D = 13**, **H = 5**. 18 of 25 surfaces mis-signal what is permitted. There is no row where a *hidden* control is silently permitted by a route-level check — the backend is the strongest part of this picture, and the `H` rows are all cases where a **role-level** check exists but a **target-level** or **simulation-level** check does not.

**Conclusion for INV-5.** The property "hiding is not authorisation" **holds**: in every probed case the backend denies what the UI hides, because `requireAdmin` gates the whole `/api/admin|/api/platform` namespace and `USER` is denied on all 26 probed routes. What fails is the *inverse*: 13 surfaces are shown to roles the backend will refuse (`D`) and 5 are simulated without server-side effect (`H`). The matrix is therefore an artefact this review had to construct; it should be generated from the route manifest (REC-006) and asserted in CI (REC-024).

---

## 4. Super-admin rights — the specific analysis requested

### 4.1 What `SUPER_ADMIN` can do that no one else can (probe-confirmed)

`/platform/operators*`, `/platform/configuration`, `/platform/feature-flags` (+ `PUT`), `/platform/tenants/:id` (+ lifecycle), `/admin/settings*` (read and write), `/admin/audit-logs*`, `/admin/ai/entitlements`, `/admin/ai-settings`, `/admin/operations/feature-flags`, `/admin/pages*`, `/admin/coupons*`, `/admin/blog/posts*`, `/admin/trusted-by*`, `/admin/delete-user`, `/admin/payments/refund`, `/admin/system-health-settings`, `/admin/settings/codeInjection`, `/admin/firebase-service-account`, `/admin/database-settings`, `/platform/role-view-audit`.

### 4.2 Where super-admin authority is *not* complete

| Gap | Evidence | Remedy |
|---|---|---|
| Cannot create or demote a root account | `adminUsers.js:322,762` | REC-026 (audited provisioning) |
| Cannot edit deployment-owned infrastructure values | `index.js:3848-3851` | Correct by design; surface the owner in the UI (REC-016) |
| Cannot enable cloud storage | `index.js:3852-3859` (`501`) | Correct; needs an adapter decision (§11 RR-006) |
| Cannot reach 13 console operations because the FE calls non-existent paths | Appendix A.5 | REC-003 |
| Cannot change feature flags from the UI at all | no FE surface | REC-013 |
| Cannot read the audit trail from the UI | no FE surface, backend present | REC-008 |
| Cannot administer tenants from the UI | no FE surface, backend present | REC-007 |
| Every SA action is potentially unattested for before/after | INV-6 gap | REC-015 |

### 4.3 Restrictions that exist *only in the client* (the dangerous direction)

| Claim in the UI | Server reality | Class |
|---|---|---|
| "View as SUPPORT" (role switcher) reduces what you can do | Server uses the real role; all SA routes remain callable | **Simulation** (RCA-021) |
| SUPPORT sees 2 tabs (`support`, `users`) | Probe-confirmed reachable for SUPPORT: `/api/admin/users`, `/api/platform/search`, `/api/admin/support/tickets`. `/api/platform/queues` is 403, so the narrowing is real where it is implemented | UI under-grants; safe direction |
| AUDITOR sees "Compliance & Auditor Suite" | AUDITOR is denied the audit trail | **UI overstates capability** (RCA-004) |
| "Instant Global Propagation" for module flags | 14 of 18 flags have no consumer | **UI overstates effect** (RCA-011) |

### 4.4 Rights of `ADMIN` — the operative finding

`ADMIN` is, in practice, **a read-mostly role with no write capability in the console**:

* can read users, companies, subscriptions, health, queues, backup status, attention, encryption, security events, email logs/settings, user audit;
* **cannot** read or write any generic setting (`system.config.read`/`.manage` unassigned);
* **cannot** read audit logs, pages, coupons, trust-by, AI settings (path-defaulted to `system.config.read`);
* **can** perform the highest-risk user mutations (`PATCH /:uid`, `unenroll-mfa`, password reset, revoke sessions) with **no target ceiling and, for MFA removal, no step-up**.

That is an inverted risk profile: the role is denied the *visible* administrative surface and allowed the *invisible* one (RCA-005/006/007). It is the single clearest argument for REC-005 + REC-006 being prerequisites for any console rebuild — building UI against the current permission model would encode the inversion.

---

## 5. Summary of verdicts

| Invariant | Verdict | One-line justification | Primary remedy |
|---|---|---|---|
| **INV-1** Reachability | **NOT MET** | 27/59 capabilities have no surface; 4 more are unreachable by the role that needs them | REC-007, 008, 013, 014, 020, 021 |
| **INV-2** Super-admin unconditional | **PARTIALLY VIOLATED** | Authorisation complete (`*`, all probes pass); five hard-coded blocks apply to SA, one (lifecycle) with no audited alternative | REC-026 (B1); REC-016 (explain B2–B5) |
| **INV-3** Configurable bundles + hierarchy + audited bypass | **NOT MET** (platform) / **MET** (tenant) | Frozen literal, exact-match strings, `claims.permissions` union, no audit | REC-005 |
| **INV-4** Business values dashboard-configurable | **NOT MET** | 3 working, 10 cannot persist, 14 code-only-unjustified vs 8 justified | REC-011, 012, 016 |
| **INV-5** Hiding ≠ authorisation + matrix | **MET as property**, matrix absent (now §3) | Backend denies all probed hidden paths; 18/25 surfaces mis-signal capability | REC-006, REC-014, REC-024 |
| **INV-6** Audited config change (actor/time/before/after/scope) | **PARTIAL** | Actor/time/action/target yes; before/after/scope no; best-effort writes | REC-015 |

---

*Cross-references: probe harness Appendix A.3 · permission census Appendix A.2 · route census Appendix A.1 · root causes §06 · recommendations §10 · open decisions §11.*
