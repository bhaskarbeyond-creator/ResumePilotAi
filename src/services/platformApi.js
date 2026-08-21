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
export const deleteAnnouncement = (id) => platformFetch(`/api/platform/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const decommissionTenant = (tenantId, reason) => platformFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/decommission`, { method: 'POST', body: JSON.stringify({ reason }) });
export const getTenantDetail = (tenantId) => platformFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`);
export const getAttention = () => platformFetch('/api/platform/attention');
export const getEnterpriseQueue = () => platformFetch('/api/platform/enterprise-queue');
export const getOperators = () => platformFetch('/api/platform/operators');
export const setOperatorRole = (uid, role) => platformFetch('/api/platform/operators', { method: 'POST', body: JSON.stringify({ uid, role }) });
