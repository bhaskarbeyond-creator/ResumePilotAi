/**
 * GAP-22 frontend & contract regression guards.
 *
 * Production defect (fixed in this pass): Super Admin → User 360 → Assign
 * Tenant always failed with a generic HTTP 400 because the frontend/API
 * contract supplies only the tenant id while the strict MariaDB membership
 * contract requires a concrete tenant-owned workspaceId that nothing
 * resolved. These guards pin the correct abstraction boundary so the defect
 * cannot silently return:
 *
 *   1. The route resolves the tenant's canonical/default workspace server
 *      side and passes the workspaceId into the strict grant contract.
 *   2. mysqlTenantRegistry stays strict — assertUuid(workspaceId) is not
 *      weakened, no optional workspaceId default is introduced.
 *   3. The shared resolver implements the canonical semantics (default-first,
 *      deterministic no-workspace error, tenant-scoped explicit validation).
 *   4. The User 360 drawer renders meaningful success/failure states: which
 *      workspace will be used, already-member truth, actionable errors —
 *      never a bare "HTTP 400".
 *   5. platformFetch normalizes both backend error shapes ({error:{...}} and
 *      {error:"...",code}) instead of collapsing to "HTTP <status>".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const route = read('backend/routes/adminUsers.js');
const opsRoute = read('backend/routes/adminPlatformOperations.js');
const resolver = read('backend/enterprise/workspaceResolution.js');
const registry = read('backend/enterprise/mysqlTenantRegistry.js');
const drawer = read('src/components/admin/usersManager/User360Drawer.jsx');
const platformApi = read('src/services/platformApi.js');
const platformRoute = read('backend/routes/platform.js');

test('GAP-22: User 360 tenant assignment route resolves the canonical workspace before the strict grant', () => {
  assert.match(route, /require\('\.\.\/enterprise\/workspaceResolution'\)/);
  assert.match(route, /resolveAssignableWorkspace\(tenantService\.registry, tenant\.id, requestedWorkspaceId\)/);
  assert.match(route, /grantMembership\(\{ tenantId: tenant\.id, principalId: uid, workspaceId: workspace\.id, roles: \[role\], status: 'ACTIVE' \}\)/);
  // Response must tell the admin which workspace was used and whether the
  // membership already existed.
  assert.match(route, /alreadyMember/);
  assert.match(route, /workspace: \{ id: workspace\.id, name: workspace\.name, isDefault: workspace\.isDefault === true, resolution: workspace\.resolution \}/);
});

test('GAP-22: route validates tenant lifecycle and reports deterministic failure codes', () => {
  assert.match(route, /TENANT_INACTIVE/);
  // TENANT_NOT_FOUND originates from the strict registry getTenant contract.
  assert.match(registry, /TENANT_NOT_FOUND/);
  assert.match(route, /workspaceId || ''\)\.trim\(\) \|\| null/);
});

test('GAP-22: the shared resolver encodes canonical default-workspace semantics', () => {
  // Explicit workspace: UUID assertion kept, tenant-scoped validation.
  assert.match(resolver, /assertUuid\(requested, 'Workspace identifier'\)/);
  assert.match(resolver, /registry\.getWorkspace\(workspaceId, tenantId\)/);
  assert.match(resolver, /INVALID_WORKSPACE_ID/);
  // Canonical default first, deterministic first-active fallback, honest 409.
  assert.match(resolver, /active\.find\(workspace => workspace\.isDefault === true\)/);
  assert.match(resolver, /canonical \|\| active\[0\] \|\| null/);
  assert.match(resolver, /TENANT_NO_USABLE_WORKSPACE/);
  assert.match(resolver, /409/);
});

test('GAP-22: strict registry contract is not weakened (workspaceId stays mandatory)', () => {
  const grant = registry.slice(registry.indexOf('async grantMembership({'));
  assert.match(grant, /workspaceId = assertUuid\(workspaceId, 'Workspace identifier'\)/);
  // The signature must not grow an optional workspaceId default.
  assert.doesNotMatch(grant.slice(0, grant.indexOf(') {')), /workspaceId = null/);
  assert.doesNotMatch(grant.slice(0, grant.indexOf(') {')), /workspaceId = undefined/);
  // Tenant-scope guard inside the grant transaction stays in place.
  assert.match(grant, /WHERE id = \? AND tenantId = \? FOR UPDATE/);
});

test('GAP-22: platform tenant member route resolves the workspace through the same boundary', () => {
  assert.match(opsRoute, /require\('\.\.\/enterprise\/workspaceResolution'\)/);
  assert.match(opsRoute, /resolveAssignableWorkspace\(service\.registry, tenant\.id/);
  assert.match(opsRoute, /grantMembership\(\{[\s\S]*?workspaceId: workspace\.id/);
  assert.match(opsRoute, /TENANT_INACTIVE/);
});

test('GAP-22: platform tenant detail exposes the workspace inventory for the assignment preview', () => {
  assert.match(platformRoute, /workspaces: \{ items: workspaces, source: workspacesResult\.ok \? 'AVAILABLE' : 'UNAVAILABLE' \}/);
});

test('GAP-22: User 360 drawer shows which workspace will be used before assignment (UI preview state)', () => {
  assert.match(drawer, /getTenantDetail/);
  assert.match(drawer, /tenant-workspace-preview/);
  assert.match(drawer, /will join workspace/);
  assert.match(drawer, /tenant-workspace-missing/);
  // Submit is disabled when the preview proves the tenant has no usable
  // workspace or is not active — a deterministic pre-submit state, never a
  // silent 400 after the fact.
  assert.match(drawer, /workspacePreview\.status === 'ready' && !workspacePreview\.workspace/);
});

test('GAP-22: User 360 drawer renders actionable failure states (UI failure state)', () => {
  for (const code of [
    'TENANT_NO_USABLE_WORKSPACE',
    'TENANT_INACTIVE',
    'TENANT_NOT_FOUND',
    'WORKSPACE_NOT_FOUND',
    'WORKSPACE_INACTIVE',
    'INVALID_WORKSPACE_ID',
    'FORBIDDEN',
  ]) {
    assert.ok(drawer.includes(`'${code}'`), `drawer must map ${code} to an actionable message`);
  }
  assert.match(drawer, /describeTenantAssignmentError\(err\)/);
  assert.match(drawer, /Create or reactivate a workspace for the organization/i);
});

test('GAP-22: User 360 drawer reports the post-assignment truth (UI success state)', () => {
  assert.match(drawer, /res\?\.alreadyMember/);
  assert.match(drawer, /workspace: /i);
  assert.match(drawer, /already a member/i);
  // Membership list surfaces the bound workspace from the refreshed state.
  assert.match(drawer, /tenant\.workspaceId/);
});

test('GAP-22: platformFetch never collapses a precise backend error to a bare HTTP status', () => {
  assert.match(platformApi, /typeof data\?\.error === 'string' && data\.error/);
  assert.match(platformApi, /data\?\.error\?\.message/);
  // When the server supplied any message, it must win over "HTTP <status>".
  assert.match(platformApi, /serverMessage \|\| `HTTP \$\{response\.status\}`/);
});

test('GAP-22: assignment request contract stays tenantId-first (workspaceId optional, server-resolved)', () => {
  assert.match(platformApi, /assignUserTenant = \(uid, body\) => platformFetch\(`\/api\/admin\/users\/\$\{encodeURIComponent\(uid\)\}\/tenants`/);
  assert.match(drawer, /tenantId: selectedTenantId/);
  assert.match(drawer, /role: selectedTenantRole/);
});
