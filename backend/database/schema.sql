-- ==============================================================================
-- ResumePilot AI — Complete Relational MySQL / MariaDB Schema
-- Hostinger & Cloud Compatible (InnoDB, utf8mb4_unicode_ci, JSON support)
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Users Table (Maps to Firebase Auth UID & Firestore 'users' collection)
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
    extra_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_email (email),
    INDEX idx_user_role (role),
    INDEX idx_user_membership (membership)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Resumes Table (Firestore: users/{uid}/resumes/{resumeId})
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
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_resume_user (user_id),
    INDEX idx_resume_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Public Published Resumes (Firestore: pb/{resumeId})
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

-- 4. Portfolios Table (Firestore: users/{uid}/portfolios/{portfolioId})
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

-- 5. Cover Letters Table (Firestore: users/{uid}/covers/{coverId})
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

-- 6. Favourites Table (Firestore: users/{uid}/favourites/{itemId})
CREATE TABLE IF NOT EXISTS favourites (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    item_id VARCHAR(128) NOT NULL,
    item_type VARCHAR(50) DEFAULT 'resume',
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_fav_user (user_id),
    INDEX idx_fav_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Jobs Table (Firestore: jobs/{jobId})
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
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_jobs_employer (employer_id),
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_featured (featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Job Applications (Firestore: applications/{appId})
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_app_job (job_id),
    INDEX idx_app_applicant (applicant_id),
    INDEX idx_app_employer (employer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Job Tracker (Firestore: users/{uid}/jobTracker/{jobId})
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

-- 10. Companies / Employer Profiles (Firestore: companies/{companyId})
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_company_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Blog Engine (Firestore: blog/{postId})
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
    published_at TIMESTAMP NULL,
    views INT DEFAULT 0,
    likes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_blog_slug (slug),
    INDEX idx_blog_published (published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Custom CMS Pages (Firestore: custom_pages/{pageId})
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

-- 13. Trusted By Partners (Firestore: trusted_by/{brandId})
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

-- 14. Customer Reviews (Firestore: reviews/{reviewId})
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

-- 15. Contact Messages (Firestore: contact/{msgId})
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

-- 16. Conversations & Direct Messages (Firestore: messages & conversations)
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    participant1_id VARCHAR(128) NOT NULL,
    participant2_id VARCHAR(128) NOT NULL,
    last_message TEXT,
    unread_count JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_conv_p1 (participant1_id),
    INDEX idx_conv_p2 (participant2_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    conversation_id VARCHAR(128) NOT NULL,
    sender_id VARCHAR(128) NOT NULL,
    receiver_id VARCHAR(128) NOT NULL,
    content MEDIUMTEXT,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    INDEX idx_msg_conv (conversation_id),
    INDEX idx_msg_sender (sender_id),
    INDEX idx_msg_receiver (receiver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. User Notifications (Firestore: notifications/{uid}/userNotifications/{notifId})
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

-- 18. Payment Orders (Firestore: payment_orders/{orderId})
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

-- 19. Billing Transactions (Firestore: transactions/{txnId} or users/{uid}/transactions)
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

-- 20. Subscriptions (Firestore: subscriptions/{subId})
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    type VARCHAR(64) DEFAULT 'PRO',
    payment_type VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sub_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. Promo Coupons & Redemptions (Firestore: coupons/{code}, coupon_redemptions/{id})
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

-- 22. System Settings & Configuration (Firestore: settings/{category}, data/settings)
CREATE TABLE IF NOT EXISTS system_settings (
    category VARCHAR(128) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    revision INT DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. Stats & Aggregates (Firestore: data/stats)
CREATE TABLE IF NOT EXISTS stats (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    data JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24. Database Switch Audit Ledger
CREATE TABLE IF NOT EXISTS database_switch_audit (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    switched_by VARCHAR(128) NOT NULL,
    from_engine VARCHAR(32) NOT NULL,
    to_engine VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL, -- SUCCESS, FAILED
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dbaudit_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 25. Durable Outbox for MySQL -> Firestore Replication
CREATE TABLE IF NOT EXISTS sync_outbox (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    operation VARCHAR(32) NOT NULL, -- UPSERT, DELETE
    payload JSON,
    version INT NOT NULL DEFAULT 1,
    source_engine VARCHAR(32) NOT NULL DEFAULT 'mysql',
    content_hash VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, SYNCED, RETRYING, CONFLICT, DEAD_LETTER
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_outbox_status_time (status, created_at),
    INDEX idx_outbox_entity (entity_type, entity_id),
    INDEX idx_outbox_hash (content_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 26. Intelligent Sync Conflicts Ledger
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    mysql_version INT,
    firestore_version INT,
    mysql_hash VARCHAR(64),
    firestore_hash VARCHAR(64),
    mysql_payload JSON,
    firestore_payload JSON,
    resolution VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, RESOLVED_MYSQL, RESOLVED_FIRESTORE, RESOLVED_CUSTOM
    resolved_by VARCHAR(128),
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conflict_entity (entity_type, entity_id),
    INDEX idx_conflict_status (resolution)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 27. Durable Database Engine State (Multi-Process / PM2 Consistent)
CREATE TABLE IF NOT EXISTS database_engine_state (
    id VARCHAR(32) NOT NULL PRIMARY KEY, -- 'active_engine'
    active_engine VARCHAR(32) NOT NULL DEFAULT 'mysql',
    standby_engine VARCHAR(32) NOT NULL DEFAULT 'firestore',
    sync_mode VARCHAR(32) NOT NULL DEFAULT 'ACTIVE_PASSIVE',
    last_switched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_switched_by VARCHAR(128),
    switch_in_progress BOOLEAN DEFAULT FALSE,
    switch_lock_expires_at BIGINT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 28. Intelligent Sync Worker Heartbeat & Telemetry
CREATE TABLE IF NOT EXISTS sync_worker_state (
    worker_id VARCHAR(64) NOT NULL PRIMARY KEY, -- 'primary_sync_worker'
    worker_pid INT NOT NULL,
    worker_status VARCHAR(32) NOT NULL DEFAULT 'RUNNING', -- RUNNING, STOPPED, PAUSED
    last_heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_sync_started_at TIMESTAMP NULL,
    last_sync_completed_at TIMESTAMP NULL,
    last_successful_event_at TIMESTAMP NULL,
    last_failed_event_at TIMESTAMP NULL,
    consecutive_failures INT NOT NULL DEFAULT 0,
    total_events_processed BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- 31. Tombstones: deletions must propagate and must never be resurrected by a stale upsert.
CREATE TABLE IF NOT EXISTS sync_tombstones (
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    mutation_id VARCHAR(64) NOT NULL,
    source_engine VARCHAR(32) NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id),
    INDEX idx_tombstone_mutation (mutation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 32. Processed mutation ledger (idempotency). The same mutation_id may be delivered many times.
CREATE TABLE IF NOT EXISTS processed_mutations (
    mutation_id VARCHAR(64) NOT NULL PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    operation VARCHAR(32) NOT NULL,
    source_engine VARCHAR(32) NOT NULL,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_processed_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 33. Durable failover / recovery event log (never a silent overwrite).
CREATE TABLE IF NOT EXISTS failover_events (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL, -- FAILOVER, RECONCILING, RECOVERED, CONFLICT
    from_engine VARCHAR(32),
    to_engine VARCHAR(32),
    mode VARCHAR(32),
    reason TEXT,
    payload JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_failover_time (created_at)
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

-- 35. Distributed write-generation / fencing token (multi-instance split-brain prevention).
CREATE TABLE IF NOT EXISTS database_authority (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    generation INT NOT NULL DEFAULT 1,
    write_engine VARCHAR(32) NOT NULL DEFAULT 'mysql',
    mode VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
    lease_owner VARCHAR(128),
    lease_expires_at BIGINT DEFAULT 0,
    reason TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

SET FOREIGN_KEY_CHECKS = 1;
