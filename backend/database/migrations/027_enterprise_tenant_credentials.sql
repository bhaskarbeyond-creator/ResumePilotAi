-- Encrypted tenant AI provider credentials store (BYOK)
-- Envelope encryption via ServerKeyEncryptionProvider (AES-256-GCM)
-- Each row is sealed with a unique data key; data key wrapped by active master key

CREATE TABLE IF NOT EXISTS enterprise_tenant_credentials (
    tenantId VARCHAR(128) NOT NULL,
    providerId VARCHAR(80) NOT NULL,
    -- Encrypted envelope containing the provider credentials (API keys, base URLs, etc.)
    credentialEnvelope JSON NOT NULL,
    -- Key version used for wrapping (for key rotation)
    keyVersion VARCHAR(16) NOT NULL,
    -- Algorithm identifier for future compatibility
    algorithm VARCHAR(32) NOT NULL DEFAULT 'AES-256-GCM',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (tenantId, providerId),
    CONSTRAINT fk_ent_cred_tenant FOREIGN KEY (tenantId)
        REFERENCES enterprise_tenants (id) ON DELETE CASCADE,
    CONSTRAINT chk_ent_cred_alg CHECK (algorithm = 'AES-256-GCM')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for key rotation audits
CREATE INDEX IF NOT EXISTS idx_ent_cred_key_version
    ON enterprise_tenant_credentials (keyVersion);

-- Add test_connection_status to track live test results
CREATE TABLE IF NOT EXISTS enterprise_tenant_credential_tests (
    tenantId VARCHAR(128) NOT NULL,
    providerId VARCHAR(80) NOT NULL,
    testedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    testedBy VARCHAR(128) NOT NULL,
    success BOOLEAN NOT NULL,
    latencyMs INT UNSIGNED NULL,
    errorCode VARCHAR(64) NULL,
    errorMessage VARCHAR(500) NULL,
    modelTested VARCHAR(150) NULL,
    PRIMARY KEY (tenantId, providerId, testedAt),
    CONSTRAINT fk_ent_cred_test_tenant FOREIGN KEY (tenantId)
        REFERENCES enterprise_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_ent_cred_test_tenant_time
    ON enterprise_tenant_credential_tests (tenantId, testedAt DESC);