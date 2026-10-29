-- 63. Portfolio custom-domain registration and DNS TXT verification (DISC-039).
--
-- A portfolio may claim ONE custom domain (product policy: the public portfolio
-- URL is singular), and a domain may belong to exactly ONE portfolio. Both
-- invariants are database constraints, not application-side checks:
--   * `uq_portfolio_custom_domain` -> two portfolios can never claim one domain
--   * `uq_portfolio_domain_portfolio` -> one portfolio never holds two domains
--
-- SECURITY: only the SHA-256 of the verification token is stored. The plaintext
-- token is returned exactly once, at registration time, for the operator to
-- publish as a DNS TXT record; a database read cannot reveal a claimable token.
-- Verification compares sha256(TXT record value) with `token_hash` in constant
-- time at the service layer.

CREATE TABLE IF NOT EXISTS portfolio_custom_domains (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    portfolio_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    domain VARCHAR(253) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    verify_attempts INT NOT NULL DEFAULT 0,
    last_attempt_at DATETIME(3) NULL,
    expires_at DATETIME(3) NOT NULL,
    verified_at DATETIME(3) NULL,
    last_error VARCHAR(200) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_portfolio_custom_domain (domain),
    UNIQUE KEY uq_portfolio_domain_portfolio (portfolio_id),
    INDEX idx_portfolio_domain_owner (user_id, status),
    INDEX idx_portfolio_domain_expiry (status, expires_at),
    CONSTRAINT fk_portfolio_domain_portfolio FOREIGN KEY (portfolio_id)
      REFERENCES portfolios (id) ON DELETE CASCADE,
    CONSTRAINT fk_portfolio_domain_owner FOREIGN KEY (user_id)
      REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_portfolio_domain_status CHECK (status IN ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED')),
    CONSTRAINT chk_portfolio_domain_attempts CHECK (verify_attempts >= 0),
    CONSTRAINT chk_portfolio_domain_expiry CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
