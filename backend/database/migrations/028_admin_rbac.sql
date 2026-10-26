-- 028_admin_rbac — platform RBAC becomes configuration, not code (REC-005, INV-3).
--
-- ## Why
--
-- Authority in the admin plane was an Object.freeze'd literal in
-- security/auth.js. Changing what an ADMIN may do required a deploy, which in
-- practice meant it never happened, and eight permission strings were required
-- by handlers while no role held them (RCA-007).
--
-- The tenant plane already models this correctly (enterprise/constants.js +
-- enterprise_tenant_configurations.customRoles). This migration lifts that shape
-- one layer up: named roles, resource x action permissions, and explicit user
-- grants that are auditable.
--
-- ## Design notes
--
--  * `resource` + `action` are stored separately so the resolver can apply the
--    action hierarchy (`manage` implies `write` implies `read`) without parsing
--    strings at request time.
--  * `is_system` marks the four built-in roles. They can be edited (that is the
--    point) but cannot be deleted, so a deployment always has a resolvable role.
--  * `admin_user_roles` is the ONLY way a permission reaches a person apart from
--    their role bundle. The old `claims.permissions` union is retired: grants
--    must be persisted to be auditable (RCA-009).
--  * Seeds reproduce today's behaviour exactly, so the first deploy changes
--    nothing observable except that it becomes editable (behaviour-preserving
--    migration).
--
-- ## Rollback
--
-- See 028_admin_rbac.down.sql. Dropping these tables restores code-defined
-- authority because the resolver falls back to the frozen literal when the
-- store is absent — by construction, not by luck.

CREATE TABLE IF NOT EXISTS admin_roles (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name          VARCHAR(64)     NOT NULL,
  display_name  VARCHAR(128)    NOT NULL,
  description   VARCHAR(512)    NOT NULL DEFAULT '',
  rank          SMALLINT        NOT NULL DEFAULT 0,
  is_system     TINYINT(1)      NOT NULL DEFAULT 0,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id     INT UNSIGNED    NOT NULL,
  resource    VARCHAR(64)     NOT NULL,
  action      VARCHAR(32)     NOT NULL,
  granted_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by  VARCHAR(128)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_role_permissions (role_id, resource, action),
  KEY idx_admin_role_permissions_resource (resource, action),
  CONSTRAINT fk_admin_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES admin_roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_user_roles (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid         VARCHAR(128)    NOT NULL,
  role_id     INT UNSIGNED    NOT NULL,
  granted_by  VARCHAR(128)    NOT NULL,
  granted_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP       NULL,
  reason      VARCHAR(512)    NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_user_roles (uid, role_id),
  KEY idx_admin_user_roles_uid (uid),
  CONSTRAINT fk_admin_user_roles_role
    FOREIGN KEY (role_id) REFERENCES admin_roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── built-in roles (behaviour-preserving seed) ──────────────────────────────
INSERT INTO admin_roles (name, display_name, description, rank, is_system) VALUES
  ('SUPER_ADMIN', 'Super Admin',        'Unconditional platform authority; break-glass role.',                              100, 1),
  ('ADMIN',       'Administrator',      'Platform operations: users, content, configuration, payments read.',              80, 1),
  ('AUDITOR',     'Auditor',            'Read-only compliance review: users, tenants, payments, security, audit.',          60, 1),
  ('SUPPORT',     'Support Agent',      'Customer support: user directory lookup and help-desk ticketing.',                 60, 1),
  ('ENTERPRISE_ADMIN',  'Enterprise Admin',  'Tenant-scoped administration.',                                             30, 1),
  ('ENTERPRISE_MEMBER', 'Enterprise Member', 'Tenant-scoped end-user capability.',                                        20, 1),
  -- End-user roles are seeded too, so that once this table is populated NO role
  -- resolves through the code literal. The fallback then means exactly one thing:
  -- "the store is unavailable" — never "this role is defined elsewhere". Ranks
  -- match security/targetAuthority.js.
  ('EMPLOYER',    'Employer',           'Hiring-side end user: job posts and candidate review.',                          40, 1),
  ('USER',        'Individual User',    'Job-seeker end user: resumes, cover letters, interviews.',                       10, 1)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), description = VALUES(description), rank = VALUES(rank);

-- SUPER_ADMIN holds the wildcard so INV-2 (unconditional rights) survives the
-- move from code to data. The resolver treats ('*','*') as "everything".
INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT id, '*', '*', 'migration:028' FROM admin_roles WHERE name = 'SUPER_ADMIN';

-- ADMIN: exactly the legacy bundle, decomposed into resource/action.
INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT r.id, p.resource, p.action, 'migration:028'
FROM admin_roles r
JOIN (
            SELECT 'users' AS resource, 'read' AS action
  UNION ALL SELECT 'users', 'create'
  UNION ALL SELECT 'users', 'update'
  UNION ALL SELECT 'users', 'delete'
  UNION ALL SELECT 'users.roles', 'manage'
  UNION ALL SELECT 'tenants', 'read'
  UNION ALL SELECT 'tenants', 'write'
  UNION ALL SELECT 'tenants', 'manage'
  UNION ALL SELECT 'email.template', 'manage'
  UNION ALL SELECT 'email.logs', 'read'
  UNION ALL SELECT 'payments', 'manage'
  UNION ALL SELECT 'payments', 'read'
  UNION ALL SELECT 'notifications', 'send'
  UNION ALL SELECT 'ai.entitlements', 'manage'
  UNION ALL SELECT 'ai.usage', 'read'
  UNION ALL SELECT 'audit', 'read'
  UNION ALL SELECT 'security', 'read'
  UNION ALL SELECT 'tickets', 'manage'
  UNION ALL SELECT 'blog', 'write'
  UNION ALL SELECT 'blog', 'read'
  UNION ALL SELECT 'blog', 'manage'
  UNION ALL SELECT 'content', 'manage'
  UNION ALL SELECT 'system.config', 'write'
) p ON 1 = 1
WHERE r.name = 'ADMIN';

INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT r.id, p.resource, p.action, 'migration:028'
FROM admin_roles r
JOIN (
            SELECT 'users' AS resource, 'read' AS action
  UNION ALL SELECT 'tenants', 'read'
  UNION ALL SELECT 'email.logs', 'read'
  UNION ALL SELECT 'payments', 'read'
  UNION ALL SELECT 'ai.usage', 'read'
  UNION ALL SELECT 'audit', 'read'
  UNION ALL SELECT 'security', 'read'
) p ON 1 = 1
WHERE r.name = 'AUDITOR';

INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT r.id, p.resource, p.action, 'migration:028'
FROM admin_roles r
JOIN (
            SELECT 'users' AS resource, 'read' AS action
  UNION ALL SELECT 'email.logs', 'read'
  UNION ALL SELECT 'tenants', 'read'
  UNION ALL SELECT 'tickets', 'manage'
) p ON 1 = 1
WHERE r.name = 'SUPPORT';

INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT r.id, p.resource, p.action, 'migration:028'
FROM admin_roles r
JOIN (
            SELECT 'tenant.members' AS resource, 'manage' AS action
  UNION ALL SELECT 'tenant.roles', 'manage'
  UNION ALL SELECT 'tenant.ai', 'policy'
  UNION ALL SELECT 'tenant.billing', 'view'
  UNION ALL SELECT 'tenant.audit', 'read'
  UNION ALL SELECT 'tenant.workspaces', 'manage'
  UNION ALL SELECT 'workspace', 'read'
  UNION ALL SELECT 'workspace', 'manage'
  UNION ALL SELECT 'workspace.members', 'manage'
) p ON 1 = 1
WHERE r.name = 'ENTERPRISE_ADMIN';

INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT r.id, p.resource, p.action, 'migration:028'
FROM admin_roles r
JOIN (
            SELECT 'jobs' AS resource, 'manage' AS action
  UNION ALL SELECT 'applications', 'review'
  UNION ALL SELECT 'candidates', 'contact'
) p ON 1 = 1
WHERE r.name = 'EMPLOYER';

INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT r.id, p.resource, p.action, 'migration:028'
FROM admin_roles r
JOIN (
            SELECT 'resumes' AS resource, 'manage' AS action
  UNION ALL SELECT 'coverletters', 'manage'
  UNION ALL SELECT 'interviews', 'execute'
  UNION ALL SELECT 'subscription', 'self'
) p ON 1 = 1
WHERE r.name = 'USER';

INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT r.id, p.resource, p.action, 'migration:028'
FROM admin_roles r
JOIN (
            SELECT 'tenant.resumes' AS resource, 'write' AS action
  UNION ALL SELECT 'tenant.interviews', 'execute'
  UNION ALL SELECT 'tenant.ai', 'consume'
  UNION ALL SELECT 'workspace', 'read'
) p ON 1 = 1
WHERE r.name = 'ENTERPRISE_MEMBER';

-- ── §B REC-005 remediation grants ───────────────────────────────────────────
--
-- Everything above reproduces the pre-028 literal byte for byte, so shipping
-- this migration alone changes nobody's authority. The statements below are the
-- *only* intentional authority changes, and each one closes a proven gap.
--
-- Audit correction recorded in DECISION-LOG.md (D-005-2): appendix A.2 counted
-- eight "required but never assigned" permissions. Re-verified against the
-- current source, seven of the eight are not gaps at all —
--   * `users.export`        is any-of with `users.read`        (routes/adminUsers.js:1181)
--   * `users.security.manage` any-of with `users.update`      (routes/adminUsers.js:1075,1113,1135,1155)
--   * `payments.write`      is any-of with `payments.manage`  (index.js:4646-4650)
--   * `system.config.manage` is any-of with `system.config.write` (index.js:4646-4650)
--   * `tenant.support.access` is any-of with the role list    (enterprise/tenantService.js:72)
--   * `system.config.read`  is satisfied by `system.config:write` under the
--     `manage ⊃ write ⊃ read` hierarchy once policy.js resolves through it
--   * `secrets.manage`      is deliberately SUPER_ADMIN-exclusive (wildcard):
--     it gates the Firebase service-account private key, and handing that to
--     ADMIN would let any admin mint tokens for the whole platform, which is a
--     privilege escalation dressed as a convenience.
-- One is a real gap: `messages.read` is the SOLE requirement on
-- `GET /notifications-data/contact/list` (routes/notificationsData.js:66), so
-- contact-form submissions were readable by SUPER_ADMIN only.
--
-- Grant verified against the surfaces that need it: the console's Help Desk and
-- Moderation tabs render contact messages for ADMIN, and SUPPORT owns the
-- help-desk queue. AUDITOR deliberately does not get it — its bundle is defined
-- as users/tenants/payments/security/audit, and contact submissions are
-- customer correspondence, not compliance evidence.

INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT r.id, 'messages', 'read', 'migration:028:rec-005'
FROM admin_roles r
WHERE r.name IN ('ADMIN', 'SUPPORT');
