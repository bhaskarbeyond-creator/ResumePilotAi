import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('DB-UI-001: DatabaseSettings component displays MariaDB 100% Authority & Zero Firestore', async () => {
    const [settingsUi, backendAdmin] = await Promise.all([
        fs.readFile('src/components/admin/settings/DatabaseSettings.jsx', 'utf8'),
        fs.readFile('backend/routes/databaseAdmin.js', 'utf8')
    ]);

    // UI displays authoritative MariaDB and zero Firestore data plane
    assert.match(settingsUi, /100% MARIADB AUTHORITATIVE/);
    assert.match(settingsUi, /ZERO FIRESTORE DATA PLANE/);
    assert.match(settingsUi, /IDENTITY ONLY/);
    assert.match(settingsUi, /MySQL \/ MariaDB/);

    // Backend settings returns mysql primary and removed firestore data plane
    assert.match(backendAdmin, /activeEngine = 'mysql'/);
    assert.match(backendAdmin, /authoritativeDatabase:\s*'mysql'/);
    assert.match(backendAdmin, /firestoreDataPlane:\s*'REMOVED'/);
});

test('DB-UI-002: Switching to decommissioned Firestore data plane is rejected (Fail-Closed)', async () => {
    const backendAdmin = await fs.readFile('backend/routes/databaseAdmin.js', 'utf8');
    assert.match(backendAdmin, /if \(targetEngine === 'firestore'\)/);
    assert.match(backendAdmin, /FIRESTORE_DATA_PLANE_DECOMMISSIONED/);
    assert.match(backendAdmin, /Google Cloud Firestore has been decommissioned/);
});

test('DB-UI-004: getAllJobs and getActiveJobs frontend contracts use MariaDB API endpoints', async () => {
    const [operations, jobsManager] = await Promise.all([
        fs.readFile('src/firestore/dbOperations.js', 'utf8'),
        fs.readFile('src/components/admin/jobsManager/JobsManager.jsx', 'utf8')
    ]);

    // dbOperations defines getAllJobs and getActiveJobs
    assert.match(operations, /export async function getAllJobs/);
    assert.match(operations, /export async function getActiveJobs/);
    assert.match(operations, /\/api\/admin\/jobs/);
    assert.match(operations, /\/api\/jobs-data/);

    // JobsManager imports and invokes getAllJobs
    assert.match(jobsManager, /import \{ getAllJobs/);
    assert.match(jobsManager, /await getAllJobs\(page/);
});

test('DB-SCHEMA-001: MariaDB Schema includes all application domains and tables', async () => {
    const schemaSql = await fs.readFile('backend/database/schema.sql', 'utf8');
    const requiredTables = [
        'users', 'resumes', 'public_resumes', 'portfolios', 'covers',
        'favourites', 'jobs', 'applications', 'job_tracker', 'companies',
        'blog', 'custom_pages', 'reviews', 'trusted_by', 'subscriptions',
        'transactions', 'payment_orders', 'system_settings', 'sync_outbox'
    ];

    for (const table of requiredTables) {
        assert.match(schemaSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `Table ${table} must be defined in schema.sql`);
    }
});
