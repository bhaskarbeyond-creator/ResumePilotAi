import { makeMockJwt, installAuthenticatedSession, viteFixtureDefines } from './enterprise-fixture.mjs';

export { viteFixtureDefines, installAuthenticatedSession, makeMockJwt };


/**
 * Deterministic operational-status snapshot mirroring the shape produced by
 * backend/services/platformHealth.js. Every state in the STATE enum is
 * represented at least once so the Platform Health UI can be exercised against
 * each rendering branch without touching a live provider.
 */
export function seedOperationalSnapshot(now = new Date().toISOString()) {
  const services = [
    {
      id: 'backend-api', name: 'Backend API', group: 'core', state: 'OPERATIONAL', support: 'SUPPORTED', enabled: true,
      configuration: 'CONFIGURED', critical: true, reason: 'HTTP server is accepting requests.', dependency: 'Express application',
      retryable: false, errorCategory: null, remediation: null, affectedFeatures: [], affectedApis: [], affectedUiModules: [],
      metrics: { uptimeSeconds: 3600, commitSha: 'fixture-sha' }, testable: false, lastCheckedAt: now, docsHref: null,
    },
    {
      id: 'database', name: 'MariaDB', group: 'core', state: 'OPERATIONAL', support: 'SUPPORTED', enabled: true,
      configuration: 'CONFIGURED', critical: true, reason: 'Connectivity probe succeeded in 24ms.', dependency: 'MariaDB',
      retryable: true, errorCategory: null, remediation: null, affectedFeatures: [], affectedApis: [], affectedUiModules: [],
      metrics: { latencyMs: 24 }, testable: true, lastCheckedAt: now, docsHref: null,
    },
    {
      id: 'email-smtp', name: 'Email (SMTP)', group: 'integrations', state: 'DEGRADED', support: 'SUPPORTED', enabled: true,
      configuration: 'PARTIALLY_CONFIGURED', critical: false,
      reason: 'SMTP host is configured but the fallback transport is carrying delivery.',
      dependency: 'SMTP relay', retryable: true, errorCategory: 'PROVIDER_ERROR',
      remediation: 'Verify the primary SMTP credentials in Admin → Settings → Email.',
      affectedFeatures: ['Transactional email', 'Password reset delivery'],
      affectedApis: ['POST /api/email/send'], affectedUiModules: ['/adm/email-logs'],
      metrics: { queuedCount: 3 }, testable: true, lastCheckedAt: now, docsHref: null,
    },
    {
      id: 'payments-paypal', name: 'PayPal', group: 'integrations', state: 'DISABLED', support: 'SUPPORTED', enabled: false,
      configuration: 'DISABLED_BY_CONFIGURATION', critical: false,
      reason: 'PayPal is switched off in payment provider settings.', dependency: 'PayPal REST API',
      retryable: false, errorCategory: null,
      remediation: 'Enable PayPal in Admin → Settings → Payments and supply live credentials.',
      affectedFeatures: ['PayPal checkout'], affectedApis: ['POST /api/paypal/create-order'],
      affectedUiModules: ['/plans'], metrics: {}, testable: false, lastCheckedAt: now, docsHref: null,
    },
    {
      id: 'github-oauth', name: 'GitHub OAuth', group: 'integrations', state: 'NOT_CONFIGURED', support: 'SUPPORTED', enabled: true,
      configuration: 'NOT_CONFIGURED', critical: false,
      reason: 'No GitHub client ID or secret is present, so the sign-in route cannot complete.',
      dependency: 'GitHub OAuth', retryable: false, errorCategory: 'CONFIGURATION_MISSING',
      remediation: 'Add the GitHub OAuth client ID and secret, then re-run the health check.',
      affectedFeatures: ['GitHub sign-in'], affectedApis: ['GET /api/auth/github'],
      affectedUiModules: ['/login'], metrics: {}, testable: false, lastCheckedAt: now, docsHref: null,
    },
    {
      id: 'enterprise-tenancy', name: 'Enterprise Tenancy', group: 'core', state: 'UNAVAILABLE', support: 'SUPPORTED', enabled: true,
      configuration: 'CONFIGURED', critical: true,
      reason: 'The tenancy data plane did not answer its readiness probe.',
      dependency: 'Enterprise data plane', retryable: true, errorCategory: 'NETWORK_UNREACHABLE',
      remediation: 'Check the tenancy data-plane connection and re-run the health check.',
      affectedFeatures: ['Tenant provisioning', 'Tenant isolation'],
      affectedApis: ['GET /api/enterprise/platform/tenants'], affectedUiModules: ['/adm/tenants'],
      metrics: {}, testable: false, lastCheckedAt: now, docsHref: null,
    },
    {
      id: 'twilio-sms', name: 'Twilio SMS', group: 'integrations', state: 'NOT_SUPPORTED', support: 'NOT_SUPPORTED', enabled: false,
      configuration: 'NOT_APPLICABLE', critical: false,
      reason: 'This deployment does not ship an SMS channel.', dependency: 'Twilio', retryable: false,
      errorCategory: null, remediation: null, affectedFeatures: [], affectedApis: [], affectedUiModules: [],
      metrics: {}, testable: false, lastCheckedAt: now, docsHref: null,
    },
    {
      id: 'dlq', name: 'Dead Letter Queue', group: 'workers', state: 'UNKNOWN', support: 'SUPPORTED', enabled: true,
      configuration: 'UNKNOWN', critical: false,
      reason: 'The dead-letter depth could not be read, so no claim is made about it.',
      dependency: 'Notification outbox', retryable: true, errorCategory: 'DATA_UNAVAILABLE',
      remediation: 'Re-run the health check; if this persists, inspect the MariaDB outbox tables.',
      affectedFeatures: [], affectedApis: [], affectedUiModules: ['/adm/queues'],
      metrics: {}, testable: false, lastCheckedAt: now, docsHref: null,
    },
  ];

  const counts = services.reduce((acc, item) => { acc[item.state] = (acc[item.state] || 0) + 1; return acc; }, {});

  const endpoints = [
    { method: 'GET', path: '/api/healthz', module: 'platform', authentication: 'PUBLIC', dependency: 'Express application', dependencyId: 'backend-api', externalDependency: false, state: 'OPERATIONAL' },
    { method: 'GET', path: '/api/platform/operational-status', module: 'platform', authentication: 'ADMIN', dependency: 'Express application', dependencyId: 'backend-api', externalDependency: false, state: 'OPERATIONAL' },
    { method: 'POST', path: '/api/email/send', module: 'email', authentication: 'AUTHENTICATED', dependency: 'SMTP relay', dependencyId: 'email-smtp', externalDependency: true, state: 'DEGRADED' },
    { method: 'POST', path: '/api/paypal/create-order', module: 'payments', authentication: 'AUTHENTICATED', dependency: 'PayPal REST API', dependencyId: 'payments-paypal', externalDependency: true, state: 'UNAVAILABLE' },
    { method: 'GET', path: '/api/auth/github', module: 'auth', authentication: 'PUBLIC', dependency: 'GitHub OAuth', dependencyId: 'github-oauth', externalDependency: true, state: 'UNAVAILABLE' },
    { method: 'GET', path: '/api/enterprise/platform/tenants', module: 'enterprise', authentication: 'ADMIN', dependency: 'Enterprise data plane', dependencyId: 'enterprise-tenancy', externalDependency: false, state: 'UNAVAILABLE' },
  ];

  return {
    checkedAt: now,
    summary: {
      overall: 'CRITICAL',
      indicator: 'red',
      counts,
      total: services.length,
      worstState: 'UNAVAILABLE',
    },
    sources: { database: 'ok', email: 'ok', outbox: 'unavailable' },
    services,
    apiMatrix: {
      total: endpoints.length,
      counts: endpoints.reduce((acc, item) => { acc[item.state] = (acc[item.state] || 0) + 1; return acc; }, {}),
      operationalOrExpected: endpoints.filter(item => item.state === 'OPERATIONAL').length,
      degraded: endpoints.filter(item => item.state === 'DEGRADED').length,
      unavailable: endpoints.filter(item => item.state === 'UNAVAILABLE').length,
      endpoints,
    },
    groups: ['core', 'integrations', 'workers'],
    cached: false,
    cacheAgeMs: 0,
  };
}

export function seedSuperAdminState() {
  const now = new Date().toISOString();
  return {
    healthScore: 82,
    status: 'DEGRADED',
    riskScore: 28,
    commitSha: 'fixture-sha',
    uptimeSeconds: 3600,
    subsystems: {
      database: { status: 'HEALTHY', latencyMs: 12, provider: 'MariaDB' },
      queue: { status: 'DEGRADED', activeJobs: 2, deadLetterJobs: 1, completedJobs: 8 },
      runtime: { nodeVersion: 'v22.0.0', platform: 'linux', heapUsedMb: 80, heapTotalMb: 140 },
      tenancy: { dataProvider: 'mysql', dataPlaneConfigured: true, encryption: { provider: 'server-key' } },
    },
    kpis: { totalUsers: 42, resumesCreated: 90, totalDownloads: 17, totalEarnings: 199.5, currency: 'USD', tenants: { total: 3, active: 2, suspended: 1 } },
    signals: {
      database: { status: 'HEALTHY', latencyMs: 12 },
      queue: { status: 'DEGRADED', deadLetter: 1, pending: 2 },
      payments: { status: 'HEALTHY', failed: 0, pending: 1, active: 4, inspected: 5 },
      security: { status: 'ATTENTION', highSeverity: 1, recentCount: 3 },
      encryption: { status: 'CONFIGURED', provider: 'server-key' },
      deployment: { status: 'REPORTED', commitSha: 'fixture-sha', nodeVersion: 'v22.0.0' },
    },
    recommendations: [
      { id: 'dlq', severity: 'HIGH', title: '1 dead-letter notification(s)', detail: 'Replay or inspect failed email/outbox jobs.', href: '/adm/queues' },
      { id: 'security', severity: 'HIGH', title: '1 high-severity security event(s)', detail: 'Inspect the security event stream.', href: '/adm/security' },
    ],
    attentionTenants: [{ id: 'tenant-suspended', displayName: 'Initech HR', slug: 'initech-hr', lifecycleState: 'SUSPENDED', isolationTier: 'STANDARD' }],
    recentAudit: [{ id: 'a1', action: 'UPDATE_AI_SETTINGS', actorEmail: 'super@example.com', severity: 'MEDIUM', pathname: '/api/admin/ai-settings', createdAt: now }],
    recentSecurity: [{ id: 's1', action: 'LOGIN_MFA_DENIED', actorUid: 'u1', severity: 'HIGH', createdAt: now }],
    maintenance: { enabled: false, message: '' },
    announcements: [],
    sources: { health: 'ok', payments: 'ok', security: 'ok' },
    tenants: [
      { id: 'tenant-active', displayName: 'Northwind Careers', slug: 'northwind-careers', lifecycleState: 'ACTIVE', isolationTier: 'ENTERPRISE' },
      { id: 'tenant-suspended', displayName: 'Initech HR', slug: 'initech-hr', lifecycleState: 'SUSPENDED', isolationTier: 'STANDARD' },
    ],
    queues: {
      summary: { totalInspected: 2, deadLetterCount: 1, pendingCount: 1, successCount: 0 },
      jobs: [
        { id: 'job-dead', channel: 'email', recipient: 'abc***@example.com', templateType: 'welcome', state: 'DEAD_LETTER', attemptCount: 5, createdAt: now },
        { id: 'job-ok', channel: 'email', recipient: 'xyz***@example.com', templateType: 'invoice', state: 'QUEUED', attemptCount: 1, createdAt: now },
      ],
    },
    auditLogs: [{ id: 'a1', action: 'UPDATE_AI_SETTINGS', actorEmail: 'super@example.com', category: 'ai.governance', severity: 'MEDIUM', outcome: 'SUCCESS', pathname: '/api/admin/ai-settings', statusCode: 200, createdAt: now, metadata: {} }],
    securityEvents: [{ id: 's1', action: 'LOGIN_MFA_DENIED', actorUid: 'u1', severity: 'HIGH', createdAt: now }],
    encryption: { encryption: { provider: 'server-key', configured: true, securityLevel: 'SERVER_SIDE_MASTER_KEY_ENVELOPE_AES_256_GCM', activeVersion: 'v1' }, dataPlane: { provider: 'mysql', configured: true } },
    observability: { metrics: { sampleCount: 12, p50: 20, p95: 80, p99: 120, errors: { serverErrors: 0 } }, note: 'Fixture telemetry' },
    backup: { capability: { available: true, note: 'Enterprise tenant export' }, lastRecordedExport: null },
    paymentsHealth: { status: 'HEALTHY', counts: { inspected: 5, FAILED: 0, PENDING: 1, ACTIVE: 4 } },
    operational: seedOperationalSnapshot(now),
  };
}

export function createSuperAdminFixtureBackend(state = seedSuperAdminState()) {
  return async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch { body = {}; }
    const json = (payload, status = 200) => route.fulfill({ status, json: payload });

    if (path === '/api/healthz' || path === '/healthz') return json({ status: 'ok', firebaseAdminConfigured: true });
    if (path === '/api/service-availability') {
      const usable = id => state.operational.services.some(item => item.id === id && item.state === 'OPERATIONAL');
      return json({
        success: true,
        checkedAt: state.operational.checkedAt,
        auth: { github: usable('github-oauth'), linkedin: usable('linkedin-oauth') },
        payments: { stripe: usable('payments-stripe'), paypal: usable('payments-paypal'), razorpay: usable('payments-razorpay'), paytm: usable('payments-paytm'), phonepe: usable('payments-phonepe') },
        enterpriseTenancy: usable('enterprise-tenancy'),
      });
    }
    if (path === '/api/platform/command-center') {
      return json({
        ...state,
        operationalStatus: {
          overall: state.operational.summary.overall,
          indicator: state.operational.summary.indicator,
          counts: state.operational.summary.counts,
          checkedAt: state.operational.checkedAt,
          apiMatrix: {
            total: state.operational.apiMatrix.total,
            operationalOrExpected: state.operational.apiMatrix.operationalOrExpected,
            degraded: state.operational.apiMatrix.degraded,
            unavailable: state.operational.apiMatrix.unavailable,
          },
          attention: state.operational.services
            .filter(item => ['UNAVAILABLE', 'DEGRADED', 'UNKNOWN'].includes(item.state))
            .map(item => ({ id: item.id, name: item.name, state: item.state, reason: item.reason, critical: item.critical })),
        },
      });
    }
    if (path === '/api/platform/health') return json({ status: state.status, healthScore: state.healthScore, commitSha: state.commitSha, uptimeSeconds: state.uptimeSeconds, subsystems: state.subsystems });
    if (path === '/api/platform/queues' && method === 'GET') return json(state.queues);
    if (path === '/api/platform/queues/retry' && method === 'POST') {
      if (body.jobId) {
        const job = state.queues.jobs.find(item => item.id === body.jobId);
        if (job) { job.state = 'QUEUED'; job.attemptCount = 0; state.queues.summary.deadLetterCount = state.queues.jobs.filter(item => item.state === 'DEAD_LETTER').length; }
        return json({ success: true, retriedCount: job ? 1 : 0 });
      }
      return json({ success: true, retriedCount: 0 });
    }
    if (path === '/api/admin/audit-logs') return json({ logs: state.auditLogs, count: state.auditLogs.length });
    if (path === '/api/admin/audit-logs/stats') return json({ sampleSize: state.auditLogs.length, successRate: 100, highSeverityCount: 0, categoryCounts: {}, topActors: [] });
    if (path === '/api/enterprise/platform/tenants' && method === 'GET') return json({ tenants: state.tenants });
    if (path === '/api/enterprise/tenants' && method === 'POST') {
      const tenant = { id: `tenant-${Date.now()}`, displayName: body.displayName, slug: body.slug, lifecycleState: 'ACTIVE', isolationTier: body.isolationTier || 'STANDARD' };
      state.tenants.push(tenant);
      return json({ tenant }, 201);
    }
    {
      const lifecycle = path.match(/^\/api\/enterprise\/platform\/tenants\/([^/]+)\/(suspend|reactivate)$/);
      if (lifecycle && method === 'POST') {
        const tenant = state.tenants.find(item => item.id === lifecycle[1]);
        if (!tenant) return json({ error: { message: 'not found' } }, 404);
        tenant.lifecycleState = lifecycle[2] === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
        return json({ tenant });
      }
    }
    if (path.startsWith('/api/platform/tenants/') && path.endsWith('/decommission') && method === 'POST') {
      const id = path.split('/')[4];
      const tenant = state.tenants.find(item => item.id === id);
      if (!tenant) return json({ error: { message: 'not found' } }, 404);
      tenant.lifecycleState = 'DELETING';
      return json({ tenant });
    }
    if (path === '/api/platform/security-events') return json({ events: state.securityEvents, count: state.securityEvents.length });
    if (path === '/api/platform/encryption') return json(state.encryption);
    if (path === '/api/platform/observability') return json(state.observability);
    if (path === '/api/platform/backup-status') return json(state.backup);
    if (path === '/api/platform/maintenance' && method === 'GET') return json(state.maintenance);
    if (path === '/api/platform/maintenance' && method === 'POST') {
      state.maintenance = { enabled: body.enabled === true, message: body.message || state.maintenance.message };
      return json({ success: true, enabled: state.maintenance.enabled });
    }
    if (path === '/api/platform/announcements' && method === 'GET') return json({ announcements: state.announcements });
    if (path === '/api/platform/announcements' && method === 'POST') {
      const item = { id: `ann-${Date.now()}`, title: body.title, message: body.message, severity: body.severity || 'INFO', enabled: true };
      state.announcements.push(item);
      return json({ announcement: item }, 201);
    }
    if (path.startsWith('/api/platform/announcements/') && method === 'DELETE') {
      const id = path.split('/').pop();
      state.announcements = state.announcements.filter(item => item.id !== id);
      return json({ success: true, id });
    }
    if (path === '/api/platform/attention') {
      return json({
        items: state.recommendations,
        status: state.status,
        healthScore: state.healthScore,
        operationalStatus: {
          overall: state.operational.summary.overall,
          indicator: state.operational.summary.indicator,
          counts: state.operational.summary.counts,
          checkedAt: state.operational.checkedAt,
        },
        operationalSource: 'ok',
        note: 'Fixture attention',
      });
    }
    if (path === '/api/platform/health-indicator') {
      return json({
        indicator: state.operational.summary.indicator,
        overall: state.operational.summary.overall,
        counts: state.operational.summary.counts,
        attentionCount: state.operational.services.filter(item => ['UNAVAILABLE', 'DEGRADED', 'UNKNOWN'].includes(item.state)).length,
        checkedAt: state.operational.checkedAt,
      });
    }
    if (path === '/api/platform/operational-status' && method === 'GET') {
      state.operational.checkedAt = new Date().toISOString();
      return json({ ...state.operational, elevated: true });
    }
    if (path === '/api/platform/operational-status/api-matrix') {
      return json({ checkedAt: state.operational.checkedAt, ...state.operational.apiMatrix });
    }
    if (path === '/api/platform/operational-status/refresh' && method === 'POST') {
      state.operational.checkedAt = new Date().toISOString();
      state.healthRefreshCount = (state.healthRefreshCount || 0) + 1;
      return json({ ...state.operational, elevated: true });
    }
    {
      const test = path.match(/^\/api\/platform\/operational-status\/([a-z0-9-]+)\/test$/);
      if (test && method === 'POST') {
        const service = state.operational.services.find(item => item.id === test[1]);
        if (!service) return json({ error: { code: 'SERVICE_NOT_FOUND', message: 'Unknown service' } }, 404);
        if (!service.testable) return json({ error: { code: 'SERVICE_TEST_UNSUPPORTED', message: 'This service does not expose a safe operator test' } }, 400);
        return json({ serviceId: service.id, passed: true, latencyMs: 31, detail: 'Fixture probe succeeded in 31ms.', errorCategory: null });
      }
      const detail = path.match(/^\/api\/platform\/operational-status\/([a-z0-9-]+)$/);
      if (detail && method === 'GET') {
        const service = state.operational.services.find(item => item.id === detail[1]);
        if (!service) return json({ error: { code: 'SERVICE_NOT_FOUND', message: 'Unknown service' } }, 404);
        return json({
          service,
          checkedAt: state.operational.checkedAt,
          relatedEndpoints: state.operational.apiMatrix.endpoints.filter(item => item.dependencyId === service.id),
          auditEvents: service.id === 'email-smtp'
            ? [{ id: 'ae1', action: 'TEST_PLATFORM_INTEGRATION', actorEmail: 'super@example.com', severity: 'LOW', outcome: 'SUCCESS', createdAt: state.operational.checkedAt }]
            : [],
          auditSource: service.id === 'dlq' ? 'unavailable' : 'ok',
          elevated: true,
        });
      }
    }
    if (path === '/api/platform/enterprise-queue') {
      return json({ queue: { status: 'online', deadLetterCount: 0, configured: true }, note: 'Fixture enterprise outbox' });
    }
    if (path === '/api/platform/operators' && method === 'GET') {
      return json({ operators: [{ id: 'super-admin', email: 'super@example.com', role: 'SUPER_ADMIN', suspended: false }], note: 'Fixture operators' });
    }
    if (path === '/api/platform/operators' && method === 'POST') {
      return json({ success: true, uid: body.uid, role: body.role });
    }
    if (path === '/api/platform/search') return json({ query: url.searchParams.get('q'), users: [], tenants: state.tenants.filter(item => item.displayName.toLowerCase().includes(String(url.searchParams.get('q') || '').toLowerCase())) });
    if (path.startsWith('/api/')) return json({ success: true });
    return route.fallback();
  };
}

export async function installSuperAdminSession(page) {
  return installAuthenticatedSession(page, {
    uid: 'super-admin',
    email: 'super@example.com',
    displayName: 'Super Admin',
    claims: { role: 'SUPER_ADMIN' },
  });
}
