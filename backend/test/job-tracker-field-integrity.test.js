'use strict';

// The job tracker stores what the candidate entered, and nothing else: a job
// saved without a work mode has none (it is not recorded as "Remote"), and an
// optional field the candidate clears is cleared, not kept from the old row.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const MySQLRepository = require('../repositories/MySQLRepository');

// Parameter order of the INSERT and UPDATE statements in MySQLRepository.
const INSERT_WORK_MODE = 7;
const UPDATE_COLUMNS = [
    'job_title', 'company', 'status', 'sort_order', 'location', 'work_mode', 'salary', 'date_applied',
    'contact_person', 'contact_email', 'url', 'notes', 'deadline',
    'interview_round', 'interview_at', 'interview_format', 'interview_link', 'revision',
];

const STORED_ROW = Object.freeze({
    id: 'tracker-a', user_id: 'owner-a', job_title: 'Senior Data Analyst', company: 'Northwind Analytics',
    status: 'interview', sort_order: 0, location: 'Bengaluru', work_mode: 'Hybrid', salary: '24 LPA',
    date_applied: '2026-10-02', contact_person: 'Priya Raman', contact_email: 'priya@northwind.example',
    url: 'https://careers.northwind.example/jobs/2041', notes: 'Prepare the case study.', deadline: '2026-10-31',
    interview_round: 'Technical', interview_at: '2026-10-24 10:30:00', interview_format: 'Video',
    interview_link: 'https://meet.example.com/nw-2041', revision: 2,
});

function repositoryWithStoredRow() {
    const repository = new MySQLRepository();
    const statements = [];
    repository._withTransaction = callback => callback({
        async query(sql, params) {
            statements.push([sql, params]);
            if (/SELECT \* FROM job_tracker/.test(sql)) return [[{ ...STORED_ROW }]];
            return [{ affectedRows: 1 }];
        },
    });
    const written = () => {
        const update = statements.find(([sql]) => /UPDATE job_tracker SET/.test(sql));
        assert.ok(update, 'an UPDATE was issued');
        return Object.fromEntries(UPDATE_COLUMNS.map((column, index) => [column, update[1][index]]));
    };
    return { repository, written };
}

test('a tracked job created without a work mode stores none instead of "Remote"', async () => {
    const repository = new MySQLRepository();
    const statements = [];
    repository._getPool = () => ({
        async query(sql, params) {
            statements.push([sql, params]);
            if (/SELECT created_at/.test(sql)) return [[{ createdAt: '2026-10-20T19:48:03.000Z', updatedAt: '2026-10-20T19:48:03.000Z' }]];
            return [{ affectedRows: 1 }];
        },
    });
    const job = await repository.createTrackedJob('owner-a', 'tracker-new', { title: 'BI Developer', company: 'Fabrikam', status: 'wishlist' });
    const insert = statements.find(([sql]) => /INSERT INTO job_tracker/.test(sql));
    assert.equal(insert[1][INSERT_WORK_MODE], null, 'no work mode is stored');
    assert.equal(job.workMode, null, 'the response reports no work mode');

    const chosen = await repository.createTrackedJob('owner-a', 'tracker-hybrid', { title: 'BI Developer', company: 'Fabrikam', workMode: 'Hybrid' });
    assert.equal(chosen.workMode, 'Hybrid', 'a chosen work mode is kept');
});

test('clearing optional fields in an update clears them', async () => {
    const { repository, written } = repositoryWithStoredRow();
    const updated = await repository.updateTrackedJob('owner-a', 'tracker-a', {
        location: '', workMode: '', salary: '', dateApplied: '', contactPerson: '', contactEmail: '',
        url: '', deadline: '', interviewRound: '', interviewAt: '', interviewFormat: '', interviewLink: '',
    }, { expectedRevision: 2 });
    const row = written();
    assert.deepEqual(
        {
            location: row.location, work_mode: row.work_mode, salary: row.salary, date_applied: row.date_applied,
            contact_person: row.contact_person, contact_email: row.contact_email, url: row.url, deadline: row.deadline,
            interview_round: row.interview_round, interview_at: row.interview_at, interview_format: row.interview_format,
            interview_link: row.interview_link,
        },
        {
            location: '', work_mode: null, salary: null, date_applied: null, contact_person: null, contact_email: null,
            url: '', deadline: null, interview_round: null, interview_at: null, interview_format: null, interview_link: null,
        },
    );
    assert.equal(row.job_title, 'Senior Data Analyst', 'required fields are untouched');
    assert.equal(row.notes, 'Prepare the case study.', 'fields left out are untouched');
    assert.equal(updated.workMode, null);
    assert.equal(updated.dateApplied, '');
    assert.equal(updated.contactPerson, '');
    assert.equal(updated.revision, 3);
});

test('an update that leaves fields out keeps every stored value', async () => {
    const { repository, written } = repositoryWithStoredRow();
    await repository.updateTrackedJob('owner-a', 'tracker-a', { status: 'offer' }, { expectedRevision: 2 });
    const row = written();
    assert.deepEqual(
        { ...row, interview_at: row.interview_at },
        {
            job_title: 'Senior Data Analyst', company: 'Northwind Analytics', status: 'offer', sort_order: 0,
            location: 'Bengaluru', work_mode: 'Hybrid', salary: '24 LPA', date_applied: '2026-10-02',
            contact_person: 'Priya Raman', contact_email: 'priya@northwind.example',
            url: 'https://careers.northwind.example/jobs/2041', notes: 'Prepare the case study.', deadline: '2026-10-31',
            interview_round: 'Technical', interview_at: '2026-10-24 10:30:00', interview_format: 'Video',
            interview_link: 'https://meet.example.com/nw-2041', revision: 3,
        },
    );
});

test('notes keep their line breaks; other control characters are removed', async () => {
    const express = require('express');
    const request = require('supertest');
    const { jobsDataRouter } = require('../routes/jobsData');
    const received = [];
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { uid: 'owner-a' }; next(); });
    app.locals.jobsRepositoryProvider = () => ({
        async createTrackedJob(userId, trackerId, data) { received.push(data); return { id: trackerId, ...data, revision: 1 }; },
    });
    app.use('/api/jobs-data', jobsDataRouter);
    const response = await request(app).post('/api/jobs-data/tracker')
        .send({ title: 'Analyst', company: 'Acme', notes: '  Questions to ask:\r\n- team size\n- on-call\u0007 rota  ' });
    assert.equal(response.status, 201);
    assert.equal(received[0].notes, 'Questions to ask:\n- team size\n- on-call  rota');

    const repository = new MySQLRepository();
    const statements = [];
    repository._getPool = () => ({
        async query(sql, params) {
            statements.push([sql, params]);
            if (/SELECT created_at/.test(sql)) return [[{ createdAt: null, updatedAt: null }]];
            return [{ affectedRows: 1 }];
        },
    });
    const job = await repository.createTrackedJob('owner-a', 'tracker-notes', { title: 'Analyst', company: 'Acme', notes: 'Line one\nLine two\u0000' });
    assert.equal(job.notes, 'Line one\nLine two', 'the repository keeps line breaks too');
});

test('a created job reports the timestamps the database recorded', async () => {
    const repository = new MySQLRepository();
    repository._getPool = () => ({
        async query(sql) {
            // mysql2 resolves [rows, fields].
            if (/SELECT created_at/.test(sql)) return [[{ createdAt: '2026-10-20T20:22:44.000Z', updatedAt: '2026-10-20T20:22:45.000Z' }], []];
            return [{ affectedRows: 1 }, []];
        },
    });
    const job = await repository.createTrackedJob('owner-a', 'tracker-stamped', { title: 'Analyst', company: 'Acme' });
    assert.equal(job.createdAt, '2026-10-20T20:22:44.000Z');
    assert.equal(job.updatedAt, '2026-10-20T20:22:45.000Z');
});

test('an update keeps the stored interview time on a server that is not on UTC', async () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Asia/Kolkata';
    try {
        assert.equal(new Date(Date.UTC(2026, 0, 1, 0, 0)).getHours(), 5, 'the process now runs in Asia/Kolkata');
        const repository = new MySQLRepository();
        const statements = [];
        // The pool reads DATETIME with timezone 'Z', so a stored 10:30 arrives as 10:30 UTC.
        const storedRow = { ...STORED_ROW, interview_at: new Date(Date.UTC(2026, 9, 24, 10, 30)) };
        repository._withTransaction = callback => callback({
            async query(sql, params) {
                statements.push([sql, params]);
                if (/SELECT \* FROM job_tracker/.test(sql)) return [[storedRow]];
                return [{ affectedRows: 1 }];
            },
        });
        await repository.updateTrackedJob('owner-a', 'tracker-a', { status: 'offer' }, { expectedRevision: 2 });
        const update = statements.find(([sql]) => /UPDATE job_tracker SET/.test(sql));
        assert.equal(update[1][UPDATE_COLUMNS.indexOf('interview_at')], '2026-10-24 10:30:00', 'a stage move must not shift the interview');

        // A time the candidate enters is stored as entered.
        repository._getPool = () => ({
            async query(sql, params) {
                statements.push([sql, params]);
                return /SELECT created_at/.test(sql) ? [[{ createdAt: null, updatedAt: null }], []] : [{ affectedRows: 1 }, []];
            },
        });
        await repository.createTrackedJob('owner-a', 'tracker-ist', { title: 'Analyst', company: 'Acme', interviewAt: '2026-11-03T15:45' });
        const insert = statements.find(([sql]) => /INSERT INTO job_tracker/.test(sql));
        assert.ok(insert[1].includes('2026-11-03 15:45:00'), 'the entered wall-clock time is stored unchanged');
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});
