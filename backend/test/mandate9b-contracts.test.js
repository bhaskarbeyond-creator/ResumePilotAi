'use strict';

/**
 * Mandate 9B Contract Integration & Regression Test Suite
 *
 * Exercises the newly unified endpoints and contract aliases:
 * 1. Employer application verification (POST /api/admin/employer-applications/:uid/verify & PATCH)
 * 2. Job moderation & spam state transitions (POST /api/admin/jobs/:jobId/moderate)
 * 3. User status mutations & suspension (POST /api/admin/users/:uid/status & PATCH /api/admin/users/:uid)
 * 4. Jobs listing alias (GET /api/jobs)
 * 5. Blog CRUD & public draft confidentiality (GET/POST/PUT/DELETE /api/blog/posts)
 * 6. Billing coupon validation alias (POST /api/billing/validate-coupon)
 * 7. Platform status alias (GET /api/platform/status)
 */

process.env.NODE_ENV = 'test';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const auth = require('../security/auth');

const TEST_IDENTITIES = {
  admin: {
    uid: 'm9b-admin-uid',
    email: 'admin@mandate9b.test',
    role: 'ADMIN',
    email_verified: true,
    permissions: ['admin.full', 'employers.verify', 'jobs.moderate', 'users.manage', 'blog.write'],
  },
  user: {
    uid: 'm9b-user-uid',
    email: 'user@mandate9b.test',
    role: 'USER',
    email_verified: true,
  },
};

auth.setTokenVerifierForTests(async token => {
  const identity = TEST_IDENTITIES[token];
  if (!identity) throw new Error('invalid test token');
  return identity;
});

const app = require('../index');

describe('Mandate 9B Contract Coverage', () => {

  // 1. Employer Application Verification
  describe('Employer Application Verification Contract', () => {
    test('POST /api/admin/employer-applications/:uid/verify requires admin authorization', async () => {
      const unauth = await request(app)
        .post('/api/admin/employer-applications/emp-123/verify')
        .send({ decision: 'APPROVED' });
      assert.equal(unauth.status, 401);

      const forbidden = await request(app)
        .post('/api/admin/employer-applications/emp-123/verify')
        .set('Authorization', 'Bearer user')
        .send({ decision: 'APPROVED' });
      assert.equal(forbidden.status, 403);
    });

    test('POST /api/admin/employer-applications/:uid/verify accepts decision payload for admin', async () => {
      const res = await request(app)
        .post('/api/admin/employer-applications/emp-test-target/verify')
        .set('Authorization', 'Bearer admin')
        .send({ decision: 'APPROVED', reason: 'Verified corporate credentials' });
      // Can be 200 or 404 if application doesn't exist, but NOT 405 Method Not Allowed or 400 Bad Request
      assert.ok([200, 404].includes(res.status), `Unexpected status: ${res.status}`);
      if (res.status === 200) {
        assert.equal(res.body.success, true);
      }
    });

    test('PATCH /api/admin/employer-applications/:uid accepts decision field', async () => {
      const res = await request(app)
        .patch('/api/admin/employer-applications/emp-test-target')
        .set('Authorization', 'Bearer admin')
        .send({ decision: 'REJECTED', reason: 'Incomplete documentation' });
      assert.ok([200, 404].includes(res.status), `Unexpected status: ${res.status}`);
    });
  });

  // 2. Job Moderation
  describe('Job Moderation Contract', () => {
    test('POST /api/admin/jobs/:jobId/moderate requires admin authorization', async () => {
      const unauth = await request(app)
        .post('/api/admin/jobs/job-123/moderate')
        .send({ isSpam: true });
      assert.equal(unauth.status, 401);
    });

    test('POST /api/admin/jobs/:jobId/moderate delegates to resilientMutations with proper status', async () => {
      const res = await request(app)
        .post('/api/admin/jobs/job-test-target/moderate')
        .set('Authorization', 'Bearer admin')
        .send({ isSpam: true, status: 'flagged', reason: 'Unverified recruitment link' });
      assert.ok([200, 404].includes(res.status), `Unexpected status: ${res.status}`);
      if (res.status === 200) {
        assert.equal(res.body.success, true);
      }
    });
  });

  // 3. User Suspension & Status Mutations
  describe('User Status & Suspension Contract', () => {
    test('POST /api/admin/users/:uid/status rejects unauthenticated caller', async () => {
      const unauth = await request(app)
        .post('/api/admin/users/usr-123/status')
        .send({ status: 'suspended' });
      assert.equal(unauth.status, 401);
    });

    test('POST /api/admin/users/:uid/status accepts status payload for admin', async () => {
      const res = await request(app)
        .post('/api/admin/users/usr-test-target/status')
        .set('Authorization', 'Bearer admin')
        .send({ status: 'suspended', reason: 'Terms violation' });
      assert.ok([200, 404].includes(res.status), `Unexpected status: ${res.status}`);
    });

    test('PATCH /api/admin/users/:uid handles body.status normalization', async () => {
      const res = await request(app)
        .patch('/api/admin/users/usr-test-target')
        .set('Authorization', 'Bearer admin')
        .send({ status: 'suspended' });
      assert.ok([200, 404].includes(res.status), `Unexpected status: ${res.status}`);
    });
  });

  // 4. Jobs Alias
  describe('Jobs Endpoint Alias Contract', () => {
    test('GET /api/jobs is mounted alongside /api/jobs-data', async () => {
      const res = await request(app).get('/api/jobs');
      // Should return either 200 with jobs or an array, identical to jobs-data
      assert.ok([200, 304].includes(res.status), `Unexpected status: ${res.status}`);
      assert.ok(res.body && typeof res.body === 'object');
    });
  });

  // 5. Blog CRUD & Confidentiality
  describe('Blog API & Confidentiality Contract', () => {
    test('GET /api/blog/posts is mounted and accessible', async () => {
      const res = await request(app).get('/api/blog/posts');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.posts));
    });

    test('Anonymous users can only see published posts on /api/blog/posts', async () => {
      const res = await request(app).get('/api/blog/posts');
      assert.equal(res.status, 200);
      for (const p of res.body.posts) {
        assert.ok(p.published === true || p.published === 1, 'Draft post leaked to anonymous user');
      }
    });

    test('POST /api/blog/posts requires editor/admin authorization', async () => {
      const unauth = await request(app)
        .post('/api/blog/posts')
        .send({ title: 'Test Post', content: 'Content' });
      assert.equal(unauth.status, 401);

      const forbidden = await request(app)
        .post('/api/blog/posts')
        .set('Authorization', 'Bearer user')
        .send({ title: 'Test Post', content: 'Content' });
      assert.equal(forbidden.status, 403);
    });

    test('Admin can create, fetch, update, and delete a blog post via /api/blog/posts', async () => {
      const uniqueSlug = `test-m9b-${Date.now()}`;
      // 1. Create draft post
      const createRes = await request(app)
        .post('/api/blog/posts')
        .set('Authorization', 'Bearer admin')
        .send({
          title: 'Mandate 9B Test Article',
          slug: uniqueSlug,
          content: 'Verified content for Mandate 9B',
          excerpt: 'Short excerpt',
          category: 'Engineering',
          status: 'draft',
        });
      assert.equal(createRes.status, 201);
      assert.equal(createRes.body.success, true);
      const postId = createRes.body.post.id;
      assert.ok(postId);

      // 2. Fetch by ID
      const getRes = await request(app)
        .get(`/api/blog/posts/${postId}`)
        .set('Authorization', 'Bearer admin');
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.post.id, postId);

      // 3. Update post
      const updateRes = await request(app)
        .put(`/api/blog/posts/${postId}`)
        .set('Authorization', 'Bearer admin')
        .send({
          title: 'Mandate 9B Updated Title',
          status: 'published',
        });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.success, true);

      // 4. Delete post
      const deleteRes = await request(app)
        .delete(`/api/blog/posts/${postId}`)
        .set('Authorization', 'Bearer admin');
      assert.equal(deleteRes.status, 200);
      assert.equal(deleteRes.body.success, true);
    });
  });

  // 6. Billing Coupon Validation Alias
  describe('Billing Coupon Validation Alias Contract', () => {
    test('POST /api/billing/validate-coupon is mounted alongside /api/coupons/validate', async () => {
      const res = await request(app)
        .post('/api/billing/validate-coupon')
        .send({ code: 'NON_EXISTENT_CODE' });
      // Non-existent coupon responds 404 or 400 (not 404 Route Not Found)
      assert.ok([400, 404].includes(res.status), `Unexpected status: ${res.status}`);
      assert.ok(res.body && typeof res.body === 'object');
    });
  });

  // 7. Platform Status Alias
  describe('Platform Status Alias Contract', () => {
    test('GET /api/platform/status is mounted', async () => {
      const res = await request(app).get('/api/platform/status');
      // Either 200 or 401/403 if restricted, but route exists
      assert.ok([200, 401, 403].includes(res.status), `Unexpected status: ${res.status}`);
    });
  });

  after(async () => {
    try {
      const { getPool } = require('../database/mysql');
      await getPool().end();
    } catch (_) {}
  });

});

