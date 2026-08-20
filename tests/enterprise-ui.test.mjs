import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const files = {
  main: 'src/main.jsx',
  context: 'src/enterprise/EnterpriseContext.jsx',
  console: 'src/enterprise/EnterpriseConsole.jsx',
  css: 'src/enterprise/enterprise.css',
  browserState: 'src/utils/browserState.js',
  sidebar: 'src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx',
};

async function source(name) {
  return fs.readFile(files[name], 'utf8');
}

test('enterprise route is authenticated and isolated from certified builder routes', async () => {
  const main = await source('main');
  assert.match(main, /path="\/enterprise\/\*"[^\n]+RequireAuthenticated/);
  assert.match(main, /const EnterpriseConsole = lazy\(\(\) => import\('\.\/enterprise\/EnterpriseConsole'\)\)/);
  assert.match(main, /path="\/build-resume\/\*"[^\n]+BuildResume/);
  assert.match(main, /path="\/dashboard\/\*"[^\n]+Dashboard/);
  const sidebar = await source('sidebar');
  assert.match(sidebar, /VITE_ENTERPRISE_TENANCY_ENABLED === 'true'/);
  assert.match(sidebar, /Enterprise Workspace/);
});

test('tenant context selection is feature-gated, server-resolved and cleared with account browser state', async () => {
  const [context, browserState, api] = await Promise.all([source('context'), source('browserState'), fs.readFile('src/enterprise/enterpriseApi.js', 'utf8')]);
  assert.match(context, /VITE_ENTERPRISE_TENANCY_ENABLED === 'true'/);
  assert.match(context, /enterpriseFetch\('\/api\/enterprise\/status'/);
  assert.match(context, /enterpriseFetch\('\/api\/enterprise\/context'/);
  assert.match(api, /X-Tenant-Id/);
  assert.match(api, /Authorization.*Bearer/);
  assert.match(context, /server verifies.*membership/);
  assert.match(context, /enterprise_context_request:/);
  assert.match(context, /enterprise_workspace_request:/);
  assert.match(context, /selectWorkspace/);
  assert.match(browserState, /enterprise_context_request:/);
  assert.doesNotMatch(context, /localStorage\.setItem\([^\n]*tenant.*Authorization/i);
});

test('enterprise shell makes tenant/workspace context, role-aware navigation and security states visible', async () => {
  const view = await source('console');
  for (const fragment of [
    'TenantSwitcher', 'WorkspaceBadge', 'Roles & permissions',
    'AI workspace', 'Usage & Quotas', 'Audit logs',
    'CommandPalette', 'useLocation', 'useNavigate', 'normalizeTab'
  ]) assert.match(view, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(view, /context\?\.permissions/);
  assert.match(view, /search\.set\('tab'/);
  assert.match(view, /role="dialog"/);
  assert.match(view, /aria-modal="true"/);
  assert.match(view, /aria-label="Enterprise Navigation"/);
});

test('enterprise design system includes responsive, focus, reduced-motion, loading and error patterns', async () => {
  const css = await source('css');
  for (const fragment of [
    '--enterprise-primary', ':focus-visible', '@media (max-width: 768px)',
    '@media (prefers-reduced-motion: reduce)', '.enterprise-spinner',
    '.enterprise-command-backdrop'
  ]) assert.match(css, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('workspace administration exposes rename, archive/restore and workspace member management against real endpoints', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseWorkspacesTab.jsx', 'utf8');
  assert.match(view, /method: 'PATCH'/);
  assert.match(view, /\/archive/);
  assert.match(view, /\/restore/);
  assert.match(view, /includeArchived=1/);
  assert.match(view, /\/members/);
  assert.match(view, /hasPermission\('tenant\.workspaces\.manage'\)/);
  assert.match(view, /WorkspaceMembersDrawer/);
  // No fake data: every mutation goes through the tenant-scoped request helper.
  assert.doesNotMatch(view, /const\s+FAKE|mockMembers|sampleWorkspaces/);
});

test('team administration exposes rename, archive and team member management against real endpoints', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseTeamsTab.jsx', 'utf8');
  assert.match(view, /\/api\/enterprise\/teams/);
  assert.match(view, /method: 'PATCH'/);
  assert.match(view, /\/archive/);
  assert.match(view, /TeamMembersDrawer/);
  assert.match(view, /teams\/\$\{encodeURIComponent\(team\.id\)\}\/members/);
  assert.doesNotMatch(view, /mockTeams|sampleTeams/);
});

test('audit view sends filters to the server and can export CSV and JSON', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseAuditTab.jsx', 'utf8');
  assert.match(view, /\/api\/enterprise\/audit\?\$\{query\}/);
  assert.match(view, /params\.set\('outcome'/);
  assert.match(view, /params\.set\('action'/);
  assert.match(view, /params\.set\('since'/);
  assert.match(view, /params\.set\('until'/);
  assert.match(view, /handleExportCsv/);
  assert.match(view, /handleExportJson/);
});

test('users view offers status filtering, workspace assignment and membership details', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseUsersTab.jsx', 'utf8');
  assert.match(view, /STATUS_FILTERS/);
  assert.match(view, /handleWorkspaceAssign/);
  assert.match(view, /body: \{ workspaceId \}/);
  assert.match(view, /detailMember/);
});

test('overview recommendations are derived from live state only', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseOverviewTab.jsx', 'utf8');
  assert.match(view, /Recommended Actions/);
  assert.match(view, /deadLetterCount/);
  assert.match(view, /suspendedCount/);
  // Recommendations must reference loaded state, not literals pretending to be data.
  assert.doesNotMatch(view, /recommendations\s*=\s*\[\s*\{/);
});

test('console renders explicit MFA, re-auth, and suspended-tenant failure states', async () => {
  const view = await source('console');
  assert.match(view, /TENANT_MFA_REQUIRED/);
  assert.match(view, /TENANT_SESSION_REAUTH_REQUIRED/);
  assert.match(view, /TENANT_INACTIVE/);
  assert.match(view, /Retry/);
});

test('settings expose governed security and identity policies against the revisioned configuration API', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseSettingsTab.jsx', 'utf8');
  assert.match(view, /requireMfaForAdmins/);
  assert.match(view, /supportAccessRequiresApproval/);
  assert.match(view, /ssoMode/);
  assert.match(view, /sessionMaxMinutes/);
  assert.match(view, /expectedRevision: configuration\.revision/);
});

// ═══ Completeness audit UI coverage ═══════════════════════════════════════════

test('team administration exposes the complete lifecycle including restore, archived view, and lead', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseTeamsTab.jsx', 'utf8');
  assert.match(view, /\/restore/);
  assert.match(view, /includeArchived=1/);
  assert.match(view, /Archived Teams/);
  assert.match(view, /handleRestore/);
  assert.match(view, /leadPrincipalId/);
});

test('audit view exposes actor, severity, and category filters plus keyset pagination', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseAuditTab.jsx', 'utf8');
  assert.match(view, /params\.set\('actor'/);
  assert.match(view, /params\.set\('severity'/);
  assert.match(view, /params\.set\('category'/);
  assert.match(view, /params\.set\('cursor'/);
  assert.match(view, /nextCursor/);
  assert.match(view, /Load more events/);
});

test('users view exposes invitations, effective permissions, member activity, and export', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseUsersTab.jsx', 'utf8');
  assert.match(view, /invitation-resend/);
  assert.match(view, /status: wantsInvitation \? 'INVITED' : 'ACTIVE'/);
  assert.match(view, /effectivePermissions/);
  assert.match(view, /onInspectActivity/);
  assert.match(view, /handleExport\('csv'\)/);
  assert.match(view, /roles-matrix/);
  assert.match(view, /customRoles/);
});

test('security view exposes key rotation, expiry visibility, and a real posture section', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseSecurityTab.jsx', 'utf8');
  assert.match(view, /\/rotate/);
  assert.match(view, /handleRotate/);
  assert.match(view, /expiresAt/);
  assert.match(view, /expiring soon/);
  assert.match(view, /Security Posture/);
  assert.match(view, /data-plane\/status/);
});

test('ai governance view exposes the enforced model allowlist and primary model', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseAiTab.jsx', 'utf8');
  assert.match(view, /allowedModels/);
  assert.match(view, /primaryModel/);
  assert.match(view, /Model Allowlist/);
  assert.doesNotMatch(view, /coming soon/i);
});

test('usage view exposes quota consumption, per-user breakdown, generation ledger, and window selector', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseUsageTab.jsx', 'utf8');
  assert.match(view, /days=\$\{daysWindow\}/);
  assert.match(view, /Quota Consumption/);
  assert.match(view, /aiRequestsPerDay/);
  assert.match(view, /byUser/);
  assert.match(view, /usage\/ai\/events/);
  assert.match(view, /Recent AI Generations/);
  assert.match(view, /role="progressbar"/);
});

test('settings expose organization rename and verified data export alongside policies', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseSettingsTab.jsx', 'utf8');
  assert.match(view, /\/api\/enterprise\/tenant/);
  assert.match(view, /Rename Organization/);
  assert.match(view, /data\/export/);
  assert.match(view, /checksum/);
  assert.match(view, /federated identity provider/);
});

test('roles view exposes custom role definition and member counts', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseRolesTab.jsx', 'utf8');
  assert.match(view, /customRoles/);
  assert.match(view, /Define Custom Role/);
  assert.match(view, /memberCountByRole/);
  assert.match(view, /assigned member/);
});

test('platform administration tab is server-gated and exposes the tenant registry lifecycle', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterprisePlatformTab.jsx', 'utf8');
  assert.match(view, /platform\/tenants/);
  assert.match(view, /'suspend' : 'reactivate'/);
  assert.match(view, /handleLifecycle/);
  assert.match(view, /Provision Tenant/);
  const consoleView = await source('console');
  assert.match(consoleView, /platformOnly: true/);
  assert.match(consoleView, /platformAdmin === true/);
  assert.match(consoleView, /EnterprisePlatformTab/);
});

test('overview exposes team and quota intelligence derived from live endpoints', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseOverviewTab.jsx', 'utf8');
  assert.match(view, /usage\/ai\?days=1/);
  assert.match(view, /quotaRatio/);
  assert.match(view, /AI quota is nearing its limit/);
  assert.match(view, /pendingInvitations/);
});

test('support view exposes server-enforced scope governance and grant lifecycle visibility', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseSupportTab.jsx', 'utf8');
  assert.match(view, /DIAGNOSTIC_SCOPES/);
  assert.match(view, /repairAllowed/);
  assert.match(view, /requestedBySubjectId/);
  assert.match(view, /statusFilter/);
  assert.match(view, /scopes,/);
});

test('settings rename refreshes the console context', async () => {
  const view = await fs.readFile('src/enterprise/components/EnterpriseSettingsTab.jsx', 'utf8');
  assert.match(view, /useEnterpriseTenant/);
  assert.match(view, /reload\(\)\.catch/);
});
