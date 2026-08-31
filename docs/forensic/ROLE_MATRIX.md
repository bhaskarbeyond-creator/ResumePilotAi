# Role Matrix — Independent Forensic Discovery

> **Audit SHA**: `06f443d` | **Date**: 2026-08-31 | **Source**: `backend/security/auth.js:63-97`

## Canonical Role Definitions

| Role | Permission Set | Source | Dashboard | Landing |
|---|---|---|---|---|
| `SUPER_ADMIN` | Wildcard `*` | `auth.js:64` | `/adm/dashboard` | Admin Panel |
| `ADMIN` | 14 permissions | `auth.js:65-75` | `/adm/dashboard` | Admin Panel |
| `AUDITOR` | 8 read-only | `auth.js:76-79` | `/adm/dashboard` | Admin Panel (read-only) |
| `SUPPORT` | 4 permissions | `auth.js:80-82` | `/adm/help-desk` | Admin Panel (limited) |
| `ENTERPRISE_ADMIN` | 7 tenant-scoped | `auth.js:83-87` | `/enterprise/` | Enterprise Console |
| `ENTERPRISE_MEMBER` | 4 consumption | `auth.js:88-90` | `/dashboard/*` | User Dashboard |
| `EMPLOYER` | 3 job perms | `auth.js:91-93` | `/dashboard/my-employments` | User Dashboard |
| `USER` | 4 self-service | `auth.js:94-96` | `/dashboard/*` | User Dashboard |

---

## Permission Details

### SUPER_ADMIN
- **Permissions**: `*` (wildcard — all permissions)
- **Special**: MFA enforcement when `SUPER_ADMIN_MFA_REQUIRED` is true or production
- **Recent Auth Required**: Yes (for destructive operations via `requireRecentAdminAuthentication`)
- **Can Access**: Everything
- **Dashboard**: Full admin panel + all platform operations
- **Enterprise**: Can see Platform Administration tab

### ADMIN
```
users.read, users.create, users.update, users.delete, users.roles.manage,
tenants.read, tenants.write, tenants.manage,
email.template.manage, email.logs.read,
system.config.read, system.config.write,
payments.manage, payments.read,
notifications.send,
ai.entitlements.manage, ai.usage.read,
audit.read, security.read,
tickets.manage
```

### AUDITOR
```
users.read, tenants.read, email.logs.read, system.config.read,
payments.read, ai.usage.read, audit.read, security.read
```

### SUPPORT
```
users.read, email.logs.read, tenants.read, tickets.manage
```

### ENTERPRISE_ADMIN
```
tenant.members.manage, tenant.roles.manage, tenant.ai.policy,
tenant.billing.view, tenant.audit.read, tenant.workspaces.manage,
workspace.read, workspace.manage, workspace.members.manage
```

### ENTERPRISE_MEMBER
```
tenant.resumes.write, tenant.interviews.execute, tenant.ai.consume, workspace.read
```

### EMPLOYER
```
jobs.manage, applications.review, candidates.contact
```

### USER (Default Candidate)
```
resumes.manage, coverletters.manage, interviews.execute, subscription.self
```

---

## Route Guard Matrix

| Route | Frontend Guard | Backend Auth | Backend Permission |
|---|---|---|---|
| `/` | None (public) | N/A | N/A |
| `/login` | Redirect if authed | N/A | N/A |
| `/dashboard/*` | `RequireAuthenticated` | `requireAuth` (global) | USER-level |
| `/adm/*` | `RequireAuthenticated` + Admin role check | `requireAuth` + `enforceApiPolicy` | `system.config.read`/`.write` |
| `/enterprise/*` | `RequireAuthenticated` | `requireEnterpriseAuth` | Tenant-scoped |
| `/build-resume/*` | `MaybeApplicationShell` (no auth req) | `requireAuth` on save | None for viewing |
| `/export/Cv*` | `RequireExportAccess` | Export token auth | Export entitlement |
| `/billing/plans` | None (public) | `requireAuth` on payment | None for viewing |

---

## RBAC Gaps

### RBAC-001: Build Resume No Auth Guard
**Route**: `/build-resume/*` — `MaybeApplicationShell` renders content without auth.
**Severity**: P3 MEDIUM

### RBAC-002: Dashboard2 Dead Code
**Route**: `/dashboard2` redirects to Dashboard. Component imported but never rendered.
**Severity**: P4 LOW

### RBAC-003: No AUDITOR-Specific UI Restrictions
**Finding**: Admin panel renders same sidebar for all roles. AUDITOR sees mutation buttons that fail 403.
**Severity**: P2 HIGH

### RBAC-004: SUPPORT Role Sees All Nav Items
**Finding**: SUPPORT users see menu items they cannot access.
**Severity**: P3 MEDIUM
