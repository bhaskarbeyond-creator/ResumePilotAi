'use strict';

const { assertUuid } = require('./tenantContext');

const LEGACY_COLLECTIONS = Object.freeze({
  RESUME: 'resumes',
  COVER: 'covers',
  COVER_LETTER: 'coverLetters',
  PORTFOLIO: 'portfolios',
});

function assertLegacyPersonalBridge({ context, tenant, sourceUid }) {
  if (!context?.subjectId || !tenant?.legacyOwnerUid || tenant.legacyOwnerUid !== context.subjectId || sourceUid !== context.subjectId) {
    throw Object.assign(new Error('Legacy Firebase resource is unavailable in this tenant context'), { code: 'LEGACY_TENANT_RESOURCE_NOT_FOUND', status: 404 });
  }
  return true;
}

function legacyDocumentPath({ context, tenant, sourceUid, collection, documentId }) {
  assertLegacyPersonalBridge({ context, tenant, sourceUid });
  const normalizedCollection = LEGACY_COLLECTIONS[String(collection || '').toUpperCase()];
  if (!normalizedCollection || !/^[A-Za-z0-9_-]{1,128}$/.test(String(documentId || ''))) {
    throw Object.assign(new Error('Legacy document reference is invalid'), { code: 'INVALID_LEGACY_DOCUMENT', status: 400 });
  }
  // Tenant ID is deliberately not interpolated into Firebase legacy paths. The
  // personal tenant bridge maps an already-authorized identity to its frozen UID tree.
  return `users/${sourceUid}/${normalizedCollection}/${documentId}`;
}

function tenantMigrationTarget({ tenantId, workspaceId, resourceType, legacyDocumentId }) {
  return Object.freeze({
    tenantId: assertUuid(tenantId, 'Tenant identifier'),
    workspaceId: assertUuid(workspaceId, 'Workspace identifier'),
    resourceType: String(resourceType || '').toUpperCase(),
    legacyDocumentId: String(legacyDocumentId || ''),
  });
}

module.exports = {
  LEGACY_COLLECTIONS,
  assertLegacyPersonalBridge,
  legacyDocumentPath,
  tenantMigrationTarget,
};
