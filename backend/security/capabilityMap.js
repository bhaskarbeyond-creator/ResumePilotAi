'use strict';

/**
 * The console's capability map — one source of truth for "what may this caller
 * see", derived from the same permissions that decide "what may this caller do"
 * (REC-018, INV-1, INV-5).
 *
 * ## The defect this replaces
 *
 * `frontend/src/pages/admin/console.tsx` decided tab visibility with
 * `if (role === 'AUDITOR') … else if (role === 'SUPPORT') …`. Two consequences:
 *
 *  - granting `audit.read` to a custom role changed nothing a person could see;
 *  - the console could show a tab whose endpoint answered 403 (feature flags for
 *    AUDITOR) and hide work a role was fully entitled to do.
 *
 * ## Why the map lives on the server
 *
 * Visibility must not be a second, hand-maintained copy of the authorisation
 * policy. Each entry therefore names the *permission* the tab needs and a
 * representative request (`probe`) that the test suite executes through the real
 * `enforceApiPolicy`. `test/authz-visibility-matrix.test.js` computes, for every
 * role × every tab, whether the tab is visible and whether the probe is
 * authorised, and fails if the two disagree. That is INV-5 as an executable
 * assertion rather than a promise in a document.
 *
 * ## Adding a tab
 *
 * Add an entry here, add its `probe` route to
 * `backend/test/fixtures/admin-route-inventory.json` if it is new, and let the
 * manifest name the probe's path. The matrix test then covers it for every role
 * without further work.
 *
 * @module security/capabilityMap
 */

/**
 * @typedef {object} CapabilityEntry
 * @property {string} id matches `AdminTabId` in the console
 * @property {string} label human-facing tab name
 * @property {'observability'|'identity'|'moderation'|'content'|'configuration'|'governance'} group
 * @property {string|string[]} requires permission(s); any-of, matching the
 *   manifest rule that guards `probe`
 * @property {{method: string, path: string}} probe representative request,
 *   used by the visibility ↔ enforcement matrix test
 * @property {boolean} [superAdminOnly] true when the ROUTE additionally requires
 *   the wildcard beyond what the manifest grants. Such a tab is visible only to a
 *   wildcard holder, and `test/authz-visibility-matrix.test.js` additionally asserts
 *   that the corresponding registration really does call `requireSuperAdmin` — a
 *   declared stricter guard that the source does not implement would be a lie.
 */

/** @type {readonly CapabilityEntry[]} */
const CAPABILITIES = Object.freeze([
  {
    id: 'dashboard',
    label: 'Command Center',
    group: 'observability',
    requires: ['system.config.read', 'users.read', 'audit.read'],
    probe: { method: 'GET', path: '/platform/command-center' },
  },
  {
    id: 'health',
    label: 'Platform Health',
    group: 'observability',
    requires: 'security.read',
    probe: { method: 'GET', path: '/admin/health-summary' },
  },
  {
    id: 'queues',
    label: 'Queues & DLQ',
    group: 'observability',
    requires: 'security.read',
    probe: { method: 'GET', path: '/platform/queues' },
  },
  {
    id: 'operations',
    label: 'Operations',
    group: 'configuration',
    requires: 'security.read',
    probe: { method: 'GET', path: '/platform/backup-status' },
  },
  {
    id: 'attention',
    label: 'Attention Needed',
    group: 'observability',
    requires: 'security.read',
    probe: { method: 'GET', path: '/platform/attention' },
  },
  {
    id: 'users',
    label: 'Users',
    group: 'identity',
    requires: 'users.read',
    probe: { method: 'GET', path: '/admin/users' },
  },
  {
    id: 'support',
    label: 'Help Desk',
    group: 'identity',
    requires: 'tickets.manage',
    probe: { method: 'GET', path: '/admin/support/tickets' },
  },
  {
    id: 'moderation',
    label: 'Moderation',
    group: 'moderation',
    requires: ['users.read', 'tickets.manage'],
    probe: { method: 'GET', path: '/admin/jobs' },
  },
  {
    id: 'blog',
    label: 'Blog',
    group: 'content',
    requires: 'blog.read',
    probe: { method: 'GET', path: '/admin/blog/posts' },
  },
  {
    id: 'content',
    label: 'Marketing CMS',
    group: 'content',
    // The landing surface is the pages editor, which needs `content.manage`.
    // Coupons inside the tab are gated separately by `actions.content.write` /
    // the coupons rule: mixing the two requirements here made the tab visible to
    // AUDITOR (which holds payments.read) while its landing route answered 403 —
    // the exact disagreement this map exists to prevent.
    requires: 'content.manage',
    probe: { method: 'GET', path: '/admin/pages' },
  },
  {
    id: 'ai-settings',
    label: 'AI Providers',
    group: 'configuration',
    requires: 'system.config.read',
    // The route additionally requires SUPER_ADMIN (`index.js`, GET
    // /api/admin/ai-settings). That guard is stricter than the manifest, so the tab
    // is super-admin-only: offering it to ADMIN renders a screen whose first write
    // is guaranteed to 403.
    probe: { method: 'GET', path: '/admin/ai-settings' },
    superAdminOnly: true,
  },
  {
    id: 'email',
    label: 'Email & SMTP',
    group: 'configuration',
    requires: 'system.config.read',
    probe: { method: 'GET', path: '/email/admin/settings' },
  },
  {
    id: 'security',
    label: 'Security & Audit',
    group: 'governance',
    requires: 'security.read',
    probe: { method: 'GET', path: '/platform/security-events' },
  },
  {
    id: 'config',
    label: 'Configuration',
    group: 'configuration',
    // Any-of matches the manifest rule for `GET /admin/config`: an auditor may read the
    // census (with elevated values redacted), so the tab must not be hidden from them.
    requires: ['system.config.read', 'audit.read', 'security.read'],
    probe: { method: 'GET', path: '/admin/config' },
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'configuration',
    requires: 'system.config.read',
    probe: { method: 'GET', path: '/admin/settings' },
  },
  {
    id: 'modules',
    label: 'Modules',
    group: 'configuration',
    requires: 'system.config.read',
    probe: { method: 'GET', path: '/platform/public-config' },
  },
  {
    id: 'rbac',
    label: 'Roles & Access',
    group: 'governance',
    // Reading the model is audit information; editing it is SUPER_ADMIN-only and
    // is gated per action inside the tab (`requiresWrite`).
    requires: ['audit.read', 'security.read'],
    probe: { method: 'GET', path: '/admin/rbac/roles' },
  },
  {
    id: 'audit',
    label: 'Audit Trail',
    group: 'governance',
    requires: 'audit.read',
    probe: { method: 'GET', path: '/admin/audit-logs' },
  },
]);

/** Tab shown when the caller can see nothing else, and the first visible tab otherwise. */
const DEFAULT_TAB = 'dashboard';

/**
 * Actions inside a tab that need a stricter permission than the tab itself.
 * Exposed so the UI can disable a control *and* explain why, rather than letting a
 * click discover the 403.
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
const ACTIONS = Object.freeze({
  rbac: Object.freeze({
    editRole: 'system.config.manage',
    grantRole: 'system.config.manage',
  }),
  // The registry's own editor. `save` is finer than the tab's `read`: an auditor may
  // open the census and not change anything, which is the point of the permission split.
  config: Object.freeze({ save: 'system.config.write', history: 'audit.read' }),
  settings: Object.freeze({ save: 'system.config.write' }),
  email: Object.freeze({ saveSmtp: 'system.config.write' }),
  'ai-settings': Object.freeze({ save: 'system.config.write' }),
  users: Object.freeze({ mutate: 'users.update', delete: 'users.delete' }),
  support: Object.freeze({ reply: 'tickets.manage' }),
  content: Object.freeze({ write: 'content.manage' }),
  blog: Object.freeze({ write: 'blog.write' }),
});

module.exports = { CAPABILITIES, DEFAULT_TAB, ACTIONS };
