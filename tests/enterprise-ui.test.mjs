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
  const [context, browserState] = await Promise.all([source('context'), source('browserState')]);
  assert.match(context, /VITE_ENTERPRISE_TENANCY_ENABLED === 'true'/);
  assert.match(context, /request\('\/api\/enterprise\/status'/);
  assert.match(context, /request\('\/api\/enterprise\/context'/);
  assert.match(context, /X-Tenant-Id/);
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
    'TenantSwitcher', 'WorkspaceBadge', 'Roles & permissions', 'Security center',
    'AI workspace', 'Usage & billing', 'Audit logs', 'Data & privacy',
    'CommandPalette', 'Tenant scoped', 'No synthetic trends'
  ]) assert.match(view, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(view, /role="dialog"/);
  assert.match(view, /aria-modal="true"/);
  assert.match(view, /aria-label="Enterprise navigation"/);
  assert.match(view, /caption className="sr-only"/);
});

test('enterprise design system includes responsive, focus, reduced-motion, loading and error patterns', async () => {
  const css = await source('css');
  for (const fragment of [
    '--enterprise-primary', ':focus-visible', '@media (max-width: 720px)',
    '@media (prefers-reduced-motion: reduce)', '.enterprise-spinner', '.enterprise-empty-panel',
    '.enterprise-command-backdrop'
  ]) assert.match(css, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
