'use strict';

// Saved favourites (/api/favourites, P002 C15). The candidate's list shows what
// they saved, with the job or document each favourite points at, through the
// same visibility rule the rest of the API applies: a saved job shows its
// current title, company and location only while GET /api/jobs-data/:id would
// show that job to the same caller (open on the job board, or their own), and a
// saved document only when it is still theirs. POST accepts any id, so a
// favourite must never become a way to read someone else's draft or document.
// The stored columns always win over the payload a client saved, removing is
// scoped to the owner and says whether anything was removed, and saving the
// same item again (Undo) restores it.
process.env.NODE_ENV = 'test';
// The repository's own non-production verifier (security/auth.js): requests
// carry signed `rptest.` tokens and pass through the unchanged requireAuth.
process.env.TEST_AUTH_HMAC_SECRET = 'p002-c15-favourites-test-secret-0123456789';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const MySQLRepository = require('../repositories/MySQLRepository');
const InMemoryRepository = require('../repositories/InMemoryRepository');
const ResilientRepository = require('../repositories/ResilientRepository');
const { setRepositoryForTests } = require('../repositories');
const authority = require('../database/authority');
const { issueLocalTestToken } = require('../security/auth');
const { miscDataRouter } = require('../routes/miscData');

const CANDIDATE_A = 'cand-a';
const CANDIDATE_B = 'cand-b';
const EMPLOYER = 'employer-1';
const tokenFor = uid => issueLocalTestToken({ uid, email: `${uid}@example.test`, email_verified: true });
const as = uid => ({ Authorization: `Bearer ${tokenFor(uid)}` });

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', miscDataRouter);
    return app;
}

const PAST = '2026-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

// The jobs and documents the favourites point at, in the in-memory repository
// the non-production E2E harness falls back to.
async function seededRepository() {
    const repository = new InMemoryRepository();
    const job = (id, fields) => repository.saveJob(id, { employerId: EMPLOYER, location: 'Remote', companyName: 'Example Test Co', ...fields });
    await job('job-open', { title: 'Platform Engineer', status: 'active', expiresAt: FUTURE });
    await job('job-closed', { title: 'Data Analyst', companyName: 'Northwind', location: 'Pune', status: 'closed' });
    await job('job-draft', { title: 'Unannounced Role', companyName: 'Stealth Co', status: 'draft' });
    await job('job-expired', { title: 'Expired Role', status: 'active', expiresAt: PAST });
    await job('job-own', { title: 'My Own Listing', companyName: 'Avery Ltd', status: 'closed', employerId: CANDIDATE_A });
    await repository.saveResume(CANDIDATE_A, 'resume-a', { title: 'Platform CV' });
    await repository.saveResume(CANDIDATE_B, 'resume-b', { title: 'Blake private CV' });
    await repository.saveCover(CANDIDATE_A, 'cover-a', { title: 'Letter to Northwind' });
    return repository;
}

async function save(app, uid, body) {
    const response = await request(app).post('/api/favourites').set(as(uid)).send(body);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.favourite;
}

async function list(app, uid, query = '') {
    const response = await request(app).get(`/api/favourites${query}`).set(as(uid));
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.favourites;
}

const byItem = (rows, itemId) => rows.find(row => row.itemId === itemId);

test.afterEach(() => {
    setRepositoryForTests(null);
    authority.__resetForTests();
});

test('every favourites route requires a valid sign-in', async () => {
    setRepositoryForTests(await seededRepository());
    const app = buildApp();
    const token = tokenFor(CANDIDATE_A);
    const tampered = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
    const routes = [['get', '/api/favourites'], ['post', '/api/favourites'], ['delete', '/api/favourites/job-open'], ['get', '/api/favourites/job-open/check']];
    for (const [method, path] of routes) {
        const label = `${method.toUpperCase()} ${path}`;
        assert.equal((await request(app)[method](path)).status, 401, `${label} without a token`);
        assert.equal((await request(app)[method](path).set('Authorization', `Bearer ${tampered}`)).status, 401, `${label} with a tampered token`);
    }
});

test('the list shows the stored columns over the saved payload, the payload as data, and the live job', async () => {
    setRepositoryForTests(await seededRepository());
    const app = buildApp();
    const payload = {
        title: 'Snapshot title', company: 'Snapshot Co', id: 'forged-id', itemId: 'job-forged', itemType: 'resume',
        createdAt: '1999-01-01T00:00:00.000Z', job: { title: 'Forged job', listed: true }, document: { title: 'Forged document' },
    };
    const saved = await save(app, CANDIDATE_A, { itemId: 'job-open', itemType: 'job', data: payload });
    assert.match(saved.id, /^fav_/);
    assert.equal(saved.itemId, 'job-open');
    assert.equal(saved.itemType, 'job');

    const rows = await list(app, CANDIDATE_A);
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.id, saved.id);
    assert.equal(row.itemId, 'job-open');
    assert.equal(row.itemType, 'job');
    assert.notEqual(row.createdAt, payload.createdAt);
    assert.ok(Number.isFinite(Date.parse(row.createdAt)), 'createdAt is the stored timestamp');
    assert.deepEqual(row.data, payload, 'data is exactly what was saved');
    assert.deepEqual(row.job, { title: 'Platform Engineer', company: 'Example Test Co', location: 'Remote', listed: true });
    assert.equal(row.document, null);
    // Older clients read the saved payload at the top level; it stays there, under the stored columns.
    assert.equal(row.title, 'Snapshot title');
    assert.equal(row.company, 'Snapshot Co');
});

test('a saved job shows its details only while GET /api/jobs-data/:id would show it to the same caller', async () => {
    const repository = await seededRepository();
    setRepositoryForTests(repository);
    const app = buildApp();
    const { jobsDataRouter } = require('../routes/jobsData');
    const { optionalAuth } = require('../security/auth');
    app.locals.jobsRepositoryProvider = () => repository;
    app.use('/api/jobs-data', optionalAuth, jobsDataRouter);

    const ids = ['job-open', 'job-closed', 'job-draft', 'job-expired', 'job-missing', 'job-own'];
    for (const itemId of ids) await save(app, CANDIDATE_A, { itemId, itemType: 'job', data: {} });
    const rows = await list(app, CANDIDATE_A);

    assert.deepEqual(byItem(rows, 'job-open').job, { title: 'Platform Engineer', company: 'Example Test Co', location: 'Remote', listed: true });
    // Closed, draft, expired and missing jobs answer alike, so a favourite cannot tell a hidden job from no job.
    for (const itemId of ['job-closed', 'job-draft', 'job-expired', 'job-missing']) {
        assert.equal(byItem(rows, itemId).job, null, itemId);
        assert.equal(Object.hasOwn(byItem(rows, itemId), 'title'), false, `${itemId}: nothing from the job row leaks`);
    }
    // The caller's own listing, as GET /api/jobs-data/:id shows it to its owner.
    assert.deepEqual(byItem(rows, 'job-own').job, { title: 'My Own Listing', company: 'Avery Ltd', location: 'Remote', listed: false });

    for (const itemId of ids) {
        const direct = await request(app).get(`/api/jobs-data/${itemId}`).set(as(CANDIDATE_A));
        assert.equal(direct.status === 200, byItem(rows, itemId).job !== null, `${itemId}: favourites and GET /api/jobs-data/:id agree`);
    }
});

test('a saved document shows its title only while it is still the caller\'s', async () => {
    setRepositoryForTests(await seededRepository());
    const app = buildApp();
    await save(app, CANDIDATE_A, { itemId: 'resume-a', itemType: 'resume', data: {} });
    await save(app, CANDIDATE_A, { itemId: 'resume-b', itemType: 'resume', data: {} });
    await save(app, CANDIDATE_A, { itemId: 'cover-a', itemType: 'cover', data: {} });
    await save(app, CANDIDATE_A, { itemId: 'resume-gone', itemType: 'resume', data: { title: 'As saved' } });
    const rows = await list(app, CANDIDATE_A);
    assert.deepEqual(byItem(rows, 'resume-a').document, { title: 'Platform CV' });
    assert.equal(byItem(rows, 'resume-b').document, null, 'another account\'s resume is not described');
    assert.deepEqual(byItem(rows, 'cover-a').document, { title: 'Letter to Northwind' });
    assert.equal(byItem(rows, 'resume-gone').document, null, 'a deleted resume has no document');
    assert.deepEqual(byItem(rows, 'resume-gone').data, { title: 'As saved' });
    for (const row of rows) assert.equal(row.job, null, `${row.itemId} is not a job`);
});

test('removing is scoped to the owner and reports whether anything was removed', async () => {
    setRepositoryForTests(await seededRepository());
    const app = buildApp();
    await save(app, CANDIDATE_A, { itemId: 'job-open', itemType: 'job', data: { title: 'Platform Engineer' } });
    assert.deepEqual(await list(app, CANDIDATE_B), [], 'B does not see A\'s favourites');

    const intruder = await request(app).delete('/api/favourites/job-open').set(as(CANDIDATE_B));
    assert.equal(intruder.status, 200);
    assert.deepEqual(intruder.body, { success: true, isFavourite: false, removed: false });
    assert.equal((await list(app, CANDIDATE_A)).length, 1, 'B\'s removal left A\'s favourite in place');

    const removed = await request(app).delete('/api/favourites/job-open').set(as(CANDIDATE_A));
    assert.deepEqual(removed.body, { success: true, isFavourite: false, removed: true });
    const again = await request(app).delete('/api/favourites/job-open').set(as(CANDIDATE_A));
    assert.deepEqual(again.body, { success: true, isFavourite: false, removed: false }, 'a second removal says nothing was removed');
    assert.deepEqual(await list(app, CANDIDATE_A), []);
});

test('item ids with reserved characters round-trip when the client encodes them', async () => {
    setRepositoryForTests(await seededRepository());
    const app = buildApp();
    const itemId = 'job/with space?&#%';
    await save(app, CANDIDATE_A, { itemId, itemType: 'job', data: {} });
    const check = await request(app).get(`/api/favourites/${encodeURIComponent(itemId)}/check`).set(as(CANDIDATE_A));
    assert.equal(check.body.isFavourite, true);
    const removed = await request(app).delete(`/api/favourites/${encodeURIComponent(itemId)}`).set(as(CANDIDATE_A));
    assert.equal(removed.body.removed, true);
    assert.deepEqual(await list(app, CANDIDATE_A), []);
});

test('saving the same item again (Undo) restores it with the same payload and keeps one row', async () => {
    setRepositoryForTests(await seededRepository());
    const app = buildApp();
    const data = { title: 'Platform Engineer', company: 'Example Test Co', location: 'Remote' };
    const first = await save(app, CANDIDATE_A, { itemId: 'job-open', itemType: 'job', data });
    const repeated = await save(app, CANDIDATE_A, { itemId: 'job-open', itemType: 'resume', data });
    assert.equal(repeated.id, first.id, 'a repeated save answers with the stored row');
    assert.equal(repeated.itemType, 'job', 'and with its stored type');
    assert.equal((await list(app, CANDIDATE_A)).length, 1);

    await request(app).delete('/api/favourites/job-open').set(as(CANDIDATE_A)).expect(200);
    await save(app, CANDIDATE_A, { itemId: 'job-open', itemType: 'job', data });
    const rows = await list(app, CANDIDATE_A);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].itemType, 'job');
    assert.deepEqual(rows[0].data, data);
});

test('the type filter still works, and a payload that is not an object is stored as an empty one', async () => {
    const repository = await seededRepository();
    setRepositoryForTests(repository);
    const app = buildApp();
    await save(app, CANDIDATE_A, { itemId: 'job-open', itemType: 'job', data: ['not', 'an', 'object'] });
    await save(app, CANDIDATE_A, { itemId: 'resume-a', itemType: 'resume' });
    const jobs = await list(app, CANDIDATE_A, '?type=job');
    assert.deepEqual(jobs.map(row => row.itemId), ['job-open']);
    assert.deepEqual(jobs[0].data, {});
    assert.equal(Object.hasOwn(jobs[0], '0'), false);
    assert.deepEqual((await list(app, CANDIDATE_A, '?type=resume')).map(row => row.itemId), ['resume-a']);

    // The data export and the admin view read getFavourites: whole records, owner-scoped.
    const exported = await repository.getFavourites(CANDIDATE_A);
    assert.deepEqual(exported.map(row => [row.itemId, row.itemType]).sort(), [['job-open', 'job'], ['resume-a', 'resume']]);
    assert.ok(exported.every(row => typeof row.id === 'string' && row.id.startsWith('fav_') && row.createdAt));
    assert.deepEqual(await repository.getFavourites(CANDIDATE_B), []);
});

test('a database outage is reported as unavailable, never as an empty list', async () => {
    setRepositoryForTests({
        async getFavouritesWithItems() {
            throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'DATABASE_UNAVAILABLE', status: 503 });
        },
    });
    const response = await request(buildApp()).get('/api/favourites').set(as(CANDIDATE_A));
    assert.equal(response.status, 503);
    assert.equal(response.body.success, false);
    assert.equal(Object.hasOwn(response.body, 'favourites'), false);
    assert.doesNotMatch(JSON.stringify(response.body), /ECONNREFUSED|3306/);
});

const NO_JOINS = Object.freeze({
    job_title: null, job_company: null, job_location: null, job_status: null, job_expires_at: null, job_employer_id: null,
    resume_title: null, cover_title: null,
});

test('MariaDB: the list is one owner-scoped query joined to the job and to the owner\'s own documents', async () => {
    const repository = new MySQLRepository();
    const statements = [];
    repository._getPool = () => ({
        async query(sql, params) {
            statements.push([sql, params]);
            return [[
                {
                    ...NO_JOINS, id: 'fav_2', item_id: 'job-open', item_type: 'job', created_at: new Date('2026-10-20T09:00:00.000Z'),
                    data: JSON.stringify({ title: 'Snapshot', itemId: 'job-forged' }),
                    job_title: 'Platform Engineer', job_company: 'Example Test Co', job_location: 'Remote', job_status: 'active',
                    job_expires_at: null, job_employer_id: 'employer-1',
                },
                { ...NO_JOINS, id: 'fav_1', item_id: 'resume-a', item_type: 'resume', data: null, created_at: new Date('2026-10-19T09:00:00.000Z'), resume_title: 'Platform CV' },
                { ...NO_JOINS, id: 'fav_0', item_id: 'cover-a', item_type: 'cover', data: '{not json', created_at: null, cover_title: 'Letter to Northwind' },
                { ...NO_JOINS, id: 'fav_x', item_id: 'job-gone', item_type: 'job', data: '[1,2]', created_at: new Date('2026-10-18T09:00:00.000Z') },
            ]];
        },
    });

    const rows = await repository.getFavouritesWithItems('cand-a');
    assert.equal(statements.length, 1);
    const [sql, params] = statements[0];
    assert.deepEqual(params, ['cand-a']);
    assert.match(sql, /FROM favourites f\s+LEFT JOIN jobs j ON f\.item_type = 'job' AND j\.id = f\.item_id/);
    assert.match(sql, /LEFT JOIN resumes r ON f\.item_type = 'resume' AND r\.id = f\.item_id AND r\.user_id = f\.user_id/);
    assert.match(sql, /LEFT JOIN covers c ON f\.item_type IN \([^)]*'cover'[^)]*\) AND c\.id = f\.item_id AND c\.user_id = f\.user_id/);
    assert.match(sql, /WHERE f\.user_id = \?\s+ORDER BY f\.created_at DESC, f\.id DESC/);
    assert.doesNotMatch(sql, /SELECT \*|[fjrc]\.\*|description|extra_json|salary/);

    assert.deepEqual(rows[0], {
        id: 'fav_2', itemId: 'job-open', itemType: 'job', createdAt: '2026-10-20T09:00:00.000Z',
        data: { title: 'Snapshot', itemId: 'job-forged' },
        job: { title: 'Platform Engineer', company: 'Example Test Co', location: 'Remote', status: 'active', expiresAt: null, employerId: 'employer-1' },
        document: null,
    });
    assert.deepEqual(rows[1], { id: 'fav_1', itemId: 'resume-a', itemType: 'resume', createdAt: '2026-10-19T09:00:00.000Z', data: {}, job: null, document: { title: 'Platform CV' } });
    assert.deepEqual(rows[2].document, { title: 'Letter to Northwind' });
    assert.deepEqual(rows[2].data, {}, 'an unreadable payload is an empty object');
    assert.equal(rows[2].createdAt, null);
    assert.deepEqual(rows[3].data, {}, 'a payload that is not an object is an empty object');
    assert.equal(rows[3].job, null, 'a favourite without a job row has no job');
});

test('MariaDB: the stored columns win over the saved payload in getFavourites and in the save response', async () => {
    const repository = new MySQLRepository();
    const statements = [];
    const stored = {
        id: 'fav_1', item_id: 'job-open', item_type: 'job', created_at: new Date('2026-10-20T09:00:00.000Z'),
        data: JSON.stringify({ id: 'forged', itemId: 'job-forged', itemType: 'resume', createdAt: '1999-01-01T00:00:00.000Z', title: 'Snapshot' }),
    };
    repository._getPool = () => ({
        async query(sql, params) {
            statements.push([sql, params]);
            if (/^\s*INSERT/i.test(sql)) return [{ affectedRows: 2 }];
            return [[stored]];
        },
    });
    const expected = { id: 'fav_1', itemId: 'job-open', itemType: 'job', createdAt: '2026-10-20T09:00:00.000Z', title: 'Snapshot' };
    assert.deepEqual(await repository.getFavourites('cand-a'), [expected]);

    statements.length = 0;
    const saved = await repository.addFavourite('cand-a', 'job-open', 'resume', { title: 'Snapshot', id: 'forged' });
    assert.deepEqual(saved, expected, 'a repeated save answers with the stored row, not a new id or type');
    assert.equal(statements.length, 2);
    assert.match(statements[0][0], /INSERT INTO favourites/);
    assert.match(statements[1][0], /FROM favourites WHERE user_id = \? AND item_id = \?/);
    assert.deepEqual(statements[1][1], ['cand-a', 'job-open']);
});

test('MariaDB: removing is one DELETE scoped to the owner and reports whether a row went', async () => {
    const repository = new MySQLRepository();
    const statements = [];
    let affectedRows = 1;
    repository._getPool = () => ({
        async query(sql, params) {
            statements.push([sql.replace(/\s+/g, ' ').trim(), params]);
            return [{ affectedRows }];
        },
    });
    assert.equal(await repository.removeFavourite('cand-a', 'job-open'), true);
    affectedRows = 0;
    assert.equal(await repository.removeFavourite('cand-a', 'job-open'), false);
    assert.deepEqual(statements, [
        ['DELETE FROM favourites WHERE user_id = ? AND item_id = ?', ['cand-a', 'job-open']],
        ['DELETE FROM favourites WHERE user_id = ? AND item_id = ?', ['cand-a', 'job-open']],
    ]);
});

test('the list is a read: it is served while MariaDB refuses writes', async () => {
    const mysqlRepo = new MySQLRepository();
    mysqlRepo.getFavouritesWithItems = async () => [{
        id: 'fav_1', itemId: 'job-open', itemType: 'job', createdAt: new Date('2026-10-20T09:00:00.000Z'), data: {}, job: null, document: null,
    }];
    const repository = new ResilientRepository({ mysqlRepo });
    authority.__resetForTests({ mysqlHealthy: false, consecutiveFailures: 99 });
    assert.equal(authority.canAcceptWrites(), false, 'precondition: writes are refused');
    const rows = await repository.getFavouritesWithItems('cand-a');
    assert.deepEqual(rows, [{ id: 'fav_1', itemId: 'job-open', itemType: 'job', createdAt: '2026-10-20T09:00:00.000Z', data: {}, job: null, document: null }]);
});
