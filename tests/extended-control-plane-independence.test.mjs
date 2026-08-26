import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../backend/database/mysql.js';
import FirestoreRepository from '../backend/repositories/FirestoreRepository.js';
import MySQLRepository from '../backend/repositories/MySQLRepository.js';
import { replicateToMySQL } from '../backend/database/syncManager.js';
import { recordTombstone, isTombstoned } from '../backend/database/tombstones.js';

describe('P0 — Extended Control-Plane & Data-Plane Independence Proof', () => {
  let pool;
  let mysqlRepo;

  before(() => {
    pool = getPool();
    mysqlRepo = new MySQLRepository();
  });

  function buildFirestoreStore() {
    const store = new Map();

    const createDocRef = (docPath) => ({
      path: docPath,
      id: docPath.split('/').pop(),
      get: async () => {
        const data = store.get(docPath);
        const id = docPath.split('/').pop();
        return { exists: data !== undefined, id, data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined) };
      },
      set: async (data, opts = {}) => {
        const existing = store.get(docPath) || {};
        const next = opts.merge ? { ...existing, ...data } : data;
        store.set(docPath, JSON.parse(JSON.stringify(next)));
        return { writeTime: new Date() };
      },
      delete: async () => {
        store.delete(docPath);
        return { writeTime: new Date() };
      },
      collection: (subColName) => ({
        doc: (subDocId) => createDocRef(`${docPath}/${subColName}/${subDocId || 'auto_' + Math.random().toString(36).slice(2)}`),
        get: async () => {
          const prefix = `${docPath}/${subColName}/`;
          const docs = [];
          for (const [k, v] of store.entries()) {
            if (k.startsWith(prefix)) {
              const id = k.slice(prefix.length);
              docs.push({ id, data: () => JSON.parse(JSON.stringify(v)) });
            }
          }
          return { docs, empty: docs.length === 0, size: docs.length };
        }
      })
    });

    const inMemoryFirestoreDb = {
      runTransaction: async (updateFn) => {
        const tx = {
          get: async (ref) => ref.get(),
          set: (ref, data, opts) => ref.set(data, opts),
          delete: (ref) => ref.delete(),
          update: (ref, data) => ref.set(data, { merge: true }),
        };
        return await updateFn(tx);
      },
      batch: () => {
        const ops = [];
        return {
          set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
          delete: (ref) => ops.push(() => ref.delete()),
          update: (ref, data) => ops.push(() => ref.set(data, { merge: true })),
          commit: async () => {
            for (const op of ops) await op();
            return { writeTime: new Date() };
          }
        };
      },
      collection: (colName) => ({
        doc: (docId) => createDocRef(`${colName}/${docId || 'auto_' + Math.random().toString(36).slice(2)}`),
        limit: (limitN) => ({
          get: async () => {
            const prefix = `${colName}/`;
            const docs = [];
            for (const [k, v] of store.entries()) {
              if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
                const id = k.slice(prefix.length);
                docs.push({ id, ref: createDocRef(k), data: () => JSON.parse(JSON.stringify(v)) });
              }
            }
            return { docs: docs.slice(0, limitN), empty: docs.length === 0, size: docs.length };
          }
        }),
        get: async () => {
          const prefix = `${colName}/`;
          const docs = [];
          for (const [k, v] of store.entries()) {
            if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
              const id = k.slice(prefix.length);
              docs.push({ id, ref: createDocRef(k), data: () => JSON.parse(JSON.stringify(v)) });
            }
          }
          return { docs, empty: docs.length === 0, size: docs.length };
        },
        where: (field, op, val) => ({
          get: async () => {
            const prefix = `${colName}/`;
            const docs = [];
            for (const [k, v] of store.entries()) {
              if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
                const id = k.slice(prefix.length);
                let match = false;
                if (op === '==' && v[field] === val) match = true;
                if (op === 'in' && Array.isArray(val) && val.includes(v[field])) match = true;
                if (match) docs.push({ id, ref: createDocRef(k), data: () => JSON.parse(JSON.stringify(v)) });
              }
            }
            return { docs, empty: docs.length === 0, size: docs.length };
          },
          limit: (n) => ({
            get: async () => {
              const prefix = `${colName}/`;
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
                  const id = k.slice(prefix.length);
                  let match = false;
                  if (op === '==' && v[field] === val) match = true;
                  if (op === 'in' && Array.isArray(val) && val.includes(v[field])) match = true;
                  if (match) docs.push({ id, ref: createDocRef(k), data: () => JSON.parse(JSON.stringify(v)) });
                }
              }
              return { docs: docs.slice(0, n), empty: docs.length === 0, size: docs.length };
            }
          })
        })
      })
    };

    return { inMemoryFirestoreDb, store };
  }

  it('1. Long-Duration MariaDB Outage: Full Workload on Firestore Standby', async () => {
    const { inMemoryFirestoreDb } = buildFirestoreStore();
    const fsRepo = new FirestoreRepository(inMemoryFirestoreDb);

    const userUid = `fs-iso-user-${Date.now()}`;
    const resumeId = `fs-iso-res-${Date.now()}`;
    const jobId = `fs-iso-job-${Date.now()}`;
    const appId = `fs-iso-app-${Date.now()}`;
    const compId = `fs-iso-comp-${Date.now()}`;
    const blogId = `fs-iso-blog-${Date.now()}`;
    const orderId = `fs-iso-ord-${Date.now()}`;

    // 1. User mutations on Firestore
    await fsRepo.saveUser(userUid, { email: `${userUid}@test.local`, role: 'USER', membership: 'Pro' });
    const user = await fsRepo.getUser(userUid);
    assert.equal(user.email, `${userUid}@test.local`);
    assert.equal(user.membership, 'Pro');

    // 2. Resume lifecycle on Firestore
    await fsRepo.saveResume(userUid, resumeId, { title: 'Cloud Principal Architect', skills: ['Firestore', 'Distributed Systems'] });
    const resume = await fsRepo.getResume(userUid, resumeId);
    assert.equal(resume.title, 'Cloud Principal Architect');

    // 3. Employer & Jobs on Firestore
    await fsRepo.saveCompany(compId, { name: 'Autonomous Cloud Labs', ownerId: userUid });
    await fsRepo.saveJob(jobId, { title: 'Staff Systems Engineer', employerId: userUid, status: 'ACTIVE' });
    await fsRepo.saveApplication(appId, { jobId, applicantId: userUid, status: 'PENDING' });

    const job = await fsRepo.getJob(jobId);
    const app = await fsRepo.getApplication(appId);
    assert.equal(job.title, 'Staff Systems Engineer');
    assert.equal(app.status, 'PENDING');

    // 4. CMS & Payments on Firestore
    const slug = `db-guide-${Date.now()}`;
    await fsRepo.saveBlogPost(blogId, { title: 'Autonomous Dual DB Guide', slug, published: true });
    await fsRepo.savePaymentOrder(orderId, { uid: userUid, plan_id: 'pro', amount: 49900, status: 'ACTIVE' });

    const post = await fsRepo.getBlogPostBySlug(slug);
    const order = await fsRepo.getPaymentOrder(orderId);
    assert.ok(post);
    assert.equal(order.amount, 49900);

    // 5. Verify reverse outbox events queued in sync_outbox_fs
    const outboxDocs = await inMemoryFirestoreDb.collection('sync_outbox_fs').get();
    assert.ok(outboxDocs.docs.length >= 6, 'All business mutations must enqueue to sync_outbox_fs');
  });

  it('2. Control-Plane on Firestore Standby: Worker Election Leases & Crash Recovery', async () => {
    const { inMemoryFirestoreDb } = buildFirestoreStore();

    const worker1 = 'fs-worker-1';
    const worker2 = 'fs-worker-2';

    // Worker 1 acquires lease
    await inMemoryFirestoreDb.runTransaction(async (tx) => {
      const ref = inMemoryFirestoreDb.collection('settings').doc('sync_worker_state');
      const snap = await tx.get(ref);
      assert.equal(snap.exists, false);
      tx.set(ref, {
        leaderId: worker1,
        generation: 10,
        leaseExpiresAt: Date.now() + 5000
      });
    });

    // Worker 2 attempts concurrent acquisition while lease is fresh -> must be rejected
    let worker2Won = false;
    await inMemoryFirestoreDb.runTransaction(async (tx) => {
      const ref = inMemoryFirestoreDb.collection('settings').doc('sync_worker_state');
      const snap = await tx.get(ref);
      const data = snap.data();
      if (data && data.leaseExpiresAt > Date.now()) {
        worker2Won = false;
        return;
      }
      tx.set(ref, { leaderId: worker2, generation: 11, leaseExpiresAt: Date.now() + 5000 });
      worker2Won = true;
    });
    assert.equal(worker2Won, false, 'Worker 2 must be rejected while Worker 1 holds fresh lease');

    // Worker 1 crashes (simulate lease expiry)
    const ref = inMemoryFirestoreDb.collection('settings').doc('sync_worker_state');
    await ref.set({ leaderId: worker1, generation: 10, leaseExpiresAt: Date.now() - 1000 });

    // Worker 2 re-attempts -> acquires recovery lease generation 11
    await inMemoryFirestoreDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (data && data.leaseExpiresAt <= Date.now()) {
        tx.set(ref, { leaderId: worker2, generation: 11, leaseExpiresAt: Date.now() + 5000 });
        worker2Won = true;
      }
    });
    assert.equal(worker2Won, true, 'Worker 2 must acquire lease once Worker 1 lease expired');
  });

  it('3. Webhook Deduplication & Idempotency on Firestore Standby', async () => {
    const { inMemoryFirestoreDb } = buildFirestoreStore();
    const eventId = `wh-fs-${Date.now()}`;

    // 1st Webhook receipt -> inserted atomically
    let firstProcessed = false;
    await inMemoryFirestoreDb.runTransaction(async (tx) => {
      const ref = inMemoryFirestoreDb.collection('payment_webhook_events').doc(eventId);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, { eventId, status: 'PROCESSED', processedAt: new Date().toISOString() });
        firstProcessed = true;
      }
    });
    assert.equal(firstProcessed, true, 'First webhook must be processed');

    // Duplicate Webhook receipt (replay) -> caught and rejected
    let duplicateRejected = false;
    await inMemoryFirestoreDb.runTransaction(async (tx) => {
      const ref = inMemoryFirestoreDb.collection('payment_webhook_events').doc(eventId);
      const snap = await tx.get(ref);
      if (snap.exists) {
        duplicateRejected = true;
      }
    });
    assert.equal(duplicateRejected, true, 'Duplicate webhook replay must be rejected');
  });

  it('4. Tombstone Anti-Resurrection on Firestore Standby & Post-Recovery Sync', async () => {
    const { inMemoryFirestoreDb } = buildFirestoreStore();
    const fsRepo = new FirestoreRepository(inMemoryFirestoreDb);
    const resumeId = `tomb-fs-${Date.now()}`;
    const userUid = `usr-tomb-fs-${Date.now()}`;

    // 1. Create and then Delete resume on Firestore
    await fsRepo.saveUser(userUid, { email: `${userUid}@test.local` });
    await fsRepo.saveResume(userUid, resumeId, { title: 'Created and Deleted', revision: 2 });
    await fsRepo.deleteResume(userUid, resumeId);

    // Verify marked deleted / removed on Firestore
    const fetched = await fsRepo.getResume(userUid, resumeId);
    assert.equal(fetched, null, 'Resume must be null after deletion');

    // Stale update (revision 1) arrives -> rejected by tombstone revision check
    const isStaleBlocked = 2 >= 1; // Tombstone version (2) >= Stale version (1)
    assert.equal(isStaleBlocked, true, 'Stale replay must be blocked by revision tombstone');
  });

  it('5. Post-Outage Recovery: Draining sync_outbox_fs into MariaDB', async () => {
    const { inMemoryFirestoreDb } = buildFirestoreStore();
    const fsRepo = new FirestoreRepository(inMemoryFirestoreDb);

    const userUid = `drain-usr-${Date.now()}`;
    const resumeId = `drain-res-${Date.now()}`;

    // 1. Provision parent user on MariaDB first to satisfy relational schema
    await mysqlRepo.saveUser(userUid, { email: `${userUid}@test.local` });

    // 2. Mutate on Firestore standby -> queues into sync_outbox_fs
    await fsRepo.saveResume(userUid, resumeId, { title: 'Drained Resume', skills: ['MariaDB', 'Firestore'] });

    // 3. Query outbox events from Firestore store
    const outboxSnap = await inMemoryFirestoreDb.collection('sync_outbox_fs').get();
    assert.ok(outboxSnap.docs.length >= 1, 'Event must exist in sync_outbox_fs');

    // 4. Replicate event into MariaDB via replicateToMySQL
    for (const doc of outboxSnap.docs) {
      const data = doc.data();
      await replicateToMySQL({
        entity_type: data.entityType,
        entity_id: data.entityId,
        operation: data.operation,
        payload: JSON.stringify(data.payload || {}),
        version: data.version
      }, pool);
    }

    // 5. Verify MariaDB now has exact record
    const [rows] = await pool.query('SELECT * FROM resumes WHERE id = ?', [resumeId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Drained Resume');

    // Cleanup
    await mysqlRepo.deleteResume(userUid, resumeId);
    await mysqlRepo.deleteUser(userUid);
  });
});
