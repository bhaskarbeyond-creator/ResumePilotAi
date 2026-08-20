'use strict';

const crypto = require('crypto');

const DETERMINISTIC_PERSONAL = new Set([
  'user_profile', 'resume', 'resume_section', 'cover', 'cover_letter', 'favourite',
  'job_tracker', 'private_portfolio', 'published_resume_projection',
  'personal_notification', 'login_history', 'resume_recovery', 'interview_session',
  'interview_history', 'ai_usage_legacy'
]);

const PLATFORM_CONTROL = new Set([
  'platform_cms', 'platform_settings', 'provider_configuration', 'coupon',
  'contact_submission', 'security_audit', 'notification_outbox', 'oauth_state',
  'reset_token', 'email_verification', 'payment_webhook'
]);

const AMBIGUOUS = new Set([
  'company', 'job', 'job_application', 'conversation', 'message', 'portfolio_duplicate',
  'financial_ledger', 'subscription_legacy'
]);

function stableChecksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex');
}

function classifyLegacyResource(kind, source = {}) {
  const normalized = String(kind || '').toLowerCase();
  if (DETERMINISTIC_PERSONAL.has(normalized)) {
    return Object.freeze({
      classification: 'PERSONAL_TENANT',
      migrationStatus: 'ELIGIBLE_AFTER_ADAPTER',
      ownershipRule: 'SOURCE_UID_TO_PERSONAL_TENANT',
      ownerUid: String(source.ownerUid || source.userId || source.uid || ''),
    });
  }
  if (PLATFORM_CONTROL.has(normalized)) {
    return Object.freeze({
      classification: 'PLATFORM_CONTROL',
      migrationStatus: 'DO_NOT_TENANTIZE_BY_DEFAULT',
      ownershipRule: 'PLATFORM_CONTROL_PLANE',
      ownerUid: null,
    });
  }
  if (AMBIGUOUS.has(normalized)) {
    return Object.freeze({
      classification: 'AMBIGUOUS',
      migrationStatus: 'BLOCKED_OWNERSHIP',
      ownershipRule: 'EXPLICIT_MAPPING_OR_QUARANTINE_REQUIRED',
      ownerUid: String(source.ownerUid || source.userId || source.employerId || ''),
    });
  }
  return Object.freeze({
    classification: 'UNKNOWN',
    migrationStatus: 'BLOCKED_OWNERSHIP',
    ownershipRule: 'INVENTORY_REQUIRED',
    ownerUid: null,
  });
}

function createMigrationLedgerRecord({ sourceStore, sourcePath, sourceUid, sourceRevision = 0, sourceData, tenantId = null, workspaceId = null, resourceType, targetResourceId = null, ownership }) {
  if (!ownership || ownership.migrationStatus === 'BLOCKED_OWNERSHIP') {
    throw Object.assign(new Error('Legacy resource ownership must be resolved before migration'), { code: 'LEGACY_OWNERSHIP_AMBIGUOUS', status: 409 });
  }
  return Object.freeze({
    id: crypto.randomUUID(),
    sourceStore: String(sourceStore || 'firestore'),
    sourcePath: String(sourcePath || '').slice(0, 500),
    sourceUid: String(sourceUid || '').slice(0, 128),
    sourceRevision: Number(sourceRevision || 0),
    sourceChecksum: stableChecksum(sourceData),
    tenantId,
    workspaceId,
    resourceType: String(resourceType || '').toUpperCase(),
    targetResourceId,
    ownershipRule: ownership.ownershipRule,
    status: 'PLANNED',
    createdAt: new Date().toISOString(),
  });
}

module.exports = {
  AMBIGUOUS,
  DETERMINISTIC_PERSONAL,
  PLATFORM_CONTROL,
  classifyLegacyResource,
  createMigrationLedgerRecord,
  stableChecksum,
};
