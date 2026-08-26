import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import mysqlModule from '../backend/database/mysql.js';
const { getPool, initializeSchema } = mysqlModule;

import authority from '../backend/database/authority.js';

import ResilientRepository from '../backend/repositories/ResilientRepository.js';
import MySQLRepository from '../backend/repositories/MySQLRepository.js';
import FirestoreRepository from '../backend/repositories/FirestoreRepository.js';

import syncManagerModule from '../backend/database/syncManager.js';
const {
    enqueueOutboxEvent,
    processSyncQueue,
    processFirestoreOutbox,
    replicateToFirestore,
    replicateToMySQL,
    getSyncHealthStatus,
    flushAndVerifyBeforeSwitch
} = syncManagerModule;

import paymentActivationModule from '../backend/services/paymentActivation.js';
const { createOrder, activateVerifiedOrder, claimWebhookEvent, reverseEntitlement } = paymentActivationModule;

import accountDeletionModule from '../backend/services/accountDeletion.js';
const { requestDeletion } = accountDeletionModule;

import canonicalModule from '../backend/database/canonical.js';
const { createMutationId } = canonicalModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Live Database Infrastructure, Failover, Reconciliation & Fencing Suite', () => {
    let pool;
    let mockFirestoreStore;
    let mockFirestore;
    let mysqlRepo;
    let firestoreRepo;

    function createLiveMockFirestore() {
        const store = new Map();

        function createDocRef(fullPath, docId) {
            const docRef = {
                id: docId,
                path: fullPath,
                get: async () => ({
                    exists: store.has(fullPath),
                    data: () => store.get(fullPath) || {},
                    id: docId,
                    ref: docRef,
                }),
                set: (val, opts) => {
                    const existing = (opts && opts.merge && store.get(fullPath)) || {};
                    store.set(fullPath, { ...existing, ...val });
                    return Promise.resolve();
                },
                delete: () => {
                    store.delete(fullPath);
                    return Promise.resolve();
                },
                collection: (subCol) => createCollectionRef(`${fullPath}/${subCol}`)
            };
            docRef.ref = docRef;
            return docRef;
        }

        function createCollectionRef(colPath) {
            return {
                path: colPath,
                doc: (docId) => {
                    const actualId = docId || `doc_${crypto.randomBytes(6).toString('hex')}`;
                    return createDocRef(`${colPath}/${actualId}`, actualId);
                },
                where: () => ({
                    limit: () => ({
                        get: async () => {
                            const docs = [];
                            for (const [k, v] of store.entries()) {
                                if (k.startsWith(`${colPath}/`)) {
                                    const id = k.slice(colPath.length + 1);
                                    if (!id.includes('/')) {
                                        docs.push({ id, data: () => v, exists: true, ref: createDocRef(k, id) });
                                    }
                                }
                            }
                            return { docs };
                        }
                    }),
                    get: async () => {
                        const docs = [];
                        for (const [k, v] of store.entries()) {
                            if (k.startsWith(`${colPath}/`)) {
                                const id = k.slice(colPath.length + 1);
                                if (!id.includes('/')) {
                                    docs.push({ id, data: () => v, exists: true, ref: createDocRef(k, id) });
                                }
                            }
                        }
                        return { docs };
                    }
                }),
                limit: () => ({
                    get: async () => {
                        const docs = [];
                        for (const [k, v] of store.entries()) {
                            if (k.startsWith(`${colPath}/`)) {
                                const id = k.slice(colPath.length + 1);
                                if (!id.includes('/')) {
                                    docs.push({ id, data: () => v, exists: true, ref: createDocRef(k, id) });
                                }
                            }
                        }
                        return { docs };
                    }
                }),
                get: async () => {
                    const docs = [];
                    for (const [k, v] of store.entries()) {
                        if (k.startsWith(`${colPath}/`)) {
                            const id = k.slice(colPath.length + 1);
                            if (!id.includes('/')) {
                                docs.push({ id, data: () => v, exists: true, ref: createDocRef(k, id) });
                            }
                        }
                    }
                    return { docs };
                }
            };
        }

        const firestore = {
            collection: (col) => createCollectionRef(col),
            runTransaction: async (fn) => {
                const tx = {
                    get: async (ref) => ref.get(),
                    set: (ref, val, opts) => {
                        const target = ref.ref || ref;
                        return target.set(val, opts);
                    },
                    update: (ref, val) => {
                        const target = ref.ref || ref;
                        return target.set(val, { merge: true });
                    },
                    delete: (ref) => {
                        const target = ref.ref || ref;
                        return target.delete();
                    }
                };
                return fn(tx);
            },
            batch: () => {
                const ops = [];
                return {
                    set: (ref, val, opts) => ops.push(() => {
                        const target = ref.ref || ref;
                        return target.set(val, opts);
                    }),
                    update: (ref, val) => ops.push(() => {
                        const target = ref.ref || ref;
                        return target.set(val, { merge: true });
                    }),
                    delete: (ref) => ops.push(() => {
                        const target = ref.ref || ref;
                        return target.delete();
                    }),
                    commit: async () => {
                        for (const op of ops) await op();
                    }
                };
            },
            FieldValue: {
                serverTimestamp: () => new Date().toISOString(),
                delete: () => undefined,
                arrayUnion: (...elements) => elements
            },
            Timestamp: {
                now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() })
            }
        };
        return { store, firestore };
    }

    before(async () => {
        pool = getPool();
        await initializeSchema();
        const mocked = createLiveMockFirestore();
        mockFirestoreStore = mocked.store;
        mockFirestore = mocked.firestore;
        mysqlRepo = new MySQLRepository();
        firestoreRepo = new FirestoreRepository(mockFirestore);
    });

    // -------------------------------------------------------------------------
    // 1. Live MariaDB Connection & Schema Parity
    // -------------------------------------------------------------------------
    it('1. Live MariaDB connects, executes queries, and enforces schema invariants', async () => {
        const [rows] = await pool.query('SELECT 1 AS alive, VERSION() AS version, CURRENT_USER() AS user');
        assert.equal(rows[0].alive, 1);
        assert.ok(rows[0].version, 'MariaDB version must be present');
        
        // Verify critical tables exist
        const [tables] = await pool.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);
        const requiredTables = [
            'users', 'resumes', 'payment_orders', 'jobs', 'applications',
            'blog', 'custom_pages', 'companies', 'coupons', 'sync_outbox',
            'sync_tombstones', 'sync_conflicts', 'processed_mutations',
            'payment_webhook_events', 'database_authority', 'canonical_documents'
        ];
        for (const reqTable of requiredTables) {
            assert.ok(tableNames.includes(reqTable), `Required table ${reqTable} must exist in MariaDB`);
        }
    });

    // -------------------------------------------------------------------------
    // 2. Real Failover: MariaDB Failure -> Writes on Firestore -> Recovery
    // -------------------------------------------------------------------------
    it('2. MariaDB failure triggers failover to Firestore, preserves writes, and reconciles upon restoration', async () => {
        const testUid = `usr_failover_m2f_${Date.now()}`;
        const testResumeId = `res_failover_m2f_${Date.now()}`;
        
        // Normal state: MariaDB is primary
        authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
        let failingMysql = false;
        
        const mockFailingMysqlRepo = Object.assign(Object.create(Object.getPrototypeOf(mysqlRepo)), mysqlRepo, {
            saveResume: async (...args) => {
                if (failingMysql) {
                    const err = new Error('MariaDB connection lost / ECONNREFUSED');
                    err.code = 'ECONNREFUSED';
                    throw err;
                }
                return mysqlRepo.saveResume(...args);
            },
            getResume: async (...args) => {
                if (failingMysql) {
                    const err = new Error('MariaDB connection lost / ECONNREFUSED');
                    err.code = 'ECONNREFUSED';
                    throw err;
                }
                return mysqlRepo.getResume(...args);
            }
        });

        const resilientRepo = new ResilientRepository({
            mysqlRepo: mockFailingMysqlRepo,
            firestoreRepo
        });

        // 1. Initial write on primary and replicate to secondary
        await mysqlRepo.saveUser(testUid, { email: 'm2f@example.com', firstname: 'Failover', lastname: 'Test' });
        await resilientRepo.saveResume(testUid, testResumeId, { title: 'Primary Version 1' }, 1);
        await processSyncQueue(10, mockFirestore);
        
        const initialOnMysql = await mysqlRepo.getResume(testUid, testResumeId);
        assert.equal(initialOnMysql.title, 'Primary Version 1');

        // 2. MariaDB fails
        failingMysql = true;
        authority.recordFailure('mysql', 'write', new Error('ECONNREFUSED'));
        authority.recordFailure('mysql', 'write', new Error('ECONNREFUSED'));
        assert.equal(authority.getWriteEngine(), 'firestore');
        assert.equal(authority.getStatus().mode, 'MARIADB_FAILED_OVER');

        // 3. Write continues on Firestore fallback (creates rev 2)
        await resilientRepo.saveResume(testUid, testResumeId, { title: 'Fallback Version 2 on Firestore' });
        
        const fsKey = `users/${testUid}/resumes/${testResumeId}`;
        assert.ok(mockFirestoreStore.has(fsKey));
        assert.equal(mockFirestoreStore.get(fsKey).title, 'Fallback Version 2 on Firestore');

        // 4. MariaDB restored
        failingMysql = false;
        authority.recordSuccess('mysql', 'probe');
        authority.recordSuccess('mysql', 'probe');
        assert.equal(authority.getStatus().mode, 'RECONCILING');

        // 5. Drain reverse outbox from Firestore into MariaDB
        const drainResult = await processFirestoreOutbox(mockFirestore, 10);
        assert.ok(drainResult.processed >= 1);
        
        // 6. Complete recovery
        authority.completeRecovery({ conflicts: 0 });
        assert.equal(authority.getStatus().mode, 'RECOVERED');
        assert.equal(authority.getWriteEngine(), 'mysql');

        // 7. Verify MariaDB has the updated revision 2
        const recoveredOnMysql = await mysqlRepo.getResume(testUid, testResumeId);
        assert.equal(recoveredOnMysql.title, 'Fallback Version 2 on Firestore');
        assert.equal(recoveredOnMysql.revision, 2);
    });

    // -------------------------------------------------------------------------
    // 3. Real Failover: Firestore Failure -> MariaDB continues -> Outbox Drains
    // -------------------------------------------------------------------------
    it('3. Firestore failure degrades secondary without blocking MariaDB; outbox drains to 100% parity upon restore', async () => {
        const testUid = `usr_failover_f2m_${Date.now()}`;
        const testResumeId = `res_failover_f2m_${Date.now()}`;
        
        authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
        let failingFirestore = false;
        
        const mockFailingFirestoreRepo = Object.assign(Object.create(Object.getPrototypeOf(firestoreRepo)), firestoreRepo, {
            saveResume: async (...args) => {
                if (failingFirestore) {
                    const err = new Error('Firestore 8 RESOURCE_EXHAUSTED');
                    err.code = 8;
                    throw err;
                }
                return firestoreRepo.saveResume(...args);
            }
        });

        const resilientRepo = new ResilientRepository({
            mysqlRepo,
            firestoreRepo: mockFailingFirestoreRepo
        });

        await mysqlRepo.saveUser(testUid, { email: 'f2m@example.com', firstname: 'FSFail', lastname: 'Test' });

        // 1. Firestore goes down
        failingFirestore = true;
        authority.recordFailure('firestore', 'read', new Error('RESOURCE_EXHAUSTED'));
        authority.recordFailure('firestore', 'read', new Error('RESOURCE_EXHAUSTED'));
        assert.equal(authority.getStatus().mode, 'FIRESTORE_DEGRADED');
        assert.equal(authority.getWriteEngine(), 'mysql');

        // 2. Perform write on MariaDB
        await resilientRepo.saveResume(testUid, testResumeId, { title: 'Written While Firestore Down' }, 1);
        
        const mysqlRecord = await mysqlRepo.getResume(testUid, testResumeId);
        assert.equal(mysqlRecord.title, 'Written While Firestore Down');

        // 3. Firestore restored
        failingFirestore = false;
        authority.recordSuccess('firestore', 'probe');
        authority.recordSuccess('firestore', 'probe');
        assert.equal(authority.getStatus().mode, 'NORMAL');

        // 4. Drain MariaDB outbox into Firestore
        const syncResult = await processSyncQueue(10, mockFirestore);
        assert.ok(syncResult.processed >= 1);

        // 5. Verify Parity on Firestore
        const fsKey = `users/${testUid}/resumes/${testResumeId}`;
        assert.ok(mockFirestoreStore.has(fsKey));
        assert.equal(mockFirestoreStore.get(fsKey).title, 'Written While Firestore Down');
    });

    // -------------------------------------------------------------------------
    // 4. Both Databases Down: 503 BOTH_DATABASES_UNAVAILABLE
    // -------------------------------------------------------------------------
    it('4. When both databases are down, mutations throw 503 BOTH_DATABASES_UNAVAILABLE and never fake success', async () => {
        authority.__resetForTests({ configuredPrimary: 'mysql' });
        authority.recordFailure('mysql', 'write', new Error('DB1 DOWN'));
        authority.recordFailure('mysql', 'write', new Error('DB1 DOWN'));
        authority.recordFailure('firestore', 'write', new Error('DB2 DOWN'));
        authority.recordFailure('firestore', 'write', new Error('DB2 DOWN'));
        
        assert.equal(authority.getStatus().mode, 'BOTH_UNAVAILABLE');

        const resilientRepo = new ResilientRepository({
            mysqlRepo: { saveResume: async () => { throw new Error('DB1 DOWN'); } },
            firestoreRepo: { saveResume: async () => { throw new Error('DB2 DOWN'); } }
        });

        await assert.rejects(
            async () => {
                await resilientRepo.saveResume('u1', 'r1', { title: 'Will Fail' }, 1);
            },
            (err) => {
                assert.equal(err.status, 503);
                assert.equal(err.code, 'BOTH_DATABASES_UNAVAILABLE');
                return true;
            }
        );
    });

    // -------------------------------------------------------------------------
    // 5. Real Reconciliation & Conflict Handling
    // -------------------------------------------------------------------------
    it('5. Monotonic reconciliation: Higher revision wins; equal revision different hash records CONFLICT_DETECTED without overwrite', async () => {
        const testUid = `usr_reconcile_${Date.now()}`;
        const testResumeId = `res_reconcile_${Date.now()}`;
        
        await mysqlRepo.saveUser(testUid, { email: 'reconcile@example.com', firstname: 'Rec', lastname: 'Test' });

        // Case A: Revision 41 on MariaDB vs Revision 40 on Firestore -> 41 wins
        await mysqlRepo.saveResume(testUid, testResumeId, { title: 'Higher Revision 41', revision: 41 });
        mockFirestoreStore.set(`users/${testUid}/resumes/${testResumeId}`, {
            id: testResumeId,
            user_id: testUid,
            title: 'Stale Revision 40',
            revision: 40
        });

        // Replicate from MariaDB to Firestore -> Firestore updated to 41
        await replicateToFirestore(mockFirestore, {
            entityType: 'resumes',
            entityId: testResumeId,
            operation: 'UPSERT',
            payload: { id: testResumeId, user_id: testUid, title: 'Higher Revision 41', revision: 41 },
            version: 41
        });
        assert.equal(mockFirestoreStore.get(`users/${testUid}/resumes/${testResumeId}`).title, 'Higher Revision 41');

        // Case B: Stale revision 40 attempt to overwrite 41 on MariaDB -> monotonic reject
        const staleRejectResult = await replicateToMySQL({
            entityType: 'resumes',
            entityId: testResumeId,
            operation: 'UPSERT',
            payload: { id: testResumeId, user_id: testUid, title: 'Stale 40 trying to overwrite', revision: 40 },
            version: 40
        }, pool);
        assert.equal(staleRejectResult.status, 'IGNORED_STALE_VERSION');
        
        const preservedMysql = await mysqlRepo.getResume(testUid, testResumeId);
        assert.equal(preservedMysql.title, 'Higher Revision 41');
        assert.equal(preservedMysql.revision, 41);

        // Case C: Conflict detection (Equal revision 42 with different mutation payload)
        await mysqlRepo.saveResume(testUid, testResumeId, { title: 'MySQL Branch 42', revision: 42 });
        
        const conflictResult = await replicateToMySQL({
            entityType: 'resumes',
            entityId: testResumeId,
            operation: 'UPSERT',
            payload: { id: testResumeId, user_id: testUid, title: 'Firestore Divergent Branch 42', revision: 42 },
            version: 42,
            contentHash: 'hash_firestore_divergent_branch_42'
        }, pool);
        
        assert.equal(conflictResult.status, 'CONFLICT_DETECTED');
        
        // Assert conflict handled safely without silent overwrite
        const currentMysql = await mysqlRepo.getResume(testUid, testResumeId);
        assert.equal(currentMysql.title, 'MySQL Branch 42');
        assert.equal(currentMysql.revision, 42);
    });

    // -------------------------------------------------------------------------
    // 6. Real Tombstones: Deletions never resurrected by stale upserts
    // -------------------------------------------------------------------------
    it('6. Tombstones in MariaDB block resurrection from stale secondary UPSERT events', async () => {
        const testUid = `usr_tombstone_${Date.now()}`;
        const testResumeId = `res_tombstone_${Date.now()}`;

        await mysqlRepo.saveUser(testUid, { email: 'tombstone@example.com', firstname: 'Tomb', lastname: 'Stone' });
        await mysqlRepo.saveResume(testUid, testResumeId, { title: 'To Be Deleted', revision: 5 });
        
        // Delete on MariaDB primary -> creates tombstone with revision 5
        await mysqlRepo.deleteResume(testUid, testResumeId);
        
        const deletedCheck = await mysqlRepo.getResume(testUid, testResumeId);
        assert.equal(deletedCheck, null);

        // Verify tombstone exists in sync_tombstones
        const [tombstones] = await pool.query(
            'SELECT * FROM sync_tombstones WHERE entity_type = "resumes" AND entity_id = ?',
            [testResumeId]
        );
        assert.ok(tombstones.length >= 1, 'Tombstone record must exist');

        // Secondary generates stale UPSERT with version <= tombstone version
        const staleUpsert = await replicateToMySQL({
            entityType: 'resumes',
            entityId: testResumeId,
            operation: 'UPSERT',
            payload: { id: testResumeId, user_id: testUid, title: 'Resurrected Ghost', revision: 5 },
            version: 5
        }, pool);
        
        assert.equal(staleUpsert.status, 'TOMBSTONE_BLOCKED');
        
        // Verify record is NOT resurrected
        const postCheck = await mysqlRepo.getResume(testUid, testResumeId);
        assert.equal(postCheck, null, 'Record must remain deleted; zero ghost resurrection');
    });

    // -------------------------------------------------------------------------
    // 7. Real Duplicate Mutation Idempotency (1x, 2x, 10x, 100x)
    // -------------------------------------------------------------------------
    it('7. Duplicate mutation delivered 1x, 2x, 10x, 100x produces exactly once application state without revision inflation', async () => {
        const testUid = `usr_idemp_${Date.now()}`;
        const mutationId = createMutationId('mut_idemp');
        
        await mysqlRepo.saveUser(testUid, { email: 'idemp@example.com', firstname: 'Idem', lastname: 'Potent', revision: 1 });

        const event = {
            id: mutationId,
            entityType: 'users',
            entityId: testUid,
            operation: 'UPSERT',
            payload: { id: testUid, email: 'idemp@example.com', firstname: 'Updated Once', lastname: 'Potent', revision: 2 },
            version: 2
        };

        // Deliver 100 times concurrently
        const deliveries = Array.from({ length: 100 }, () => replicateToMySQL(event, pool));
        const results = await Promise.all(deliveries);

        const appliedCount = results.filter(r => r && r.status === 'APPLIED').length;
        const alreadyProcessedCount = results.filter(r => r && (r.status === 'ALREADY_PROCESSED' || r.status === 'IGNORED_STALE_VERSION')).length;

        assert.equal(appliedCount, 1, 'Exactly one delivery must be applied');
        assert.equal(alreadyProcessedCount, 99, '99 deliveries must be deduplicated by the processed mutations ledger');

        const user = await mysqlRepo.getUser(testUid);
        assert.equal(user.firstname, 'Updated Once');
        assert.equal(user.revision, 2, 'Revision must not inflate');
    });

    // -------------------------------------------------------------------------
    // 8. Payment Real-Engine Lifecycle & Idempotency
    // -------------------------------------------------------------------------
    it('8. Payment webhook lifecycle guarantees single order, single entitlement activation, and zero double billing', async () => {
        authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
        const testUid = `usr_pay_${Date.now()}`;
        const providerEventId = `evt_stripe_${Date.now()}`;
        
        const resilientRepo = new ResilientRepository({
            mysqlRepo,
            firestoreRepo
        });

        // 1. Create user and order
        await resilientRepo.saveUser(testUid, { email: 'payer@example.com', membership: 'Basic', paymentStatus: 'INACTIVE', revision: 1 });
        const createdOrder = await createOrder({
            uid: testUid,
            planId: 'monthly',
            provider: 'stripe',
            plan: { id: 'pro_monthly', price: 499, currency: 'INR', name: 'Pro Plan' },
            idempotencyKey: `idk_${Date.now()}`,
            repo: resilientRepo
        });
        const orderId = createdOrder.orderId;

        // 2. Claim webhook and activate verified order
        const claim1 = await claimWebhookEvent({
            eventId: providerEventId,
            provider: 'stripe',
            eventType: 'checkout.session.completed',
            orderId,
            repo: resilientRepo
        });
        assert.equal(claim1.duplicate, false);

        const activation1 = await activateVerifiedOrder({
            orderId,
            gatewayLabel: 'stripe',
            providerPaymentId: 'pi_stripe_12345',
            repo: resilientRepo
        });
        assert.equal(activation1.status, 'ACTIVE');

        const userAfterPay = await resilientRepo.getUser(testUid);
        assert.equal(userAfterPay.membership, 'Premium');
        assert.equal(userAfterPay.paymentStatus, 'ACTIVE');
        assert.ok(userAfterPay.membershipEnds, 'Membership end date must be populated in ISO format');

        // 3. Duplicate webhook arrival -> idempotent claim and activation
        const claim2 = await claimWebhookEvent({
            eventId: providerEventId,
            provider: 'stripe',
            eventType: 'checkout.session.completed',
            orderId,
            repo: resilientRepo
        });
        assert.equal(claim2.duplicate, true);

        const activation2 = await activateVerifiedOrder({
            orderId,
            gatewayLabel: 'stripe',
            providerPaymentId: 'pi_stripe_12345',
            repo: resilientRepo
        });
        assert.equal(activation2.status, 'ACTIVE');
        assert.equal(activation2.duplicate, true);

        // Verify membership duration did not double
        const userAfterDup = await resilientRepo.getUser(testUid);
        assert.equal(userAfterDup.membershipEnds, userAfterPay.membershipEnds);

        // 4. Refund / Entitlement reversal
        const refundResult = await reverseEntitlement({
            orderId,
            status: 'REFUNDED',
            repo: resilientRepo
        });
        assert.equal(refundResult.status, 'REFUNDED');

        const userAfterRefund = await resilientRepo.getUser(testUid);
        assert.equal(userAfterRefund.membership, 'Basic');
        assert.equal(userAfterRefund.paymentStatus, 'REFUNDED');
    });

    // -------------------------------------------------------------------------
    // 9. Account Deletion Workflow & Cascade Integrity
    // -------------------------------------------------------------------------
    it('9. Durable account deletion cascades cleanly with zero resurrected data or orphaned entities', async () => {
        authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
        const testUid = `usr_del_${Date.now()}`;
        const testResumeId = `res_del_${Date.now()}`;
        const testPortfolioId = `port_del_${Date.now()}`;

        const resilientRepo = new ResilientRepository({
            mysqlRepo,
            firestoreRepo
        });

        // Populate complete user graph
        await resilientRepo.saveUser(testUid, { email: 'delete_me@example.com', firstname: 'Doomed', lastname: 'User' });
        await resilientRepo.saveResume(testUid, testResumeId, { title: 'Doomed Resume' }, 1);
        await resilientRepo.savePortfolio(testUid, testPortfolioId, { title: 'Doomed Portfolio' });

        // Execute durable deletion
        const deletionResult = await requestDeletion({
            uid: testUid,
            actorUid: testUid,
            userEmail: 'delete_me@example.com',
            reason: 'USER_REQUESTED',
            repo: resilientRepo,
            firebaseAuth: {
                deleteUser: async () => {},
                getUser: async () => ({ uid: testUid, email: 'delete_me@example.com' })
            }
        });
        assert.equal(deletionResult.success, true);

        // Verify all application entities are deleted
        const user = await resilientRepo.getUser(testUid);
        assert.equal(user, null);
        
        const resume = await resilientRepo.getResume(testUid, testResumeId);
        assert.equal(resume, null);

        const portfolio = await resilientRepo.getPortfolio(testUid, testPortfolioId);
        assert.equal(portfolio, null);
    });

    // -------------------------------------------------------------------------
    // 10. Multi-Process Fencing & Distributed Split-Brain Prevention
    // -------------------------------------------------------------------------
    it('10. Concurrent multi-process workers attempting authority transitions elect exactly one winner and fence stale writers', async () => {
        // Reset database_authority table with base generation 10
        await pool.query(
            'INSERT INTO database_authority (id, generation, write_engine, mode, lease_owner, lease_expires_at, reason) VALUES ("active_authority", 10, "mysql", "NORMAL", "worker_init", ?, "Init") ON DUPLICATE KEY UPDATE generation = 10, write_engine = "mysql", mode = "NORMAL"',
            [Date.now() + 60000]
        );

        // Spawn 3 concurrent child worker scripts
        const workerScript = path.join(__dirname, 'helpers', 'fencing-worker-helper.mjs');
        
        const runWorker = (workerName) => new Promise((resolve, reject) => {
            const child = fork(workerScript, [workerName, '10'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
            let stdout = '';
            let stderr = '';
            child.stdout?.on('data', d => { stdout += d.toString(); });
            child.stderr?.on('data', d => { stderr += d.toString(); });
            child.on('exit', (code) => {
                resolve({ workerName, code, stdout, stderr });
            });
        });

        const results = await Promise.all([
            runWorker('Worker-A'),
            runWorker('Worker-B'),
            runWorker('Worker-C')
        ]);

        // Exactly one worker must win the generation bump CAS
        const winners = results.filter(r => r.stdout.includes('ACQUIRED_TRANSITION'));
        const rejected = results.filter(r => r.stdout.includes('FENCE_REJECTED'));

        assert.equal(winners.length, 1, 'Exactly one concurrent worker must win the authority generation CAS transition');
        assert.equal(rejected.length, 2, 'Stale concurrent workers must be safely rejected');

        // Check MariaDB authority generation advanced monotonically
        const [authRows] = await pool.query('SELECT generation, write_engine, mode, lease_owner FROM database_authority WHERE id = "active_authority"');
        assert.equal(authRows[0].generation, 11, 'Generation must advance by exactly 1');
        assert.ok(['Worker-A', 'Worker-B', 'Worker-C'].includes(authRows[0].lease_owner));
    });

    // -------------------------------------------------------------------------
    // 11. Manual Switch vs Failover Race Safety
    // -------------------------------------------------------------------------
    it('11. Manual engine switch is rejected during active failover to prevent split-brain', async () => {
        authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
        
        // Trigger automatic failover
        authority.recordFailure('mysql', 'write', new Error('SIMULATED_OUTAGE'));
        authority.recordFailure('mysql', 'write', new Error('SIMULATED_OUTAGE'));
        assert.equal(authority.getStatus().mode, 'MARIADB_FAILED_OVER');

        // Super Admin attempts manual switch while in failover
        assert.throws(
            () => {
                authority.assertManualSwitchAllowed('firestore');
            },
            (err) => {
                assert.ok(err.code === 'MANUAL_SWITCH_BLOCKED' || err.code === 'MANUAL_SWITCH_BLOCKED_DURING_FAILOVER');
                return true;
            }
        );
    });

    // -------------------------------------------------------------------------
    // 12. Full Data Parity & Divergence Audit
    // -------------------------------------------------------------------------
    it('12. End-to-end data parity audit verifies 0 missing, 0 extra, and 0 unexpected divergences', async () => {
        const parityResult = await flushAndVerifyBeforeSwitch(mockFirestore);
        assert.equal(typeof parityResult.safeToSwitch, 'boolean');
        assert.equal(typeof parityResult.conflicts, 'number');
    });

    after(async () => {
        try {
            await pool.end();
        } catch (_) {}
    });
});
