'use strict';

const crypto = require('crypto');
const { assertUuid } = require('./tenantContext');

const RESOURCE_SEGMENT = /^[A-Za-z0-9._-]{1,180}$/;

function safeSegment(value, label) {
  const normalized = String(value || '');
  if (!RESOURCE_SEGMENT.test(normalized)) {
    const error = new Error(`${label} is invalid`);
    error.code = 'INVALID_STORAGE_PATH';
    error.status = 400;
    throw error;
  }
  return normalized;
}

function tenantStoragePrefix({ tenantId, workspaceId }) {
  return `tenants/${assertUuid(tenantId, 'Tenant identifier')}/workspaces/${assertUuid(workspaceId, 'Workspace identifier')}`;
}

function tenantObjectKey({ tenantId, workspaceId, resourceType, resourceId, category, artifactId = crypto.randomUUID(), version = '1', extension = 'bin' }) {
  const prefix = tenantStoragePrefix({ tenantId, workspaceId });
  return [
    prefix,
    safeSegment(category, 'Storage category'),
    safeSegment(resourceType, 'Resource type'),
    safeSegment(resourceId, 'Resource identifier'),
    `${safeSegment(artifactId, 'Artifact identifier')}.v${safeSegment(String(version), 'Artifact version')}.${safeSegment(extension, 'Extension')}`,
  ].join('/');
}

function quarantineObjectKey({ uploadId, extension = 'bin' }) {
  return `quarantine/${safeSegment(uploadId, 'Upload identifier')}.${safeSegment(extension, 'Extension')}`;
}

function parseTenantObjectKey(value) {
  const segments = String(value || '').split('/');
  if (segments.length < 8 || segments[0] !== 'tenants' || segments[2] !== 'workspaces') return null;
  try {
    return Object.freeze({
      tenantId: assertUuid(segments[1], 'Tenant identifier'),
      workspaceId: assertUuid(segments[3], 'Workspace identifier'),
      category: safeSegment(segments[4], 'Storage category'),
      resourceType: safeSegment(segments[5], 'Resource type'),
      resourceId: safeSegment(segments[6], 'Resource identifier'),
      artifactName: safeSegment(segments[7], 'Artifact name'),
    });
  } catch {
    return null;
  }
}

function assertStorageContext(context, key) {
  const parsed = parseTenantObjectKey(key);
  if (!parsed || parsed.tenantId !== context?.tenantId || parsed.workspaceId !== context?.workspaceId) {
    const error = new Error('Storage object is unavailable in the active tenant context');
    error.code = 'TENANT_STORAGE_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  return parsed;
}

module.exports = {
  assertStorageContext,
  parseTenantObjectKey,
  quarantineObjectKey,
  tenantObjectKey,
  tenantStoragePrefix,
};
