# Super Admin Control Plane — Backend Capabilities with Missing or Incomplete UX

> **Scope**: All Express Backend Endpoints, Services, and Repositories  
> **Evaluation Metric**: Does a backend capability exist that lacks a corresponding intuitive UI workflow or has partial UI exposure?  

---

## 1. Backend-to-UX Capability Mapping

| Backend Capability | API Route | DB Tables | Required Permission | UI Screen | UX Workflow Status | Resolution / Remediation |
|:---|:---|:---|:---|:---|:---:|:---|
| **Bulk User Management** | `POST /api/admin/users/bulk` | `users`, `admin_audit_logs` | `users.update` | `/adm/users` | `COMPLETE` | Added batch suspension and activation with confirmation dialog and automatic table refresh. |
| **Cover Letters Retrieval** | `GET /api/admin/users/:uid/details` | `covers` | `users.read` | User 360 `content` tab | `COMPLETE` | Extended `/:uid/details` to fetch `covers` and rendered them with company/job badges. |
| **Tenant Workspaces Directory** | `GET /api/platform/tenants/:id` | `enterprise_workspaces` | `tenants.read` | Tenant 360 `overview` tab | `COMPLETE` | Rendered Configured Workspaces grid with primary badges and lifecycle tags in Overview. |
| **Multi-Entity Global Search** | `GET /api/platform/search?q=*` | `users`, `enterprise_tenants`, `payment_orders`, `support_tickets` | `system.config.read` | `AdminCommandPalette.jsx` (`Cmd+K`) | `COMPLETE` | Extended search to index orders and support tickets with dedicated icon badges and direct navigation. |
| **Command Center Growth Velocity** | `GET /api/platform/command-center` | `users`, `payment_orders` | `system.config.read` | `/adm/dashboard` | `COMPLETE` | Implemented SQL aggregations for 7d/30d user growth and active subscriptions. |
| **Dead-Letter Replay & Purge** | `POST /api/platform/queues/retry`, `/purge` | `notification_outbox`, `enterprise_outbox` | `security.read` (Super Admin) | `/adm/queues` | `COMPLETE` | Replay single, Replay all DLQ, and Purge DLQ workflows with modal confirmation guards. |
| **Emergency Operator Session Invalidation** | `POST /api/platform/operators/:uid/revoke-sessions` | Firebase Auth Refresh Tokens | `users.roles.manage` (Super Admin) | `/adm/operators` | `COMPLETE` | 1-Click revoke active operator sessions with confirmation modal. |
| **Maintenance Mode Claim Bypass** | `POST /api/platform/maintenance` | `system_settings` | `system.config.write` (Super Admin) | `/adm/operations` | `COMPLETE` | Revisioned toggle with scheduled maintenance messages and claim-based bypass. |
| **Email Deliverability & Resend** | `GET /api/email/logs`, `POST /api/email/resend` | `email_logs` | `email.logs.read`, `system.config.write` | `/adm/settings?tab=emailSettings` | `COMPLETE` | Outbound email delivery history with live SPF/DKIM/DMARC DNS deliverability tests. |
| **Payment Orders & 1-Click Refunds** | `POST /api/admin/orders/:id/refund` | `payment_orders`, `invoices`, `credit_notes` | `payments.manage` | `/adm/settings?tab=ordersManagement` | `COMPLETE` | Invoices and refunds tab with search, status filtering, and credit note issuance. |

---

## 2. Assessment Summary

All identified backend control plane capabilities now have dedicated, certified frontend UI workflows with responsive modals, confirmation gates, and error handling.
