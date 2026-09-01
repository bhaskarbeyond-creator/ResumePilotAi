# ROLE RBAC MATRIX

This matrix details the server-side RBAC policy enforcement and route gating across all 10 roles.

| Resource / Endpoint Domain | `SUPER_ADMIN` | `ADMIN` | `SUPPORT` | `AUDITOR` | `USER` | `ENT_OWNER` | `ENT_ADMIN` | `ENT_MANAGER` | `ENT_MEMBER` | `ENT_VIEWER` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Platform System Settings (`/api/admin/settings`)** | **ALLOW ✓** | 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |
| **Platform Operators (`/api/platform/operators`)** | **ALLOW ✓** | 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |
| **Platform Operations / Cache (`/api/admin/operations/*`)** | **ALLOW ✓** | 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |
| **User Directory Read (`GET /api/admin/users`)** | **ALLOW ✓** | **ALLOW ✓** | **ALLOW ✓** | **ALLOW ✓** | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |
| **User Directory Mutate (`PATCH /api/admin/users/:id`)** | **ALLOW ✓** | **ALLOW (Std)** | 403 DENY | 403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |
| **Promo Coupons Mutate (`POST/DELETE /api/admin/coupons`)**| **ALLOW ✓** | 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |
| **Forensic Audit Read (`GET /api/admin/audit`)** | **ALLOW ✓** | **ALLOW ✓** | **ALLOW ✓** | **ALLOW ✓** | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |
| **Tenant Registry Mutate (`POST /api/tenants`)** | **ALLOW ✓** | 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |
| **Tenant Settings Mutate (`PATCH /api/enterprise/settings`)**| **ALLOW ✓** | 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | **ALLOW (Tenant)** | 403 DENY | 403 DENY | 403 DENY | 403 DENY |
| **Tenant Member Invite (`POST /api/enterprise/members/invite`)**| **ALLOW ✓**| 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | **ALLOW (Tenant)** | **ALLOW (Tenant)** | 403 DENY | 403 DENY | 403 DENY |
| **Workspace Mutate (`POST /api/enterprise/workspaces`)** | **ALLOW ✓** | 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | **ALLOW (Tenant)** | **ALLOW (Tenant)** | **ALLOW (Tenant)** | 403 DENY | 403 DENY |
| **Candidate Resumes Read (`GET /api/enterprise/resumes`)** | **ALLOW ✓** | 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | **ALLOW (Tenant)** | **ALLOW (Tenant)** | **ALLOW (Tenant)** | **ALLOW (Tenant)** | **ALLOW (Tenant)** |
| **Candidate Resumes Mutate (`POST /api/enterprise/resumes`)**| **ALLOW ✓**| 403 DENY | 403 DENY | 403 DENY | 401/403 DENY | **ALLOW (Tenant)** | **ALLOW (Tenant)** | **ALLOW (Tenant)** | **ALLOW (Tenant)** | 403 DENY |
| **Consumer Resume CRUD (`/api/resumes/*`)** | **ALLOW (Own)** | **ALLOW (Own)** | **ALLOW (Own)** | **ALLOW (Own)** | **ALLOW (Own)** | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY | 401/403 DENY |

---

## Invariant Summary
1. **Platform Boundary**: No non-SuperAdmin role can access System Configuration, AI Provider configurations, or Platform Operator management.
2. **Auditor Invariant**: Auditor role has **zero** mutation endpoints across all paths.
3. **Tenant Isolation**: Cross-tenant requests fail closed (HTTP 403/404) at the database layer.
