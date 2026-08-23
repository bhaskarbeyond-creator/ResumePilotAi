# Super Admin Capability Matrix

This document outlines the strict segregation of duties between standard `ADMIN` users and `SUPER_ADMIN` users. 

## Capability Matrix

| Domain | Action | `ADMIN` Role | `SUPER_ADMIN` Role | API Enforcement |
| :--- | :--- | :---: | :---: | :--- |
| **System Health** | View Command Center | ❌ | ✅ | `requireSuperAdmin` |
| **System Health** | View Operational Status | ❌ | ✅ | `requireSuperAdmin` |
| **System Health** | Trigger Health Checks | ❌ | ✅ | `requireSuperAdmin` |
| **Configuration** | View Feature Flags | ❌ | ✅ | `requireSuperAdmin` |
| **Configuration** | Toggle Feature Flags | ❌ | ✅ | `requireSuperAdmin` |
| **Configuration** | View Payment Secrets | ❌ | ✅ | `requireSuperAdmin` |
| **Configuration** | Rotate Payment Secrets | ❌ | ✅ | `requireSuperAdmin` |
| **Configuration** | View AI API Keys | ❌ | ✅ | `requireSuperAdmin` |
| **Configuration** | Rotate AI API Keys | ❌ | ✅ | `requireSuperAdmin` |
| **Users** | View User List | ✅ | ✅ | `permissionsFor()` |
| **Users** | Suspend/Reactivate User | ✅ | ✅ | `permissionsFor('users.update')` |
| **Users** | Modify Subscription | ✅ | ✅ | `permissionsFor('payments.manage')` |
| **Users** | Grant `ADMIN` Role | ❌ | ✅ | `permissionsFor('users.roles.manage')` |
| **Users** | Grant `SUPPORT` Role | ❌ | ✅ | `permissionsFor('users.roles.manage')` |
| **Tenancy** | View Tenant List | ❌ | ✅ | `requireSuperAdmin` |
| **Tenancy** | View Tenant Detail | ❌ | ✅ | `requireSuperAdmin` |
| **Tenancy** | Suspend Tenant | ❌ | ✅ | `requireSuperAdmin` |
| **Tenancy** | Reactivate Tenant | ❌ | ✅ | `requireSuperAdmin` |
| **Tenancy** | Decommission Tenant | ❌ | ✅ | `requireSuperAdmin` |

## RBAC Enforcement Mechanisms

1. **`requireSuperAdmin` Middleware**: A hard route-level barrier applied to `/api/platform/*` and `/api/admin/payment-settings`. Verifies `req.user.role === 'SUPER_ADMIN'`.
2. **`permissionsFor()` Evaluation**: Used within `/api/admin/users/:uid` to evaluate specific grants (`users.update`, `users.roles.manage`) based on the caller's role.
3. **Self-Protection Rules**: An active admin cannot revoke their own admin role or suspend themselves, ensuring the platform always retains at least one active administrator.
