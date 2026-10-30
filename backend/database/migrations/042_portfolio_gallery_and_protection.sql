-- Migration 042: Portfolio Case Study Media Gallery & Password Protection
-- Target: MariaDB 10.4+ / 11.4+
-- Implements FP-C07 (Portfolio Case Study Gallery & Media Upload)
-- Implements FP-C10 (Portfolio Server-Side Password Protection Challenge)

-- 1. Password Protection Column on Portfolios
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL AFTER published_at;

-- 2. Portfolio Case Study Media Gallery
CREATE TABLE IF NOT EXISTS portfolio_media (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  portfolio_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  project_id VARCHAR(128) NULL,
  title VARCHAR(200) NOT NULL DEFAULT '',
  caption TEXT NULL,
  media_type ENUM('IMAGE', 'DOCUMENT', 'VIDEO', 'LINK') NOT NULL DEFAULT 'IMAGE',
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/png',
  file_size INT UNSIGNED NOT NULL DEFAULT 0,
  storage_key VARCHAR(500) NOT NULL,
  url LONGTEXT NOT NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_portfolio_media_portfolio (portfolio_id, display_order),
  INDEX idx_portfolio_media_project (project_id),
  INDEX idx_portfolio_media_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
