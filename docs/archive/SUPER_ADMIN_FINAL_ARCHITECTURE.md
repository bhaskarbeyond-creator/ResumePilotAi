# Super Admin `/adm` — Final Architecture (authoritative)

This is the simple model. If the UI and the code disagree with this document, the code is wrong.

Rollback tag: `superadmin-rollback-64ba2df`  
Production baseline: `e884770`  
This branch HEAD after this change is recorded in git.  
`ADMIN` in the header is labelled **Platform Admin**. Destructive mutations remain Super Admin only.

---

## 1. Who uses what

```
Public visitor
  → marketing, login, published portfolios, job board
  → no /adm, no /enterprise

Authenticated USER
  → resume builder, CV, interview coach, portfolio, billing
  → no /adm
  → /enterprise only if they have a tenant membership

SUPPORT (Firebase claim)
  → cannot open /adm (no system.config.write)
  → /enterprise only with a valid support grant (break-glass)

TENANT_ADMIN / TENANT_OWNER (membership role, not Firebase claim)
  → /enterprise for THEIR tenant only
  → cannot list all tenants
  → cannot open /adm

ADMIN  = Platform Admin  (Firebase claim)
  → /adm for consumer product + platform READ + most writes
  → cannot: maintenance toggle, DLQ replay-all, tenant decommission,
            announcements write/delete, operator role assignment

SUPER_ADMIN  = Super Admin  (Firebase claim, permissions ['*'])
  → everything ADMIN can do
  → plus the destructive / governance mutations above
```

**Platform Admin and Super Admin are different roles.**  
`isPlatformTenantProvisioner` = `*` OR `system.config.write` = both ADMIN and SUPER_ADMIN can provision/suspend tenants. Only SUPER_ADMIN can decommission.

---

## 2. Two consoles, one platform

| | `/adm` Super Admin / Platform Admin | `/enterprise` Tenant console |
|---|---|---|
| Scope | The whole product + all tenants | One tenant (and optionally one workspace) |
| Identity | Firebase claim `role` | Tenant membership roles |
| Data | Global collections + platform views of enterprise_* | Tenant-scoped documents |
| Purpose | Is the platform healthy? Who operates it? Which tenants exist? | Who is in this org? What can they do? What did they consume? |

**Never duplicate:** tenant registry, tenant audit, M2M keys, support grants, encryption keys, enterprise outbox, usage ledger.

`/adm` **reads or invokes** those systems. Tenant job replay, member IAM, AI policy, and service accounts stay in `/enterprise`.

Handoff: tenant drawer links to `/enterprise?tab=audit|usage&tenant=…`.

---

## 3. Where data lives

**Platform / consumer (global)**  
`users`, `settings`, `data/*`, `payment_orders`, `notification_outbox`, `admin_audit_logs`, `security_audit_logs`, `platform_announcements`, jobs/companies/blog/reviews…

**Enterprise (tenant-scoped)**  
`enterprise_tenants`, `enterprise_memberships`, `enterprise_workspaces`, `enterprise_audit` (via repository), `enterprise_outbox`, service accounts, support grants.

---

## 4. APIs

**Super Admin / platform** — `/api/platform/*` and `/api/admin/*`  
Auth: Firebase bearer + `system.config.write` (policy) + extra `requireSuperAdmin` on destructive routes.

**Enterprise** — `/api/enterprise/*`  
Auth: Firebase bearer **or** M2M `x-api-key`, then tenant context resolution. Client `x-tenant-id` can only restrict, never expand.

---

## 5. Authorization (fail-closed)

1. `verifyIdToken(token, checkRevoked=true)`
2. `enforceApiPolicy` — admin paths, verified email, recent `auth_time` for sensitive mutations
3. Route permission (`system.config.write` / `requireSuperAdmin`)
4. Enterprise additionally: membership, lifecycle ACTIVE, M2M allowlist, support allowlist

Never trusted: localStorage, UI `isSuperAdmin`, URL tenant IDs as authority.

---

## 6. What requires extra gates

| Action | Recent auth | Super Admin | Confirm | Audit |
|---|---|---|---|---|
| Settings writes | some (AI, coupons, health) | No | UI | Yes |
| User delete / role | existing user APIs | Role grant is Super Admin for operators API | Yes | Yes |
| Maintenance | Yes | Yes | UI | Yes |
| DLQ retry | Yes | Yes | UI | Yes |
| Tenant suspend/reactivate | Enterprise path | No (Platform Admin ok) | Yes | Enterprise + security log |
| Tenant decommission | Yes | Yes | Reason ≥ 8 | Yes |
| Announcement CUD | Yes | Yes | — | Yes |
| Operator role assign | Yes | Yes | — | Yes |
| SUPER_ADMIN claim change | Not via API | Forbidden | — | — |

Irreversible: user delete, announcement delete. Decommission is lifecycle `DELETING`, not a hard wipe.

---

## 7. `/adm` module map

| Route | Purpose |
|---|---|
| `/adm/dashboard` | Command center |
| `/adm/attention` | Derived incidents from real signals |
| `/adm/tenants` | Registry + lifecycle + Enterprise handoff |
| `/adm/audit-logs` | `admin_audit_logs` |
| `/adm/security` | `security_audit_logs` |
| `/adm/queues` | Notification outbox + DLQ |
| `/adm/operations` | Encryption, observability, backup status, Enterprise outbox posture, maintenance, announcements |
| `/adm/operators` | Platform identity (ADMIN / SUPPORT / USER) |
| `/adm/users` | Consumer user lifecycle |
| `/adm/settings` | 30 product/platform setting tabs |
| Consumer CMS / jobs / reviews / phrases / messages / trusted-by / landing | Unchanged product admin |

---

## 8. How the two consoles interact

```
SUPER_ADMIN in /adm
  sees all tenants (enterprise_tenants via existing listPlatformTenants)
  suspends / reactivates via Enterprise platform APIs
  decommissions via /api/platform/.../decommission → same tenantService lifecycle
  drills into /enterprise?tenant=ID for tenant IAM, usage, audit, M2M, support

TENANT_ADMIN in /enterprise
  never sees other tenants
  never reaches /adm
```
