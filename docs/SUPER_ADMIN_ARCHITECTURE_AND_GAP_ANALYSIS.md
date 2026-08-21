# SUPER ADMIN `/adm` — Architecture Discovery & Gap Analysis

**Baseline independently verified 2026-08-21**

| Item | Value |
|---|---|
| Working branch | `arena/01a02610-resumepilotai` |
| `git HEAD` (pre-change rollback) | `e88477041435d970c500413e8fe145455686878a` |
| `origin/main` | `e88477041435d970c500413e8fe145455686878a` |
| `origin/arena/01a02322-resumepilotai` | **UNVERIFIED** — remote ref not present in this shallow clone |
| Working tree at start | Clean |
| `backend/COMMIT_SHA` at start | `b62635b161c125d741e9e5b46c3713a1e4d4f55c` (file SHA, not a reachable git object in this clone) |
| Production HTTPS | **UNVERIFIED** — TLS handshake to `airesume.projectdemo.guru:443` failed (`SSL_ERROR_SYSCALL`) from this environment |

This document is the **after** architecture. The previous audit in this file described a 3/10 consumer admin. That description is retained conceptually as the **before** state.

---

## 1. Before architecture

```
USER → /adm → checkIfAdmin(ADMIN|SUPER_ADMIN)
                 ↓
         Consumer Admin shell
         (dashboard counts, settings, CMS, users)
                 ↓
         /api/admin/*  (system.config.write)
                 ↓
         Global Firestore collections
```

Gaps that were real at `e884770`:

- Tenant suspend/reactivate UI called `/suspended` and `/active` instead of `/suspend` and `/reactivate` (**P0 broken integration**).
- Command center showed health + KPIs but no recommended actions, risk score, payment/security/encryption signals.
- No `/adm` security event viewer, operations/encryption/backup surface, or Super Admin-only decommission.
- `SUPER_ADMIN` vs `ADMIN` was a badge plus a few gated mutations (maintenance, DLQ replay).
- No authenticated `/adm` Playwright suite.

Enterprise (`/enterprise`, tenant isolation, M2M, support grants, encryption, outbox) was already certified and **was not modified**.

---

## 2. After architecture

```
                         SUPER ADMIN
                               |
                    GLOBAL PLATFORM CONTROL  (/adm)
                               |
     ---------------------------------------------------------
     |            |            |             |               |
  Tenants     Identity      Security        Ops             AI
  (reuse      (users,       (admin_audit,   (health,        (existing
   Enterprise  roles,        security_audit,  queue/DLQ,      /adm/settings
   registry)   claims)       recent-auth)    encryption,      AI + quotas)
                                             backup status,
                                             maintenance,
                                             announcements)
                               |
                    PLATFORM DATA PLANE (existing)
                               |
     Firestore · admin_audit_logs · security_audit_logs
     notification_outbox · payment_orders · enterprise_*
                               |
                         Enterprise tenant control plane
                         (unchanged; /adm integrates, does not clone)
```

Role separation (server-enforced):

| Principal | `/adm` | Platform mutations | Tenant decommission / DLQ replay / maintenance / announcements |
|---|---|---|---|
| SUPER_ADMIN | Yes | Yes | Yes (`requireSuperAdmin`) |
| ADMIN | Yes | Most | No (403) |
| SUPPORT | No (`checkIfAdmin` + `system.config.write`) | No | No |
| TENANT_ADMIN | No | No | No |
| USER | No | No | No |
| M2M / SERVICE_ACCOUNT | No `/adm` UI | Enterprise allowlist only | No |

---

## 3. Module map

| `/adm` route | Backend | Data |
|---|---|---|
| `/adm/dashboard` | `GET /api/platform/command-center` | Health, risk, KPIs, recommendations, attention tenants, audit |
| `/adm/tenants` | Enterprise `GET/POST /api/enterprise/platform/tenants/*` + `POST /api/platform/tenants/:id/decommission` | `enterprise_tenants` |
| `/adm/audit-logs` | `GET /api/admin/audit-logs` | `admin_audit_logs` |
| `/adm/security` | `GET /api/platform/security-events` | `security_audit_logs` |
| `/adm/queues` | `GET/POST /api/platform/queues*` | `notification_outbox` |
| `/adm/operations` | encryption, observability, backup-status, maintenance, announcements | Enterprise runtime + `platform_announcements` + `settings/maintenance` |
| `/adm/users` and consumer modules | Existing `/api/admin/*` | Unchanged |
| `/adm/settings` | Existing 30-tab settings | Unchanged |

---

## 4. Security model

- `requireAuth` verifies Firebase ID tokens with **`checkRevoked: true`**.
- `/api/admin` and `/api/platform` require `system.config.write` via `policy.js` (defense in depth; platform router also requires `system.config.read`).
- Destructive Super Admin operations additionally require `requireSuperAdmin` and recent authentication (`RECENT_AUTH_PATHS` + prefix rules for decommission, announcements, DLQ replay).
- Admin mutations are recorded by `createAdminAuditMiddleware` on `/api/admin` and `/api/platform`.
- HIGH/CRITICAL admin events are mirrored to `security_audit_logs`.
- Secrets in audit payloads are redacted (`sanitizeAuditValue`).
- Tenant lifecycle continues to use `tenantService.setTenantLifecycleAsPlatform` — no second registry.

---

## 5. Data architecture

New/used collections for `/adm` control plane:

| Collection | Owner | Purpose |
|---|---|---|
| `admin_audit_logs` | Platform | Admin/platform mutation trail |
| `security_audit_logs` | Platform | High-severity + existing security events |
| `platform_announcements` | Super Admin | Operator announcements |
| `settings/maintenance` + `data/public_config.systemHealth` | Super Admin | Maintenance (dual-write so the public shell stays consistent) |
| `notification_outbox` | Existing outbox | Queue/DLQ |
| `enterprise_tenants` | Enterprise registry | Tenant directory |
| `payment_orders` | Billing ledger | Payment health sample |

No competing tenant registry, encryption system, queue, or M2M store was created.

---

## 6. Remaining P0/P1 after this change

| ID | Severity | Status |
|---|---|---|
| Broken tenant suspend/reactivate URLs | P0 | **FIXED** |
| Unaudited admin mutations | P0 | **MITIGATED** (middleware + HIGH mirror) |
| SUPER_ADMIN ≡ ADMIN | P1 | **PARTIAL** — destructive ops now Super Admin only; many settings still shared |
| Command center intelligence | P1 | **MITIGATED** — real signals + recommendations; no invented trends |
| Authenticated Playwright execution | P1 | **UNVERIFIED** — suite written; Chromium not installable in this environment |
| Live production `/adm` | P1 | **UNVERIFIED** — TLS to production failed from this sandbox |
| Tenant decommission | P2/P1 | **IMPLEMENTED** (lifecycle `DELETING`, Super Admin + reason) |

Enterprise console, consumer resume/CV/interview/portfolio flows, and Enterprise backend files were not changed except the shared Playwright helper accepting optional JWT `claims`.
