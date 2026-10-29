'use strict';

/**
 * Recruiter Candidate Notification Service (DISC-028 / DISC-044)
 * POST /api/employer/candidates/:id/notify with backward-compatible alias
 * POST /api/notify/email
 *
 * Runs against the full Express app with test doubles for identity, the
 * repository and the mail gateway — no SMTP server and no MariaDB required.
 */

process.env.NODE_ENV = 'test';
process.env.IN_MEMORY_REPOSITORY = '1';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const auth = require('../security/auth');
const mailer = require('../services/mailer');
const repositories = require('../repositories');

const IDENTITIES = {
  employer: {
    uid: 'emp-1',
    email: 'employer@rn-test.local',
    role: 'EMPLOYER',
    email_verified: true,
    permissions: ['jobs.manage', 'applications.review', 'candidates.contact'],
  },
  otherEmployer: {
    uid: 'emp-2',
    email: 'employer-2@rn-test.local',
    role: 'EMPLOYER',
    email_verified: true,
    permissions: ['jobs.manage', 'applications.review', 'candidates.contact'],
  },
  admin: {
    uid: 'adm-1',
    email: 'admin@rn-test.local',
    role: 'ADMIN',
    email_verified: true,
    permissions: ['system.config.write', 'audit.read'],
  },
  user: {
    uid: 'usr-1',
    email: 'user@rn-test.local',
    role: 'USER',
    email_verified: true,
    permissions: ['resumes.manage'],
  },
};

const app = require('../index');

async function seedRepository() {
  const repository = repositories.getRepository();
  await repository.saveApplication('app-1', {
    id: 'app-1',
    jobId: 'job-1',
    employerId: 'emp-1',
    userId: 'cand-1',
    applicantId: 'cand-1',
    applicantName: 'Jane Doe',
    applicantEmail: 'candidate@rn-test.local',
    status: 'pending',
  });
  // An application with no employer link (defensive: should not happen in MySQL,
  // but the route must fail closed on missing ownership data).
  await repository.saveApplication('app-orphan', {
    id: 'app-orphan',
    jobId: 'job-9',
    employerId: '',
    userId: 'cand-9',
    applicantId: 'cand-9',
    status: 'pending',
  });
  return repository;
}

function authorize(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Recruiter Candidate Notification Service', () => {

  beforeEach(async () => {
    auth.setTokenVerifierForTests(async token => {
      const identity = IDENTITIES[token];
      if (!identity) throw new Error('Unknown test token');
      return identity;
    });
    mailer.setSendMailForTests(async () => ({ messageId: 'msg_stub_0001', accepted: ['candidate@rn-test.local'] }));
    await seedRepository();
  });

  afterEach(() => {
    mailer.resetSendMailForTests();
  });

  describe('authentication', () => {
    it('rejects unauthenticated callers on the primary route with 401', async () => {
      const res = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 401);
    });

    it('rejects unauthenticated callers on the legacy alias with 401', async () => {
      const res = await request(app)
        .post('/api/notify/email')
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 401);
    });

    it('rejects a non-employer, non-admin caller with 403', async () => {
      const res = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('user'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 403);
    });
  });

  describe('payload validation', () => {
    it('returns 400 INVALID_NOTIFICATION_PAYLOAD when message is missing', async () => {
      const res = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_NOTIFICATION_PAYLOAD');
    });

    it('returns 400 when recipient email is missing or malformed', async () => {
      const noEmail = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-1', subject: 'Hi', message: 'Hello' });
      assert.equal(noEmail.status, 400);
      assert.equal(noEmail.body.error.code, 'INVALID_NOTIFICATION_PAYLOAD');

      const badEmail = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-1', recipientEmail: 'not-an-email', subject: 'Hi', message: 'Hello' });
      assert.equal(badEmail.status, 400);
      assert.equal(badEmail.body.error.code, 'INVALID_NOTIFICATION_PAYLOAD');
    });

    it('returns 400 when subject exceeds 200 characters or message exceeds 5000', async () => {
      const longSubject = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'x'.repeat(201), message: 'Hello' });
      assert.equal(longSubject.status, 400);
      assert.equal(longSubject.body.error.code, 'INVALID_NOTIFICATION_PAYLOAD');

      const longMessage = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'x'.repeat(5001) });
      assert.equal(longMessage.status, 400);
      assert.equal(longMessage.body.error.code, 'INVALID_NOTIFICATION_PAYLOAD');
    });

    it('returns 400 when candidateId is missing', async () => {
      const res = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({ recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_NOTIFICATION_PAYLOAD');
    });
  });

  describe('ownership', () => {
    it('returns 404 when the candidate application does not exist', async () => {
      const res = await request(app)
        .post('/api/employer/candidates/app-missing/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-missing', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 404);
    });

    it('returns 403 when the employer does not own the application', async () => {
      const res = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('otherEmployer'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });
  });

  describe('dispatch', () => {
    it('dispatches a valid notification for an employer with 200', async () => {
      const res = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({
          candidateId: 'app-1',
          recipientEmail: 'candidate@rn-test.local',
          subject: 'Next steps',
          message: 'Hello Jane, we would like to move forward.',
          template: 'custom_message',
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.messageId, 'msg_stub_0001');
      assert.ok(res.body.dispatchedAt);
      assert.notStrictEqual(new Date(res.body.dispatchedAt).toISOString(), 'Invalid Date');
    });

    it('dispatches a valid notification for an administrator with 200', async () => {
      const res = await request(app)
        .post('/api/notify/email')
        .set(authorize('admin'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.messageId);
    });

    it('uses candidateId from the body when the path id differs', async () => {
      const res = await request(app)
        .post('/api/employer/candidates/ignored/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    it('never returns 200 when the mailer gateway fails', async () => {
      mailer.setSendMailForTests(async () => {
        throw new Error('SMTP connection refused');
      });
      const res = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'MAILER_GATEWAY_UNAVAILABLE');
      assert.ok(/not dispatched/.test(res.body.error.message));
    });

    it('surfaces mailer configuration absence as a gateway failure, not success', async () => {
      mailer.resetSendMailForTests();
      process.env.SMTP_HOST = '';
      const res = await request(app)
        .post('/api/employer/candidates/app-1/notify')
        .set(authorize('employer'))
        .send({ candidateId: 'app-1', recipientEmail: 'candidate@rn-test.local', subject: 'Hi', message: 'Hello' });
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'MAILER_GATEWAY_UNAVAILABLE');
      delete process.env.SMTP_HOST;
    });
  });

});
