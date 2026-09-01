# Super Admin UI Action & Button Inventory

## Methodology
Every interactive action across the Super Admin Control Plane was inventoried to ensure that:
1. An explicit `onClick` / `onSubmit` handler is attached.
2. The handler dispatches a real API call.
3. Persistent DB mutations occur where appropriate.
4. Loading, success, error, and permission states are rendered.

---

## Interactive Controls Inventory

| Action / Button Name | Page / Location | Component File | onClick / Handler | API Endpoint Dispatched | DB Mutation Target | Role Gate | Status |
|:---|:---|:---|:---|:---|:---|:---:|:---:|
| **Refresh KPIs** | `/adm/dashboard` | `dashboard.jsx:144` | `handleRefresh()` | `GET /api/platform/command-center` | None (Read) | Admin / SA | **OPERATIONAL** |
| **Open Health Matrix** | `/adm/dashboard` | `dashboard.jsx:151` | React Router `<Link>` | `GET /api/platform/operational-status` | None (Read) | Admin / SA | **OPERATIONAL** |
| **Filter KPI Range** | `/adm/dashboard` | `dashboard.jsx:158` | `setTimeRange(val)` | `GET /api/platform/command-center?range=`| None (Read) | Admin / SA | **OPERATIONAL** |
| **Search Users** | `/adm/users` | `UsersManager.jsx:320` | `setSearchTerm(val)` | `GET /api/admin/users?search=` | None (Read) | Admin / SA | **OPERATIONAL** |
| **Filter User Role** | `/adm/users` | `UsersManager.jsx:340` | `setRoleFilter(val)` | `GET /api/admin/users?role=` | None (Read) | Admin / SA | **OPERATIONAL** |
| **Export Users CSV** | `/adm/users` | `UsersManager.jsx:428` | `handleExportCsv()` | Client-side CSV generation | None (Read) | Admin / SA | **OPERATIONAL** |
| **Provision User** | `/adm/users` | `UsersManager.jsx:435` | `setShowAddModal(true)`| `POST /api/admin/users/create` | `users` table | SA Only | **OPERATIONAL** |
| **Suspend User** | `/adm/users` | `UsersManager.jsx:510` | `handleSuspend(uid)` | `POST /api/admin/users/:uid/suspend` | `users.status` | SA Only | **OPERATIONAL** |
| **Open User 360** | `/adm/users` | `UsersManager.jsx:530` | `setSelectedUser(u)` | `GET /api/admin/users/:uid/details` | None (Read) | Admin / SA | **OPERATIONAL** |
| **Create Tenant** | `/adm/tenants` | `PlatformTenants.jsx:628`| `handleCreateTenant()`| `POST /api/enterprise/platform/tenants`| `enterprise_tenants` | SA Only | **OPERATIONAL** |
| **Refresh Health** | `/adm/health` | `PlatformHealth.jsx:228` | `fetchHealth()` | `GET /api/platform/operational-status` | None (Read) | Admin / SA | **OPERATIONAL** |
| **Acknowledge Alert** | `/adm/attention` | `PlatformAttention.jsx:110`| `handleAck(id)` | `POST /api/platform/attention/ack` | `security_alerts` | Admin / SA | **OPERATIONAL** |
| **Toggle Maintenance**| `/adm/operations`| `PlatformOperations.jsx:190`| `toggleMaintenance()`| `POST /api/platform/maintenance` | `system_settings` | SA Recent Auth | **OPERATIONAL** |
| **Assign Operator** | `/adm/operators` | `PlatformOperators.jsx:310`| `handleAssignRole()` | `POST /api/platform/operators/assign` | Firebase Claims | SA Only | **OPERATIONAL** |
| **Replay DLQ** | `/adm/queues` | `PlatformQueues.jsx:174` | `handleReplayDlq()` | `POST /api/platform/queues/dlq/replay` | `enterprise_outbox`| SA Only | **OPERATIONAL** |
| **Purge DLQ** | `/adm/queues` | `PlatformQueues.jsx:183` | `handlePurgeDlq()` | `DELETE /api/platform/queues/dlq` | `enterprise_outbox`| SA Only | **OPERATIONAL** |
| **Export Audit Logs** | `/adm/audit-logs`| `AdminAuditLogs.jsx:155` | `handleExportCsv()` | Client-side CSV generation | None (Read) | Admin / SA | **OPERATIONAL** |
| **Reply Ticket** | `/adm/helpdesk` | `HelpDesk.jsx:215` | `handleSendReply()` | `POST /api/admin/support/reply` | `support_tickets` | Support / SA | **OPERATIONAL** |
| **Save 31 Settings** | `/adm/settings` | `Settings.jsx:450` | `handleSaveSettings()`| `POST /api/admin/settings/*` | `system_settings` | Scoped Admin/SA| **OPERATIONAL** |
| **Save Blog Draft** | `/blog-editor` | `BlogEditor.jsx:285` | `handleSave('draft')` | `POST /api/blog-data/:id` | `canonical_documents`| Admin / SA | **OPERATIONAL** |
| **Publish Blog Post** | `/blog-editor` | `BlogEditor.jsx:295` | `handleSave('published')`| `POST /api/blog-data/:id` | `canonical_documents`| Admin / SA | **OPERATIONAL** |
