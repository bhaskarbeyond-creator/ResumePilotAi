'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mutations = require('../services/resilientMutations');
const accountDeletion = require('../services/accountDeletion');
const authority = require('../database/authority');
const fencing = require('../database/fencing');
const ResilientRepository = require('../repositories/ResilientRepository');

function memoryRepo() {
    const store = new Map();
    const key = (type, id) => `${type}:${id}`;
    const repo = {
        store,
        async getCompany(id) { return store.get(key('companies', id)) || null; },
        async saveCompany(id, data) { const rec = { id, ...data }; store.set(key('companies', id), rec); return rec; },
        async deleteCompany(id) { store.delete(key('companies', id)); return true; },
        async getJob(id) { return store.get(key('jobs', id)) || null; },
        async saveJob(id, data) { const rec = { id, ...data }; store.set(key('jobs', id), rec); return rec; },
        async deleteJob(id) { store.delete(key('jobs', id)); return true; },
        async getJobs() {
            return [...store.entries()].filter(([k]) => k.startsWith('jobs:')).map(([, v]) => v);
        },
        async getApplication(id) { return store.get(key('applications', id)) || null; },
        async saveApplication(id, data) { const rec = { id, ...data }; store.set(key('applications', id), rec); return rec; },
        async deleteApplication(id) { store.delete(key('applications', id)); return true; },
        async getApplications(filters = {}) {
            return [...store.entries()].filter(([k]) => k.startsWith('applications:')).map(([, v]) => v)
                .filter((a) => !filters.jobId || a.jobId === filters.jobId)
                .filter((a) => !filters.applicantId || a.applicantId === filters.applicantId || a.userId === filters.applicantId);
        },
        async getDocument(type, id) { return store.get(key(type, id)) || null; },
        async saveDocument(type, id, data) { const rec = { id, ...data }; store.set(key(type, id), rec); return rec; },
        async deleteDocument(type, id) { store.delete(key(type, id)); return true; },
        async listDocuments(type) {
            return [...store.entries()].filter(([k]) => k.startsWith(`${type}:`)).map(([, v]) => v);
        },
        async getUser(id) { return store.get(key('users', id)) || null; },
        async saveUser(id, data) { const rec = { id, ...data }; store.set(key('users', id), rec); return rec; },
        async deleteUser(id) { store.delete(key('users', id)); return true; },
        async getResumes() { return []; },
        async getPortfolios() { return []; },
        async getCovers() { return []; },
        async getCompanies() { return [...store.entries()].filter(([k]) => k.startsWith('companies:')).map(([, v]) => v); },
        async saveNotification() { return true; },
        async recordSecurityAuditLog() { return true; },
        async saveBlogPost(id, data) { const rec = { id, ...data }; store.set(key('blog', id), rec); return rec; },
        async getBlogPosts() { return [...store.entries()].filter(([k]) => k.startsWith('blog:')).map(([, v]) => v); },
        async deleteBlogPost(id) { store.delete(key('blog', id)); return true; },
    };
    return repo;
}

test('company create/update CAS rejects stale revision', async () => {
    const repo = memoryRepo();
    const created = await mutations.createCompany({ repo, employerId: 'emp1', data: { name: 'Acme', industry: 'Tech', size: '10', location: 'NY' }, actorUid: 'emp1' });
    assert.equal(created.revision, 1);
    await assert.rejects(
        () => mutations.updateCompany({ repo, companyId: created.companyId, employerId: 'emp1', expectedRevision: 0, data: { name: 'Acme 2', industry: 'Tech', size: '10', location: 'NY' }, actorUid: 'emp1' }),
        (err) => err.code === 'CAS_CONFLICT'
    );
    const ok = await mutations.updateCompany({ repo, companyId: created.companyId, employerId: 'emp1', expectedRevision: 1, data: { name: 'Acme 2', industry: 'Tech', size: '10', location: 'NY' }, actorUid: 'emp1' });
    assert.equal(ok.revision, 2);
});

test('duplicate job application is refused', async () => {
    const repo = memoryRepo();
    await repo.saveJob('job1', { id: 'job1', employerId: 'emp', title: 'Eng', company: 'Acme', status: 'active', revision: 1, applicationsCount: 0 });
    const first = await mutations.createApplication({
        repo, applicationId: 'u1_job1', job: await repo.getJob('job1'), user: { uid: 'u1' },
        payload: { fullName: 'Ada', applicantName: 'Ada' }, actorUid: 'u1',
    });
    assert.equal(first.revision, 1);
    const job = await repo.getJob('job1');
    await assert.rejects(
        () => mutations.createApplication({
            repo, applicationId: 'u1_job1', job, user: { uid: 'u1' },
            payload: { fullName: 'Ada' }, actorUid: 'u1',
        }),
        (err) => err.code === 'ALREADY_APPLIED'
    );
});

test('application status concurrent CAS: second writer loses', async () => {
    const repo = memoryRepo();
    await repo.saveJob('job1', { id: 'job1', employerId: 'emp', title: 'Eng', status: 'active', revision: 1 });
    await repo.saveApplication('app1', { id: 'app1', jobId: 'job1', userId: 'u1', status: 'pending', revision: 1 });
    const first = await mutations.updateApplicationStatus({
        repo, applicationId: 'app1', employerId: 'emp', status: 'interview', notes: '', expectedStatus: 'pending', expectedRevision: 1, actorUid: 'emp',
    });
    assert.equal(first.revision, 2);
    await assert.rejects(
        () => mutations.updateApplicationStatus({
            repo, applicationId: 'app1', employerId: 'emp', status: 'rejected', notes: '', expectedStatus: 'pending', expectedRevision: 1, actorUid: 'emp2',
        }),
        (err) => err.code === 'APPLICATION_CHANGED'
    );
});

test('CMS ads/reviews/pages survive MariaDB-down via Firestore adapter', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: false, firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    const mysql = memoryRepo();
    const firestore = memoryRepo();
    mysql.saveDocument = async () => { const e = new Error('mysql down'); e.code = 'ECONNREFUSED'; throw e; };
    const repo = new ResilientRepository({ mysqlRepo: mysql, firestoreRepo: firestore });
    const saved = await mutations.createDocument({ repo, entityType: 'ads', data: { name: 'Ad', imageLink: 'https://x.test/a.png', destinationLink: 'https://x.test' }, actorUid: 'admin' });
    assert.ok(firestore.store.has(`ads:${saved.id}`));
});

test('account deletion is durable and idempotent; tombstone prevents silent success with leftovers', async () => {
    const repo = memoryRepo();
    repo.store.set('users:u-del', { id: 'u-del', email: 'x@y.z' });
    const first = await accountDeletion.requestDeletion({ uid: 'u-del', actorUid: 'u-del', repo, identityAdmin: null });
    assert.equal(first.status, 'COMPLETED');
    const second = await accountDeletion.requestDeletion({ uid: 'u-del', actorUid: 'u-del', repo, identityAdmin: null });
    assert.equal(second.duplicate, true);
});

test('manual engine switch is blocked during automatic failover', () => {
    fencing.__resetForTests({ generation: 2, operationalWriteEngine: 'firestore' });
    authority.__resetForTests({
        configuredPrimary: 'mysql',
        operationalWriteEngine: 'firestore',
        mode: 'MARIADB_FAILED_OVER',
        mysqlHealthy: false,
        firestoreHealthy: true,
    });
    assert.throws(() => authority.assertManualSwitchAllowed(), (err) => err.code === 'MANUAL_SWITCH_BLOCKED');
});

test('both engines down never fake a mutation success', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql' });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('firestore', 'write', new Error('down'));
    authority.recordFailure('firestore', 'write', new Error('down'));
    const mysql = memoryRepo();
    const firestore = memoryRepo();
    mysql.saveCompany = async () => { const e = new Error('down'); e.code = 'ECONNREFUSED'; throw e; };
    firestore.saveCompany = async () => { const e = new Error('down'); e.code = 'ECONNREFUSED'; throw e; };
    const repo = new ResilientRepository({ mysqlRepo: mysql, firestoreRepo: firestore });
    await assert.rejects(
        () => mutations.createCompany({ repo, employerId: 'e', data: { name: 'X', industry: 'Y', size: '1', location: 'Z' }, actorUid: 'e' }),
        (err) => err.status === 503 || err.code === 'BOTH_DATABASES_UNAVAILABLE' || err.code === 'ECONNREFUSED'
    );
});
