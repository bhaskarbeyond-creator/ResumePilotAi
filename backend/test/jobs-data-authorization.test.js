'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const MySQLRepository = require('../repositories/MySQLRepository');
const { jobsDataRouter } = require('../routes/jobsData');

function buildRouteApp(repository) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        const uid = req.get('x-test-user');
        if (uid) req.user = { uid };
        next();
    });
    app.locals.jobsRepositoryProvider = () => repository;
    app.use('/api/jobs-data', jobsDataRouter);
    return app;
}

function routeRepository() {
    const jobs = new Map([
        ['active-a', { id: 'active-a', employer_id: 'owner-a', status: 'active', title: 'Visible' }],
        ['draft-a', { id: 'draft-a', employer_id: 'owner-a', status: 'draft', title: 'Private draft' }],
        ['paused-a', { id: 'paused-a', employer_id: 'owner-a', status: 'paused', title: 'Private paused' }],
        ['deleted-a', { id: 'deleted-a', employer_id: 'owner-a', status: 'active', deleted_at: '2026-01-01T00:00:00.000Z' }],
        ['expired-a', { id: 'expired-a', employer_id: 'owner-a', status: 'active', expires_at: '2020-01-01T00:00:00.000Z' }],
    ]);
    const tracked = new Map([
        ['tracker-a', { id: 'tracker-a', userId: 'owner-a', title: 'Platform Engineer', company: 'Acme', status: 'wishlist', order: 4, notes: 'Keep me', revision: 3 }],
    ]);
    const calls = [];
    return {
        jobs,
        tracked,
        calls,
        async getJobs(filters) { calls.push(['getJobs', filters]); return [...jobs.values()]; },
        async getJob(id) { calls.push(['getJob', id]); return jobs.get(id) || null; },
        async saveJob(id, data) { calls.push(['saveJob', id, data]); jobs.set(id, { id, ...data }); return jobs.get(id); },
        async deleteJob(id, ownerId) {
            calls.push(['deleteJob', id, ownerId]);
            if (jobs.get(id)?.employer_id !== ownerId) return false;
            return jobs.delete(id);
        },
        async getTrackedJobs(userId) { return [...tracked.values()].filter(item => item.userId === userId); },
        async createTrackedJob(userId, id, data) {
            const value = { id, userId, ...data, revision: 1 };
            tracked.set(id, value);
            return value;
        },
        async updateTrackedJob(userId, id, patch, { expectedRevision }) {
            const current = tracked.get(id);
            if (!current || current.userId !== userId) {
                throw Object.assign(new Error('Tracked job not found.'), { code: 'JOB_TRACKER_NOT_FOUND', status: 404 });
            }
            if (current.revision !== expectedRevision) {
                throw Object.assign(new Error('Tracked job changed.'), { code: 'JOB_TRACKER_CONFLICT', status: 409, remoteRevision: current.revision });
            }
            const next = { ...current, ...patch, revision: current.revision + 1 };
            tracked.set(id, next);
            return next;
        },
        async deleteTrackedJob(userId, id, { expectedRevision }) {
            const current = tracked.get(id);
            if (!current || current.userId !== userId) {
                throw Object.assign(new Error('Tracked job not found.'), { code: 'JOB_TRACKER_NOT_FOUND', status: 404 });
            }
            if (current.revision !== expectedRevision) {
                throw Object.assign(new Error('Tracked job changed.'), { code: 'JOB_TRACKER_CONFLICT', status: 409, remoteRevision: current.revision });
            }
            tracked.delete(id);
            return true;
        },
    };
}

test('public and non-owner listing cannot select drafts, paused, tombstoned, or expired jobs', async () => {
    const repository = routeRepository();
    const app = buildRouteApp(repository);

    const response = await request(app).get('/api/jobs-data?status=draft&employerId=owner-a');
    assert.equal(response.status, 403, 'an unauthenticated caller cannot select an owner inventory');

    const discovery = await request(app).get('/api/jobs-data?status=draft');
    assert.equal(discovery.status, 200);
    assert.deepEqual(discovery.body.jobs.map(job => job.id), ['active-a']);
    assert.equal(repository.calls.at(-1)[1].publicOnly, true);
    assert.equal(Object.hasOwn(repository.calls.at(-1)[1], 'status'), false, 'caller status is ignored on public discovery');
});

test('single-job reads hide every non-active record from non-owners while preserving owner access', async () => {
    const app = buildRouteApp(routeRepository());

    assert.equal((await request(app).get('/api/jobs-data/active-a').set('x-test-user', 'reader')).status, 200);
    for (const id of ['draft-a', 'paused-a', 'deleted-a', 'expired-a']) {
        const response = await request(app).get(`/api/jobs-data/${id}`).set('x-test-user', 'reader');
        assert.equal(response.status, 404, id);
    }
    const ownerDraft = await request(app).get('/api/jobs-data/draft-a').set('x-test-user', 'owner-a');
    assert.equal(ownerDraft.status, 200);
    assert.equal(ownerDraft.body.job.title, 'Private draft');
});

test('legacy job mutation routes deny primary-key takeover and ownerless deletion', async () => {
    const repository = routeRepository();
    const app = buildRouteApp(repository);

    const overwrite = await request(app).post('/api/jobs-data/draft-a').set('x-test-user', 'attacker').send({ title: 'Taken over' });
    assert.equal(overwrite.status, 404);
    assert.equal(repository.jobs.get('draft-a').title, 'Private draft');
    assert.equal(repository.calls.some(call => call[0] === 'saveJob'), false);

    const deletion = await request(app).delete('/api/jobs-data/draft-a').set('x-test-user', 'attacker');
    assert.equal(deletion.status, 404);
    assert.equal(repository.jobs.has('draft-a'), true);
    assert.equal(repository.calls.some(call => call[0] === 'deleteJob'), false);
});

test('tracker ownership, revision conflicts, and partial status/order moves are enforced behaviorally', async () => {
    const repository = routeRepository();
    const app = buildRouteApp(repository);

    const denied = await request(app).patch('/api/jobs-data/tracker/tracker-a')
        .set('x-test-user', 'owner-b').send({ status: 'applied', expectedRevision: 3 });
    assert.equal(denied.status, 404);
    assert.equal(repository.tracked.get('tracker-a').status, 'wishlist');

    const conflict = await request(app).patch('/api/jobs-data/tracker/tracker-a')
        .set('x-test-user', 'owner-a').send({ status: 'applied', expectedRevision: 2 });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'JOB_TRACKER_CONFLICT');
    assert.equal(conflict.body.remoteRevision, 3);

    const moved = await request(app).patch('/api/jobs-data/tracker/tracker-a')
        .set('x-test-user', 'owner-a').send({ status: 'interview', order: 1, expectedRevision: 3 });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.job.status, 'interview');
    assert.equal(moved.body.job.order, 1);
    assert.equal(moved.body.job.title, 'Platform Engineer');
    assert.equal(moved.body.job.company, 'Acme');
    assert.equal(moved.body.job.notes, 'Keep me');
    assert.equal(moved.body.job.revision, 4);
});

test('MariaDB failures return stable unavailable contracts without leaking driver details', async () => {
    const unavailable = new Proxy({}, {
        get() { return async () => { throw new Error('ER_ACCESS_DENIED_ERROR password=do-not-leak host=db.internal'); }; },
    });
    const app = buildRouteApp(unavailable);

    const list = await request(app).get('/api/jobs-data');
    assert.equal(list.status, 503);
    assert.equal(list.body.error.code, 'DATABASE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(list.body), /password|db\.internal|ER_ACCESS/i);

    const tracker = await request(app).get('/api/jobs-data/tracker').set('x-test-user', 'owner-a');
    assert.equal(tracker.status, 500);
    assert.equal(tracker.body.code, 'JOB_TRACKER_ERROR');
    assert.equal(tracker.body.error, 'The job tracker is temporarily unavailable.');
    assert.doesNotMatch(JSON.stringify(tracker.body), /password|db\.internal|ER_ACCESS/i);
});

test('MariaDB tracker update uses owner-scoped locking and preserves omitted fields', async () => {
    const repository = new MySQLRepository();
    const statements = [];
    const connection = {
        async query(sql, params) {
            statements.push([sql, params]);
            if (/SELECT \* FROM job_tracker/.test(sql)) {
                return [[{ id: 'tracker-a', user_id: 'owner-a', job_title: 'Platform Engineer', company: 'Acme', status: 'wishlist', sort_order: 4, location: 'Remote', url: '', notes: 'Keep me', deadline: null, revision: 3 }]];
            }
            return [{ affectedRows: 1 }];
        },
    };
    repository._withTransaction = callback => callback(connection);

    const moved = await repository.updateTrackedJob('owner-a', 'tracker-a', { status: 'offer', order: 2 }, { expectedRevision: 3 });
    assert.deepEqual({ title: moved.title, company: moved.company, notes: moved.notes, status: moved.status, order: moved.order, revision: moved.revision },
        { title: 'Platform Engineer', company: 'Acme', notes: 'Keep me', status: 'offer', order: 2, revision: 4 });
    assert.deepEqual(statements[0][1], ['tracker-a', 'owner-a']);
    assert.match(statements[1][0], /WHERE id = \? AND user_id = \?/);
});

test('MariaDB job writes and deletes keep ownership in the SQL predicate', async () => {
    const repository = new MySQLRepository();
    repository._withTransaction = callback => callback({
        async query(sql) {
            if (/SELECT employer_id/.test(sql)) return [[{ employer_id: 'owner-a', revision: 7 }]];
            throw new Error('mutation must not run for a different owner');
        },
    });
    await assert.rejects(
        repository.saveJob('job-a', { employerId: 'owner-b', title: 'Takeover' }),
        error => error.code === 'JOB_NOT_FOUND' && error.status === 404
    );

    let captured;
    repository._getPool = () => ({
        async query(sql, params) { captured = { sql, params }; return [{ affectedRows: 0 }]; },
    });
    assert.equal(await repository.deleteJob('job-a', 'owner-b'), false);
    assert.match(captured.sql, /WHERE id = \? AND employer_id = \?/);
    assert.deepEqual(captured.params, ['job-a', 'owner-b']);
});
