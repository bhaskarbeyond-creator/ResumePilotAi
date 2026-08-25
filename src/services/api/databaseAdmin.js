import { fetchAdminWithReauth } from '../adminReauth';

/**
 * Super Admin Database Settings API
 */

export async function getDatabaseSettings() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings');
    if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.error || 'Failed to load database settings.');
    }
    return data;
}

export async function switchDatabaseEngine(targetEngine) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: targetEngine })
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
