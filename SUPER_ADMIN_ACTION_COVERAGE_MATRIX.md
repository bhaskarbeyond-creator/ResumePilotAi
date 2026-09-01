# Super Admin Action Coverage & Accounting Matrix

**Authoritative Target Environment**: `https://ai-resume-builder.local/`  
**Execution Standard**: Action-Level Real UI → Real API → Real MariaDB Row Assertion → Page Reload Persistence  
**Date**: September 1, 2026  

---

## 1. Summary of Actions (33 Controls Total)

- **Total Actions Cataloged**: 33
- **Total Direct Database Mutations Verified**: 21
- **Total Read-Only / Diagnostic / Service Operations**: 12
- **Unaccounted Gaps**: **0**

---

## 2. Complete Accounting of the 12 Non-DB Actions

| Action ID | Route & Control | Reason DB Verification Is Not Applicable | Authoritative Side Effect | Independent Verification Method |
|---|---|---|---|---|
| **ACT-RO-01** | `/adm` (Command Center KPI Refresh) | Read-only aggregation query | Reads live MySQL `COUNT(*)` from `users`, `resumes`, `orders` | Verified against direct SQL counts in MariaDB |
| **ACT-RO-02** | `/adm/health` (Health Service Matrix Probe) | Live TCP/HTTP ping across 28 microservices | Probes memory, MariaDB pool, Redis, OpenRouter, Gemini, NVIDIA, Stripe | Verified `GET /api/admin/health` responds with active statuses |
| **ACT-RO-03** | `/adm/security` (Security Audit Log Filter) | Read-only query filter | Filters `admin_audit_logs` and `security_events` by category/date | Verified query parameters match MariaDB index scan |
| **ACT-RO-04** | `/adm/audit` (Audit Log Export CSV) | Client-side CSV stream generation | Neutralizes formula injection (`=`, `@`, `+`, `-`) and triggers browser download | Verified CSV content headers and sanitized cell values |
| **ACT-RO-05** | `/adm/users` (User Directory Search & Filter) | Read-only parameterized query | SQL `WHERE email LIKE ? OR firstname LIKE ?` with pagination | Verified search results match direct SQL query |
| **ACT-RO-06** | `/adm/tenants` (Enterprise Role View Simulation) | Ephemeral client simulation mode | Modifies active UI context view without modifying database user roles | Verified security test `backend/test/enterprise-role-view-simulation.test.js` blocks actual API privilege escalation |
| **ACT-RO-07** | `/adm/ai-governance` (AI Provider Live Test Probe) | Ephemeral external API connectivity probe | Issues single-token completion probe to AI Provider API without DB storage | Verified real API latency, model list, and error normalization |
| **ACT-RO-08** | `/adm/settings` (SMTP Test Email Dispatch) | In-memory outbound SMTP socket transmission | Issues SMTP handshake to mail server (`hostinger` / `gmail`) | Verified nodemailer transport response and error reporting |
| **ACT-RO-09** | `/adm/settings` (PDF Engine Test Render Probe) | In-memory headless Chromium PDF render | Spawns headless browser to render PDF buffer | Verified binary PDF buffer generation without database mutation |
| **ACT-RO-10** | `/adm/support` (Ticket Conversation Message Thread Fetch) | Read-only relational join | Joins `support_tickets` and `support_ticket_messages` | Verified message thread order matches SQL timestamps |
| **ACT-RO-11** | `/adm/blog` (Blog Category List Filter) | Read-only DISTINCT query | Reads distinct categories from `blog` table | Verified list populates dropdown cleanly |
| **ACT-RO-12** | `/adm/subscriptions` (Plan Entitlement Inspection) | Read-only query | Reads active subscription tiers from `public_config` | Verified plan cards match JSON configuration |

---

## 3. Master Matrix of All 21 Direct MariaDB SQL Mutations

| Workflow | UI Action & Route | Endpoint & Method | MariaDB Table(s) | SQL Assertion Performed |
|---|---|---|---|---|
| **WF-01** | Create Coupon (`/adm/subscriptions`) | `POST /api/admin/coupons` | `coupons` | `SELECT code, discount, revision FROM coupons WHERE code = :code` (Assert discount = 50, rev = 1) |
| **WF-02** | Toggle Coupon Active (`/adm/subscriptions`) | `POST /api/admin/coupons/:code` | `coupons` | `SELECT active, revision FROM coupons WHERE code = :code` (Assert active = 0, rev = 2) |
| **WF-03** | Delete Coupon (`/adm/subscriptions`) | `DELETE /api/admin/coupons/:code` | `coupons` | `SELECT COUNT(*) FROM coupons WHERE code = :code` (Assert count = 0) |
| **WF-04** | Update System Modules (`/adm/settings`) | `POST /api/admin/settings/modules` | `system_settings` | `SELECT data FROM system_settings WHERE category = 'public_config'` (Assert module flags) |
| **WF-05** | Update Branding Settings (`/adm/settings`) | `POST /api/admin/settings/branding` | `system_settings` | `SELECT data FROM system_settings WHERE category = 'public_config'` (Assert brand name) |
| **WF-06** | Update AI Provider Keys (`/adm/settings`) | `POST /api/admin/ai-settings` | `system_settings` | `SELECT data FROM system_settings WHERE category = 'ai_providers'` (Assert provider config) |
| **WF-07** | Create Announcement (`/adm/operations`) | `POST /api/platform/announcements` | `platform_announcements` | `SELECT id, title, severity FROM platform_announcements WHERE id = :id` (Assert exists) |
| **WF-08** | Delete Announcement (`/adm/operations`) | `DELETE /api/platform/announcements/:id` | `platform_announcements` | `SELECT COUNT(*) FROM platform_announcements WHERE id = :id` (Assert count = 0) |
| **WF-09** | Save CMS Blog Post (`/adm/blog`) | `POST /api/blog-data/:id` | `blog` | `SELECT slug, title, status FROM blog WHERE slug = :slug` (Assert exists) |
| **WF-10** | Delete CMS Blog Post (`/adm/blog`) | `DELETE /api/blog-data/:id` | `blog` | `SELECT COUNT(*) FROM blog WHERE slug = :slug` (Assert count = 0) |
| **WF-11** | Save Phrase Tree (`/adm/settings`) | `POST /api/phrases/:category` | `canonical_documents` | `SELECT data FROM canonical_documents WHERE entity_id = :id` (Assert JSON data) |
| **WF-12** | Delete Phrase Category (`/adm/settings`) | `DELETE /api/phrases/:category` | `canonical_documents` | `SELECT COUNT(*) FROM canonical_documents WHERE entity_id = :id AND deleted_at IS NULL` (Assert = 0) |
| **WF-13** | Create Support Ticket (`/adm/support`) | `POST /api/admin/support/tickets` | `support_tickets` | `SELECT id, status, subject FROM support_tickets WHERE id = :id` (Assert OPEN) |
| **WF-14** | Reply to Support Ticket (`/adm/support`) | `POST /api/admin/support/tickets/:id/messages` | `support_ticket_messages` | `SELECT id, message FROM support_ticket_messages WHERE ticket_id = :id` (Assert message) |
| **WF-15** | Update Ticket Status (`/adm/support`) | `PATCH /api/admin/support/tickets/:id/status` | `support_tickets` | `SELECT status FROM support_tickets WHERE id = :id` (Assert RESOLVED) |
| **WF-16** | Update User Profile & Role (`/adm/users`) | `PATCH /api/admin/users/:uid` | `users` | `SELECT membership, revision FROM users WHERE id = :uid` (Assert Premium, rev incremented) |
| **WF-17** | Assign Platform Operator (`/adm/operators`) | `POST /api/platform/operators` | `admin_audit_logs` | `SELECT action, target_uid FROM admin_audit_logs WHERE action = 'PLATFORM_OPERATOR_ROLE_CHANGED'` |
| **WF-18** | Suspend Enterprise Tenant (`/adm/tenants`) | `POST /api/enterprise/platform/tenants/:id/suspend` | `enterprise_tenants` | `SELECT lifecycleState FROM enterprise_tenants WHERE id = :id` (Assert SUSPENDED) |
| **WF-19** | Reactivate Enterprise Tenant (`/adm/tenants`) | `POST /api/enterprise/platform/tenants/:id/reactivate` | `enterprise_tenants` | `SELECT lifecycleState FROM enterprise_tenants WHERE id = :id` (Assert ACTIVE) |
| **WF-20** | Save Email SMTP Settings (`/adm/settings`) | `POST /api/admin/settings/email` | `system_settings` | `SELECT data FROM system_settings WHERE category = 'admin_configuration'` (Assert smtp config) |
| **WF-21** | Save Payment Gateway Settings (`/adm/settings`)| `POST /api/admin/settings/payments` | `system_settings` | `SELECT data FROM system_settings WHERE category = 'admin_configuration'` (Assert gateway config) |
