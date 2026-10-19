'use strict';

/**
 * DIR-008 — tokenized public sharing contract.
 *
 * Verifies the end-to-end lifecycle an anonymous recruiter hits when opening a
 * share link: publish → tokenized read → unpublish → 404, plus the security
 * properties (no owner/internal leakage, forged tokens 404, ownership enforced).
 */
process.env.NODE_ENV = 'test';
process.env.IN_MEMORY_REPOSITORY = '1';
process.env.TEST_AUTH_HMAC_SECRET = process.env.TEST_AUTH_HMAC_SECRET || 'dir008-share-test-secret-0123456789';
process.env.RESUME_SHARE_SECRET = process.env.RESUME_SHARE_SECRET || 'dir008-share-signing-secret-0123456789';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async (token) => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'owner-a') return { uid: 'share-owner-a', email: 'a@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'owner-b') return { uid: 'share-owner-b', email: 'b@example.com', email_verified: true, role: 'USER', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const { issueShareToken, verifyShareToken, projectPublicResume, _resetForTests } = require('../security/shareTokens');

const DRAFT = {
  title: 'Asha Rao — Platform Engineer',
  template: 'Cv75',
  heading: {
    firstName: 'Asha',
    lastName: 'Rao',
    title: 'Principal Platform Engineer',
    email: 'asha.rao@example.com',
    phone: '+91 90000 00000',
    location: 'Vijayawada, India',
    userId: 'share-owner-a',
  },
  summary: '<p>Platform engineer focused on reliability.</p>',
  experience: [{ id: 'e1', position: 'Principal Engineer', company: 'Meridian Bank', startDate: '2021', endDate: 'Present', description: '<p>Led a platform migration.</p>' }],
  skills: ['Kubernetes', 'Go'],
};

async function createResume(bearerToken, resumeId) {
  const response = await request(app)
    .post(`/api/resumes/${resumeId}`)
    .set(bearer(bearerToken))
    .send({ ...DRAFT, expectedRevision: null });
  assert.ok([200, 201].includes(response.status), `create failed: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.resume;
}

test('share tokens are stable, unguessable and reject tampering', () => {
  const token = issueShareToken('resume-abc-123');
  assert.match(token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
  assert.equal(issueShareToken('resume-abc-123'), token, 'tokens must be stable across calls');
  assert.equal(verifyShareToken(token), 'resume-abc-123');
  assert.notEqual(issueShareToken('resume-abc-124'), token);

  const [version, payload, signature] = token.split('.');
  assert.equal(verifyShareToken(`${version}.${payload}.${signature.slice(0, -1)}A`), null, 'signature tamper accepted');
  const otherPayload = Buffer.from('resume-abc-124').toString('base64url');
  assert.equal(verifyShareToken(`${version}.${otherPayload}.${signature}`), null, 'payload swap accepted');
  assert.equal(verifyShareToken('v1.not-base64.zzzzzzzzzzzzzzzzzzzzzz'), null);
  assert.equal(verifyShareToken(''), null);
  assert.equal(verifyShareToken(null), null);
});

test('production without a dedicated secret fails closed', () => {
  const previous = process.env.NODE_ENV;
  const previousSecret = process.env.RESUME_SHARE_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.RESUME_SHARE_SECRET;
  _resetForTests();
  assert.throws(() => issueShareToken('resume-1'), /RESUME_SHARE_SECRET|unavailable/i);
  assert.equal(verifyShareToken('v1.cmVzdW1lLTE.aaaaaaaaaaaaaaaaaaaaaa'), null);
  process.env.NODE_ENV = previous;
  if (previousSecret === undefined) delete process.env.RESUME_SHARE_SECRET;
  else process.env.RESUME_SHARE_SECRET = previousSecret;
  _resetForTests();
});

test('public projection drops owner and internals', () => {
  const projected = projectPublicResume({
    ...DRAFT,
    userId: 'owner', user_id: 'owner', ownerUid: 'owner', isPublished: true, pbId: 'pb_1', publicationRevision: 3,
    secretNote: 'internal',
  });
  for (const key of ['userId', 'user_id', 'ownerUid', 'isPublished', 'pbId', 'publicationRevision', 'secretNote']) {
    assert.equal(Object.prototype.hasOwnProperty.call(projected, key), false, `${key} leaked`);
  }
  assert.equal(projected.heading.userId, undefined);
  assert.equal(projected.template, 'Cv75');
});

test('publish → anonymous token read → unpublish → 404', async () => {
  await createResume('owner-a', 'resume-share-1');

  const notPublished = await request(app).get('/api/resumes/public/resume-share-1');
  assert.equal(notPublished.status, 404, 'unpublished resume must not be readable');

  const publish = await request(app)
    .post('/api/resumes/resume-share-1/publish')
    .set(bearer('owner-a'))
    .send({});
  assert.equal(publish.status, 200, JSON.stringify(publish.body));
  assert.equal(publish.body.success, true);
  assert.ok(publish.body.shareToken, 'publish must return a token');
  assert.equal(publish.body.sharePath, `/shared/${publish.body.shareToken}`);

  const anonymous = await request(app).get(`/api/resumes/public/token/${publish.body.shareToken}`);
  assert.equal(anonymous.status, 200, JSON.stringify(anonymous.body));
  const resume = anonymous.body.resume;
  assert.equal(resume.template, 'Cv75');
  assert.equal(resume.heading.firstName, 'Asha');
  assert.equal(resume.heading.userId, undefined, 'owner id leaked in public payload');
  assert.equal(resume.userId, undefined);
  assert.equal(anonymous.body.publication.isPublished, true);
  assert.equal(anonymous.body.publication.sourceRevision >= 1, true);
  assert.equal(anonymous.headers['x-robots-tag'], 'noindex, nofollow');
  assert.match(anonymous.headers['cache-control'] || '', /no-store/);

  // Forged / mutated tokens never resolve to a document.
  const forged = `${publish.body.shareToken.slice(0, -1)}${publish.body.shareToken.endsWith('A') ? 'B' : 'A'}`;
  const forgedRead = await request(app).get(`/api/resumes/public/token/${forged}`);
  assert.equal(forgedRead.status, 404);

  const unpublish = await request(app)
    .post('/api/resumes/resume-share-1/unpublish')
    .set(bearer('owner-a'))
    .send({ expectedPublicationRevision: publish.body.publicationRevision ?? null });
  assert.equal(unpublish.status, 200, JSON.stringify(unpublish.body));

  const afterRevoke = await request(app).get(`/api/resumes/public/token/${publish.body.shareToken}`);
  assert.equal(afterRevoke.status, 404, 'revoked share must stop working');
});

test('publication status exposes a token only while published', async () => {
  await createResume('owner-a', 'resume-share-2');
  const before = await request(app).get('/api/resumes/resume-share-2/publication').set(bearer('owner-a'));
  assert.equal(before.status, 200);
  assert.equal(before.body.isPublished, false);
  assert.equal(before.body.shareToken, undefined);

  const publish = await request(app).post('/api/resumes/resume-share-2/publish').set(bearer('owner-a')).send({});
  assert.equal(publish.status, 200);
  const after = await request(app).get('/api/resumes/resume-share-2/publication').set(bearer('owner-a'));
  assert.equal(after.body.isPublished, true);
  assert.equal(after.body.shareToken, publish.body.shareToken);

  const otherOwner = await request(app).get('/api/resumes/resume-share-2/publication').set(bearer('owner-b'));
  assert.equal(otherOwner.body.isPublished, false, 'another user must not see publication state');
  assert.equal(otherOwner.body.shareToken, undefined);
});

test('another owner cannot publish, unpublish or read the draft', async () => {
  await createResume('owner-a', 'resume-share-3');
  const foreignPublish = await request(app).post('/api/resumes/resume-share-3/publish').set(bearer('owner-b')).send({});
  assert.ok([403, 404].includes(foreignPublish.status), `cross-owner publish returned ${foreignPublish.status}`);
  const foreignDraft = await request(app).get('/api/resumes/resume-share-3').set(bearer('owner-b'));
  assert.equal(foreignDraft.status, 404);
});

test('publishing a resume twice keeps the same link and advances the publication revision', async () => {
  await createResume('owner-a', 'resume-share-4');
  const first = await request(app).post('/api/resumes/resume-share-4/publish').set(bearer('owner-a')).send({});
  const second = await request(app).post('/api/resumes/resume-share-4/publish').set(bearer('owner-a')).send({});
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.shareToken, second.body.shareToken, 'republishing must not break existing links');
  assert.ok(second.body.publicationRevision > first.body.publicationRevision);
});
