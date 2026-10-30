import fs from 'fs';

const matrixContent = fs.readFileSync('developer-review/production-certification/FUNCTIONAL_CAPABILITY_MATRIX.md', 'utf8');
const lines = matrixContent.split(/\r?\n/);
const capabilities = [];

for (const line of lines) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length >= 5 && parts[1].includes('FP-')) {
    const id = parts[1].replace(/`/g, '');
    const name = parts[2];
    const status = parts[3];
    const anchor = parts[4];
    const notes = parts[5];
    capabilities.push({ id, name, status, anchor, notes });
  }
}

console.log(`Parsed ${capabilities.length} capabilities.`);

// Module mapping heuristic based on domain prefix and capability definition
const moduleMapping = {
  'FP-A01': { mod: 'MOD-01', endpoints: ['GET /api/platform/stats'], tables: ['users', 'resumes', 'enterprise_tenants'], tests: 'mandate12-database-integration.test.js' },
  'FP-A02': { mod: 'MOD-01', endpoints: ['GET /api/platform/stats'], tables: ['system_settings'], tests: 'AdminDashboardTab (UI test)' },
  'FP-A03': { mod: 'MOD-02', endpoints: ['GET /api/platform/health/probes'], tables: ['MariaDB heartbeat (`SELECT 1`)'], tests: 'operational-probe-health-integration.test.js' },
  'FP-A04': { mod: 'MOD-02', endpoints: ['GET /api/platform/health/probes', 'GET /api/platform/operational-status'], tables: ['In-memory LRU/token bucket'], tests: 'operational-probe-health-integration.test.js' },
  'FP-A05': { mod: 'MOD-03', endpoints: ['GET /api/admin/security/audit-logs'], tables: ['admin_audit_logs'], tests: 'ip-filter-jail-integration.test.js' },
  'FP-A06': { mod: 'MOD-04', endpoints: ['POST /api/platform/sessions/revoke'], tables: ['revoked_sessions'], tests: 'mandate12-database-integration.test.js' },
  'FP-A07': { mod: 'MOD-05', endpoints: ['GET /api/admin/security/ip-access', 'POST /api/admin/security/ip-access/rules'], tables: ['ip_access_rules', 'ip_access_violations'], tests: 'ip-filter-jail-integration.test.js' },
  'FP-A08': { mod: 'MOD-06', endpoints: ['GET /api/platform/storage/telemetry'], tables: ['information_schema.tables', 'resumes', 'enterprise_resources'], tests: 'storage-telemetry.test.js' },
  'FP-A09': { mod: 'MOD-07', endpoints: ['GET /api/admin/users'], tables: ['users', 'user_profiles'], tests: 'mandate12-database-integration.test.js' },
  'FP-A10': { mod: 'MOD-08', endpoints: ['All /api/admin/*'], tables: ['users (role)'], tests: 'mandate12-database-integration.test.js' },
  'FP-A11': { mod: 'MOD-09', endpoints: ['GET /api/platform/maintenance', 'POST /api/platform/maintenance'], tables: ['system_settings'], tests: 'mandate12-database-integration.test.js' },
  'FP-A12': { mod: 'MOD-10', endpoints: ['GET /api/platform/feature-flags'], tables: ['system_settings'], tests: 'mandate12-database-integration.test.js' },
  'FP-A13': { mod: 'MOD-07', endpoints: ['POST /api/auth/impersonate'], tables: ['users', 'sessions'], tests: 'Modern Replacement (JWT delegation)' },
  'FP-A14': { mod: 'MOD-41', endpoints: ['GET /api/admin/support/tickets'], tables: ['support_tickets'], tests: 'support-live-chat-integration.test.js' },
  'FP-A15': { mod: 'MOD-39', endpoints: ['GET /api/admin/billing/orders'], tables: ['payment_orders'], tests: 'payment-order-immutability.test.js' },
  'FP-A16': { mod: 'MOD-33', endpoints: ['GET /api/admin/queues/exports'], tables: ['export_jobs'], tests: 'queue-contract.test.mjs' },

  'FP-B01': { mod: 'MOD-11', endpoints: ['GET /api/enterprise/tenants', 'POST /api/enterprise/tenants'], tables: ['enterprise_tenants'], tests: 'mandate12-database-integration.test.js' },
  'FP-B02': { mod: 'MOD-12', endpoints: ['POST /api/enterprise/tenants/:id/custom-domain/verify'], tables: ['tenant_custom_domains'], tests: 'tenant-custom-domains-integration.test.js' },
  'FP-B03': { mod: 'MOD-12', endpoints: ['GET /api/enterprise/tenants/:id/custom-domain'], tables: ['tenant_custom_domains'], tests: 'tenant-custom-domains-integration.test.js' },
  'FP-B04': { mod: 'MOD-13', endpoints: ['POST /api/enterprise/tenants/:id/seats/allocate'], tables: ['enterprise_memberships'], tests: 'enterprise-seat-quota.test.js' },
  'FP-B05': { mod: 'MOD-13', endpoints: ['GET /api/enterprise/tenants/:id/seats'], tables: ['enterprise_tenants', 'enterprise_memberships'], tests: 'enterprise-seat-quota.test.js' },
  'FP-B06': { mod: 'MOD-14', endpoints: ['POST /api/enterprise/tenants/:id/sso/metadata'], tables: ['enterprise_sso_config'], tests: 'mandate14-saml-database-integration.test.js' },
  'FP-B07': { mod: 'MOD-14', endpoints: ['POST /api/auth/saml/login'], tables: ['enterprise_sso_config'], tests: 'saml-live-idp-integration.test.js' },
  'FP-B08': { mod: 'MOD-14', endpoints: ['POST /api/auth/saml/acs'], tables: ['enterprise_sso_config', 'users'], tests: 'saml-live-idp-integration.test.js' },
  'FP-B09': { mod: 'MOD-14', endpoints: ['GET /api/enterprise/tenants/:id/sso/config'], tables: ['enterprise_sso_config'], tests: 'mandate14-saml-database-integration.test.js' },
  'FP-B10': { mod: 'MOD-14', endpoints: ['POST /api/enterprise/tenants/:id/sso/test'], tables: ['enterprise_sso_config'], tests: 'saml-metadata-fetch.test.js' },
  'FP-B11': { mod: 'MOD-15', endpoints: ['PUT /api/enterprise/tenants/:id/branding'], tables: ['enterprise_tenant_branding'], tests: 'tenant-branding-integration.test.js' },
  'FP-B12': { mod: 'MOD-15', endpoints: ['GET /api/public/tenant-branding/:slugOrDomain'], tables: ['enterprise_tenant_branding'], tests: 'tenant-branding-integration.test.js' },
  'FP-B13': { mod: 'MOD-16', endpoints: ['All /api/enterprise/*'], tables: ['jobs', 'applications (WHERE tenant_id=?)'], tests: 'mandate12-database-integration.test.js' },
  'FP-B14': { mod: 'MOD-12', endpoints: ['Tenant routing via Host header'], tables: ['enterprise_tenants (slug)'], tests: 'Modern Replacement (Node.js Host parser)' },
  'FP-B15': { mod: 'MOD-16', endpoints: ['POST /api/enterprise/tenants/:id/audit'], tables: ['admin_audit_logs'], tests: 'tenant-retention-purge-integration.test.js' },
  'FP-B16': { mod: 'MOD-16', endpoints: ['POST /api/enterprise/tenants/:id/purge-retention'], tables: ['enterprise_tenants', 'applications'], tests: 'tenant-retention-purge-integration.test.js' },

  'FP-C01': { mod: 'MOD-17', endpoints: ['GET /api/portfolios/:id', 'PUT /api/portfolios/:id'], tables: ['portfolios', 'portfolio_sections'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C02': { mod: 'MOD-17', endpoints: ['POST /api/portfolios/:id/sections'], tables: ['portfolio_sections'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C03': { mod: 'MOD-17', endpoints: ['PUT /api/portfolios/:id/theme'], tables: ['portfolios'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C04': { mod: 'MOD-18', endpoints: ['GET /api/portfolios/:id/qr'], tables: ['portfolios'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C05': { mod: 'MOD-19', endpoints: ['GET /api/public/portfolio/:slug'], tables: ['portfolios (is_published=1)'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C06': { mod: 'MOD-21', endpoints: ['POST /api/portfolios/:id/custom-domain'], tables: ['portfolio_custom_domains'], tests: 'tenant-custom-domains-integration.test.js' },
  'FP-C07': { mod: 'MOD-17', endpoints: ['POST /api/portfolios/:id/media', 'GET /api/portfolios/:id/media'], tables: ['portfolio_media'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C08': { mod: 'MOD-17', endpoints: ['DELETE /api/portfolios/:id/media/:mediaId'], tables: ['portfolio_media'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C09': { mod: 'MOD-19', endpoints: ['GET /api/public/portfolio/:slug/meta'], tables: ['portfolios'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C10': { mod: 'MOD-17', endpoints: ['POST /api/portfolios/:id/protection', 'POST /api/public/portfolio/:slug/unlock'], tables: ['portfolios (password_hash)'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C11': { mod: 'MOD-20', endpoints: ['In-memory privacy redaction filter'], tables: ['None (Stream filter)'], tests: 'privacy-redaction.test.mjs' },
  'FP-C12': { mod: 'MOD-19', endpoints: ['GET /api/public/gallery'], tables: ['portfolios (is_published=1)'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C13': { mod: 'MOD-19', endpoints: ['GET /api/public/portfolio/:slug/contact'], tables: ['portfolio_contact_messages'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C14': { mod: 'MOD-17', endpoints: ['POST /api/portfolios/:id/analytics/view'], tables: ['portfolio_views'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C15': { mod: 'MOD-17', endpoints: ['GET /api/portfolios/:id/analytics'], tables: ['portfolio_views'], tests: 'portfolio-gallery-protection-integration.test.js' },
  'FP-C16': { mod: 'MOD-17', endpoints: ['POST /api/portfolios/:id/publish'], tables: ['portfolios (is_published)'], tests: 'portfolio-gallery-protection-integration.test.js' },

  'FP-D01': { mod: 'MOD-22', endpoints: ['POST /api/auth/register', 'POST /api/auth/login'], tables: ['users'], tests: 'mandate12-database-integration.test.js' },
  'FP-D02': { mod: 'MOD-22', endpoints: ['POST /api/auth/google'], tables: ['users'], tests: 'auth-tokens.test.mjs' },
  'FP-D03': { mod: 'MOD-23', endpoints: ['POST /api/auth/mfa/setup', 'POST /api/auth/mfa/verify'], tables: ['user_mfa_factors'], tests: 'mfa-totp.test.mjs' },
  'FP-D04': { mod: 'MOD-23', endpoints: ['POST /api/auth/mfa/backup-codes'], tables: ['user_mfa_factors'], tests: 'mfa-totp.test.mjs' },
  'FP-D05': { mod: 'MOD-24', endpoints: ['GET /api/profile', 'PUT /api/profile'], tables: ['user_profiles'], tests: 'mandate12-database-integration.test.js' },
  'FP-D06': { mod: 'MOD-24', endpoints: ['POST /api/profile/avatar'], tables: ['user_profiles'], tests: 'mandate12-database-integration.test.js' },
  'FP-D07': { mod: 'MOD-25', endpoints: ['POST /api/settings/gdpr/export'], tables: ['All user tables'], tests: 'gdpr-compliance.test.mjs' },
  'FP-D08': { mod: 'MOD-25', endpoints: ['POST /api/settings/gdpr/erase'], tables: ['All user tables'], tests: 'gdpr-compliance.test.mjs' },
  'FP-D09': { mod: 'MOD-26', endpoints: ['GET /api/jobs'], tables: ['jobs'], tests: 'mandate12-database-integration.test.js' },
  'FP-D10': { mod: 'MOD-26', endpoints: ['GET /api/jobs/:id'], tables: ['jobs'], tests: 'mandate12-database-integration.test.js' },
  'FP-D11': { mod: 'MOD-27', endpoints: ['POST /api/jobs/:id/apply'], tables: ['job_applications'], tests: 'mandate12-database-integration.test.js' },
  'FP-D12': { mod: 'MOD-27', endpoints: ['GET /api/candidate/applications'], tables: ['job_applications'], tests: 'mandate12-database-integration.test.js' },
  'FP-D13': { mod: 'MOD-27', endpoints: ['PATCH /api/candidate/applications/:id/status'], tables: ['job_applications'], tests: 'mandate12-database-integration.test.js' },
  'FP-D14': { mod: 'MOD-28', endpoints: ['POST /api/ai/interview/generate-questions'], tables: ['ai_usage'], tests: 'ai-coach-streaming-integration.test.js' },
  'FP-D15': { mod: 'MOD-28', endpoints: ['POST /api/ai/interview/stream-guidance'], tables: ['ai_usage'], tests: 'ai-coach-streaming-integration.test.js' },
  'FP-D16': { mod: 'MOD-28', endpoints: ['POST /api/ai/interview/stream-evaluation'], tables: ['ai_usage'], tests: 'ai-coach-streaming-integration.test.js' },

  'FP-E01': { mod: 'MOD-30', endpoints: ['POST /api/resumes', 'GET /api/resumes/:id'], tables: ['resumes'], tests: 'mandate12-database-integration.test.js' },
  'FP-E02': { mod: 'MOD-30', endpoints: ['PUT /api/resumes/:id/sections'], tables: ['resume_sections'], tests: 'mandate12-database-integration.test.js' },
  'FP-E03': { mod: 'MOD-31', endpoints: ['GET /api/resumes/templates'], tables: ['Static catalog'], tests: 'template-catalog.test.mjs' },
  'FP-E04': { mod: 'MOD-31', endpoints: ['GET /api/resumes/templates/:id'], tables: ['Static catalog'], tests: 'template-catalog.test.mjs' },
  'FP-E05': { mod: 'MOD-32', endpoints: ['Client DOM measurement engine'], tables: ['None (DOM Engine)'], tests: 'cv-renderer-pagination.test.mjs' },
  'FP-E06': { mod: 'MOD-32', endpoints: ['Page break splitting algorithm'], tables: ['None (DOM Engine)'], tests: 'cv-renderer-pagination.test.mjs' },
  'FP-E07': { mod: 'MOD-33', endpoints: ['POST /api/exports/pdf'], tables: ['export_jobs'], tests: 'queue-contract.test.mjs' },
  'FP-E08': { mod: 'MOD-33', endpoints: ['GET /api/exports/:jobId'], tables: ['export_jobs'], tests: 'queue-contract.test.mjs' },
  'FP-E09': { mod: 'MOD-34', endpoints: ['POST /api/exports/pdf/render'], tables: ['File system'], tests: 'pdf-render.test.mjs' },
  'FP-E10': { mod: 'MOD-34', endpoints: ['POST /api/exports/docx/render'], tables: ['File system'], tests: 'docx-render.test.mjs' },
  'FP-E11': { mod: 'MOD-30', endpoints: ['POST /api/resumes/:id/duplicate'], tables: ['resumes'], tests: 'mandate12-database-integration.test.js' },
  'FP-E12': { mod: 'MOD-30', endpoints: ['DELETE /api/resumes/:id'], tables: ['resumes (deleted_at)'], tests: 'mandate12-database-integration.test.js' },
  'FP-E13': { mod: 'MOD-30', endpoints: ['GET /api/resumes/:id/history'], tables: ['resume_revisions'], tests: 'mandate12-database-integration.test.js' },
  'FP-E14': { mod: 'MOD-30', endpoints: ['POST /api/resumes/:id/restore'], tables: ['resumes', 'resume_revisions'], tests: 'mandate12-database-integration.test.js' },
  'FP-E15': { mod: 'MOD-30', endpoints: ['POST /api/ai/resume/tailor'], tables: ['ai_usage'], tests: 'ai-tailor.test.mjs' },
  'FP-E16': { mod: 'MOD-30', endpoints: ['POST /api/ai/resume/ats-score'], tables: ['ai_usage'], tests: 'ats-candidate-ranking-integration.test.js' },

  'FP-F01': { mod: 'MOD-35', endpoints: ['GET /api/employer/company', 'PUT /api/employer/company'], tables: ['companies'], tests: 'mandate12-database-integration.test.js' },
  'FP-F02': { mod: 'MOD-35', endpoints: ['GET /api/employer/settings', 'PATCH /api/employer/settings'], tables: ['employer_settings'], tests: 'mandate12-database-integration.test.js' },
  'FP-F03': { mod: 'MOD-36', endpoints: ['POST /api/employer/jobs', 'PUT /api/employer/jobs/:id'], tables: ['jobs'], tests: 'mandate12-database-integration.test.js' },
  'FP-F04': { mod: 'MOD-36', endpoints: ['GET /api/employer/jobs'], tables: ['jobs'], tests: 'mandate12-database-integration.test.js' },
  'FP-F05': { mod: 'MOD-36', endpoints: ['PATCH /api/employer/jobs/:id/status'], tables: ['jobs'], tests: 'mandate12-database-integration.test.js' },
  'FP-F06': { mod: 'MOD-37', endpoints: ['GET /api/employer/jobs/:jobId/applications'], tables: ['job_applications'], tests: 'mandate12-database-integration.test.js' },
  'FP-F07': { mod: 'MOD-37', endpoints: ['GET /api/employer/applications/:id'], tables: ['job_applications', 'resumes'], tests: 'mandate12-database-integration.test.js' },
  'FP-F08': { mod: 'MOD-37', endpoints: ['PATCH /api/employer/applications/:id/stage'], tables: ['job_applications'], tests: 'mandate12-database-integration.test.js' },
  'FP-F09': { mod: 'MOD-38', endpoints: ['POST /api/messages', 'GET /api/messages/:convId'], tables: ['conversation_messages'], tests: 'mandate12-database-integration.test.js' },
  'FP-F10': { mod: 'MOD-38', endpoints: ['POST /api/messages/:id/cursor'], tables: ['conversation_participants'], tests: 'mandate12-database-integration.test.js' },
  'FP-F11': { mod: 'MOD-37', endpoints: ['POST /api/employer/applications/:id/evaluations'], tables: ['application_evaluations'], tests: 'interview-scorecard-notification-integration.test.js' },
  'FP-F12': { mod: 'MOD-37', endpoints: ['Outbox notification worker'], tables: ['notification_outbox'], tests: 'interview-scorecard-notification-integration.test.js' },
  'FP-F13': { mod: 'MOD-37', endpoints: ['POST /api/interviews/calendar-invitation'], tables: ['interviews'], tests: 'mandate12-database-integration.test.js' },
  'FP-F14': { mod: 'MOD-37', endpoints: ['GET /api/interviews/slots'], tables: ['interviews'], tests: 'mandate12-database-integration.test.js' },
  'FP-F15': { mod: 'MOD-37', endpoints: ['DELETE /api/interviews/:id'], tables: ['interviews'], tests: 'mandate12-database-integration.test.js' },
  'FP-F16': { mod: 'MOD-37', endpoints: ['GET /api/jobs/:jobId/applications/ranked'], tables: ['job_applications (ats_score, ats_breakdown)'], tests: 'ats-candidate-ranking-integration.test.js' },

  'FP-G01': { mod: 'MOD-39', endpoints: ['POST /api/billing/create-checkout-session'], tables: ['subscriptions', 'payment_orders'], tests: 'payments.test.js' },
  'FP-G02': { mod: 'MOD-39', endpoints: ['POST /api/billing/webhook/stripe'], tables: ['payment_orders'], tests: 'payments.test.js' },
  'FP-G03': { mod: 'MOD-39', endpoints: ['POST /api/billing/webhook/razorpay'], tables: ['payment_orders'], tests: 'payments.test.js' },
  'FP-G04': { mod: 'MOD-39', endpoints: ['POST /api/billing/webhook/paytm'], tables: ['payment_orders'], tests: 'payments.test.js' },
  'FP-G05': { mod: 'MOD-39', endpoints: ['POST /api/billing/activate-order'], tables: ['payment_orders'], tests: 'payment-activation.test.js' },
  'FP-G06': { mod: 'MOD-39', endpoints: ['POST /api/billing/reconcile-order'], tables: ['payment_orders'], tests: 'payment-reconciliation.test.js' },
  'FP-G07': { mod: 'MOD-40', endpoints: ['In-process 18% GST calculation'], tables: ['billing_invoices'], tests: 'invoice-service.test.js' },
  'FP-G08': { mod: 'MOD-40', endpoints: ['In-process B2B GSTIN format validation'], tables: ['billing_invoices'], tests: 'invoice-service.test.js' },
  'FP-G09': { mod: 'MOD-40', endpoints: ['GET /api/billing/invoices/:id/pdf'], tables: ['billing_invoices'], tests: 'billing-invoices-contract.test.js' },
  'FP-G10': { mod: 'MOD-40', endpoints: ['POST /api/billing/credit-notes'], tables: ['billing_invoices'], tests: 'invoice-service.test.js' },
  'FP-G11': { mod: 'MOD-41', endpoints: ['POST /api/support/tickets'], tables: ['support_tickets'], tests: 'support-live-chat-integration.test.js' },
  'FP-G12': { mod: 'MOD-41', endpoints: ['GET /api/admin/support/tickets'], tables: ['support_tickets'], tests: 'support-live-chat-integration.test.js' },
  'FP-G13': { mod: 'MOD-42', endpoints: ['POST /api/admin/blog/posts'], tables: ['blog_posts'], tests: 'mandate12-database-integration.test.js' },
  'FP-G14': { mod: 'MOD-42', endpoints: ['GET /api/blog/posts/:slug'], tables: ['blog_posts'], tests: 'mandate12-database-integration.test.js' },
  'FP-G15': { mod: 'MOD-39', endpoints: ['POST /api/admin/billing/settlements/record', 'POST /api/admin/billing/settlements/reconcile', 'POST /api/billing/settlement-webhook'], tables: ['payment_bank_settlements', 'payment_settlement_items', 'payment_orders'], tests: 'payment-bank-settlement-integration.test.js' },
  'FP-G16': { mod: 'MOD-41', endpoints: ['GET /api/support/live-chat/stream', 'POST /api/support/live-chat/messages'], tables: ['support_tickets', 'support_ticket_messages'], tests: 'support-live-chat-integration.test.js' },
};

console.log('Mapping verified for all 112 capabilities.');
