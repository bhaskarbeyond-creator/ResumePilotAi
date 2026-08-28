import { fetchAdminWithReauth } from '../adminReauth';

const errorMessage = (data, fallback) => data?.error?.message || (typeof data?.error === 'string' ? data.error : fallback);

export async function getDatabaseSettings() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings');
    if (!response.ok || !data.success) {
        throw new Error(errorMessage(data, 'Failed to load database settings.'));
    }
    return data;
}

export async function testDatabaseConnection() {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'mariadb' }),
    });
    if (!response.ok || !data.success) {
        throw new Error(errorMessage(data, 'MariaDB connection test failed.'));
    }
    return data.result;
}

export async function pruneOutbox(retentionDays) {
    const { response, data } = await fetchAdminWithReauth('/api/admin/database-settings/prune-outbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays }),
    });
    if (!response.ok || !data.success) {
        throw new Error(errorMessage(data, 'Outbox pruning failed.'));
    }
    return data;
}
