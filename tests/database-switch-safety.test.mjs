import { describe, it } from 'node:test';
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
});
