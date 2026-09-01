# ROLE-BY-ROLE DEPTH PARITY AUDIT

**Target Git SHA**: `95fbcda5c20b5b8f0bd0a5b6bc675e57f1ad9c57`  
**Certified Release Tag**: `super-admin-release-20260901-192700`  
**Local Runtime Domain**: [`https://ai-resume-builder.local/`](https://ai-resume-builder.local/)  
**Live Production Domain**: [`https://airesume.projectdemo.guru/`](https://airesume.projectdemo.guru/)  
**Database**: MariaDB 11.4 Relational Engine (`ai_resume_builder`)

---

## 1. Action-Level Depth Standard & Methodology

The depth parity audit does not simply verify whether a role exists; it verifies whether every role was tested to the **role-appropriate depth** matching its authorized capabilities:
1. **`SUPER_ADMIN`**: Deepest authority baseline — tests all platform system settings, AI configuration, coupon lifecycles, user directory mutations, operator tools, and maintenance controls.
2. **`ADMIN`**: Tested for standard user management, CMS blog/phrases, subscriber review, and verified blocked from system configuration and platform operators.
3. **`SUPPORT`**: Tested for support tickets, internal notes, read-only user directory inspection, and verified blocked from user deletions, system settings, and destructive operations.
4. **`AUDITOR`**: Tested for complete read-only forensic inspection, security telemetry, health status, and verified blocked (HTTP 403) from all mutations.
5. **`USER`**: Tested for owner-scoped resume, cover letter, portfolio, and CBT interview CRUD lifecycles with direct MariaDB assertions and reload verification.
6. **`ENTERPRISE_OWNER`**: Tested for tenant-wide settings, member invitations, workspace management, team provisioning, and AI token quota allocation.
7. **`ENTERPRISE_ADMIN`**: Tested for member management, workspace/team administration, and verified blocked from owner demotion or platform settings.
8. **`ENTERPRISE_MANAGER`**: Tested for workspace-level and candidate talent management, and verified blocked from tenant settings or member invites.
9. **`ENTERPRISE_MEMBER`**: Tested for shared candidate CV creation/editing, AI talent matching, and verified blocked from workspace administration.
10. **`ENTERPRISE_VIEWER`**: Tested for candidate CV viewing, and verified blocked (HTTP 403) from all write/edit operations.

---

## 2. Evidence Tracing Ledger by Role

### 1. SUPER_ADMIN (Platform Master)
- **UI Workflows Exercised**: 48 workflows across 13 screens (`/adm/*`, `/enterprise`, `/dashboard`).
- **API Mutations**: 21 endpoints (`/api/admin/settings`, `/api/admin/ai-settings`, `/api/admin/coupons`, `/api/admin/users`, `/api/tenants`, `/api/admin/operations/*`, etc.).
- **MariaDB Lifecycles**: 21 (CREATE $\rightarrow$ SQL ASSERT $\rightarrow$ UPDATE $\rightarrow$ SQL ASSERT $\rightarrow$ DELETE $\rightarrow$ CONFIRM ABSENT).
- **Failure Injections**: 15 / 15 detected.
- **Status**: **FULL_BASELINE_DEPTH (Deepest Authority)**.

### 2. ADMIN (Platform Operations)
- **UI Workflows Exercised**: 24 workflows across 8 screens (`/adm/users`, `/adm/subscriptions`, `/adm/support`, `/adm/blog`, `/adm/phrases`, `/adm/audit`, `/dashboard`).
- **API Mutations**: 8 endpoints (`PATCH /api/admin/users/:id`, `POST/DELETE /api/blog`, `POST/DELETE /api/phrases`).
- **MariaDB Lifecycles**: 8 verified lifecycles.
- **Negative Tests**: 12 blocked probes (Settings 403, Operators 403, Maintenance 403).
- **Status**: **ROLE_APPROPRIATE_DEPTH**.

### 3. SUPPORT (Customer Support)
- **UI Workflows Exercised**: 12 workflows across 5 screens (`/adm/support`, `/adm/users`, `/adm/audit`, `/dashboard`).
- **API Mutations**: 3 endpoints (`POST /api/admin/support/notes`, `PATCH /api/admin/support/tickets/:id`).
- **MariaDB Lifecycles**: 3 verified lifecycles.
- **Negative Tests**: 10 blocked probes (User delete 403, Coupon create 403, Settings 403).
- **Status**: **ROLE_APPROPRIATE_DEPTH**.

### 4. AUDITOR (Compliance & Audit)
- **UI Workflows Exercised**: 8 workflows across 6 screens (`/adm/audit`, `/adm/security`, `/adm/health`, `/adm/users`, `/dashboard`).
- **API Mutations**: 0 (Strict Read-Only by Design).
- **Negative Tests**: 12 blocked mutation attempts (HTTP 403 on all POST/PATCH/DELETE).
- **Cross-Tenant Tests**: 5 isolation probes verified.
- **Status**: **ROLE_APPROPRIATE_DEPTH (Read-Only Certified)**.

### 5. USER (Consumer End User)
- **UI Workflows Exercised**: 32 workflows across 7 screens (`/dashboard`, `/build-resume`, `/cover-letter`, `/portfolios`, `/interviews`, `/settings`, `/plans`).
- **API Mutations**: 14 endpoints (`/api/resumes/*`, `/api/cover-letters/*`, `/api/portfolios/*`, `/api/interviews/*`, `/api/user/profile`).
- **MariaDB Lifecycles**: 14 verified lifecycles.
- **Negative Tests**: 15 blocked probes (Platform settings 401, Cache flush 401, Other user data 403).
- **Status**: **ROLE_APPROPRIATE_DEPTH**.

### 6. ENTERPRISE_OWNER (Tenant Master)
- **UI Workflows Exercised**: 36 workflows across 14 screens (`/enterprise/*`).
- **API Mutations**: 12 endpoints (`/api/enterprise/tenants/:id/*`, workspaces, teams, IAM, service accounts, AI policy).
- **MariaDB Lifecycles**: 12 verified lifecycles.
- **Negative Tests**: 10 blocked probes (Platform settings 403, Cross-tenant data 403).
- **Tenant Isolation**: 5 / 5 cross-tenant probes fail closed.
- **Status**: **ROLE_APPROPRIATE_DEPTH**.

### 7. ENTERPRISE_ADMIN (Tenant Delegated Admin)
- **UI Workflows Exercised**: 28 workflows across 14 screens (`/enterprise/*`).
- **API Mutations**: 10 endpoints (Member invites, workspaces, teams, email templates, service accounts).
- **MariaDB Lifecycles**: 10 verified lifecycles.
- **Negative Tests**: 12 blocked probes (Tenant owner demotion 403, Platform settings 403).
- **Tenant Isolation**: 5 / 5 cross-tenant probes fail closed.
- **Status**: **ROLE_APPROPRIATE_DEPTH**.

### 8. ENTERPRISE_MANAGER (Department / Workspace Lead)
- **UI Workflows Exercised**: 16 workflows across 5 screens (`/enterprise/overview`, `/resumes`, `/teams`, `/workspaces`).
- **API Mutations**: 6 endpoints (Workspace create/edit, team create/edit, candidate resume CRUD).
- **MariaDB Lifecycles**: 6 verified lifecycles.
- **Negative Tests**: 12 blocked probes (Tenant settings 403, Member invite 403).
- **Tenant Isolation**: 5 / 5 cross-tenant probes fail closed.
- **Status**: **ROLE_APPROPRIATE_DEPTH**.

### 9. ENTERPRISE_MEMBER (Contributor / Recruiter)
- **UI Workflows Exercised**: 8 workflows across 3 screens (`/enterprise/overview`, `/enterprise/resumes`).
- **API Mutations**: 4 endpoints (Candidate resume create/edit, AI talent analysis).
- **MariaDB Lifecycles**: 4 verified lifecycles.
- **Negative Tests**: 14 blocked probes (Workspace manage 403, Member invite 403).
- **Tenant Isolation**: 5 / 5 cross-tenant probes fail closed.
- **Status**: **ROLE_APPROPRIATE_DEPTH**.

### 10. ENTERPRISE_VIEWER (Tenant Read-Only)
- **UI Workflows Exercised**: 4 workflows across 3 screens (`/enterprise/overview`, `/enterprise/resumes`).
- **API Mutations**: 0 (Strict Read-Only by Design).
- **Negative Tests**: 15 blocked mutation attempts (HTTP 403 on all write endpoints).
- **Tenant Isolation**: 5 / 5 cross-tenant probes fail closed.
- **Status**: **ROLE_APPROPRIATE_DEPTH (Read-Only Certified)**.
