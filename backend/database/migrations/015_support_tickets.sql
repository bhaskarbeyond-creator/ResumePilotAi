-- GAP-06: owner-bound support tickets (distinct from public contact_messages).
-- users.id is VARCHAR(128); ticket rows follow that identity key.

CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT chk_support_ticket_status CHECK (status IN ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED')),
    CONSTRAINT chk_support_ticket_priority CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    INDEX idx_support_tickets_user (user_id, updated_at),
    INDEX idx_support_tickets_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL,
    author_uid VARCHAR(128) NOT NULL,
    author_role VARCHAR(32) NOT NULL DEFAULT 'USER',
    body TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_support_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT chk_support_ticket_message_role CHECK (author_role IN ('USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN')),
    INDEX idx_support_ticket_messages_ticket (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
