import fire from '../conf/fire';
import { fetchAdminWithReauth } from './adminReauth';

async function authHeaders(extra = {}) {
  const user = fire.auth().currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, ...extra };
}

export async function platformFetch(path, options = {}) {
  const headers = await authHeaders(options.headers || {});
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const { response, data } = await fetchAdminWithReauth(path, { ...options, headers });
  if (!response.ok) {
    const error = new Error(data.error?.message || data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.error?.code || data.code;
    error.body = data;
    throw error;
  }
  return data;
}

export const getCommandCenter = () => platformFetch('/api/platform/command-center');
export const getPlatformHealth = () => platformFetch('/api/platform/health');
export const getPlatformOverview = () => platformFetch('/api/platform/overview');
export const getPlatformQueues = () => platformFetch('/api/platform/queues');
export const retryPlatformQueue = (body) => platformFetch('/api/platform/queues/retry', { method: 'POST', body: JSON.stringify(body || {}) });
export const getMaintenance = () => platformFetch('/api/platform/maintenance');
export const setMaintenance = (body) => platformFetch('/api/platform/maintenance', { method: 'POST', body: JSON.stringify(body || {}) });
export const getSecurityEvents = (params = '') => platformFetch(`/api/platform/security-events${params ? `?${params}` : ''}`);
export const getEncryptionStatus = () => platformFetch('/api/platform/encryption');
export const getObservability = () => platformFetch('/api/platform/observability');
export const getBackupStatus = () => platformFetch('/api/platform/backup-status');
export const getPaymentsHealth = () => platformFetch('/api/platform/payments-health');
export const searchPlatform = (q) => platformFetch(`/api/platform/search?q=${encodeURIComponent(q)}`);
export const getAnnouncements = () => platformFetch('/api/platform/announcements');
export const saveAnnouncement = (body) => platformFetch('/api/platform/announcements', { method: 'POST', body: JSON.stringify(body || {}) });
export const updateAnnouncement = (id, body) => platformFetch(`/api/platform/announcements/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body || {}) });
export const deleteAnnouncement = (id, expectedRevision) => platformFetch(`/api/platform/announcements/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision }) });
export const renameTenant = (tenantId, displayName) => platformFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, { method: 'PATCH', body: JSON.stringify({ displayName }) });
export const decommissionTenant = (tenantId, reason) => platformFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/decommission`, { method: 'POST', body: JSON.stringify({ reason }) });
export const getTenantDetail = (tenantId) => platformFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`);
export const getAttention = () => platformFetch('/api/platform/attention');
export const getOperationalStatus = () => platformFetch('/api/platform/operational-status');
export const refreshOperationalStatus = () => platformFetch('/api/platform/operational-status/refresh', { method: 'POST', body: JSON.stringify({}) });
export const getOperationalService = (serviceId) => platformFetch(`/api/platform/operational-status/${encodeURIComponent(serviceId)}`);
export const testOperationalService = (serviceId) => platformFetch(`/api/platform/operational-status/${encodeURIComponent(serviceId)}/test`, { method: 'POST', body: JSON.stringify({}) });
export const getApiHealthMatrix = () => platformFetch('/api/platform/operational-status/api-matrix');
export const getHealthIndicator = () => platformFetch('/api/platform/health-indicator');
export const getEnterpriseQueue = () => platformFetch('/api/platform/enterprise-queue');
export const getOperators = () => platformFetch('/api/platform/operators');
export const setOperatorRole = (uid, role, expectedRole) => platformFetch('/api/platform/operators', { method: 'POST', body: JSON.stringify({ uid, role, ...(expectedRole ? { expectedRole } : {}) }) });

// Super Admin User Control-Plane & User 360 APIs
export const getAdminUsers = (params = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  return platformFetch(`/api/admin/users${query.toString() ? `?${query}` : ''}`);
};
export const createAdminUser = (body) => platformFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(body || {}) });
export const getUser360 = (uid) => platformFetch(`/api/admin/users/${encodeURIComponent(uid)}/details`);
export const assignUserTenant = (uid, body) => platformFetch(`/api/admin/users/${encodeURIComponent(uid)}/tenants`, { method: 'POST', body: JSON.stringify(body || {}) });
export const removeUserTenant = (uid, tenantId) => platformFetch(`/api/admin/users/${encodeURIComponent(uid)}/tenants/${encodeURIComponent(tenantId)}`, { method: 'DELETE' });
export const getUserAiEntitlement = (uid) => platformFetch(`/api/admin/users/${encodeURIComponent(uid)}/ai-entitlement`);
export const updateUserAiEntitlement = (uid, body) => platformFetch(`/api/admin/users/${encodeURIComponent(uid)}/ai-entitlement`, { method: 'PUT', body: JSON.stringify(body || {}) });
export const removeUserAiEntitlement = (uid) => platformFetch(`/api/admin/users/${encodeURIComponent(uid)}/ai-entitlement`, { method: 'DELETE' });
export const resetUserAiQuota = (uid) => platformFetch(`/api/admin/users/${encodeURIComponent(uid)}/ai-quota-reset`, { method: 'POST', body: JSON.stringify({}) });
export const sendUserPasswordReset = (uid) => platformFetch(`/api/admin/users/${encodeURIComponent(uid)}/send-password-reset`, { method: 'POST', body: JSON.stringify({}) });

// Super Admin Platform Currency & Subscriptions
export const getPlatformCurrency = () => platformFetch('/api/admin/platform/currency');
export const updatePlatformCurrency = (body) => platformFetch('/api/admin/platform/currency', { method: 'PUT', body: JSON.stringify(body || {}) });
export const getAdminSubscriptions = (params = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  return platformFetch(`/api/admin/subscriptions${query.toString() ? `?${query}` : ''}`);
};
export const getAdminAiEntitlements = () => platformFetch('/api/admin/ai/entitlements');

export const getPlatformTenants = () => platformFetch('/api/enterprise/platform/tenants');

export const addTenantMember = (tenantId, body) => platformFetch(`/api/admin/platform/tenants/${encodeURIComponent(tenantId)}/members`, { method: 'POST', body: JSON.stringify(body || {}) });
export const removeTenantMember = (tenantId, principalId) => platformFetch(`/api/admin/platform/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(principalId)}`, { method: 'DELETE' });
export const updateTenantMember = (tenantId, principalId, body) => platformFetch(`/api/admin/platform/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(principalId)}`, { method: 'PATCH', body: JSON.stringify(body || {}) });
export const updateTenantCommercials = (tenantId, body) => platformFetch(`/api/admin/platform/tenants/${encodeURIComponent(tenantId)}/commercials`, { method: 'PATCH', body: JSON.stringify(body || {}) });
export const updateTenantAiPolicy = (tenantId, body) => platformFetch(`/api/admin/platform/tenants/${encodeURIComponent(tenantId)}/ai-policy`, { method: 'PATCH', body: JSON.stringify(body || {}) });

