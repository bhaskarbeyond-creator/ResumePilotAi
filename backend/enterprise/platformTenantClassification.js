'use strict';

/**
 * Platform tenant classification for the SuperAdmin User 360 workspace.
 *
 * MariaDB `enterprise_tenants` stores both:
 *   - ORGANIZATION  tenants (multi-tenant shared workspaces, UUID id/slug), and
 *   - PERSONAL      tenants (1:1 single-owner sandboxes created by
 *                    `ensurePersonalTenant`).
 *
 * Personal tenants use the deterministic `personal-<hash>` slug so an
 * administrator can distinguish them without an extra schema column. The
 * organisation-facing dropdown must never offer a personal sandbox as an
 * assignable enterprise organisation, because `grantMembership()` rejects
 * non-UUID tenant identifiers (and even if it did not, assigning a member to
 * someone else's personal sandbox would violate tenant isolation).
 */

const PERSONAL_TENANT_SLUG = /^personal-[A-Za-z0-9._-]+$/i;
const PERSONAL_TENANT_PREFIX = 'personal-';

function isPersonalTenant(tenant = {}) {
  const slug = String(tenant?.slug || tenant?.id || '');
  return PERSONAL_TENANT_SLUG.test(slug) || slug.toLowerCase().startsWith(PERSONAL_TENANT_PREFIX);
}

function tenantType(tenant = {}) {
  return isPersonalTenant(tenant) ? 'PERSONAL' : 'ORGANIZATION';
}

function filterOrganizationTenants(tenants = []) {
  return Array.isArray(tenants) ? tenants.filter(tenant => !isPersonalTenant(tenant)) : [];
}

module.exports = {
  PERSONAL_TENANT_PREFIX,
  PERSONAL_TENANT_SLUG,
  filterOrganizationTenants,
  isPersonalTenant,
  tenantType,
};
