'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ResilientRepository = require('../repositories/ResilientRepository');
const authority = require('../database/authority');
const fencing = require('../database/fencing');

function makeRepos() {
    const mysql = new Map();
    const firestore = new Map();
    const adapter = (label, store, failRef) => ({
        async getJob(id) {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            return store.get(`job:${id}`) || null;
        },
        async saveJob(id, data) {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            const rec = { id, revision: Number(data.revision || 1), ...data };
            store.set(`job:${id}`, rec);
            return rec;
        },
        async deleteJob(id) {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            store.delete(`job:${id}`);
            return true;
        },
        async getBlogPosts() {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            return [...store.entries()].filter(([k]) => k.startsWith('blog:')).map(([, v]) => v);
        },
        async saveBlogPost(id, data) {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            const rec = { id, revision: Number(data.revision || 1), ...data };
            store.set(`blog:${id}`, rec);
            return rec;
        },
        async saveCustomPage(id, data) {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            store.set(`page:${id}`, { id, ...data });
            return store.get(`page:${id}`);
        },
        async getCustomPages() {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            return [...store.entries()].filter(([k]) => k.startsWith('page:')).map(([, v]) => v);
        },
        async saveCompany(id, data) {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            store.set(`co:${id}`, { id, ...data });
            return store.get(`co:${id}`);
        },
        async getCompany(id) {
            if (failRef.value) { const e = new Error(`${label} down`); e.code = 'ECONNREFUSED'; throw e; }
            return store.get(`co:${id}`) || null;
        },
    });
    const mysqlFail = { value: false };
    const fsFail = { value: false };
    return {
        mysql, firestore, mysqlFail, fsFail,
        mysqlRepo: adapter('mysql', mysql, mysqlFail),
        firestoreRepo: adapter('firestore', firestore, fsFail),
    };
}

test('CMS blog post write survives Firestore outage via MariaDB', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: false });
    const s = makeRepos();
    s.fsFail.value = true;
    const repo = new ResilientRepository({ mysqlRepo: s.mysqlRepo, firestoreRepo: s.firestoreRepo });
    const saved = await repo.saveBlogPost('post-1', { title: 'Hello', status: 'approved', published: true, revision: 1 });
    assert.equal(saved.id, 'post-1');
    assert.equal(s.mysql.has('blog:post-1'), true);
});

test('job write degrades with a controlled error when MariaDB is down — no Firestore failover', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: false, firestoreHealthy: true });
    authority.recordFailure('mysql', 'write', new Error('down'));
    authority.recordFailure('mysql', 'write', new Error('down'));
    const s = makeRepos();
    s.mysqlFail.value = true;
    const repo = new ResilientRepository({ mysqlRepo: s.mysqlRepo, firestoreRepo: s.firestoreRepo });
    await assert.rejects(
        () => repo.saveJob('job-1', { title: 'Engineer', employerId: 'emp', status: 'pending', revision: 1 }),
        error => error.code === 'SERVICE_DEGRADED' || error.code === 'DATABASE_UNAVAILABLE'
    );
    assert.equal(s.firestore.has('job:job-1'), false, 'Firestore must never receive the write');
});

test('custom page and company writes are repository-mediated', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    const s = makeRepos();
    const repo = new ResilientRepository({ mysqlRepo: s.mysqlRepo, firestoreRepo: s.firestoreRepo });
    await repo.saveCustomPage('about', { title: 'About', published: true });
    await repo.saveCompany('co-1', { name: 'Acme', employerId: 'emp' });
    assert.equal(s.mysql.has('page:about'), true);
    assert.equal(s.mysql.has('co:co-1'), true);
});

test('scheduled CMS publish via repository updates revision monotonically', async () => {
    fencing.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    const s = makeRepos();
    const repo = new ResilientRepository({ mysqlRepo: s.mysqlRepo, firestoreRepo: s.firestoreRepo });
    await repo.saveBlogPost('sched-1', {
        title: 'Later', status: 'scheduled', scheduledAt: '2020-01-01T00:00:00.000Z', revision: 2,
    });
    const posts = await repo.getBlogPosts();
    const due = posts.filter((p) => p.status === 'scheduled' && new Date(p.scheduledAt).getTime() <= Date.now());
    assert.equal(due.length, 1);
    const next = await repo.saveBlogPost('sched-1', { ...due[0], status: 'approved', published: true, revision: 3, scheduledAt: null });
    assert.equal(next.revision, 3);
    assert.equal(next.status, 'approved');
});
