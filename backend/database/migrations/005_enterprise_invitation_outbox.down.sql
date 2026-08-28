-- Rollback for 005_enterprise_invitation_outbox.sql.
-- Data in invitation lifecycle records is lost; take and verify a backup first.

DROP TABLE IF EXISTS enterprise_membership_invitations;
DROP INDEX IF EXISTS uq_ent_membership_tenant_principal ON enterprise_memberships;
