# USER Dashboard — Adversarial RBAC & Negative Authorization Matrix

**Audit Objective:** Prove that standard `USER` identity cannot access administrative, operator, or tenant-level capabilities.  
**Authoritative Security Model:** Zero-Trust Cryptographic Bearer Token Inspection & MariaDB Row-Level Ownership Fencing.

---

## 1. Role Definitions & Permission Fencing

```
                               ┌─────────────────────────────────────────────────────────────┐
                               │                    SUPER_ADMIN ('*')                         │
                               └──────────────────────────────┬──────────────────────────────┘
                                                              │
                    ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
                    │                                         │                                         │
     ┌──────────────┴──────────────┐           ┌──────────────┴──────────────┐           ┌──────────────┴──────────────┐
     │       ADMIN (Operations)    │           │    SUPPORT (Help Desk)      │           │    AUDITOR (Compliance)     │
     │ users.*, tenants.*, tickets │           │ tickets.manage, users.read  │           │ audit.read, security.read   │
     └─────────────────────────────┘           └─────────────────────────────┘           └─────────────────────────────┘
                                                              │
                                       ┌──────────────────────┴──────────────────────┐
                                       │              USER (Candidate)               │
                                       │ resumes.manage, coverletters.manage,        │
                                       │ interviews.execute, subscription.self       │
                                       └─────────────────────────────────────────────┘
```

---

## 2. Adversarial Negative Endpoint Probes (USER Token vs Sensitive APIs)

| Targeted Endpoint | Administrative Permission Required | USER Token Attempt Result | HTTP Status Code | Database Mutation? | Security Verdict |
|---|---|---|---|---|---|
| `GET /api/admin/users` | `users.read` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `PATCH /api/admin/users/:id` | `users.update` / `users.roles.manage` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/admin/support/tickets` | `tickets.manage` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `PATCH /api/admin/support/tickets/:id` | `tickets.manage` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/admin/audit-logs` | `audit.read` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/admin/health-summary` | `security.read` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/admin/firebase-service-account` | `secrets.manage` (SA Only) | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `POST /api/admin/firebase-service-account` | `secrets.manage` (SA Only) | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/admin/payment-settings` | `payments.read` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `POST /api/admin/payment-settings` | `payments.manage` (SA Only) | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/admin/subscriptions` | `payments.read` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/admin/ai/entitlements` | `ai.usage.read` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `POST /api/admin/ai/test-provider` | `system.config.write` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/admin/settings` | `system.config.read` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `POST /api/platform/maintenance` | `SUPER_ADMIN` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `GET /api/email/logs` | `email.logs.read` | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |
| `POST /api/enterprise/tenants` | Platform Provisioner | Access Denied | `403 FORBIDDEN` | None | **SAFE (BLOCKED)** |

---

## 3. Negative UI Surface Boundary Checks

| Administrative UI Path | Action Attempted by USER Identity | Expected UX Behavior | Observed Outcome | Status |
|---|---|---|---|---|
| `/adm/dashboard` | Direct URL entry in address bar | Blocked by Admin route guard | Rendered blank or redirected safely | **PASS** |
| `/adm/users` | Direct URL entry in address bar | Blocked | Access denied, no data exposed | **PASS** |
| `/adm/help-desk` | Direct URL entry in address bar | Blocked (`tickets.manage` required) | Access denied, redirects to dashboard | **PASS** |
| `/adm/ai-settings` | Direct URL entry in address bar | Blocked | Secrets never disclosed | **PASS** |
| `/adm/settings` | Direct URL entry in address bar | Blocked | System config locked | **PASS** |
| `/adm/audit-logs` | Direct URL entry in address bar | Blocked | Audit trail protected | **PASS** |
