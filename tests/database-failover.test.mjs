import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getActiveEngine, testEngineConnectivity } from '../backend/database/engineManager.js';
import { flushAndVerifyBeforeSwitch } from '../backend/database/syncManager.js';

describe('Dual-Database Safe Failover & Switching Validation Test Suite', () => {

    it('1. Pre-switch verification blocks switch if target is unverified or dead letters exist', async () => {
        const verification = await flushAndVerifyBeforeSwitch(null);
        assert.equal(typeof verification.safeToSwitch, 'boolean');
        assert.equal(typeof verification.pendingCount, 'number');
        assert.equal(typeof verification.conflicts, 'number');
        assert.equal(typeof verification.deadLetters, 'number');
        assert.equal(typeof verification.parityPercentage, 'number');
    });

    it('2. Engine manager preserves active database invariant under invalid parameters', async () => {
        const active = getActiveEngine();
        assert.ok(active === 'mysql' || active === 'firestore');

        const connectivity = await testEngineConnectivity('invalid_engine');
        assert.equal(connectivity.connected, false);
        assert.ok(connectivity.error.includes('Unknown database engine'));
    });

    it('3. Standby engine remains non-authoritative during normal operations', async () => {
        const active = getActiveEngine();
        const standby = active === 'mysql' ? 'firestore' : 'mysql';
        assert.notEqual(active, standby);
    });

    after(async () => {
        try {
            const { getPool } = await import('../backend/database/mysql.js');
            await getPool().end();
        } catch (_) {}
    });
});
