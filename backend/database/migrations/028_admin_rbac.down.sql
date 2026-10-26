-- 028_admin_rbac (down) — restore code-defined authority.
--
-- Order matters: child tables first, because of the foreign keys.
--
-- Safety: dropping these tables cannot lock anyone out. `security/adminRbac.js`
-- resolves from the database when it is available and falls back to the frozen
-- literal in `security/auth.js` when it is not, so the post-rollback authority set
-- is exactly the pre-migration set. Any grant made through the API is lost — that
-- is the point of a rollback, and it is recorded in `admin_audit_logs` before the
-- tables go away.
DROP TABLE IF EXISTS admin_user_roles;
DROP TABLE IF EXISTS admin_role_permissions;
DROP TABLE IF EXISTS admin_roles;
