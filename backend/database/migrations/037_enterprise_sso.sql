-- Enterprise SAML 2.0 single sign-on (Mandate 13 workstream: FP-M14).
--
-- Three tables, each with one job:
--   * enterprise_sso_config   — the per-tenant IdP trust configuration. The
--                               signing certificates live here, so a compromised
--                               IdP cannot introduce its own key via KeyInfo.
--   * saml_authn_requests     — the SP-initiated request ids awaiting a
--                               response. Consumed exactly once (InResponseTo).
--   * saml_assertion_replay   — assertion ids already accepted, so a captured
--                               assertion cannot be replayed inside its own
--                               validity window.
--
-- Certificates are stored as a JSON array of base64 DER (no PEM armour) so the
-- bytes compared against KeyInfo are exactly the bytes an operator pasted.

CREATE TABLE IF NOT EXISTS enterprise_sso_config (
    tenant_id VARCHAR(64) NOT NULL PRIMARY KEY,
    provider VARCHAR(32) NOT NULL DEFAULT 'saml',
    entity_id VARCHAR(512) NOT NULL,
    sso_url VARCHAR(1024) NOT NULL,
    slo_url VARCHAR(1024) NULL,
    certificates JSON NOT NULL,
    name_id_format VARCHAR(255) NULL,
    default_role VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
    jit_provisioning TINYINT(1) NOT NULL DEFAULT 0,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ent_sso_tenant FOREIGN KEY (tenant_id) REFERENCES enterprise_tenants (id) ON DELETE CASCADE,
    CONSTRAINT chk_ent_sso_provider CHECK (provider IN ('saml'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS saml_authn_requests (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    relay_state VARCHAR(512) NULL,
    expires_at BIGINT NOT NULL,
    consumed_at BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_saml_authn_expiry (expires_at),
    CONSTRAINT fk_saml_authn_tenant FOREIGN KEY (tenant_id) REFERENCES enterprise_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS saml_assertion_replay (
    assertion_id VARCHAR(256) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_saml_replay_expiry (expires_at),
    CONSTRAINT fk_saml_replay_tenant FOREIGN KEY (tenant_id) REFERENCES enterprise_tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
