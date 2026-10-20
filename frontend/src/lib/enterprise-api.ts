/**
 * Enterprise API Client
 *
 * Dedicated client for multi-tenant enterprise endpoints (/api/enterprise/*).
 *
 * INVARIANTS:
 * 1. TENANT RESOLUTION: Tenant context MUST be supplied via X-Tenant-Id header.
 * 2. URL PATH CONTRACT: URL path parameters for tenant id do NOT exist.
 *    Use /api/enterprise/memberships with X-Tenant-Id header.
 * 3. EMAIL VERIFICATION INVARIANT: Human access requires req.user.emailVerified === true.
 *    Throws EMAIL_VERIFICATION_REQUIRED error when backend responds 403.
 * 4. LEGACY ISOLATION: X-Tenant-Id header must NEVER be passed to non-enterprise routes.
 */

import { auth } from '@/lib/firebase';
import { resolveActiveTenantId, setActiveTenantId } from '@/lib/tenant-context';

export interface EnterpriseError extends Error {
  code: string;
  status: number;
  requestId?: string;
  details?: unknown;
}

export interface EnterpriseStatusResponse {
  enabled: boolean;
  apiVersion: string;
  source: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug?: string;
  status?: string;
  tier?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkspaceSummary {
  id: string;
  tenantId: string;
  name: string;
  slug?: string;
  status?: string;
  isDefault?: boolean;
  memberCount?: number;
  leadPrincipalId?: string;
  createdAt?: string;
}

export interface EnterpriseContextResponse {
  tenant: TenantSummary | null;
  workspace: WorkspaceSummary | null;
  platformAdmin?: boolean;
  context?: {
    tenantId: string;
    workspaceId: string;
    roles?: string[];
    permissions?: string[];
    simulatedRole?: string | null;
  };
}

export interface EnterpriseMembership {
  principalId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  roles: string[];
  workspaceId?: string;
  workspaceName?: string;
  invitationEmail?: string;
  email?: string;
  displayName?: string;
  invitedAt?: string;
  acceptedAt?: string;
  lastActive?: string;
}

export interface EnterpriseTeam {
  id: string;
  tenantId: string;
  workspaceId?: string;
  name: string;
  leadPrincipalId?: string;
  leadEmail?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  memberCount?: number;
  createdAt?: string;
}

export interface EnterpriseRoleDefinition {
  permissions: string[];
  label?: string;
  description?: string;
  level?: number;
}

export interface EnterpriseRolesMatrixResponse {
  roles: Record<string, string[]>;
  customRoles?: Record<string, EnterpriseRoleDefinition>;
  permissions?: string[];
}

export interface EnterpriseAuditEvent {
  id: string;
  actor: string;
  actorEmail?: string;
  action: string;
  target?: string;
  category?: string;
  severity?: 'INFO' | 'WARN' | 'CRITICAL' | 'SECURITY';
  ip?: string;
  userAgent?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface EnterpriseConfiguration {
  revision?: number;
  identityPolicy?: {
    ssoEnabled?: boolean;
    enforce2FA?: boolean;
    allowedDomains?: string[];
    sessionTimeoutMinutes?: number;
  };
  aiPolicy?: {
    allowedProviders?: string[];
    allowedModels?: string[];
    primaryModel?: string;
  };
  quotaPolicy?: {
    aiRequestsPerMinute?: number;
    aiRequestsPerDay?: number;
    monthlyTokenBudget?: number;
  };
  customRoles?: Record<string, EnterpriseRoleDefinition> | Array<{ id: string; label: string; permissions: string[] }>;
}

export interface EnterpriseAiUsage {
  requests: number;
  totalRequests?: number;
  tokensConsumed?: number;
  byDay?: Array<{ day: string; requests: number; tokens?: number }>;
  byUser?: Array<{ principalId: string; email?: string; requests: number; tokens?: number }>;
}

export interface EnterpriseServiceAccount {
  id: string;
  name: string;
  scopes: string[];
  status: 'ACTIVE' | 'REVOKED';
  keyPrefix: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface EnterpriseQueueStatus {
  healthy: boolean;
  configured: boolean;
  engine: string;
  queuedCount: number;
  retryingCount: number;
  deadLetterCount: number;
  processedCount: number;
}

export interface EnterpriseQueueJob {
  jobId: string;
  jobType: string;
  status: 'QUEUED' | 'RETRYING' | 'DEAD_LETTER' | 'COMPLETED' | 'REJECTED';
  attemptCount: number;
  maxAttempts: number;
  lastError?: string;
  rejectedReason?: string;
  correlationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseObservabilityMetrics {
  sampleCount: number;
  p50: number;
  p95: number;
  p99: number;
  errors: {
    serverErrors: number;
    clientErrors: number;
  };
}

export interface EnterpriseDataPlaneStatus {
  configured: boolean;
  durable: boolean;
  engine: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}

export interface EnterpriseResource {
  id: string;
  resourceType: 'resume' | 'cover_letter' | 'portfolio';
  candidateName?: string;
  jobTitle?: string;
  atsScore?: number;
  completeness?: number;
  ownerEmail?: string;
  ownerPrincipalId?: string;
  workspaceId?: string;
  workspaceName?: string;
  template?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseSupportGrant {
  id: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  reason: string;
  requestedBy: string;
  durationHours: number;
  expiresAt: string;
  createdAt: string;
}

// In-flight GET deduplication cache
const inFlightRequests = new Map<string, Promise<unknown>>();

// Single flight token refresh
let singleFlightRefresh: Promise<string | null> | null = null;
async function getAuthToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  if (forceRefresh) {
    if (singleFlightRefresh) return singleFlightRefresh;
    singleFlightRefresh = user.getIdToken(true).finally(() => {
      singleFlightRefresh = null;
    });
    return singleFlightRefresh;
  }
  return user.getIdToken();
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  tenantId?: string;
  workspaceId?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function enterpriseRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    tenantId,
    workspaceId,
    body,
    params,
    headers = {},
    signal,
  } = options;

  let url = path.startsWith('/api/') ? path : `/api/enterprise${path.startsWith('/') ? path : `/${path}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  // Deduplicate identical GET requests
  const isGet = method === 'GET';
  const cacheKey = isGet ? `${tenantId || ''}:${workspaceId || ''}:${url}` : null;
  if (cacheKey && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  const execute = async (attempt = 1): Promise<T> => {
    const token = await getAuthToken(attempt > 1);

    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...headers,
    };

    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    // Attach tenant context invariants
    const effectiveTenantId = tenantId || resolveActiveTenantId();
    if (effectiveTenantId) {
      reqHeaders['X-Tenant-Id'] = effectiveTenantId;
    }
    if (workspaceId) {
      reqHeaders['X-Workspace-Id'] = workspaceId;
    }

    const response = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal,
    });

    if (response.status === 401 && attempt <= 2) {
      return execute(attempt + 1);
    }

    const data = await response.json().catch(() => ({}));

    // Auto-resolve on TENANT_CONTEXT_REQUIRED if user has ambiguous memberships
    if (response.status === 400 && attempt <= 2) {
      const errCode = data?.error?.code;
      const primary = data?.error?.primaryTenantId || data?.error?.availableTenants?.[0]?.tenantId;
      if (errCode === 'TENANT_CONTEXT_REQUIRED' && primary) {
        setActiveTenantId(primary);
        options.tenantId = primary;
        return execute(attempt + 1);
      }
    }

    if (!response.ok) {
      const err = new Error(data?.error?.message || `Enterprise API error (${response.status})`) as EnterpriseError;
      err.code = data?.error?.code || (response.status === 403 ? 'FORBIDDEN' : 'API_ERROR');
      err.status = response.status;
      err.requestId = data?.error?.requestId;
      err.details = data;
      throw err;
    }

    return data as T;
  };

  const promise = execute().finally(() => {
    if (cacheKey) inFlightRequests.delete(cacheKey);
  });

  if (cacheKey) inFlightRequests.set(cacheKey, promise);
  return promise;
}

// ─── Direct Enterprise API Bindings ───

export const enterpriseApi = {
  getStatus: () =>
    enterpriseRequest<EnterpriseStatusResponse>('/api/enterprise/status'),

  getTenants: () =>
    enterpriseRequest<{ tenants: TenantSummary[] }>('/api/enterprise/tenants'),

  postContext: (tenantId?: string, workspaceId?: string) =>
    enterpriseRequest<EnterpriseContextResponse>('/api/enterprise/context', {
      method: 'POST',
      body: { tenantId, workspaceId },
      tenantId,
      workspaceId,
    }),

  getWorkspaces: (tenantId?: string, workspaceId?: string) =>
    enterpriseRequest<{ workspaces: WorkspaceSummary[] }>('/api/enterprise/workspaces', {
      tenantId,
      workspaceId,
    }),

  createWorkspace: (tenantId: string, name: string, slug?: string) =>
    enterpriseRequest<{ workspace: WorkspaceSummary }>('/api/enterprise/workspaces', {
      method: 'POST',
      tenantId,
      body: { name, slug },
    }),

  updateWorkspace: (tenantId: string, workspaceId: string, data: Partial<WorkspaceSummary>) =>
    enterpriseRequest<{ workspace: WorkspaceSummary }>(`/api/enterprise/workspaces/${workspaceId}`, {
      method: 'PATCH',
      tenantId,
      body: data,
    }),

  archiveWorkspace: (tenantId: string, workspaceId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/workspaces/${workspaceId}/archive`, {
      method: 'POST',
      tenantId,
    }),

  restoreWorkspace: (tenantId: string, workspaceId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/workspaces/${workspaceId}/restore`, {
      method: 'POST',
      tenantId,
    }),

  getMemberships: (tenantId: string) =>
    enterpriseRequest<{ memberships: EnterpriseMembership[] }>('/api/enterprise/memberships', {
      tenantId,
    }),

  createMembership: (tenantId: string, data: { principalId?: string; invitationEmail?: string; roles: string[]; workspaceId?: string; status?: string }) =>
    enterpriseRequest<{ membership: EnterpriseMembership }>('/api/enterprise/memberships', {
      method: 'POST',
      tenantId,
      body: data,
    }),

  updateMembership: (tenantId: string, principalId: string, data: { roles?: string[]; status?: string; workspaceId?: string }) =>
    enterpriseRequest<{ membership: EnterpriseMembership }>(`/api/enterprise/memberships/${principalId}`, {
      method: 'PATCH',
      tenantId,
      body: data,
    }),

  resendInvitation: (tenantId: string, principalId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/memberships/${principalId}/invitation-resend`, {
      method: 'POST',
      tenantId,
    }),

  deleteMembership: (tenantId: string, principalId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/memberships/${principalId}`, {
      method: 'DELETE',
      tenantId,
    }),

  getRolesMatrix: (tenantId: string) =>
    enterpriseRequest<EnterpriseRolesMatrixResponse>('/api/enterprise/roles-matrix', {
      tenantId,
    }),

  getTeams: (tenantId: string) =>
    enterpriseRequest<{ teams: EnterpriseTeam[] }>('/api/enterprise/teams', {
      tenantId,
    }),

  createTeam: (tenantId: string, name: string, leadPrincipalId?: string, workspaceId?: string) =>
    enterpriseRequest<{ team: EnterpriseTeam }>('/api/enterprise/teams', {
      method: 'POST',
      tenantId,
      body: { name, leadPrincipalId, workspaceId },
    }),

  updateTeam: (tenantId: string, teamId: string, data: Partial<EnterpriseTeam>) =>
    enterpriseRequest<{ team: EnterpriseTeam }>(`/api/enterprise/teams/${teamId}`, {
      method: 'PATCH',
      tenantId,
      body: data,
    }),

  archiveTeam: (tenantId: string, teamId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/teams/${teamId}/archive`, {
      method: 'POST',
      tenantId,
    }),

  restoreTeam: (tenantId: string, teamId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/teams/${teamId}/restore`, {
      method: 'POST',
      tenantId,
    }),

  getConfiguration: (tenantId: string) =>
    enterpriseRequest<{ configuration: EnterpriseConfiguration }>('/api/enterprise/configuration', {
      tenantId,
    }),

  updateConfiguration: (tenantId: string, expectedRevision: number, configuration: Partial<EnterpriseConfiguration>) =>
    enterpriseRequest<{ configuration: EnterpriseConfiguration }>('/api/enterprise/configuration', {
      method: 'PATCH',
      tenantId,
      body: { expectedRevision, configuration },
    }),

  getAiUsage: (tenantId: string, days = 30) =>
    enterpriseRequest<{ usage: EnterpriseAiUsage }>(`/api/enterprise/usage/ai?days=${days}`, {
      tenantId,
    }),

  getAiUsageEvents: (tenantId: string) =>
    enterpriseRequest<{ events: unknown[] }>('/api/enterprise/usage/ai/events', {
      tenantId,
    }),

  getAuditLogs: (tenantId: string, filters: Record<string, string | number | undefined> = {}) =>
    enterpriseRequest<{ events: EnterpriseAuditEvent[] }>('/api/enterprise/audit', {
      tenantId,
      params: filters,
    }),

  getResources: (tenantId: string, resourceType = 'resume') =>
    enterpriseRequest<{ resources: EnterpriseResource[] }>(`/api/enterprise/resources?resourceType=${resourceType}`, {
      tenantId,
    }),

  createResource: (tenantId: string, resourceType: string, payload: Record<string, unknown>) =>
    enterpriseRequest<{ resource: EnterpriseResource }>('/api/enterprise/resources', {
      method: 'POST',
      tenantId,
      body: { resourceType, payload },
    }),

  updateResource: (tenantId: string, resourceId: string, payload: Record<string, unknown>) =>
    enterpriseRequest<{ resource: EnterpriseResource }>(`/api/enterprise/resources/${resourceId}`, {
      method: 'PATCH',
      tenantId,
      body: { payload },
    }),

  deleteResource: (tenantId: string, resourceId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/resources/${resourceId}`, {
      method: 'DELETE',
      tenantId,
    }),

  getServiceAccounts: (tenantId: string) =>
    enterpriseRequest<{ serviceAccounts: EnterpriseServiceAccount[] }>('/api/enterprise/service-accounts', {
      tenantId,
    }),

  createServiceAccount: (tenantId: string, name: string, scopes: string[]) =>
    enterpriseRequest<{ serviceAccount: EnterpriseServiceAccount; rawKey?: string }>('/api/enterprise/service-accounts', {
      method: 'POST',
      tenantId,
      body: { name, scopes },
    }),

  revokeServiceAccount: (tenantId: string, serviceAccountId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/service-accounts/${serviceAccountId}/revoke`, {
      method: 'POST',
      tenantId,
    }),

  rotateServiceAccount: (tenantId: string, serviceAccountId: string) =>
    enterpriseRequest<{ serviceAccount: EnterpriseServiceAccount; rawKey?: string }>(`/api/enterprise/service-accounts/${serviceAccountId}/rotate`, {
      method: 'POST',
      tenantId,
    }),

  getQueueStatus: (tenantId: string) =>
    enterpriseRequest<{ queue: EnterpriseQueueStatus }>('/api/enterprise/queue/status', {
      tenantId,
    }),

  getQueueJobs: (tenantId: string, status?: string) =>
    enterpriseRequest<{ jobs: EnterpriseQueueJob[] }>(`/api/enterprise/queue/jobs${status && status !== 'ALL' ? `?status=${status}` : ''}`, {
      tenantId,
    }),

  replayQueueJob: (tenantId: string, jobId: string) =>
    enterpriseRequest<{ success: boolean }>('/api/enterprise/queue/replay', {
      method: 'POST',
      tenantId,
      body: { jobId },
    }),

  getObservabilityMetrics: (tenantId: string) =>
    enterpriseRequest<{ metrics: EnterpriseObservabilityMetrics }>('/api/enterprise/observability/metrics', {
      tenantId,
    }),

  getDataPlaneStatus: (tenantId: string) =>
    enterpriseRequest<{ dataPlane: EnterpriseDataPlaneStatus }>('/api/enterprise/data-plane/status', {
      tenantId,
    }),

  getSupportGrants: (tenantId: string) =>
    enterpriseRequest<{ grants: EnterpriseSupportGrant[] }>('/api/enterprise/support-grants', {
      tenantId,
    }),

  createSupportGrant: (tenantId: string, durationHours: number, reason: string) =>
    enterpriseRequest<{ grant: EnterpriseSupportGrant }>('/api/enterprise/support-grants', {
      method: 'POST',
      tenantId,
      body: { durationHours, reason },
    }),

  revokeSupportGrant: (tenantId: string, grantId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/support-grants/${grantId}/revoke`, {
      method: 'POST',
      tenantId,
    }),

  getPlatformTenants: () =>
    enterpriseRequest<{ tenants: TenantSummary[] }>('/api/enterprise/platform/tenants'),

  suspendPlatformTenant: (tenantId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/platform/tenants/${tenantId}/suspend`, {
      method: 'POST',
    }),

  reactivatePlatformTenant: (tenantId: string) =>
    enterpriseRequest<{ success: boolean }>(`/api/enterprise/platform/tenants/${tenantId}/reactivate`, {
      method: 'POST',
    }),

  getDataExport: (tenantId: string) =>
    enterpriseRequest<Record<string, unknown>>('/api/enterprise/data/export', {
      tenantId,
    }),

  sendTestEmail: (tenantId: string, recipient: string) =>
    enterpriseRequest<{ success: boolean }>('/api/enterprise/test-email', {
      method: 'POST',
      tenantId,
      body: { to: recipient },
    }),

  updateTenant: (tenantId: string, data: { name?: string; slug?: string }) =>
    enterpriseRequest<{ tenant: TenantSummary }>('/api/enterprise/tenant', {
      method: 'PATCH',
      tenantId,
      body: data,
    }),
};
