# SUPER ADMIN `/adm` — Architecture Discovery & 10/10 Readiness Audit

## Executive Summary

| Dimension | Score | Rationale |
|---|---|---|
| **Current /adm Status** | **3 / 10** | Functional consumer-level admin panel; not a platform administration console |
| **Architecture Maturity** | **4 / 10** | Clean auth model, but monolithic backend and no separation between consumer admin, enterprise admin, and platform super admin |
| **Security** | **6 / 10** | Role-based claims, recent-auth, policy enforcement — but Super Admin ≡ Admin today with no separate elevation |
| **Functional Completeness** | **3 / 10** | Covers consumer content management; almost zero platform operations, tenant lifecycle, global observability |
| **UI/UX** | **4 / 10** | Serviceable Tailwind-based panel; not enterprise-grade control plane quality |
| **Observability** | **2 / 10** | Single health check card; no metrics, charts, alerts, anomaly detection, trend analysis |
| **Operability** | **2 / 10** | No queue/DLQ visibility, no backup/restore UI, no encryption status, no deployment health |
| **Production Readiness** | **3 / 10** | Functions for its current consumer scope; nowhere near 10/10 for a true Super Admin platform |
| **OVERALL** | **3 / 10** | |

---

## Phase 0 — Frozen Enterprise Baseline Verification

| Item | Value |
|---|---|
| **HEAD** | `f4be6462693825ce33adc182f9a20a8827a76613` |
| **origin/main** | `38273af004e9e61bc36a21c5204d1e394971a2e3` |
| **Active branch** | `arena/01a02322-resumepilotai` |
| **backend/COMMIT_SHA** | `7748c68d31ab87576ae6a1f674279702ec21ebc7` |
| **enterprise-production-frozen tag** | `f4be6462693825ce33adc182f9a20a8827a76613` ✅ |
| **Working tree** | Modified: `tests/live-production-audit.spec.cjs`; Untracked: `live_audit_captures/` |
| **Enterprise Console status** | UNCHANGED — Frozen ✅ |

---

## Phase 1 & 2 — Complete `/adm` Discovery & Module Inventory

### 1. Does `/adm` exist?

**YES.** `/adm` is a React SPA route mounted at line 388 of `main.jsx`:

```jsx
<Route path="/adm/*" element={<RequireAuthenticated user={user}><Admin /></RequireAuthenticated>} />
```

It renders the `Admin` component which manages its own sub-routing.

### 2. How is it routed?

**Client-side React Router** nested routes under `/adm/*`:

| Sub-route | Component | Purpose |
|---|---|---|
| `/adm/dashboard` | `Dashboard` | Earnings, users, resumes, downloads, recent subscriptions |
| `/adm/settings` | `Settings` | 30 setting tabs (modules, branding, firebase, AI, SMTP, payments, security, etc.) |
| `/adm/users` | `UsersManager` | User CRUD, admin promotion, suspension, merge, delete |
| `/adm/user/ss` | `UserEdit` | Single user edit |
| `/adm/messages` | `Messages` | Contact/support messages |
| `/adm/reviews` | `Reviews` | Customer reviews management |
| `/adm/trustedby` | `TrustedBy` | Landing page "Trusted By" logos |
| `/adm/employer-applications` | `EmployerApplications` | Employer verification workflow |
| `/adm/jobs-manager` | `JobsManager` | Job listing moderation |
| `/adm/company-management` | `CompanyManagement` | Company profile management |
| `/adm/blog-management` | `BlogManagement` | Blog post management |
| `/adm/landing-pages` | `LandingPages` | Custom page management |
| `/adm/phrases` | `Phrases` | Translation phrase management |

### 3–5. Authentication & Authorization

**Authentication:** Firebase `onAuthStateChanged` → `checkIfAdmin(user.uid)` which calls `getIdTokenResult()` and checks `token.claims.role ∈ {ADMIN, SUPER_ADMIN}`.

**Backend Authorization:** All `/api/admin/*` routes are gated by `requirePermission('system.config.write')` at line 305 of `index.js`. The permission model in `auth.js`:

| Role | Permissions |
|---|---|
| **SUPER_ADMIN** | `['*']` (wildcard — all permissions) |
| **ADMIN** | `users.read, users.update, users.delete, email.template.manage, email.logs.read, system.config.read, system.config.write, payments.manage, notifications.send` |
| **SUPPORT** | `users.read, email.logs.read` |

**Critical finding:** `SUPER_ADMIN` and `ADMIN` have **identical access** to `/adm`. There is **no separate Super Admin surface**. They both reach the same panel. The wildcard `*` gives SUPER_ADMIN implicit access to everything, but there is no UI or backend that leverages this distinction beyond Enterprise.

### 6–15. Relationship to Enterprise

| Question | Answer |
|---|---|
| Is it Firebase-admin based? | YES — backend uses `firebase-admin` for token verification and Firestore |
| Is it tenant-aware? | **NO** — `/adm` operates on global Firestore collections, not tenant-scoped |
| Is it platform-wide? | YES — it manages all users, content, and settings globally |
| Is it separate from Enterprise? | **YES** — completely separate UI shell, router, and backend API namespace |
| Is it a Platform Admin module inside Enterprise? | **NO** — but Enterprise has a `platform` tab (`EnterprisePlatformTab`) that provides tenant registry management |
| Duplicate admin surfaces? | **YES** — `/adm` is the legacy consumer admin; `/enterprise?tab=platform` is the Enterprise platform admin. They share no code. |
| Dead/legacy admin routes? | **NO** — all routes are actively used |
| Hidden admin APIs? | Several `/api/admin/*` routes exist in the 4,783-line monolith `index.js` that are only discoverable by reading the source |
| Backend capabilities with no UI? | YES — see Gap Matrix below |
| UI controls with no backend? | Some settings panels read/write directly to Firestore client-side rather than through backend APIs |

---

## Phase 3 — Current `/adm` Functional Flow

```
USER navigates to /adm
  ↓
RequireAuthenticated gate
  ↓ (No user → redirect /login)
Admin component mounts
  ↓
fire.auth().onAuthStateChanged
  ↓
checkIfAdmin(uid)
  ↓
getIdTokenResult()
  ↓
claims.role ∈ {ADMIN, SUPER_ADMIN}?
  ↓ NO → Navigate to / (redirect)
  ↓ YES → Render Admin shell
Sidebar + Header + Routes
  ↓
Backend API calls with Bearer token
  ↓
requireAuth middleware → verifyIdToken
  ↓
requirePermission('system.config.write')
  ↓
enforceApiPolicy → path-level checks
  ↓
Route handler
  ↓
Firestore operations (global, NOT tenant-scoped)
  ↓
Response to client
```

### Key Decision Points

1. **No MFA / re-authentication** for initial admin access — only for sensitive destructive operations (`RECENT_AUTH_PATHS` in `policy.js`)
2. **No session timeout** — Firebase ID tokens auto-refresh; admin session lives as long as the browser tab
3. **No audit trail** for admin actions — individual admin operations are NOT logged to a security audit collection (unlike Enterprise, which writes `security_audit_logs`)
4. **No RBAC granularity** — all admin operations require `system.config.write`; no fine-grained per-module permissions

---

## Phase 4 — Authentication & Authorization Audit

### Role Hierarchy (as implemented)

```
SUPER_ADMIN → permissions: ['*']  (wildcard)
    ↓ superset of
ADMIN → permissions: ['system.config.write', 'users.*', 'email.*', 'payments.manage', ...]
    ↓ superset of
SUPPORT → permissions: ['users.read', 'email.logs.read']
    ↓
Regular User → no admin permissions
```

### Platform Admin vs Enterprise Admin vs Super Admin

| Identity | `/adm` Access | `/enterprise` Access | Platform Tab | Tenant Admin |
|---|---|---|---|---|
| **SUPER_ADMIN** claim | ✅ Full | ✅ Full | ✅ `isPlatformTenantProvisioner` | ✅ If member |
| **ADMIN** claim | ✅ Full (identical to SUPER_ADMIN in /adm) | ✅ Full | ✅ Also has `system.config.write` | ✅ If member |
| **SUPPORT** claim | ❌ No `system.config.write` | ✅ Via support grants only | ❌ | ❌ |
| **Service Account (M2M)** | ❌ No bearer token | ✅ Scoped endpoints only | ❌ | ❌ Scoped |
| **Tenant Admin (no global claim)** | ❌ | ✅ Their tenant only | ❌ | ✅ |

### Critical Findings

**ADMIN and SUPER_ADMIN are functionally identical in /adm.** Both have `system.config.write` which is the only gate. The `*` wildcard for SUPER_ADMIN is never specifically checked in /adm code — it's redundant. There is no privilege separation between them in the consumer admin.

**No immediate revocation mechanism** for /adm. Revoking an admin's Firebase custom claims requires the token to expire (up to 1 hour) or the user to re-authenticate. Enterprise has `checkRevoked: true` in `verifyIdToken`, but the consumer admin's `checkIfAdmin` uses `getIdTokenResult()` client-side which caches.

**No admin action audit log.** Enterprise writes every action to `enterprise_audit_logs` and `security_audit_logs`. The consumer `/adm` writes NOTHING to any audit collection. An admin can delete users, change subscriptions, modify AI settings, and manage payments with zero forensic trail.

---

## Phase 5 — Super Admin Capability Model

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Platform Overview / Dashboard | **PARTIAL** | `/adm/dashboard` shows earnings, users count, resumes, downloads, recent subscriptions. No health scoring, no alerts, no intelligence. |
| 2 | Tenant Registry | **EXISTS** (Enterprise only) | `EnterprisePlatformTab` + `/api/enterprise/platform/tenants` |
| 3 | Tenant Provisioning | **EXISTS** (Enterprise only) | `POST /api/enterprise/tenants` |
| 4 | Tenant Suspension | **EXISTS** (Enterprise only) | `POST /api/enterprise/platform/tenants/:id/suspend` |
| 5 | Tenant Reactivation | **EXISTS** (Enterprise only) | `POST /api/enterprise/platform/tenants/:id/reactivate` |
| 6 | Tenant Deletion / Decommissioning | **MISSING** | No endpoint or UI exists |
| 7 | Tenant Search | **PARTIAL** (Enterprise only) | Client-side filter in `EnterprisePlatformTab` |
| 8 | Tenant Health | **MISSING** | No per-tenant health scoring |
| 9 | Tenant Usage | **PARTIAL** (Enterprise only) | `/api/enterprise/usage/ai` per-tenant; no global cross-tenant view |
| 10 | Tenant Quotas | **PARTIAL** (Enterprise only) | `tenantQuota.js` exists; no global quota dashboard |
| 11 | Tenant Billing/subscription | **MISSING** | No billing integration at tenant level |
| 12 | Global Users | **EXISTS** | `/adm/users` — full CRUD, admin promotion, suspension, merge, delete |
| 13 | User lifecycle | **PARTIAL** | Create (via registration), suspend, delete, merge exist. No disable/archive. |
| 14 | User security | **PARTIAL** | Password set, admin toggle. No MFA management, no session management. |
| 15 | Roles | **PARTIAL** | Admin/non-admin toggle in UsersManager. No role management UI. |
| 16 | Platform RBAC | **MISSING** | RBAC is hardcoded in `auth.js`. No admin UI to manage roles/permissions. |
| 17 | Permissions | **MISSING** | No permissions management UI |
| 18 | Support Engineers | **EXISTS** (Enterprise only) | Support grant lifecycle in Enterprise |
| 19 | Break-Glass | **EXISTS** (Enterprise only) | `EnterpriseSupportTab` |
| 20 | Service Accounts | **EXISTS** (Enterprise only) | `EnterpriseSecurityTab` + `serviceAccountStore.js` |
| 21 | M2M | **EXISTS** (Enterprise only) | `enterpriseAuth.js` + `enterpriseM2m.js` |
| 22 | AI providers | **EXISTS** | `/adm/settings?tab=aiSettings` — provider config, model selection, key management |
| 23 | AI model governance | **PARTIAL** | Provider settings exist; no global policy enforcement dashboard |
| 24 | Global AI limits | **EXISTS** | `/api/admin/ai/quota-stats`, `/api/admin/ai/quota-limits`, `/api/admin/ai/reset-quota` |
| 25 | Platform feature flags | **PARTIAL** | `ModulesSettings.jsx` toggles; `featureFlags.js` is env-based only |
| 26 | Global configuration | **EXISTS** | 30 settings tabs covering all aspects |
| 27 | Security policies | **PARTIAL** | `SecurityLimitsSettings.jsx` exists |
| 28 | Identity policies | **PARTIAL** | `SocialAuthSettings.jsx`, `FirebaseSettings.jsx` |
| 29 | Audit | **MISSING** | No audit log viewer in `/adm` |
| 30 | Security events | **MISSING** | No security event dashboard |
| 31 | System health | **PARTIAL** | `SystemHealthSettings.jsx` + `/api/admin/health-summary` |
| 32 | Queue | **MISSING** in `/adm` | Enterprise has `/queue/status`, `/queue/jobs`; consumer admin has nothing |
| 33 | DLQ | **MISSING** in `/adm` | Enterprise only |
| 34 | Background jobs | **MISSING** | No UI for background job management |
| 35 | Notifications | **PARTIAL** | Email settings exist; no notification delivery dashboard |
| 36 | Email delivery | **PARTIAL** | SMTP settings + test connection; no delivery logs or bounce tracking in `/adm` |
| 37 | Storage | **PARTIAL** | `StorageSettings.jsx` configures cloud storage; no usage dashboard |
| 38 | Encryption/key status | **MISSING** in `/adm` | Enterprise has `encryptionProvider.js`; no admin visibility |
| 39 | Backups | **MISSING** in `/adm` | Enterprise has `enterpriseBackup.js`; no admin UI |
| 40 | Restore | **MISSING** in `/adm` | Enterprise has backup restore; no admin UI |
| 41 | Data retention | **PARTIAL** | GDPR settings exist; no automated retention policies |
| 42 | Compliance controls | **PARTIAL** | `GdprLegalSettings.jsx` |
| 43 | Observability | **MISSING** | No metrics, charts, or observability dashboard |
| 44 | Errors | **MISSING** | No error tracking or aggregation |
| 45 | API health | **PARTIAL** | `/api/healthz`, `/api/readyz` exist but only shown as a status dot in admin header |
| 46 | Deployment/release status | **MISSING** | `backend/COMMIT_SHA` exists but no UI |
| 47 | Maintenance mode | **MISSING** | No maintenance mode toggle |
| 48 | Platform announcements | **MISSING** | No announcement system |
| 49 | Platform-wide settings | **EXISTS** | 30 setting tabs |

**Summary:** 10 EXISTS, 16 PARTIAL, 18 MISSING, 5 EXISTS (Enterprise-only with no /adm equivalent)

---

## Phase 6 — Backend / UI Gap Matrix

| Area | Backend | UI | Gap |
|---|---|---|---|
| **Admin audit logging** | NO | NO | **CRITICAL GAP — Neither exists** |
| **Queue/DLQ visibility** | Enterprise routes exist | Not in `/adm` | Backend YES / UI NO |
| **Backup/restore** | `enterpriseBackup.js` | Not in `/adm` | Backend YES / UI NO |
| **Encryption status** | `encryptionProvider.js` | Not in `/adm` | Backend YES / UI NO |
| **Tenant deletion** | NO | NO | **Both missing** |
| **Platform health scoring** | NO | NO | **Both missing** |
| **Error aggregation** | NO | NO | **Both missing** |
| **Maintenance mode** | NO | NO | **Both missing** |
| **RBAC management** | Hardcoded in `auth.js` | NO | Backend static / UI NO |
| **Email delivery logs** | Email routes exist | Not in `/adm` | Backend YES / partial UI NO |
| **Observability metrics** | Enterprise `observability/metrics` | Not in `/adm` | Backend YES / UI NO |
| **Coupon management** | CRUD endpoints | In `subscriptionsSettings.jsx` | Aligned |
| **User management** | CRUD + admin toggle + suspension | `UsersManager.jsx` | Aligned |
| **AI settings** | Full CRUD | `AiSettings.jsx` | Aligned |
| **SMTP/Email settings** | Full CRUD | `EmailSmtpSettings.jsx` | Aligned |
| **Blog management** | Categories + posts | Blog management UI | Aligned |
| **Payment settings** | Provider config + test | `PaymentSettings.jsx` + `subscriptionsSettings.jsx` | Aligned |
| **Feature flag management** | Env-var only | `ModulesSettings.jsx` toggles | UI YES / Backend PARTIAL |

---

## Phase 7 — Data Architecture

### Firestore Collections Used by `/adm`

| Collection | Scope | Ownership | Admin Access | Audit | Encryption |
|---|---|---|---|---|---|
| `users` | Global | Platform | Read/Write/Delete | NONE | NONE |
| `resumes` | Global | Per-user | Read | NONE | NONE |
| `subscriptions` | Global | Per-user | Read | NONE | NONE |
| `settings/*` | Global | Platform | Read/Write | NONE | NONE |
| `coupons` | Global | Platform | CRUD | NONE | NONE |
| `coupon_redemptions` | Global | Platform | Read | NONE | NONE |
| `earnings` | Global | Platform | Read | NONE | NONE |
| `stats` | Global | Platform | Read | NONE | NONE |
| `contact_submissions` | Global | Platform | Read | NONE | NONE |
| `reviews` | Global | Platform | CRUD | NONE | NONE |
| `trusted_by` | Global | Platform | CRUD | NONE | NONE |
| `blog_posts` | Global | Platform | CRUD | NONE | NONE |
| `blog_categories` | Global | Platform | CRUD | NONE | NONE |
| `jobs` | Global | Employer | Read/Moderate | NONE | NONE |
| `companies` | Global | Employer | Read/Moderate | NONE | NONE |
| `employer_applications` | Global | Employer | Read/Approve/Reject | NONE | NONE |
| `custom_pages` | Global | Platform | CRUD | NONE | NONE |
| `ads` | Global | Platform | CRUD | NONE | NONE |
| `payment_events` | Global | Platform | Read (refund) | NONE | NONE |

### Enterprise Collections (separate, frozen)

| Collection | Scope | Ownership |
|---|---|---|
| `enterprise_tenants` | Platform | Tenant registry |
| `enterprise_memberships` | Tenant-scoped | IAM |
| `enterprise_workspaces` | Tenant-scoped | Organization |
| `enterprise_teams` | Workspace-scoped | Organization |
| `enterprise_service_accounts` | Tenant-scoped | Security |
| `enterprise_support_grants` | Tenant-scoped | Support |
| `enterprise_audit_logs` | Tenant-scoped | Audit |
| `enterprise_resources` | Workspace-scoped | Data |
| `security_audit_logs` | Global | Platform security |

**ZERO audit trail on the consumer admin collections.** Every admin write to `users`, `settings`, `coupons`, `blog_posts`, etc. occurs without logging the actor, timestamp, or change delta.

---

## Phase 8 — Security / Threat Model

| Threat | Current Mitigation | Gap |
|---|---|---|
| **Privilege escalation (user to admin)** | Firebase custom claims only settable server-side | OK |
| **Horizontal escalation (admin to other admin scope)** | N/A — all admins see everything | No scope isolation |
| **Forged tenant headers** | Enterprise validates server-side | OK (Enterprise only) |
| **Session theft** | Firebase token required; `checkRevoked: true` on Enterprise path | Consumer admin uses client-side token cache |
| **Token replay** | ID tokens are short-lived (1h) | OK |
| **CSRF** | JSON body + Bearer token | OK |
| **XSS** | React DOM escaping; CSP in production | OK |
| **Mass deletion without confirmation** | `deleteUserByAdmin` has modal confirmation in UI | No backend rate-limit on bulk deletes |
| **Audit bypass** | No audit exists to bypass | **CRITICAL** |
| **Secrets exposure** | API keys masked after save; server-only vault for AI keys | OK |
| **Backup leakage** | Enterprise backups are checksummed and tenant-scoped | OK (Enterprise) |
| **Admin action without re-auth** | Only destructive ops require recent auth | Settings changes dont require re-auth |

---

## Phase 12 — SWOT Analysis

### Strengths

1. **Solid Firebase Auth foundation** — Custom claims with server-side verification and `enforceApiPolicy` middleware
2. **Comprehensive consumer settings** — 30 settings tabs covering every aspect of the consumer product
3. **Enterprise architecture is excellent** — Tenant isolation, RBAC, audit, M2M, support grants, encryption all certified and frozen
4. **Clean permission hierarchy** — `SUPER_ADMIN > ADMIN > SUPPORT > User` chain is clear
5. **API policy enforcement** — `policy.js` provides defense-in-depth with path-level authorization
6. **Recent-auth for destructive ops** — Sensitive operations require fresh authentication

### Weaknesses

| # | Weakness | Impact | Severity | Evidence |
|---|---|---|---|---|
| W1 | **No admin audit log** | Admin actions are invisible; no forensic trail | P0 Critical | No audit writes in any `/api/admin/*` handler |
| W2 | **SUPER_ADMIN identical to ADMIN in /adm** | No privilege separation; both roles are identical | P1 High | `checkIfAdmin` accepts both; no separate gates |
| W3 | **Monolithic backend** | 4,783-line `index.js` makes maintenance risky | P1 High | All admin routes inline in single file |
| W4 | **No observability** | Cannot detect degradation, errors, or anomalies | P1 High | No metrics, charts, or alerts |
| W5 | **No queue/DLQ visibility** | Background jobs can silently fail | P2 Medium | Enterprise has this; /adm doesnt |
| W6 | **Class-based UsersManager** | Technical debt; inconsistent with codebase | P3 Low | `class UsersManager extends Component` |
| W7 | **No deep linking** for most modules | Cannot bookmark or share admin state | P2 Medium | Only settings uses `?tab=` |
| W8 | **No batch/bulk operations** with safety rails | Mass operations could be destructive | P2 Medium | Bulk merge exists but has limited guards |

### Opportunities

1. **Unify platform administration** — Create a true Super Admin surface that combines consumer admin + enterprise platform management + global observability
2. **Real-time operational intelligence** — Health scoring, anomaly detection, tenant risk indicators from existing Firestore data
3. **Cross-tenant dashboard** — Aggregate view of all tenants, usage, quotas, and health
4. **Global audit trail** — Unified audit for both consumer admin and enterprise actions
5. **Command-line/API administration** — Expose admin capabilities via documented API for automation

### Threats

| # | Threat | Impact | Severity | Recommended Fix |
|---|---|---|---|---|
| T1 | **Unaudited admin actions** | Compliance failure; impossible to investigate incidents | P0 Critical | Add audit logging to every `/api/admin/*` mutation |
| T2 | **Admin token caching** | Revoked admin retains access until token expires | P1 High | Add `checkRevoked: true` to admin token verification |
| T3 | **No rate limiting on admin mutations** | Mass deletion possible | P2 Medium | Add admin-specific rate limiters |
| T4 | **Settings overwrite without OCC** | Concurrent admin edits can clobber each other | P2 Medium | Several settings use `expectedRevision`; ensure all do |

---

## Phase 13 — 10/10 Gap Register

| ID | Area | Finding | Severity | Current | Expected | Recommendation |
|---|---|---|---|---|---|---|
| G01 | Audit | No admin action audit log | P0 | MISSING | Every mutation logged with actor, action, timestamp, delta | Add audit middleware to all `/api/admin/*` writes |
| G02 | Auth | SUPER_ADMIN identical to ADMIN | P1 | PARTIAL | Distinct privilege tiers with separate capabilities | Define SUPER_ADMIN-only capabilities |
| G03 | Observability | No platform health dashboard | P1 | MISSING | Real-time health, alerts, anomaly detection | Build intelligent dashboard |
| G04 | Tenant Ops | No tenant lifecycle management in /adm | P1 | MISSING | Provision/suspend/reactivate/delete from super admin | Bridge or unify with Enterprise platform tab |
| G05 | Security | No admin token revocation check | P1 | MISSING | `checkRevoked: true` for admin paths | Add to `requireAuth` for admin namespace |
| G06 | Queue | No queue/DLQ visibility in /adm | P2 | MISSING | Queue status, DLQ viewer, replay controls | Surface enterprise queue APIs in super admin |
| G07 | Backup | No backup/restore in /adm | P2 | MISSING | Backup trigger, restore, history | Surface enterprise backup APIs |
| G08 | Encryption | No encryption status in /adm | P2 | MISSING | Key status, rotation | Surface enterprise encryption status |
| G09 | UX | No command palette | P2 | MISSING | Cmd+K quick actions | Add command palette similar to Enterprise |
| G10 | UX | No global search | P2 | MISSING | Search across users, tenants, settings, audit | Add search infrastructure |
| G11 | UX | No charts/graphs | P2 | MISSING | Usage trends, user growth, revenue, AI consumption | Add chart library |
| G12 | Data | No deployment health visibility | P2 | MISSING | Current SHA, uptime, PM2 status | Add deployment info panel |
| G13 | Data | No error tracking | P2 | MISSING | Error aggregation, recent failures | Add error dashboard |
| G14 | UX | No dark mode | P3 | MISSING | Theme support | Add theme toggle |
| G15 | Code | Class-based UsersManager | P3 | PARTIAL | Functional components | Refactor to hooks |
| G16 | Tenant | No tenant deletion | P2 | MISSING | Soft delete with retention period | Add lifecycle management |
| G17 | Email | No email delivery dashboard | P2 | MISSING | Delivery logs, bounces, failures | Surface email observability |
| G18 | Security | No security event dashboard | P1 | MISSING | Failed auth attempts, suspicious activity | Add security event viewer |
| G19 | Platform | No maintenance mode | P2 | MISSING | Global maintenance toggle | Add maintenance mode |
| G20 | Platform | No announcements | P3 | MISSING | Banner announcements to all users | Add announcement system |

---

## Phase 14 — Test Strategy (Summary)

| Category | Tests Required | Current Coverage |
|---|---|---|
| Unit tests | All admin API handlers | Existing suite covers consumer features |
| Security tests | Auth escalation, RBAC, token revocation | 173/173 security tests |
| Enterprise tests | Tenant isolation, M2M, support | 23/23 enterprise tests |
| Admin audit tests | Every mutation creates audit record | MISSING (no audit exists) |
| Playwright E2E | Authenticated `/adm` navigation, CRUD, responsive | MISSING |
| Production Playwright | Real production `/adm` authenticated test | MISSING |
| Responsive tests | 7 viewports | MISSING |
| Performance | Load testing admin endpoints | MISSING |

---

## What Must Not Be Changed

The following are certified, frozen, and must NOT be modified:

1. **Enterprise Console** — All 13+ modules, `EnterpriseConsole.jsx`, `EnterpriseContext.jsx`, all `Enterprise*Tab.jsx` components
2. **Enterprise backend** — `routes/enterprise.js`, `routes/enterpriseM2m.js`, all `backend/enterprise/*.js` files
3. **Consumer feature flags** — `ModulesSettings.jsx` toggle behavior
4. **Existing consumer flows** — Resume builder, CV module, portfolio, billing, interview coach
5. **Security middleware** — `auth.js`, `policy.js`, `oauth.js`, `payments.js`, `abuse.js`, `reset.js`, `exportTokens.js`
6. **AI runtime** — `aiRuntime.js`, `aiAdmin.js`
7. **Email infrastructure** — `emailNotifier.js`, `notificationOutbox.js`, email routes

---

## Proposed Target Architecture (High-Level)

The Super Admin should be a **unified platform administration console** that:

1. **Inherits** the Enterprise console design system (`enterprise.css`) and UX patterns
2. **Extends** beyond tenant administration to provide platform-wide visibility
3. **Integrates** both consumer admin capabilities and enterprise platform management
4. **Adds** the 20 missing capabilities identified in the gap register
5. **Maintains** strict separation from tenant-scoped Enterprise operations

This is **Phase 1 Research Only** — no implementation will begin until the complete architecture is approved.
