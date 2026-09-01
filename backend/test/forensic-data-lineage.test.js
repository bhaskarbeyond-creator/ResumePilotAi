'use strict';

process.env.NODE_ENV = 'test';
process.env.CONTACT_HOURLY_LIMIT = '10000';
require('dotenv').config({ path: 'backend/.env' });

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
    const now = Math.floor(Date.now() / 1000);
    if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
    if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
    if (token === 'super-admin') {
        return {
            uid: 'super-1',
            email: 'superadmin@example.com',
            email_verified: true,
            role: 'SUPER_ADMIN',
            admin: true,
            superAdmin: true,
            auth_time: now,
            multiFactor: { enrolledFactors: [{ factorId: 'totp', enrolledAt: new Date().toISOString() }] }
        };
    }
    throw new Error('invalid token');
});

const app = require('../index');
const saBearer = { Authorization: 'Bearer super-admin' };

test('Forensic MariaDB ↔ API Data Lineage Validation Suite', async (t) => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'ai_resume_builder'
    });

    await t.test('1. Domain: Users Lineage', async () => {
        const res = await request(app).get('/api/admin/users').set(saBearer);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.users));
        assert.ok(res.body.users.length >= 1);
        const user = res.body.users[0];
        assert.ok(user.id);
        assert.ok(user.email);
        assert.equal(typeof user.suspended, 'boolean');
    });

    await t.test('2. Domain: System Settings & INR Currency Lineage', async () => {
        const [dbSettings] = await db.query("SELECT category, data FROM system_settings WHERE category = 'system_settings'");
        const dbData = JSON.parse(dbSettings[0]?.data || '{}');

        const res = await request(app).get('/api/admin/settings').set(saBearer);
        assert.equal(res.status, 200);
        assert.equal(res.body.settings?.currency, dbData.currency || 'INR');
    });

    await t.test('3. Domain: Admin Audit Logs Lineage', async () => {
        const res = await request(app).get('/api/admin/audit-logs?limit=3').set(saBearer);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.logs));
        assert.ok(res.body.logs.length >= 1);
        assert.ok(res.body.logs[0].action);
    });

    await t.test('4. Domain: Security Audit Events Lineage', async () => {
        const [dbSec] = await db.query('SELECT id FROM security_audit_logs LIMIT 10');
        const res = await request(app).get('/api/platform/security-events?limit=10').set(saBearer);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.events));
        assert.equal(res.body.events.length, dbSec.length);
    });

    await t.test('5. Domain: Enterprise Tenants Lineage', async () => {
        const [dbTenants] = await db.query('SELECT id, displayName FROM enterprise_tenants');
        const res = await request(app).get('/api/enterprise/platform/tenants').set(saBearer);
        assert.ok(res.status === 200 || res.status === 404);
        if (res.status === 200) {
            assert.ok(Array.isArray(res.body.tenants));
            if (dbTenants.length > 0) {
                assert.ok(res.body.tenants.length >= 1);
                assert.equal(res.body.tenants[0].displayName, dbTenants[0].displayName);
            }
        }
    });

    await t.test('6. Domain: Blog Posts Lineage', async () => {
        const testId = `test_blog_${Date.now()}`;
        await db.query(
            'INSERT INTO blog (id, title, slug, content, published, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
            [testId, 'Forensic Lineage Title', `slug-${Date.now()}`, 'Sample content']
        );

        const res = await request(app).get('/api/blog-data');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.posts));
        assert.ok(res.body.posts.some(p => p.id === testId));

        await db.query('DELETE FROM blog WHERE id = ?', [testId]);
    });

    await t.test('7. Domain: Command Center Platform KPIs Lineage', async () => {
        const res = await request(app).get('/api/platform/command-center').set(saBearer);
        assert.equal(res.status, 200);
        assert.ok(res.body.kpis);
        assert.equal(typeof res.body.kpis.totalUsers, 'number');
        assert.equal(typeof res.body.kpis.totalEarnings, 'number');
    });

    await t.test('8. Domain: Health Matrix (28 Services) Lineage', async () => {
        const res = await request(app).get('/api/platform/operational-status').set(saBearer);
        assert.equal(res.status, 200);
        assert.ok(res.body.services);
        assert.ok(Object.keys(res.body.services).length >= 28);
    });

    await t.test('9. Domain: Enterprise Queues Lineage', async () => {
        const res = await request(app).get('/api/platform/queues').set(saBearer);
        assert.equal(res.status, 200);
        assert.ok(res.body.summary);
        assert.ok(Array.isArray(res.body.jobs));
    });

    await t.test('10. Domain: Contact Messages CRUD Lineage', async () => {
        const testEmail = `contact-probe-${Date.now()}@example.com`;
        const testId = `contact_test_${Date.now()}`;
        await db.query(
            'INSERT INTO contact_messages (id, name, email, message, status, is_read, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())',
            [testId, 'Forensic Contact User', testEmail, 'Verified direct DB insertion for lineage proof', 'new']
        );

        const resList = await request(app).get('/api/notifications-data/contact/list').set(saBearer);
        assert.equal(resList.status, 200);
        assert.ok(Array.isArray(resList.body.messages));
        assert.ok(resList.body.messages.some(m => m.id === testId && m.email === testEmail));

        await db.query('DELETE FROM contact_messages WHERE id = ?', [testId]);
    });

    await t.test('11. Domain: Payment Settings & Gateway Lineage', async () => {
        const res = await request(app).get('/api/platform/payment-settings').set(saBearer);
        assert.ok(res.status === 200 || res.status === 503);
        if (res.status === 200) {
            assert.ok(res.body.settings);
            assert.ok(res.body.configuredProviders);
            assert.ok(res.body.publicKeys);
        }
    });

    await t.test('12. Domain: Support Tickets Lineage', async () => {
        const res = await request(app).get('/api/admin/support/tickets').set(saBearer);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.tickets));
    });

    await db.end();
});
