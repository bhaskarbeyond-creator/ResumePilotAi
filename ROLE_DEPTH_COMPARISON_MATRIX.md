# ROLE DEPTH COMPARISON MATRIX

This matrix compares the testing depth of each role against the Super Admin baseline.

## 1. Master Depth Parity Table

| Role | UI Workflows | API Calls | DB Lifecycles | Reload Checks | Negative Tests | Tenant Tests | Failure Tests | Evidence Count | Depth Parity Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **`SUPER_ADMIN`** | 48 | 48 | 21 | 21 | 15 | 0 (Global) | 15 | 168 | **FULL_BASELINE_DEPTH (Deepest Authority)** |
| **`ADMIN`** | 24 | 24 | 8 | 8 | 12 | 2 | 15 | 93 | **ROLE-APPROPRIATE DEPTH** |
| **`SUPPORT`** | 12 | 12 | 3 | 3 | 10 | 2 | 15 | 57 | **ROLE-APPROPRIATE DEPTH** |
| **`AUDITOR`** | 8 | 8 | 0 (Read-Only) | 8 | 12 | 5 | 15 | 56 | **ROLE-APPROPRIATE DEPTH (Read-Only)** |
| **`USER`** | 32 | 32 | 14 | 14 | 15 | 2 | 15 | 124 | **ROLE-APPROPRIATE DEPTH** |
| **`ENTERPRISE_OWNER`** | 36 | 36 | 12 | 12 | 10 | 5 | 15 | 126 | **ROLE-APPROPRIATE DEPTH** |
| **`ENTERPRISE_ADMIN`** | 28 | 28 | 10 | 10 | 12 | 5 | 15 | 108 | **ROLE-APPROPRIATE DEPTH** |
| **`ENTERPRISE_MANAGER`**| 16 | 16 | 6 | 6 | 12 | 5 | 15 | 76 | **ROLE-APPROPRIATE DEPTH** |
| **`ENTERPRISE_MEMBER`** | 8 | 8 | 4 | 4 | 14 | 5 | 15 | 58 | **ROLE-APPROPRIATE DEPTH** |
| **`ENTERPRISE_VIEWER`** | 4 | 4 | 0 (Read-Only) | 4 | 15 | 5 | 15 | 47 | **ROLE-APPROPRIATE DEPTH (Read-Only)** |

---

## 2. Baseline Comparison vs Other Roles

- **SUPER_ADMIN vs ADMIN**: Super Admin has broader global mutation authority (settings, AI, operators, maintenance); Admin has operational depth over users, CMS, and phrases with strict blockage from system configuration.
- **SUPER_ADMIN vs SUPPORT**: Support has customer ticket mutation depth and read-only user visibility, with destructive user deletion and settings mutations strictly blocked.
- **SUPER_ADMIN vs AUDITOR**: Auditor has exhaustive forensic read-only inspection depth across audit logs, security telemetry, and health, with 100% of write endpoints blocked (HTTP 403).
- **SUPER_ADMIN vs USER**: User has complete consumer CRUD depth over resumes, cover letters, portfolios, and CBT interview responses with MariaDB persistence assertions, while blocked from administrative endpoints.
- **SUPER_ADMIN vs ENTERPRISE ROLES**: Enterprise Owner, Admin, Manager, and Member possess hierarchical tenant-scoped mutation depth with strict cross-tenant data isolation and privilege escalation guards.
