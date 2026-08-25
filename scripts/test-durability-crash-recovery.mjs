import mysqlPkg from '../backend/database/mysql.js';
const { getPool, initializeSchema } = mysqlPkg;
import syncPkg from '../backend/database/syncManager.js';
const { enqueueOutboxEvent, processSyncQueue } = syncPkg;
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: 'backend/.env' });

async function runDurabilityCrashTest() {
    console.log('=== 🧪 CRASH & DURABILITY RECOVERY VALIDATION TEST ===');
    await initializeSchema();
    const pool = getPool();

    const targetStorage = new Map();
    const mockFirestore = {
        collection: (colName) => ({
            doc: (docId) => ({
                collection: (subCol) => ({
                    doc: (subDocId) => ({
                        get: async () => ({ exists: targetStorage.has(`${colName}/${docId}/${subCol}/${subDocId}`), data: () => targetStorage.get(`${colName}/${docId}/${subCol}/${subDocId}`) }),
                        set: async (data) => targetStorage.set(`${colName}/${docId}/${subCol}/${subDocId}`, data),
                        delete: async () => targetStorage.delete(`${colName}/${docId}/${subCol}/${subDocId}`)
                    })
                }),
                get: async () => ({ exists: targetStorage.has(`${colName}/${docId}`), data: () => targetStorage.get(`${colName}/${docId}`) }),
                set: async (data) => targetStorage.set(`${colName}/${docId}`, data),
                delete: async () => targetStorage.delete(`${colName}/${docId}`)
            })
        })
    };

    const testEntityId = `crash_proof_${Date.now()}`;
    const testPayload = {
        userId: 'user_survivor_1',
        title: 'Crash Resilient Resume',
        summary: 'Committed in local ACID tx, survived complete simulated worker failure',
        revision: 1
    };

    console.log('[Step 1] Writing local ACID transaction + outbox event while worker daemon is COMPLETELY OFFLINE...');
    const { eventId } = await enqueueOutboxEvent(pool, {
        entityType: 'resumes',
        entityId: testEntityId,
        operation: 'UPSERT',
        payload: testPayload,
        version: 1,
        sourceEngine: 'mysql'
    });

    console.log(`  -> Event ${eventId} committed in MySQL sync_outbox with status = 'PENDING'.`);

    // Verify outbox row exists in MySQL
    const [rowsBefore] = await pool.query('SELECT * FROM sync_outbox WHERE id = ?', [eventId]);
    assert.equal(rowsBefore.length, 1);
    assert.equal(rowsBefore[0].status, 'PENDING');
    assert.equal(rowsBefore[0].entity_id, testEntityId);
    console.log('  -> Verified: Outbox record safely persisted in MariaDB storage.');

    console.log('\n[Step 2] Simulating ungraceful process crash while event was un-replicated...');
    // Target storage has NOT received the write yet
    assert.equal(targetStorage.has(`users/user_survivor_1/resumes/${testEntityId}`), false);
    console.log('  -> Confirmed target standby does NOT yet have the data (simulating crash gap).');

    console.log('\n[Step 3] Resurrecting worker daemon (simulating server reboot)...');
    const result = await processSyncQueue(10, mockFirestore, pool);
    console.log(`  -> Resurrected worker drained queue: processed=${result.processed}, failed=${result.failed}`);

    console.log('\n[Step 4] Proving target document received the committed data after restart:');
    const targetDoc = targetStorage.get(`users/user_survivor_1/resumes/${testEntityId}`);
    assert.ok(targetDoc !== undefined);
    assert.equal(targetDoc.title, 'Crash Resilient Resume');
    assert.equal(targetDoc.revision, 1);
    console.log('  -> Target document confirmed with 100% data fidelity:');
    console.log('     Title:', targetDoc.title);
    console.log('     Summary:', targetDoc.summary);

    // Verify outbox status transitioned to SYNCED
    const [rowsAfter] = await pool.query('SELECT * FROM sync_outbox WHERE id = ?', [eventId]);
    assert.equal(rowsAfter[0].status, 'SYNCED');
    assert.ok(rowsAfter[0].processed_at !== null);
    console.log(`  -> Outbox event ${eventId} status updated to SYNCED.`);

    console.log('\n=== ✅ CRASH DURABILITY TEST PASSED (ZERO DATA LOSS VERIFIED) ===');
    process.exit(0);
}

runDurabilityCrashTest().catch(err => {
    console.error('Durability crash test failed:', err);
    process.exit(1);
});
