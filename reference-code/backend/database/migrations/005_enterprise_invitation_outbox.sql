-- Enterprise invitation lifecycle and transactional delivery binding.
-- MariaDB 11.4+ is the supported production target.

-- Enforce one membership per tenant/principal at the storage boundary. Existing
-- duplicate rows intentionally make this migration fail for operator review
-- rather than allowing ambiguous authorization records to survive.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ent_membership_tenant_principal
  ON enterprise_memberships (tenantId, principalId);

CREATE TABLE IF NOT EXISTS enterprise_membership_invitations (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    membershipId VARCHAR(128) NOT NULL,
    tenantId VARCHAR(128) NOT NULL,
    principalId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128) NOT NULL,
    recipientEmail VARCHAR(254) NOT NULL,
    invitedByPrincipalId VARCHAR(128) NOT NULL,
    invitationState VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    deliveryState VARCHAR(40) NOT NULL DEFAULT 'NOTIFICATION_QUEUED',
    notificationId VARCHAR(64) NULL,
    notificationEventId VARCHAR(300) NULL,
    queueRevision INT UNSIGNED NOT NULL DEFAULT 1,
    expiresAt DATETIME(6) NOT NULL,
    invitedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    lastQueuedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    acceptedAt DATETIME(6) NULL,
    revokedAt DATETIME(6) NULL,
    deliveredAt DATETIME(6) NULL,
    lastDeliveryError VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_ent_invitation_membership (membershipId),
    UNIQUE KEY uq_ent_invitation_event (notificationEventId),
    INDEX idx_ent_invitation_tenant_state (tenantId, invitationState),
    INDEX idx_ent_invitation_recipient (recipientEmail),
    INDEX idx_ent_invitation_notification (notificationId),
    INDEX idx_ent_invitation_expiry (invitationState, expiresAt),
    CONSTRAINT fk_ent_invitation_membership FOREIGN KEY (membershipId)
      REFERENCES enterprise_memberships (id) ON DELETE CASCADE,
    CONSTRAINT fk_ent_invitation_tenant FOREIGN KEY (tenantId)
      REFERENCES enterprise_tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_ent_invitation_workspace FOREIGN KEY (workspaceId)
      REFERENCES enterprise_workspaces (id) ON DELETE CASCADE,
    CONSTRAINT fk_ent_invitation_notification FOREIGN KEY (notificationId)
      REFERENCES notification_outbox (id) ON DELETE SET NULL,
    CONSTRAINT chk_ent_invitation_state
      CHECK (invitationState IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
    CONSTRAINT chk_ent_invitation_delivery_state
      CHECK (deliveryState IN ('NOTIFICATION_QUEUED', 'DELIVERY_ATTEMPTED', 'RETRYING', 'DELIVERED', 'DEAD_LETTER', 'CANCELLED')),
    CONSTRAINT chk_ent_invitation_queue_revision CHECK (queueRevision >= 1),
    CONSTRAINT chk_ent_invitation_expiry CHECK (expiresAt > invitedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
