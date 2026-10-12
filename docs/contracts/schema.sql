-- Canonical DDL generated from .bridge/project.json ddlInline.
-- 26 canonical table definitions; full schema is 117 tables.
-- Engine: MariaDB 10.4+ / MySQL 8.0+.

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `role` ENUM('candidate','employer_recruiter','employer_admin','enterprise_admin','enterprise_member','super_admin') NOT NULL DEFAULT 'candidate',
  `tenant_id` BIGINT UNSIGNED NULL,
  `email_verified_at` TIMESTAMP NULL,
  `mfa_enabled` TINYINT(1) DEFAULT 0,
  `failed_login_attempts` INT DEFAULT 0,
  `locked_until` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  `updated_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  `deleted_at` TIMESTAMP NULL,
  CONSTRAINT `fk_users_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `enterprise_tenants`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `refresh_token_hash` CHAR(64) NOT NULL,
  `user_agent` VARCHAR(512) NULL,
  `ip_address` VARBINARY(16) NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `revoked_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_user_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `family_id` CHAR(36) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `revoked_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_refresh_tokens_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mfa_totp_secrets` (
  `user_id` BIGINT UNSIGNED,
  PRIMARY KEY (`user_id`),
  `secret_encrypted` VARBINARY(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_mfa_totp_secrets_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mfa_recovery_codes` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `used_at` TIMESTAMP NULL,
  CONSTRAINT `fk_mfa_recovery_codes_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `resumes` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `template_id` VARCHAR(8) NOT NULL,
  `content_json` JSON NOT NULL,
  `ats_score` SMALLINT UNSIGNED NULL,
  `status` ENUM('draft','active','archived') DEFAULT 'draft',
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  `updated_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  CONSTRAINT `fk_resumes_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `resume_versions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `resume_id` BIGINT UNSIGNED NOT NULL,
  `version_number` INT UNSIGNED NOT NULL,
  `content_json` JSON NOT NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_resume_versions_resume_id` FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `jobs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `company_id` BIGINT UNSIGNED NOT NULL,
  `posted_by_user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `location` VARCHAR(255) NULL,
  `remote` TINYINT(1) DEFAULT 0,
  `salary_min_cents` BIGINT NULL,
  `salary_max_cents` BIGINT NULL,
  `currency` CHAR(3) DEFAULT 'USD',
  `skills_json` JSON NULL,
  `status` ENUM('draft','published','closed') DEFAULT 'draft',
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  `updated_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  CONSTRAINT `fk_jobs_company_id` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`),
  CONSTRAINT `fk_jobs_posted_by_user_id` FOREIGN KEY (`posted_by_user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `companies` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `logo_url` VARCHAR(512) NULL,
  `website` VARCHAR(512) NULL,
  `industry` VARCHAR(128) NULL,
  `size_bucket` VARCHAR(32) NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `applications` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `resume_id` BIGINT UNSIGNED NULL,
  `cover_letter_id` BIGINT UNSIGNED NULL,
  `stage` ENUM('wishlist','applied','interviewing','offer','rejected') DEFAULT 'applied',
  `note` TEXT NULL,
  `applied_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  `updated_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  CONSTRAINT `fk_applications_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`),
  CONSTRAINT `fk_applications_job_id` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`),
  CONSTRAINT `fk_applications_resume_id` FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `job_tracker` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `job_id` BIGINT UNSIGNED NULL,
  `title` VARCHAR(255) NOT NULL,
  `company` VARCHAR(255) NULL,
  `stage` ENUM('wishlist','applied','interviewing','offer','rejected') NOT NULL,
  `note` TEXT NULL,
  `interview_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_job_tracker_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`),
  CONSTRAINT `fk_job_tracker_job_id` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conversations` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `subject` VARCHAR(255) NULL,
  `last_message_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conversation_participants` (
  `conversation_id` BIGINT UNSIGNED,
  PRIMARY KEY (`conversation_id`),
  `user_id` BIGINT UNSIGNED,
  PRIMARY KEY (`user_id`),
  `last_read_at` TIMESTAMP NULL,
  CONSTRAINT `fk_conversation_participants_conversation_id` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id ON DELETE CASCADE`),
  CONSTRAINT `fk_conversation_participants_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conversation_messages` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `conversation_id` BIGINT UNSIGNED NOT NULL,
  `sender_id` BIGINT UNSIGNED NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_conversation_messages_conversation_id` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id ON DELETE CASCADE`),
  CONSTRAINT `fk_conversation_messages_sender_id` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NULL,
  `read_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_notifications_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` VARCHAR(64) NOT NULL,
  `provider` ENUM('razorpay','stripe') NOT NULL,
  `provider_subscription_id` VARCHAR(128) NOT NULL,
  `status` ENUM('active','past_due','cancelled','expired') NOT NULL,
  `current_period_start` TIMESTAMP NOT NULL,
  `current_period_end` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_subscriptions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `subscription_id` BIGINT UNSIGNED NULL,
  `number` VARCHAR(64) NOT NULL UNIQUE,
  `amount_cents` BIGINT NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `status` ENUM('draft','open','paid','void','uncollectible') NOT NULL,
  `issued_at` TIMESTAMP NOT NULL,
  `paid_at` TIMESTAMP NULL,
  `pdf_url` VARCHAR(512) NULL,
  CONSTRAINT `fk_invoices_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_invoices_subscription_id` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payment_webhook_events` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `provider` ENUM('razorpay','stripe') NOT NULL,
  `event_id` VARCHAR(191) NOT NULL,
  `payload_json` JSON NOT NULL,
  `processed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `webhook_idempotency_keys` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `scope` VARCHAR(64) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `response_json` JSON NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `enterprise_tenants` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(128) NOT NULL UNIQUE,
  `custom_domain` VARCHAR(255) NULL,
  `branding_json` JSON NULL,
  `data_region` VARCHAR(32) NOT NULL DEFAULT 'us',
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `enterprise_memberships` (
  `tenant_id` BIGINT UNSIGNED,
  PRIMARY KEY (`tenant_id`),
  `user_id` BIGINT UNSIGNED,
  PRIMARY KEY (`user_id`),
  `role` ENUM('owner','admin','member') NOT NULL,
  `joined_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_enterprise_memberships_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `enterprise_tenants`(`id ON DELETE CASCADE`),
  CONSTRAINT `fk_enterprise_memberships_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `enterprise_ai_usage` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `provider` VARCHAR(64) NOT NULL,
  `model` VARCHAR(128) NOT NULL,
  `tokens_in` INT UNSIGNED NOT NULL,
  `tokens_out` INT UNSIGNED NOT NULL,
  `cost_micros_usd` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_enterprise_ai_usage_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `enterprise_tenants`(`id`),
  CONSTRAINT `fk_enterprise_ai_usage_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sync_outbox` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `entity` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(64) NOT NULL,
  `op` ENUM('insert','update','delete') NOT NULL,
  `payload_json` JSON NOT NULL,
  `status` ENUM('pending','in_progress','done','failed') NOT NULL DEFAULT 'pending',
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `next_attempt_at` TIMESTAMP NULL,
  `last_error` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `actor_id` BIGINT UNSIGNED NULL,
  `actor_ip` VARBINARY(16) NULL,
  `action` VARCHAR(128) NOT NULL,
  `target_type` VARCHAR(64) NULL,
  `target_id` VARCHAR(64) NULL,
  `metadata_json` JSON NULL,
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_audit_logs_actor_id` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `feature_flags` (
  `key` VARCHAR(128),
  PRIMARY KEY (`key`),
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `scope` ENUM('global','tenant','user') NOT NULL DEFAULT 'global',
  `rollout_percent` TINYINT UNSIGNED DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `file_uploads` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  `user_id` BIGINT UNSIGNED NOT NULL,
  `purpose` VARCHAR(64) NOT NULL,
  `storage_key` VARCHAR(512) NOT NULL,
  `mime_type` VARCHAR(128) NOT NULL,
  `size_bytes` BIGINT UNSIGNED NOT NULL,
  `scan_status` ENUM('pending','clean','infected') NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT 'CURRENT_TIMESTAMP',
  CONSTRAINT `fk_file_uploads_user_id` FOREIGN KEY (`user_id`) REFERENCES `users`(`id ON DELETE CASCADE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
