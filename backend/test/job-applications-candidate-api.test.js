'use strict';

// The candidate's side of submitted job applications (/api/jobs-data/applications,
// P002 C14). A candidate sees their own applications with the job they applied
// to, and none of the employer's own columns. They can withdraw an application
// and correct their own contact details, but cannot take over another
// candidate's application, create one outside the apply workflow
// (POST /api/jobs/:jobId/applications), or set what the employer decides:
// status, rating, notes, the job or the employer.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const MySQLRepository = require('../repositories/MySQLRepository');
const InMemoryRepository = require('../repositories/InMemoryRepository');
const ResilientRepository = require('../repositories/ResilientRepository');
const authority = require('../database/authority');
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

// Rows as MariaDB stores them, including the employer's own columns.
const STORED = Object.freeze([
    {
        id: 'cand-a_job-open', job_id: 'job-open', employer_id: 'employer-1', applicant_id: 'cand-a',
        applicant_name: 'Avery Tester', applicant_email: 'avery@example.test', applicant_phone: '+1 555 0100',
        resume_id: 'resume-a', resume_url: null, cover_letter: 'I would like to apply for the Platform Engineer role.',
        status: 'interview', rating: 4, notes: 'Strong systems answers.', revision: 1, extra_json: null,
        created_at: '2026-10-18T09:00:00.000Z', updated_at: '2026-10-19T10:00:00.000Z',
    },
    {
        id: 'cand-a_job-closed', job_id: 'job-closed', employer_id: 'employer-1', applicant_id: 'cand-a',
        applicant_name: 'Avery Tester', applicant_email: 'avery@example.test', applicant_phone: '',
        resume_id: null, resume_url: null, cover_letter: 'I would like to apply for the Data Analyst role.',
        status: 'PENDING', rating: 0, notes: '', revision: 1, extra_json: null,
        created_at: '2026-10-10T08:00:00.000Z', updated_at: '2026-10-10T08:00:00.000Z',
    },
    {
        id: 'cand-b_job-open', job_id: 'job-open', employer_id: 'employer-1', applicant_id: 'cand-b',
        applicant_name: 'Blake Tester', applicant_email: 'blake@example.test', applicant_phone: '+1 555 0101',
        resume_id: null, resume_url: null, cover_letter: 'Blake applies for the Platform Engineer role.',
        status: 'pending', rating: 2, notes: 'Second round maybe.', revision: 1, extra_json: null,
        created_at: '2026-10-17T07:00:00.000Z', updated_at: '2026-10-17T07:00:00.000Z',
    },
]);
const JOBS = Object.freeze({
    'job-open': { title: 'Platform Engineer', company_name: 'Example Test Co', location: 'Remote', status: 'active', expires_at: null },
    'job-closed': { title: 'Data Analyst', company_name: 'Northwind', location: 'Pune', status: 'closed', expires_at: null },
});

// A route-level repository with the MariaDB repository's semantics: getApplication
// returns the camelCase record and saveApplication upserts every column it is given.
function applicationsRepository() {
    const rows = new Map(STORED.map(row => [row.id, { ...row }]));
    const calls = [];
    const camel = row => ({
        id: row.id, jobId: row.job_id, employerId: row.employer_id, userId: row.applicant_id, applicantId: row.applicant_id,
        applicantName: row.applicant_name, applicantEmail: row.applicant_email, applicantPhone: row.applicant_phone,
        resumeId: row.resume_id, resumeUrl: row.resume_url, coverLetter: row.cover_letter, status: row.status,
        rating: row.rating, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision,
    });
    return {
        rows,
        calls,
        async getApplications(filters = {}) {
            calls.push(['getApplications', filters]);
            return [...rows.values()].filter(row => !filters.applicantId || row.applicant_id === filters.applicantId).map(row => ({ ...row }));
        },
        async getApplicantApplications(filters = {}) {
            calls.push(['getApplicantApplications', filters]);
            return [...rows.values()].filter(row => row.applicant_id === filters.applicantId).map((row) => {
                const job = JOBS[row.job_id];
                return {
                    id: row.id, jobId: row.job_id, status: row.status, applicantName: row.applicant_name,
                    applicantEmail: row.applicant_email, applicantPhone: row.applicant_phone, resumeId: row.resume_id,
                    coverLetter: row.cover_letter, createdAt: row.created_at, updatedAt: row.updated_at,
                    job: job ? { title: job.title, company: job.company_name, location: job.location, status: job.status, expiresAt: job.expires_at } : null,
                };
            });
        },
        async getApplication(id) {
            calls.push(['getApplication', id]);
            const row = rows.get(id);
            return row ? camel(row) : null;
        },
        async saveApplication(id, data) {
            calls.push(['saveApplication', id, data]);
            rows.set(id, {
                ...(rows.get(id) || {}),
                id,
                job_id: data.jobId || data.job_id,
                employer_id: data.employerId || data.employer_id || null,
                applicant_id: data.applicantId || data.applicant_id,
                applicant_name: data.applicantName || data.applicant_name || '',
                applicant_email: data.applicantEmail || data.applicant_email || '',
                applicant_phone: data.applicantPhone || data.applicant_phone || '',
                cover_letter: data.coverLetter || data.cover_letter || '',
                status: data.status || 'PENDING',
                rating: Number(data.rating || 0),
                notes: data.notes || '',
            });
            return { id, ...data };
        },
        async updateApplicantContact(id, applicantId, fields) {
            calls.push(['updateApplicantContact', id, applicantId, fields]);
            const row = rows.get(id);
            if (!row || row.applicant_id !== applicantId) return false;
            if (fields.applicantName !== undefined) row.applicant_name = fields.applicantName;
            if (fields.applicantPhone !== undefined) row.applicant_phone = fields.applicantPhone;
            return true;
        },
        async deleteApplication(id) {
            calls.push(['deleteApplication', id]);
            rows.delete(id);
            return true;
        },
    };
}

const EMPLOYER_KEYS = ['rating', 'notes', 'employer_id', 'employerId', 'extra_json', 'revision', 'applicant_id', 'applicantId', 'resume_url', 'resumeUrl'];

test('the list shows only the caller\'s applications, with the job applied to and none of the employer\'s columns', async () => {
    const repository = applicationsRepository();
    const app = buildRouteApp(repository);

    const response = await request(app).get('/api/jobs-data/applications/list').set('x-test-user', 'cand-a');
    assert.equal(response.status, 200);
    const applications = response.body.applications;
    assert.deepEqual(applications.map(item => item.id).sort(), ['cand-a_job-closed', 'cand-a_job-open']);

    const open = applications.find(item => item.id === 'cand-a_job-open');
    assert.deepEqual(open, {
        id: 'cand-a_job-open',
        jobId: 'job-open',
        status: 'interview',
        createdAt: '2026-10-18T09:00:00.000Z',
        updatedAt: '2026-10-19T10:00:00.000Z',
        applicantName: 'Avery Tester',
        applicantEmail: 'avery@example.test',
        applicantPhone: '+1 555 0100',
        resumeId: 'resume-a',
        coverLetter: 'I would like to apply for the Platform Engineer role.',
        job: { title: 'Platform Engineer', company: 'Example Test Co', location: 'Remote', listed: true },
    });

    const closed = applications.find(item => item.id === 'cand-a_job-closed');
    assert.equal(closed.status, 'pending', 'the table default PENDING is reported in the workflow vocabulary');
    assert.deepEqual(closed.job, { title: 'Data Analyst', company: 'Northwind', location: 'Pune', listed: false },
        'a job that is no longer listed still names what was applied to');
    assert.equal(closed.resumeId, null);

    for (const item of applications) {
        for (const key of EMPLOYER_KEYS) assert.equal(Object.hasOwn(item, key), false, `${item.id} exposes ${key}`);
    }
    assert.doesNotMatch(JSON.stringify(response.body), /Strong systems answers|Second round maybe|Blake/);
});

test('another candidate cannot take over an application through POST', async () => {
    const repository = applicationsRepository();
    const app = buildRouteApp(repository);

    const takeover = await request(app).post('/api/jobs-data/applications/cand-a_job-open')
        .set('x-test-user', 'cand-b')
        .send({ jobId: 'job-open', coverLetter: 'Replaced by someone else', status: 'accepted' });
    assert.equal(takeover.status, 403);
    const row = repository.rows.get('cand-a_job-open');
    assert.equal(row.applicant_id, 'cand-a', 'the application keeps its owner');
    assert.equal(row.cover_letter, 'I would like to apply for the Platform Engineer role.');
    assert.equal(row.status, 'interview');
    assert.equal(repository.calls.some(([name]) => name === 'saveApplication' || name === 'updateApplicantContact'), false, 'nothing is written');
});

test('POST cannot create an application outside the apply workflow', async () => {
    const repository = applicationsRepository();
    const app = buildRouteApp(repository);

    const created = await request(app).post('/api/jobs-data/applications/cand-a_job-draft')
        .set('x-test-user', 'cand-a')
        .send({ jobId: 'job-draft', employerId: 'employer-9', status: 'accepted', rating: 5 });
    assert.equal(created.status, 404);
    assert.equal(created.body.code, 'APPLICATION_NOT_FOUND');
    assert.match(created.body.error, /POST \/api\/jobs\/:jobId\/applications/);
    assert.equal(repository.rows.has('cand-a_job-draft'), false);
    assert.equal(repository.calls.some(([name]) => name === 'saveApplication'), false);
});

test('the owner cannot set the employer\'s decisions or move an application to another job or employer', async () => {
    const forbidden = [
        { status: 'accepted' }, { rating: 5 }, { notes: 'forged employer note' },
        { employerId: 'cand-b' }, { employer_id: 'cand-b' }, { jobId: 'job-closed' }, { job_id: 'job-closed' },
        { applicantEmail: 'someone@example.test' }, { resumeUrl: 'https://attacker.example/cv.pdf' }, { resumeId: 'resume-b' },
        { coverLetter: 'A different letter after the employer read the first one.' }, { applicantId: 'cand-b' },
    ];
    for (const method of ['patch', 'post']) {
        for (const body of forbidden) {
            const repository = applicationsRepository();
            const app = buildRouteApp(repository);
            const response = await request(app)[method]('/api/jobs-data/applications/cand-a_job-open')
                .set('x-test-user', 'cand-a').send({ applicantPhone: '+44 20 7946 0000', ...body });
            const field = Object.keys(body)[0];
            assert.equal(response.status, 400, `${method.toUpperCase()} ${field}`);
            assert.equal(response.body.code, 'APPLICATION_FIELD_NOT_EDITABLE', `${method.toUpperCase()} ${field}`);
            assert.equal(response.body.field, field);
            assert.deepEqual(repository.rows.get('cand-a_job-open'), STORED[0], `${method.toUpperCase()} ${field} leaves the row unchanged`);
        }
    }
});

test('the owner can correct their own name and phone, validated like the apply form, and nothing else changes', async () => {
    const repository = applicationsRepository();
    const app = buildRouteApp(repository);

    const invalid = await request(app).patch('/api/jobs-data/applications/cand-a_job-open')
        .set('x-test-user', 'cand-a').send({ applicantPhone: 'call me maybe' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'APPLICATION_VALIDATION_ERROR');
    const blankName = await request(app).patch('/api/jobs-data/applications/cand-a_job-open')
        .set('x-test-user', 'cand-a').send({ applicantName: '   ' });
    assert.equal(blankName.status, 400);
    const empty = await request(app).patch('/api/jobs-data/applications/cand-a_job-open')
        .set('x-test-user', 'cand-a').send({});
    assert.equal(empty.status, 400);
    assert.deepEqual(repository.rows.get('cand-a_job-open'), STORED[0], 'refused updates write nothing');

    const updated = await request(app).patch('/api/jobs-data/applications/cand-a_job-open')
        .set('x-test-user', 'cand-a').send({ applicantName: ' Avery\u0007 T. Tester ', applicantPhone: '+44 20 7946 0000' });
    assert.equal(updated.status, 200);
    const row = repository.rows.get('cand-a_job-open');
    assert.equal(row.applicant_name, 'Avery  T. Tester');
    assert.equal(row.applicant_phone, '+44 20 7946 0000');
    for (const column of ['status', 'rating', 'notes', 'employer_id', 'job_id', 'applicant_id', 'cover_letter']) {
        assert.equal(row[column], STORED[0][column], `${column} is unchanged`);
    }
    assert.equal(updated.body.application.applicantPhone, '+44 20 7946 0000');
    for (const key of EMPLOYER_KEYS) assert.equal(Object.hasOwn(updated.body.application, key), false, `the response exposes ${key}`);

    const viaPost = await request(app).post('/api/jobs-data/applications/cand-a_job-open')
        .set('x-test-user', 'cand-a').send({ phone: '+91 98765 43210' });
    assert.equal(viaPost.status, 200, 'POST on the caller\'s own application is the same update');
    assert.equal(repository.rows.get('cand-a_job-open').applicant_phone, '+91 98765 43210');

    const notMine = await request(app).patch('/api/jobs-data/applications/cand-b_job-open')
        .set('x-test-user', 'cand-a').send({ applicantPhone: '+44 20 7946 0000' });
    assert.equal(notMine.status, 403);
    assert.equal(repository.rows.get('cand-b_job-open').applicant_phone, '+1 555 0101');
});

test('withdrawal stays owner-scoped', async () => {
    const repository = applicationsRepository();
    const app = buildRouteApp(repository);

    assert.equal((await request(app).delete('/api/jobs-data/applications/cand-a_job-open').set('x-test-user', 'cand-b')).status, 403);
    assert.equal(repository.rows.has('cand-a_job-open'), true);
    assert.equal((await request(app).delete('/api/jobs-data/applications/missing').set('x-test-user', 'cand-a')).status, 404);
    assert.equal((await request(app).delete('/api/jobs-data/applications/cand-a_job-open').set('x-test-user', 'cand-a')).status, 200);
    assert.equal(repository.rows.has('cand-a_job-open'), false);
    assert.equal(repository.rows.has('cand-b_job-open'), true);
});

test('MariaDB: the applicant list is one owner-scoped query joined to the job, without the employer\'s columns', async () => {
    const repository = new MySQLRepository();
    const statements = [];
    repository._getPool = () => ({
        async query(sql, params) {
            statements.push([sql, params]);
            return [[{
                id: 'cand-a_job-open', job_id: 'job-open', status: 'interview', applicant_name: 'Avery Tester',
                applicant_email: 'avery@example.test', applicant_phone: '+1 555 0100', resume_id: 'resume-a',
                cover_letter: 'Letter', created_at: new Date('2026-10-18T09:00:00.000Z'), updated_at: new Date('2026-10-19T10:00:00.000Z'),
                job_title: 'Platform Engineer', job_company: 'Example Test Co', job_location: 'Remote', job_status: 'active', job_expires_at: null,
            }, {
                id: 'cand-a_orphan', job_id: 'job-gone', status: 'pending', applicant_name: '', applicant_email: '', applicant_phone: null,
                resume_id: null, cover_letter: null, created_at: new Date('2026-10-01T00:00:00.000Z'), updated_at: null,
                job_title: null, job_company: null, job_location: null, job_status: null, job_expires_at: null,
            }]];
        },
    });

    const rows = await repository.getApplicantApplications({ applicantId: 'cand-a' });
    assert.equal(statements.length, 1);
    const [sql, params] = statements[0];
    assert.deepEqual(params, ['cand-a']);
    assert.match(sql, /FROM applications a\s+LEFT JOIN jobs j ON j\.id = a\.job_id/);
    assert.match(sql, /WHERE a\.applicant_id = \?/);
    assert.doesNotMatch(sql, /a\.\*|SELECT \*|rating|notes|employer_id|extra_json|resume_url/);
    assert.deepEqual(rows[0], {
        id: 'cand-a_job-open', jobId: 'job-open', status: 'interview', applicantName: 'Avery Tester',
        applicantEmail: 'avery@example.test', applicantPhone: '+1 555 0100', resumeId: 'resume-a', coverLetter: 'Letter',
        createdAt: '2026-10-18T09:00:00.000Z', updatedAt: '2026-10-19T10:00:00.000Z',
        job: { title: 'Platform Engineer', company: 'Example Test Co', location: 'Remote', status: 'active', expiresAt: null },
    });
    assert.equal(rows[1].job, null, 'an application without a job row has no job');
    assert.equal(rows[1].applicantPhone, '');
    assert.equal(rows[1].coverLetter, '');

    assert.deepEqual(await repository.getApplicantApplications({}), [], 'no applicant, no rows and no query');
    assert.equal(statements.length, 1);
});

test('MariaDB: a contact correction is one UPDATE scoped to the application and its applicant', async () => {
    const repository = new MySQLRepository();
    const statements = [];
    let affectedRows = 1;
    repository._getPool = () => ({
        async query(sql, params) {
            statements.push([sql, params]);
            return [{ affectedRows }];
        },
    });

    assert.equal(await repository.updateApplicantContact('cand-a_job-open', 'cand-a', { applicantPhone: '+44 20 7946 0000' }), true);
    assert.equal(statements.length, 1);
    const [sql, params] = statements[0];
    assert.match(sql, /^UPDATE applications SET applicant_phone = \?/);
    assert.match(sql, /WHERE id = \? AND applicant_id = \?$/);
    assert.doesNotMatch(sql, /status|rating|notes|employer_id|job_id|cover_letter/);
    assert.deepEqual(params, ['+44 20 7946 0000', 'cand-a_job-open', 'cand-a']);

    affectedRows = 0;
    assert.equal(await repository.updateApplicantContact('cand-b_job-open', 'cand-a', { applicantName: 'Avery' }), false, 'another applicant\'s row is not updated');
    assert.equal(await repository.updateApplicantContact('cand-a_job-open', 'cand-a', {}), false, 'nothing to update, no query');
    assert.equal(statements.length, 2);
});

test('MariaDB: the phone a candidate enters when applying is stored', async () => {
    const repository = new MySQLRepository();
    const statements = [];
    repository._getPool = () => ({
        async query(sql, params) {
            statements.push([sql, params]);
            return [{ affectedRows: 1 }];
        },
    });
    // The record the apply workflow (resilientMutations.createApplication) saves.
    await repository.saveApplication('cand-a_job-open', {
        jobId: 'job-open', employerId: 'employer-1', applicantId: 'cand-a', userId: 'cand-a',
        applicantName: 'Avery Tester', applicantEmail: 'avery@example.test', phone: '+1 555 0100',
        coverLetter: 'Letter', resumeId: '', status: 'pending',
    });
    const insert = statements.find(([sql]) => /INSERT INTO applications/.test(sql));
    const columns = /INSERT INTO applications \(([^)]+)\)/.exec(insert[0])[1].split(',').map(name => name.trim());
    assert.equal(insert[1][columns.indexOf('applicant_phone')], '+1 555 0100');
});

test('in-memory fallback: the applicant list and the legacy filter are scoped to the applicant', async () => {
    const repository = new InMemoryRepository();
    await repository.saveJob('job-open', { title: 'Platform Engineer', companyName: 'Example Test Co', location: 'Remote', status: 'active' });
    await repository.saveApplication('cand-a_job-open', { jobId: 'job-open', applicantId: 'cand-a', userId: 'cand-a', status: 'pending', rating: 3, notes: 'Employer only', phone: '+1 555 0100', createdAt: '2026-10-18T09:00:00.000Z' });
    await repository.saveApplication('cand-b_job-open', { jobId: 'job-open', applicantId: 'cand-b', userId: 'cand-b', status: 'pending', createdAt: '2026-10-17T09:00:00.000Z' });

    assert.deepEqual((await repository.getApplications({ applicantId: 'cand-a' })).map(row => row.id), ['cand-a_job-open']);
    const rows = await repository.getApplicantApplications({ applicantId: 'cand-a' });
    assert.deepEqual(rows.map(row => row.id), ['cand-a_job-open']);
    assert.equal(rows[0].applicantPhone, '+1 555 0100');
    assert.deepEqual(rows[0].job, { title: 'Platform Engineer', company: 'Example Test Co', location: 'Remote', status: 'active', expiresAt: null });
    assert.equal(Object.hasOwn(rows[0], 'rating'), false);
    assert.equal(Object.hasOwn(rows[0], 'notes'), false);
    assert.deepEqual(await repository.getApplicantApplications({}), []);

    assert.equal(await repository.updateApplicantContact('cand-b_job-open', 'cand-a', { applicantPhone: '+1 555 0199' }), false);
    assert.equal(await repository.updateApplicantContact('cand-a_job-open', 'cand-a', { applicantPhone: '+1 555 0199' }), true);
    assert.equal((await repository.getApplicantApplications({ applicantId: 'cand-a' }))[0].applicantPhone, '+1 555 0199');
});

test('the applicant list is a read: it is served while MariaDB refuses writes', async () => {
    const mysqlRepo = new MySQLRepository();
    mysqlRepo.getApplicantApplications = async () => [{ id: 'cand-a_job-open', createdAt: new Date('2026-10-18T09:00:00.000Z') }];
    const repository = new ResilientRepository({ mysqlRepo });
    authority.__resetForTests({ mysqlHealthy: false, consecutiveFailures: 99 });
    try {
        assert.equal(authority.canAcceptWrites(), false, 'precondition: writes are refused');
        const rows = await repository.getApplicantApplications({ applicantId: 'cand-a' });
        assert.deepEqual(rows, [{ id: 'cand-a_job-open', createdAt: '2026-10-18T09:00:00.000Z' }]);
    } finally {
        authority.__resetForTests();
    }
});
