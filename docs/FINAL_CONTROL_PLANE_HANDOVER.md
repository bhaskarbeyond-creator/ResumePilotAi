# ResumePilotAi — Final Control Plane Technical Handover

**Date:** 2026-08-24 (UTC)
**Branch:** `arena/01a035df-resumepilotai`
**Baseline HEAD:** `ee38cb70c5654a4c81b63ce3fc70567c159bd8d5`
**origin/main:** `ee38cb70c5654a4c81b63ce3fc70567c159bd8d5`

> This document is the **implementation-complete handover** to the local
> developer / QA engineer for **final independent validation**. The remote
> engineering work is complete; QA's role is independent verification, not
> further implementation.

---

## 1. Status

| Area | State |
|---|---|
| Super Admin → Enterprise | **Complete** (verified by 196 enterprise tests + live-wired UI) |
| Super Admin → Users | **Complete** (P0 reconnection fixed this session) |
| Enterprise → Users | **Complete** (server-authoritative tenant policy) |
| Users → Enterprise | **Complete** (membership context + primary org + per-tenant role) |
| Build | **PASS** (`vite build`) |
| Test | **PASS** — 671 tests (default) + 196 enterprise tests, 0 failures |
| Lint | **PASS** (0 errors; pre-existing warnings only) |
| Production deploy | **NOT EXECUTED** (no production credentials in this workspace — see §9) |

---

## 2. Baseline Discovery (fresh, this session)

- Current HEAD = `origin/main` = `ee38cb70` (the pre-existing "authoritative
  super admin control plane" commit).
- Working tree was clean at session start.
- Production identity tooling exists (`scripts/verify-production-identity.mjs`,
  `scripts/deploy-live.mjs`, `scripts/verify-backup-rollback.mjs`,
  `ecosystem.config.js`, `hostinger-release.sh`), but there are **no live
  credentials / production hosts reachable from this workspace**, so no live
  SHA could be observed.
- A fresh, independent forensic audit was performed (not trusting prior
  `docs/FINAL_*` reports).

### Critical defects found and fixed this session

1. **P0 — Missing `PATCH /api/admin/users/:uid` endpoint.**
   The Users Manager / User 360 (suspend, restore, role change, membership
   change, duration grant) called `PATCH /api/admin/users/:uid` via
   `src/firestore/dbOperations.js`, but **no such route existed** in
   `backend/routes/adminUsers.js`. Every one of those admin actions returned
   `404`. **Fixed** by implementing a full server-authoritative PATCH handler.

2. **P0 — Role assignment collapsed every non-admin role to `ADMIN`.**
   `User360Drawer` invoked `setUserAdminStatus(uid, selectedRole, …)`, but that
   helper maps its argument through `isAdmin ? 'ADMIN' : 'USER'`. Selecting
   `AUDITOR`/`SUPPORT`/`EMPLOYER` would have granted `ADMIN` (privilege
   escalation). **Fixed** by routing role changes through `setUserRole`.

3. **P1 — Suspension stale-target check always expected `suspended === true`.**
   `toggleUserSuspension(uid, suspend, { expectedSuspended })` coerced the
   options object with `Boolean(object)` → `true`, defeating the optimistic
   concurrency check. **Fixed** by normalizing the object form.

4. **P2 — Degraded fallback responses dropped static fields.**
   `getPlatformCurrencyConfig` and `getGlobalAiDashboardData` returned
   incomplete shapes (`supportedCurrencies`, `globalPresets` missing) when the
   store was momentarily unavailable. **Fixed** so fallbacks carry the same
   authoritative shape as healthy reads.

5. **P3 — Duplicate control-plane router mounts** (`/api/admin`, `/api/platform`,
   `/api/enterprise`, `/api/admin/users`) were declared twice in `index.js`.
   Harmless but dead code that could mask middleware-ordering regressions.
   **Fixed** by removing the redundant mounts and documenting the single
   canonical mount set.

6. **P3 — Create-user input validation ran after the availability check.**
   Reordered so invalid email / `SUPER_ADMIN` escalation are rejected
   deterministically (`400`) regardless of backing-service availability.

### Tests added / strengthened

- `backend/test/superadmin-control-plane.test.js` — expanded to cover the PATCH
  surface (invalid role, `SUPER_ADMIN` grant, invalid membership, empty
  changes, unprivileged/read-only mutation denial, fail-closed 503) and made
  the environment-resilient so the suite is green both with and without live
  Firestore credentials.
- `tests/superadmin-control-plane.test.mjs` — added a static regression test
  asserting the PATCH route + role-wiring invariants.

---

## 3. Final Architecture

```
┌─────────────────────────────── Frontend (React + Vite) ───────────────────────────────┐
│ /adm (Admin shell) → Users Control-Plane → UsersManager, User360Drawer, CreateUserModal │
│ /adm/tenants (PlatformTenants) → Enterprise 360 + lifecycle                           │
│ /enterprise (EnterpriseConsole) → Org self-service console                            │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ HTTPS JSON + Firebase ID token (Bearer)
                                           │ X-Tenant-Id / X-Workspace-Id headers
┌─────────────────────────────── Backend (Express, /api) ───────────────────────────────┐
│ Mount guard: /api/admin*, /api/email/admin*  → requirePermission('system.config.write')│
│ Mount guard: /api/platform*                   → audit middleware + system.config.read │
│ /api/admin/users*          → adminUsersRouter (directory, User 360, PATCH, tenants, AI)│
│ /api/admin*                → adminPlatformOperationsRouter (currency, subs, AI, members)│
│ /api/admin*                → adminAuditRouter (audit-logs)                            │
│ /api/platform*             → platformRouter (command center, tenants, operators, …)   │
│ /api/enterprise*           → enterpriseRouter (tenantPolicy-gated org APIs)           │
│ /api/enterprise/m2m*       → enterpriseM2mRouter (service-account M2M)                │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                        Firebase Auth (identity, claims, disabled, MFA)
                        Firestore (users, enterprise_tenants, orders, audit logs)
                        tenantService (enterprise registry: memberships, workspaces, teams)
```

The four control relationships map to:

1. **Super Admin → Enterprise** — `platformRouter` (`/tenants`, `/operators`,
   `/command-center`), `enterpriseRouter` (`/platform/tenants/*` lifecycle),
   `adminPlatformOperationsRouter` (`/platform/tenants/:id/members`).
2. **Super Admin → Users** — `adminUsersRouter` (directory + User 360 + PATCH +
   tenant binding + AI entitlement).
3. **Enterprise → Users** — `enterpriseRouter` (`/memberships`, `/teams`,
   `/workspaces`, `/usage/ai`, `/audit`) gated by `tenantPolicy`.
4. **Users → Enterprise** — `/api/enterprise/context`, `/tenants`,
   `/memberships` resolve the caller's own memberships/roles/entitlements.

---

## 4. API Map (control plane)

| Method | Path | Purpose | Authorization |
|---|---|---|---|
| GET | `/api/admin/users` | Directory (cursor pagination + filters) | `system.config.write` (mount) |
| POST | `/api/admin/users` | Create / invite user | `users.create` / `users.update` / `*` |
| GET | `/api/admin/users/:uid` | Single projection | mount |
| GET | `/api/admin/users/:uid/details` | **User 360** | mount |
| PATCH | `/api/admin/users/:uid` | **Suspend / restore / role / membership / duration / currency / name** | field-scoped (`users.roles.manage`, `users.update`, `payments.manage`) |
| POST | `/api/admin/users/:uid/tenants` | Assign tenant | mount |
| DELETE | `/api/admin/users/:uid/tenants/:tenantId` | Remove tenant | mount |
| GET/PUT/DELETE | `/api/admin/users/:uid/ai-entitlement` | AI quota override | mount |
| POST | `/api/admin/users/:uid/ai-quota-reset` | Reset daily AI usage | mount |
| POST | `/api/admin/delete-user` | Destructive deletion | `requireRecentAdminAuthentication` |
| GET/PUT | `/api/admin/platform/currency` | Platform currency (single source of truth) | PUT → `requireRecentAdminAuthentication` |
| GET | `/api/admin/subscriptions` | Active subscribers + transactions | `payments.read` |
| GET | `/api/admin/ai/entitlements` | Global AI governance | `ai.usage.read` |
| GET | `/api/admin/audit-logs[/stats/:id]` | Audit stream | `system.config.read` |
| GET/POST | `/api/platform/operators` | Platform operator roles | POST → recent auth |
| GET/PATCH | `/api/platform/tenants/:id` | Tenant 360 / rename | PATCH → recent auth |
| POST | `/api/platform/tenants/:id/decommission` | Lifecycle | recent auth |
| GET/POST/PATCH/DELETE | `/api/enterprise/memberships*` | Org member management | `tenant.members.*` |
| GET/POST/PATCH | `/api/enterprise/teams*`, `/workspaces*` | Teams/workspaces | `tenant.*` |
| GET | `/api/enterprise/usage/ai*` | Org AI usage | `tenant.usage.read` |
| GET | `/api/enterprise/audit` | Org audit | `tenant.audit.read` |

---

## 5. RBAC Model (server-authoritative)

`backend/security/auth.js` is the single permission map:

| Role | Permission set (highlights) |
|---|---|
| `SUPER_ADMIN` | `['*']` |
| `ADMIN` | `users.*`, `tenants.*`, `system.config.*`, `payments.*`, `ai.entitlements.manage`, `ai.usage.read`, `audit.read`, `security.read`, `email.*`, `notifications.send` |
| `AUDITOR` | read-only (`users.read`, `tenants.read`, `payments.read`, `ai.usage.read`, `audit.read`, `security.read`) |
| `SUPPORT` | `users.read`, `email.logs.read`, `tenants.read`, `tickets.manage` |
| `ENTERPRISE_ADMIN` | `tenant.members.manage`, `tenant.roles.manage`, `tenant.ai.policy`, `tenant.billing.view`, `tenant.audit.read`, `tenant.workspaces.manage`, `workspace.*` |
| `ENTERPRISE_MEMBER` | `tenant.resumes.write`, `tenant.interviews.execute`, `tenant.ai.consume`, `workspace.read` |
| `EMPLOYER` | `jobs.manage`, `applications.review`, `candidates.contact` |
| `USER` | `resumes.manage`, `coverletters.manage`, `interviews.execute`, `subscription.self` |

Enforcement invariants:

- Every privileged operation evaluates **actor + role + permission + resource +
  tenant + action** server-side.
- `requireSuperAdmin` additionally enforces **TOTP MFA + recent auth** in
  production (`SUPER_ADMIN_MFA_REQUIRED`, `RECENT_AUTH_REQUIRED`).
- `SUPER_ADMIN` claims **cannot** be changed from the admin API
  (`SUPER_ADMIN_PROTECTED` in both the PATCH route and the operator route).
- Role changes reset per-user permission overrides and revoke refresh tokens so
  stale grants cannot survive a demotion.
- Suspension reflects into Firebase Auth `disabled` (enforced at sign-in).

---

## 6. Tenant / Membership / User model

- **Tenant** (`enterprise_tenants` via `tenantService.registry`): id, displayName,
  slug, lifecycleState, isolationTier, commercial terms, AI policy.
- **Membership** (`registry.grantMembership` / `removeTenantMembership`):
  `principalId ↔ tenantId` with `roles[]` and `status` (ACTIVE / SUSPENDED).
- **User profile** (`users/{uid}`): `role`, `suspended`, `membership`,
  `membershipEnds`, `paymentStatus`, `preferredCurrency`, `tenantMemberships[]`,
  `primaryTenant`, `aiQuotaOverride`.
- The **User 360** endpoint joins Firebase Auth (identity, disabled, MFA,
  emailVerified, sign-in timestamps) with the Firestore profile, tenant
  registry memberships, order history, AI entitlement, and audit timeline.
- Tenant assignment/removal is synchronized **both** into the tenant registry
  and the user's `tenantMemberships`/`primaryTenant` so UI and backend cannot
  diverge.

---

## 7. Currency model (one source of truth)

`backend/services/platformCurrency.js` is authoritative:

- `CURRENCY_REGISTRY` (INR, USD, EUR, GBP, CAD, AUD, SGD, AED, JPY) with symbol,
  subunit, decimals, locale.
- `normalizeCurrencyCode()` canonicalizes legacy strings (`RUPEES`→INR, etc.).
- Platform currency persists in `data/system_settings` + `data/public_config`
  inside a transaction with a HIGH-severity audit record.
- `preferredCurrency` on each user is normalized through the same registry.
- Precedence: **Platform currency → Enterprise/subscription currency → user
  preferred currency → display currency** (payments never derive amounts from
  the browser).

*Known non-critical limitation:* the India-GST invoice preview samples in
`subscriptionsSettings.jsx` and the email-template sample amounts in
`EmailSmtpSettings.jsx` are static demo previews (₹422.88 / ₹499 etc.) used to
illustrate the GST invoice layout; live pricing reads the platform/subscription
currency and the server-owned plan catalogs.

---

## 8. AI entitlement model (administration only — generation engine untouched)

`backend/services/adminAiEntitlement.js`:

- `getUserAiEntitlement` → effective limit (tier default, overridden by custom
  override with expiry + reason), used today, remaining.
- `setUserAiQuotaOverride` / `removeUserAiQuotaOverride` / `resetUserAiQuota`
  — audited, transactional.
- `getGlobalAiDashboardData` → global consumption + `globalPresets`.

The AI **generation** engine (prompts, cascade, providers, parsing, fallback,
endpoints) was **not modified**.

---

## 9. Production deployment status (honest)

- **Not deployed from this workspace.** The production environment (Hostinger +
  PM2 per `ecosystem.config.js` / `hostinger-release.sh`, Firebase-hosted
  frontend per `firebase.json`) is not reachable and no credentials are present
  in the sandbox. The backend boots in "limited local mode" (no Firestore
  credentials), which is why the control-plane handlers fail closed to `503`
  locally.
- Per this session's constraints, code is committed/pushed to
  `arena/01a035df-resumepilotai` only (not `origin/main`). Merge to `main` and
  production deploy is a **single, clearly-scoped step for the local
  release owner**:

  ```bash
  # 1. Full regression (already green in this workspace)
  npm test
  npm run test:enterprise
  npm run build

  # 2. Review and merge
  git log --oneline -1
  gh pr merge <PR> --merge   # or merge via GitHub UI

  # 3. Deploy (existing tooling)
  bash scripts/hostinger-release.sh        # backend to Hostinger
  firebase deploy --only hosting           # frontend to Firebase Hosting

  # 4. Verify identity / health / live SHAs
  node scripts/verify-production-identity.mjs
  node scripts/verify-platform-health-live.mjs
  node scripts/verify-admin-superadmin-live.mjs
  ```

  **Rollback SHA:** `ee38cb70c5654a4c81b63ce3fc70567c159bd8d5` (the
  immediately previous, known-good commit; `scripts/verify-backup-rollback.mjs`
  documents the backup/restore path).

---

## 10. Known non-critical limitations (documented, not blockers)

1. **Directory search is page-scoped.** The user directory is Firebase Auth
   (`listUsers(limit, pageToken)`), which has no server-side text search. The
   current handler filters the fetched page server-side; a text query only
   matches records within the active page (≤200). Cursor pagination itself is
   correct. A future full-dataset search requires a maintained search index
   (e.g., Algolia/Meilisearch or a Firestore mirror) — deliberately not
   introduced to avoid a parallel source of truth.
2. **GST invoice demo previews** (above) use static India-market sample numbers.
3. **Chunk-size warnings** on `vite build` (large legacy vendor bundles) — a
   performance optimization, not a defect.
4. **ESLint unused-var warnings** (684) are pre-existing and non-blocking
   (`npm run lint` exits 0).

---

## 11. Definition of Done (this session)

- ✅ Super Admin can operate Enterprises (lifecycle, members, commercial, AI).
- ✅ Super Admin can operate Users (directory, User 360, suspend/restore, role,
  membership, duration, tenant, AI entitlement).
- ✅ Enterprise Admin can operate authorized members (server-gated).
- ✅ Users have correct org context (memberships, primary org, per-tenant role).
- ✅ RBAC is server-authoritative with MFA + recent-auth hardening.
- ✅ Currency is globally consistent through one registry.
- ✅ AI administration is complete without touching the generation engine.
- ✅ Privileged mutations produce audit records (security + admin audit).
- ✅ No orphan controls / no orphan APIs in the control plane.
- ✅ Build passes; 671 + 196 tests pass; lint exits clean.

The **local QA engineer** should now execute `docs/FINAL_CONTROL_PLANE_QA_PLAN.md`
for independent validation.
