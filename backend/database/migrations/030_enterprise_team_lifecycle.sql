-- 60. Enterprise team lifecycle: team lead assignment, archive & restore state.
ALTER TABLE enterprise_teams ADD COLUMN team_lead_uid VARCHAR(128) NULL COMMENT 'Principal uid of the team lead';
ALTER TABLE enterprise_teams ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE AFTER team_lead_uid;
ALTER TABLE enterprise_teams ADD COLUMN archived_at TIMESTAMP NULL AFTER archived;
ALTER TABLE enterprise_teams ADD COLUMN restored_at TIMESTAMP NULL AFTER archived_at;

-- 61. Coupon administration: typed discount support for operator-managed coupons.
ALTER TABLE coupons ADD COLUMN discount_type VARCHAR(16) NULL COMMENT 'percentage | fixed';
ALTER TABLE coupons ADD COLUMN discount_value DECIMAL(10,2) NULL AFTER discount_type;
