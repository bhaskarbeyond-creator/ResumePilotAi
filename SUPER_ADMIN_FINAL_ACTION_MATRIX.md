# Super Admin Final Action Matrix & Route Mappings

**Target Runtime Environment**: `https://ai-resume-builder.local/`  
**Execution Mode**: Forensic Matrix Verification  
**Primary Database**: MariaDB 11.4 Relational Engine  

---

## 1. Complete Super Admin Action Matrix

| Action Identifier | Frontend UI Surface | API Route | HTTP Method | RBAC Requirement | Transaction / Lock Type | MariaDB Table(s) Mutated | Direct DB Assertion Result |
|---|---|---|---|---|---|---|---|
| `ACT_COUPON_CREATE` | Subscriptions → Coupons Panel | `/api/admin/coupons` | `POST` | `SUPER_ADMIN`, `payments.manage` | Relational UPSERT | `coupons` | PASS (`SELECT discount FROM coupons`) |
| `ACT_COUPON_UPDATE` | Subscriptions → Edit Coupon | `/api/admin/coupons/:code` | `POST` | `SUPER_ADMIN`, `payments.manage` | Atomic CAS Revision Lock | `coupons` | PASS (`revision = revision + 1`) |
| `ACT_COUPON_DELETE` | Subscriptions → Trash Icon | `/api/admin/coupons/:code` | `DELETE` | `SUPER_ADMIN`, `payments.manage` | Row DELETE | `coupons` | PASS (`SELECT COUNT(*) = 0`) |
| `ACT_MODULES_SAVE` | Settings → Modules Toggle | `/api/admin/settings/modules` | `POST` | `SUPER_ADMIN`, `system.config.write` | Row-locked Transaction | `system_settings` (`public_config`) | PASS (`JSON_EXTRACT(data, '$.modules')`) |
| `ACT_BRANDING_SAVE` | Settings → Branding Panel | `/api/admin/settings/branding` | `POST` | `SUPER_ADMIN`, `system.config.write` | Row-locked Transaction | `system_settings` (`public_config`) | PASS (`JSON_EXTRACT(data, '$.branding')`) |
| `ACT_AI_CONFIG_SAVE` | Settings → AI Governance | `/api/admin/ai-settings` | `POST` | `SUPER_ADMIN`, `ai.governance` | CAS Revision Lock | `system_settings` (`ai_providers`) | PASS (`category = 'ai_providers'`) |
| `ACT_PAYMENT_SAVE` | Settings → Payment Gateways | `/api/admin/payment-settings` | `POST` | `SUPER_ADMIN`, `payments.manage` | CAS Revision Lock | `system_settings` (`payment_providers`) | PASS (`category = 'payment_providers'`) |
| `ACT_ANNOUNCEMENT_CREATE` | Command Center → Announcements | `/api/platform/announcements` | `POST` | `SUPER_ADMIN`, `platform.manage` | Relational INSERT | `platform_announcements` | PASS (`id = UUID, title matched`) |
| `ACT_ANNOUNCEMENT_DELETE` | Command Center → Trash Icon | `/api/platform/announcements/:id` | `DELETE` | `SUPER_ADMIN`, `platform.manage` | Row DELETE | `platform_announcements` | PASS (`SELECT COUNT(*) = 0`) |
| `ACT_BLOG_SAVE` | CMS Management → Blog Editor | `/api/blog-data/:id` | `POST` | `SUPER_ADMIN`, `content.manage` | Relational UPSERT | `blog` | PASS (`slug = id, title matched`) |
| `ACT_BLOG_DELETE` | CMS Management → Blog Row Trash | `/api/blog-data/:id` | `DELETE` | `SUPER_ADMIN`, `content.manage` | CAS Revision DELETE | `blog` | PASS (`SELECT COUNT(*) = 0`) |
| `ACT_PHRASES_SAVE` | Resume Content → Phrase Editor | `/api/phrases` | `POST` | `SUPER_ADMIN`, `content.manage` | Universal Document Save | `canonical_documents` | PASS (`entity_type = 'phrases'`) |
| `ACT_PHRASES_DELETE` | Resume Content → Delete Category | `/api/phrases/:category` | `DELETE` | `SUPER_ADMIN`, `content.manage` | Universal Document Delete | `canonical_documents` | PASS (`entity_type = 'phrases', deleted`) |
| `ACT_TICKET_CREATE` | Help Desk → New Support Ticket | `/api/support/tickets` | `POST` | `USER`, `ADMIN`, `SUPER_ADMIN` | Relational INSERT | `support_tickets` | PASS (`id = UUID, status = 'OPEN'`) |
| `ACT_TICKET_REPLY` | Help Desk → Ticket Reply Drawer | `/api/admin/support/tickets/:id/messages` | `POST` | `ADMIN`, `SUPPORT`, `SUPER_ADMIN` | Relational INSERT | `support_ticket_messages` | PASS (`ticket_id = UUID, body matched`) |
| `ACT_TICKET_STATUS` | Help Desk → Status Selector | `/api/admin/support/tickets/:id` | `PATCH` | `ADMIN`, `SUPPORT`, `SUPER_ADMIN` | Relational UPDATE | `support_tickets` | PASS (`status = 'RESOLVED'`) |
| `ACT_USER_PATCH` | User 360 → User Actions | `/api/admin/users/:uid` | `PATCH` | `SUPER_ADMIN`, `users.update` | CAS Revision Guard | `users` | PASS (`membership = 'Premium'`) |
| `ACT_OPERATOR_ASSIGN` | Platform Ops → Add Operator | `/api/platform/operators` | `POST` | `SUPER_ADMIN` (Recent Auth) | Custom Claims + Audit | `admin_audit_logs` | PASS (`action = 'PLATFORM_OPERATOR_ROLE_CHANGED'`) |
| `ACT_OPERATOR_REVOKE` | Platform Ops → Revoke Sessions | `/api/platform/operators/:uid/revoke-sessions` | `POST` | `SUPER_ADMIN` (Recent Auth) | Session Revoke + Audit | `admin_audit_logs` | PASS (`action = 'PLATFORM_OPERATOR_SESSIONS_REVOKED'`) |
| `ACT_TENANT_SUSPEND` | Enterprise Console → Suspend | `/api/enterprise/platform/tenants/:id/suspend` | `POST` | `SUPER_ADMIN` (Platform Admin) | Relational UPDATE | `enterprise_tenants` | PASS (`lifecycleState = 'SUSPENDED'`) |
| `ACT_TENANT_REACTIVATE` | Enterprise Console → Reactivate | `/api/enterprise/platform/tenants/:id/reactivate` | `POST` | `SUPER_ADMIN` (Platform Admin) | Relational UPDATE | `enterprise_tenants` | PASS (`lifecycleState = 'ACTIVE'`) |

---

## 2. Invariant & Contract Protection Summary

- **Total Mapped Actionable Mutation Routes**: 21
- **Total Primary Administrative Mutation Workflows**: 18
- **Direct MariaDB Assertion Pass Rate**: 100% (21/21 assertions verified)
- **Zero-Trust RBAC Enforcement**:
  - Non-privileged users (`USER`) attempting administrative endpoints receive `HTTP 403 FORBIDDEN` or `HTTP 401 AUTH_REQUIRED`.
  - Unauthenticated callers receive `HTTP 401 AUTH_REQUIRED`.
  - Concurrent writes with stale revisions receive `HTTP 409 CONFLICT`.
