'use strict';
// Unit test for resilientMutations.createApplication's notifications (P002 C10).
// The repository is an in-memory double that models the MariaDB `notifications`
// table the way MySQLRepository.saveNotification writes it: `id` is the table's
// only key and the write is INSERT … ON DUPLICATE KEY UPDATE, so a second write
// with the same id replaces the first row, owner included. No database, no HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
const { createApplication } = require('../services/resilientMutations');

const sha256 = (...parts) => crypto.createHash('sha256').update(parts.join('\0')).digest('hex');

function repositoryDouble() {
    const notifications = new Map();
    const applications = new Map();
    return {
        notifications,
        rowsFor: (uid) => [...notifications.values()].filter((row) => row.user_id === uid),
        async getApplication(id) { return applications.get(id) || null; },
        async saveApplication(id, record) { applications.set(id, record); return record; },
        async saveJob(_id, record) { return record; },
        async recordSecurityAuditLog() {},
        async saveNotification(userId, id, data) {
            notifications.set(id, { id, user_id: userId, ...data });
            return { id, ...data };
        },
    };
}

// The shape MySQLRepository.getJob returns: the raw `jobs` row (company_name,
// employer_id) plus employerId/companyId aliases. There is no `company` field.
const JOB = Object.freeze({
    id: 'job_c10', title: 'Platform Engineer', company_name: 'Example Test Co',
    employer_id: 'employer-1', employerId: 'employer-1', status: 'active', revision: 1,
});
const CANDIDATE = Object.freeze({ uid: 'candidate-1', email: 'candidate@example.test' });
const APPLICATION_ID = `${CANDIDATE.uid}_${JOB.id}`;

async function apply(repo, job = JOB) {
    return createApplication({
        repo, applicationId: APPLICATION_ID, job, user: CANDIDATE,
        payload: { fullName: 'Avery Tester', applicantName: 'Avery Tester' },
        actorUid: CANDIDATE.uid, requestId: 'req-c10',
    });
}

test('the applicant and the employer each keep their own notification', async () => {
    const repo = repositoryDouble();
    await apply(repo);

    const applicant = repo.rowsFor(CANDIDATE.uid);
    const employer = repo.rowsFor(JOB.employerId);
    assert.equal(applicant.length, 1, 'the applicant has an "Application submitted" row');
    assert.equal(applicant[0].title, 'Application submitted');
    assert.equal(applicant[0].type, 'job_application');
    assert.equal(employer.length, 1, 'the employer has a "New job application" row');
    assert.equal(employer[0].title, 'New job application');
    assert.equal(employer[0].type, 'job_application_received');
    assert.notEqual(applicant[0].id, employer[0].id);
    assert.equal(repo.notifications.size, 2);
});

test('notification ids are deterministic per recipient, and the applicant id is unchanged', async () => {
    const first = repositoryDouble();
    const second = repositoryDouble();
    await apply(first);
    await apply(second);
    assert.deepEqual([...first.notifications.keys()].sort(), [...second.notifications.keys()].sort());
    // Rows already written for applicants keep their id (and so stay idempotent).
    assert.equal(first.rowsFor(CANDIDATE.uid)[0].id, sha256('job_application_submitted', APPLICATION_ID));
    assert.equal(first.rowsFor(CANDIDATE.uid)[0].eventId, first.rowsFor(CANDIDATE.uid)[0].id);
    assert.equal(first.rowsFor(JOB.employerId)[0].eventId, first.rowsFor(JOB.employerId)[0].id);
});

test("the applicant's message names the company from the jobs row", async () => {
    const repo = repositoryDouble();
    await apply(repo);
    const [row] = repo.rowsFor(CANDIDATE.uid);
    assert.equal(row.message, 'Your application for Platform Engineer at Example Test Co was submitted.');
    assert.deepEqual(row.data, { jobId: JOB.id, applicationId: APPLICATION_ID });
});

test('a job without an owner notifies only the applicant', async () => {
    const repo = repositoryDouble();
    const { employerId: _ignored, employer_id: _alsoIgnored, ...ownerless } = JOB;
    await apply(repo, ownerless);
    assert.equal(repo.notifications.size, 1);
    assert.equal(repo.rowsFor(CANDIDATE.uid).length, 1);
});

test('a job with no company name still produces a readable message', async () => {
    const repo = repositoryDouble();
    await apply(repo, { ...JOB, company_name: '' });
    assert.equal(repo.rowsFor(CANDIDATE.uid)[0].message, 'Your application for Platform Engineer at Company was submitted.');
});
