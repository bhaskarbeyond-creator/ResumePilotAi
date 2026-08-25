# ResumePilot AI — Role & Permission Matrix (Production Specification)

This document specifies the authoritative Role-Based Access Control (RBAC) and Multi-Tenant Isolation matrix for all roles across ResumePilot AI.

---

## 1. System Roles & Hierarchies

| Role Identifier | Description | Scope | Authentication Requirement |
| :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | Platform owner with full root control over infrastructure, databases, tenants, and global configuration. | Global / Cross-Tenant | Firebase Auth + TOTP MFA + Recent Auth (`<10m`) |
| **ADMIN** | Platform operational administrator for content moderation, support oversight, and user management. | Global Platform | Firebase Auth + Admin Role Claim |
| **ENTERPRISE_OWNER** | Enterprise workspace founder/owner with full control over enterprise billing, members, and tenant data. | Tenant-Bound | Firebase Auth + Tenant Owner Membership |
| **ENTERPRISE_ADMIN** | Enterprise administrator managing teams, members, workflows, and integrations within the tenant. | Tenant-Bound | Firebase Auth + Tenant Admin Membership |
| **ENTERPRISE_MEMBER** | Enterprise team member creating resumes, portfolios, and collaborating within assigned workspaces. | Tenant-Bound | Firebase Auth + Tenant Member Membership |
| **EMPLOYER** | Recruiter / Hiring organization posting jobs, viewing applications, and searching public candidate profiles. | Employer Organization | Firebase Auth + Employer Profile |
| **SUPPORT** | Customer support operator assisting users, triaging tickets, and viewing non-sensitive system status. | Platform Support | Firebase Auth + Support Claim (No Super Admin access) |
| **USER / CANDIDATE** | B2C job seeker building resumes, cover letters, portfolios, job tracking, and taking AI interview coaching. | Personal Account | Firebase Auth |
| **PUBLIC** | Unauthenticated visitor browsing public job boards, public resumes, blog, and pricing pages. | Anonymous / Public | None |

---

## 2. Granular Capability & Permission Matrix

| Capability / API Domain | SUPER_ADMIN | ADMIN | ENTERPRISE_OWNER | ENTERPRISE_ADMIN | ENTERPRISE_MEMBER | EMPLOYER | SUPPORT | USER | PUBLIC |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Platform DB Switching** | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **Tenant Hard Purge / GC** | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **AI Provider Key Vault** | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **Global Audit Logs** | ✅ Full | ✅ Read | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **Enterprise Tenant Admin** | ✅ Full | ✅ Read | ✅ Own Tenant | ✅ Own Tenant | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **Enterprise Team/Member Mgt** | ✅ Full | ❌ Denied | ✅ Own Tenant | ✅ Own Tenant | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **Enterprise Quota Governance**| ✅ Full | ❌ Denied | ✅ Own Tenant | ✅ Own Tenant | ❌ Read Only | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **Job Posting & Candidate Mgt**| ✅ Full | ✅ Moderate | ❌ Denied | ❌ Denied | ❌ Denied | ✅ Own Jobs | ❌ Denied | ❌ Denied | ❌ Denied |
| **Support Ticket Triage** | ✅ Full | ✅ Full | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied | ✅ Full | ❌ Denied | ❌ Denied |
| **Resume Builder & CRUD** | ✅ Own | ✅ Own | ✅ Own | ✅ Own | ✅ Own | ❌ Denied | ❌ Denied | ✅ Own | ❌ Denied |
| **AI Interview CBT Simulator** | ✅ Own | ✅ Own | ✅ Own | ✅ Own | ✅ Own | ❌ Denied | ❌ Denied | ✅ Own | ❌ Denied |
| **DOCX/PDF High-Fidelity Export**| ✅ Own | ✅ Own | ✅ Own | ✅ Own | ✅ Own | ❌ Denied | ❌ Denied | ✅ Own | ❌ Denied |
| **Public Profile / Job View** | ✅ Read | ✅ Read | ✅ Read | ✅ Read | ✅ Read | ✅ Read | ✅ Read | ✅ Read | ✅ Read |

---

## 3. Cross-Role Boundary & Defense-in-Depth Invariants

1. **Non-Escalation Guarantee**: Normal users and employers cannot forge JWT custom claims or access administrative endpoints (`/api/admin/*`, `/api/platform/*`). All privileged endpoints enforce server-side `requireAuth`, `requireAdmin`, and `requireSuperAdmin` middleware.
2. **Tenant Hard Boundary**: Data partitions for Tenant A (`tenants/{tenantA}/*`) are physically isolated and cryptographically scoped. Direct REST calls with mismatched tenant IDs return `403 FORBIDDEN` or `404 NOT_FOUND`.
3. **MFA Enforcement for Destructive Actions**: Super Admin operations (DB switching, tenant purging, secret updates) enforce `TOTP` verification and check `auth_time` freshness to prevent session hijacking.
4. **Zero Key Exposure**: Secret API keys (NVIDIA, Gemini, Stripe, SMTP, DB credentials) remain exclusively in server Firestore settings and environment vaults; they are never sent down in client browser payloads.
