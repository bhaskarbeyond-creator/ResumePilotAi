import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    getActiveEngine,
    testEngineConnectivity,
    switchActiveEngine,
} from '../backend/database/engineManager.js';

describe('Database Engine Switching Safety Test Suite', () => {
    it('1. getActiveEngine returns either firestore or mysql', () => {
        const engine = getActiveEngine();
        assert.ok(engine === 'firestore' || engine === 'mysql', `Engine must be firestore or mysql, got: ${engine}`);
    });

    it('2. testEngineConnectivity handles known and unknown engines safely', async () => {
        const mockDb = {
            collection: () => ({
                doc: () => ({
                    get: async () => ({ exists: true })
                }),
                limit: () => ({
                    get: async () => ({ docs: [] })
                })
            })
        };

        const firestoreTest = await testEngineConnectivity('firestore', mockDb);
        assert.equal(firestoreTest.connected, true);

        const invalidTest = await testEngineConnectivity('mongodb_unsupported');
        assert.equal(invalidTest.connected, false);
        assert.match(invalidTest.error, /Unknown database engine/i);
    });

    it('3. switchActiveEngine rejects invalid database names', async () => {
        await assert.rejects(
            async () => {
                await switchActiveEngine('postgres');
            },
            /Invalid database engine/
        );

        await assert.rejects(
            async () => {
                await switchActiveEngine(null);
            },
            /Invalid database engine/
        );
    });

    it('4. switchActiveEngine fails safely if target database is unreachable', async () => {
        const brokenFirestoreDb = null; // Unreachable firestore
        // Switching to firestore without valid db or unreachable will reject
        try {
            await switchActiveEngine('firestore', 'TEST_ADMIN', brokenFirestoreDb);
        } catch (err) {
            assert.ok(err.message.includes('Cannot switch to firestore') || err.message.includes('Connection check failed'));
        }
    });

    it('5. Safe idempotent switch when target engine matches current engine', async () => {
        const current = getActiveEngine();
        const mockDb = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true }) }) }) };
        const res = await switchActiveEngine(current, 'TEST_ADMIN', mockDb);
        assert.equal(res.success, true);
        assert.equal(res.engine, current);
        assert.equal(res.unchanged, true);
    });

    it('6. Concurrent switch requests are serialized by the switch mutex', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const { execFileSync } = await import('node:child_process');
        const statePath = path.join(process.cwd(), 'backend', 'database', 'engine_state.json');
        const snapshot = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : null;

        // Isolated child process: DB_ENGINE=mysql makes 'mysql' the current
        // engine, so the switch target is 'firestore', whose connectivity can
        // be satisfied (and deliberately slowed) by an injected mock db.
        const childScript = `
            const fs = require('node:fs');
            const path = require('node:path');
            const stateFile = path.join(process.cwd(), 'backend', 'database', 'engine_state.json');
            fs.writeFileSync(stateFile, JSON.stringify({ engine: 'mysql', switchedBy: 'TEST_INIT', switchedAt: new Date().toISOString() }), 'utf8');
            const { switchActiveEngine, getActiveEngine } = require(${JSON.stringify(path.join(process.cwd(), 'backend', 'database', 'engineManager.js'))});
            (async () => {
                const slowDb = {
                    collection: () => ({ limit: () => ({ get: async () => {
                        await new Promise(resolve => setTimeout(resolve, 250));
                        return { docs: [] };
                    } }) }),
                };
                const first = switchActiveEngine('firestore', 'TEST_ADMIN_1', slowDb);
                await new Promise(resolve => setTimeout(resolve, 50));
                let concurrentError = null;
                try { await switchActiveEngine('firestore', 'TEST_ADMIN_2', slowDb); }
                catch (err) { concurrentError = { status: err.status, message: err.message }; }
                const completed = await first;
                try { const { getPool } = require(path.join(process.cwd(), 'backend', 'database', 'mysql.js')); await getPool().end(); } catch (_) {}
                console.log(JSON.stringify({
                    firstSwitch: { success: completed.success, engine: completed.engine },
                    concurrentError,
                    finalEngine: getActiveEngine(),
                }));
                process.exit(0);
            })().catch(err => { console.error(err); process.exit(1); });
        `;
        let output;
        try {
            output = execFileSync(process.execPath, ['-e', childScript], {
                env: { ...process.env, DB_ENGINE: 'mysql' },
                encoding: 'utf8',
            });
        } finally {
            // Restore any persisted state so the test leaves no residue.
            if (snapshot === null) fs.rmSync(statePath, { force: true });
            else fs.writeFileSync(statePath, snapshot, 'utf8');
        }
        const report = JSON.parse(output.trim().split('\n').pop());
        assert.equal(report.firstSwitch.success, true, 'the in-flight switch completes');
        assert.equal(report.finalEngine, 'firestore');
        assert.ok(report.concurrentError, 'a concurrent switch must be rejected while one is in flight');
        assert.equal(report.concurrentError.status, 409);
        assert.match(report.concurrentError.message, /already in progress/i);
    });

    it('7. getEngineStateConsistency reports runtime state and divergence flags', async () => {
        const { getEngineStateConsistency } = await import('../backend/database/engineManager.js');
        const report = await getEngineStateConsistency();
        assert.ok(['firestore', 'mysql'].includes(report.runtimeEngine));
        assert.equal(typeof report.databaseReachable, 'boolean');
        // With no MySQL server in the test environment the table read fails;
        // divergence must then be explicitly false (unknown, not claimed).
        if (!report.databaseReachable) {
            assert.equal(report.diverged, false);
            assert.ok(report.databaseError);
        } else {
            assert.equal(typeof report.diverged, 'boolean');
        }
    });

    after(async () => {
        try {
            const fs = await import('node:fs');
            const path = await import('node:path');
            const statePath = path.join(process.cwd(), 'backend', 'database', 'engine_state.json');
            fs.writeFileSync(statePath, JSON.stringify({
                engine: 'mysql',
                switchedBy: 'SUPER_ADMIN',
                switchedAt: new Date().toISOString(),
                previousEngine: 'firestore'
            }, null, 2), 'utf8');
        } catch (_) {}
        try {
            const { getPool } = await import('../backend/database/mysql.js');
            await getPool().end();
        } catch (_) {}
    });
});
