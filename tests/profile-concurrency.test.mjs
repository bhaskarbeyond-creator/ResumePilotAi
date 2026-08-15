import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryProfileStore, saveProfile } from '../src/services/profilePersistence.js';

function firestoreLike(store) {
  return { runTransaction: store.runTransaction.bind(store), collection: () => ({ doc: uid => ({ uid, path: `users/${uid}` }) }) };
}

test('Scenario A: same-field concurrent edits cannot silently overwrite each other', async () => {
  const store = createInMemoryProfileStore({ firstname: 'Asha', summary: 'Old bio', revision: 1 });
  const db = firestoreLike(store);

  const first = await saveProfile(db, 'alice', { firstname: 'Asha', summary: 'Tab A bio', revision: 1 }, 1);
  assert.equal(first.success, true);
  assert.equal(first.revision, 2);
  assert.equal(first.profile.summary, 'Tab A bio');

  const second = await saveProfile(db, 'alice', { firstname: 'Asha', summary: 'Tab B bio', revision: 1 }, 1);
  assert.equal(second.success, false);
  assert.equal(second.code, 'PROFILE_CONFLICT');
  assert.equal(second.remoteRevision, 2);
  assert.equal(second.remoteProfile.summary, 'Tab A bio');
  assert.equal(store.state.profile.summary, 'Tab A bio');
});

test('Scenario B: different-field concurrent edits conflict at full-profile OCC rather than silently losing data', async () => {
  const store = createInMemoryProfileStore({ firstname: 'Asha', workExperiences: [], education: [], revision: 1 });
  const db = firestoreLike(store);

  const tabA = await saveProfile(db, 'alice', { firstname: 'Asha', workExperiences: [{ jobTitle: 'Platform Engineer' }], education: [], revision: 1 }, 1);
  assert.equal(tabA.success, true);

  const tabB = await saveProfile(db, 'alice', { firstname: 'Asha', workExperiences: [], education: [{ degree: 'M.Tech' }], revision: 1 }, 1);
  assert.equal(tabB.success, false);
  assert.equal(tabB.code, 'PROFILE_CONFLICT');
  assert.equal(tabB.remoteRevision, 2);
  assert.equal(tabB.remoteProfile.workExperiences[0].jobTitle, 'Platform Engineer');
});

test('Scenario C: avatar update preserves remote profile text and increments one revision', async () => {
  const store = createInMemoryProfileStore({ firstname: 'Asha', summary: 'Keep me', selectedImage: null, revision: 3 });
  const db = firestoreLike(store);
  const avatar = 'data:image/png;base64,AAAA';

  const result = await saveProfile(db, 'alice', { firstname: 'Asha', summary: 'Keep me', selectedImage: avatar, revision: 3 }, 3);
  assert.equal(result.success, true);
  assert.equal(result.revision, 4);
  assert.equal(result.profile.summary, 'Keep me');
  assert.equal(result.profile.selectedImage, avatar);
});

test('revision numbers are authoritative and cannot be advanced by sending a client revision', async () => {
  const store = createInMemoryProfileStore({ firstname: 'Asha', revision: 1 });
  const db = firestoreLike(store);

  const result = await saveProfile(db, 'alice', { firstname: 'Asha', revision: 999 }, 999);
  assert.equal(result.success, false);
  assert.equal(result.code, 'PROFILE_CONFLICT');
  assert.equal(result.remoteRevision, 1);
  assert.equal(store.state.profile.revision, 1);
});

test('explicit overwrite remains intentional because caller must first adopt remote revision', async () => {
  const store = createInMemoryProfileStore({ firstname: 'Asha', summary: 'Remote', revision: 2 });
  const db = firestoreLike(store);
  const local = { firstname: 'Asha', summary: 'Local explicit overwrite' };

  const stale = await saveProfile(db, 'alice', { ...local, revision: 1 }, 1);
  assert.equal(stale.success, false);
  assert.equal(stale.remoteRevision, 2);

  const intentional = await saveProfile(db, 'alice', { ...local, revision: stale.remoteRevision }, stale.remoteRevision);
  assert.equal(intentional.success, true);
  assert.equal(intentional.revision, 3);
  assert.equal(intentional.profile.summary, 'Local explicit overwrite');
});

test('overlapping same-tab saves are serialized with one in-flight transaction', async () => {
  let transactions = 0;
  let resolveFirst;
  const db = {
    collection: () => ({ doc: uid => ({ uid }) }),
    runTransaction: async callback => {
      const number = ++transactions;
      if (number === 1) await new Promise(resolve => { resolveFirst = resolve; });
      return callback({
        get: async () => ({ exists: true, data: () => ({ profile: { firstname: 'Asha', revision: number - 1 } }) }),
        set: () => {},
      });
    },
  };

  const first = saveProfile(db, 'alice', { firstname: 'Asha', summary: 'first', revision: 0 }, 0);
  await new Promise(resolve => setTimeout(resolve, 0));
  const second = saveProfile(db, 'alice', { firstname: 'Asha', summary: 'second', revision: 0 }, 0);
  resolveFirst();

  await Promise.all([first, second]);
  assert.equal(transactions, 2, 'service calls are serialized by the component queue; no third duplicate write is created by the queue');
});
