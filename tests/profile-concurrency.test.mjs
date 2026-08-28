import test from 'node:test';
import assert from 'node:assert/strict';
import { saveProfile, saveProfileAvatar } from '../src/services/profilePersistence.js';
import { createProfileApiAdapter } from './helpers/profile-api-adapter.mjs';

test('Scenario A: same-field concurrent edits cannot silently overwrite each other', async () => {
  const adapter = createProfileApiAdapter({ firstname: 'Asha', summary: 'Old bio', revision: 1 });
  const first = await saveProfile('alice', { firstname: 'Asha', summary: 'Tab A bio', revision: 1 }, 1, { api: adapter.api });
  assert.equal(first.success, true);
  assert.equal(first.revision, 2);
  assert.equal(first.profile.summary, 'Tab A bio');

  const second = await saveProfile('alice', { firstname: 'Asha', summary: 'Tab B bio', revision: 1 }, 1, { api: adapter.api });
  assert.equal(second.success, false);
  assert.equal(second.code, 'PROFILE_CONFLICT');
  assert.equal(second.remoteRevision, 2);
  assert.equal(second.remoteProfile.summary, 'Tab A bio');
  assert.equal(adapter.snapshot().summary, 'Tab A bio');
});

test('Scenario B: different-field concurrent edits conflict at full-profile OCC rather than losing data', async () => {
  const adapter = createProfileApiAdapter({ firstname: 'Asha', workExperiences: [], education: [], revision: 1 });
  const tabA = await saveProfile('alice', { firstname: 'Asha', workExperiences: [{ jobTitle: 'Platform Engineer' }], education: [], revision: 1 }, 1, { api: adapter.api });
  assert.equal(tabA.success, true);

  const tabB = await saveProfile('alice', { firstname: 'Asha', workExperiences: [], education: [{ degree: 'M.Tech' }], revision: 1 }, 1, { api: adapter.api });
  assert.equal(tabB.success, false);
  assert.equal(tabB.code, 'PROFILE_CONFLICT');
  assert.equal(tabB.remoteRevision, 2);
  assert.equal(tabB.remoteProfile.workExperiences[0].jobTitle, 'Platform Engineer');
});

test('Scenario C: avatar API read-modify-write preserves remote profile text and increments one revision', async () => {
  const adapter = createProfileApiAdapter({ firstname: 'Asha', summary: 'Keep me', selectedImage: null, revision: 3 });
  const avatar = 'data:image/png;base64,AAAA';
  const result = await saveProfileAvatar('alice', avatar, 3, { api: adapter.api });
  assert.equal(result.success, true);
  assert.equal(result.revision, 4);
  assert.equal(adapter.snapshot().summary, 'Keep me');
  assert.equal(adapter.snapshot().selectedImage, avatar);
  assert.deepEqual(adapter.requests.map(request => request.options.method || 'GET'), ['GET', 'POST']);
});

test('client-supplied profile revision cannot advance the authoritative revision', async () => {
  const adapter = createProfileApiAdapter({ firstname: 'Asha', revision: 1 });
  const result = await saveProfile('alice', { firstname: 'Asha', revision: 999 }, 999, { api: adapter.api });
  assert.equal(result.success, false);
  assert.equal(result.code, 'PROFILE_CONFLICT');
  assert.equal(result.remoteRevision, 1);
  assert.equal(adapter.snapshot().revision, 1);
});

test('explicit overwrite requires adopting the authoritative remote revision first', async () => {
  const adapter = createProfileApiAdapter({ firstname: 'Asha', summary: 'Remote', revision: 2 });
  const local = { firstname: 'Asha', summary: 'Local explicit overwrite' };
  const stale = await saveProfile('alice', { ...local, revision: 1 }, 1, { api: adapter.api });
  assert.equal(stale.success, false);
  assert.equal(stale.remoteRevision, 2);

  const intentional = await saveProfile('alice', local, stale.remoteRevision, { api: adapter.api });
  assert.equal(intentional.success, true);
  assert.equal(intentional.revision, 3);
  assert.equal(intentional.profile.summary, 'Local explicit overwrite');
});

test('simultaneous API writes are serialized by authoritative OCC: one wins and one conflicts', async () => {
  const adapter = createProfileApiAdapter({ firstname: 'Asha', revision: 0 });
  const [first, second] = await Promise.all([
    saveProfile('alice', { firstname: 'Asha', summary: 'first' }, 0, { api: adapter.api }),
    saveProfile('alice', { firstname: 'Asha', summary: 'second' }, 0, { api: adapter.api }),
  ]);
  const successes = [first, second].filter(result => result.success);
  const conflicts = [first, second].filter(result => result.code === 'PROFILE_CONFLICT');
  assert.equal(successes.length, 1);
  assert.equal(conflicts.length, 1);
  assert.equal(adapter.snapshot().revision, 1);
  assert.equal(adapter.snapshot().summary, successes[0].profile.summary);
});

test('profile persistence sends only the revisioned profile envelope to the API', async () => {
  const adapter = createProfileApiAdapter({ revision: 0 });
  const result = await saveProfile('alice', { firstname: 'Asha', membership: 'Premium' }, 0, { api: adapter.api });
  assert.equal(result.success, true);
  const body = JSON.parse(adapter.requests[0].options.body);
  assert.deepEqual(Object.keys(body).sort(), ['expectedRevision', 'profile']);
  assert.equal(body.expectedRevision, 0);
  assert.equal(Object.hasOwn(body.profile, 'membership'), false, 'frontend normalization does not send entitlement fields');
});
