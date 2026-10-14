'use strict';
// SIMULATED identity and database; real Express notification router over HTTP.
// Does not replace the full app's Firebase middleware or prove real DB isolation.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
process.env.NODE_ENV = 'test';
const { setPoolForTests } = require('../database/mysql');
const { setRepositoryForTests } = require('../repositories');
const { notificationsDataRouter } = require('../routes/notificationsData');

test('notification route contract: validation, owner scope, duplicate and outage recovery', async t => {
    let unavailable = false;
    const rows = [
        { id: 'a1', owner: 'candidate-a', read: false },
        { id: 'a2', owner: 'candidate-a', read: false },
        { id: 'b1', owner: 'candidate-b', read: false },
    ];
    const calls = [];
    setRepositoryForTests({ async getNotifications(uid) {
        if (unavailable) throw new Error('private SQL diagnostic');
        return rows.filter(row => row.owner === uid).map(({ id, read }) => ({ id, read }));
    } });
    setPoolForTests({ async query(sql, params) {
        calls.push({ sql, params });
        if (unavailable) throw new Error('private SQL diagnostic');
        let affectedRows = 0;
        if (sql.includes('WHERE id = ? AND user_id = ?')) {
            const [read, id, owner] = params;
            const row = rows.find(item => item.id === id && item.owner === owner);
            if (row) { row.read = Boolean(read); affectedRows = 1; }
        } else if (sql.includes('WHERE user_id = ? AND is_read = 0')) {
            for (const row of rows) if (row.owner === params[0] && !row.read) { row.read = true; affectedRows++; }
        } else throw new Error(`Unexpected SQL shape: ${sql}`);
        return [{ affectedRows }];
    } });
    const app = express();
    app.use(express.json());
    // Test identity only. No bearer verification claim is made.
    app.use((req, res, next) => {
        const uid = req.headers['x-test-identity'];
        if (!['candidate-a', 'candidate-b'].includes(uid)) return res.sendStatus(401);
        req.user = { uid }; next();
    });
    app.use('/api/notifications-data', notificationsDataRouter);
    const server = app.listen(0, '0.0.0.0');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/notifications-data`;
    const request = (path = '', method = 'GET', body, identity = 'candidate-a') => fetch(url + path, {
        method, headers: { 'Content-Type': 'application/json', 'x-test-identity': identity },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    try {
        await t.test('A: list and write/read-back preserve requested read state', async () => {
            assert.equal((await request('/a1', 'PATCH', { read: true })).status, 200);
            const data = await (await request()).json();
            assert.deepEqual(data.notifications, [{ id: 'a1', read: true }, { id: 'a2', read: false }]);
        });
        await t.test('B: invalid ids, missing/nonboolean read and extra fields never issue SQL', async () => {
            const count = calls.length;
            for (const body of [{}, { read: 'true' }, { read: true, user_id: 'candidate-b' }]) {
                assert.equal((await request('/a1', 'PATCH', body)).status, 400);
            }
            assert.equal((await request('/bad%20id', 'PATCH', { read: true })).status, 400);
            assert.equal(calls.length, count);
        });
        await t.test('C: missing test identity fails closed (not real Firebase validation)', async () => {
            assert.equal((await request('', 'GET', undefined, '')).status, 401);
        });
        await t.test('D: A cannot mutate B; B list does not expose A', async () => {
            assert.equal((await request('/b1', 'PATCH', { read: true })).status, 404);
            assert.equal(rows.find(row => row.id === 'b1').read, false);
            assert.deepEqual((await (await request('', 'GET', undefined, 'candidate-b')).json()).notifications, [{ id: 'b1', read: false }]);
        });
        await t.test('E/G: failed write exposes no SQL details, preserves data, manual retry works', async () => {
            unavailable = true;
            const response = await request('/a2', 'PATCH', { read: true });
            assert.equal(response.status, 500);
            assert.doesNotMatch(await response.text(), /private|SQL/);
            assert.equal(rows.find(row => row.id === 'a2').read, false);
            unavailable = false;
            assert.equal((await request('/a2', 'PATCH', { read: true })).status, 200);
        });
        await t.test('H: repeated bulk updates are idempotent and leave B unchanged', async () => {
            assert.equal((await request('/mark-all-read', 'POST')).status, 200);
            const second = await (await request('/mark-all-read', 'POST')).json();
            assert.equal(second.updated, 0);
            assert.equal(rows.find(row => row.id === 'b1').read, false);
        });
        await t.test('E/K: list outage is an error, not a false empty inbox; recovers', async () => {
            unavailable = true;
            const response = await request();
            assert.equal(response.status, 500);
            assert.doesNotMatch(await response.text(), /private|SQL/);
            unavailable = false;
            assert.equal((await (await request()).json()).notifications.length, 2);
        });
    } finally {
        await new Promise(resolve => server.close(resolve));
        setPoolForTests(null); setRepositoryForTests(null);
    }
});
