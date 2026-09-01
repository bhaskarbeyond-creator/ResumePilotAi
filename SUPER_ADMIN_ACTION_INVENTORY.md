# Super Admin Action Inventory & Data Lineage Specification

**Authoritative Target Environment**: `https://ai-resume-builder.local/`  
**Execution Mode**: Forensic Super Admin Verification  
**Database Store**: MariaDB (Authoritative Primary Store)  
**Security Standard**: Strict Zero-Trust, CAS Concurrency Control, Zero-Leakage Credential Masking  

---

## 1. Executive Summary & Inventory Scope

This inventory details all actionable controls, endpoints, repositories, and MariaDB relational storage mappings available to the `SUPER_ADMIN` and `ADMIN` roles across the ResumePilot AI administrative plane. Every workflow has been proven end-to-end against live MariaDB row assertions.

---

## 2. Exhaustive Action Inventory (18 Primary Mutation Workflows)

| # | Domain / Feature | UI Control / Trigger | API Endpoint | HTTP Method | Data Flow Pipeline | Authoritative MariaDB Table | Persistence Proof Mode |
|---|---|---|---|---|---|---|---|
| **WF-01** | Promo Coupons | `Create New Coupon` Button | `/api/admin/coupons` | `POST` | React Form → Fetch → `backend/index.js` → `MySQLRepository.saveCoupon` | `coupons` | SQL row count = 1, discount & code matched |
| **WF-02** | Promo Coupons | `Edit Coupon` Modal / Form | `/api/admin/coupons/:code` | `POST` | React Modal → Fetch → `backend/index.js` → `MySQLRepository.saveCoupon` | `coupons` | Revision increment (CAS revision guard) |
| **WF-03** | Promo Coupons | `Delete Coupon` Action | `/api/admin/coupons/:code` | `DELETE` | Row action → Confirm → `backend/index.js` → `MySQLRepository.deleteCoupon` | `coupons` | Row physically removed from table |
| **WF-04** | Subscriptions Settings | `Save Module Configuration` | `/api/admin/settings/modules` | `POST` | Toggle Switches → Fetch → `backend/index.js` → Transactional CAS Lock | `system_settings` (`category = 'public_config'`) | JSON payload updated inside MariaDB transaction |
| **WF-05** | Branding Settings | `Save Branding Configuration` | `/api/admin/settings/branding` | `POST` | Input fields → Fetch → `backend/index.js` → Transactional CAS Lock | `system_settings` (`category = 'public_config'`) | `branding.websiteName` updated in JSON document |
| **WF-06** | AI Admin Governance | `Save AI Provider Settings` | `/api/admin/ai-settings` | `POST` | Provider Dropdown → Key Input → `backend/index.js` → Row Lock | `system_settings` (`category = 'ai_providers'`) | Provider model & keys saved without plain-text echo |
| **WF-07** | Platform Announcements | `Create Platform Announcement` | `/api/platform/announcements` | `POST` | Banner Form → `src/services/api/platform.js` → `backend/routes/platform.js` | `platform_announcements` | Direct row inserted with UUID, severity, title |
| **WF-08** | Platform Announcements | `Delete Platform Announcement` | `/api/platform/announcements/:id` | `DELETE` | Trash Icon → Confirm → `backend/routes/platform.js` → SQL DELETE | `platform_announcements` | Row deleted with CAS revision guard |
| **WF-09** | CMS Blog Management | `Publish / Save Blog Post` | `/api/blog-data/:id` | `POST` | Lexical Editor → Save → `backend/routes/blogData.js` → SQL UPSERT | `blog` | Row upserted with title, slug, HTML content |
| **WF-10** | CMS Blog Management | `Delete Blog Post` | `/api/blog-data/:id` | `DELETE` | Blog Row Trash → Confirm → `backend/routes/blogData.js` → SQL DELETE | `blog` | Row deleted with CAS revision check |
| **WF-11** | Phrase Category Manager | `Save Phrase Categories` | `/api/phrases` | `POST` | Dynamic Phrase Tree → `backend/routes/miscData.js` → Universal Doc Store | `canonical_documents` (`entity_type = 'phrases'`) | Document upserted with category tree |
| **WF-12** | Phrase Category Manager | `Delete Phrase Category` | `/api/phrases/:category` | `DELETE` | Category Delete Button → `backend/routes/miscData.js` → SQL DELETE | `canonical_documents` (`entity_type = 'phrases'`) | Category document deleted from MariaDB |
| **WF-13** | Support Desk | `Create Support Ticket` | `/api/support/tickets` | `POST` | Ticket Form → `src/services/api/support.js` → `backend/routes/support.js` | `support_tickets` | Ticket row created with UUID & status `OPEN` |
| **WF-14** | Support Desk | `Send Staff Reply` | `/api/admin/support/tickets/:id/messages` | `POST` | Reply Box → `backend/routes/support.js` → SQL INSERT | `support_ticket_messages` | Message row inserted linked to ticket ID |
| **WF-15** | Support Desk | `Update Ticket Status` | `/api/admin/support/tickets/:id` | `PATCH` | Status Dropdown → `backend/routes/support.js` → SQL UPDATE | `support_tickets` | Status column updated (`RESOLVED`) |
| **WF-16** | User 360 & Profiles | `Update User Profile / Membership` | `/api/admin/users/:uid` | `PATCH` | User Detail Drawer → Save → `backend/routes/adminUsers.js` | `users` | Membership column updated with revision CAS |
| **WF-17** | Platform Operators | `Assign Operator Role` | `/api/platform/operators` | `POST` | Operator Role Select → `backend/routes/platform.js` → Firebase + Audit | `admin_audit_logs` | Audit record logged (`PLATFORM_OPERATOR_ROLE_CHANGED`) |
| **WF-18** | Enterprise Multi-Tenancy | `Suspend / Reactivate Tenant` | `/api/enterprise/platform/tenants/:id/suspend` | `POST` | Tenant Actions Menu → `backend/enterprise/tenantService.js` | `enterprise_tenants` | `lifecycleState` column toggled (`SUSPENDED` ↔ `ACTIVE`) |

---

## 3. Data Lineage & Concurrency Architecture

1. **Compare-And-Swap (CAS) Concurrency**:
   - Every mutation accepts an `expectedRevision` parameter.
   - If the database revision is not equal to `expectedRevision`, the server rejects the write with `HTTP 409 CONFLICT` (or `ADMIN_SETTINGS_CONFLICT`), preventing silent overwrite of concurrent administrative edits.

2. **Zero-Leakage Credential Masking**:
   - API keys and gateway secrets are written to MariaDB and never echoed back in plain-text to the client.
   - Read surfaces project masked boolean flags (`hasKey: true`) or redacted tokens (`••••••••`).

3. **Audit Ledger Immutability**:
   - All high-severity administrative actions automatically record structured entries in MariaDB `admin_audit_logs`.
   - Audit records track actor UID, IP, user agent, before/after state diffs, and timestamp.
