-- Migration 041: IP Access Control & Automated Rate-Limit Jail (Module 5 / FP-A07)
-- Supports IPv4, IPv6, CIDR blocks, automated brute-force sliding-window jail, and permanent/temporary deny rules.

CREATE TABLE IF NOT EXISTS ip_access_rules (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    ip_or_cidr VARCHAR(64) NOT NULL UNIQUE,
    rule_type ENUM('ALLOW', 'DENY', 'JAIL') NOT NULL DEFAULT 'DENY',
    reason VARCHAR(255) NULL,
    actor_uid VARCHAR(128) NULL,
    expires_at DATETIME(3) NULL,
    hit_count INT NOT NULL DEFAULT 0,
    last_hit_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_ip_rules_expires (expires_at, rule_type),
    INDEX idx_ip_rules_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
