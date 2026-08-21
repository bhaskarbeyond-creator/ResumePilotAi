import { makeMockJwt, installAuthenticatedSession, viteFixtureDefines } from './enterprise-fixture.mjs';

export { viteFixtureDefines, installAuthenticatedSession, makeMockJwt };

export function seedSuperAdminState() {
  const now = new Date().toISOString();
  return {
    healthScore: 82,
    status: 'DEGRADED',
    riskScore: 28,
    commitSha: 'fixture-sha',
    uptimeSeconds: 3600,
    subsystems: {
      database: { status: 'HEALTHY', latencyMs: 12, provider: 'Google Cloud Firestore' },
      queue: { status: 'DEGRADED', activeJobs: 2, deadLetterJobs: 1, completedJobs: 8 },
      runtime: { nodeVersion: 'v22.0.0', platform: 'linux', heapUsedMb: 80, heapTotalMb: 140 },
      tenancy: { dataProvider: 'firestore', dataPlaneConfigured: true, encryption: { provider: 'server-key' } },
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
    encryption: { encryption: { provider: 'server-key', configured: true, securityLevel: 'SERVER_SIDE_MASTER_KEY_ENVELOPE_AES_256_GCM', activeVersion: 'v1' }, dataPlane: { provider: 'firestore', configured: true } },
    observability: { metrics: { sampleCount: 12, p50: 20, p95: 80, p99: 120, errors: { serverErrors: 0 } }, note: 'Fixture telemetry' },
    backup: { capability: { available: true, note: 'Enterprise tenant export' }, lastRecordedExport: null },
    announcements: [],
    paymentsHealth: { status: 'HEALTHY', counts: { inspected: 5, FAILED: 0, PENDING: 1, ACTIVE: 4 } },
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
    if (path === '/api/platform/command-center') return json(state);
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
