'use strict';

/**
 * Authoritative domain ownership registry.
 *
 * Each persisted domain has exactly one owner. Cross-domain work uses local
 * MariaDB transactions and durable MariaDB outboxes; there are no secondary
 * copies presented as owners and unknown domains fail closed.
 */

function maria(entity, table, notes = '') {
    return Object.freeze({
        entity,
        owner: 'MARIADB',
        table,
        writeMode: 'SINGLE_OWNER',
        consistency: 'TRANSACTIONAL',
        replication: 'NONE',
        conflictPolicy: 'OPTIMISTIC_REVISION',
        notes,
    });
}

const ENTITIES = Object.freeze({
    identity: Object.freeze({
        entity: 'identity', owner: 'FIREBASE_AUTH', table: null,
        writeMode: 'IDENTITY_PROVIDER', consistency: 'PROVIDER', replication: 'NONE',
        conflictPolicy: 'PROVIDER_MANAGED',
        notes: 'Passwords, federated identities, refresh sessions, MFA enrollment and provider account linking.',
    }),
    user_profile: maria('user_profile', 'users'),
    membership: maria('membership', 'users', 'Application entitlement; identity claims are authorization hints, not the billing owner.'),
    subscription: maria('subscription', 'subscriptions'),
    payment_transaction: maria('payment_transaction', 'transactions'),
    payment_order: maria('payment_order', 'payment_orders'),
    payment_refund_reference: maria('payment_refund_reference', 'payment_refund_provider_references', 'Normalized immutable provider evidence; aggregate refunds retain every component reference.'),
    payment_webhook: maria('payment_webhook', 'payment_webhook_events', 'Provider event id is the idempotency key.'),
    coupon: maria('coupon', 'coupons'),
    coupon_redemption: maria('coupon_redemption', 'coupon_redemptions'),
    invoice: maria('invoice', 'invoices'),
    invoice_counter: maria('invoice_counter', 'invoice_counters', 'Allocated under a database lock with invoice creation.'),
    credit_note: maria('credit_note', 'credit_notes', 'Immutable full-refund accounting document linked to one issued invoice.'),
    credit_note_counter: maria('credit_note_counter', 'credit_note_counters', 'Allocated under a database lock with credit-note creation.'),
    resume: maria('resume', 'resumes'),
    resume_publication: maria('resume_publication', 'public_resumes'),
    canonical_document: maria('canonical_document', 'canonical_documents'),
    portfolio: maria('portfolio', 'portfolios'),
    cover_letter: maria('cover_letter', 'covers'),
    favourite: maria('favourite', 'favourites'),
    job: maria('job', 'jobs'),
    job_application: maria('job_application', 'applications'),
    job_tracker: maria('job_tracker', 'job_tracker'),
    company: maria('company', 'companies'),
    conversation: maria('conversation', 'conversations'),
    conversation_participant: maria('conversation_participant', 'conversation_participants'),
    message: maria('message', 'conversation_messages'),
    notification: maria('notification', 'notifications'),
    notification_delivery: maria('notification_delivery', 'notification_outbox'),
    email_log: maria('email_log', 'email_logs'),
    email_verification_token: maria('email_verification_token', 'email_verification_tokens'),
    email_verification_state: maria('email_verification_state', 'email_verification_state'),
    password_reset_token: maria('password_reset_token', 'password_reset_tokens'),
    password_reset_state: maria('password_reset_state', 'password_reset_state'),
    blog_post: maria('blog_post', 'blog'),
    custom_page: maria('custom_page', 'custom_pages', 'Revisioned relational owner; legacy canonical_documents rows are migration input only and are runtime-quarantined.'),
    review: maria('review', 'reviews', 'Relational owner for public and administrative testimonial reads and writes.'),
    trusted_organization: maria('trusted_organization', 'trusted_by', 'Revisioned relational owner for public and administrative logo reads and writes.'),
    contact_message: maria('contact_message', 'contact_messages'),
    support_ticket: maria('support_ticket', 'support_tickets', 'Owner-bound support tickets; distinct from public contact_messages.'),
    support_ticket_message: maria('support_ticket_message', 'support_ticket_messages'),
    platform_setting: maria('platform_setting', 'system_settings'),
    schema_migration: maria('schema_migration', 'schema_migrations', 'Checksummed migration ledger; modified only by the migration runner.'),
    schema_migration_attempt: maria('schema_migration_attempt', 'schema_migration_attempts', 'Append-only migration execution evidence.'),
    platform_statistic: maria('platform_statistic', 'stats'),
    platform_announcement: maria('platform_announcement', 'platform_announcements'),
    admin_audit: maria('admin_audit', 'admin_audit_logs'),
    security_audit: maria('security_audit', 'security_audit_logs'),
    oauth_state: maria('oauth_state', 'oauth_states'),
    oauth_exchange: maria('oauth_exchange', 'oauth_exchange_codes'),
    export_token: maria('export_token', 'export_render_tokens'),
    ai_usage: maria('ai_usage', 'ai_usage'),
    enterprise_tenant: maria('enterprise_tenant', 'enterprise_tenants'),
    enterprise_tenant_configuration: maria('enterprise_tenant_configuration', 'enterprise_tenant_configurations'),
    enterprise_principal_tenant: maria('enterprise_principal_tenant', 'enterprise_principal_tenants'),
    enterprise_workspace: maria('enterprise_workspace', 'enterprise_workspaces'),
    enterprise_workspace_membership: maria('enterprise_workspace_membership', 'enterprise_workspace_memberships'),
    enterprise_membership: maria('enterprise_membership', 'enterprise_memberships'),
    enterprise_membership_invitation: maria('enterprise_membership_invitation', 'enterprise_membership_invitations'),
    enterprise_team: maria('enterprise_team', 'enterprise_teams'),
    enterprise_team_member: maria('enterprise_team_member', 'enterprise_team_members'),
    enterprise_resource: maria('enterprise_resource', 'enterprise_resources'),
    enterprise_audit: maria('enterprise_audit', 'enterprise_audit_events'),
    enterprise_observability_rollup: maria('enterprise_observability_rollup', 'enterprise_observability_rollups'),
    enterprise_ai_usage: maria('enterprise_ai_usage', 'enterprise_ai_usage'),
    enterprise_service_account: maria('enterprise_service_account', 'enterprise_service_accounts'),
    enterprise_support_grant: maria('enterprise_support_grant', 'enterprise_support_grants'),
    enterprise_quota: maria('enterprise_quota', 'enterprise_quota_buckets'),
    enterprise_job: maria('enterprise_job', 'enterprise_outbox'),
    permission: Object.freeze({
        entity: 'permission', owner: 'CODE', table: null,
        writeMode: 'IMMUTABLE_POLICY', consistency: 'PROCESS_LOCAL', replication: 'NONE',
        conflictPolicy: 'RELEASE_CONTROLLED',
        notes: 'RBAC permission definitions are version-controlled server policy.',
    }),
});

const ALIASES = Object.freeze({
    user: 'user_profile', users: 'user_profile', profiles: 'user_profile',
    memberships: 'membership', subscriptions: 'subscription',
    transactions: 'payment_transaction', payment_orders: 'payment_order',
    payment_refund_provider_references: 'payment_refund_reference', payment_webhook_events: 'payment_webhook',
    coupons: 'coupon', coupon_redemptions: 'coupon_redemption', invoices: 'invoice', invoice_counters: 'invoice_counter',
    credit_notes: 'credit_note', credit_note_counters: 'credit_note_counter',
    resumes: 'resume', public_resumes: 'resume_publication', canonical_documents: 'canonical_document', portfolios: 'portfolio',
    covers: 'cover_letter', favourites: 'favourite', jobs: 'job', job_tracker: 'job_tracker',
    applications: 'job_application', companies: 'company', conversations: 'conversation',
    conversation_participants: 'conversation_participant', conversation_messages: 'message', messages: 'message',
    notifications: 'notification', notification_outbox: 'notification_delivery',
    email_logs: 'email_log', email_verification_tokens: 'email_verification_token', email_verification_state: 'email_verification_state',
    password_reset_tokens: 'password_reset_token', password_reset_state: 'password_reset_state',
    blog: 'blog_post', custom_pages: 'custom_page', reviews: 'review', trusted_by: 'trusted_organization',
    contact_messages: 'contact_message', support_tickets: 'support_ticket', support_ticket_messages: 'support_ticket_message',
    settings: 'platform_setting', system_settings: 'platform_setting',
    schema_migrations: 'schema_migration', schema_migration_attempts: 'schema_migration_attempt',
    stats: 'platform_statistic', platform_announcements: 'platform_announcement',
    admin_audit_logs: 'admin_audit', security_audit_logs: 'security_audit',
    oauth_states: 'oauth_state', oauth_exchange_codes: 'oauth_exchange', export_render_tokens: 'export_token',
    enterprise_tenants: 'enterprise_tenant', enterprise_tenant_configurations: 'enterprise_tenant_configuration',
    enterprise_principal_tenants: 'enterprise_principal_tenant', enterprise_workspaces: 'enterprise_workspace',
    enterprise_workspace_memberships: 'enterprise_workspace_membership', enterprise_memberships: 'enterprise_membership',
    enterprise_membership_invitations: 'enterprise_membership_invitation', enterprise_teams: 'enterprise_team',
    enterprise_team_members: 'enterprise_team_member', enterprise_resources: 'enterprise_resource',
    enterprise_audit_events: 'enterprise_audit', enterprise_observability_rollups: 'enterprise_observability_rollup',
    enterprise_ai_usage: 'enterprise_ai_usage', enterprise_service_accounts: 'enterprise_service_account',
    enterprise_support_grants: 'enterprise_support_grant', enterprise_quota_buckets: 'enterprise_quota', enterprise_outbox: 'enterprise_job',
    roles: 'permission', permissions: 'permission',
});

function getOwnership(entityType) {
    const requested = String(entityType || '').trim().toLowerCase();
    const key = ALIASES[requested] || requested;
    const ownership = ENTITIES[key];
    if (!ownership) {
        const error = new Error(`No authoritative owner is registered for domain "${requested || '(empty)'}".`);
        error.code = 'DATABASE_OWNERSHIP_UNREGISTERED';
        error.status = 500;
        throw error;
    }
    return ownership;
}

function ownershipMatrix() {
    return Object.values(ENTITIES).map(row => ({
        Entity: row.entity,
        Owner: row.owner,
        Table: row.table,
        WriteMode: row.writeMode,
        Consistency: row.consistency,
        Replication: row.replication,
        ConflictPolicy: row.conflictPolicy,
    }));
}

module.exports = { ENTITIES, ALIASES, getOwnership, ownershipMatrix };
