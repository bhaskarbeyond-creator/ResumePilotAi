process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'alice') return { uid: 'alice', email: 'alice@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'bob') return { uid: 'bob', email: 'bob@example.com', email_verified: true, role: 'USER', auth_time: now };
  throw new Error('invalid token');
});

const documents = new Map([
  ['users/alice/resumes/resume-private-1', { firstname: 'Asha', template: 'Cv1', revision: 2 }],
  ['users/alice', { membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: new Date(Date.now() + 86400000) }],
  ['users/bob', { membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: new Date(Date.now() + 86400000) }],
  ['pb/resume-private-1', { ownerUid: 'alice', isPublished: true, object: '{"firstname":"Asha","template":"Cv1"}' }],
]);
const ref = path => ({
  async get() { const data = documents.get(path); return { exists: Boolean(data), data: () => data }; },
  collection(name) { return { doc: id => ref(`${path}/${name}/${id}`) }; },
});
const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }) };
const app = require('../index');
app.set('db', db);
const bearer = token => ({ Authorization: `Bearer ${token}` });

test('private resume export rejects anonymous and cross-account access before rendering', async () => {
  const anonymous = await request(app).post('/api/export').send({ resumeId: 'resume-private-1', resumeName: 'Cv1', language: 'en' });
  assert.equal(anonymous.status, 401);
  const otherUser = await request(app).post('/api/export').set(bearer('bob')).send({ resumeId: 'resume-private-1', resumeName: 'Cv1', language: 'en' });
  assert.equal(otherUser.status, 404);
});

test('legacy implicit publication is unavailable through public export', async () => {
  const response = await request(app).post('/api/public-export').send({ resumeId: 'resume-private-1', resumeName: 'Cv1', language: 'en' });
  assert.equal(response.status, 404);
});

test('DOCX export checks the owner-scoped resume rather than public publication state', async () => {
  const otherUser = await request(app).post('/api/export-docx').set(bearer('bob')).send({ resumeId: 'resume-private-1', resumeName: 'Cv1', language: 'en' });
  assert.equal(otherUser.status, 404, JSON.stringify(otherUser.body));
});
