# Super Admin Control Plane — MariaDB Hidden Data & Visibility Audit

> **Scope**: All 77 Authoritative Tables in MariaDB  
> **Evaluation Metric**: Does this table contain operationally meaningful data that a Super Admin cannot see or control?  
> **Security Invariant**: Sensitive cryptographic material (password hashes, raw tokens) must remain masked; business and diagnostic metadata must be visible.  

---

## 1. Table-by-Table Data Visibility Matrix

| Table | Operationally Meaningful Data | Existing API | Existing UI | Super Admin Visibility | Operational Assessment & Legitimate Admin Need | Priority |
|:---|:---|:---|:---|:---:|:---|:---:|
| `users` | User profile, role, status, membership, last login, timestamps | `GET /api/admin/users`, `GET /api/admin/users/:uid/details` | `/adm/users`, User 360 | **FULL** | Exposed in Users table and User 360 Drawer. | `P0` (Verified) |
| `resumes` | Title, template, completion score, timestamps, soft deletion | `GET /api/admin/users/:uid/details` | User 360 `content` tab | **FULL** | Listed in User 360 with template and date tags. | `P1` (Verified) |
| `portfolios` | Title, slug, theme, published status, timestamps | `GET /api/admin/users/:uid/details` | User 360 `content` tab | **FULL** | Listed in User 360 with slug and theme tags. | `P1` (Verified) |
| `covers` | Job title, company name, timestamps | `GET /api/admin/users/:uid/details` | User 360 `content` tab | **FULL** | Listed in User 360 with company and job badges. | `P1` (Verified) |
| `payment_orders` | Amounts, currency, status, provider, coupon, refund status | `GET /api/admin/subscriptions`, `/api/admin/users/:uid/details`, `/api/platform/search` | `/adm/settings?tab=ordersManagement`, User 360 `billing` | **FULL** | Master Invoice Ledger, User 360, and Global Search. | `P0` (Verified) |
| `invoices` & `credit_notes` | Invoice numbers, tax breakdown, PDF records, credit note IDs | `GET /api/admin/settings/orders` | Invoices Tab | **FULL** | Authoritative invoice printing and credit note generator. | `P1` (Verified) |
| `payment_webhook_events` | Raw webhook payloads from Stripe/Razorpay, event types, status | Handled internally in `MySQLRepository.js` | None | **HIDDEN (DIAGNOSTIC)** | Useful when debugging failed webhook delivery; currently logged to server console. | `P3` |
| `payment_refund_provider_references` | Provider refund IDs, idempotency keys, refund state | `GET /api/admin/users/:uid/details` | User 360 `billing` | **FULL** | Rendered in order details and refund ledger. | `P1` (Verified) |
| `enterprise_tenants` | Tenant metadata, slug, isolation tier, lifecycle | `GET /api/enterprise/platform/tenants`, `GET /api/platform/tenants/:id` | `/adm/tenants` | **FULL** | Complete Tenant 360 Workspace modal. | `P0` (Verified) |
| `enterprise_workspaces` | Workspace names, IDs, primary flags, lifecycle | `GET /api/platform/tenants/:id` | Tenant 360 `overview` tab | **FULL** | Configured Workspaces grid rendered in Overview. | `P1` (Verified) |
| `enterprise_memberships` | User assignments, roles, workspace IDs | `GET /api/platform/tenants/:id` | Tenant 360 `members` tab | **FULL** | Member management, role filter, 1-click add/remove. | `P1` (Verified) |
| `enterprise_tenant_configurations` | BYOK API keys, model policies, security policies | `GET /api/platform/tenants/:id`, `PATCH /api/admin/platform/tenants/:id/ai-policy` | Tenant 360 `ai` tab | **FULL** | BYOK keys configuration and live provider testing. | `P1` (Verified) |
| `enterprise_quota_buckets` | Monthly and daily AI token quotas per tenant | `GET /api/platform/tenants/:id` | Tenant 360 `usage` tab | **FULL** | Token consumption summary and request counters. | `P1` (Verified) |
| `enterprise_observability_rollups` | Historical usage rollups, request counts | `GET /api/platform/tenants/:id` | Tenant 360 `usage` tab | **FULL** | Rendered in usage charts and summary cards. | `P2` (Verified) |
| `enterprise_outbox` | Async enterprise transaction outbox, dead letters | `GET /api/platform/queues`, `POST /api/platform/queues/retry` | `/adm/queues` | **FULL** | Queue monitor, dead-letter count, replay-all. | `P1` (Verified) |
| `notification_outbox` | Email & SMS transactional notifications, errors | `GET /api/platform/queues` | `/adm/queues` | **FULL** | Per-job recipient inspector and retry action. | `P1` (Verified) |
| `admin_audit_logs` | Administrative mutation trail, actor, diffs | `GET /api/admin/audit-logs` | `/adm/audit-logs`, User 360 `audit` | **FULL** | Dedicated screen and embedded User 360 timeline. | `P0` (Verified) |
| `security_audit_logs` | Security events, failed logins, role escalation | `GET /api/platform/security-events` | `/adm/security`, User 360 `audit` | **FULL** | Dedicated security stream with severity filtering. | `P0` (Verified) |
| `database_switch_audit` | Engine switch events, dual sync state | Handled in `database_authority.js` | Platform Operations | **FULL** | Database authority and sync state indicators. | `P2` (Verified) |
| `email_logs` | Outbound email delivery history, SMTP errors | `GET /api/email/logs`, `POST /api/email/resend` | `/adm/settings?tab=emailSettings` (`logs` tab) | **FULL** | Delivery logs list with resend action and error logs. | `P1` (Verified) |
| `ai_usage` | Daily AI quota consumption per user | `GET /api/admin/users/:uid/details`, `GET /api/admin/ai/entitlements` | User 360 `ai`, Command Center | **FULL** | Used today, remaining quota, override controls. | `P1` (Verified) |
| `system_settings` | 31 configuration categories, revision counters | `GET /api/admin/settings`, `POST /api/admin/settings/:category` | `/adm/settings` (31 tabs) | **FULL** | Optimistic concurrency revisioned save across all 31 panels. | `P0` (Verified) |
| `platform_announcements` | Global banner notices, audience, severity | `GET /api/platform/announcements`, `POST /api/platform/announcements` | `/adm/operations` | **FULL** | Create, edit, toggle, delete platform banners. | `P1` (Verified) |
| `stats` | Platform-wide aggregates (resumes created, downloads) | `GET /api/platform/command-center` | `/adm/dashboard` | **FULL** | Surfaced in Command Center KPI cards. | `P1` (Verified) |
| `support_tickets` & `support_ticket_messages` | Customer support tickets, message thread, status | `GET /api/admin/support/tickets`, `POST /api/admin/support/tickets/:id/messages` | `/adm/help-desk` | **FULL** | Ticket queue, message conversation, status transitions. | `P1` (Verified) |
| `contact_messages` | Inbound public contact inquiries | `GET /api/contact-messages` | `/adm/messages` | **FULL** | Inquiries list, reply action, read/unread status. | `P2` (Verified) |
| `jobs`, `companies`, `applications` | Job board listings, employer profiles, applications | `GET /api/jobs-data`, `GET /api/companies`, `GET /api/employer-applications` | `/adm/jobs-manager`, `/adm/company-management`, `/adm/employer-applications` | **FULL** | Full CRUD and moderation workflows. | `P2` (Verified) |
| `blog`, `custom_pages`, `reviews`, `trusted_by`, `canonical_documents` | CMS blog posts, landing pages, reviews, client logos, phrases | Dedicated admin endpoints | `/adm/blog-management`, `/adm/landing-pages`, `/adm/reviews`, `/adm/trustedby`, `/adm/phrases` | **FULL** | Complete content management screens. | `P2` (Verified) |
| `email_verification_state`, `password_reset_state`, `email_verification_tokens`, `password_reset_tokens` | Ephemeral crypto tokens for auth recovery | `POST /api/admin/users/:uid/send-password-reset`, `POST /api/admin/users/:uid/verify-email` | User 360 `identity` | **CONTROLLED ACCESS** | Raw tokens are masked for security; 1-click admin reset triggers are exposed. | `P1` (Security Invariant) |
| `schema_migrations`, `schema_migration_attempts` | DDL migration history | Internal bootstrap | CLI / Readyz | **SYSTEM INTERNAL** | Validated during startup checks (`GET /readyz`). | `P3` |

---

## 2. Findings on Hidden Data

1. **Zero Secret Leakage Maintained**: Password reset tokens, email verification nonces, and webhook secret signatures are intentionally kept out of client payloads to protect user account integrity while exposing legitimate management triggers (e.g. 1-click Send Password Reset).
2. **Diagnostic Webhook Stream (Optional Enhancement)**: Inbound webhook payloads in `payment_webhook_events` are currently recorded for idempotency. In the future, a dedicated diagnostic viewer can be added to the Payments tab if webhook delivery troubleshooting is requested by operators.
