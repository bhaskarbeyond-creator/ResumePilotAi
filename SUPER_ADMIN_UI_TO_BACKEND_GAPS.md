# Super Admin Control Plane — UI Controls with Missing or Incomplete Backend Operations

> **Scope**: All Super Admin React Components, Modals, Forms, Buttons, and Toggles  
> **Evaluation Metric**: Does a UI control exist that has a placeholder handler, fake success, local-only state mutation, or missing persistence?  

---

## 1. UI-to-Backend Audit Matrix

| UI Component | Control / Action | Handler Function | Backend Endpoint Called | DB Table Affected | Verification Result | Status |
|:---|:---|:---|:---|:---|:---|:---:|
| `UsersManager.jsx` | Bulk Suspend / Activate | `handleBulkSuspend` | `POST /api/admin/users/bulk` | `users`, `admin_audit_logs` | Confirmed server-side batch execution & audit record | `VERIFIED` |
| `User360Drawer.jsx` | Send Password Reset | `handleSendPasswordReset` | `POST /api/admin/users/:uid/send-password-reset` | Firebase Auth & Email Queue | Generates secure link & dispatches email notification | `VERIFIED` |
| `User360Drawer.jsx` | Verify Email Toggle | `handleVerifyEmail` | `POST /api/admin/users/:uid/verify-email` | `users`, Firebase Auth | Updates `emailVerified` claim and MariaDB user row | `VERIFIED` |
| `User360Drawer.jsx` | Revoke Active Sessions | `handleRevokeSessions` | `POST /api/admin/users/:uid/revoke-sessions` | Firebase Auth Refresh Tokens | Invalidates session tokens and logs audit event | `VERIFIED` |
| `User360Drawer.jsx` | Unenroll MFA | `handleUnenrollMfa` | `POST /api/admin/users/:uid/unenroll-mfa` | Firebase Auth MFA factors | Clears enrolled MFA factors and logs audit event | `VERIFIED` |
| `User360Drawer.jsx` | Plan Duration Change | `handlePlanChange` | `PUT /api/admin/users/:uid` | `users`, `admin_audit_logs` | Updates `membership` and `membershipEnds` timestamp | `VERIFIED` |
| `User360Drawer.jsx` | Save Role (RBAC) | `handleRoleChange` | `PUT /api/admin/users/:uid` | `users`, Firebase Custom Claims | Assigns custom claims role and updates MariaDB row | `VERIFIED` |
| `User360Drawer.jsx` | AI Quota Override / Reset | `handleSaveAiQuota`, `handleResetAiQuota` | `PUT /api/admin/users/:uid/ai-entitlement`, `POST /.../ai-quota-reset` | `users.extra_data`, `ai_usage` | Updates base quota limit and resets daily counter | `VERIFIED` |
| `User360Drawer.jsx` | Assign / Remove Tenant | `handleAssignTenant`, `handleRemoveTenant` | `POST /api/admin/users/:uid/tenants`, `DELETE /.../tenants/:id` | `enterprise_memberships` | Binds or removes organization membership | `VERIFIED` |
| `PlatformTenants.jsx` | Rename Tenant | `handleRename` | `PATCH /api/platform/tenants/:id` | `enterprise_tenants` | Updates display name with audit log | `VERIFIED` |
| `PlatformTenants.jsx` | Suspend / Reactivate Tenant | `handleSuspend`, `handleReactivate` | `POST /api/enterprise/platform/tenants/:id/suspend`, `/reactivate` | `enterprise_tenants` | Changes `lifecycleState` to `SUSPENDED`/`ACTIVE` | `VERIFIED` |
| `PlatformTenants.jsx` | Decommission Tenant | `handleDecommission` | `POST /api/platform/tenants/:id/decommission` | `enterprise_tenants` | Sets state to `DELETING` with mandatory reason | `VERIFIED` |
| `PlatformTenants.jsx` | Save AI BYOK Keys & Policy | `handleSaveAiPolicy` | `PATCH /api/admin/platform/tenants/:id/ai-policy` | `enterprise_tenant_configurations` | Persists encrypted API keys and model overrides | `VERIFIED` |
| `PlatformTenants.jsx` | Add / Remove Tenant Member | `handleAddMember`, `handleRemoveMember` | `POST /api/admin/platform/tenants/:id/members`, `DELETE /.../members/:uid` | `enterprise_memberships` | Adds or removes member with role selection | `VERIFIED` |
| `PlatformTenants.jsx` | Update Commercials | `handleSaveCommercials` | `PATCH /api/admin/platform/tenants/:id/commercials` | `enterprise_tenants` | Updates seat count, contracted plan, and currency | `VERIFIED` |
| `PlatformQueues.jsx` | Replay All Dead Letters | `handleReplayAll` | `POST /api/platform/queues/retry` (`all: true`) | `notification_outbox`, `enterprise_outbox` | Resets status to `PENDING` for all DLQ items | `VERIFIED` |
| `PlatformQueues.jsx` | Purge Dead Letters | `handlePurgeAll` | `POST /api/platform/queues/purge` | `notification_outbox`, `enterprise_outbox` | Deletes failed messages with audit record | `VERIFIED` |
| `PlatformOperations.jsx` | Maintenance Toggle | `handleToggleMaintenance` | `POST /api/platform/maintenance` | `system_settings` | Saves maintenance status with optimistic revision | `VERIFIED` |
| `PlatformOperations.jsx` | Announcements CRUD | `handleSaveAnnouncement`, `handleDeleteAnnouncement` | `POST /api/platform/announcements`, `DELETE /.../:id` | `platform_announcements` | Creates, updates, or deletes global banners | `VERIFIED` |
| `PlatformOperators.jsx` | Role Assignment | `handleRoleChange` | `POST /api/platform/operators` | Firebase Custom Claims | Updates operator role (`ADMIN`, `SUPPORT`, `USER`) | `VERIFIED` |
| `PlatformOperators.jsx` | Revoke Operator Sessions | `handleRevokeSessions` | `POST /api/platform/operators/:uid/revoke-sessions` | Firebase Auth Refresh Tokens | Invalidates operator session tokens | `VERIFIED` |
| `subscriptionsSettings.jsx` | Issue 1-Click Refund | `handleRefundOrder` | `POST /api/admin/orders/:id/refund` | `payment_orders`, `credit_notes` | Executes refund and generates authoritative credit note | `VERIFIED` |
| `Settings.jsx` (31 Panels) | Save Configuration | `handleSubmit` / `handleSave` | `POST /api/admin/settings/:category` | `system_settings` | Revisioned MariaDB atomic update | `VERIFIED` |

---

## 2. Assessment Summary

Every interactive button, form submission, and lifecycle action in the Super Admin Control Plane is wired to an authoritative Express backend route with real database persistence. There are **0 placeholder handlers, 0 fake success dialogs, and 0 local-only mutations**.
