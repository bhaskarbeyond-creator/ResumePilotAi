'use strict';

const { assertUuid } = require('./tenantContext');

/**
 * Canonical assignment-workspace resolution (GAP-22).
 *
 * The MySQL tenant registry intentionally keeps `grantMembership` on a strict
 * explicit-workspace contract (`assertUuid(workspaceId)`): a membership always
 * binds a concrete workspace that provably belongs to the tenant. Platform-
 * level administration flows that act on a *whole tenant* — Super Admin
 * User 360 tenant assignment and the platform tenant member registry — must
 * therefore resolve the tenant's canonical workspace at the route/service
 * boundary before calling the strict contract. That resolution lives here and
 * nowhere else, so both call sites share one honest semantic:
 *
 *   1. An explicitly requested workspace wins, but only when it is a UUID and
 *      resolves as an ACTIVE workspace of the same tenant (cross-tenant picks
 *      fail closed with WORKSPACE_NOT_FOUND, never data or silent fallback).
 *   2. Otherwise the tenant's canonical default workspace is used
 *      (`enterprise_workspaces.isDefault = TRUE`). Every supported tenant
 *      creation path (createTenant / provisionTenant / ensurePersonalTenant)
 *      provisions exactly one default workspace atomically, and the default
 *      workspace cannot be archived (WORKSPACE_DEFAULT_PROTECTED).
 *   3. If a tenant somehow has no `isDefault` row but does have ACTIVE
 *      workspaces, the first row of the registry's deterministic ordering
 *      (`isDefault DESC, name ASC`) is used — never an arbitrary pick. This
 *      matches the test-registry contract in
 *      backend/test/helpers/inMemoryTenantRegistry.js.
 *   4. If the tenant has no usable ACTIVE workspace at all, resolution fails
 *      deterministically with TENANT_NO_USABLE_WORKSPACE (409) so the caller
 *      can surface an actionable state instead of a generic HTTP 400.
 *
 * No workspace is ever invented, and tenant/workspace isolation is unchanged:
 * every lookup is scoped by tenantId against the same registry the strict
 * grant contract re-validates inside its own transaction.
 */

const UUID_HINT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function workspaceResolutionError(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

/**
 * @param {object} registry tenant registry implementing getWorkspace/listWorkspaces
 * @param {string} tenantId validated tenant UUID (caller must resolve the tenant first)
 * @param {string|null} [requestedWorkspaceId] optional explicit workspace UUID
 * @returns {Promise<{id: string, tenantId: string, name: string, isDefault: boolean, resolution: 'EXPLICIT'|'DEFAULT'|'FIRST_ACTIVE'}>}
 */
async function resolveAssignableWorkspace(registry, tenantId, requestedWorkspaceId = null) {
  if (!registry || (typeof registry.getWorkspace !== 'function' && typeof registry.listWorkspaces !== 'function')) {
    throw workspaceResolutionError('Tenant registry does not expose workspace resolution.', 'TENANT_SERVICE_UNAVAILABLE', 503);
  }

  const requested = String(requestedWorkspaceId || '').trim();
  if (requested) {
    // Strict UUID validation remains centralized in assertUuid(); this call
    // only re-labels the contract breach for API consumers so a malformed
    // workspace id never masquerades as a tenant problem.
    let workspaceId;
    try {
      workspaceId = assertUuid(requested, 'Workspace identifier');
    } catch (_error) {
      throw workspaceResolutionError('Workspace identifier must be a UUID.', 'INVALID_WORKSPACE_ID', 400);
    }
    if (!UUID_HINT.test(workspaceId)) {
      throw workspaceResolutionError('Workspace identifier must be a UUID.', 'INVALID_WORKSPACE_ID', 400);
    }
    // getWorkspace is tenant-scoped (WHERE id = ? AND tenantId = ? AND
    // lifecycleState = 'ACTIVE'): a workspace outside this tenant — defective
    // or intentionally cross-tenant — fails closed as not found.
    const workspace = await registry.getWorkspace(workspaceId, tenantId);
    return {
      id: workspace.id,
      tenantId: workspace.tenantId || tenantId,
      name: workspace.name || 'Workspace',
      isDefault: workspace.isDefault === true,
      resolution: 'EXPLICIT',
    };
  }

  const workspaces = await registry.listWorkspaces(tenantId);
  const active = (Array.isArray(workspaces) ? workspaces : [])
    .filter(workspace => String(workspace.lifecycleState || 'ACTIVE').toUpperCase() === 'ACTIVE');
  const canonical = active.find(workspace => workspace.isDefault === true) || null;
  const picked = canonical || active[0] || null;
  if (!picked) {
    throw workspaceResolutionError(
      'This organization has no active workspace. Create or reactivate a workspace for the organization before assigning members.',
      'TENANT_NO_USABLE_WORKSPACE',
      409
    );
  }
  return {
    id: picked.id,
    tenantId: picked.tenantId || tenantId,
    name: picked.name || 'Workspace',
    isDefault: canonical ? true : picked.isDefault === true,
    resolution: canonical ? 'DEFAULT' : 'FIRST_ACTIVE',
  };
}

module.exports = {
  resolveAssignableWorkspace,
};
