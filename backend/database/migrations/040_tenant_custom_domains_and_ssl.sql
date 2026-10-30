-- Migration 040: Enterprise Tenant Custom Domains & Automated SSL Lifecycle (Module 12 & Module 21 / FP-A12 / FP-A21)
-- Provides server-authoritative DNS TXT verification and automated SSL/TLS provisioning state machine.

CREATE TABLE IF NOT EXISTS tenant_custom_domains (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(128) NOT NULL,
    domain VARCHAR(253) NOT NULL UNIQUE,
    token_hash CHAR(64) NOT NULL,
    dns_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_DNS',
    ssl_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_PROVISIONING',
    ssl_issuer VARCHAR(64) NULL,
    ssl_cert_thumbprint VARCHAR(128) NULL,
    ssl_issued_at DATETIME(3) NULL,
    ssl_expires_at DATETIME(3) NULL,
    verify_attempts INT NOT NULL DEFAULT 0,
    last_attempt_at DATETIME(3) NULL,
    expires_at DATETIME(3) NOT NULL,
    verified_at DATETIME(3) NULL,
    last_error VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_tenant_dns_status CHECK (dns_status IN ('PENDING_DNS', 'DNS_VERIFIED', 'DNS_FAILED')),
    CONSTRAINT chk_tenant_ssl_status CHECK (ssl_status IN ('PENDING_PROVISIONING', 'PROVISIONED', 'FAILED', 'RENEWAL_DUE')),
    CONSTRAINT fk_tenant_custom_domain_tenant FOREIGN KEY (tenant_id) REFERENCES enterprise_tenants(id) ON DELETE CASCADE,
    INDEX idx_tenant_domain_status (tenant_id, dns_status),
    INDEX idx_tenant_ssl_status (ssl_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
