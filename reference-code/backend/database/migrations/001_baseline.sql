-- ==============================================================================
-- ResumePilot AI — Complete Relational MySQL / MariaDB Schema
-- Hostinger & Cloud Compatible (InnoDB, utf8mb4_unicode_ci, JSON support)
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Users (application profile keyed by Firebase Auth UID)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    firstname VARCHAR(120),
    lastname VARCHAR(120),
    displayName VARCHAR(255),
    photoUrl VARCHAR(1024),
    avatarUrl VARCHAR(1024),
    phone VARCHAR(50),
    jobTitle VARCHAR(255),
    bio TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    website VARCHAR(255),
    membership VARCHAR(50) DEFAULT 'Basic',
    membershipEnds VARCHAR(64),
    paymentStatus VARCHAR(50) DEFAULT 'INACTIVE',
    lastPaymentGateway VARCHAR(64),
    lastPaymentOrderId VARCHAR(128),
    lastPaymentAmount INT DEFAULT 0,
    lastPaymentCurrency VARCHAR(10) DEFAULT 'INR',
    lastPaymentDate TIMESTAMP NULL,
    cancellationRequested BOOLEAN DEFAULT FALSE,
    suspended BOOLEAN DEFAULT FALSE,
    role VARCHAR(50) DEFAULT 'USER',
    revision INT NOT NULL DEFAULT 1,
    extra_data JSON,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_email (email),
    INDEX idx_user_role (role),
    INDEX idx_user_membership (membership)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resumes
CREATE TABLE IF NOT EXISTS resumes (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    title VARCHAR(160) NOT NULL DEFAULT 'Untitled Resume',
    template VARCHAR(64) DEFAULT 'Cv1',
    revision INT DEFAULT 1,
    firstname VARCHAR(120),
    lastname VARCHAR(120),
    email VARCHAR(255),
    phone VARCHAR(50),
    occupation VARCHAR(255),
    country VARCHAR(100),
    city VARCHAR(100),
    address TEXT,
    postalcode VARCHAR(50),
    website VARCHAR(255),
    linkedin VARCHAR(255),
    github VARCHAR(255),
    photo MEDIUMTEXT,
    showPhoto BOOLEAN DEFAULT TRUE,
    summary MEDIUMTEXT,
    
    -- JSON Arrays mimicking canonical resume structure
    employments JSON,
    educations JSON,
    skills JSON,
    languages JSON,
    hobbies JSON,
    projects JSON,
    certifications JSON,
    achievements JSON,
    `references` JSON,
    customSections JSON,
    
    sectionOrder JSON,
    hiddenSections JSON,
    completedSteps JSON,
    deleted_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_resume_user (user_id),
    INDEX idx_resume_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Public Published Resumes
CREATE TABLE IF NOT EXISTS public_resumes (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    owner_uid VARCHAR(128) NOT NULL,
    is_published BOOLEAN DEFAULT FALSE,
    publication_mode VARCHAR(50) DEFAULT 'explicit',
    object MEDIUMTEXT, -- JSON data snapshot of resume
    source_revision INT DEFAULT 0,
    publication_revision INT DEFAULT 1,
    published_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pb_owner (owner_uid),
    INDEX idx_pb_published (is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Portfolios
CREATE TABLE IF NOT EXISTS portfolios (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    title VARCHAR(160) NOT NULL,
    theme VARCHAR(50) DEFAULT 'modern',
    is_published BOOLEAN DEFAULT FALSE,
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_portfolios_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cover Letters
CREATE TABLE IF NOT EXISTS covers (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    title VARCHAR(160) NOT NULL DEFAULT 'Untitled Cover Letter',
    template VARCHAR(50) DEFAULT 'Cover1',
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_covers_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Favourites
CREATE TABLE IF NOT EXISTS favourites (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    item_id VARCHAR(128) NOT NULL,
    item_type VARCHAR(50) DEFAULT 'resume',
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_fav_user (user_id),
    INDEX idx_fav_item (item_id),
    UNIQUE KEY uq_fav_user_item (user_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    employer_id VARCHAR(128) NOT NULL,
    company_name VARCHAR(255),
    company_logo VARCHAR(1024),
    title VARCHAR(255) NOT NULL,
    description MEDIUMTEXT,
    requirements JSON,
    location VARCHAR(255),
    job_type VARCHAR(50) DEFAULT 'Full-time',
    workplace_type VARCHAR(50) DEFAULT 'Remote',
    salary_min INT NULL,
    salary_max INT NULL,
    salary_currency VARCHAR(10) DEFAULT 'USD',
    experience_level VARCHAR(50),
    skills JSON,
    status VARCHAR(50) DEFAULT 'OPEN',
    applicants_count INT DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    revision INT NOT NULL DEFAULT 1,
    extra_json JSON NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_jobs_employer (employer_id),
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_featured (featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Job Applications
CREATE TABLE IF NOT EXISTS applications (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    job_id VARCHAR(128) NOT NULL,
    employer_id VARCHAR(128) NOT NULL,
    applicant_id VARCHAR(128) NOT NULL,
    applicant_name VARCHAR(255),
    applicant_email VARCHAR(255),
    applicant_phone VARCHAR(50),
    resume_id VARCHAR(128),
    resume_url VARCHAR(1024),
    cover_letter MEDIUMTEXT,
    status VARCHAR(50) DEFAULT 'PENDING',
    rating INT DEFAULT 0,
    notes MEDIUMTEXT,
    revision INT NOT NULL DEFAULT 1,
    extra_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_app_job (job_id),
    INDEX idx_app_applicant (applicant_id),
    INDEX idx_app_employer (employer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Job Tracker
CREATE TABLE IF NOT EXISTS job_tracker (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    job_title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'SAVED',
    location VARCHAR(255),
    salary VARCHAR(100),
    date_applied VARCHAR(50),
    url VARCHAR(1024),
    notes MEDIUMTEXT,
    contact_person VARCHAR(255),
    contact_email VARCHAR(255),
    deadline VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_jt_user (user_id),
    INDEX idx_jt_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Companies / Employer Profiles
CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    logo VARCHAR(1024),
    website VARCHAR(255),
    description MEDIUMTEXT,
    industry VARCHAR(100),
    size VARCHAR(50),
    location VARCHAR(255),
    verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'pending',
    revision INT NOT NULL DEFAULT 1,
    extra_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_company_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Blog Engine
CREATE TABLE IF NOT EXISTS blog (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    content MEDIUMTEXT,
    excerpt TEXT,
    cover_image VARCHAR(1024),
    author VARCHAR(255),
    author_id VARCHAR(128),
    category VARCHAR(100),
    tags JSON,
    published BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'draft',
    revision INT NOT NULL DEFAULT 1,
    scheduled_at TIMESTAMP NULL,
    published_at TIMESTAMP NULL,
    views INT DEFAULT 0,
    likes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_blog_slug (slug),
    INDEX idx_blog_published (published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Custom CMS Pages
CREATE TABLE IF NOT EXISTS custom_pages (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    content MEDIUMTEXT,
    published BOOLEAN DEFAULT TRUE,
    nav_order INT DEFAULT 0,
    show_in_nav BOOLEAN DEFAULT FALSE,
    show_in_footer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cp_slug (slug),
    INDEX idx_cp_published (published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trusted By Partners
CREATE TABLE IF NOT EXISTS trusted_by (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url VARCHAR(1024),
    website_url VARCHAR(1024),
    display_order INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tb_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customer Reviews
CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    company VARCHAR(255),
    avatar VARCHAR(1024),
    content TEXT,
    rating INT DEFAULT 5,
    featured BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'APPROVED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_reviews_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contact Messages
CREATE TABLE IF NOT EXISTS contact_messages (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    message MEDIUMTEXT,
    website VARCHAR(255),
    status VARCHAR(50) DEFAULT 'UNREAD',
    ip VARCHAR(64),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_contact_email (email),
    INDEX idx_contact_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Messaging (migrated from Firebase Realtime Database to MySQL; the
--     legacy participant1/participant2 draft schema was never used by any
--     code path and has been replaced by this design).
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    application_id VARCHAR(300) NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversations_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    INDEX idx_conv_participants_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_messages (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    conversation_id VARCHAR(128) NOT NULL,
    sender_id VARCHAR(128) NOT NULL,
    text TEXT,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conv_messages_conv_ts (conversation_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (legacy dead schema removed: the old `messages` draft table had no code
--  path writing to or reading from it; existing deployments with the legacy
--  tables are migrated non-destructively by ensureExtendedSchema)

-- User Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    event_id VARCHAR(128),
    type VARCHAR(64) DEFAULT 'system',
    title VARCHAR(255),
    message TEXT,
    data JSON,
    is_read BOOLEAN DEFAULT FALSE,
    state VARCHAR(50) DEFAULT 'NOTIFICATION_CREATED',
    delivery_state VARCHAR(50) DEFAULT 'NOT_REQUESTED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_user (user_id),
    INDEX idx_notif_read (is_read),
    INDEX idx_notif_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment Orders
CREATE TABLE IF NOT EXISTS payment_orders (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    plan_id VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    amount INT NOT NULL,
    original_amount INT,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    coupon_code VARCHAR(64),
    coupon_discount INT DEFAULT 0,
    single_use_per_user BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'PENDING_PAYMENT',
    membership_ends VARCHAR(64),
    provider_payment_id VARCHAR(255),
    provider_order_id VARCHAR(255),
    provider_payment_intent_id VARCHAR(255),
    provider_client_secret VARCHAR(512),
    failure_code VARCHAR(128),
    activated_at TIMESTAMP NULL,
    reversed_at TIMESTAMP NULL,
    revision INT NOT NULL DEFAULT 1,
    mutation_id VARCHAR(64) NULL,
    recovery_needed TINYINT(1) NOT NULL DEFAULT 0,
    recovery_reason VARCHAR(128) NULL,
    last_payment_gateway VARCHAR(64) NULL,
    provider_refund_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_uid (uid),
    INDEX idx_order_status (status),
    INDEX idx_order_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Billing Transactions
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    txn_id VARCHAR(128) NOT NULL,
    plan_name VARCHAR(255),
    plan_type VARCHAR(64),
    payment_method VARCHAR(128),
    amount INT DEFAULT 0,
    subtotal INT DEFAULT 0,
    tax_amount INT DEFAULT 0,
    tax_rate INT DEFAULT 18,
    tax_name VARCHAR(64) DEFAULT 'GST',
    company_tax_id VARCHAR(64),
    customer_tax_id VARCHAR(64),
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(50) DEFAULT 'Completed',
    duration_months INT DEFAULT 12,
    created_date_string VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_txn_user (user_id),
    INDEX idx_txn_code (txn_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    type VARCHAR(64) DEFAULT 'PRO',
    payment_type VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sub_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Promo Coupons & Redemptions
CREATE TABLE IF NOT EXISTS coupons (
    code VARCHAR(64) NOT NULL PRIMARY KEY,
    discount INT NOT NULL DEFAULT 10,
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    expiry_date VARCHAR(64),
    max_uses INT DEFAULT 0,
    used_count INT DEFAULT 0,
    single_use_per_user BOOLEAN DEFAULT FALSE,
    revision INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_coupon_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    coupon_code VARCHAR(64) NOT NULL,
    order_id VARCHAR(128) NOT NULL,
    status VARCHAR(50) DEFAULT 'RESERVED',
    expires_at BIGINT,
    used_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (coupon_code) REFERENCES coupons(code) ON DELETE CASCADE,
    INDEX idx_redempt_uid (uid),
    INDEX idx_redempt_code (coupon_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System Settings & Configuration
CREATE TABLE IF NOT EXISTS system_settings (
    category VARCHAR(128) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    revision INT DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stats & Aggregates
CREATE TABLE IF NOT EXISTS stats (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 29. Authoritative Administrative Audit Logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    actor_uid VARCHAR(128) NOT NULL,
    actor_email VARCHAR(255),
    actor_role VARCHAR(64) DEFAULT 'ADMIN',
    action VARCHAR(128) NOT NULL,
    category VARCHAR(128) DEFAULT 'general',
    severity VARCHAR(32) DEFAULT 'INFO',
    outcome VARCHAR(32) DEFAULT 'SUCCESS',
    method VARCHAR(16) DEFAULT 'GET',
    pathname VARCHAR(512),
    status_code INT DEFAULT 200,
    resource_type VARCHAR(64),
    resource_id VARCHAR(128),
    metadata JSON,
    request_id VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_actor (actor_uid),
    INDEX idx_audit_action (action),
    INDEX idx_audit_category (category),
    INDEX idx_audit_resource (resource_id),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 30. Authoritative Security Audit Logs
CREATE TABLE IF NOT EXISTS security_audit_logs (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    actor_uid VARCHAR(128) NOT NULL,
    target_uid VARCHAR(128),
    action VARCHAR(128) NOT NULL,
    category VARCHAR(128) DEFAULT 'iam.users',
    severity VARCHAR(32) DEFAULT 'MEDIUM',
    target_type VARCHAR(64) DEFAULT 'USER',
    target_id VARCHAR(128),
    changes JSON,
    metadata JSON,
    request_id VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sec_actor (actor_uid),
    INDEX idx_sec_target (target_uid),
    INDEX idx_sec_action (action),
    INDEX idx_sec_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 34. Provider webhook idempotency ledger (never process the same Stripe/PayPal event twice).
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    event_id VARCHAR(128) NOT NULL PRIMARY KEY,
    provider VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    order_id VARCHAR(128),
    payload JSON,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pwe_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 36. Canonical documents for remaining CMS/admin entities (categories, ads, employer applications, deletion requests).
CREATE TABLE IF NOT EXISTS canonical_documents (
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    payload JSON NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id),
    INDEX idx_cd_type (entity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OAuth anti-CSRF state records.
--     MySQL is the authoritative store; records are single-use and TTL-expired by the
--     state-consumer and a periodic sweep in the OAuth helpers.
CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    code_verifier VARCHAR(255) NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_oauth_states_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time OAuth exchange codes.
--     Redeemed exactly once; the consumer deletes the row inside a transaction.
CREATE TABLE IF NOT EXISTS oauth_exchange_codes (
    code_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_oauth_exchange_expiry (expires_at),
    INDEX idx_oauth_exchange_uid (uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Durable PDF export render tokens. Tokens are single-use with TTL expiry.
CREATE TABLE IF NOT EXISTS export_render_tokens (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    payload JSON NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    consumed_at TIMESTAMP NULL,
    INDEX idx_export_tokens_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password-reset tokens.
--     Only hashes are stored; raw tokens never persist. Single-use with an
--     atomic lease so concurrent redemption cannot double-consume.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at TIMESTAMP NULL,
    lease_id VARCHAR(64) NULL,
    lease_expires_at BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_prt_uid (uid),
    INDEX idx_prt_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 41. Password-reset per-account state: only the latest requested token is
--     active, so an older email can never reset after a newer request.
CREATE TABLE IF NOT EXISTS password_reset_state (
    uid VARCHAR(128) NOT NULL PRIMARY KEY,
    active_token_hash VARCHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL,
    consumed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email-verification tokens.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at TIMESTAMP NULL,
    lease_id VARCHAR(64) NULL,
    lease_expires_at BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_evt_uid (uid),
    INDEX idx_evt_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 43. Email-verification per-account state.
CREATE TABLE IF NOT EXISTS email_verification_state (
    uid VARCHAR(128) NOT NULL PRIMARY KEY,
    active_token_hash VARCHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL,
    verified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily AI usage quota. MariaDB authoritative;
--     row-locked increments prevent concurrent requests bypassing the counter.
CREATE TABLE IF NOT EXISTS email_logs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    recipient VARCHAR(255),
    subject VARCHAR(255),
    template_type VARCHAR(64) DEFAULT 'custom',
    status VARCHAR(32) DEFAULT 'SENT',
    html MEDIUMTEXT,
    message_id VARCHAR(255),
    error TEXT,
    transport VARCHAR(64) DEFAULT 'primary_smtp',
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_logs_recipient (recipient),
    INDEX idx_email_logs_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ai_usage (
    day_key VARCHAR(10) NOT NULL,
    uid_hash VARCHAR(40) NOT NULL,
    uid VARCHAR(128) NOT NULL,
    email VARCHAR(255),
    count INT NOT NULL DEFAULT 1,
    limit_used INT NOT NULL DEFAULT 10,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (day_key, uid_hash),
    INDEX idx_ai_usage_uid (uid),
    INDEX idx_ai_usage_day (day_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 45. Durable notification outbox (transactional outbox pattern).
--     Business writes and these events commit in the SAME MySQL transaction;
--     a background worker delivers them with retry/backoff/dead-letter.
--     MariaDB is authoritative; delivery uses lease-based workers.
CREATE TABLE IF NOT EXISTS notification_outbox (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    event_id VARCHAR(300) NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'email',
    recipient VARCHAR(255) NOT NULL,
    template_type VARCHAR(80) NOT NULL,
    vars JSON,
    metadata JSON,
    tenant_id VARCHAR(128) NULL,
    idempotency_key VARCHAR(128) NULL,
    state VARCHAR(40) NOT NULL DEFAULT 'NOTIFICATION_QUEUED',
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    provider_accepted TINYINT(1) NOT NULL DEFAULT 0,
    provider_accepted_at TIMESTAMP NULL,
    next_attempt_at BIGINT NOT NULL DEFAULT 0,
    lease_owner VARCHAR(128) NULL,
    lease_expires_at BIGINT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP NULL,
    last_error VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_notification_idempotency (idempotency_key),
    INDEX idx_notification_due (state, next_attempt_at),
    INDEX idx_notification_recipient (recipient),
    INDEX idx_notification_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 46. Platform announcements (admin control plane). MySQL authoritative;
--     revision column drives optimistic concurrency for admin edits.
CREATE TABLE IF NOT EXISTS platform_announcements (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
    audience VARCHAR(40) NOT NULL DEFAULT 'ALL',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    revision INT NOT NULL DEFAULT 1,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_announcements_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 47. Enterprise Tenants (MySQL Authoritative Multi-Tenancy)
CREATE TABLE IF NOT EXISTS enterprise_tenants (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    slug VARCHAR(160) NOT NULL UNIQUE,
    displayName VARCHAR(255) NOT NULL,
    lifecycleState VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    isolationTier VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    dataPlane JSON,
    policyVersion INT NOT NULL DEFAULT 1,
    legacyOwnerUid VARCHAR(128),
    decommissionedAt TIMESTAMP NULL,
    purgeScheduledAt TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_tenant_state (lifecycleState),
    INDEX idx_ent_tenant_owner (legacyOwnerUid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 48. Enterprise Workspaces
CREATE TABLE IF NOT EXISTS enterprise_workspaces (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    lifecycleState VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    isDefault BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_ws_tenant (tenantId),
    INDEX idx_ent_ws_state (lifecycleState)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 49. Enterprise Memberships
CREATE TABLE IF NOT EXISTS enterprise_memberships (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    principalId VARCHAR(128) NOT NULL,
    canonicalPrincipalId VARCHAR(128),
    workspaceId VARCHAR(128),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    roles JSON NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    personalTenant BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_mem_tenant (tenantId),
    INDEX idx_ent_mem_principal (principalId),
    INDEX idx_ent_mem_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 50. Enterprise Workspace Memberships
CREATE TABLE IF NOT EXISTS enterprise_workspace_memberships (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128) NOT NULL,
    principalId VARCHAR(128) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_wsmem_ws (workspaceId),
    INDEX idx_ent_wsmem_principal (principalId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 51. Enterprise Tenant Configurations
CREATE TABLE IF NOT EXISTS enterprise_tenant_configurations (
    tenantId VARCHAR(128) NOT NULL PRIMARY KEY,
    revision INT NOT NULL DEFAULT 1,
    customRoles JSON,
    aiPolicy JSON,
    quotaPolicy JSON,
    retentionPolicy JSON,
    securityPolicy JSON,
    identityPolicy JSON,
    commercials JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 52. Enterprise Principal Tenant Mapping (Identity Map)
CREATE TABLE IF NOT EXISTS enterprise_principal_tenants (
    principalId VARCHAR(128) NOT NULL PRIMARY KEY,
    personalTenantId VARCHAR(128) NOT NULL,
    defaultWorkspaceId VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 53. Enterprise Teams
CREATE TABLE IF NOT EXISTS enterprise_teams (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_team_tenant (tenantId),
    INDEX idx_ent_team_ws (workspaceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 54. Enterprise Team Members
CREATE TABLE IF NOT EXISTS enterprise_team_members (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    teamId VARCHAR(128) NOT NULL,
    tenantId VARCHAR(128) NOT NULL,
    principalId VARCHAR(128) NOT NULL,
    role VARCHAR(50) DEFAULT 'MEMBER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_tm_team (teamId),
    INDEX idx_ent_tm_principal (principalId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 55. Enterprise Resources (Partitioned Multi-Tenant Storage)
CREATE TABLE IF NOT EXISTS enterprise_resources (
    id VARCHAR(128) NOT NULL,
    tenantId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128),
    resourceType VARCHAR(64) NOT NULL,
    classification VARCHAR(32) DEFAULT 'PRIVATE',
    data JSON NOT NULL,
    revision INT DEFAULT 1,
    created_by VARCHAR(128),
    updated_by VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (tenantId, resourceType, id),
    INDEX idx_ent_res_ws (tenantId, workspaceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 56. Enterprise Audit Events
CREATE TABLE IF NOT EXISTS enterprise_audit_events (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128),
    actorPrincipalId VARCHAR(128) NOT NULL,
    action VARCHAR(128) NOT NULL,
    category VARCHAR(128) DEFAULT 'tenant',
    severity VARCHAR(32) DEFAULT 'INFO',
    outcome VARCHAR(32) DEFAULT 'SUCCESS',
    actorType VARCHAR(32) DEFAULT 'user',
    subjectId VARCHAR(128),
    requestId VARCHAR(128),
    correlationId VARCHAR(128),
    resourceType VARCHAR(64),
    resourceId VARCHAR(128),
    metadata JSON,
    occurredAt TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_ent_audit_tenant (tenantId, occurredAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 57. Enterprise AI Usage Events & Summaries
CREATE TABLE IF NOT EXISTS enterprise_ai_usage (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128),
    principalId VARCHAR(128) NOT NULL,
    dayKey VARCHAR(10) NOT NULL,
    model VARCHAR(128),
    promptTokens INT DEFAULT 0,
    completionTokens INT DEFAULT 0,
    totalTokens INT DEFAULT 0,
    costEstimate DECIMAL(10, 4) DEFAULT 0,
    recordedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ent_ai_usage_tenant (tenantId, dayKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 58. Enterprise Service Accounts
CREATE TABLE IF NOT EXISTS enterprise_service_accounts (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128),
    displayName VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    keyId VARCHAR(128) NOT NULL,
    keyPrefix VARCHAR(32) NOT NULL,
    secretHash VARCHAR(128) NOT NULL,
    scopes JSON,
    expiresAt TIMESTAMP NULL,
    lastUsedAt TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_sa_tenant (tenantId),
    INDEX idx_ent_sa_hash (secretHash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 59. Enterprise Support Access Grants
CREATE TABLE IF NOT EXISTS enterprise_support_grants (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    tenantId VARCHAR(128) NOT NULL,
    workspaceId VARCHAR(128),
    grantedBy VARCHAR(128) NOT NULL,
    grantedTo VARCHAR(128) NOT NULL,
    reason TEXT,
    scopes JSON NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    expiresAt TIMESTAMP NOT NULL,
    revokedAt TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_sg_tenant (tenantId),
    INDEX idx_ent_sg_active (tenantId, status, expiresAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enterprise durable transactional job outbox
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

-- Enterprise Quota Buckets (Atomic Counter Store)
CREATE TABLE IF NOT EXISTS enterprise_quota_buckets (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    keyHash VARCHAR(128) NOT NULL,
    count INT NOT NULL DEFAULT 1,
    expiresAt BIGINT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ent_qb_hash (keyHash),
    INDEX idx_ent_qb_expiry (expiresAt)
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

SET FOREIGN_KEY_CHECKS = 1;
