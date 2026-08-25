import { fetchAdminWithReauth } from '../adminReauth';

/**
 * Super Admin Database Settings & Intelligent Sync API Client
 */

export async function getDatabaseSettings() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings');
    if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.error || 'Failed to load database settings.');
    }
    return data;
}

export async function switchDatabaseEngine(targetEngine, force = false) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: targetEngine, force })
    });
    if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.error || `Failed to switch to ${targetEngine}.`);
    }
    return data;
}

export async function testDatabaseConnection(targetEngine) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: targetEngine })
    });
    if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.error || 'Connection test failed.');
    }
    return data.result;
}

export async function initializeMySqlSchema() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/initialize-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Schema initialization failed.');
    }
    return data;
}

export async function getSyncStatus() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/sync-status');
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch sync status.');
    }
    return data;
}

export async function triggerSyncNow() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Sync execution failed.');
    }
    return data;
}

export async function verifyDatabaseParity() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/verify-parity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Parity verification failed.');
    }
    return data;
}

export async function getConflicts() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/conflicts');
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load conflicts.');
    }
    return data.conflicts || [];
}

export async function getDeadLetters() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/dead-letter');
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load dead letters.');
    }
    return data.deadLetters || [];
}

export async function retryDeadLetters() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/retry-dead-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to retry dead letters.');
    }
    return data;
}
