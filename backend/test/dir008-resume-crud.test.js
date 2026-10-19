'use strict';

/**
 * DIR-008 — persisted resume CRUD contract (R-17…R-19, R-45).
 *
 * Exercised through the real Express app against the in-memory repository:
 * create, read, rename, duplicate, delete, revision conflicts, owner isolation,
 * and the rule that clients cannot set server-owned publication fields.
 */
process.env.NODE_ENV = 'test';
process.env.IN_MEMORY_REPOSITORY = '1';
process.env.TEST_AUTH_HMAC_SECRET = process.env.TEST_AUTH_HMAC_SECRET || 'dir008-crud-test-secret-0123456789';
process.env.RESUME_SHARE_SECRET = process.env.RESUME_SHARE_SECRET || 'dir008-crud-signing-secret-0123456789';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async (token) => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'owner-a') return { uid: 'crud-owner-a', email: 'a@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'owner-b') return { uid: 'crud-owner-b', email: 'b@example.com', email_verified: true, role: 'USER', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const DRAFT = {
  title: 'Asha Rao — Platform Engineer',
  name: 'Asha Rao — Platform Engineer',
  template: 'Cv75',
  firstname: 'Asha',
  lastname: 'Rao',
  occupation: 'Principal Platform Engineer',
  summary: '<p>Platform engineer focused on reliability.</p>',
  employments: [{ id: 'e1', position: 'Principal Engineer', company: 'Meridian Bank', begin: '2021', end: 'Present' }],
  skills: [{ id: 's1', category: 'Core', skills: ['Kubernetes', 'Go'] }],
};

async function createResume(id, body = DRAFT) {
  const response = await request(app)
    .post(`/api/resumes/${id}`)
    .set(bearer('owner-a'))
    .send({ ...body, expectedRevision: null });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.resume;
}

test('a resume can be created, read, renamed and deleted by its owner', async () => {
  const created = await createResume('crud-r1');
  assert.equal(created.id, 'crud-r1');

  const read = await request(app).get('/api/resumes/crud-r1').set(bearer('owner-a'));
  assert.equal(read.status, 200);
  assert.equal(read.body.resume.summary, DRAFT.summary);

  const renamed = await request(app)
    .post('/api/resumes/crud-r1')
    .set(bearer('owner-a'))
    .send({ ...read.body.resume, title: 'Asha Rao — Staff Engineer', expectedRevision: read.body.resume.revision });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.resume.title, 'Asha Rao — Staff Engineer');

  const removed = await request(app).delete('/api/resumes/crud-r1').set(bearer('owner-a'));
  assert.equal(removed.status, 200);
  const gone = await request(app).get('/api/resumes/crud-r1').set(bearer('owner-a'));
  assert.equal(gone.status, 404);
});

test('a duplicate is an independent document with its own identity and revision', async () => {
  const source = await createResume('crud-source');
  const copy = await createResume('crud-copy', {
    ...DRAFT,
    title: 'Asha Rao — Platform Engineer (Copy)',
    name: 'Asha Rao — Platform Engineer (Copy)',
  });
  assert.notEqual(copy.id, source.id);

  const copyRead = await request(app).get('/api/resumes/crud-copy').set(bearer('owner-a'));
  assert.equal(copyRead.status, 200);
  assert.equal(copyRead.body.resume.title, 'Asha Rao — Platform Engineer (Copy)');

  // Editing the copy must not touch the source.
  await request(app)
    .post('/api/resumes/crud-copy')
    .set(bearer('owner-a'))
    .send({ ...copyRead.body.resume, summary: 'Copy-only summary', expectedRevision: copyRead.body.resume.revision });
  const sourceRead = await request(app).get('/api/resumes/crud-source').set(bearer('owner-a'));
  assert.equal(sourceRead.body.resume.summary, DRAFT.summary);
});

test('a stale revision is rejected with 409 and the authoritative revision', async () => {
  await createResume('crud-conflict');
  const first = await request(app).get('/api/resumes/crud-conflict').set(bearer('owner-a'));
  const rev = first.body.resume.revision;

  const ok = await request(app)
    .post('/api/resumes/crud-conflict')
    .set(bearer('owner-a'))
    .send({ title: 'First write', expectedRevision: rev });
  assert.equal(ok.status, 200);

  const stale = await request(app)
    .post('/api/resumes/crud-conflict')
    .set(bearer('owner-a'))
    .send({ title: 'Second write from a stale tab', expectedRevision: rev });
  assert.equal(stale.status, 409);
  assert.ok(['RESUME_CONFLICT', 'STALE_WRITE'].includes(stale.body.code), `unexpected code ${stale.body.code}`);
  assert.equal(typeof stale.body.remoteRevision, 'number');
});

test('cross-owner reads, writes and deletes are indistinguishable from not found', async () => {
  await createResume('crud-private');

  const read = await request(app).get('/api/resumes/crud-private').set(bearer('owner-b'));
  assert.equal(read.status, 404);

  const write = await request(app)
    .post('/api/resumes/crud-private')
    .set(bearer('owner-b'))
    .send({ title: 'Hijacked' });
  assert.equal(write.status, 404);

  const remove = await request(app).delete('/api/resumes/crud-private').set(bearer('owner-b'));
  assert.equal(remove.status, 404);

  const stillThere = await request(app).get('/api/resumes/crud-private').set(bearer('owner-a'));
  assert.equal(stillThere.status, 200);
  assert.equal(stillThere.body.resume.title, DRAFT.title, 'owner content was not modified');
});

test('clients cannot set server-owned publication or ownership fields through save', async () => {
  await createResume('crud-owned');

  const attempt = await request(app)
    .post('/api/resumes/crud-owned')
    .set(bearer('owner-a'))
    .send({
      title: 'Attempted self-publication',
      isPublished: true,
      publicationRevision: 99,
      userId: 'crud-owner-b',
      user_id: 'crud-owner-b',
      ownerUid: 'crud-owner-b',
      expectedRevision: null,
    });
  assert.equal(attempt.status, 200);

  const row = await request(app).get('/api/resumes/crud-owned').set(bearer('owner-a'));
  assert.equal(row.status, 200);
  assert.notEqual(row.body.resume.isPublished, true, 'publication cannot be forged through save');
  const list = await request(app).get('/api/resumes').set(bearer('owner-a'));
  const mine = list.body.resumes.find((r) => r.id === 'crud-owned');
  assert.ok(mine, 'owner still sees the resume');
  const others = await request(app).get('/api/resumes').set(bearer('owner-b'));
  assert.ok(!others.body.resumes.some((r) => r.id === 'crud-owned'), 'ownership was not transferred');

  // And it is not publicly readable just because a client asked to publish it.
  const publicRead = await request(app).get('/api/resumes/public/crud-owned');
  assert.equal(publicRead.status, 404);
});
