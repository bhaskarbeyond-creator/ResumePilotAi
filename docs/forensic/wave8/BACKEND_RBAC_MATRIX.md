# Backend RBAC Matrix — Wave 8 Forensic Scan

Scanned 20 source files. Found **339 explicit route handlers** plus **0 mounted router prefixes**.

## Summary

| Classification | Count | % |
|---|---:|---:|
| public | 307 | 90.6% |
| auth-required | 9 | 2.7% |
| admin-gated | 23 | 6.8% |

## Top-level Router Mounts (app.use)

| Prefix | Classification | Middleware (abbreviated) |
|---|---|---|

## All Route Handlers

| Method | Path | Classification | Source | Middleware (abbrev) |
|---|---|---|---|---|
| GET | `/:id/publication` | public | backend/routes/resumes.js | `async (req, res` |
| POST | `/:id/publish` | public | backend/routes/resumes.js | `express.json({ limit: '5mb' }` |
| POST | `/:id/unpublish` | public | backend/routes/resumes.js | `async (req, res` |
| DELETE | `/:id` | admin-gated | backend/routes/blogData.js | `requirePermission('system.config.write'` |
| DELETE | `/:id` | public | backend/routes/covers.js | `async (req, res` |
| DELETE | `/:id` | public | backend/routes/jobsData.js | `async (req, res` |
| DELETE | `/:id` | public | backend/routes/portfolios.js | `async (req, res` |
| DELETE | `/:id` | public | backend/routes/resumes.js | `async (req, res` |
| GET | `/:id` | public | backend/routes/covers.js | `async (req, res` |
| GET | `/:id` | public | backend/routes/jobsData.js | `async (req, res` |
| GET | `/:id` | public | backend/routes/portfolios.js | `async (req, res` |
| GET | `/:id` | public | backend/routes/resumes.js | `async (req, res` |
| GET | `/:id` | auth-required | backend/routes/usersData.js | `requireAuth, async (req, res` |
| PATCH | `/:id` | public | backend/routes/notificationsData.js | `async (req, res` |
| POST | `/:id` | admin-gated | backend/routes/blogData.js | `requirePermission('system.config.write'` |
| POST | `/:id` | public | backend/routes/covers.js | `express.json({ limit: '5mb' }` |
| POST | `/:id` | public | backend/routes/jobsData.js | `async (req, res` |
| POST | `/:id` | public | backend/routes/portfolios.js | `express.json({ limit: '5mb' }` |
| POST | `/:id` | public | backend/routes/resumes.js | `express.json({ limit: '5mb' }` |
| DELETE | `/:uid/ai-entitlement` | public | backend/routes/adminUsers.js | `async (req, res` |
| GET | `/:uid/ai-entitlement` | public | backend/routes/adminUsers.js | `async (req, res` |
| PUT | `/:uid/ai-entitlement` | public | backend/routes/adminUsers.js | `async (req, res` |
| POST | `/:uid/ai-quota-reset` | public | backend/routes/adminUsers.js | `async (req, res` |
| GET | `/:uid/details` | public | backend/routes/adminUsers.js | `async (req, res` |
| GET | `/:uid/export` | public | backend/routes/adminUsers.js | `async (req, res` |
| POST | `/:uid/revoke-sessions` | public | backend/routes/adminUsers.js | `async (req, res` |
| POST | `/:uid/send-password-reset` | public | backend/routes/adminUsers.js | `async (req, res` |
| DELETE | `/:uid/tenants/:tenantId` | public | backend/routes/adminUsers.js | `async (req, res` |
| POST | `/:uid/tenants` | public | backend/routes/adminUsers.js | `async (req, res` |
| POST | `/:uid/unenroll-mfa` | public | backend/routes/adminUsers.js | `async (req, res` |
| POST | `/:uid/verify-email` | public | backend/routes/adminUsers.js | `async (req, res` |
| GET | `/:uid` | public | backend/routes/adminUsers.js | `async (req, res` |
| PATCH | `/:uid` | public | backend/routes/adminUsers.js | `async (req, res` |
| GET | `/admin/circuit-breaker-status` | public | backend/routes/email.js | `(req, res` |
| GET | `/admin/custom-templates` | public | backend/routes/email.js | `getCustomTemplates` |
| GET | `/admin/deliverability` | public | backend/routes/email.js | `async (req, res` |
| POST | `/admin/reset-circuit-breaker` | public | backend/routes/email.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/admin/save-smtp` | public | backend/routes/email.js | `recentAuthForMailSecretMutation, async (req, res` |
| POST | `/admin/save-template-customization` | public | backend/routes/email.js | `requireRecentAdminAuthentication, saveTemplateCustomization` |
| GET | `/admin/settings` | public | backend/routes/email.js | `async (_req, res` |
| POST | `/admin/test-connection` | public | backend/routes/email.js | `recentAuthForEmailTest, async (req, res` |
| POST | `/admin/test-imap` | public | backend/routes/email.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/ai/entitlements` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('ai.usage.read'` |
| POST | `/ai/generate-content` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('ai.use'` |
| DELETE | `/announcements/:id` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| PATCH | `/announcements/:id` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/announcements` | public | backend/routes/platform.js | `async (_req, res` |
| POST | `/announcements` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/api/account/delete` | public | backend/index.js | `async (req, res` |
| POST | `/api/account/export` | public | backend/index.js | `async (req, res` |
| DELETE | `/api/admin/ads/:adId` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/ads` | public | backend/index.js | `async (req, res` |
| POST | `/api/admin/ads` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/ai-settings` | public | backend/index.js | `async (req, res` |
| POST | `/api/admin/ai-settings` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/api/admin/ai/fetch-models` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/api/admin/ai/quota-limits` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/api/admin/ai/quota-stats` | public | backend/index.js | `async (_req, res` |
| POST | `/api/admin/ai/reset-quota` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/api/admin/ai/test-provider` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| DELETE | `/api/admin/blog/categories/:categoryId` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/admin/blog/categories/:categoryId` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/blog/categories` | public | backend/index.js | `async (_req, res` |
| POST | `/api/admin/blog/categories` | public | backend/index.js | `async (req, res` |
| DELETE | `/api/admin/blog/posts/:postId` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/admin/blog/posts/:postId` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/blog/posts` | public | backend/index.js | `async (req, res` |
| POST | `/api/admin/blog/publish-due` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/admin/companies/:companyId` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/companies` | public | backend/index.js | `async (req, res` |
| DELETE | `/api/admin/coupons/:code` | public | backend/index.js | `async (req, res` |
| PUT | `/api/admin/coupons/:code` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/coupons` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/admin/employer-applications/:uid` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/employer-applications` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/firebase-service-account` | public | backend/index.js | `(req, res` |
| POST | `/api/admin/firebase-service-account` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/api/admin/health-summary` | public | backend/index.js | `async (req, res` |
| DELETE | `/api/admin/jobs/:jobId` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/admin/jobs/:jobId` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/jobs` | public | backend/index.js | `async (req, res` |
| DELETE | `/api/admin/pages/:slug` | public | backend/index.js | `async (req, res` |
| PUT | `/api/admin/pages/:slug` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/pages` | public | backend/index.js | `async (_req, res` |
| GET | `/api/admin/payment-orders` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/payment-settings` | admin-gated | backend/index.js | `requirePermission('system.config.read'` |
| POST | `/api/admin/payment-settings` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/api/admin/payment/test-provider` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/api/admin/payments/refund` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| DELETE | `/api/admin/reviews/:reviewId` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/reviews` | public | backend/index.js | `async (req, res` |
| POST | `/api/admin/reviews` | public | backend/index.js | `async (req, res` |
| POST | `/api/admin/settings/:category` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/settings` | public | backend/index.js | `async (req, res` |
| POST | `/api/admin/system-health-settings` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| DELETE | `/api/admin/trusted-by/:logoId` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/admin/trusted-by/:logoId` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/trusted-by` | public | backend/index.js | `async (_req, res` |
| POST | `/api/admin/trusted-by` | public | backend/index.js | `async (req, res` |
| GET | `/api/admin/twilio-settings` | public | backend/index.js | `async (req, res` |
| POST | `/api/admin/twilio-settings` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/api/admin/website-meta` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/api/auth/custom-password-reset` | public | backend/index.js | `async (req, res` |
| GET | `/api/auth/github/callback` | public | backend/index.js | `async (req, res` |
| GET | `/api/auth/github/test-credentials` | public | backend/index.js | `async (req, res` |
| GET | `/api/auth/github` | public | backend/index.js | `(req, res` |
| GET | `/api/auth/linkedin/callback` | public | backend/index.js | `async (req, res` |
| GET | `/api/auth/linkedin/test-credentials` | public | backend/index.js | `async (req, res` |
| GET | `/api/auth/linkedin` | public | backend/index.js | `(req, res` |
| POST | `/api/auth/oauth/exchange` | public | backend/index.js | `async (req, res` |
| POST | `/api/auth/preview-login` | public | backend/index.js | `async (req, res` |
| POST | `/api/auth/send-verification-email` | public | backend/index.js | `notificationAccountLimiter, async (req, res` |
| POST | `/api/auth/set-user-password` | public | backend/index.js | `async (req, res` |
| POST | `/api/auth/verify-email-token` | public | backend/index.js | `async (req, res` |
| POST | `/api/check` | public | backend/index.js | `async (req, res` |
| POST | `/api/contact` | public | backend/index.js | `async (req, res` |
| POST | `/api/employer-applications` | public | backend/index.js | `async (req, res` |
| DELETE | `/api/employer/companies/:companyId` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/employer/companies/:companyId` | public | backend/index.js | `async (req, res` |
| GET | `/api/employer/companies` | public | backend/index.js | `async (req, res` |
| POST | `/api/employer/companies` | public | backend/index.js | `async (req, res` |
| DELETE | `/api/employer/jobs/:jobId` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/employer/jobs/:jobId` | public | backend/index.js | `async (req, res` |
| GET | `/api/employer/jobs` | public | backend/index.js | `async (req, res` |
| POST | `/api/employer/jobs` | public | backend/index.js | `async (req, res` |
| POST | `/api/export-docx` | public | backend/index.js | `async (req, res` |
| GET | `/api/export-render-data` | public | backend/index.js | `async (req, res` |
| POST | `/api/generate-ai-cover-letter` | public | backend/index.js | `async (req, res` |
| GET | `/api/health/databases` | public | backend/index.js | `async (req, res` |
| GET | `/api/health` | public | backend/index.js | `(req, res` |
| GET | `/api/healthz` | public | backend/index.js | `(req, res` |
| POST | `/api/invoice/generate` | public | backend/index.js | `async (req, res` |
| POST | `/api/invoice` | public | backend/index.js | `(req, res` |
| GET | `/api/invoices/:paymentOrderId` | public | backend/index.js | `async (req, res` |
| GET | `/api/invoices` | public | backend/index.js | `async (req, res` |
| PATCH | `/api/job-applications/:applicationId/status` | public | backend/index.js | `async (req, res` |
| GET | `/api/jobs/:jobId/applications` | public | backend/index.js | `async (req, res` |
| POST | `/api/jobs/:jobId/applications` | public | backend/index.js | `async (req, res` |
| POST | `/api/jobs/naukri` | public | backend/index.js | `async (_req, res` |
| GET | `/api/linkedin-scraper` | public | backend/index.js | `async (req, res` |
| GET | `/api/messages/conversations/:conversationId/messages` | public | backend/index.js | `async (req, res` |
| GET | `/api/messages/conversations/:conversationId/participant-profile` | public | backend/index.js | `async (req, res` |
| GET | `/api/messages/conversations` | public | backend/index.js | `async (req, res` |
| POST | `/api/messages/conversations` | public | backend/index.js | `async (req, res` |
| POST | `/api/messages/send` | public | backend/index.js | `async (req, res` |
| POST | `/api/notify/user-signup` | public | backend/index.js | `(_req, res` |
| GET | `/api/payment-orders/:orderId` | public | backend/index.js | `async (req, res` |
| GET | `/api/payment-orders` | public | backend/index.js | `async (req, res` |
| POST | `/api/payment/razorpay-order` | public | backend/index.js | `(req, res` |
| POST | `/api/paypal/create-order` | public | backend/index.js | `async (req, res` |
| POST | `/api/paypal/verify` | public | backend/index.js | `async (req, res` |
| POST | `/api/pay` | public | backend/index.js | `async (req, res` |
| POST | `/api/paytm/callback` | public | backend/index.js | `async (req, res` |
| POST | `/api/paytm/initiate-transaction` | public | backend/index.js | `async (req, res` |
| POST | `/api/paytm/verify-transaction` | public | backend/index.js | `async (req, res` |
| POST | `/api/phonepe/callback` | public | backend/index.js | `async (req, res` |
| POST | `/api/phonepe/initiate` | public | backend/index.js | `async (req, res` |
| POST | `/api/phonepe/status` | public | backend/index.js | `async (req, res` |
| GET | `/api/public/custom-pages/:slug` | public | backend/index.js | `async (req, res` |
| GET | `/api/public/featured-companies` | public | backend/index.js | `async (req, res` |
| POST | `/api/razorpay/create-order` | public | backend/index.js | `async (req, res` |
| POST | `/api/razorpay/verify-payment` | public | backend/index.js | `async (req, res` |
| GET | `/api/readyz` | public | backend/index.js | `async (req, res` |
| GET | `/api/rtl-font-config` | public | backend/index.js | `(req, res` |
| POST | `/api/send-sms` | public | backend/index.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/api/service-availability` | public | backend/index.js | `async (req, res` |
| POST | `/api/stripe-webhook` | public | backend/index.js | `async (req, res` |
| POST | `/api/subscription/preferences` | public | backend/index.js | `(_req, res` |
| DELETE | `/applications/:id` | public | backend/routes/jobsData.js | `async (req, res` |
| PATCH | `/applications/:id` | public | backend/routes/jobsData.js | `async (req, res` |
| POST | `/applications/:id` | public | backend/routes/jobsData.js | `async (req, res` |
| GET | `/applications/list` | public | backend/routes/jobsData.js | `async (req, res` |
| GET | `/attention` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/audit-logs/:id` | public | backend/routes/adminAudit.js | `async (req, res` |
| GET | `/audit-logs/stats` | public | backend/routes/adminAudit.js | `async (_req, res` |
| GET | `/audit-logs` | public | backend/routes/adminAudit.js | `async (req, res` |
| GET | `/audit` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.audit.read'` |
| GET | `/backup-status` | public | backend/routes/platform.js | `async (req, res` |
| POST | `/check-grammar` | public | backend/routes/ai.js | `async (req, res` |
| GET | `/command-center` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/configuration` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.read'` |
| GET | `/configuration` | admin-gated | backend/routes/platform.js | `requireSuperAdmin, async (req, res` |
| PATCH | `/configuration` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| GET | `/conflicts` | public | backend/routes/databaseAdmin.js | `retiredDatabaseControl` |
| GET | `/contact/list` | admin-gated | backend/routes/notificationsData.js | `requirePermission('messages.read'` |
| GET | `/context` | public | backend/routes/enterprise.js | `resolveTenantContext, respondWithContext` |
| GET | `/context` | public | backend/routes/enterpriseM2m.js | `(req, res` |
| POST | `/context` | public | backend/routes/enterprise.js | `resolveTenantContext, respondWithContext` |
| GET | `/data-plane/status` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.read'` |
| GET | `/data/export` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| GET | `/dead-letter` | public | backend/routes/databaseAdmin.js | `async (_req, res` |
| GET | `/encryption` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/enterprise-queue` | public | backend/routes/platform.js | `async (_req, res` |
| GET | `/favourites/:itemId/check` | auth-required | backend/routes/miscData.js | `requireAuth, async (req, res` |
| DELETE | `/favourites/:itemId` | auth-required | backend/routes/miscData.js | `requireAuth, async (req, res` |
| GET | `/favourites` | auth-required | backend/routes/miscData.js | `requireAuth, async (req, res` |
| POST | `/favourites` | auth-required | backend/routes/miscData.js | `requireAuth, express.json({ limit: '512kb' }` |
| PUT | `/feature-flags/:flagKey` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/feature-flags` | admin-gated | backend/routes/platform.js | `requireSuperAdmin, async (_req, res` |
| POST | `/generate-content` | public | backend/routes/ai.js | `async (req, res` |
| POST | `/generate-interview` | public | backend/routes/ai.js | `async (req, res` |
| GET | `/` | public | backend/routes/adminUsers.js | `async (req, res` |
| GET | `/` | public | backend/routes/blogData.js | `async (req, res` |
| GET | `/` | public | backend/routes/covers.js | `async (req, res` |
| GET | `/` | public | backend/routes/databaseAdmin.js | `async (_req, res` |
| GET | `/` | public | backend/routes/jobsData.js | `async (req, res` |
| GET | `/` | public | backend/routes/notificationsData.js | `async (req, res` |
| GET | `/` | public | backend/routes/portfolios.js | `async (req, res` |
| GET | `/` | public | backend/routes/resumes.js | `async (req, res` |
| GET | `/health-indicator` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/health` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/healthz` | public | backend/index.js | `(req, res` |
| POST | `/initialize-schema` | public | backend/routes/databaseAdmin.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/lifecycle/suspend` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| GET | `/llms.txt` | public | backend/index.js | `async (_req, res` |
| GET | `/logs` | admin-gated | backend/routes/email.js | `requirePermission('email.logs.read'` |
| GET | `/maintenance` | public | backend/routes/platform.js | `async (_req, res` |
| POST | `/maintenance` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/memberships/:principalId/invitation-resend` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.members.manage'` |
| DELETE | `/memberships/:principalId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.members.manage'` |
| PATCH | `/memberships/:principalId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.members.manage'` |
| GET | `/memberships` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.members.read'` |
| POST | `/memberships` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.members.manage'` |
| POST | `/mfa/disable` | auth-required | backend/routes/usersData.js | `requireAuth, async (req, res` |
| GET | `/observability/metrics` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.read'` |
| GET | `/observability` | public | backend/routes/platform.js | `async (req, res` |
| POST | `/operational-status/:serviceId/test` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/operational-status/:serviceId` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/operational-status/api-matrix` | public | backend/routes/platform.js | `async (req, res` |
| POST | `/operational-status/refresh` | admin-gated | backend/routes/platform.js | `requirePermission('system.config.write'` |
| GET | `/operational-status` | public | backend/routes/platform.js | `async (req, res` |
| POST | `/operators/:uid/revoke-sessions` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/operators` | public | backend/routes/platform.js | `async (req, res` |
| POST | `/operators` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/overview` | public | backend/routes/platform.js | `async (_req, res` |
| POST | `/parse-resume` | public | backend/routes/ai.js | `async (req, res` |
| GET | `/payment-settings` | admin-gated | backend/routes/platform.js | `requirePermission('system.config.read'` |
| GET | `/payments-health` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/phrases/:category` | public | backend/routes/miscData.js | `async (req, res` |
| GET | `/phrases` | public | backend/routes/miscData.js | `async (req, res` |
| POST | `/phrases` | admin-gated | backend/routes/miscData.js | `requireAuth, requirePermission('system.config.write'` |
| GET | `/platform/currency` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('system.config.read'` |
| PUT | `/platform/currency` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('system.config.write'` |
| PATCH | `/platform/tenants/:tenantId/ai-policy` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('system.config.write'` |
| PATCH | `/platform/tenants/:tenantId/commercials` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('system.config.write'` |
| DELETE | `/platform/tenants/:tenantId/members/:principalId` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('system.config.write'` |
| PATCH | `/platform/tenants/:tenantId/members/:principalId` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('system.config.write'` |
| POST | `/platform/tenants/:tenantId/members` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('system.config.write'` |
| POST | `/platform/tenants/:tenantId/reactivate` | public | backend/routes/enterprise.js | `async (req, res` |
| POST | `/platform/tenants/:tenantId/suspend` | public | backend/routes/enterprise.js | `async (req, res` |
| GET | `/platform/tenants` | public | backend/routes/enterprise.js | `async (req, res` |
| POST | `/` | public | backend/routes/adminUsers.js | `async (req, res` |
| POST | `/` | public | backend/routes/databaseAdmin.js | `requireRecentAdminAuthentication, (req, res` |
| GET | `/profile` | auth-required | backend/routes/usersData.js | `requireAuth, async (req, res` |
| POST | `/profile` | auth-required | backend/routes/usersData.js | `requireAuth, express.json({ limit: '2mb' }` |
| POST | `/prune-outbox` | public | backend/routes/databaseAdmin.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/public-config` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/public/:slug` | public | backend/routes/portfolios.js | `async (req, res` |
| GET | `/public` | public | backend/routes/portfolios.js | `async (req, res` |
| GET | `/queue/jobs` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.read'` |
| POST | `/queue/jobs` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('resource.create'` |
| POST | `/queue/replay` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| GET | `/queue/status` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.read'` |
| POST | `/queues/purge` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, (_req, res` |
| POST | `/queues/retry` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/queues` | public | backend/routes/platform.js | `async (_req, res` |
| GET | `/readyz` | public | backend/index.js | `async (req, res` |
| POST | `/resend` | admin-gated | backend/routes/email.js | `requirePermission('system.config.write'` |
| DELETE | `/resources/:resourceId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('resource.update'` |
| GET | `/resources/:resourceId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('resource.read'` |
| PATCH | `/resources/:resourceId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('resource.update'` |
| GET | `/resources` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('resource.read'` |
| POST | `/resources` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('resource.create'` |
| POST | `/retry-dead-letter` | public | backend/routes/databaseAdmin.js | `requireRecentAdminAuthentication, (_req, res` |
| GET | `/reviews` | public | backend/routes/miscData.js | `async (req, res` |
| GET | `/roles-matrix` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.read'` |
| GET | `/search` | public | backend/routes/platform.js | `async (req, res` |
| GET | `/security-events` | public | backend/routes/platform.js | `async (req, res` |
| POST | `/send-email` | admin-gated | backend/routes/email.js | `requirePermission('system.config.write'` |
| POST | `/send-invoice-email` | public | backend/routes/email.js | `(_req, res` |
| POST | `/service-accounts/:serviceAccountId/revoke` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.security.manage'` |
| POST | `/service-accounts/:serviceAccountId/rotate` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.security.manage'` |
| GET | `/service-accounts` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.security.read'` |
| POST | `/service-accounts` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.security.manage'` |
| GET | `/slug/:slug` | public | backend/routes/blogData.js | `async (req, res` |
| POST | `/stats/increment` | auth-required | backend/routes/miscData.js | `requireAuth, express.json({ limit: '64kb' }` |
| GET | `/stats` | public | backend/routes/miscData.js | `async (req, res` |
| GET | `/status` | public | backend/routes/enterprise.js | `async (req, res` |
| POST | `/storage/token` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('resource.read'` |
| POST | `/storage/verify` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('resource.read'` |
| GET | `/subscriptions` | admin-gated | backend/routes/adminPlatformOperations.js | `requirePermission('payments.read'` |
| POST | `/support-grants/:grantId/revoke` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| GET | `/support-grants` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| POST | `/support-grants` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| GET | `/support/context` | public | backend/routes/enterprise.js | `async (req, res` |
| GET | `/sync-status` | public | backend/routes/databaseAdmin.js | `retiredDatabaseControl` |
| POST | `/teams/:teamId/archive` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'` |
| DELETE | `/teams/:teamId/members/:principalId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage'` |
| GET | `/teams/:teamId/members` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('workspace.read'` |
| POST | `/teams/:teamId/members` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage'` |
| POST | `/teams/:teamId/restore` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'` |
| PATCH | `/teams/:teamId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'` |
| GET | `/teams` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('workspace.read'` |
| POST | `/teams` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'` |
| GET | `/templates` | admin-gated | backend/routes/email.js | `requirePermission('system.config.read'` |
| POST | `/templates` | admin-gated | backend/routes/email.js | `requirePermission('system.config.write'` |
| PATCH | `/tenant` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| POST | `/tenants/:tenantId/decommission` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/tenants/:tenantId/reactivate` | public | backend/routes/enterprise.js | `async (req, res` |
| GET | `/tenants/:tenantId` | public | backend/routes/platform.js | `async (req, res` |
| PATCH | `/tenants/:tenantId` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| POST | `/tenants/garbage-collect` | public | backend/routes/platform.js | `requireRecentAdminAuthentication, async (req, res` |
| GET | `/tenants` | public | backend/routes/enterprise.js | `async (req, res` |
| POST | `/tenants` | public | backend/routes/enterprise.js | `async (req, res` |
| POST | `/test-connection` | public | backend/routes/databaseAdmin.js | `async (req, res` |
| POST | `/test-email` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.settings.write'` |
| POST | `/tickets/:ticketId/messages` | public | backend/routes/support.js | `async (req, res` |
| POST | `/tickets/:ticketId/messages` | public | backend/routes/support.js | `async (req, res` |
| GET | `/tickets/:ticketId` | public | backend/routes/support.js | `async (req, res` |
| GET | `/tickets/:ticketId` | public | backend/routes/support.js | `async (req, res` |
| PATCH | `/tickets/:ticketId` | public | backend/routes/support.js | `async (req, res` |
| GET | `/tickets` | public | backend/routes/support.js | `async (req, res` |
| GET | `/tickets` | public | backend/routes/support.js | `async (req, res` |
| POST | `/tickets` | public | backend/routes/support.js | `async (req, res` |
| DELETE | `/tracker/:id` | public | backend/routes/jobsData.js | `async (req, res` |
| PATCH | `/tracker/:id` | public | backend/routes/jobsData.js | `async (req, res` |
| GET | `/tracker` | public | backend/routes/jobsData.js | `async (req, res` |
| POST | `/tracker` | public | backend/routes/jobsData.js | `async (req, res` |
| GET | `/usage/ai/events` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.usage.read'` |
| GET | `/usage/ai` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.usage.read'` |
| GET | `/version` | public | backend/routes/platform.js | `(_req, res` |
| POST | `/workspaces/:workspaceId/archive` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.workspaces.manage'` |
| DELETE | `/workspaces/:workspaceId/members/:principalId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage'` |
| GET | `/workspaces/:workspaceId/members` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.read'` |
| POST | `/workspaces/:workspaceId/members` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage'` |
| POST | `/workspaces/:workspaceId/restore` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('tenant.workspaces.manage'` |
| PATCH | `/workspaces/:workspaceId` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'` |
| GET | `/workspaces` | public | backend/routes/enterprise.js | `resolveTenantContext, requireTenantPermission('workspace.read'` |
| POST | `/workspaces` | public | backend/routes/enterprise.js | `resolveTenantContext, requireAnyTenantPermission('workspace.manage', 'tenant.workspaces.manage'` |
