-- FP-A06: durable operator session revocation.
--
-- WHY: `POST /api/platform/operators/:uid/revoke-sessions` only called Firebase
-- `revokeRefreshTokens()`, which invalidates REFRESH tokens. An already-issued
-- ID token stayed valid for its full natural lifetime, so a revoked operator
-- kept full access for up to an hour after the operator pressed the button.
--
-- WHY A CUTOFF RATHER THAN A SESSION ID: neither token type this service accepts
-- carries a per-service session identifier (`jti`). Firebase ID tokens do carry a
-- server-signed `iat`, and the non-production `rptest` harness tokens are minted
-- by this service with an explicit issue time. A per-user cutover compared against
-- the signed issue time therefore invalidates EVERY session issued at or before
-- the revocation, which is exactly the semantics of user-level revocation, and it
-- cannot be forged by a client.
--
-- revoked_at is stored with millisecond precision so operators can revoke twice
-- within one second without the second event collapsing into the first.
--
-- expires_at is a PRUNING horizon (revoked_at + the maximum token lifetime this
-- deployment issues), never an authorization input: the verification path
-- deliberately ignores it so a lapsed pruning horizon can never resurrect an old
-- token. It is safe to delete rows whose expires_at is in the past only after
-- confirming that horizon still exceeds every token TTL in use.
--
-- scope/revoked_by record the actor and blast radius for audit reconstruction.

CREATE TABLE IF NOT EXISTS revoked_sessions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    scope VARCHAR(32) NOT NULL DEFAULT 'USER',
    revoked_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at TIMESTAMP(3) NULL,
    reason VARCHAR(255) NULL,
    revoked_by VARCHAR(128) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_revoked_user (user_id, revoked_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
