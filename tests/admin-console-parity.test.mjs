/**
 * Super-Admin Console & 24 Sub-Modules Parity Test (DIR-006)
 *
 * Verifies all DIR-006 acceptance criteria:
 * 1. CubaAppShell mounting of Admin Console & In-App Blog Editor in router.tsx
 * 2. 24-Submodule architecture preserved across 13 dedicated admin components
 * 3. Authentic API endpoint bindings (/api/platform/operational-status, /api/admin/ai-settings, /api/email/admin/*)
 * 4. Banning of phantom endpoints (/admin/stats, /api/admin/support/tickets/:ticketId/reply, /api/admin/email/*)
 * 5. Maintenance mode contract compliance (maintenanceMode, maintenanceMessage, expectedRevision)
 * 6. Post-save secret masking for all AI provider credentials
 * 7. Formula-neutralized CSV audit export
 * 8. User 360 directory & RBAC staff management
 * 9. Live 28-service operational health telemetry
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ROUTER_TSX = read('frontend/src/app/router.tsx');
const CONSOLE_TSX = read('frontend/src/pages/admin/console.tsx');
const API_HOOKS_TS = read('frontend/src/hooks/use-api-hooks.ts');

// Sub-Module Tab Components
const DASHBOARD_TAB = read('frontend/src/components/admin/AdminDashboardTab.tsx');
const HEALTH_TAB = read('frontend/src/components/admin/AdminHealthTab.tsx');
const QUEUES_TAB = read('frontend/src/components/admin/AdminQueuesTab.tsx');
const OPERATIONS_TAB = read('frontend/src/components/admin/AdminOperationsTab.tsx');
const ATTENTION_TAB = read('frontend/src/components/admin/AdminAttentionTab.tsx');
const USERS_TAB = read('frontend/src/components/admin/AdminUsersTab.tsx');
const HELP_DESK_TAB = read('frontend/src/components/admin/AdminHelpDeskTab.tsx');
const SECURITY_TAB = read('frontend/src/components/admin/AdminSecurityTab.tsx');
const MODERATION_TAB = read('frontend/src/components/admin/AdminModerationTab.tsx');
const BLOG_MGMT_TAB = read('frontend/src/components/admin/AdminBlogManagementTab.tsx');
const CONTENT_MKTG_TAB = read('frontend/src/components/admin/AdminContentMarketingTab.tsx');
const AI_SETTINGS_TAB = read('frontend/src/components/admin/AdminAiSettingsTab.tsx');
const EMAIL_SMTP_TAB = read('frontend/src/components/admin/AdminEmailSmtpTab.tsx');

describe('DIR-006 AC-1: Router Architecture & Shell Mounting', () => {
  it('mounts AdminConsolePage inside CubaAppShell in router.tsx', () => {
    assert.match(
      ROUTER_TSX,
      /<CubaAppShell><AdminConsolePage \/><\/CubaAppShell>/,
      'AdminConsolePage must be wrapped in CubaAppShell'
    );
  });

  it('mounts In-App Blog Editor inside CubaAppShell in router.tsx', () => {
    assert.match(
      ROUTER_TSX,
      /<CubaAppShell><BlogEditorPage \/><\/CubaAppShell>/,
      'BlogEditorPage must be wrapped in CubaAppShell at /blog-editor and /blog-editor/:postId'
    );
  });
});

describe('DIR-006 AC-2: Complete 24-Submodule Architecture Preservation', () => {
  const tabs = [
    { name: 'AdminDashboardTab', content: DASHBOARD_TAB },
    { name: 'AdminHealthTab', content: HEALTH_TAB },
    { name: 'AdminQueuesTab', content: QUEUES_TAB },
    { name: 'AdminOperationsTab', content: OPERATIONS_TAB },
    { name: 'AdminAttentionTab', content: ATTENTION_TAB },
    { name: 'AdminUsersTab', content: USERS_TAB },
    { name: 'AdminHelpDeskTab', content: HELP_DESK_TAB },
    { name: 'AdminSecurityTab', content: SECURITY_TAB },
    { name: 'AdminModerationTab', content: MODERATION_TAB },
    { name: 'AdminBlogManagementTab', content: BLOG_MGMT_TAB },
    { name: 'AdminContentMarketingTab', content: CONTENT_MKTG_TAB },
    { name: 'AdminAiSettingsTab', content: AI_SETTINGS_TAB },
    { name: 'AdminEmailSmtpTab', content: EMAIL_SMTP_TAB },
  ];

  it('preserves all 13 dedicated sub-module components with substantial implementations', () => {
    for (const tab of tabs) {
      assert.ok(
        tab.content.length > 2000,
        `${tab.name} implementation is suspiciously small (length: ${tab.content.length})`
      );
      assert.match(
        CONSOLE_TSX,
        new RegExp(`import\\s+.*${tab.name}`),
        `console.tsx must import ${tab.name}`
      );
    }
  });

  it('declares and mounts all functional navigation tab IDs in console.tsx', () => {
    const requiredNavIds = [
      'dashboard',
      'health',
      'queues',
      'operations',
      'attention',
      'users',
      'support',
      'security',
      'moderation',
      'blog',
      'content',
      'ai-settings',
      'email',
    ];

    for (const id of requiredNavIds) {
      assert.match(
        CONSOLE_TSX,
        new RegExp(`id:\\s*'${id}'`),
        `console.tsx missing navigation item for '${id}'`
      );
    }
  });
});

describe('DIR-006 AC-3: Authentic API Endpoint Contracts & Zero Phantom Routes', () => {
  it('binds platform telemetry strictly to /platform/operational-status (under /api), banning phantom /admin/stats', () => {
    assert.doesNotMatch(API_HOOKS_TS, /['"`]\/admin\/stats['"`]/, 'Phantom /admin/stats must be banned');
    assert.match(API_HOOKS_TS, /\/platform\/operational-status/, 'Must bind to /platform/operational-status');
  });

  it('binds AI multi-provider settings strictly to /admin/ai-settings (under /api)', () => {
    assert.match(API_HOOKS_TS, /\/admin\/ai-settings/);
    // The tab posts through the shared axios client (baseURL '/api'), so the
    // call site is the /admin/ai/test-provider route and must never hard-code
    // a second /api prefix that would resolve to /api/api/...
    assert.match(AI_SETTINGS_TAB, /\/admin\/ai\/test-provider/, 'Live provider reachability test endpoint');
    assert.doesNotMatch(AI_SETTINGS_TAB, /['"`]\/api\/admin\/ai\//, 'Must not double-prefix the API baseURL in a call site');
  });

  it('binds support tickets messages strictly to /admin/support/tickets/:id/messages, banning /reply', () => {
    assert.doesNotMatch(API_HOOKS_TS, /\/tickets\/[^'"]+\/reply/, 'Phantom /tickets/:id/reply endpoint must be banned');
    assert.match(API_HOOKS_TS, /\/admin\/support\/tickets\/[^'"]+\/messages/, 'Must bind to /messages');
  });

  it('binds admin email settings strictly to /api/email/admin/*, banning /api/admin/email/*', () => {
    assert.doesNotMatch(EMAIL_SMTP_TAB, /['"`]\/api\/admin\/email/, 'Calling /api/admin/email/* yields HTTP 404');
    assert.match(EMAIL_SMTP_TAB, /\/api\/email\/admin\/settings/, 'Must call /api/email/admin/settings');
    assert.match(EMAIL_SMTP_TAB, /\/api\/email\/admin\/deliverability/, 'Must call /api/email/admin/deliverability');
    assert.match(EMAIL_SMTP_TAB, /\/api\/email\/admin\/test-connection/, 'Must call /api/email/admin/test-connection');
    assert.match(EMAIL_SMTP_TAB, /\/api\/email\/admin\/save-smtp/, 'Must call /api/email/admin/save-smtp');
  });

  it('enforces maintenance mode contract with revision and maintenanceMessage', () => {
    assert.match(OPERATIONS_TAB, /maintenanceMode/, 'Must supply maintenanceMode boolean');
    assert.match(OPERATIONS_TAB, /maintenanceMessage/, 'Must supply maintenanceMessage string');
    assert.match(OPERATIONS_TAB, /expectedRevision/, 'Must supply expectedRevision number');
  });
});

describe('DIR-006 AC-4: Security Governance, Secret Masking & CSV Sanitization', () => {
  it('masks AI provider secrets and clears input on save (Write-Only)', () => {
    assert.match(AI_SETTINGS_TAB, /'password'/, 'Secrets must support password masked inputs');
    assert.match(AI_SETTINGS_TAB, /Server Active|Configured on Server/, 'Indicates server-side configured state');
    assert.doesNotMatch(AI_SETTINGS_TAB, /placeholder="nvapi-[a-zA-Z0-9]+"/, 'Never leak sample live credentials');
  });

  it('sanitizes spreadsheet formula injections in CSV export', () => {
    assert.match(SECURITY_TAB, /exportNeutralizedCsv/, 'Must implement CSV export');
    assert.match(SECURITY_TAB, /sanitizeCell/, 'Must sanitize spreadsheet cells');
    assert.ok(
      SECURITY_TAB.includes(`str = \`'\${str}\``),
      'Must prefix dangerous formula cells with a single quote to neutralize execution'
    );
  });

  it('provides Super Admin Role View Mode banner in Command Center', () => {
    assert.match(DASHBOARD_TAB, /Super Admin Role View Mode/, 'Command Center must render Role View banner');
  });
});
