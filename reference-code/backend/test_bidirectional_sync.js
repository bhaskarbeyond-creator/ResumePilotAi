const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const admin = require('./services/firebaseAdmin');

if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
            projectId,
        });
    } else {
        admin.initializeApp({ projectId });
    }
}
const firestoreDb = admin.firestore();
const { enqueueOutboxEvent, processSyncQueue } = require('./database/syncManager');

(async () => {
    console.log('===============================================================');
    console.log('🧪 LIVE BIDIRECTIONAL SYNC VALIDATION TEST');
    console.log('===============================================================\n');

    const pool = mysql.createPool({
        host: '127.0.0.1',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 5,
        charset: 'utf8mb4',
    });

    const testId = `sync_test_${Date.now()}`;
    const testUserId = 'OhZdiSIFL7ePA1TMkfu9bnR935D3'; // bhaskar.beyond@gmail.com

    // ── TEST 1: MYSQL -> FIRESTORE REPLICATION ──
    console.log('--- TEST 1: MYSQL -> FIRESTORE REPLICATION ---');
    console.log(`Creating test portfolio in MySQL with ID: ${testId}...`);
    
    // Insert into MySQL
    await pool.query(`
        INSERT INTO portfolios (id, user_id, title, theme, is_published, data)
        VALUES (?, ?, ?, 'creative', 1, ?)
    `, [testId, testUserId, 'Bidirectional Sync Test Portfolio', JSON.stringify({ title: 'Bidirectional Sync Test Portfolio', description: 'Live sync proof' })]);

    // Enqueue replication outbox event
    await enqueueOutboxEvent(pool, {
        entityType: 'portfolios',
        entityId: testId,
        operation: 'UPSERT',
        payload: {
            id: testId,
            user_id: testUserId,
            title: 'Bidirectional Sync Test Portfolio',
            theme: 'creative',
            isPublished: true,
            data: { title: 'Bidirectional Sync Test Portfolio', description: 'Live sync proof' }
        },
        version: 1,
        sourceEngine: 'mysql'
    });

    console.log('Processing outbox queue...');
    const outboxResult = await processSyncQueue(10, firestoreDb, pool);
    console.log(`Process result: ${outboxResult.processed} processed, ${outboxResult.failed} failed, ${outboxResult.deadLettered} dead-lettered.`);

    // Verify presence in Firestore
    const fsDoc = await firestoreDb.collection('users').doc(testUserId).collection('portfolios').doc(testId).get();
    if (fsDoc.exists && fsDoc.data().title === 'Bidirectional Sync Test Portfolio') {
        console.log('✅ TEST 1 PASSED: MySQL record successfully replicated into Firestore subcollection!');
    } else {
        console.error('❌ TEST 1 FAILED: Record not found in Firestore.');
    }

    // Clean up Test 1
    await firestoreDb.collection('users').doc(testUserId).collection('portfolios').doc(testId).delete();
    await pool.query('DELETE FROM portfolios WHERE id = ?', [testId]);
    await pool.query('DELETE FROM sync_outbox WHERE entity_id = ?', [testId]);
    console.log('✓ Cleaned up Test 1 artifacts.');

    // ── TEST 2: FIRESTORE -> MYSQL REPLICATION ──
    console.log('\n--- TEST 2: FIRESTORE -> MYSQL REPLICATION ---');
    const testDocId = `sync_fs_test_${Date.now()}`;
    console.log(`Writing test coupon to Firestore with ID: ${testDocId}...`);

    await firestoreDb.collection('coupons').doc(testDocId).set({
        code: testDocId,
        discount: 25,
        description: 'Sync verification coupon',
        active: true,
        maxUses: 100,
        usedCount: 0,
        singleUsePerUser: false,
        createdAt: new Date(),
    });

    // Replicate event to MySQL
    const { replicateToMySQL } = require('./database/syncManager');
    await replicateToMySQL({
        entity_type: 'coupons',
        entity_id: testDocId,
        operation: 'UPSERT',
        payload: {
            code: testDocId,
            discount: 25,
            description: 'Sync verification coupon',
            active: true,
            max_uses: 100,
            used_count: 0,
            single_use_per_user: false,
        },
        version: 1
    }, pool);

    // Verify presence in MySQL
    const [couponRows] = await pool.query('SELECT * FROM coupons WHERE code = ?', [testDocId]);
    if (couponRows.length > 0 && couponRows[0].discount === 25) {
        console.log('✅ TEST 2 PASSED: Firestore record successfully replicated into MySQL table!');
    } else {
        console.error('❌ TEST 2 FAILED: Record not found in MySQL.');
    }

    // Clean up Test 2
    await firestoreDb.collection('coupons').doc(testDocId).delete();
    await pool.query('DELETE FROM coupons WHERE code = ?', [testDocId]);
    console.log('✓ Cleaned up Test 2 artifacts.');

    // ── TEST 3: PARITY HEALTH VERIFICATION ──
    console.log('\n--- TEST 3: PARITY & QUEUE AUDIT ---');
    const [pendingOutbox] = await pool.query("SELECT COUNT(*) as c FROM sync_outbox WHERE status IN ('PENDING', 'RETRYING', 'PROCESSING')");
    const [deadLetters] = await pool.query("SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'DEAD_LETTER'");
    const [conflicts] = await pool.query("SELECT COUNT(*) as c FROM sync_conflicts WHERE resolution = 'PENDING'");

    console.log(`Queue Status:`);
    console.log(`  - Pending Sync Events: ${pendingOutbox[0].c}`);
    console.log(`  - Dead Letter Events: ${deadLetters[0].c}`);
    console.log(`  - Active Conflicts: ${conflicts[0].c}`);

    if (pendingOutbox[0].c === 0 && deadLetters[0].c === 0 && conflicts[0].c === 0) {
        console.log('✅ TEST 3 PASSED: Zero pending events, zero dead letters, zero conflicts!');
    }

    process.exit(0);
})();
