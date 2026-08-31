# Role × Permission Matrix

**Source of truth:** `backend/security/auth.js` PERMISSIONS constant + `backend/security/entitlements.js`.

## 1. Role Definitions

| Role | Claim | Description |
|------|-------|-------------|
| SUPER_ADMIN | `role === 'SUPER_ADMIN'` or permissions include `*` | Full platform control; MFA required for destructive ops; recent re-auth required for sensitive settings |
| ADMIN | `role === 'ADMIN'` | Platform administrator: users, tenants, email, config, payments, AI, audit, tickets |
| AUDITOR | `role === 'AUDITOR'` | Read-only: users, tenants, email logs, config, payments, AI usage, audit, security |
| SUPPORT | `role === 'SUPPORT'` | Read users/tenants/email-logs + ticket management |
| ENTERPRISE_ADMIN | `role === 'ENTERPRISE_ADMIN'` | Tenant-scoped admin: members, roles, AI policy, billing view, audit, workspaces |
| ENTERPRISE_MEMBER | `role === 'ENTERPRISE_MEMBER'` | Tenant-scoped: resumes, interviews, AI, workspace read |
| EMPLOYER | `claims.employer === true` | Jobs, applications, candidates, companies (approval-gated) |
| USER | default/authenticated user | Own resumes, cover letters, interviews, subscription self |

## 2. Permission Grants

### SUPER_ADMIN
```
*  (wildcard — all permissions)
```
Enforcement:
- Must pass `requireSuperAdmin` → checks `isSuperAdmin(user)`.
- Destructive control-plane ops require `requireRecentAdminAuthentication` (10-min auth_time window; enforced in production, relaxed in NODE_ENV=test unless REQUIRE_RECENT_AUTH_IN_TEST=true).
- MFA required for destructive ops when `superAdminMfaEnforced()` returns true (SUPER_ADMIN_MFA_REQUIRED=true or NODE_ENV=production).

### ADMIN
```
users.read, users.create, users.update, users.delete, users.roles.manage
tenants.read, tenants.write, tenents.manage
email.template.manage, email.logs.read
system.config.read, system.config.write
payments.manage, payments.read
notifications.send
ai.entitlements.manage, ai.usage.read
audit.read, security.read
tickets.manage
```

### AUDITOR
```
users.read, tenants.read, email.logs.read, system.config.read
payments.read, ai.usage.read, audit.read, security.read
```

### SUPPORT
```
users.read, email.logs.read, tenants.read, tickets.manage
```

### ENTERPRISE_ADMIN
```
tenant.members.manage, tenant.roles.manage, tenant.ai.policy
tenant.billing.view, tenant.audit.read, tenant.workspaces.manage
workspace.read, workspace.manage, workspace.members.manage
```

### ENTERPRISE_MEMBER
```
tenant.resumes.write, tenant.interviews.execute, tenant.ai.consume
workspace.read
```

### EMPLOYER
```
jobs.manage, applications.review, candidates.contact
```
Role assignment: set via Firebase custom claims `employer: true` after admin approval of an employer application (`/api/employer-applications`).

### USER (authenticated)
```
resumes.manage, coverletters.manage, interviews.execute, subscription.self
```

## 3. Resource × Action × Role Matrix

Legend: ✅ = allowed, ⛔ = denied, 🔒 = owner-scoped only, 🏢 = tenant-scoped only.

| Resource | Action | SUPER_ADMIN | ADMIN | AUDITOR | SUPPORT | ENT_ADMIN | ENT_MEMBER | EMPLOYER | USER |
|----------|--------|:-----------:|:-----:|:-------:|:-------:|:---------:|:----------:|:--------:|:----:|
| Users (all) | list/read | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Users (all) | create/edit/delete | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Users (own profile) | read/write | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | 🔒 |
| Roles | manage | ✅ | ✅ | ⛔ | ⛔ | 🏢 | ⛔ | ⛔ | ⛔ |
| Tenants | create/read/write/delete | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Tenant members | manage | ✅ | ✅ | ⛔ | ⛔ | 🏢 | ⛔ | ⛔ | ⛔ |
| System config | read | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| System config | write | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Payments | read | ✅ | ✅ | ✅ | ⛔ | 🏢(view) | ⛔ | ⛔ | 🔒 |
| Payments | manage/refund | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Pay (create order) | – | ✅ | ✅ | ✅ | ✅ | 🏢 | ✅ | ✅ | ✅ |
| Invoices (own) | read | ✅ | ✅ | ⛔ | ⛔ | 🏢 | 🔒 | 🔒 | 🔒 |
| Subscriptions | self | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Email templates | manage | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Email logs | read | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| AI (content ops) | generate | ✅ | ✅ | ✅ | ✅ | 🏢 | ✅ | ✅ | ✅ |
| AI entitlements/quotas | manage | ✅ | ✅ | ⛔ | ⛔ | 🏢 | ⛔ | ⛔ | ⛔ |
| AI usage | read | ✅ | ✅ | ✅ | ⛔ | 🏢 | ⛔ | ⛔ | ⛔ |
| Audit logs | read | ✅ | ✅ | ✅ | ⛔ | 🏢 | ⛔ | ⛔ | ⛔ |
| Security (settings) | read | ✅ | ✅ | ✅ | ⛔ | 🏢 | ⛔ | ⛔ | ⛔ |
| Tickets | manage | ✅ | ✅ | ⛔ | ✅ | 🏢 | ⛔ | ⛔ | ⛔ |
| Resumes (own) | CRUD+export | ✅ | ✅ | 🔒 | 🔒 | 🏢 | 🔒 | 🔒 | 🔒 |
| Resumes (public) | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Portfolios (own) | CRUD | ✅ | ✅ | 🔒 | 🔒 | 🏢 | 🔒 | 🔒 | 🔒 |
| Portfolios (public) | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cover letters (own) | CRUD+export | ✅ | ✅ | 🔒 | 🔒 | 🏢 | 🔒 | 🔒 | 🔒 |
| Jobs (public) | read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Jobs (owned) | CRUD | ✅ | ✅ | ⛔ | ⛔ | 🏢 | ⛔ | 🔒 | ⛔ |
| Applications (as applicant) | apply | ✅ | ✅ | ⛔ | ⛔ | 🏢 | 🔒 | 🔒 | 🔒 |
| Applications (as employer) | review/approve/reject | ✅ | ✅ | ⛔ | ⛔ | 🏢 | ⛔ | 🔒 | ⛔ |
| Companies | create/edit (owned) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | 🔒 | ⛔ |
| Companies (admin) | approve/featured/delete | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Messages (own) | send/read | ✅ | ✅ | 🔒 | 🔒 | 🏢 | 🔒 | 🔒 | 🔒 |
| Notifications (own) | read | ✅ | ✅ | 🔒 | 🔒 | 🏢 | 🔒 | 🔒 | 🔒 |
| CMS custom pages | public read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CMS (admin) | CRUD+moderation | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Blog | public read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Blog (admin) | CRUD+moderate | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Enterprise M2M service accounts | CRUD | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Platform health | read | ✅ | ✅ | ✅ | ✅ | 🏢 | 🏢 | ✅ | ✅ |
| Account (own) | delete/export | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |
| Impersonation / firebase-sa config | SUPER_ADMIN only | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

## 4. Enforcement Layers

1. **Frontend guards** (`RequireAuthenticated`, `AuthenticatedAppShell`, route-level role checks in Admin.jsx and EnterpriseConsole.jsx) – UI only, not a security boundary.
2. **API gateway middleware** (`requireAuth`, `enforceApiPolicy`, `requirePermission`) – mounted in `index.js` for `/api` paths; public paths are explicitly allow-listed.
3. **Enterprise auth middleware** (`createEnterpriseAuthMiddleware`) – distinguishes M2M keys, support grants, and bearer tokens; fails closed on ambiguous credentials.
4. **Resource-level authorization** – route handlers re-check ownership/tenant membership on every query/mutation (e.g., `order.uid !== req.user.uid`, tenant_id = X, employer_id = X).
5. **Database constraints** – Foreign keys and `WHERE owner_uid = ?` / `WHERE tenant_id = ?` clauses in every SQL query.

All three layers (frontend, backend middleware, DB query) agree on the policy.
