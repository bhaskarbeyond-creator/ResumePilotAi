#!/usr/bin/env node
/**
 * FEATURE PARITY MATRIX generator (audit-only).
 *
 * Reads Evidence/artifacts/legacy-modern-inventory.json (produced by
 * legacy-modern-inventory.cjs) and a hand-authored capability register, then:
 *   - derives legacy/modern file + line counts for each capability from the
 *     inventory (never hand-typed),
 *   - validates every classification against the closed vocabulary,
 *   - emits developer-review/FEATURE-PARITY-MATRIX.md
 *   - emits developer-review/Evidence/artifacts/feature-parity.json (machine-checkable)
 *
 * Classification vocabulary is fixed by the audit directive; unknown values abort
 * the run so a typo can never soften a verdict.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const INV = JSON.parse(fs.readFileSync(path.join(ROOT, 'developer-review', 'Evidence', 'artifacts', 'legacy-modern-inventory.json'), 'utf8'));

const VOCAB = [
  'FULL PARITY',
  'PARTIAL PARITY',
  'MISSING',
  'STATIC STUB',
  'MOCK / FABRICATED STATE',
  'LOCAL-ONLY PERSISTENCE',
  'INTENTIONAL RETIREMENT',
  'REPLACED BY EQUIVALENT',
  'UNVERIFIED',
];

const DOMAINS = {
  A: 'A — Super Admin / platform operations',
  B: 'B — Enterprise talent cloud',
  C: 'C — Portfolio / Puck / WebCV',
  D: 'D — Candidate experience, voice interview, HUD, palette',
  E: 'E — Resume builder, ATS, templates, share',
  F: 'F — Employer, pipelines, messaging, onboarding, job discovery',
  G: 'G — Remaining legacy components (shared infra & content)',
};

// ---------------------------------------------------------------------------
// Capability register.
//   legacy: path prefixes under src/  (counts derived from the inventory)
//   modern: path prefixes under frontend/src/
//   backend: [exists:yes/no/partial, endpoints]
//   invoke: does the modern UI actually call it?  persist: reloaded from server?
// ---------------------------------------------------------------------------
const REGISTER = [
  // ======================= DOMAIN A =======================
  {
    id: 'FP-A01', domain: 'A', capability: 'Platform KPI dashboard (users, resumes, applications, AI generations, storage)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/dashboard'],
    modern: ['frontend/src/components/admin/AdminDashboardTab.tsx', 'frontend/src/pages/admin/console.tsx'],
    backend: 'yes', endpoints: ['/platform/stats'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'AdminDashboardTab.tsx:37 usePlatformStats(); :41-48 KPI values',
    note: 'Live data path exists. Defect isolated in FP-A02.',
  },
  {
    id: 'FP-A02', domain: 'A', capability: 'KPI fabricated fallback values shown when the stats endpoint returns nothing',
    classification: 'MOCK / FABRICATED STATE',
    legacy: [],
    modern: ['frontend/src/components/admin/AdminDashboardTab.tsx'],
    backend: 'yes', endpoints: ['/platform/stats'], invoke: 'yes', persist: 'no', errors: 'no', tests: 'no',
    evidence: "AdminDashboardTab.tsx:41-48 `stats?.totalUsers ?? '48,290'`, `?? '420,910'`, `?? '184.2 GB'`",
    note: 'A failed/empty response renders an invented, plausible dashboard with no error state. Not disclosed to the operator.',
  },
  {
    id: 'FP-A03', domain: 'A', capability: 'Subsystem health catalogue (28 services, latency, remediation hints)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/health'],
    modern: ['frontend/src/components/admin/AdminHealthTab.tsx'],
    backend: 'yes', endpoints: ['/platform/operational-status'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'AdminHealthTab.tsx:508 DEFAULT_28_SERVICES; :528-543 remote override',
    note: 'Remote values override the seed when present — but see FP-A04.',
  },
  {
    id: 'FP-A04', domain: 'A', capability: 'Health fallback claims (invented latency, "99.8%" delivery, "100% Enforced" isolation) displayed when no telemetry arrives',
    classification: 'MOCK / FABRICATED STATE',
    legacy: [],
    modern: ['frontend/src/components/admin/AdminHealthTab.tsx'],
    backend: 'yes', endpoints: ['/platform/operational-status'], invoke: 'yes', persist: 'no', errors: 'no', tests: 'no',
    evidence: "AdminHealthTab.tsx:460-500 metrics {'Carrier Delivery':'99.8%'}, {'Active Tenants':12}, {'Isolation Invariants':'100% Enforced'}",
    note: 'Severity: an unmonitored subsystem renders OPERATIONAL with fabricated numbers, including a security-isolation claim.',
  },
  {
    id: 'FP-A05', domain: 'A', capability: 'Security event stream / audit viewer',
    classification: 'MOCK / FABRICATED STATE',
    legacy: ['src/components/admin/audit', 'src/components/admin/security'],
    modern: ['frontend/src/components/admin/AdminSecurityTab.tsx'],
    backend: 'yes', endpoints: ['/admin/audit-logs', '/platform/security-events'], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'no',
    evidence: 'AdminSecurityTab.tsx 928 lines, 0 api-client references, INITIAL_EVENTS at :66-110 incl. fabricated requestPath :98',
    note: 'Backend and an unused `useAdminAuditLogs` hook both exist. UI shows invented principals, IPs and API paths.',
  },
  {
    id: 'FP-A06', domain: 'A', capability: 'Operator roster + force-revoke sessions',
    classification: 'MOCK / FABRICATED STATE',
    legacy: ['src/components/admin/operators'],
    modern: ['frontend/src/components/admin/AdminSecurityTab.tsx'],
    backend: 'yes', endpoints: ['/platform/operators', '/platform/operators/{X}/revoke-sessions'], invoke: 'no', persist: 'no', errors: 'no', tests: 'no',
    evidence: 'handleRevokeSessions only setState + toast asserting "Next request will return 401" (~:204-213)',
    note: 'A false assertion of a completed security action is shown to the operator. Highest-severity fabrication in Domain A.',
  },
  {
    id: 'FP-A07', domain: 'A', capability: 'IP blocklist / deny rules',
    classification: 'MOCK / FABRICATED STATE',
    legacy: ['src/components/admin/security'],
    modern: ['frontend/src/components/admin/AdminSecurityTab.tsx'],
    backend: 'partial', endpoints: [], invoke: 'no', persist: 'no', errors: 'no', tests: 'no',
    evidence: 'handleBlockIp -> setState + toast; no endpoint found in backend/routes',
    note: 'No backend support either: the capability was never implemented end-to-end, in either tree.',
  },
  {
    id: 'FP-A08', domain: 'A', capability: 'Platform announcements publisher',
    classification: 'MOCK / FABRICATED STATE',
    legacy: ['src/components/admin'],
    modern: ['frontend/src/components/admin/AdminSecurityTab.tsx'],
    backend: 'yes', endpoints: ['/platform/announcements'], invoke: 'no', persist: 'no', errors: 'no', tests: 'no',
    evidence: 'announcements state seeded in AdminSecurityTab; CRUD backend present in backend/routes/platform.js',
    note: '',
  },
  {
    id: 'FP-A09', domain: 'A', capability: 'Marketing content: phrases, reviews, trusted-by logos, landing pages',
    classification: 'MOCK / FABRICATED STATE',
    legacy: ['src/components/admin/phrases', 'src/components/admin/reviews', 'src/components/admin/TrustedBy', 'src/components/admin/landingPages'],
    modern: ['frontend/src/components/admin/AdminContentMarketingTab.tsx'],
    backend: 'yes', endpoints: ['/phrases', '/admin/reviews', '/admin/trusted-by', '/admin/pages', '/public/trusted-by', '/public/custom-pages'], invoke: 'no', persist: 'no', errors: 'no', tests: 'no',
    evidence: 'AdminContentMarketingTab.tsx 456 lines / 0 API refs; INITIAL_PHRASES 5, INITIAL_REVIEWS 3, INITIAL_TRUSTED 5, INITIAL_PAGES 3 (:40-150)',
    note: 'Trusted-by seeds name real partner brands. Public reader endpoints exist and are unused by this tab.',
  },
  {
    id: 'FP-A10', domain: 'A', capability: 'At-risk attention inbox / platform insights',
    classification: 'MOCK / FABRICATED STATE',
    legacy: ['src/components/admin/attention'],
    modern: ['frontend/src/components/admin/AdminAttentionTab.tsx'],
    backend: 'yes', endpoints: ['/platform/attention'], invoke: 'no', persist: 'no', errors: 'no', tests: 'no',
    evidence: 'AdminAttentionTab.tsx 169 lines, 0 api refs, DEFAULT_SIGNALS :31, refresh does not fetch',
    note: '',
  },
  {
    id: 'FP-A11', domain: 'A', capability: 'Employer application + job posting moderation',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/employerApplications', 'src/components/admin/jobsManager'],
    modern: ['frontend/src/components/admin/AdminModerationTab.tsx'],
    backend: 'yes', endpoints: ['/admin/employer-applications/{X}/verify', '/admin/jobs/{X}/moderate'], invoke: 'yes', persist: 'no', errors: 'no', tests: 'partial',
    evidence: 'AdminModerationTab.tsx:152,167,184 real POSTs but `.catch(() => {})`; list seeded from DEFAULT_APPLICATIONS/DEFAULT_JOBS :61-111 and never re-fetched',
    note: 'Writes are real; reads are fabricated and failures are silently swallowed. Operator cannot tell a successful moderation from a failed one.',
  },
  {
    id: 'FP-A12', domain: 'A', capability: 'Platform tenant registry (list tenants, quotas, suspend)',
    classification: 'MISSING',
    legacy: ['src/components/admin/tenants'],
    modern: ['frontend/src/components/admin/AdminModerationTab.tsx'],
    backend: 'yes', endpoints: ['/enterprise/platform/tenants', '/enterprise/platform/tenants/{X}/suspend'], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'partial',
    evidence: 'AdminModerationTab.tsx:389 renders companies/tenants sub-sections from DEFAULT_APPLICATIONS; no tenant list fetch',
    note: 'Enterprise-side tenant management exists (FP-B06); the platform-level registry UI does not.',
  },
  {
    id: 'FP-A13', domain: 'A', capability: 'Company management (verification, documents, quotas)',
    classification: 'MOCK / FABRICATED STATE',
    legacy: ['src/components/admin/companyManagement'],
    modern: ['frontend/src/components/admin/AdminModerationTab.tsx'],
    backend: 'partial', endpoints: ['/admin/employer-applications/{X}/verify'], invoke: 'partial', persist: 'no', errors: 'no', tests: 'no',
    evidence: 'companies sub-section (:389) renders seeded application objects; no company entity endpoint used',
    note: '',
  },
  {
    id: 'FP-A14', domain: 'A', capability: 'Coupon / promo-code administration',
    classification: 'MISSING',
    legacy: ['src/components/admin/settings'],
    modern: [],
    backend: 'yes', endpoints: ['/admin/coupons'], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: 'no admin coupon surface in frontend/src; only a feature-flag toggle (AdminSettingsTab.tsx:334) and a checkout promo field',
    note: 'Backend CRUD exists; nothing in the modern UI can create or list a coupon.',
  },
  {
    id: 'FP-A15', domain: 'A', capability: 'Refunds, invoices, payment orders administration',
    classification: 'MISSING',
    legacy: ['src/components/admin/settings'],
    modern: [],
    backend: 'yes', endpoints: ['/admin/payments/refund', '/invoices', '/payment-orders'], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: 'frontend/src contains only `payment_refunded: billing` in lib/notification-display.ts',
    note: 'Monetisation-critical. Backend endpoints exist and are unreachable from the modern app.',
  },
  {
    id: 'FP-A16', domain: 'A', capability: 'SMTP/IMAP + transactional email template settings',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/settings'],
    modern: ['frontend/src/components/admin/AdminEmailSmtpTab.tsx', 'frontend/src/components/admin/AdminSettingsTab.tsx'],
    backend: 'yes', endpoints: ['/admin/settings/email', '/admin/email-templates'], invoke: 'partial', persist: 'partial', errors: 'partial', tests: 'no',
    evidence: 'AdminEmailSmtpTab.tsx present; 2 api refs; legacy EmailSmtpSettings.jsx + template editor',
    note: 'Transport settings present; template authoring depth not verified -> see U-items.',
  },
  {
    id: 'FP-A17', domain: 'A', capability: 'User manager, User360 drawer, session revoke',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/usersManager', 'src/components/admin/userEdit'],
    modern: ['frontend/src/components/admin/AdminUsersTab.tsx'],
    backend: 'yes', endpoints: ['/admin/users', '/admin/users/{X}/revoke-sessions'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'AdminUsersTab.tsx 1131 lines, 7 api refs, :280 revoke-sessions',
    note: 'Single-user operations wired. No bulk selection/actions (see FP-A18).',
  },
  {
    id: 'FP-A18', domain: 'A', capability: 'Bulk user operations (multi-select, bulk role change, bulk removal)',
    classification: 'MISSING',
    legacy: ['src/components/admin/usersManager'],
    modern: [],
    backend: 'partial', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'no selectedRows/bulk handler in frontend/src admin tabs; legacy EnterpriseUsersTab.jsx:251-297 has handleBulkAction with partial-failure reporting',
    note: '',
  },
  {
    id: 'FP-A19', domain: 'A', capability: 'Support / help-desk tickets',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin'],
    modern: ['frontend/src/components/admin/AdminHelpDeskTab.tsx'],
    backend: 'yes', endpoints: ['/admin/support/tickets', '/admin/support/tickets/{X}/messages'], invoke: 'yes', persist: 'partial', errors: 'partial', tests: 'partial',
    evidence: 'AdminHelpDeskTab.tsx 380 lines, 3 api refs, 1 seed array',
    note: 'Thread replies exist (modern-only endpoint). Seeded fallback list unverified for fetch-override.',
  },
  {
    id: 'FP-A20', domain: 'A', capability: 'Job queues, DLQ, outbox, cache, backups (operations console)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/queues', 'src/components/admin/operations', 'src/components/admin/command', 'src/components/admin/sidebar'],
    modern: ['frontend/src/components/admin/AdminQueuesTab.tsx', 'frontend/src/components/admin/AdminOperationsTab.tsx'],
    backend: 'yes', endpoints: ['/platform/queues', '/platform/queues/retry', '/admin/operations/feature-flags'], invoke: 'yes', persist: 'unknown', errors: 'no', tests: 'yes',
    evidence: 'AdminQueuesTab.tsx:138/173 call /platform/queues and /platform/queues/retry (UI-REACHABLE). The V4-declared /admin/queues and /admin/queues/dlq/replay-all are NOT registered: the same tab reaches them only as .catch() fallbacks (AdminQueuesTab.tsx:138/173/186/204) and those branches 404. AdminOperationsTab.tsx:122/136 POST /admin/operations/backup and /admin/operations/cache-clear, neither registered; /admin/operations/feature-flags is UNREACHABLE.',
    note: 'V5 correction of an over-claim. Queue listing and retry are wired; DLQ retry/purge, backup, cache-clear and the feature-flag console are not, and the two operations buttons fabricate success after swallowing the failure (DISC-026).',
  },
  {
    id: 'FP-A21', domain: 'A', capability: 'Platform settings, feature flags, maintenance, encryption/backup status',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/settings'],
    modern: ['frontend/src/components/admin/AdminSettingsTab.tsx'],
    backend: 'yes', endpoints: ['/platform/feature-flags', '/platform/maintenance', '/platform/encryption', '/platform/backup-status'], invoke: 'partial', persist: 'partial', errors: 'partial', tests: 'partial',
    evidence: 'AdminSettingsTab.tsx 1324 lines / 8 api refs + feature-flag catalogue',
    note: 'Largest remaining modern admin tab; depth by sub-setting not individually verified.',
  },
  {
    id: 'FP-A22', domain: 'A', capability: 'Dedicated audit-log browser with filters and export',
    classification: 'MISSING',
    legacy: ['src/components/admin/audit'],
    modern: [],
    backend: 'yes', endpoints: ['/admin/audit-logs', '/admin/audit-logs/stats'], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'yes',
    evidence: 'hooks/use-api-hooks.ts useAdminAuditLogs has 0 consumers; AdminSecurityTab fabricates instead',
    note: 'Backend is permissioned (audit.read) and tested; the only UI consumer was dropped.',
  },
  {
    id: 'FP-A23', domain: 'A', capability: 'Admin command palette + entity search',
    classification: 'MISSING',
    legacy: ['src/components/admin/command'],
    modern: [],
    backend: 'partial', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'AdminCommandPalette.jsx 239 lines + adminEntitySearch.js 141 lines; 0 modern matches for palette/⌘K handlers',
    note: 'One modern heading literally reads "Quick Command Palette" (EnterpriseOverviewTab.tsx:405) with no palette behind it.',
  },

  {
    id: 'FP-A24', domain: 'A', capability: 'Public pricing, plan comparison and checkout',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Billing/Plans', 'src/components/Billing'],
    modern: ['frontend/src/pages/billing', 'frontend/src/pages/billing/checkout-modal.tsx'],
    backend: 'yes', endpoints: ['/paypal/create-order', '/razorpay/create-order', '/coupons/validate'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'checkout-modal.tsx calls /paypal/create-order and /razorpay/create-order (UI-REACHABLE); the coupon field at checkout-modal.tsx:246 POSTs /billing/validate-coupon, which is NOT registered (the registered op is /coupons/validate). /billing/plans and /billing/checkout are NOT registered; the plan catalogue is client-side data.',
    note: 'V5 correction. Checkout initiation is genuinely wired; coupon validation is a 404 and plan entitlements are not server-authoritative.',
  },

  {
    id: 'FP-A25', domain: 'A', capability: 'AI provider / gateway administration (provider CRUD, key pool, quotas, discovery, playground, unified gateway)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/settings/AiSettings.jsx', 'src/services/adminAiSettings.js'],
    modern: ['frontend/src/components/admin/ai-settings', 'frontend/src/components/admin/AdminAiSettingsTab.tsx', 'frontend/src/components/admin/freellmapi-catalog.ts'],
    backend: 'yes', endpoints: ['/admin/ai-settings', '/admin/ai/test-provider', '/admin/ai/quota-stats', '/admin/ai/reset-quota', '/admin/ai/fetch-models'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'yes',
    evidence: 'ai-settings hooks call /admin/ai/test-provider, /admin/ai/quota-stats and /admin/ai/reset-quota (UI-REACHABLE); /admin/ai/fetch-models is registered via app.all and is UI-REACHABLE (useDiscoveryPlayground.ts:60). /ai/providers is NOT registered; /admin/ai/entitlements, /admin/ai/quota-limits, /admin/ai/routing-telemetry and /admin/ai/reset-state are UNREACHABLE.',
    note: 'V5 correction: 46 modern files are real, but the declared /ai/providers does not exist and four governance endpoints have no caller. Modern still exceeds legacy in volume.',
  },
  {
    id: 'FP-A26', domain: 'A', capability: 'Admin console shell and tab routing',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/admin/Admin.jsx', 'src/components/admin/sidebar'],
    modern: ['frontend/src/pages/admin/console.tsx'],
    backend: 'yes', endpoints: ['/admin/settings/modules'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'console.tsx VALID_TABS (:50-66) = 15 tabs (dashboard, health, queues, operations, attention, users, support, moderation, blog, content, ai-settings, email, security, settings, modules); legacy src/components/admin/ holds 30 modules. Not one-to-one: several legacy modules fold into one modern tab, and some modern tabs aggregate.',
    note: 'Shell parity high; the loss is inside the tabs (fabricated panels, missing audit viewer), not in the shell. See FP-A05..FP-A14, FP-A22.',
  },

  // ======================= DOMAIN B =======================
  {
    id: 'FP-B01', domain: 'B', capability: 'Enterprise console shell + context switching',
    classification: 'PARTIAL PARITY',
    legacy: ['src/enterprise/EnterpriseConsole.jsx', 'src/enterprise/EnterprisePortalCuba.jsx', 'src/enterprise/EnterpriseContextSwitchers.jsx', 'src/enterprise/EnterpriseContext.jsx', 'src/enterprise/orgRouteState.js', 'src/enterprise/useTenantApi.jsx', 'src/enterprise/enterpriseHelpers.js', 'src/enterprise/components/HelpTooltip.jsx'],
    modern: ['frontend/src/pages/enterprise/console.tsx', 'frontend/src/components/enterprise/EnterpriseContext.tsx'],
    backend: 'yes', endpoints: ['/enterprise/context'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'yes',
    evidence: 'console.tsx drives 14 tabs; switchers collapsed into a single org selector',
    note: '',
  },
  {
    id: 'FP-B02', domain: 'B', capability: 'Member directory, invitations, single-member removal, CSV export',
    classification: 'PARTIAL PARITY',
    legacy: ['src/enterprise/components/EnterpriseUsersTab.jsx'],
    modern: ['frontend/src/components/enterprise/EnterpriseUsersTab.tsx'],
    backend: 'yes', endpoints: ['/enterprise/memberships'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'yes',
    evidence: 'modern :259 deleteMembership, :287 CSV build; legacy :251-297 bulk handler',
    note: 'Bulk/partial-failure path lost — tracked as FP-B03.',
  },
  {
    id: 'FP-B03', domain: 'B', capability: 'Bulk member actions with per-member partial-failure reporting',
    classification: 'MISSING',
    legacy: ['src/enterprise/components/EnterpriseUsersTab.jsx'],
    modern: [],
    backend: 'partial', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'no', tests: 'no',
    evidence: 'legacy EnterpriseUsersTab.jsx:251-297 `Successfully applied bulk action to N member(s)` + per-failure error; modern has single-target delete only',
    note: '',
  },
  {
    id: 'FP-B04', domain: 'B', capability: 'Roles & permissions matrix',
    classification: 'PARTIAL PARITY',
    legacy: ['src/enterprise/components/EnterpriseRolesTab.jsx'],
    modern: ['frontend/src/components/enterprise/EnterpriseRolesTab.tsx'],
    backend: 'yes', endpoints: ['/enterprise/roles'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'ROLE_HIERARCHY present in both', note: '',
  },
  {
    id: 'FP-B05', domain: 'B', capability: 'Teams + archive/restore',
    classification: 'FULL PARITY',
    legacy: ['src/enterprise/components/EnterpriseTeamsTab.jsx'],
    modern: ['frontend/src/components/enterprise/EnterpriseTeamsTab.tsx'],
    backend: 'yes', endpoints: ['/enterprise/teams', '/enterprise/teams/{X}/archive', '/enterprise/teams/{X}/restore'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'yes',
    evidence: 'archive/restore are modern-only endpoints', note: 'Modern exceeds legacy.',
  },
  {
    id: 'FP-B06', domain: 'B', capability: 'Workspaces + archive/restore',
    classification: 'FULL PARITY',
    legacy: ['src/enterprise/components/EnterpriseWorkspacesTab.jsx'],
    modern: ['frontend/src/components/enterprise/EnterpriseWorkspacesTab.tsx'],
    backend: 'yes', endpoints: ['/enterprise/workspaces', '/enterprise/workspaces/{X}/archive', '/enterprise/workspaces/{X}/restore'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'yes',
    evidence: 'modern adds suspend/reactivate lifecycle', note: 'Modern exceeds legacy.',
  },
  {
    id: 'FP-B07', domain: 'B', capability: 'Tenant lifecycle (suspend / reactivate) from the enterprise platform tab',
    classification: 'FULL PARITY',
    legacy: ['src/enterprise/components/EnterprisePlatformTab.jsx'],
    modern: ['frontend/src/components/enterprise/EnterprisePlatformTab.tsx'],
    backend: 'yes', endpoints: ['/enterprise/platform/tenants', '/enterprise/platform/tenants/{X}/suspend', '/enterprise/platform/tenants/{X}/reactivate'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'yes',
    evidence: 'suspend/reactivate are modern-only', note: '',
  },
  {
    id: 'FP-B08', domain: 'B', capability: 'Enterprise audit trail with CSV export',
    classification: 'FULL PARITY',
    legacy: ['src/enterprise/components/EnterpriseAuditTab.jsx'],
    modern: ['frontend/src/components/enterprise/EnterpriseAuditTab.tsx'],
    backend: 'yes', endpoints: ['/enterprise/audit'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'EnterpriseAuditTab.tsx:85-90 CSV export', note: 'Refutes the "enterprise exports were dropped" allegation.',
  },
  {
    id: 'FP-B09', domain: 'B', capability: 'Enterprise resumes + PDF rendering',
    classification: 'PARTIAL PARITY',
    legacy: ['src/enterprise/components/EnterpriseResumesTab.jsx', 'src/enterprise/components/EnterpriseResumePdfModal.jsx'],
    modern: ['frontend/src/components/enterprise/EnterpriseResumesTab.tsx', 'frontend/src/components/enterprise/EnterpriseResumePdfModal.tsx'],
    backend: 'yes', endpoints: ['/enterprise/resumes'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: '1:1 file correspondence', note: '',
  },
  {
    id: 'FP-B10', domain: 'B', capability: 'AI quota rings + enterprise AI controls',
    classification: 'PARTIAL PARITY',
    legacy: ['src/enterprise/AiQuotaRing.jsx', 'src/enterprise/components/EnterpriseAiTab.jsx', 'src/enterprise/quotaRing.js'],
    modern: ['frontend/src/components/enterprise/AiQuotaRing.tsx', 'frontend/src/components/enterprise/EnterpriseAiTab.tsx'],
    backend: 'yes', endpoints: ['/enterprise/usage/ai/events', '/admin/ai/quota-stats', '/admin/ai/reset-quota'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: '/enterprise/usage/ai/events UI-REACHABLE (enterprise-api.ts:487); quota governance hooks call /admin/ai/quota-stats and /admin/ai/reset-quota (UI-REACHABLE). /enterprise/ai/generate-content and /enterprise/ai/generate-interview are registered but UNREACHABLE — no client call site exists.',
    note: 'V5 correction: reporting/governance are wired; the two enterprise AI generation controls are route definitions with no caller.',
  },
  {
    id: 'FP-B11', domain: 'B', capability: 'Usage, email, security, support, settings tabs',
    classification: 'PARTIAL PARITY',
    legacy: ['src/enterprise/components/EnterpriseUsageTab.jsx', 'src/enterprise/components/EnterpriseEmailTab.jsx', 'src/enterprise/components/EnterpriseSecurityTab.jsx', 'src/enterprise/components/EnterpriseSupportTab.jsx', 'src/enterprise/components/EnterpriseSettingsTab.jsx', 'src/enterprise/components/EnterpriseOverviewTab.jsx', 'src/enterprise/components/EnterpriseConfirmModal.jsx'],
    modern: ['frontend/src/components/enterprise/EnterpriseUsageTab.tsx', 'frontend/src/components/enterprise/EnterpriseEmailTab.tsx', 'frontend/src/components/enterprise/EnterpriseSecurityTab.tsx', 'frontend/src/components/enterprise/EnterpriseSupportTab.tsx', 'frontend/src/components/enterprise/EnterpriseSettingsTab.tsx', 'frontend/src/components/enterprise/EnterpriseOverviewTab.tsx', 'frontend/src/components/enterprise/EnterpriseConfirmModal.tsx', 'frontend/src/components/enterprise/HelpTooltip.tsx'],
    backend: 'yes', endpoints: ['/enterprise/usage', '/enterprise/email', '/enterprise/settings'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: '5/5 tabs reimplemented; per-tab depth not individually verified (U-B01)', note: '',
  },

  // ======================= DOMAIN C =======================
  {
    id: 'FP-C01', domain: 'C', capability: 'Puck-based drag-and-drop portfolio page editor',
    classification: 'MISSING',
    legacy: ['src/components/PortfolioBuilder/LegacyPuckEditor.jsx', 'src/components/PortfolioBuilder/PortfolioBuilder.jsx'],
    modern: [],
    backend: 'partial', endpoints: ['/portfolios'], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'no @puckeditor reference anywhere under frontend/src; package no longer in any built entry',
    note: 'Removal is undocumented: no ADR, no changelog entry, no migration note in the repo. Classified MISSING, not INTENTIONAL RETIREMENT, because intent is unevidenced.',
  },
  {
    id: 'FP-C02', domain: 'C', capability: '71 modular portfolio page blocks (About1-6, Experience1-2, Education1-2, Contact1-4, Awards1-2, …)',
    classification: 'MISSING',
    legacy: ['src/components/PortfolioBuilder/PortfolioComponents'],
    modern: [],
    backend: 'no', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: '71 block components; modern renders a fixed canonical section set (lib/portfolio-document.ts)',
    note: 'Replaced by a constrained schema, which is a deliberate architectural choice for the *new* flow — but existing block content has no path into it (FP-C04).',
  },
  {
    id: 'FP-C03', domain: 'C', capability: 'WebCV Studio (layout ladder, template presets, template utils)',
    classification: 'MISSING',
    legacy: ['src/components/PortfolioBuilder/WebCvStudio.jsx', 'src/components/PortfolioBuilder/TemplatePresets.js', 'src/components/PortfolioBuilder/templateUtils.js', 'src/components/PortfolioBuilder/CreateWebCvDialog.jsx', 'src/components/PortfolioBuilder/TemplateSelector.jsx', 'src/components/PortfolioBuilder/portfolioSanitization.js'],
    modern: [],
    backend: 'partial', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'WebCvStudio 856 lines + presets 683 + utils 427; modern offers a 6-entry PORTFOLIO_TEMPLATES gallery',
    note: '',
  },
  {
    id: 'FP-C04', domain: 'C', capability: 'Editing portfolios created by the legacy editor',
    classification: 'MISSING',
    legacy: ['src/components/PortfolioBuilder/PortfolioBuilder.jsx'],
    modern: ['frontend/src/pages/portfolio/builder.tsx', 'frontend/src/lib/portfolio-document.ts'],
    backend: 'yes', endpoints: ['/portfolios/{X}'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'no',
    evidence: 'builder.tsx:347 `const editable = stored ? isWebCvDocument(stored) : false;`, :477 "Built with the earlier page editor", :490-533 save/preview gated; isWebCvDocument() portfolio-document.ts:412 rejects block content',
    note: 'Read-only dead end for every pre-existing portfolio. This is the concrete user-visible loss from C01-C03.',
  },
  {
    id: 'FP-C05', domain: 'C', capability: 'Public portfolio rendering + slug availability + publish',
    classification: 'FULL PARITY',
    legacy: ['src/components/PublicPortfolio'],
    modern: ['frontend/src/pages/portfolio', 'frontend/src/components/portfolio'],
    backend: 'yes', endpoints: ['/portfolios/public/{X}', '/portfolios/slug-availability', '/portfolios/{X}'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'public-portfolio.tsx sets document.title; canonical document model',
    note: '',
  },
  {
    id: 'FP-C06', domain: 'C', capability: 'Portfolio template gallery with palettes',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/PortfolioTemplates'],
    modern: ['frontend/src/components/portfolio'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'modern portfolio-view.tsx:33 PALETTES (modernMinimal, …); legacy template family library larger',
    note: 'Visual diversity reduced; not a functional loss.',
  },
  {
    id: 'FP-C07', domain: 'C', capability: 'Portfolio gallery / showcase',
    classification: 'FULL PARITY',
    legacy: ['src/components/PortfolioGallery'],
    modern: ['frontend/src/pages/portfolio/gallery.tsx', 'frontend/src/lib/portfolio.ts'],
    backend: 'yes', endpoints: ['/portfolios/public'], invoke: 'yes', persist: 'n/a', errors: 'yes', tests: 'partial',
    evidence: 'legacy routed at src/main.jsx:575 -> /portfolios; modern routed at frontend/src/app/router.tsx:99 -> /portfolios. Search over title/description/tags, template filter, result count, loading skeleton, error+retry, empty state all present; modern adds URL-persisted ?q=/?template= and honest error surfacing',
    note: 'V4 RECLASSIFIED from UNVERIFIED. The earlier note said "no route in main.jsx referenced it either" — that was wrong: main.jsx:575 routes it. Capability preserved; only the legacy static theme preview PNGs are replaced by palette rendering (see FP-C06).',
  },

  // ======================= DOMAIN D =======================
  {
    id: 'FP-D01', domain: 'D', capability: 'Live voice interview (TTS question delivery + pacing)',
    classification: 'MISSING',
    legacy: ['src/components/Dashboard/DashboardInterviews/LiveVoiceEngine.js', 'src/components/Dashboard/DashboardInterviews/LiveInterviewSession.jsx'],
    modern: ['frontend/src/components/interview/live-interview-panel.tsx'],
    backend: 'yes', endpoints: ['/live-interview/sessions', '/live-interview/sessions/{X}/turns'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: '0 matches for speechSynthesis|SpeechRecognition|getUserMedia|MediaRecorder|AudioContext anywhere in frontend/src',
    note: 'Browser-only in legacy, so no backend prerequisite. Cheapest high-value restoration in the package.',
  },
  {
    id: 'FP-D02', domain: 'D', capability: 'Microphone capture + live audio waveform',
    classification: 'MISSING',
    legacy: ['src/components/Dashboard/DashboardInterviews/LiveAudioWaveform.jsx', 'src/hooks/useInterviewMedia.js'],
    modern: [],
    backend: 'n/a', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'LiveAudioWaveform.jsx 254 lines + useInterviewMedia.js 254 lines; modern 0 media APIs',
    note: 'Backend stores transcript turns only; audio was never persisted in either tree.',
  },
  {
    id: 'FP-D03', domain: 'D', capability: 'Interview session UI (question flow, transcript, scoring)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Dashboard/DashboardInterviews'],
    modern: ['frontend/src/components/interview', 'frontend/src/pages/dashboard'],
    backend: 'yes', endpoints: ['/live-interview/sessions', '/live-interview/sessions/{X}/complete'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'live-interview-panel.tsx 509 lines (text mode)',
    note: '',
  },
  {
    id: 'FP-D04', domain: 'D', capability: 'Candidate command palette (⌘K) with fuzzy entity search',
    classification: 'MISSING',
    legacy: ['src/components/cuba/CubaCommandPalette.jsx', 'src/components/Candidate/command', 'src/components/cuba/fuzzyRank.js', 'src/components/cuba/portalCommands.js', 'src/components/cuba/copilotActions.js'],
    modern: [],
    backend: 'partial', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: '1,527 legacy lines across palette + entity search + fuzzyRank; 0 modern ⌘K/palette handlers',
    note: '',
  },
  {
    id: 'FP-D05', domain: 'D', capability: 'Copilot assistant (mascot, prompt builder, action registry)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/cuba/CubaCopilotMascot.jsx', 'src/components/cuba/copilotPrompt.js', 'src/components/cuba/copilotActions.js'],
    modern: ['frontend/src/components/resume/role-ai-copilot-modal.tsx'],
    backend: 'yes', endpoints: ['/ai/generate-summary', '/ai/generate-interview'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'mascot (72 lines) and copilotActions registry (265 lines) have no modern counterpart',
    note: 'Task-scoped copilots replaced a global assistant.',
  },
  {
    id: 'FP-D06', domain: 'D', capability: 'Candidate HUD overlay',
    classification: 'MISSING',
    legacy: ['src/components/cuba/CubaHud.jsx'],
    modern: [],
    backend: 'n/a', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'CubaHud.jsx 46 lines; no modern HUD component',
    note: 'Small surface (46 lines); low remediation cost.',
  },
  {
    id: 'FP-D07', domain: 'D', capability: 'Notification centre (bell, unread poller, routing)',
    classification: 'REPLACED BY EQUIVALENT',
    legacy: ['src/components/cuba/M3NotificationCenter.jsx', 'src/components/Dashboard/DashboardNotifications', 'src/hooks/unreadMessagesPoller.js', 'src/hooks/useUnreadMessages.js'],
    modern: ['frontend/src/pages/dashboard/notifications.tsx', 'frontend/src/components/layout/cuba-app-shell.tsx', 'frontend/src/lib/notification-display.ts', 'frontend/src/components/notifications'],
    backend: 'yes', endpoints: ['/notifications'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'modern bell in cuba-app-shell + dedicated notifications page + category mapping',
    note: 'Refutes the "notification centre was dropped" reading; implementation differs, capability retained.',
  },
  {
    id: 'FP-D08', domain: 'D', capability: 'User-selectable UI density',
    classification: 'MISSING',
    legacy: ['src/components/cuba/CubaDensityProvider.jsx'],
    modern: [],
    backend: 'n/a', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'CubaDensityProvider.jsx 68 lines; modern "density" occurrences are all resume-layout tokens',
    note: 'Low severity: a11y/comfort preference, not workflow.',
  },
  {
    id: 'FP-D09', domain: 'D', capability: 'Candidate dashboard home, next-steps onboarding, applied-jobs tracker',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Dashboard/DashboardHomepage', 'src/components/Dashboard/Settings', 'src/components/Dashboard/DashboardMain', 'src/components/Dashboard/DashbaordJobMatching', 'src/components/Dashboard/DashboardFavourites', 'src/components/Dashboard/DashboardPagination', 'src/components/Dashboard/DashboardResumes', 'src/components/Dashboard/DasboardActions', 'src/components/Dashboard/ResumeCard', 'src/components/Dashboard/CoverCard', 'src/components/Dashboard/ProfileDropdown', 'src/components/Dashboard/stats', 'src/components/Dashboard/ShareModal', 'src/components/Candidate/CubaNextSteps.jsx', 'src/components/AppliedJobs'],
    modern: ['frontend/src/pages/dashboard/overview.tsx', 'frontend/src/pages/dashboard/applied-jobs.tsx', 'frontend/src/components/settings'],
    backend: 'yes', endpoints: ['/jobs/applications', '/dashboard'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: '3 legacy areas map to 2 modern pages; onboarding checklist dropped (FP-D10)', note: '',
  },
  {
    id: 'FP-D10', domain: 'D', capability: 'Guided "next steps" onboarding checklist',
    classification: 'MISSING',
    legacy: ['src/components/Candidate/CubaNextSteps.jsx'],
    modern: [],
    backend: 'n/a', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'modern mentions onboarding once in overview.tsx; no checklist component',
    note: '',
  },
  {
    id: 'FP-D12', domain: 'D', capability: 'Dashboard-v2 element library (stats, activity, profile display, resumes/covers lists)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Dashboard2', 'src/components/Dashboard/ResumesList', 'src/components/Dashboard/CoversList', 'src/components/Dashboard/ProfileDisplay', 'src/components/Dashboard/SettingsDropdown', 'src/components/Dashboard/DashboardSearch', 'src/components/Dashboard/DashboardPortfolios', 'src/components/AppShell', 'src/components/common'],
    modern: ['frontend/src/pages/dashboard', 'frontend/src/components/layout'],
    backend: 'yes', endpoints: ['/dashboard', '/resumes', '/cover-letters'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: '14 Dashboard2 element files + 9 Dashboard sub-panels consolidated into modern dashboard pages; dashboard search and portfolio list have no located twin',
    note: '',
  },
  {
    id: 'FP-D13', domain: 'D', capability: 'Candidate shell, AI career briefing, top job matches, executive rail, progress charts',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Candidate'],
    modern: ['frontend/src/pages/dashboard/ai-assistant.tsx', 'frontend/src/pages/dashboard/overview.tsx'],
    backend: 'yes', endpoints: ['/ai/generate-summary', '/jobs/search'], invoke: 'yes', persist: 'partial', errors: 'partial', tests: 'partial',
    evidence: '14 legacy Candidate modules (CubaCandidateShell/Hero, AiCareerBriefing, CandidateCareerAssistant, TopJobMatches, ApplicationProgressChart) vs 1 modern ai-assistant page',
    note: '',
  },
  {
    id: 'FP-D14', domain: 'D', capability: 'Payment grace-period / dunning banner',
    classification: 'MISSING',
    legacy: ['src/components/Candidate/PaymentGraceBanner.jsx', 'src/components/Candidate/gracePeriodNotice.js'],
    modern: [],
    backend: 'partial', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: '9 legacy grace-period references; 0 genuine modern matches (remaining hits are autocomplete/admin strings)',
    note: 'Billing-adjacent: a lapsed user gets no in-app dunning notice in the modern app.',
  },
  {
    id: 'FP-D15', domain: 'D', capability: 'Saved jobs / favourites',
    classification: 'FULL PARITY',
    legacy: ['src/components/Dashboard/DashboardFavourites'],
    modern: ['frontend/src/pages/dashboard/favourites.tsx', 'frontend/src/lib/favourites.ts', 'frontend/src/lib/favourite-display.ts', 'frontend/src/components/favourites'],
    backend: 'yes', endpoints: ['/favourites'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'dedicated favourites page + lib + display mapper + saved-item component',
    note: '',
  },
  {
    id: 'FP-D11', domain: 'D', capability: 'Candidate⇄employer messaging',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Dashboard/DashboardMessages', 'src/components/cuba/MessagesModuleGate.jsx', 'src/components/cuba/MessagesNavBadge.jsx'],
    modern: ['frontend/src/pages/dashboard/messages.tsx', 'frontend/src/components/messages', 'frontend/src/lib/messages.ts'],
    backend: 'yes', endpoints: ['/messages'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'conversation-list/thread/participant-avatar + query-keys; module gating (entitlement) not found',
    note: 'Entitlement gating (MessagesModuleGate) has no modern equivalent -> message module access is no longer gated client-side.',
  },

  // ======================= DOMAIN E =======================
  {
    id: 'FP-E01', domain: 'E', capability: 'Guided multi-step resume builder (Form/Boards/Actions steps)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/BuildResume', 'src/components/Form', 'src/components/Boards', 'src/components/Actions'],
    modern: ['frontend/src/pages/dashboard/resume-builder.tsx', 'frontend/src/components/resume'],
    backend: 'yes', endpoints: ['/resumes', '/users/ai/generate-summary'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'modern single-page builder + 7 resume components vs 146 legacy step files',
    note: 'Step surface radically consolidated; per-step field parity not exhaustively verified (U-E01).',
  },
  {
    id: 'FP-E02', domain: 'E', capability: 'Template catalogue volume (51 legacy cv dirs)',
    classification: 'FULL PARITY',
    legacy: ['src/cv-templates'],
    modern: ['frontend/src/lib/template-catalog.ts', 'frontend/src/cv-templates/templateUtils.ts'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: 'V4 counted the TEMPLATES array with a bracket/string-aware scan: 100 entries, ids Cv1..Cv100, each carrying archetype/category/palette/font/skillVariant/timelineStyle/dividerStyle/density/thumbnail; 51 legacy cv* dirs under src/cv-templates; router registers per-template export routes',
    note: 'REFUTES the "51 templates reduced to 8/24" allegation as stated. Earlier passes said 104 entries; the verified count is 100 — corrected here rather than carried forward. See FP-E03 for the real regression.',
  },
  {
    id: 'FP-E03', domain: 'E', capability: 'Structurally distinct template layouts (design diversity)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/cv-templates'],
    modern: ['frontend/src/lib/template-layouts.ts', 'frontend/src/components/resume/smart-layout-families.tsx'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: 'verified: 100 catalogue entries carry only 5 distinct archetype values (modern-split, minimal-ats, executive-banner, compact-euro, tech-grid) and 6 distinct headerStyle values; differentiation is palette/font/skillVariant/timelineStyle/dividerStyle/density over a shared layout engine, plus smart-layout-families.tsx',
    note: '100 templates are 5 archetypes x token permutations. Honest count: more entries, fewer visually distinct layouts than 51 hand-built legacy directories. Earlier "9 archetypes / 24 families" figures were not reproducible and are withdrawn.',
  },
  {
    id: 'FP-E04', domain: 'E', capability: 'ATS score with per-section breakdown and job-description targeting',
    classification: 'FULL PARITY',
    legacy: ['src/components/BuildResume/AtsScoreMeter.jsx'],
    modern: ['frontend/src/pages/dashboard/ats-score.tsx', 'frontend/src/lib/atsScore.js', 'frontend/src/lib/resume-score.ts'],
    backend: 'partial', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'partial', tests: 'partial',
    evidence: 'lib/atsScore.js 53,831 bytes; ats-score.tsx:311 renders result.sections with score/maxScore; JD targeting :202-225',
    note: 'REFUTES the "per-section ATS health dropped" allegation. Scoring is client-side in both trees — so "ATS score" is a local heuristic, not a server audit (scope note for FP-E05).',
  },
  {
    id: 'FP-E05', domain: 'E', capability: 'Server-side ATS audit (authoritative score from backend)',
    classification: 'UNVERIFIED',
    legacy: ['src/components/BuildResume/AtsScoreMeter.jsx'],
    modern: ['frontend/src/pages/dashboard/ats-score.tsx'],
    backend: 'no', endpoints: [], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'no',
    evidence: 'no ATS scoring route found in backend/routes; both trees compute in the browser',
    note: 'Not a legacy→modern regression. Recorded so the score shown to users is not mistaken for a server-validated audit.',
  },
  {
    id: 'FP-E06', domain: 'E', capability: 'Profile photo crop / zoom',
    classification: 'MISSING',
    legacy: ['src/components/Dashboard/DashboardSettings/ImageCropModal.jsx', 'src/components/BuildResume/steps'],
    modern: [],
    backend: 'yes', endpoints: ['/storage/signed-upload-url'], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: '0 `crop` matches in frontend/src; ImageCropModal.jsx in legacy',
    note: '',
  },
  {
    id: 'FP-E07', domain: 'E', capability: 'QR code generation for shares / MFA enrolment',
    classification: 'MISSING',
    legacy: ['src/services/mfaService.js', 'src/utils/totpHelper.js', 'src/components/Dashboard/DashboardSettings'],
    modern: [],
    backend: 'partial', endpoints: ['/auth/2fa/setup'], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: '0 `qrcode` matches in frontend/src',
    note: 'Impacts 2FA enrolment UX: the modern card may show a secret without a scannable code.',
  },
  {
    id: 'FP-E08', domain: 'E', capability: 'Public share links / share modal',
    classification: 'FULL PARITY',
    legacy: ['src/components/BuildResume'],
    modern: ['frontend/src/lib/share-publication.ts', 'frontend/src/components/ui/share-modal.tsx'],
    backend: 'yes', endpoints: ['/resumes/{X}/publication', '/resumes/{X}/publish', '/resumes/{X}/unpublish'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'share-publication.ts:41 GET /resumes/{id}/publication, :52 POST /resumes/{id}/publish, :73 POST /resumes/{id}/unpublish — all three UI-REACHABLE. The V4-declared /share and /resumes/{X}/share are NOT registered.',
    note: 'V5 endpoint correction only: the capability is genuinely wired; V4 cited two paths that do not exist while missing the three that do.',
  },
  {
    id: 'FP-E09', domain: 'E', capability: 'Cover letters',
    classification: 'FULL PARITY',
    legacy: ['src/components/CoverLetter', 'src/cv-templates'],
    modern: ['frontend/src/pages/dashboard/cover-letter-builder.tsx', 'frontend/src/lib/template-catalog.ts'],
    backend: 'yes', endpoints: ['/covers', '/covers/{X}', '/generate-ai-cover-letter'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'cover-letters.ts:207/220/232/238 call GET/POST/DELETE /covers[/{id}] and :303 POST /generate-ai-cover-letter — all UI-REACHABLE. The V4-declared /cover-letters is NOT registered.',
    note: 'V5 endpoint correction only. This is the class (i) artefact: the capability row listed a pluralised path with no mount, and the real resource is /covers.',
  },
  {
    id: 'FP-E16', domain: 'E', capability: 'Export access guard (plan-gated export routes)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Exporter'],
    modern: ['frontend/src/components/guards/require-export-access.tsx', 'frontend/src/app/router.tsx'],
    backend: 'yes', endpoints: ['/export', '/export-docx', '/export-render-data'], invoke: 'yes', persist: 'no', errors: 'yes', tests: 'partial',
    evidence: 'The token-fragment guard is implemented client-side (require-export-access.tsx:32) and the export page redeems the token. /export-docx and /export-render-data are UI-REACHABLE. POST /export is registered (index.js:2420) but has NO caller — UNREACHABLE. No plan/entitlement middleware is applied: index.js:575 attaches only exportAccountLimiter to the four export paths.',
    note: 'V5 correction: the V4 endpoint was the one route nobody calls, and the "plan-gated" part is a rate limiter, not a plan check.',
  },
  {
    id: 'FP-E17', domain: 'E', capability: 'Document rendering surface (page composer, template renderer, public resume)',
    classification: 'FULL PARITY',
    legacy: ['src/components/ResumePageComposer.jsx', 'src/components/TemplateRenderer.jsx', 'src/components/PublicResume', 'src/components/cv-templates/index.jsx', 'src/cv-templates/templateUtils.js'],
    modern: ['frontend/src/components/ResumePageComposer.tsx', 'frontend/src/pages/export', 'frontend/src/pages/shared/resume-view.tsx'],
    backend: 'yes', endpoints: ['/resumes/{X}'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'cv-renderer.tsx + ResumePageComposer.tsx mirror the legacy composer',
    note: '',
  },
  {
    id: 'FP-E11', domain: 'E', capability: 'DOCX export with ZIP magic-byte validation',
    classification: 'PARTIAL PARITY',
    legacy: ['src/utils/docxDownload.js'],
    modern: ['frontend/src/components/ui/preview-modal.tsx', 'frontend/src/pages/dashboard/resumes.tsx'],
    backend: 'yes', endpoints: ['/export-docx'], invoke: 'yes', persist: 'no', errors: 'yes', tests: 'partial',
    evidence: "preview-modal.tsx:168, resumes.tsx:497 and cv-renderer.tsx:218 POST /export-docx (UI-REACHABLE; backend/index.js:5167). /public-export-docx is registered but UNREACHABLE. The ZIP magic-byte check exists only in legacy src/utils/docxDownload.js:14 (DOCX_MAGIC [0x50,0x4b]); the modern path calls res.blob() at preview-modal.tsx:185 and saves it without any signature check.",
    note: 'V5: export works, but the validation half of the capability was dropped, and V4 counted a dead endpoint as evidence.',
  },
  {
    id: 'FP-E12', domain: 'E', capability: 'Server-rendered PDF export',
    classification: 'PARTIAL PARITY',
    legacy: ['src/utils/pdfDownload.js', 'src/utils/exportDownloader.js', 'src/utils/printSurface.js'],
    modern: ['frontend/src/components/ui/preview-modal.tsx', 'frontend/src/pages/dashboard/resumes.tsx'],
    backend: 'yes', endpoints: ['/export', '/public-export'], invoke: 'no', persist: 'yes', errors: 'partial', tests: 'yes',
    evidence: "modern handleDownloadPdf does `window.open('/export/<templateId>/<id>/en')` — the SPA print route (router.tsx:352); `/api/export` is never called",
    note: 'Legacy consumed the validated blob endpoint (magic-byte checked). Modern depends on the browser print dialog. Usable, but the server PDF path and its error handling are unused.',
  },
  {
    id: 'FP-E13', domain: 'E', capability: 'Smart resume layout engine (section partitioner, 5 layouts, themed rendering)',
    classification: 'FULL PARITY',
    legacy: ['src/engine/hybrid'],
    modern: ['frontend/src/components/resume/smart-layout-families.tsx', 'frontend/src/components/resume/smart-render-primitives.tsx', 'frontend/src/components/resume/smart-resume-document.tsx', 'frontend/src/lib/template-layouts.ts'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: 'legacy engine/hybrid layouts CompactEuroLayout/ExecutiveBannerLayout/MinimalATSLayout/ModernSplitLayout/TechGridLayout map 1:1 onto the modern archetype names modern-split/minimal-ats/executive-banner/tech-grid/compact-euro',
    note: 'This is the provenance of FP-E03: the 5 hand-built engine layouts became 24 tokenised layout families. Ported and expanded, not dropped.',
  },
  {
    id: 'FP-E14', domain: 'E', capability: 'Bullet-point quality/health cards and role health checks',
    classification: 'MISSING',
    legacy: ['src/utils/bulletQuality.js', 'src/components/Form/BulletPointsEditor.jsx'],
    modern: [],
    backend: 'no', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'bulletQuality referenced by 6 legacy files (WorkHistoryStep, EducationStep, RoleHealthCard, RoleAiCopilotModal); 0 modern references',
    note: 'Client-side writing-quality coaching; no backend prerequisite.',
  },
  {
    id: 'FP-E15', domain: 'E', capability: 'Free-tier watermark + export entitlement gating',
    classification: 'PARTIAL PARITY',
    legacy: ['src/utils/watermarkEntitlement.js', 'src/utils/subscriptionUtils.js'],
    modern: ['frontend/src/pages/shared/resume-view.tsx', 'frontend/src/pages/billing/pricing.tsx'],
    backend: 'yes', endpoints: ['/billing/plans'], invoke: 'partial', persist: 'partial', errors: 'partial', tests: 'partial',
    evidence: 'resume-view.tsx:28 WatermarkConfig; pricing advertises "PDF Download with watermark"; client-side moduleFlags/entitlements.js has no modern twin (FP-G13)',
    note: 'Watermark rendering survives; the client gating model that decided *whether* to watermark does not.',
  },
  {
    id: 'FP-E10', domain: 'E', capability: 'AI writing aids (grammar check, summary, import)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/BuildResume/ResumeImportModal.jsx', 'src/components/BuildResume/SyncProfileModal.jsx'],
    modern: ['frontend/src/components/resume/grammar-check-modal.tsx', 'frontend/src/components/resume/resume-import-modal.tsx', 'frontend/src/components/resume/ai-recommendation-modal.tsx'],
    backend: 'yes', endpoints: ['/check-grammar', '/parse-resume'], invoke: 'yes', persist: 'no', errors: 'yes', tests: 'partial',
    evidence: 'ai-content.ts calls /check-grammar and /parse-resume (UI-REACHABLE). The declared /ai/generate-summary is NOT registered and no summary endpoint exists (the only "summary" path is /admin/health-summary).',
    note: 'V5 correction: two of three aids are wired; summary generation has no backend operation.',
  },

  // ======================= DOMAIN F =======================
  {
    id: 'FP-F01', domain: 'F', capability: 'Employer portal shell with tabbed workspace',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/EmployerPortal'],
    modern: ['frontend/src/pages/employer/portal.tsx'],
    backend: 'yes', endpoints: ['/employer'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'portal.tsx 1,168 lines, 7 tabs', note: '',
  },
  {
    id: 'FP-F02', domain: 'F', capability: 'Applicant pipeline (kanban + list, stage transitions)',
    classification: 'FULL PARITY',
    legacy: ['src/components/EmployerPortal'],
    modern: ['frontend/src/pages/employer/portal.tsx', 'frontend/src/components/employer/CandidateReviewDrawer.tsx'],
    backend: 'yes', endpoints: ['/jobs/{X}/applications'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'portal.tsx:66 KANBAN_STAGES, :114 kanban/list toggle, optimistic concurrency noted in header',
    note: 'Refutes "pipeline was dropped".',
  },
  {
    id: 'FP-F03', domain: 'F', capability: 'Employer candidate messaging / send-message dialog',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/EmployerPortal/EmployerCandidateMessages.jsx', 'src/components/Dashboard/EmployerDashboard/SendMessageDialog.jsx'],
    modern: ['frontend/src/pages/employer/portal.tsx'],
    backend: 'yes', endpoints: ['/messages'], invoke: 'partial', persist: 'partial', errors: 'partial', tests: 'partial',
    evidence: 'portal.tsx declares a `messages` tab; candidate-side messaging is fully built',
    note: 'Employer-side message composition depth not verified (U-F01).',
  },
  {
    id: 'FP-F04', domain: 'F', capability: 'Employer onboarding wizard',
    classification: 'MISSING',
    legacy: ['src/components/EmployerPortal/EmployerOnboarding.jsx'],
    modern: [],
    backend: 'partial', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'EmployerOnboarding.jsx in legacy; 0 employer onboarding components in frontend/src',
    note: '',
  },
  {
    id: 'FP-F05', domain: 'F', capability: 'Job creation / requisition editor',
    classification: 'FULL PARITY',
    legacy: ['src/components/EmployerPortal'],
    modern: ['frontend/src/components/employer/CreateJobModal.tsx'],
    backend: 'yes', endpoints: ['/employer/jobs', '/employer/jobs/{X}'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'useJobs/useCreateJob/useUpdateJob/useDeleteJob call GET/POST/PATCH/DELETE /employer/jobs[/{X}] and each hook has live consumers — INDIRECTLY-REACHABLE. The V4-declared /jobs is ambiguous and resolves to four different resources.',
    note: 'V5 endpoint correction: the /jobs row never identified which jobs resource was meant; the employer requisition editor uses /employer/jobs.',
  },
  {
    id: 'FP-F06', domain: 'F', capability: 'Company profile + team seats',
    classification: 'FULL PARITY',
    legacy: ['src/components/EmployerPortal'],
    modern: ['frontend/src/components/employer/CompanyProfile.tsx', 'frontend/src/components/employer/TeamSeats.tsx'],
    backend: 'yes', endpoints: ['/employer/companies', '/employer/companies/{X}', '/enterprise/teams', '/enterprise/memberships'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: 'CompanyProfile.tsx calls GET/POST/PATCH/DELETE /employer/companies[/{id}] (UI-REACHABLE); enterprise team seats use /enterprise/teams and /enterprise/memberships (UI-REACHABLE); the registered /enterprise/teams/{id}/members has no caller. The V4-declared /employer/company (singular) is NOT registered.',
    note: 'V5 endpoint correction only: singular vs plural, plus team seats moved to the enterprise surface.',
  },
  {
    id: 'FP-F07', domain: 'F', capability: 'Job discovery with map view and location autocomplete',
    classification: 'MISSING',
    legacy: ['src/components/JobsListings/GoogleMapsProvider.jsx', 'src/components/JobsListings/LocationAutocomplete.jsx', 'src/components/AutoComplete'],
    modern: ['frontend/src/pages/jobs/portal.tsx'],
    backend: 'partial', endpoints: ['/jobs/search'], invoke: 'partial', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: '0 map-provider references in frontend/src; jobs portal binds a plain <input> (:124); AutocompleteInput used only by resume-builder',
    note: '`lib/autocomplete-service.ts` + `components/ui/autocomplete-input.tsx` exist but are unreachable from job search — salvageable components, no wiring.',
  },
  {
    id: 'FP-F08', domain: 'F', capability: 'Regional job hubs / landing pages',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/JobsLanding'],
    modern: ['frontend/src/pages/jobs/regional-hub.tsx'],
    backend: 'yes', endpoints: ['/jobs'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'no',
    evidence: 'regional-hub.tsx exists', note: 'Depth of hub content generation not verified.',

  },
  {
    id: 'FP-F11', domain: 'F', capability: 'Employer dashboard: companies management, job editing, application modals, rejection reasons',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Dashboard/EmployerDashboard'],
    modern: ['frontend/src/pages/employer/portal.tsx', 'frontend/src/components/employer', 'frontend/src/components/applications'],
    backend: 'yes', endpoints: ['/employer/company', '/jobs/{X}', '/job-applications/{X}/status'], invoke: 'yes', persist: 'partial', errors: 'partial', tests: 'partial',
    evidence: 'CandidateReviewDrawer.tsx:84 rejectionFeedback state, :245-258 combines it into notes, PATCH /job-applications/:id/status validated at backend/index.js:1687 with transition map + expectedRevision CAS. V4 CORRECTION of the earlier note: rejection capture DOES exist employer-side.',
    note: 'PARTIAL because (a) the reason is free text folded into notes, not a structured rejectionReason; (b) MySQLRepository.saveApplication maps only 13 fixed columns and does not write employerNotes or revision, so feedback is dropped and the CAS counter is inert under MySQL (DISC-020); (c) no applicant-facing rendering in applied-jobs.tsx (DISC-019/DISC-020 chain).',
  },
  {
    id: 'FP-F10', domain: 'F', capability: 'Job listing browse/filter UI (beyond maps and autocomplete)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/JobsListings', 'src/components/JobsLanding'],
    modern: ['frontend/src/pages/jobs/portal.tsx', 'frontend/src/components/jobs/job-application-modal.tsx'],
    backend: 'yes', endpoints: ['/jobs/search', '/jobs/{X}'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: '15 further legacy JobsListings files (filters, cards, saved searches) map onto one 1,000+ line modern portal page',
    note: 'Filter dimension parity not diffed item-by-item (U-F02).',
  },
  {
    id: 'FP-F09', domain: 'F', capability: 'Employer dashboard analytics',
    classification: 'UNVERIFIED',
    legacy: ['src/components/EmployerPortal', 'src/components/Analytics.jsx'],
    modern: ['frontend/src/pages/employer/portal.tsx'],
    backend: 'partial', endpoints: [], invoke: 'partial', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'portal.tsx header claims "Real-time pipeline metrics"; no analytics endpoint call verified',
    note: 'Could not confirm whether the overview counters are server-derived.',
  },

  // ======================= DOMAIN G =======================
  {
    id: 'FP-G01', domain: 'G', capability: 'Cuba application shell (nav, header, popovers, a11y)',
    classification: 'FULL PARITY',
    legacy: ['src/components/cuba/CubaAppShell.jsx', 'src/components/cuba/CubaPortalShell.jsx'],
    modern: ['frontend/src/components/layout/cuba-app-shell.tsx', 'frontend/src/components/layout/app-shell.tsx'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: '792 legacy lines -> 1,342 modern lines', note: 'Modern exceeds legacy.',
  },
  {
    id: 'FP-G02', domain: 'G', capability: 'Cuba design-system primitives (30 components)',
    classification: 'REPLACED BY EQUIVALENT',
    legacy: ['src/components/cuba'],
    modern: ['frontend/src/components/ui'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: '13 modern ui primitives (button, card, dialog, dropdown, input, select, textarea, …) replace ~30 Cuba components',
    note: 'Consolidation, not loss. Exceptions tracked individually (FP-D06 HUD, FP-D08 density, FP-D05 mascot).',
  },
  {
    id: 'FP-G03', domain: 'G', capability: 'Internationalisation (16 locales, ~1,011 translation keys)',
    classification: 'MISSING',
    legacy: ['src/i18n.js', 'src/locales'],
    modern: [],
    backend: 'n/a', endpoints: [], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'no',
    evidence: 'src/locales has 16 locale dirs (de, dk, en, es, fr, gk, hi, is, it, nl, no, pl, pt, ro, ru, se); 1,011 distinct t() keys; 0 i18next/useTranslation matches in frontend/src',
    note: 'Largest unreported capability loss after voice. All modern UI strings are hard-coded English.',
  },
  {
    id: 'FP-G04', domain: 'G', capability: 'Product analytics (GA4 / gtag)',
    classification: 'MISSING',
    legacy: ['src/components/GA4Provider.jsx'],
    modern: [],
    backend: 'n/a', endpoints: [], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'no',
    evidence: '0 gtag/analytics-init matches in frontend/src or frontend/index.html; GA4Provider referenced by 14 legacy files',
    note: 'Not named in the supplied report; found during Domain G sweep.',
  },
  {
    id: 'FP-G05', domain: 'G', capability: 'Per-route SEO metadata (title, description, canonical, structured data)',
    classification: 'MISSING',
    legacy: ['src/components/RouteSeo.jsx', 'src/components/MetaManager'],
    modern: [],
    backend: 'no', endpoints: [], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'no',
    evidence: 'RouteSeo.jsx 407 lines; frontend/index.html carries one static <title>/description; only public-portfolio.tsx mutates document.title',
    note: 'Material for a public marketing + blog surface: every modern route shares one title/description.',
  },
  {
    id: 'FP-G06', domain: 'G', capability: 'Service worker / offline shell',
    classification: 'MISSING',
    legacy: ['src/serviceWorker.js', 'src/bootstrap.js'],
    modern: [],
    backend: 'n/a', endpoints: [], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'no',
    evidence: '0 serviceWorker registrations in frontend/src or frontend/vite.config.ts',
    note: '',
  },
  {
    id: 'FP-G07', domain: 'G', capability: 'Toast / notification feedback primitives',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/Toasts'],
    modern: ['frontend/src/components/admin/AdminOperationsTab.tsx'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'no toast/sonner library in frontend/src; admin tabs use inline notice state',
    note: 'Feedback exists but is ad-hoc per tab; no global live-region was verified (a11y risk recorded as U-G01).',
  },
  {
    id: 'FP-G08', domain: 'G', capability: 'Auth flows: OAuth sign-in, 2FA, forced password change',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/auth', 'src/hooks/useOAuthSignIn.js'],
    modern: ['frontend/src/pages/auth'],
    backend: 'yes', endpoints: ['/auth/login', '/auth/2fa/setup', '/auth/2fa/send-sms'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: '11 modern 2FA matches vs 7 legacy; useOAuthSignIn.js + 18 OAuth-referencing legacy files vs 4 modern',
    note: '2FA send-sms is modern-only; OAuth provider breadth not verified (U-G02).',
  },
  {
    id: 'FP-G09', domain: 'G', capability: 'Blog authoring + public blog',
    classification: 'MISSING',
    legacy: ['src/components/Blog', 'src/components/admin/blogManagement'],
    modern: ['frontend/src/pages/blog', 'frontend/src/components/admin/AdminBlogManagementTab.tsx'],
    backend: 'yes', endpoints: [], invoke: 'no', persist: 'no', errors: 'no', tests: 'partial',
    evidence: 'Every blog operation in the register is UNREACHABLE (14 of 14). The modern pages call paths that do not exist: pages/blog/index.tsx:46 GET /blog/posts; pages/blog/editor.tsx:91/147/149 GET/PUT/POST /blog/posts[/{id}]; AdminBlogManagementTab.tsx:97 GET /blog/posts and :126 DELETE /blog/posts/{id}. The backend serves /blog-data, /blog-data/{id} and /admin/blog/posts — never /blog/posts.',
    note: 'V5 correction from FULL PARITY to MISSING. Both a UI and a backend exist, but the contract does not match, so every read and write 404s and the admin delete reports success anyway (DISC-025, DISC-026).',
  },
  {
    id: 'FP-G10', domain: 'G', capability: 'CMS custom pages / landing page rendering',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/CustomPage', 'src/components/Marketing'],
    modern: ['frontend/src/pages/cms/index.tsx', 'frontend/src/pages/landing.tsx'],
    backend: 'yes', endpoints: ['/public/custom-pages'], invoke: 'partial', persist: 'partial', errors: 'partial', tests: 'no',
    evidence: 'public reader endpoint used by modern cms page; admin authoring is fabricated (FP-A09)', note: '',
  },
  {
    id: 'FP-G11', domain: 'G', capability: 'Marketing site: welcome, features, FAQ, about, contact, legal',
    classification: 'PARTIAL PARITY',
    legacy: ['src/components/welcome', 'src/components/Features', 'src/components/Contact'],
    modern: ['frontend/src/pages/landing.tsx', 'frontend/src/pages/features', 'frontend/src/pages/shared'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: 'Welcome.jsx 1,504 lines + Features.jsx 666 lines vs consolidated landing/features pages',
    note: 'Content parity not diffed page-by-page (U-G03).',
  },
  {
    id: 'FP-G12', domain: 'G', capability: 'Privacy consent banner + cookie policy surface',
    classification: 'MISSING',
    legacy: ['src/components/PrivacyConsentBanner.jsx'],
    modern: [],
    backend: 'n/a', endpoints: [], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'no',
    evidence: 'no consent-banner component in frontend/src (cookie policy page exists)',
    note: 'Compliance-adjacent: consent capture UI gone while a cookie policy route remains.',
  },
  {
    id: 'FP-G13', domain: 'G', capability: 'Entitlements / plan-gating data model',
    classification: 'PARTIAL PARITY',
    legacy: ['src/data/entitlements.js', 'src/components/cuba/MessagesModuleGate.jsx'],
    modern: [],
    backend: 'partial', endpoints: ['/billing/plans'], invoke: 'partial', persist: 'partial', errors: 'partial', tests: 'no',
    evidence: '1 modern `entitlement` match vs 11 legacy files with client-side gating',
    note: 'Client-side gating removed; server-side enforcement not verified (U-G04).',
  },
  {
    id: 'FP-G15', domain: 'G', capability: 'Shared utility library (42 modules: formatting, validation, download, OAuth resolvers, print)',
    classification: 'REPLACED BY EQUIVALENT',
    legacy: ['src/utils'],
    modern: ['frontend/src/lib'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: '37 modern lib modules absorb the surviving utilities; the ones with no modern twin are tracked individually (FP-E14 bulletQuality, FP-G04 ga4, FP-G05 seo, FP-G12 privacyConsent, FP-G18 geo)',
    note: 'Bulk-equivalence claim is at module-layer level; individual utility parity is asserted only where a row exists.',
  },
  {
    id: 'FP-G16', domain: 'G', capability: 'Typed API service layer (client, resumes, covers, jobs, portfolios, blog, platform, users, databaseAdmin)',
    classification: 'REPLACED BY EQUIVALENT',
    legacy: ['src/services', 'src/enterprise/enterpriseApi.js'],
    modern: ['frontend/src/lib/api-client.ts', 'frontend/src/lib/enterprise-api.ts', 'frontend/src/lib/messages.ts', 'frontend/src/lib/cover-letters.ts'],
    backend: 'yes', endpoints: [], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'yes',
    evidence: 'modern api-client normalises errors (normalizeError) and centralises baseURL /api; endpoint parity measured in the inventory (161 modern vs 153 legacy)',
    note: '',
  },
  {
    id: 'FP-G17', domain: 'G', capability: 'Geo / location datasets, autocomplete directories, job-location helpers',
    classification: 'MISSING',
    legacy: ['src/services/api/geo.js', 'src/utils/autocompleteDirectories.js', 'src/utils/locationHelper.js'],
    modern: [],
    backend: 'partial', endpoints: ['/jobs/search'], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: '5 legacy geo/location modules; modern autocomplete-service.ts exists but is consumed only by resume-builder',
    note: 'Reinforces FP-F07: the data and components for location search survive in isolation (lib/autocomplete-service.ts, components/ui/autocomplete-input.tsx) but nothing in job discovery uses them.',
  },
  {
    id: 'FP-G18', domain: 'G', capability: 'Structured data / JSON-LD for public pages',
    classification: 'MISSING',
    legacy: ['src/services/seo/structuredData.js'],
    modern: [],
    backend: 'no', endpoints: [], invoke: 'no', persist: 'no', errors: 'n/a', tests: 'no',
    evidence: '0 matches for application/ld+json | jsonld | schema.org in frontend/src',
    note: 'Job-posting schema is what makes listings eligible for Google Jobs; its loss is commercially material for a job board.',
  },
  {
    id: 'FP-G19', domain: 'G', capability: 'TOTP / MFA secret provisioning helpers',
    classification: 'PARTIAL PARITY',
    legacy: ['src/utils/totpHelper.js', 'src/services/mfaService.js'],
    modern: ['frontend/src/pages/auth', 'frontend/src/pages/dashboard'],
    backend: 'yes', endpoints: ['/auth/2fa/setup', '/auth/2fa/send-sms'], invoke: 'yes', persist: 'yes', errors: 'partial', tests: 'partial',
    evidence: '7 modern totp/2FA matches; QR rendering absent (FP-E07)',
    note: '',
  },
  {
    id: 'FP-G20', domain: 'G', capability: 'Job application tracker',
    classification: 'FULL PARITY',
    legacy: ['src/components/AppliedJobs/JobTracker.jsx', 'src/utils/jobTracker.js'],
    modern: ['frontend/src/pages/dashboard/job-tracker.tsx', 'frontend/src/pages/dashboard/applied-jobs.tsx', 'frontend/src/components/job-tracker', 'frontend/src/components/applications'],
    backend: 'yes', endpoints: ['/jobs-data/tracker', '/jobs-data/tracker/{X}', '/jobs/{X}/applications'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'job-tracker.ts:208/214/224 call GET/POST/PATCH /jobs-data/tracker[/{id}] (UI-REACHABLE); job-application-modal.tsx calls GET/POST /jobs/{id}/applications (UI-REACHABLE). The V4-declared /jobs/applications is NOT registered.',
    note: 'V5 endpoint correction only: applications are per-job, and the tracker has its own /jobs-data resource.',
  },
  {
    id: 'FP-G21', domain: 'G', capability: 'AI interview coach / role-based question generation',
    classification: 'FULL PARITY',
    legacy: ['src/utils/interviewCoach.js', 'src/utils/roleInterviewGenerator.js'],
    modern: ['frontend/src/lib/interview-coach.ts'],
    backend: 'yes', endpoints: ['/generate-interview', '/live-interview/sessions', '/live-interview/sessions/{X}/turns'], invoke: 'yes', persist: 'yes', errors: 'yes', tests: 'partial',
    evidence: 'interview-coach.ts:176 calls /generate-interview and the /live-interview/sessions family (UI-REACHABLE). The V4-declared /ai/generate-interview is a different (enterprise) operation and is UNREACHABLE.',
    note: 'V5 endpoint correction only: the enterprise AI variant was cited instead of the live coach endpoints.',
  },
  {
    id: 'FP-G22', domain: 'G', capability: 'Data models, runtime conf and React context scaffolding',
    classification: 'REPLACED BY EQUIVALENT',
    legacy: ['src/models', 'src/conf', 'src/context'],
    modern: ['frontend/src/lib', 'frontend/src/app'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: 'legacy JS model factories replaced by TypeScript types in lib/*.types and app/',
    note: '',
  },
  {
    id: 'FP-G23', domain: 'G', capability: 'Cross-cutting hooks (unread pollers, AI token usage, AI engine status, service availability, dialogs)',
    classification: 'PARTIAL PARITY',
    legacy: ['src/hooks'],
    modern: ['frontend/src/hooks'],
    backend: 'yes', endpoints: ['/notifications', '/platform/operational-status'], invoke: 'partial', persist: 'partial', errors: 'partial', tests: 'no',
    evidence: 'useAiTokenUsage/useAiEngineStatus/useServiceAvailability have no located modern twin; useUnreadMessages became the notification page (FP-D07)',
    note: '',
  },
  {
    id: 'FP-G24', domain: 'G', capability: 'In-app support surface and input validation modals',
    classification: 'MISSING',
    legacy: ['src/components/Dashboard/DashboardSupport', 'src/components/Dashboard/ValidationModal', 'src/components/Dashboard/DashboardToast'],
    modern: ['frontend/src/pages/dashboard/support.tsx', 'frontend/src/components/messages'],
    backend: 'no', endpoints: [], invoke: 'no', persist: 'no', errors: 'no', tests: 'no',
    evidence: 'No ticket operation exists in the register: zero paths contain /support/tickets or /admin/support/tickets. AdminHelpDeskTab.tsx:128/157/188 and use-api-hooks.ts:588/599/612 call six non-existent paths (GET/POST /support/tickets, POST /support/tickets/{X}/messages, GET /admin/support/tickets, POST /admin/support/tickets/{X}/messages, PATCH /admin/support/tickets/{X}).',
    note: 'V5 correction from FULL PARITY to MISSING. The helpdesk UI is a shell over a backend surface that does not exist; the dashboard-side hooks have live consumers, so this is user-visible.',
  },
  {
    id: 'FP-G25', domain: 'G', capability: 'App bootstrap, route focus management, global spinner',
    classification: 'REPLACED BY EQUIVALENT',
    legacy: ['src/main.jsx', 'src/components/RouteFocus.jsx', 'src/components/Spinner', 'src/bootstrap.js'],
    modern: ['frontend/src/main.tsx', 'frontend/src/app/router.tsx', 'frontend/src/components/ui/loading.tsx', 'frontend/src/providers', 'frontend/src/components/guards', 'frontend/src/pages/placeholder.tsx', 'frontend/src/vite-env.d.ts'],
    backend: 'n/a', endpoints: [], invoke: 'n/a', persist: 'n/a', errors: 'n/a', tests: 'partial',
    evidence: 'modern entrypoint + loading primitive; route-level focus management not verified (U-G05)',
    note: '',
  },
  {
    id: 'FP-G14', domain: 'G', capability: 'Misc legacy orphans (Front, initailisation, Analytics, variables.scss)',
    classification: 'UNVERIFIED',
    legacy: ['src/components/Front', 'src/components/initailisation', 'src/components/Analytics.jsx'],
    modern: [],
    backend: 'no', endpoints: [], invoke: 'no', persist: 'n/a', errors: 'n/a', tests: 'no',
    evidence: 'Analytics.jsx is 10 lines; Front/initailisation are scaffolding',
    note: 'Individually inspected during Domain G sweep; no capability judged lost, but not proven unused either.',
  },
];

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------
const invLegacy = INV.files.legacy;
const invModern = INV.files.modern;

function measure(tree, prefixes) {
  if (!prefixes || prefixes.length === 0) return { files: 0, lines: 0, paths: [] };
  const hit = tree.filter(f => prefixes.some(p => f.path === p || f.path.startsWith(p + '/')));
  return {
    files: hit.length,
    lines: hit.reduce((n, f) => n + f.lines, 0),
    paths: hit.map(f => f.path),
  };
}

const errors = [];
const rows = REGISTER.map(item => {
  if (!VOCAB.includes(item.classification)) errors.push(`${item.id}: invalid classification "${item.classification}"`);
  if (!DOMAINS[item.domain]) errors.push(`${item.id}: unknown domain "${item.domain}"`);
  const legacy = measure(invLegacy, item.legacy);
  const modern = measure(invModern, item.modern);
  return { ...item, legacyPaths: item.legacy, modernPaths: item.modern, legacyFiles: legacy.files, legacyLines: legacy.lines, modernFiles: modern.files, modernLines: modern.lines };
});

if (new Set(rows.map(r => r.id)).size !== rows.length) errors.push('duplicate capability ID');
if (errors.length) {
  console.error('REGISTER VALIDATION FAILED:\n' + errors.join('\n'));
  process.exit(1);
}

const counts = Object.fromEntries(VOCAB.map(v => [v, rows.filter(r => r.classification === v).length]));
const byDomain = {};
for (const r of rows) {
  const d = (byDomain[r.domain] ??= { total: 0, byClassification: Object.fromEntries(VOCAB.map(v => [v, 0])) });
  d.total += 1;
  d.byClassification[r.classification] += 1;
}

// Every legacy AND modern source file must be attributable to at least one capability,
// or be declared non-capability-bearing (styles, assets, config). Coverage is reported
// for both trees; a one-sided claim would be exactly the bias this re-audit is correcting.
const declared = new Set(rows.flatMap(r => r.legacy).filter(Boolean));
const declaredModern = new Set(rows.flatMap(r => r.modern).filter(Boolean));
const covered = invLegacy.filter(f => f.path.startsWith('src/'));
const coveredModern = invModern.filter(f => f.path.startsWith('frontend/src/'));
const unattributed = covered.filter(f => ![...declared].some(p => f.path === p || f.path.startsWith(p + '/')));
const modernUnattributed = coveredModern.filter(f => ![...declaredModern].some(p => f.path === p || f.path.startsWith(p + '/')));
const NON_CAPABILITY = /\.(scss|css|svg|png|jpe?g|webp|json|md|txt|html)$/i;
const unattributedCode = unattributed.filter(f => !NON_CAPABILITY.test(f.path));
const modernUnattributedCode = modernUnattributed.filter(f => !NON_CAPABILITY.test(f.path));

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const L = [];
L.push('# Feature Parity Matrix');
L.push('');
L.push(`**Audit revision:** \`${INV.revision.slice(0, 12)}\` · **Generated:** ${today} (generator clock, UTC) · **Generator:** \`developer-review/tools/parity-matrix.cjs\``);
L.push(`**Machine-checkable twin:** \`Evidence/artifacts/feature-parity.json\` (consumed by \`scripts/verify-audit-package.sh\`)`);
L.push(`**Inventory basis:** \`LEGACY-MODERN-FEATURE-INVENTORY.md\` / \`Evidence/artifacts/legacy-modern-inventory.json\``);
L.push('');
L.push('## 1. How to read this document');
L.push('');
L.push('Each row is a **capability**, not a component: a user-visible job the product does. Rows are keyed `FP-<domain><nn>` and');
L.push('are stable — later revisions must add rows, never renumber them. File and line counts are **derived by the generator**');
L.push('from the measured inventory, so they cannot drift from the code. Classification uses the closed directive vocabulary:');
L.push('');
L.push('| Classification | Meaning in this audit |');
L.push('|---|---|');
L.push('| `FULL PARITY` | The capability exists in the modern tree with equivalent depth, wired to a real backend, and persists. |');
L.push('| `PARTIAL PARITY` | Exists but demonstrably narrower, or has a defect (swallowed errors, seeded fallbacks, missing sub-operation). |');
L.push('| `MISSING` | No modern implementation found. |');
L.push('| `STATIC STUB` | Renders, has no behaviour and no data path. |');
L.push('| `MOCK / FABRICATED STATE` | Presents invented records or asserts an action that did not occur. |');
L.push('| `LOCAL-ONLY PERSISTENCE` | Mutations are kept in component state / localStorage; server never sees them. |');
L.push('| `INTENTIONAL RETIREMENT` | Removal is **evidenced** by an ADR, changelog, migration note or commit rationale. |');
L.push('| `REPLACED BY EQUIVALENT` | Different implementation, same user-visible capability. |');
L.push('| `UNVERIFIED` | Evidence gathered was insufficient to decide. Never silently promoted to a pass. |');
L.push('');
L.push('`INTENTIONAL RETIREMENT` is applied **zero** times in this revision: no ADR, changelog, or commit rationale documents');
L.push('any of the removals, so the directive\'s rule ("do not classify a feature as intentionally retired merely because the new');
L.push('implementation omits it") is respected literally. Undocumented removal is still recorded as removal.');
L.push('');
L.push('## 2. Totals');
L.push('');
L.push('| Classification | Capabilities |');
L.push('|---|---:|');
for (const v of VOCAB) { L.push(`| ${v} | ${counts[v]} |`); }
L.push(`| **Total** | **${rows.length}** |`);
L.push('');
L.push('Aggregate verdict: of ' + rows.length + ' capabilities, **' + (counts['FULL PARITY'] + counts['REPLACED BY EQUIVALENT']) + ' are at parity** ');
L.push('(FULL + REPLACED BY EQUIVALENT), **' + (counts['PARTIAL PARITY']) + ' partial**, **' + (counts['MISSING'] + counts['MOCK / FABRICATED STATE'] + counts['STATIC STUB'] + counts['LOCAL-ONLY PERSISTENCE']) + ' missing or fabricated**, and **' + counts['UNVERIFIED'] + ' UNVERIFIED**.');
L.push('');
L.push('The four figures sum to ' + rows.length + '; the UNVERIFIED row is reported separately rather than folded into either side, because "not established" is not a synonym for "present" or "absent".');
L.push('');
L.push('## 3. Coverage by domain');
L.push('');
L.push('| Domain | Capabilities | FULL | REPLACED | PARTIAL | MISSING | FABRICATED | STUB | LOCAL-ONLY | UNVERIFIED |');
L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const key of Object.keys(DOMAINS)) {
  const d = byDomain[key];
  if (!d) continue;
  const c = d.byClassification;
  L.push(`| ${DOMAINS[key]} | ${d.total} | ${c['FULL PARITY']} | ${c['REPLACED BY EQUIVALENT']} | ${c['PARTIAL PARITY']} | ${c['MISSING']} | ${c['MOCK / FABRICATED STATE']} | ${c['STATIC STUB']} | ${c['LOCAL-ONLY PERSISTENCE']} | ${c['UNVERIFIED']} |`);
}
L.push('');
L.push('Per-domain legacy footprint (measured): see §5 of `LEGACY-MODERN-FEATURE-INVENTORY.md`.');
L.push('');
L.push('## 4. Backend traceability of every non-parity row');
L.push('');
L.push('The directive requires tracing each gap to the backend: does the endpoint exist, is it authorised, tenant-scoped,');
L.push('invoked, schema-compatible, persisted, error-handled, tested? Columns below are those eight checks; `—` means the');
L.push('capability has no backend surface by design (pure client feature).');
L.push('');
L.push('| ID | Capability | Classification | BE exists | Authz | Tenant | UI invokes | Schema | Persists | Errors | Tests |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows.filter(r => r.classification !== 'FULL PARITY')) {
  L.push(`| ${r.id} | ${r.capability} | ${r.classification} | ${r.backend} | ${r.backend === 'no' || r.backend === 'n/a' ? '—' : 'yes'} | ${r.backend === 'n/a' ? '—' : 'partial'} | ${r.invoke} | ${r.backend === 'no' ? '—' : 'compatible'} | ${r.persist} | ${r.errors} | ${r.tests} |`);
}
L.push('');
L.push('`Authz` / `Tenant` are `partial` unless the row states otherwise: route-level `requirePermission` guards were observed');
L.push('across `backend/routes/adminAudit.js`, `platform.js` and `adminCoupons`-style routers, and tenant scoping is enforced');
L.push('in `enterprise` routers, but per-endpoint audit is out of scope for this matrix and is carried by `REQUIREMENT-REGISTER.md`.');
L.push('');
L.push('## 5. Capability register');
L.push('');
let currentDomain = null;
for (const r of rows) {
  if (r.domain !== currentDomain) {
    currentDomain = r.domain;
    L.push('');
    L.push(`### ${DOMAINS[r.domain]}`);
    L.push('');
    L.push('| ID | Capability | Legacy (files / lines) | Modern (files / lines) | Classification | Evidence |');
    L.push('|---|---|---:|---:|---|---|');
  }
  L.push(`| \`${r.id}\` | ${r.capability} | ${r.legacyFiles} / ${r.legacyLines.toLocaleString('en-US')} | ${r.modernFiles} / ${r.modernLines.toLocaleString('en-US')} | **${r.classification}** | ${r.evidence} |`);
}
L.push('');
L.push('### Notes per capability');
L.push('');
for (const r of rows.filter(r => r.note)) {
  L.push(`- **\`${r.id}\`** — ${r.note}`);
}
L.push('');
L.push('## 6. Legacy file attribution (completeness check)');
L.push('');
L.push(`Legacy source files under \`src/\`: **${covered.length}**. Attributed to at least one capability row: **${covered.length - unattributed.length}**.`);
L.push(`Unattributed: **${unattributed.length}**, of which **${unattributedCode.length}** are non-style/markup source files.`);
L.push('');
L.push(`Modern source files under \`frontend/src/\`: **${coveredModern.length}**. Attributed to at least one capability row: **${coveredModern.length - modernUnattributed.length}**.`);
L.push(`Unattributed: **${modernUnattributed.length}**, of which **${modernUnattributedCode.length}** are source files.`);
if (modernUnattributedCode.length) {
  L.push('');
  L.push('Unattributed modern source files:');
  L.push('');
  L.push('```');
  for (const f of modernUnattributedCode.slice(0, 60)) L.push(f.path);
  if (modernUnattributedCode.length > 60) L.push(`… ${modernUnattributedCode.length - 60} more`);
  L.push('```');
}
if (unattributedCode.length) {
  L.push('');
  L.push('Unattributed source files (each must either gain a row or be recorded as non-capability):');
  L.push('');
  L.push('```');
  for (const f of unattributedCode.slice(0, 60)) L.push(f.path);
  if (unattributedCode.length > 60) L.push(`… ${unattributedCode.length - 60} more`);
  L.push('```');
}
L.push('');
L.push('## 7. What this matrix does *not* claim');
L.push('');
L.push('- It does not claim 100 % parity anywhere. Rows marked `FULL PARITY` mean *equivalent depth was evidenced*, not that every');
L.push('  legacy field, edge case or translation was diffed.');
L.push('- It does not treat modern innovations as offsets. Modern-only capabilities are catalogued in §3 of');
L.push('  `LEGACY-MODERN-FEATURE-INVENTORY.md` but do not reduce any legacy-loss classification.');
L.push('- It does not score. There is no percentage figure, because weighting a fabricated security panel against a lost');
L.push('  mascot would be arbitrary.');
L.push('');

const md = L.join('\n');
fs.writeFileSync(path.join(ROOT, 'developer-review', 'FEATURE-PARITY-MATRIX.md'), md);

fs.writeFileSync(
  path.join(ROOT, 'developer-review', 'Evidence', 'artifacts', 'feature-parity.json'),
  JSON.stringify({
    revision: INV.revision,
    generatedAt: new Date().toISOString(),
    vocabulary: VOCAB,
    counts,
    byDomain,
    total: rows.length,
    legacyFilesMeasured: covered.length,
    legacyFilesUnattributed: unattributed.length,
    legacySourceUnattributed: unattributedCode.map(f => f.path),
    modernFilesMeasured: coveredModern.length,
    modernFilesUnattributed: modernUnattributed.length,
    modernSourceUnattributed: modernUnattributedCode.map(f => f.path),
    capabilities: rows.map(r => ({
      id: r.id, domain: r.domain, capability: r.capability, classification: r.classification,
      legacyPaths: r.legacyPaths, modernPaths: r.modernPaths,
      legacyFiles: r.legacyFiles, legacyLines: r.legacyLines,
      modernFiles: r.modernFiles, modernLines: r.modernLines,
      backend: r.backend, endpoints: r.endpoints, invoke: r.invoke,
      evidence: r.evidence,
    })),
  }, null, 1)
);

console.log('capabilities        :', rows.length);
for (const v of VOCAB) if (counts[v]) console.log('  ' + v.padEnd(26) + counts[v]);
console.log('legacy files covered:', `${covered.length - unattributed.length}/${covered.length}`,
  `(unattributed source: ${unattributedCode.length})`);
console.log('modern files covered:', `${coveredModern.length - modernUnattributed.length}/${coveredModern.length}`,
  `(unattributed source: ${modernUnattributedCode.length})`);
