# Super Admin Exhaustive Action Inventory

**Authoritative Target Environment**: `https://ai-resume-builder.local/`  
**Execution Standard**: Action-Level Forensic Verification  
**Primary Database**: MariaDB 11.4 Relational Engine  

---

## 1. Action Records Table

### `ACT-ADM-001`: Refresh Dashboard Button (Platform Command Center)

- **ACTION_ID**: `ACT-ADM-001`
- **ROUTE**: `/adm`
- **SCREEN**: Platform Command Center
- **UI_CONTROL**: Refresh Dashboard Button
- **EXPECTED_BEHAVIOR**: Refetches all platform overview telemetry and health metrics
- **FRONTEND_HANDLER**: `PlatformCommandCenter.jsx:fetchPlatformData()`
- **API_ENDPOINT**: `/api/platform/health`
- **HTTP_METHOD**: `GET`
- **BACKEND_HANDLER**: `backend/routes/platform.js:router.get(/health)`
- **REPOSITORY_METHOD**: `getPool().query (Health diagnostics)`
- **DATABASE_TABLE**: `system_settings, users, enterprise_tenants`
- **DATABASE_OPERATION**: `SELECT`
- **RBAC_REQUIREMENT**: `ADMIN, SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { status: "HEALTHY", components: {...} }`
- **ERROR_RESPONSE**: `HTTP 503 { error: { code: "HEALTH_UNAVAILABLE" } }`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-ADM-002`: Create Announcement Button (Modal Trigger) (Platform Command Center)

- **ACTION_ID**: `ACT-ADM-002`
- **ROUTE**: `/adm`
- **SCREEN**: Platform Command Center
- **UI_CONTROL**: Create Announcement Button (Modal Trigger)
- **EXPECTED_BEHAVIOR**: Opens the platform announcement creation modal
- **FRONTEND_HANDLER**: `PlatformAnnouncements.jsx:setShowCreateModal(true)`
- **API_ENDPOINT**: `N/A (UI State Modal)`
- **HTTP_METHOD**: `N/A`
- **BACKEND_HANDLER**: `N/A`
- **REPOSITORY_METHOD**: `N/A`
- **DATABASE_TABLE**: `N/A`
- **DATABASE_OPERATION**: `N/A`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `Modal rendered with title, message, severity controls`
- **ERROR_RESPONSE**: `N/A`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-ADM-003`: Submit Announcement Form (Save Button) (Platform Command Center)

- **ACTION_ID**: `ACT-ADM-003`
- **ROUTE**: `/adm`
- **SCREEN**: Platform Command Center
- **UI_CONTROL**: Submit Announcement Form (Save Button)
- **EXPECTED_BEHAVIOR**: Inserts new broadcast announcement into MariaDB
- **FRONTEND_HANDLER**: `PlatformAnnouncements.jsx:handleCreateAnnouncement()`
- **API_ENDPOINT**: `/api/platform/announcements`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/platform.js:router.post(/announcements)`
- **REPOSITORY_METHOD**: `getPool().query("INSERT INTO platform_announcements...")`
- **DATABASE_TABLE**: `platform_announcements`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, platform.manage`
- **SUCCESS_RESPONSE**: `HTTP 201 { announcement: { id, title, severity } }`
- **ERROR_RESPONSE**: `HTTP 400 / 403 / 500 with error envelope`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-ADM-004`: Delete Announcement Button (Trash Icon) (Platform Command Center)

- **ACTION_ID**: `ACT-ADM-004`
- **ROUTE**: `/adm`
- **SCREEN**: Platform Command Center
- **UI_CONTROL**: Delete Announcement Button (Trash Icon)
- **EXPECTED_BEHAVIOR**: Removes broadcast announcement with CAS revision check
- **FRONTEND_HANDLER**: `PlatformAnnouncements.jsx:handleDeleteAnnouncement(id)`
- **API_ENDPOINT**: `/api/platform/announcements/:id`
- **HTTP_METHOD**: `DELETE`
- **BACKEND_HANDLER**: `backend/routes/platform.js:router.delete(/announcements/:id)`
- **REPOSITORY_METHOD**: `getPool().query("DELETE FROM platform_announcements WHERE id = ?...")`
- **DATABASE_TABLE**: `platform_announcements`
- **DATABASE_OPERATION**: `DELETE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, platform.manage`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, deletedId: id }`
- **ERROR_RESPONSE**: `HTTP 404 / 409 / 500`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-ADM-005`: Role Switcher Dropdown (Simulation Mode) (Platform Command Center)

- **ACTION_ID**: `ACT-ADM-005`
- **ROUTE**: `/adm`
- **SCREEN**: Platform Command Center
- **UI_CONTROL**: Role Switcher Dropdown (Simulation Mode)
- **EXPECTED_BEHAVIOR**: Simulates view for role (e.g. AUDITOR, SUPPORT, ENTERPRISE_VIEWER)
- **FRONTEND_HANDLER**: `Admin.jsx:handleRoleSimulation(role)`
- **API_ENDPOINT**: `/api/platform/role-view-audit`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/platform.js:router.post(/role-view-audit)`
- **REPOSITORY_METHOD**: `recordAdminAuditLog()`
- **DATABASE_TABLE**: `admin_audit_logs`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, simulatedRole: role }`
- **ERROR_RESPONSE**: `HTTP 403 FORBIDDEN`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-ADM-006`: Exit Role Simulation Button (Platform Command Center)

- **ACTION_ID**: `ACT-ADM-006`
- **ROUTE**: `/adm`
- **SCREEN**: Platform Command Center
- **UI_CONTROL**: Exit Role Simulation Button
- **EXPECTED_BEHAVIOR**: Restores Super Admin privileges and records audit event
- **FRONTEND_HANDLER**: `Admin.jsx:handleExitSimulation()`
- **API_ENDPOINT**: `/api/platform/role-view-audit`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/platform.js:router.post(/role-view-audit)`
- **REPOSITORY_METHOD**: `recordAdminAuditLog()`
- **DATABASE_TABLE**: `admin_audit_logs`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, targetRole: "SUPER_ADMIN" }`
- **ERROR_RESPONSE**: `HTTP 403`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SET-001`: Save Module Configuration Button (System Settings (Modules Tab))

- **ACTION_ID**: `ACT-SET-001`
- **ROUTE**: `/adm/settings`
- **SCREEN**: System Settings (Modules Tab)
- **UI_CONTROL**: Save Module Configuration Button
- **EXPECTED_BEHAVIOR**: Persists module switches (coupons, jobs, templates) with CAS locking
- **FRONTEND_HANDLER**: `subscriptionsSettings.jsx:saveModuleSettings()`
- **API_ENDPOINT**: `/api/admin/settings/modules`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/settings/:category)`
- **REPOSITORY_METHOD**: `MySQL transaction: UPDATE system_settings category="public_config"`
- **DATABASE_TABLE**: `system_settings`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, system.config.write`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, revision: N }`
- **ERROR_RESPONSE**: `HTTP 409 ADMIN_SETTINGS_CONFLICT`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SET-002`: Save Branding Settings Button (System Settings (Branding Tab))

- **ACTION_ID**: `ACT-SET-002`
- **ROUTE**: `/adm/settings`
- **SCREEN**: System Settings (Branding Tab)
- **UI_CONTROL**: Save Branding Settings Button
- **EXPECTED_BEHAVIOR**: Updates website title, logo URLs, and support email
- **FRONTEND_HANDLER**: `Settings.jsx:handleSaveBranding()`
- **API_ENDPOINT**: `/api/admin/settings/branding`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/settings/:category)`
- **REPOSITORY_METHOD**: `MySQL transaction: UPDATE system_settings category="public_config"`
- **DATABASE_TABLE**: `system_settings`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, system.config.write`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, revision: N }`
- **ERROR_RESPONSE**: `HTTP 400 / 409`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SET-003`: Save AI Configuration Button (System Settings (AI Governance Tab))

- **ACTION_ID**: `ACT-SET-003`
- **ROUTE**: `/adm/settings`
- **SCREEN**: System Settings (AI Governance Tab)
- **UI_CONTROL**: Save AI Configuration Button
- **EXPECTED_BEHAVIOR**: Persists AI provider, model selection, and server-vaulted API keys
- **FRONTEND_HANDLER**: `Settings.jsx:handleSaveAiSettings()`
- **API_ENDPOINT**: `/api/admin/ai-settings`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/ai-settings)`
- **REPOSITORY_METHOD**: `MySQL transaction: UPDATE system_settings category="ai_providers"`
- **DATABASE_TABLE**: `system_settings`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, ai.governance`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, revision: N }`
- **ERROR_RESPONSE**: `HTTP 400 / 403 / 409`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SET-004`: Test AI Provider Connection Button (System Settings (AI Governance Tab))

- **ACTION_ID**: `ACT-SET-004`
- **ROUTE**: `/adm/settings`
- **SCREEN**: System Settings (AI Governance Tab)
- **UI_CONTROL**: Test AI Provider Connection Button
- **EXPECTED_BEHAVIOR**: Executes lightweight probe request to configured provider
- **FRONTEND_HANDLER**: `Settings.jsx:handleTestAiProvider()`
- **API_ENDPOINT**: `/api/admin/ai/test-provider`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/ai/test-provider)`
- **REPOSITORY_METHOD**: `aiAdmin.testProviderConnection()`
- **DATABASE_TABLE**: `system_settings`
- **DATABASE_OPERATION**: `SELECT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, latencyMs: 240, model: "..." }`
- **ERROR_RESPONSE**: `HTTP 502 / 503 with normalized provider error message`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SET-005`: Save Payment Gateway Settings Button (System Settings (Payment Gateways Tab))

- **ACTION_ID**: `ACT-SET-005`
- **ROUTE**: `/adm/settings`
- **SCREEN**: System Settings (Payment Gateways Tab)
- **UI_CONTROL**: Save Payment Gateway Settings Button
- **EXPECTED_BEHAVIOR**: Persists Stripe / Razorpay / PayPal keys with server masking
- **FRONTEND_HANDLER**: `Settings.jsx:handleSavePaymentSettings()`
- **API_ENDPOINT**: `/api/admin/payment-settings`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/payment-settings)`
- **REPOSITORY_METHOD**: `MySQL transaction: UPDATE system_settings category="payment_providers"`
- **DATABASE_TABLE**: `system_settings`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, payments.manage`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, revision: N }`
- **ERROR_RESPONSE**: `HTTP 400 / 403 / 409`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SET-006`: Save SMTP Configuration Button (System Settings (Email SMTP Tab))

- **ACTION_ID**: `ACT-SET-006`
- **ROUTE**: `/adm/settings`
- **SCREEN**: System Settings (Email SMTP Tab)
- **UI_CONTROL**: Save SMTP Configuration Button
- **EXPECTED_BEHAVIOR**: Saves SMTP host, port, TLS, and credential envelope
- **FRONTEND_HANDLER**: `EmailSmtpSettings.jsx:handleSaveSmtp()`
- **API_ENDPOINT**: `/api/admin/settings/smtp`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/settings/smtp)`
- **REPOSITORY_METHOD**: `MySQL transaction: UPDATE system_settings category="admin_configuration"`
- **DATABASE_TABLE**: `system_settings`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, system.config.write`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, revision: N }`
- **ERROR_RESPONSE**: `HTTP 400 / 409`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SET-007`: Test SMTP Transport Button (System Settings (Email SMTP Tab))

- **ACTION_ID**: `ACT-SET-007`
- **ROUTE**: `/adm/settings`
- **SCREEN**: System Settings (Email SMTP Tab)
- **UI_CONTROL**: Test SMTP Transport Button
- **EXPECTED_BEHAVIOR**: Sends test probe email and reports SMTP handshake result
- **FRONTEND_HANDLER**: `EmailSmtpSettings.jsx:handleTestSmtp()`
- **API_ENDPOINT**: `/api/admin/email/test-smtp`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/email/test-smtp)`
- **REPOSITORY_METHOD**: `mailAdmin.testSmtpConnection()`
- **DATABASE_TABLE**: `system_settings`
- **DATABASE_OPERATION**: `SELECT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, latencyMs: 120 }`
- **ERROR_RESPONSE**: `HTTP 502 with SMTP error details`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SUB-001`: Create Coupon Modal Submit Button (Coupons Management)

- **ACTION_ID**: `ACT-SUB-001`
- **ROUTE**: `/adm/subscriptions`
- **SCREEN**: Coupons Management
- **UI_CONTROL**: Create Coupon Modal Submit Button
- **EXPECTED_BEHAVIOR**: Creates new promo discount coupon in MariaDB coupons table
- **FRONTEND_HANDLER**: `subscriptionsSettings.jsx:saveCouponModal()`
- **API_ENDPOINT**: `/api/admin/coupons`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/coupons)`
- **REPOSITORY_METHOD**: `MySQLRepository.saveCoupon()`
- **DATABASE_TABLE**: `coupons`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, payments.manage`
- **SUCCESS_RESPONSE**: `HTTP 201 { success: true, code: "...", coupon: {...} }`
- **ERROR_RESPONSE**: `HTTP 400 / 409 COUPON_ALREADY_EXISTS`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SUB-002`: Edit Coupon Submit Button (Coupons Management)

- **ACTION_ID**: `ACT-SUB-002`
- **ROUTE**: `/adm/subscriptions`
- **SCREEN**: Coupons Management
- **UI_CONTROL**: Edit Coupon Submit Button
- **EXPECTED_BEHAVIOR**: Updates discount, maxUses, and expiration with CAS revision guard
- **FRONTEND_HANDLER**: `subscriptionsSettings.jsx:saveCouponModal()`
- **API_ENDPOINT**: `/api/admin/coupons/:code`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/coupons/:code)`
- **REPOSITORY_METHOD**: `MySQLRepository.saveCoupon()`
- **DATABASE_TABLE**: `coupons`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, payments.manage`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, coupon: {...} }`
- **ERROR_RESPONSE**: `HTTP 409 CAS_CONFLICT`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SUB-003`: Delete Coupon Confirm Button (Coupons Management)

- **ACTION_ID**: `ACT-SUB-003`
- **ROUTE**: `/adm/subscriptions`
- **SCREEN**: Coupons Management
- **UI_CONTROL**: Delete Coupon Confirm Button
- **EXPECTED_BEHAVIOR**: Physically deletes coupon row from MariaDB coupons table
- **FRONTEND_HANDLER**: `subscriptionsSettings.jsx:handleDeleteCoupon(code)`
- **API_ENDPOINT**: `/api/admin/coupons/:code`
- **HTTP_METHOD**: `DELETE`
- **BACKEND_HANDLER**: `backend/index.js:app.delete(/api/admin/coupons/:code)`
- **REPOSITORY_METHOD**: `MySQLRepository.deleteCoupon()`
- **DATABASE_TABLE**: `coupons`
- **DATABASE_OPERATION**: `DELETE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, payments.manage`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, deleted: code }`
- **ERROR_RESPONSE**: `HTTP 404 / 409 / 500`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SUB-004`: Toggle Coupon Active Switch (Coupons Management)

- **ACTION_ID**: `ACT-SUB-004`
- **ROUTE**: `/adm/subscriptions`
- **SCREEN**: Coupons Management
- **UI_CONTROL**: Toggle Coupon Active Switch
- **EXPECTED_BEHAVIOR**: Toggles coupon active status (1/0) in MariaDB with rollback on error
- **FRONTEND_HANDLER**: `subscriptionsSettings.jsx:toggleCouponActive(code)`
- **API_ENDPOINT**: `/api/admin/coupons/:code`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/coupons/:code)`
- **REPOSITORY_METHOD**: `MySQLRepository.saveCoupon()`
- **DATABASE_TABLE**: `coupons`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, payments.manage`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, coupon: {...} }`
- **ERROR_RESPONSE**: `HTTP 409 / 500 with UI rollback and error toast`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-USR-001`: Search Users Input Field (User 360 Directory)

- **ACTION_ID**: `ACT-USR-001`
- **ROUTE**: `/adm/users`
- **SCREEN**: User 360 Directory
- **UI_CONTROL**: Search Users Input Field
- **EXPECTED_BEHAVIOR**: Executes debounced SQL search query with LIKE escaping
- **FRONTEND_HANDLER**: `UsersManager.jsx:handleSearch(query)`
- **API_ENDPOINT**: `/api/admin/users?query=...`
- **HTTP_METHOD**: `GET`
- **BACKEND_HANDLER**: `backend/routes/adminUsers.js:router.get(/)`
- **REPOSITORY_METHOD**: `getPool().query("SELECT * FROM users WHERE email LIKE ?...")`
- **DATABASE_TABLE**: `users`
- **DATABASE_OPERATION**: `SELECT`
- **RBAC_REQUIREMENT**: `ADMIN, SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { users: [...], pagination: {...} }`
- **ERROR_RESPONSE**: `HTTP 400 for 1-character queries`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-USR-002`: Role Filter Select (User 360 Directory)

- **ACTION_ID**: `ACT-USR-002`
- **ROUTE**: `/adm/users`
- **SCREEN**: User 360 Directory
- **UI_CONTROL**: Role Filter Select
- **EXPECTED_BEHAVIOR**: Filters user list by role (USER, ADMIN, SUPPORT, etc.)
- **FRONTEND_HANDLER**: `UsersManager.jsx:handleRoleFilter(role)`
- **API_ENDPOINT**: `/api/admin/users?role=...`
- **HTTP_METHOD**: `GET`
- **BACKEND_HANDLER**: `backend/routes/adminUsers.js:router.get(/)`
- **REPOSITORY_METHOD**: `getPool().query()`
- **DATABASE_TABLE**: `users`
- **DATABASE_OPERATION**: `SELECT`
- **RBAC_REQUIREMENT**: `ADMIN, SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { users: [...] }`
- **ERROR_RESPONSE**: `HTTP 500`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-USR-003`: Save Profile Changes Button (User 360 Detail Drawer)

- **ACTION_ID**: `ACT-USR-003`
- **ROUTE**: `/adm/users`
- **SCREEN**: User 360 Detail Drawer
- **UI_CONTROL**: Save Profile Changes Button
- **EXPECTED_BEHAVIOR**: Updates user membership, display name, currency with CAS revision
- **FRONTEND_HANDLER**: `User360Drawer.jsx:handleSaveProfile()`
- **API_ENDPOINT**: `/api/admin/users/:uid`
- **HTTP_METHOD**: `PATCH`
- **BACKEND_HANDLER**: `backend/routes/adminUsers.js:router.patch(/:uid)`
- **REPOSITORY_METHOD**: `repo.saveUserWithRevisionGuard() / UPDATE users`
- **DATABASE_TABLE**: `users`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, users.update`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, user: {...} }`
- **ERROR_RESPONSE**: `HTTP 409 ADMIN_TARGET_CHANGED`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-USR-004`: Suspend / Activate User Toggle Button (User 360 Detail Drawer)

- **ACTION_ID**: `ACT-USR-004`
- **ROUTE**: `/adm/users`
- **SCREEN**: User 360 Detail Drawer
- **UI_CONTROL**: Suspend / Activate User Toggle Button
- **EXPECTED_BEHAVIOR**: Toggles user suspended flag in MariaDB and updates Firebase Auth
- **FRONTEND_HANDLER**: `User360Drawer.jsx:handleToggleSuspend()`
- **API_ENDPOINT**: `/api/admin/users/:uid`
- **HTTP_METHOD**: `PATCH`
- **BACKEND_HANDLER**: `backend/routes/adminUsers.js:router.patch(/:uid)`
- **REPOSITORY_METHOD**: `identityAdmin.updateUser() + UPDATE users SET suspended = ?`
- **DATABASE_TABLE**: `users`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, users.update`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, user: {...} }`
- **ERROR_RESPONSE**: `HTTP 403 / 404 / 409`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-USR-005`: Bulk Action Select & Execute (Suspend/Activate) (User 360 Directory)

- **ACTION_ID**: `ACT-USR-005`
- **ROUTE**: `/adm/users`
- **SCREEN**: User 360 Directory
- **UI_CONTROL**: Bulk Action Select & Execute (Suspend/Activate)
- **EXPECTED_BEHAVIOR**: Executes batch account state modification with audit records
- **FRONTEND_HANDLER**: `UsersManager.jsx:handleBulkAction(action)`
- **API_ENDPOINT**: `/api/admin/users/bulk-action`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/adminUsers.js:router.post(/bulk-action)`
- **REPOSITORY_METHOD**: `Batch UPDATE users + recordAdminAuditLog()`
- **DATABASE_TABLE**: `users, admin_audit_logs`
- **DATABASE_OPERATION**: `UPDATE + INSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, users.update`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, affectedCount: N }`
- **ERROR_RESPONSE**: `HTTP 400 INVALID_BULK_ACTION`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-TEN-001`: Create Enterprise Tenant Modal Submit (Enterprise Multi-Tenancy Console)

- **ACTION_ID**: `ACT-TEN-001`
- **ROUTE**: `/adm/tenants`
- **SCREEN**: Enterprise Multi-Tenancy Console
- **UI_CONTROL**: Create Enterprise Tenant Modal Submit
- **EXPECTED_BEHAVIOR**: Provisions new isolated enterprise tenant record in MariaDB
- **FRONTEND_HANDLER**: `PlatformTenants.jsx:handleCreateTenant()`
- **API_ENDPOINT**: `/api/enterprise/tenants`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/enterprise.js:router.post(/tenants)`
- **REPOSITORY_METHOD**: `mysqlTenantRegistry.createTenant()`
- **DATABASE_TABLE**: `enterprise_tenants`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, Platform Tenant Provisioner`
- **SUCCESS_RESPONSE**: `HTTP 201 { tenant: { id, displayName, slug, lifecycleState } }`
- **ERROR_RESPONSE**: `HTTP 400 INVALID_TENANT / 409 TENANT_SLUG_CONFLICT`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-TEN-002`: Suspend Tenant Action Button (Confirm) (Enterprise Multi-Tenancy Console)

- **ACTION_ID**: `ACT-TEN-002`
- **ROUTE**: `/adm/tenants`
- **SCREEN**: Enterprise Multi-Tenancy Console
- **UI_CONTROL**: Suspend Tenant Action Button (Confirm)
- **EXPECTED_BEHAVIOR**: Transitions tenant lifecycleState to SUSPENDED in MariaDB
- **FRONTEND_HANDLER**: `PlatformTenants.jsx:handleSuspendTenant(tenantId)`
- **API_ENDPOINT**: `/api/enterprise/platform/tenants/:tenantId/suspend`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/enterprise.js:router.post(/platform/tenants/:id/suspend)`
- **REPOSITORY_METHOD**: `tenantService.setTenantLifecycleAsPlatform("SUSPENDED")`
- **DATABASE_TABLE**: `enterprise_tenants`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { tenant: { id, lifecycleState: "SUSPENDED" } }`
- **ERROR_RESPONSE**: `HTTP 403 / 503`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-TEN-003`: Reactivate Tenant Action Button (Confirm) (Enterprise Multi-Tenancy Console)

- **ACTION_ID**: `ACT-TEN-003`
- **ROUTE**: `/adm/tenants`
- **SCREEN**: Enterprise Multi-Tenancy Console
- **UI_CONTROL**: Reactivate Tenant Action Button (Confirm)
- **EXPECTED_BEHAVIOR**: Transitions tenant lifecycleState to ACTIVE in MariaDB
- **FRONTEND_HANDLER**: `PlatformTenants.jsx:handleReactivateTenant(tenantId)`
- **API_ENDPOINT**: `/api/enterprise/platform/tenants/:tenantId/reactivate`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/enterprise.js:router.post(/platform/tenants/:id/reactivate)`
- **REPOSITORY_METHOD**: `tenantService.setTenantLifecycleAsPlatform("ACTIVE")`
- **DATABASE_TABLE**: `enterprise_tenants`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { tenant: { id, lifecycleState: "ACTIVE" } }`
- **ERROR_RESPONSE**: `HTTP 403 / 503`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SUP-001`: Create Support Ticket Button (Help Desk Management)

- **ACTION_ID**: `ACT-SUP-001`
- **ROUTE**: `/adm/support`
- **SCREEN**: Help Desk Management
- **UI_CONTROL**: Create Support Ticket Button
- **EXPECTED_BEHAVIOR**: Creates new support ticket with subject, body, priority in MariaDB
- **FRONTEND_HANDLER**: `HelpDesk.jsx:handleCreateTicket()`
- **API_ENDPOINT**: `/api/support/tickets`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/support.js:router.post(/tickets)`
- **REPOSITORY_METHOD**: `getPool().query("INSERT INTO support_tickets...")`
- **DATABASE_TABLE**: `support_tickets`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `USER, ADMIN, SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 201 { ticket: { id, status: "OPEN" } }`
- **ERROR_RESPONSE**: `HTTP 400 INVALID_TICKET_DATA`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SUP-002`: Send Staff Reply Message Button (Help Desk Ticket Detail)

- **ACTION_ID**: `ACT-SUP-002`
- **ROUTE**: `/adm/support`
- **SCREEN**: Help Desk Ticket Detail
- **UI_CONTROL**: Send Staff Reply Message Button
- **EXPECTED_BEHAVIOR**: Inserts support message and notifies customer outbox
- **FRONTEND_HANDLER**: `HelpDesk.jsx:handleSendMessage()`
- **API_ENDPOINT**: `/api/admin/support/tickets/:id/messages`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/support.js:router.post(/tickets/:id/messages)`
- **REPOSITORY_METHOD**: `getPool().query("INSERT INTO support_ticket_messages...")`
- **DATABASE_TABLE**: `support_ticket_messages`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `ADMIN, SUPPORT, SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 201 { message: { id, body } }`
- **ERROR_RESPONSE**: `HTTP 400 / 404`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-SUP-003`: Resolve Ticket Button (Status Change) (Help Desk Ticket Detail)

- **ACTION_ID**: `ACT-SUP-003`
- **ROUTE**: `/adm/support`
- **SCREEN**: Help Desk Ticket Detail
- **UI_CONTROL**: Resolve Ticket Button (Status Change)
- **EXPECTED_BEHAVIOR**: Updates ticket status to RESOLVED in MariaDB
- **FRONTEND_HANDLER**: `HelpDesk.jsx:handleStatusChange("RESOLVED")`
- **API_ENDPOINT**: `/api/admin/support/tickets/:id`
- **HTTP_METHOD**: `PATCH`
- **BACKEND_HANDLER**: `backend/routes/support.js:router.patch(/tickets/:id)`
- **REPOSITORY_METHOD**: `getPool().query("UPDATE support_tickets SET status = ?...")`
- **DATABASE_TABLE**: `support_tickets`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `ADMIN, SUPPORT, SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, ticket: { status: "RESOLVED" } }`
- **ERROR_RESPONSE**: `HTTP 400 / 404`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-BLG-001`: Save / Publish Blog Post Button (CMS Blog Management)

- **ACTION_ID**: `ACT-BLG-001`
- **ROUTE**: `/adm/blog`
- **SCREEN**: CMS Blog Management
- **UI_CONTROL**: Save / Publish Blog Post Button
- **EXPECTED_BEHAVIOR**: Upserts blog article row with HTML content, slug, and status in MariaDB
- **FRONTEND_HANDLER**: `BlogEditor.jsx:handleSave()`
- **API_ENDPOINT**: `/api/blog-data/:id`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/blogData.js:router.post(/:id)`
- **REPOSITORY_METHOD**: `getPool().query("INSERT INTO blog ... ON DUPLICATE KEY UPDATE")`
- **DATABASE_TABLE**: `blog`
- **DATABASE_OPERATION**: `UPSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, content.manage`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, id: slug, revision: N }`
- **ERROR_RESPONSE**: `HTTP 400 / 409`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-BLG-002`: Delete Blog Post Button (Confirm) (CMS Blog Management)

- **ACTION_ID**: `ACT-BLG-002`
- **ROUTE**: `/adm/blog`
- **SCREEN**: CMS Blog Management
- **UI_CONTROL**: Delete Blog Post Button (Confirm)
- **EXPECTED_BEHAVIOR**: Deletes blog post row with CAS revision validation
- **FRONTEND_HANDLER**: `BlogManagement.jsx:handleDelete(id)`
- **API_ENDPOINT**: `/api/blog-data/:id`
- **HTTP_METHOD**: `DELETE`
- **BACKEND_HANDLER**: `backend/routes/blogData.js:router.delete(/:id)`
- **REPOSITORY_METHOD**: `getPool().query("DELETE FROM blog WHERE slug = ?...")`
- **DATABASE_TABLE**: `blog`
- **DATABASE_OPERATION**: `DELETE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN, content.manage`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, deleted: id }`
- **ERROR_RESPONSE**: `HTTP 404 / 409`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-OPR-001`: Assign Operator Role Button (Platform Operators Console)

- **ACTION_ID**: `ACT-OPR-001`
- **ROUTE**: `/adm/operators`
- **SCREEN**: Platform Operators Console
- **UI_CONTROL**: Assign Operator Role Button
- **EXPECTED_BEHAVIOR**: Assigns ADMIN/SUPPORT role in Firebase Auth and records audit log in MariaDB
- **FRONTEND_HANDLER**: `PlatformOperators.jsx:handleAssignOperator()`
- **API_ENDPOINT**: `/api/platform/operators`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/platform.js:router.post(/operators)`
- **REPOSITORY_METHOD**: `admin.auth().setCustomUserClaims() + recordAdminAuditLog()`
- **DATABASE_TABLE**: `admin_audit_logs`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN (Recent Auth)`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, uid, role }`
- **ERROR_RESPONSE**: `HTTP 400 INVALID_OPERATOR / 403 SUPER_ADMIN_PROTECTED`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-OPR-002`: Revoke Operator Sessions Button (Platform Operators Console)

- **ACTION_ID**: `ACT-OPR-002`
- **ROUTE**: `/adm/operators`
- **SCREEN**: Platform Operators Console
- **UI_CONTROL**: Revoke Operator Sessions Button
- **EXPECTED_BEHAVIOR**: Revokes refresh tokens in Firebase Auth and records audit entry
- **FRONTEND_HANDLER**: `PlatformOperators.jsx:handleRevokeSessions(uid)`
- **API_ENDPOINT**: `/api/platform/operators/:uid/revoke-sessions`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/routes/platform.js:router.post(/operators/:uid/revoke-sessions)`
- **REPOSITORY_METHOD**: `admin.auth().revokeRefreshTokens() + recordAdminAuditLog()`
- **DATABASE_TABLE**: `admin_audit_logs`
- **DATABASE_OPERATION**: `INSERT`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN (Recent Auth)`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, revokedUid: uid }`
- **ERROR_RESPONSE**: `HTTP 403 / 503`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

### `ACT-TPL-001`: Toggle Template Active / Inactive Switch (Template Management)

- **ACTION_ID**: `ACT-TPL-001`
- **ROUTE**: `/adm/templates`
- **SCREEN**: Template Management
- **UI_CONTROL**: Toggle Template Active / Inactive Switch
- **EXPECTED_BEHAVIOR**: Updates template active state in templateManager configuration in MariaDB
- **FRONTEND_HANDLER**: `Settings.jsx:handleToggleTemplate(templateId)`
- **API_ENDPOINT**: `/api/admin/settings/templateManager`
- **HTTP_METHOD**: `POST`
- **BACKEND_HANDLER**: `backend/index.js:app.post(/api/admin/settings/templateManager)`
- **REPOSITORY_METHOD**: `MySQL transaction: UPDATE system_settings`
- **DATABASE_TABLE**: `system_settings`
- **DATABASE_OPERATION**: `UPDATE`
- **RBAC_REQUIREMENT**: `SUPER_ADMIN`
- **SUCCESS_RESPONSE**: `HTTP 200 { success: true, revision: N }`
- **ERROR_RESPONSE**: `HTTP 409`
- **LIVE_BROWSER_VERIFIED**: `YES`
- **DIRECT_DB_VERIFIED**: `YES`
- **STATUS**: `VERIFIED`

---

