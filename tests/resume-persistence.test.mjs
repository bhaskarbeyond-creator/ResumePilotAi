import test from 'node:test';
import assert from 'node:assert/strict';
import { createResumeDraft, loadResumeDraft, saveResumeDraft, publishResume, unpublishResume, getResumePublication, deleteResumeDraft, writeResumeRecovery, readResumeRecovery, clearResumeRecovery } from '../src/services/resumePersistence.js';

function fakeDb(initial = {}) {
  const documents = new Map(Object.entries(initial));
  let nextId = 1;
  const reference = path => ({
    id: path.split('/').at(-1), path,
    async get() { return { id: this.id, exists: documents.has(path), data: () => documents.get(path) }; },
    async set(value) { documents.set(path, value); },
    async update(value) { documents.set(path, { ...(documents.get(path) || {}), ...value }); },
    async delete() { documents.delete(path); },
  });
  return {
    documents,
    collection(name) {
      return { doc(id) {
        const docId = id || `generated-resume-id-${nextId++}`;
        const base = `${name}/${docId}`;
        const ref = reference(base);
        ref.collection = child => ({ doc(childId) {
          const childDocId = childId || `generated-resume-id-${nextId++}`;
          return reference(`${base}/${child}/${childDocId}`);
        } });
        return ref;
      } };
    },
    batch() {
      const operations = [];
      return { delete(ref) { operations.push(() => documents.delete(ref.path)); }, async commit() { for (const operation of operations) operation(); } };
    },
    async runTransaction(callback) {
      await callback({
        async get(ref) { return { id: ref.id, exists: documents.has(ref.path), data: () => documents.get(ref.path) }; },
        set(ref, value) { documents.set(ref.path, value); },
      });
    },
  };
}

test('create, load, and save use one owner-scoped canonical document with monotonic revisions', async () => {
  const db = fakeDb();
  const created = await createResumeDraft('alice', { firstname: 'Asha', projects: [{ title: 'Project' }] }, { db });
  assert.match(created.id, /^generated-resume-id-/);
  assert.equal(created.revision, 1);
  const loaded = await loadResumeDraft('alice', created.id, { db });
  assert.equal(loaded.data.firstname, 'Asha');
  assert.equal(loaded.data.projects[0].title, 'Project');
  const saved = await saveResumeDraft('alice', created.id, { ...loaded.data, summary: 'Updated' }, { db, expectedRevision: 1 });
  assert.equal(saved.revision, 2);
  const reloaded = await loadResumeDraft('alice', created.id, { db });
  assert.equal(reloaded.revision, 2);
  assert.equal(reloaded.data.summary, 'Updated');
});

test('oversized drafts fail clearly before Firestore writes or retry loops', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => createResumeDraft('alice', { firstname: 'Asha', photo: `data:image/png;base64,${'A'.repeat(910_000)}` }, { db }),
    error => error.code === 'RESUME_TOO_LARGE'
  );
  assert.equal(db.documents.size, 0);
});

test('failed saves reject without mutating the last durable revision', async () => {
  const db = fakeDb();
  const created = await createResumeDraft('alice', { firstname: 'Asha' }, { db });
  const durable = JSON.stringify(db.documents.get(`users/alice/resumes/${created.id}`));
  db.runTransaction = async () => { const error = new Error('network unavailable'); error.code = 'unavailable'; throw error; };
  await assert.rejects(() => saveResumeDraft('alice', created.id, { firstname: 'Changed' }, { db, expectedRevision: 1 }), /network unavailable/);
  assert.equal(JSON.stringify(db.documents.get(`users/alice/resumes/${created.id}`)), durable);
});

test('stale concurrent saves fail with recoverable remote data instead of overwriting', async () => {
  const db = fakeDb();
  const created = await createResumeDraft('alice', { firstname: 'Asha' }, { db });
  await saveResumeDraft('alice', created.id, { firstname: 'Remote', projects: [{ title: 'Kept' }] }, { db, expectedRevision: 1 });
  await assert.rejects(
    () => saveResumeDraft('alice', created.id, { firstname: 'Stale' }, { db, expectedRevision: 1 }),
    error => error.code === 'RESUME_CONFLICT' && error.remoteRevision === 2 && error.remoteData.projects[0].title === 'Kept'
  );
  const loaded = await loadResumeDraft('alice', created.id, { db });
  assert.equal(loaded.data.firstname, 'Remote');
});

test('publishing is explicit, revocable, and deletion removes owner and public copies atomically', async () => {
  const db = fakeDb();
  const created = await createResumeDraft('alice', { firstname: 'Asha', email: 'private@example.com' }, { db });
  assert.equal((await getResumePublication('alice', created.id, { db })).isPublished, false);
  await publishResume('alice', created.id, created.data, { db });
  assert.equal((await getResumePublication('alice', created.id, { db })).isPublished, true);
  assert.match(db.documents.get(`pb/${created.id}`).object, /private@example.com/);
  assert.equal(db.documents.get(`pb/${created.id}`).publicationMode, 'explicit');
  await unpublishResume('alice', created.id, { db });
  assert.equal((await getResumePublication('alice', created.id, { db })).isPublished, false);
  await deleteResumeDraft('alice', created.id, { db });
  assert.equal(db.documents.has(`users/alice/resumes/${created.id}`), false);
  assert.equal(db.documents.has(`pb/${created.id}`), false);
});

test('local recovery is scoped and clearable without leaking between accounts', () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) || null, removeItem: key => values.delete(key) };
  writeResumeRecovery('alice', 'resume-1', 3, { firstname: 'Asha' }, storage);
  assert.equal(readResumeRecovery('alice', 'resume-1', storage).data.firstname, 'Asha');
  assert.equal(readResumeRecovery('bob', 'resume-1', storage), null);
  clearResumeRecovery('alice', 'resume-1', storage);
  assert.equal(readResumeRecovery('alice', 'resume-1', storage), null);
});
