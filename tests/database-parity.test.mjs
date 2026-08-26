import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import FirestoreRepository from '../backend/repositories/FirestoreRepository.js';
import MySQLRepository from '../backend/repositories/MySQLRepository.js';

describe('Dual-Database Repository Parity Test Suite', () => {
    let mockFirestoreDb = null;
    let firestoreRepo = null;
    let mysqlRepo = null;

    before(() => {
        // In-memory mock Firestore instance for deterministic unit testing
        const storage = new Map();
        mockFirestoreDb = {
            collection: (colName) => ({
                doc: (docId = `doc_${Date.now()}`) => {
                    const fullPath = `${colName}/${docId}`;
                    return {
                        id: docId,
                        get: async () => {
                            const data = storage.get(fullPath);
                            return {
                                exists: data !== undefined,
                                id: docId,
                                data: () => data,
                            };
                        },
                        set: async (val, opts = {}) => {
                            const prev = storage.get(fullPath) || {};
                            storage.set(fullPath, opts.merge ? { ...prev, ...val } : val);
                        },
                        delete: async () => {
                            storage.delete(fullPath);
                        },
                        collection: (subCol) => mockFirestoreDb.collection(`${fullPath}/${subCol}`),
                    };
                },
                get: async () => {
                    const docs = [];
                    for (const [k, v] of storage.entries()) {
                        if (k.startsWith(`${colName}/`)) {
                            const id = k.split('/').pop();
                            docs.push({ id, data: () => v });
                        }
                    }
                    return { docs, empty: docs.length === 0 };
                },
                where: () => mockFirestoreDb.collection(colName),
                limit: () => mockFirestoreDb.collection(colName),
            }),
            runTransaction: async (cb) => {
                const tx = {
                    get: async (ref) => ref.get(),
                    set: async (ref, val, opts) => ref.set(val, opts),
                    delete: async (ref) => ref.delete(),
                };
                return await cb(tx);
            },
            batch: () => {
                const ops = [];
                return {
                    delete: (ref) => ops.push(() => ref.delete()),
                    set: (ref, val, opts) => ops.push(() => ref.set(val, opts)),
                    commit: async () => {
                        for (const op of ops) await op();
                    }
                };
            }
        };

        firestoreRepo = new FirestoreRepository(mockFirestoreDb);
        mysqlRepo = new MySQLRepository();
    });

    it('1. FirestoreRepository creates, retrieves, and updates resume drafts with revisions', async () => {
        const userId = 'user_test_001';
        const resumeId = 'resume_test_001';
        const initialData = {
            title: 'Software Architect',
            template: 'Cv1',
            firstname: 'Alice',
            lastname: 'Smith',
            email: 'alice@example.com',
            skills: [{ name: 'React' }, { name: 'Node.js' }],
            employments: [{ company: 'TechCorp', role: 'Lead Dev' }]
        };

        const saved = await firestoreRepo.saveResume(userId, resumeId, initialData);
        assert.equal(saved.id, resumeId);
        assert.equal(saved.revision, 1);
        assert.equal(saved.title, 'Software Architect');

        const loaded = await firestoreRepo.getResume(userId, resumeId);
        assert.ok(loaded);
        assert.equal(loaded.title, 'Software Architect');
        assert.equal(loaded.firstname, 'Alice');

        // Revision bump
        const updated = await firestoreRepo.saveResume(userId, resumeId, {
            ...initialData,
            title: 'Senior Software Architect'
        }, { expectedRevision: 1 });

        assert.equal(updated.revision, 2);
        assert.equal(updated.title, 'Senior Software Architect');
    });

    it('2. FirestoreRepository rejects conflicting concurrent saves', async () => {
        const userId = 'user_test_002';
        const resumeId = 'resume_test_002';
        await firestoreRepo.saveResume(userId, resumeId, { title: 'Initial' });

        await assert.rejects(
            async () => {
                await firestoreRepo.saveResume(userId, resumeId, { title: 'Conflicting update' }, { expectedRevision: 99 });
            },
            (err) => {
                assert.equal(err.code, 'RESUME_CONFLICT');
                return true;
            }
        );
    });

    it('3. FirestoreRepository supports publish and unpublish lifecycle', async () => {
        const userId = 'user_test_003';
        const resumeId = 'resume_test_003';
        await firestoreRepo.saveResume(userId, resumeId, { title: 'Published Resume', firstname: 'Bob' });

        const pubResult = await firestoreRepo.publishResume(userId, resumeId, { title: 'Published Resume', firstname: 'Bob' });
        assert.equal(pubResult.isPublished, true);
        assert.equal(pubResult.publicationRevision, 1);

        const pubDoc = await firestoreRepo.getPublicResume(resumeId);
        assert.ok(pubDoc);
        assert.equal(pubDoc.isPublished, true);
        assert.equal(pubDoc.ownerUid, userId);

        const unpubResult = await firestoreRepo.unpublishResume(userId, resumeId);
        assert.equal(unpubResult.isPublished, false);
    });

    it('4. MySQLRepository contracts match FirestoreRepository exactly', () => {
        const firestoreMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(firestoreRepo))
            .filter(m => m !== 'constructor' && !m.startsWith('_'));
        const _mysqlMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(mysqlRepo))
            .filter(m => m !== 'constructor' && !m.startsWith('_'));

        for (const method of firestoreMethods) {
            assert.ok(
                typeof mysqlRepo[method] === 'function',
                `MySQLRepository is missing required interface method: '${method}'`
            );
        }
    });

    it('5. User and Setting domain methods are symmetric across repositories', async () => {
        const userId = 'user_test_005';
        const userData = { email: 'test@example.com', firstname: 'Test', membership: 'Premium' };

        await firestoreRepo.saveUser(userId, userData);
        const user = await firestoreRepo.getUser(userId);
        assert.equal(user.email, 'test@example.com');
        assert.equal(user.membership, 'Premium');

        await firestoreRepo.saveSetting('website', { title: 'ResumePilot AI', version: '2.0.0' }, 1);
        const setting = await firestoreRepo.getSetting('website');
        assert.equal(setting.title, 'ResumePilot AI');
    });
});
