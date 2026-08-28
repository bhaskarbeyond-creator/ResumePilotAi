-- Additive adoption migration for databases created before checksummed migrations.
-- No historical table is dropped; removed replication artifacts can be archived
-- after a separately verified backup and retention approval.

ALTER TABLE users ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS mutation_id VARCHAR(64) NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS recovery_needed TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS recovery_reason VARCHAR(128) NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS last_payment_gateway VARCHAR(64) NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS provider_refund_id VARCHAR(255) NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS extra_json JSON NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS extra_json JSON NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS extra_json JSON NULL;
ALTER TABLE blog ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
ALTER TABLE blog ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';
ALTER TABLE blog ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP NULL;
ALTER TABLE favourites ADD UNIQUE INDEX IF NOT EXISTS uq_fav_user_item (user_id, item_id);

ALTER TABLE enterprise_support_grants ADD COLUMN IF NOT EXISTS scopes JSON NULL;
UPDATE enterprise_support_grants
SET scopes = JSON_ARRAY('tenant.audit.read')
WHERE scopes IS NULL;
ALTER TABLE enterprise_support_grants MODIFY COLUMN scopes JSON NOT NULL;
ALTER TABLE enterprise_support_grants ADD COLUMN IF NOT EXISTS revokedAt TIMESTAMP NULL;
ALTER TABLE enterprise_support_grants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE enterprise_audit_events ADD COLUMN IF NOT EXISTS outcome VARCHAR(32) DEFAULT 'SUCCESS' AFTER severity;
ALTER TABLE enterprise_audit_events ADD COLUMN IF NOT EXISTS actorType VARCHAR(32) DEFAULT 'user' AFTER outcome;
ALTER TABLE enterprise_audit_events ADD COLUMN IF NOT EXISTS subjectId VARCHAR(128) NULL AFTER actorType;
ALTER TABLE enterprise_audit_events ADD COLUMN IF NOT EXISTS requestId VARCHAR(128) NULL AFTER subjectId;
ALTER TABLE enterprise_audit_events ADD COLUMN IF NOT EXISTS correlationId VARCHAR(128) NULL AFTER requestId;

CREATE TABLE IF NOT EXISTS enterprise_outbox (
    id CHAR(64) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128),
    principalId VARCHAR(128) NOT NULL,
    subjectId VARCHAR(128),
    identityIssuer VARCHAR(32) NOT NULL,
    actorType VARCHAR(32) NOT NULL,
    jobType VARCHAR(128) NOT NULL,
    correlationId VARCHAR(128),
    idempotencyKey VARCHAR(200) NOT NULL,
    classification VARCHAR(32) NOT NULL DEFAULT 'PRIVATE',
    envelope JSON NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
    attemptCount INT UNSIGNED NOT NULL DEFAULT 0,
    maxAttempts INT UNSIGNED NOT NULL DEFAULT 5,
    nextAttemptAt DATETIME(3) NOT NULL,
    expiresAt DATETIME(3) NOT NULL,
    leaseOwner VARCHAR(128),
    leaseExpiresAt DATETIME(3),
    lastAttemptAt DATETIME(3),
    completedAt DATETIME(3),
    rejectedAt DATETIME(3),
    dlqAt DATETIME(3),
    replayedAt DATETIME(3),
    replayedBy VARCHAR(128),
    lastError VARCHAR(500),
    rejectedReason VARCHAR(200),
    result JSON,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_ent_outbox_idempotency (tenantId, idempotencyKey),
    INDEX idx_ent_outbox_due (status, nextAttemptAt, leaseExpiresAt),
    INDEX idx_ent_outbox_expiry (status, expiresAt),
    INDEX idx_ent_outbox_tenant (tenantId, status, created_at),
    CONSTRAINT chk_ent_outbox_status CHECK (status IN ('QUEUED', 'PROCESSING', 'RETRYING', 'COMPLETED', 'DEAD_LETTER', 'REJECTED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enterprise_observability_rollups (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    lifetimeSamples BIGINT UNSIGNED NOT NULL DEFAULT 0,
    clientErrors BIGINT UNSIGNED NOT NULL DEFAULT 0,
    serverErrors BIGINT UNSIGNED NOT NULL DEFAULT 0,
    authErrors BIGINT UNSIGNED NOT NULL DEFAULT 0,
    aiErrors BIGINT UNSIGNED NOT NULL DEFAULT 0,
    quotaErrors BIGINT UNSIGNED NOT NULL DEFAULT 0,
    lastP50Ms DECIMAL(12,3),
    lastP95Ms DECIMAL(12,3),
    lastP99Ms DECIMAL(12,3),
    windowStartedAt DATETIME(3),
    windowEndedAt DATETIME(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE enterprise_tenants
SET dataPlane = JSON_SET(
    COALESCE(dataPlane, JSON_OBJECT()),
    '$.id', 'mysql-primary',
    '$.type', 'MYSQL',
    '$.queueProfile', 'mysql-transactional-outbox'
);
