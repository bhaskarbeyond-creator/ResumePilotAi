import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createResumeDraft,
  loadResumeDraft,
  saveResumeDraft,
  publishResume,
  unpublishResume,
  getResumePublication,
  deleteResumeDraft,
  writeResumeRecovery,
  readResumeRecovery,
  clearResumeRecovery,
} from '../src/services/resumePersistence.js';
import { createResumeApiAdapter } from './helpers/resume-api-adapter.mjs';

test('create, load, and save use one owner-scoped backend API resource with monotonic revisions', async () => {
  const adapter = createResumeApiAdapter();
  const created = await createResumeDraft('alice', { firstname: 'Asha', projects: [{ title: 'Project' }] }, { api: adapter.api });
  assert.match(created.id, /^res_/);
  assert.equal(created.revision, 1);

  const loaded = await loadResumeDraft('alice', created.id, { api: adapter.api });
  assert.equal(loaded.data.firstname, 'Asha');
  assert.equal(loaded.data.projects[0].title, 'Project');

  const saved = await saveResumeDraft('alice', created.id, { ...loaded.data, summary: 'Updated' }, {
    api: adapter.api,
    expectedRevision: 1,
  });
  assert.equal(saved.revision, 2);
  const reloaded = await loadResumeDraft('alice', created.id, { api: adapter.api });
  assert.equal(reloaded.revision, 2);
  assert.equal(reloaded.data.summary, 'Updated');
  assert.deepEqual(adapter.requests.filter(item => item.operation === 'save').map(item => item.expectedRevision), [null, 1]);
});

test('oversized drafts fail clearly before an API write or retry loop', async () => {
  const adapter = createResumeApiAdapter();
  await assert.rejects(
    () => createResumeDraft('alice', { firstname: 'Asha', photo: `data:image/png;base64,${'A'.repeat(910_000)}` }, { api: adapter.api }),
    error => error.code === 'RESUME_TOO_LARGE',
  );
  assert.equal(adapter.requests.length, 0);
  assert.equal(adapter.resumes.size, 0);
});

test('failed saves reject without mutating the last durable revision', async () => {
  const adapter = createResumeApiAdapter();
  const created = await createResumeDraft('alice', { firstname: 'Asha' }, { api: adapter.api });
  const durable = adapter.snapshot(created.id);
  adapter.failNext(Object.assign(new Error('database unavailable'), { code: 'DATABASE_UNAVAILABLE', status: 503 }));

  await assert.rejects(
    () => saveResumeDraft('alice', created.id, { firstname: 'Changed' }, { api: adapter.api, expectedRevision: 1 }),
    /database unavailable/,
  );
  assert.deepEqual(adapter.snapshot(created.id), durable);
});

test('stale concurrent saves fail with recoverable remote data instead of overwriting', async () => {
  const adapter = createResumeApiAdapter();
  const created = await createResumeDraft('alice', { firstname: 'Asha' }, { api: adapter.api });
  await saveResumeDraft('alice', created.id, { firstname: 'Remote', projects: [{ title: 'Kept' }] }, {
    api: adapter.api,
    expectedRevision: 1,
  });

  await assert.rejects(
    () => saveResumeDraft('alice', created.id, { firstname: 'Stale' }, { api: adapter.api, expectedRevision: 1 }),
    error => error.code === 'RESUME_CONFLICT'
      && error.remoteRevision === 2
      && error.remoteData.projects[0].title === 'Kept',
  );
  const loaded = await loadResumeDraft('alice', created.id, { api: adapter.api });
  assert.equal(loaded.data.firstname, 'Remote');
});

test('publishing is explicit, revision guarded, revocable, and deletion removes the public projection atomically', async () => {
  const adapter = createResumeApiAdapter();
  const created = await createResumeDraft('alice', { firstname: 'Asha', email: 'private@example.com' }, { api: adapter.api });
  assert.equal((await getResumePublication('alice', created.id, { api: adapter.api })).isPublished, false);

  const publishedV1 = await publishResume('alice', created.id, { ...created.data, firstname: 'Unsaved substitution' }, {
    api: adapter.api,
    expectedRevision: 1,
    expectedPublicationRevision: 0,
  });
  assert.equal((await getResumePublication('alice', created.id, { api: adapter.api })).isPublished, true);
  assert.match(adapter.publications.get(created.id).object, /private@example.com/);
  assert.doesNotMatch(adapter.publications.get(created.id).object, /Unsaved substitution/);
  assert.equal(adapter.publications.get(created.id).publicationMode, 'explicit');

  await saveResumeDraft('alice', created.id, { firstname: 'Version 2', email: 'new@example.com' }, {
    api: adapter.api,
    expectedRevision: 1,
  });
  assert.match(adapter.publications.get(created.id).object, /private@example.com/);
  await assert.rejects(
    () => publishResume('alice', created.id, {}, {
      api: adapter.api,
      expectedRevision: 1,
      expectedPublicationRevision: publishedV1.publicationRevision,
    }),
    error => error.code === 'RESUME_CONFLICT',
  );

  const current = await loadResumeDraft('alice', created.id, { api: adapter.api });
  const publishedV2 = await publishResume('alice', created.id, current.data, {
    api: adapter.api,
    expectedRevision: 2,
    expectedPublicationRevision: publishedV1.publicationRevision,
  });
  assert.match(adapter.publications.get(created.id).object, /new@example.com/);
  await unpublishResume('alice', created.id, {
    api: adapter.api,
    expectedPublicationRevision: publishedV2.publicationRevision,
  });
  assert.equal((await getResumePublication('alice', created.id, { api: adapter.api })).isPublished, false);

  await deleteResumeDraft('alice', created.id, { api: adapter.api });
  assert.equal(adapter.resumes.has(created.id), false);
  assert.equal(adapter.publications.has(created.id), false);
});

test('local recovery is scoped and clearable without leaking between accounts', () => {
  const values = new Map();
  const storage = {
    setItem: (key, value) => values.set(key, value),
    getItem: key => values.get(key) || null,
    removeItem: key => values.delete(key),
  };
  writeResumeRecovery('alice', 'resume-1', 3, { firstname: 'Asha' }, storage);
  assert.equal(readResumeRecovery('alice', 'resume-1', storage).data.firstname, 'Asha');
  assert.equal(readResumeRecovery('bob', 'resume-1', storage), null);
  clearResumeRecovery('alice', 'resume-1', storage);
  assert.equal(readResumeRecovery('alice', 'resume-1', storage), null);
});
