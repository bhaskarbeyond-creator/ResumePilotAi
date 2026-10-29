-- Reverse of 030_enterprise_team_lifecycle.sql
ALTER TABLE coupons DROP COLUMN discount_type, DROP COLUMN discount_value;
ALTER TABLE enterprise_teams DROP COLUMN restored_at, DROP COLUMN archived_at, DROP COLUMN archived, DROP COLUMN team_lead_uid;
