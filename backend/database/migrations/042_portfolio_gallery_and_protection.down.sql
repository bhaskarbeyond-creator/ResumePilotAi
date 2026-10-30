-- Migration 042 Rollback: Portfolio Case Study Media Gallery & Password Protection

DROP TABLE IF EXISTS portfolio_media;

ALTER TABLE portfolios
  DROP COLUMN IF EXISTS password_hash;
