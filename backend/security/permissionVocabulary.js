'use strict';

/**
 * The platform permission vocabulary — the shape the RBAC resolver reads and the
 * fallback authority set when the `admin_roles` store is unavailable.
 *
 * ## Status of this file after migration 028
 *
 * Authority now lives in the database (`admin_roles`, `admin_role_permissions`,
 * `admin_user_roles`) and is resolved by `services/adminRbac.js`. This literal is
 * retained for exactly two purposes:
 *
 *  1. **Seeding reference** — migration 028 reproduces these grants, and
 *     `test/admin-rbac-resolver.test.js` asserts the seeded model equals this
 *     literal, so the migration cannot silently change anyone's authority.
 *  2. **Fail-safe fallback** — when the RBAC store cannot be read, resolution
 *     falls back to these sets, which are the pre-028 behaviour. A cold cache or
 *     a database outage therefore degrades to "today's authority", never to
 *     "more authority".
 *
 * It is deliberately NOT the place to make a permission change. Edit the role in
 * the admin console (or `admin_role_permissions`) so the change is audited with
 * actor and before/after (INV-6).
 *
 * It was extracted from `security/auth.js` so that `services/adminRbac.js` and
 * `security/auth.js` can both import it without a require cycle.
 *
 * @module security/permissionVocabulary
 */

const PERMISSIONS = Object.freeze({
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'users.read', 'users.create', 'users.update', 'users.delete', 'users.roles.manage',
    'tenants.read', 'tenants.write', 'tenants.manage',
    'email.template.manage', 'email.logs.read',
    'payments.manage', 'payments.read',
    'notifications.send',
    'ai.entitlements.manage', 'ai.usage.read',
    'audit.read', 'security.read',
    'tickets.manage',
    'blog.write', 'blog.read', 'blog_management', 'content.manage', 'system.config.write'
  ],
  AUDITOR: [
    'users.read', 'tenants.read', 'email.logs.read',
    'payments.read', 'ai.usage.read', 'audit.read', 'security.read'
  ],
  SUPPORT: [
    'users.read', 'email.logs.read', 'tenants.read', 'tickets.manage'
  ],
  ENTERPRISE_ADMIN: [
    'tenant.members.manage', 'tenant.roles.manage', 'tenant.ai.policy',
    'tenant.billing.view', 'tenant.audit.read', 'tenant.workspaces.manage',
    'workspace.read', 'workspace.manage', 'workspace.members.manage'
  ],
  ENTERPRISE_MEMBER: [
    'tenant.resumes.write', 'tenant.interviews.execute', 'tenant.ai.consume', 'workspace.read'
  ],
  EMPLOYER: [
    'jobs.manage', 'applications.review', 'candidates.contact'
  ],
  USER: [
    'resumes.manage', 'coverletters.manage', 'interviews.execute', 'subscription.self'
  ]
});
/**
 * Actions that are implied by a higher action, used by the resolver.
 * Kept next to the vocabulary because the two must be reasoned about together.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const ACTION_IMPLIES = Object.freeze({
  manage: Object.freeze(['write', 'read']),
  write: Object.freeze(['read']),
  view: Object.freeze(['read']),
  execute: Object.freeze(['read']),
  policy: Object.freeze(['read']),
  send: Object.freeze(['read']),
});

/** Canonical actions a permission row may carry. */
const KNOWN_ACTIONS = Object.freeze(['read', 'write', 'manage', 'create', 'delete', 'view', 'execute', 'policy', 'send', 'roles', 'review', 'contact', 'self', 'consume', '*']);

module.exports = { PERMISSIONS, ACTION_IMPLIES, KNOWN_ACTIONS };
