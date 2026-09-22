'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const { resumesRouter } = require('../routes/resumes');

test('Public Review Link & Published Resume Architecture', async (t) => {
  const mockUsers = new Map([
    ['alice-uid', { id: 'alice-uid', membership: 'Basic', role: 'USER' }],
    ['pro-dave-uid', { id: 'pro-dave-uid', membership: 'Pro', paymentStatus: 'ACTIVE', role: 'USER' }],
  ]);

  const mockPublicResumes = new Map([
    [
      'pub-alice-01',
      {
        id: 'pub-alice-01',
        ownerUid: 'alice-uid',
        isPublished: true,
        publicationMode: 'explicit',
        data: {
          firstname: 'Alice',
          lastname: 'Smith',
          template: 'Cv1',
          resumeName: 'Cv1',
          skills: [{ name: 'React' }, { name: 'Node.js' }],
          summary: 'Senior Software Engineer'
        },
        sourceRevision: 3,
        publicationRevision: 2,
        publishedAt: '2026-09-02T12:00:00.000Z',
      }
    ],
    [
      'pub-dave-pro',
      {
        id: 'pub-dave-pro',
        ownerUid: 'pro-dave-uid',
        isPublished: true,
        publicationMode: 'explicit',
        data: {
          firstname: 'Dave',
          lastname: 'Pro',
          template: 'Cv2',
        },
        sourceRevision: 1,
        publicationRevision: 1,
        publishedAt: '2026-09-02T12:00:00.000Z',
      }
    ],
    [
      'revoked-bob-02',
      {
        id: 'revoked-bob-02',
        ownerUid: 'bob-uid',
        isPublished: false, // revoked
        publicationMode: 'explicit',
        data: { firstname: 'Bob' },
        sourceRevision: 1,
        publicationRevision: 2,
        publishedAt: '2026-09-01T12:00:00.000Z',
      }
    ]
  ]);

  const mockPrivateDrafts = new Map([
    ['alice-uid:pub-alice-01', { id: 'pub-alice-01', userId: 'alice-uid', firstname: 'Alice', revision: 3 }],
    ['alice-uid:draft-alice-private', { id: 'draft-alice-private', userId: 'alice-uid', firstname: 'Alice Secret', revision: 1 }],
  ]);

  const mockRepo = {
    async getPublicResume(resumeId) {
      return mockPublicResumes.get(resumeId) || null;
    },
    async getResume(userId, resumeId) {
      return mockPrivateDrafts.get(`${userId}:${resumeId}`) || null;
    },
    async getUser(uid) {
      return mockUsers.get(uid) || null;
    },
    async getSetting(key) {
      if (key === 'public_config') {
        return {
          watermark: {
            enableFreeWatermark: true,
            watermarkText: 'Created with IME365 (Free Plan)',
            opacity: 0.18,
            position: 'diagonal',
          }
        };
      }
      return null;
    }
  };
  setRepositoryForTests(mockRepo);
  t.after(() => {
    resetRepositoryCacheForTests();
  });

  const app = express();
  app.use(express.json());

  // Simulate zero-trust API boundary matching backend/index.js
  app.use('/api', (req, res, next) => {
    req.repository = mockRepo;
    const isPublic = /^\/resumes\/public\/[a-zA-Z0-9_-]+$/i.test(req.path);
    if (isPublic) return next();

    // Authenticated routes require Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    }
    const token = authHeader.slice(7);
    req.user = { uid: token }; // Mock UID from bearer token
    next();
  });

  app.use('/api/resumes', resumesRouter);

  await t.test('1. Anonymous reviewer can view published review link without auth token', async () => {
    const res = await request(app)
      .get('/api/resumes/public/pub-alice-01')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.resume.firstname, 'Alice');
    assert.equal(res.body.resume.template, 'Cv1');
    assert.equal(res.body.publication.isPublished, true);
    assert.equal(res.body.publication.publishedAt, '2026-09-02T12:00:00.000Z');
  });

  await t.test('2. Another logged-in user (peer/mentor/recruiter) can view the published review link', async () => {
    const res = await request(app)
      .get('/api/resumes/public/pub-alice-01')
      .set('Authorization', 'Bearer charlie-recruiter-uid')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.resume.firstname, 'Alice');
    assert.deepEqual(res.body.resume.skills, [{ name: 'React' }, { name: 'Node.js' }]);
  });

  await t.test('3. Non-existent resume returns 404', async () => {
    const res = await request(app)
      .get('/api/resumes/public/non-existent-resume')
      .expect(404);

    assert.equal(res.body.success, false);
    assert.match(res.body.error, /not found/i);
  });

  await t.test('4. Revoked or unpublished resume returns 404 to reviewers', async () => {
    const res = await request(app)
      .get('/api/resumes/public/revoked-bob-02')
      .expect(404);

    assert.equal(res.body.success, false);
    assert.match(res.body.error, /not found|no longer published/i);
  });

  await t.test('5. Private draft endpoint STILL rejects unauthenticated callers with 401', async () => {
    const res = await request(app)
      .get('/api/resumes/draft-alice-private')
      .expect(401);

    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  await t.test('6. Private draft endpoint STILL protects against IDOR (404 for different user)', async () => {
    const res = await request(app)
      .get('/api/resumes/draft-alice-private')
      .set('Authorization', 'Bearer mallory-attacker-uid')
      .expect(404);

    assert.equal(res.body.success, false);
  });

  await t.test('7. Private draft endpoint is accessible ONLY by the authenticated owner', async () => {
    const res = await request(app)
      .get('/api/resumes/draft-alice-private')
      .set('Authorization', 'Bearer alice-uid')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.resume.firstname, 'Alice Secret');
  });

  await t.test('8. Free user public review link delivers watermark configuration', async () => {
    const res = await request(app)
      .get('/api/resumes/public/pub-alice-01')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.watermark, 'Expected watermark metadata for free user');
    assert.equal(res.body.watermark.enableFreeWatermark, true);
    assert.equal(res.body.watermark.watermarkText, 'Created with IME365 (Free Plan)');
    assert.ok(res.body.resume._watermark, 'Expected _watermark on resume data');
    assert.equal(res.body.resume._watermark.position, 'diagonal');
  });

  await t.test('9. Pro subscriber public review link is 100% clean and watermark-free', async () => {
    const res = await request(app)
      .get('/api/resumes/public/pub-dave-pro')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.watermark, null);
    assert.equal(res.body.resume._watermark, undefined);
  });
});
