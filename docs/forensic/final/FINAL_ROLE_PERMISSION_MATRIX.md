# Final Role × Permission Matrix

Source of truth: `backend/security/auth.js` `PERMISSIONS` map. Verified by 459/459 expanded RBAC matrix.

| Permission | SUPER_ADMIN | ADMIN | AUDITOR | SUPPORT | ENTERPRISE_ADMIN | ENTERPRISE_MEMBER | EMPLOYER | USER |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `*` | ✅ | — | — | — | — | — | — | — |
| `users.read` | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| `users.create` | ✅ | ✅ | — | — | — | — | — | — |
| `users.update` | ✅ | ✅ | — | — | — | — | — | — |
| `users.delete` | ✅ | ✅ | — | — | — | — | — | — |
| `users.roles.manage` | ✅ | ✅ | — | — | — | — | — | — |
| `tenants.read` | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| `tenants.write` | ✅ | ✅ | — | — | — | — | — | — |
| `tenants.manage` | ✅ | ✅ | — | — | — | — | — | — |
| `email.template.manage` | ✅ | ✅ | — | — | — | — | — | — |
| `email.logs.read` | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| `system.config.read` | ✅ | ✅ | ✅ | — | — | — | — | — |
| `system.config.write` | ✅ | ✅ | — | — | — | — | — | — |
| `payments.manage` | ✅ | ✅ | — | — | — | — | — | — |
| `payments.read` | ✅ | ✅ | ✅ | — | — | — | — | — |
| `notifications.send` | ✅ | ✅ | — | — | — | — | — | — |
| `ai.entitlements.manage` | ✅ | ✅ | — | — | — | — | — | — |
| `ai.usage.read` | ✅ | ✅ | ✅ | — | — | — | — | — |
| `audit.read` | ✅ | ✅ | ✅ | — | — | — | — | — |
| `security.read` | ✅ | ✅ | ✅ | — | — | — | — | — |
| `tickets.manage` | ✅ | ✅ | — | ✅ | — | — | — | — |
| `secrets.manage` | ✅ | — | — | — | — | — | — | — |
| `tenant.members.manage` | ✅ | — | — | — | ✅ | — | — | — |
| `tenant.roles.manage` | ✅ | — | — | — | ✅ | — | — | — |
| `tenant.ai.policy` | ✅ | — | — | — | ✅ | — | — | — |
| `tenant.billing.view` | ✅ | — | — | — | ✅ | — | — | — |
| `tenant.audit.read` | ✅ | — | — | — | ✅ | — | — | — |
| `tenant.workspaces.manage` | ✅ | — | — | — | ✅ | — | — | — |
| `workspace.read` | ✅ | — | — | — | ✅ | ✅ | — | — |
| `workspace.manage` | ✅ | — | — | — | ✅ | — | — | — |
| `workspace.members.manage` | ✅ | — | — | — | ✅ | — | — | — |
| `tenant.resumes.write` | ✅ | — | — | — | — | ✅ | — | — |
| `tenant.interviews.execute` | ✅ | — | — | — | — | ✅ | — | — |
| `tenant.ai.consume` | ✅ | — | — | — | — | ✅ | — | — |
| `jobs.manage` | ✅ | — | — | — | — | — | ✅ | — |
| `applications.review` | ✅ | — | — | — | — | — | ✅ | — |
| `candidates.contact` | ✅ | — | — | — | — | — | ✅ | — |
| `resumes.manage` | ✅ | — | — | — | — | — | — | ✅ |
| `coverletters.manage` | ✅ | — | — | — | — | — | — | ✅ |
| `interviews.execute` | ✅ | — | — | — | — | — | — | ✅ |
| `subscription.self` | ✅ | — | — | — | — | — | — | ✅ |

## Additional SA-only guards (middleware-enforced)

These mutations additionally pass through `requireRecentAdminAuthentication`, which requires `isSuperAdmin(req.user)` unconditionally, MFA (when `SUPER_ADMIN_MFA_REQUIRED` is true, default in production), and re-authentication within the last 10 minutes in production:

- `POST /api/admin/firebase-service-account`
- `POST /api/admin/payment-settings`
- `POST /api/admin/ai/test-provider`
- `POST /api/admin/ai/reset-quota`
- `POST /api/admin/ai/quota-limits`
- `POST /api/admin/email/admin/save-smtp`
- `POST /api/admin/email/admin/save-template-customization`
- `POST /api/admin/email/admin/reset-circuit-breaker`
- `POST /api/account/delete` (10-minute re-auth window for any authenticated user)
