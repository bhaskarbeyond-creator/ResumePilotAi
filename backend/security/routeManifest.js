'use strict';

/**
 * Declarative route authorisation manifest (REC-006, RCA-004/RCA-007/RCA-008).
 *
 * ## Why a manifest
 *
 * `security/policy.js` used to decide admin authorisation with two if-ladders
 * keyed on string prefixes. Three consequences, all observed:
 *
 *  - **Silent poisoning.** Any admin path the ladder did not name resolved to
 *    `system.config.read`. Nothing in the bundle held it, so the whole class of
 *    unlisted admin reads was super-admin-only — and no one could tell "not
 *    listed" from "deliberately restricted".
 *  - **Drift from the routes.** The ledger of paths and the ledger of routes were
 *    maintained separately, so `/admin/audit-logs` fell through to the default and
 *    an AUDITOR — the one role whose entire job is reading the audit trail — got
 *    403 while holding `audit.read`.
 *  - **Unauditable decisions.** A rule that is code cannot be reviewed as data.
 *
 * Here every rule is data with an id, so a decision has a name, a test can assert
 * on it, and a reviewer can read the whole access policy in one screen.
 *
 * ## Match semantics
 *
 * `pathname` is the mount-relative path the policy sees (`/admin/users/123`, not
 * `/api/admin/users/123`). Rules are evaluated in array order and the first match
 * wins, so specific rules must precede broad ones. `methods` is `'read'` for
 * GET/HEAD/OPTIONS, `'write'` for everything else, or `'any'`.
 *
 * ## The two defaults, and why they are declared
 *
 * Routes not named by any rule still need a decision. Rather than an implicit
 * ladder fallthrough, the manifest carries two explicit default rules:
 *
 *  - `default-admin-read` → `system.config.read`
 *  - `default-admin-write` → `system.config.write`
 *
 * These preserve pre-REC-006 behaviour exactly, and they are *tracked*: the
 * coverage test pins the number of registered admin routes that still resolve to
 * a default, so a new route cannot quietly join the unnamed set. Fully
 * enumerating every route is REC-006 phase 2 (see OPEN-ITEMS.md); this manifest
 * makes the existing surface honest first.
 *
 * ## Corrections carried by this manifest
 *
 * Each correction below is a behaviour change, chosen because the pre-REC-006
 * answer was provably wrong, and each is asserted by a test:
 *
 *  1. `/admin/audit-logs*` → `audit.read` (AUDITOR can now read the trail).
 *  2. `/admin/pages*` → `content.manage` (was: system.config.read/write).
 *  3. `/admin/coupons*` → `payments.read` / `payments.manage` (was: default read
 *     and system.config.write).
 *  4. `/admin/settings*` → explicit `system.config.read` / `.write` instead of the
 *     default, so the settings surface is named rather than falling through.
 *
 * @module security/routeManifest
 */

/**
 * @typedef {object} ManifestRule
 * @property {string} id stable identifier, used in logs and tests
 * @property {'read'|'write'|'any'} methods which request methods the rule covers
 * @property {string[]} exact exact mount-relative paths
 * @property {string[]} [prefix] mount-relative path prefixes
 * @property {string[]|string} permission permission(s); any-of, or `'*'` for
 *   super-admin only
 * @property {string} rationale why this resource/action pair, in one sentence
 * @property {boolean} [isDefault] marks the catch-all rules
 */

/** @type {ManifestRule[]} */
const RULES = [
  {
    id: 'service-account-key',
    methods: 'any',
    exact: ['/admin/firebase-service-account'],
    permission: 'secrets.manage',
    rationale: 'Reads and writes the Firebase private key; SUPER_ADMIN-exclusive because it mints identity for the whole platform.',
  },
  {
    id: 'platform-operators',
    methods: 'any',
    exact: ['/platform/operators', '/admin/operators'],
    prefix: ['/platform/operators/', '/admin/operators/'],
    permission: '*',
    rationale: 'Granting platform authority is the one action that can escalate itself; never delegable.',
  },
  {
    id: 'audit-log-read',
    methods: 'read',
    exact: ['/admin/audit-logs'],
    prefix: ['/admin/audit-logs/'],
    permission: 'audit.read',
    rationale: 'CORRECTION: the trail reads under audit.read, not the settings default, so an AUDITOR can do its job.',
  },
  {
    id: 'health-and-security-telemetry',
    methods: 'read',
    exact: [
      '/platform/health-indicator',
      '/platform/security-events',
      '/platform/queues',
      '/platform/enterprise-queue',
      '/platform/attention',
      '/platform/maintenance',
      '/platform/encryption',
      '/platform/observability',
      '/platform/backup-status',
      '/platform/payments-health',
    ],
    prefix: ['/platform/health', '/platform/operational-status', '/admin/health', '/admin/health-summary'],
    permission: 'security.read',
    rationale: 'Operational telemetry is a security-read surface; SUPPORT has no business reading infrastructure state.',
  },
  {
    id: 'admin-users-directory',
    methods: 'read',
    exact: ['/admin/users', '/admin/users/'],
    prefix: ['/admin/users/', '/admin/employer-applications'],
    permission: 'users.read',
    rationale: 'The user directory is the primary support surface and the primary PII surface; one permission for both.',
  },
  {
    id: 'admin-jobs-and-reviews',
    methods: 'read',
    exact: ['/admin/jobs', '/admin/reviews'],
    prefix: ['/admin/jobs/', '/admin/reviews/'],
    permission: ['users.read', 'tickets.manage'],
    rationale: 'Job and review moderation is performed by both the content team and the help desk.',
  },
  {
    id: 'tenants-registry',
    methods: 'read',
    exact: ['/admin/tenants', '/platform/tenants'],
    prefix: ['/admin/tenants/', '/platform/tenants/', '/enterprise/platform/tenants'],
    permission: 'tenants.read',
    rationale: 'Tenant composition is read-only for staff; lifecycle changes require the mutation rules plus step-up.',
  },
  {
    id: 'email-log-and-deliverability',
    methods: 'read',
    exact: ['/email/logs', '/email/admin/deliverability', '/email/admin/circuit-breaker-status'],
    permission: 'email.logs.read',
    rationale: 'Delivery diagnostics are email operations, not general configuration.',
  },
  {
    id: 'payment-settings-read',
    methods: 'read',
    exact: ['/admin/payment-settings', '/platform/payment-settings'],
    permission: 'payments.read',
    rationale: 'Provider configuration is billing data; AUDITOR holds payments.read by design.',
  },
  {
    id: 'payments-read',
    methods: 'read',
    exact: ['/admin/payment-orders'],
    prefix: ['/admin/payments/', '/admin/subscriptions'],
    permission: 'payments.read',
    rationale: 'Payment records, refunds and subscription state are read under the payments resource.',
  },
  {
    id: 'ai-entitlements-read',
    methods: 'read',
    exact: ['/admin/ai/entitlements'],
    permission: 'ai.usage.read',
    rationale: 'Entitlement inspection is usage reading; changing them is a mutation rule.',
  },
  {
    id: 'ai-settings',
    methods: 'any',
    exact: ['/admin/ai-settings'],
    permission: { read: 'system.config.read', write: 'system.config.write' },
    rationale: 'Model/provider selection is platform configuration. The route is hyphenated, which the prefix ladder never matched.',
  },
  {
    id: 'ai-quota-limits-read',
    methods: 'read',
    prefix: ['/admin/ai/quota-limits'],
    permission: 'ai.entitlements.manage',
    rationale: 'Quota limits are entitlement values, so reading them needs the entitlement permission.',
  },
  {
    id: 'ai-quota-stats-read',
    methods: 'read',
    prefix: ['/admin/ai/quota-stats'],
    permission: 'ai.usage.read',
    rationale: 'Quota consumption is usage data.',
  },
  {
    id: 'platform-search',
    methods: 'read',
    exact: ['/platform/search'],
    permission: ['users.read', 'tenants.read', 'payments.read', 'tickets.manage', 'audit.read', 'security.read', 'system.config.read'],
    rationale: 'Global search spans every domain, so any domain reader may use it; row-level filtering happens in the handler.',
  },
  {
    id: 'dashboard-and-overview',
    methods: 'read',
    exact: ['/admin/dashboard', '/platform/overview', '/platform/command-center'],
    permission: ['system.config.read', 'users.read', 'audit.read'],
    rationale: 'The landing surface aggregates counts from several domains; any of those readers may see it.',
  },
  {
    id: 'support-desk',
    methods: 'any',
    exact: ['/admin/support'],
    prefix: ['/admin/support/'],
    permission: 'tickets.manage',
    rationale: 'The help desk is a ticketing surface; SUPPORT must be able to reply without platform config write.',
  },
  {
    id: 'settings-surface',
    methods: 'any',
    exact: ['/admin/settings', '/admin/twilio-settings', '/admin/system-health-settings'],
    prefix: ['/admin/settings/'],
    permission: { read: 'system.config.read', write: 'system.config.write' },
    rationale: 'CORRECTION: named explicitly instead of inherited from the default, so the settings surface is a reviewed decision.',
  },
  {
    id: 'cms-pages',
    methods: 'any',
    exact: ['/admin/pages', '/admin/trusted-by', '/admin/website-meta'],
    prefix: ['/admin/pages/', '/admin/trusted-by/'],
    permission: 'content.manage',
    rationale: 'CORRECTION: CMS surfaces are content, not platform configuration; content.manage is the accurate grant.',
  },
  {
    id: 'cms-blog',
    methods: 'read',
    prefix: ['/admin/blog'],
    permission: 'blog.read',
    rationale: 'Blog reads are editorial; ADMIN holds blog.read and blog.write.',
  },
  {
    id: 'cms-blog-write',
    methods: 'write',
    prefix: ['/admin/blog'],
    permission: 'blog.write',
    rationale: 'Publishing posts is editorial write, tracked separately from generic configuration writes.',
  },
  {
    id: 'coupons-read',
    methods: 'read',
    exact: ['/admin/coupons'],
    prefix: ['/admin/coupons/'],
    permission: 'payments.read',
    rationale: 'CORRECTION: discount codes are billing artefacts and were previously readable only via the settings default.',
  },
  {
    id: 'coupons-write',
    methods: 'write',
    exact: ['/admin/coupons'],
    prefix: ['/admin/coupons/'],
    permission: 'payments.manage',
    rationale: 'CORRECTION: creating a discount code changes what customers are charged, so it is a payments mutation.',
  },
  {
    id: 'super-admin-configuration',
    methods: 'any',
    exact: ['/platform/configuration', '/platform/feature-flags', '/admin/operations/feature-flags', '/admin/database-settings'],
    prefix: ['/platform/feature-flags/', '/admin/operations/feature-flags/', '/admin/database-settings/'],
    permission: '*',
    rationale: 'Flags and database control change the shape of the product for everyone; SUPER_ADMIN-exclusive and step-up gated.',
  },
  {
    id: 'email-settings-read',
    methods: 'read',
    exact: ['/email/admin/settings'],
    permission: 'system.config.read',
    rationale: 'Email transport settings are configuration reads; the SMTP password itself is never returned (redaction is enforced in the handler).',
  },
  {
    id: 'email-templates-read',
    methods: 'read',
    exact: ['/email/admin/custom-templates'],
    permission: 'email.template.manage',
    rationale: 'Template catalogue reads use the same grant as template edits, matching the route-level guard.',
  },
  {
    id: 'email-admin-operations-write',
    methods: 'write',
    prefix: ['/email/admin/'],
    exact: ['/email/send-email', '/email/resend', '/email/templates'],
    permission: 'system.config.write',
    rationale: 'SMTP credentials, connection tests, circuit-breaker resets and template saves are email configuration writes. Each route additionally requires recent authentication.',
  },
  {
    id: 'admin-platform-status',
    methods: 'read',
    exact: ['/admin/platform/status'],
    permission: 'system.config.read',
    rationale: 'Tenant-platform status is configuration telemetry; ADMIN and AUDITOR read it as platform state.',
  },
  {
    id: 'payment-webhooks',
    methods: 'any',
    exact: ['/platform/payment-webhooks'],
    prefix: ['/platform/payment-webhooks/'],
    permission: { read: 'system.config.read', write: '*' },
    rationale: 'Webhook history is diagnostic configuration; replaying an event re-runs a financial side effect, so it is SUPER_ADMIN-only (and the route also requires requireSuperAdmin).',
  },
  {
    id: 'role-view-audit',
    methods: 'write',
    exact: ['/platform/role-view-audit'],
    permission: '*',
    rationale: 'Recording a role-view is itself a privileged observation; the route requires SUPER_ADMIN and this rule keeps the policy engine in agreement with it.',
  },
  {
    id: 'platform-public-config',
    methods: 'read',
    exact: ['/platform/public-config'],
    permission: 'system.config.read',
    rationale: 'The published module configuration is platform state the console reads to render the Modules tab; it is configuration, not a public document, because the policy gate still applies.',
  },
  {
    id: 'platform-meta',
    methods: 'read',
    exact: ['/platform/version', '/platform/announcements'],
    prefix: ['/platform/announcements/'],
    permission: 'system.config.read',
    rationale: 'Release identity and announcements are platform metadata; reading them is a configuration read, not a public one, because the policy gate still applies.',
  },
  {
    id: 'platform-operations-write',
    methods: 'write',
    exact: ['/platform/maintenance', '/platform/announcements', '/admin/platform/currency'],
    prefix: ['/platform/queues/', '/platform/operational-status/', '/platform/announcements/'],
    permission: 'system.config.write',
    rationale: 'Queue retries, maintenance windows and operational tests are configuration writes. Notable: purging the dead-letter queue is retired in the handler (410), so the permission is not the only control.',
  },
  {
    id: 'platform-tenants-lifecycle',
    methods: 'write',
    prefix: ['/platform/tenants/', '/admin/platform/tenants/'],
    permission: 'tenants.write',
    rationale: 'Suspend, decommission and member changes are tenant lifecycle writes; SUPER_ADMIN is additionally required for commercials and AI policy by the routes themselves.',
  },
  {
    id: 'ai-mutations',
    methods: 'write',
    exact: [
      '/admin/ai/quota-limits',
      '/admin/ai/reset-quota',
      '/admin/ai/reset-state',
      '/admin/ai/test-provider',
      '/admin/ai/fetch-models',
    ],
    prefix: ['/admin/ai/quota-limits/', '/admin/ai/reset-quota/', '/admin/ai/reset-state/', '/admin/ai/test-provider/', '/admin/ai/fetch-models/'],
    permission: 'ai.entitlements.manage',
    rationale: 'Quota resets and entitlement state changes are AI entitlement mutations; provider tests and model fetches spend provider quota, so they need the same grant.',
  },
  {
    id: 'ai-telemetry-read',
    methods: 'read',
    exact: ['/admin/ai/routing-telemetry', '/admin/ai/fetch-models'],
    permission: 'ai.usage.read',
    rationale: 'Routing telemetry is usage data; the route additionally requires SUPER_ADMIN today, which is why the manifest grant is the weaker of the two.',
  },
  {
    id: 'admin-directory-read',
    methods: 'read',
    exact: ['/admin/companies'],
    prefix: ['/admin/companies/'],
    permission: 'users.read',
    rationale: 'Employer companies are directory records; the companies list feeds the same review surface as the user directory.',
  },
  {
    id: 'admin-reviews-mutation',
    methods: 'write',
    exact: ['/admin/reviews'],
    prefix: ['/admin/reviews/'],
    permission: 'tickets.manage',
    rationale: 'Moderating a review is a help-desk action, matching the read rule that already admits tickets.manage.',
  },
  {
    id: 'admin-content-mutations',
    methods: 'write',
    exact: ['/admin/ads', '/admin/companies'],
    prefix: ['/admin/ads/', '/admin/companies/', '/admin/employer-applications/', '/admin/jobs/'],
    permission: 'content.manage',
    rationale: 'Adverts, employer profiles and job moderation are editorial content changes; employer-application writes additionally pass the users.update check in enforceApiPolicy.',
  },
  {
    id: 'cms-ads-read',
    methods: 'read',
    exact: ['/admin/ads'],
    prefix: ['/admin/ads/'],
    permission: 'content.manage',
    rationale: 'Advert inventory is editorial content, read and written under the same grant so a reader is not silently narrower than a writer.',
  },
  /* Mutation rules. Ordered before the write default; reads never reach them. */
  {
    id: 'payments-manage',
    methods: 'write',
    exact: ['/admin/payment-settings', '/admin/payment/test-provider'],
    prefix: ['/admin/payments/', '/admin/subscriptions'],
    permission: 'payments.manage',
    rationale: 'Refunds, reconciliation and provider credentials are billing mutations.',
  },
  {
    id: 'admin-users-mutation',
    methods: 'write',
    prefix: ['/admin/users/'],
    permission: 'users.update',
    rationale: 'User mutations require users.update; destructive ones additionally pass the target-authority ceiling.',
  },
  {
    id: 'rbac-administration',
    methods: 'any',
    exact: ['/admin/rbac/roles', '/admin/rbac/grants'],
    prefix: ['/admin/rbac/'],
    permission: { read: ['audit.read', 'security.read'], write: '*' },
    rationale: 'Reading who-can-do-what is compliance information, so any auditor or security reader may see it; changing authority is SUPER_ADMIN-only because every other grant is derived from it.',
  },
  {
    id: 'config-registry',
    methods: 'any',
    exact: ['/admin/config'],
    prefix: ['/admin/config/'],
    permission: { read: ['system.config.read', 'audit.read', 'security.read'], write: 'system.config.write' },
    rationale: 'The configuration census and its history are read by auditors and security readers; a write is a platform configuration change. Read-only keys are refused inside the handler with their written justification, which is why this rule cannot express the distinction.',
  },
  {
    id: 'config:runtime-subset',
    methods: 'read',
    exact: ['/config/runtime'],
    permission: '*',
    rationale: 'The runtime subset is scoped to values the client must render (currency, tax, limits, maintenance state); every authenticated user may read it, and the handler enumerates the keys rather than accepting them from the caller.',
  },
  {
    id: 'default-admin-read',
    methods: 'read',
    exact: [],
    prefix: ['/'],
    permission: 'system.config.read',
    rationale: 'DECLARED DEFAULT: unnamed admin reads resolve here. Pinned by the coverage test so the unnamed set cannot grow.',
    isDefault: true,
  },
  {
    id: 'default-admin-write',
    methods: 'write',
    exact: [],
    prefix: ['/'],
    permission: 'system.config.write',
    rationale: 'DECLARED DEFAULT: unnamed admin mutations resolve here, matching pre-REC-006 behaviour exactly.',
    isDefault: true,
  },
];

/**
 * Does a rule's `methods` selector cover this request?
 * @param {ManifestRule} rule
 * @param {'read'|'write'} kind
 * @returns {boolean}
 */
function covers(rule, kind) {
  return rule.methods === 'any' || rule.methods === kind;
}

/**
 * Does a rule's path selectors match this pathname?
 * @param {ManifestRule} rule
 * @param {string} pathname
 * @returns {boolean}
 */
function matchesPath(rule, pathname) {
  if (rule.exact?.includes(pathname)) return true;
  return Boolean(rule.prefix?.some(prefix => pathname.startsWith(prefix)));
}

/**
 * Resolve the permission required for a mount-relative admin path.
 *
 * Reads and writes are resolved in separate passes so that a read rule can never
 * be shadowed by a mutation rule declared above it — the ordering hazard that
 * made the old ladder order-sensitive in ways no one could see.
 *
 * @param {string} pathname mount-relative path, e.g. `/admin/users/123`
 * @param {string} method HTTP method
 * @returns {{permission: string|string[], ruleId: string, isDefault: boolean}|null}
 *   `null` means no rule and no default covers the path — the caller must deny.
 */
function resolveRoutePermission(pathname, method) {
  const kind = ['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase()) ? 'read' : 'write';
  const candidates = RULES.filter(rule => covers(rule, kind));
  for (const rule of candidates) {
    if (!matchesPath(rule, pathname)) continue;
    const permission = rule.permission && typeof rule.permission === 'object' && !Array.isArray(rule.permission)
      ? rule.permission[kind]
      : rule.permission;
    if (!permission) continue;
    return { permission, ruleId: rule.id, isDefault: Boolean(rule.isDefault) };
  }
  return null;
}

/**
 * Rule ids that are declared catch-alls. The coverage test counts how many
 * registered routes land on these.
 * @returns {string[]}
 */
function defaultRuleIds() {
  return RULES.filter(rule => rule.isDefault).map(rule => rule.id);
}

module.exports = {
  RULES,
  resolveRoutePermission,
  defaultRuleIds,
};
