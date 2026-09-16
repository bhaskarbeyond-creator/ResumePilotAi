import test from 'node:test';
import assert from 'node:assert/strict';

import {
    loadResumeDraft,
    createResumeDraft,
    saveResumeDraft,
    writeResumeRecovery,
    readResumeRecovery,
    clearResumeRecovery,
    recoveryKey,
} from '../src/services/resumePersistence.js';
import { normalizeResumeData, EMPTY_RESUME } from '../src/utils/resumeData.js';

// =========================================================================
// MOCK STORAGE IMPLEMENTATION
// =========================================================================
class MockLocalStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }
    setItem(key, value) {
        this.store.set(key, String(value));
    }
    removeItem(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}

// =========================================================================
// TEST SUITE: RESUME LOAD & OFFLINE-FIRST RESILIENCE
// =========================================================================

test('1.1 loadResumeDraft returns null on 404 (not found) without crashing', async () => {
    const mockApi = {
        getResume: async () => {
            const err = new Error('Resume not found');
            err.status = 404;
            throw err;
        }
    };

    const loaded = await loadResumeDraft('user_123', 'non_existent_id', { api: mockApi });
    assert.equal(loaded, null, 'Should return null gracefully on 404');
});

test('1.2 loadResumeDraft rethrows 500 / 503 server errors so caller knows server is unreachable', async () => {
    const mockApi = {
        getResume: async () => {
            const err = new Error('HTTP 503 Service Unavailable');
            err.status = 503;
            throw err;
        }
    };

    await assert.rejects(
        async () => loadResumeDraft('user_123', 'existing_id', { api: mockApi }),
        err => err.status === 503,
        'Should propagate 503 so caller can trigger local recovery'
    );
});

test('1.3 Local recovery envelope preserves resume data across simulated server outages', () => {
    const storage = new MockLocalStorage();
    const userId = 'usr_offline_01';
    const resumeId = 'res_recovery_01';

    const testDraft = normalizeResumeData({
        ...EMPTY_RESUME,
        firstname: 'Ada',
        lastname: 'Lovelace',
        occupation: 'Computer Scientist',
        employments: [
            { id: 1, jobTitle: 'Analytical Engine Architect', employer: 'Babbage Labs', begin: '1842-01' }
        ]
    });

    // Write recovery
    writeResumeRecovery(userId, resumeId, 3, testDraft, storage);

    // Read recovery
    const recovery = readResumeRecovery(userId, resumeId, storage);
    assert.ok(recovery, 'Recovery envelope must exist');
    assert.equal(recovery.userId, userId);
    assert.equal(recovery.resumeId, resumeId);
    assert.equal(recovery.revision, 3);
    assert.equal(recovery.data.firstname, 'Ada');
    assert.equal(recovery.data.employments.length, 1);
    assert.equal(recovery.data.employments[0].jobTitle, 'Analytical Engine Architect');
});

test('1.4 createResumeDraft creates draft and validates size invariants', async () => {
    const mockApi = {
        saveResume: async (id, data) => ({
            id,
            revision: 1,
            ...data
        })
    };

    const draft = await createResumeDraft('usr_999', { firstname: 'Grace', lastname: 'Hopper' }, { resumeId: 'res_grace', api: mockApi });
    assert.equal(draft.id, 'res_grace');
    assert.equal(draft.revision, 1);
    assert.equal(draft.data.firstname, 'Grace');

    // Reject unauthenticated
    await assert.rejects(
        async () => createResumeDraft('', { firstname: 'Anon' }, { api: mockApi }),
        /Authentication is required/
    );
});

test('1.5 Backend /readyz endpoint responds with READY state via HTTP reverse proxy', async () => {
    try {
        const res = await fetch('http://127.0.0.1:8080/readyz');
        assert.equal(res.status, 200, 'Backend /readyz must return 200 OK');
        const json = await res.json();
        assert.equal(json.status, 'ready', 'Backend status must be ready');
        assert.equal(json.authoritativeDatabase, 'MARIADB', 'Authoritative DB must be MARIADB');
        assert.equal(json.checks.mysql.status, 'READY', 'MySQL/MariaDB check must be READY');
    } catch (e) {
        assert.fail(`Backend on port 8080 failed to answer /readyz: ${e.message}`);
    }
});
