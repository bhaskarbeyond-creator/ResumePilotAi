-- Server-authoritative, owner-scoped state for Live AI CBT Interview sessions.
-- Full candidate context/transcript lives only for the active session lifetime;
-- the browser retains an opaque session pointer rather than owning interview control state.
CREATE TABLE IF NOT EXISTS live_interview_sessions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    state_json MEDIUMTEXT NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_live_interview_status CHECK (status IN ('active', 'completed')),
    CONSTRAINT fk_live_interview_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_live_interview_owner_active (user_id, status, updated_at),
    INDEX idx_live_interview_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
