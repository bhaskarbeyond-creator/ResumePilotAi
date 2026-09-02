process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.ENTERPRISE_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString('base64');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { setPoolForTests } = require('../database/mysql');

// Setup auth verifier for testing users
setTokenVerifierForTests(async (token) => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'free-user-token') {
    return { uid: 'free-user-uid', email: 'free@example.com', email_verified: true, role: 'USER', auth_time: now };
  }
  if (token === 'premium-user-token') {
    return { uid: 'premium-user-uid', email: 'premium@example.com', email_verified: true, role: 'USER', auth_time: now };
  }
  if (token === 'enterprise-user-token') {
    return { uid: 'enterprise-user-uid', email: 'enterprise@example.com', email_verified: true, role: 'USER', auth_time: now };
  }
  if (token === 'attacker-token') {
    return { uid: 'attacker-uid', email: 'attacker@example.com', email_verified: true, role: 'USER', auth_time: now };
  }
  throw new Error('invalid token');
});

class MockMariaDbPool {
  constructor() {
    this.reset();
  }

  reset() {
    const futureDate = new Date(Date.now() + 30 * 86400 * 1000);
    this.users = new Map([
      ['free-user-uid', {
        id: 'free-user-uid',
        email: 'free@example.com',
        role: 'USER',
        membership: 'Basic',
        paymentStatus: 'UNPAID',
        membershipEnds: null,
        revision: 1
      }],
      ['premium-user-uid', {
        id: 'premium-user-uid',
        email: 'premium@example.com',
        role: 'USER',
        membership: 'Pro',
        paymentStatus: 'ACTIVE',
        membershipEnds: futureDate,
        revision: 1
      }],
      ['enterprise-user-uid', {
        id: 'enterprise-user-uid',
        email: 'enterprise@example.com',
        role: 'USER',
        membership: 'Enterprise',
        paymentStatus: 'ACTIVE',
        membershipEnds: futureDate,
        revision: 1
      }],
      ['attacker-uid', {
        id: 'attacker-uid',
        email: 'attacker@example.com',
        role: 'USER',
        membership: 'Basic',
        paymentStatus: 'UNPAID',
        membershipEnds: null,
        revision: 1
      }]
    ]);

    this.resumes = new Map([
      ['resume-free-01', {
        id: 'resume-free-01',
        user_id: 'free-user-uid',
        firstname: 'Free',
        lastname: 'Candidate',
        template: 'Cv1',
        revision: 1,
        summary: 'Software developer resume',
        employments: JSON.stringify([{ jobTitle: 'Developer', employer: 'Tech Co' }]),
        educations: JSON.stringify([]),
        skills: JSON.stringify([]),
        certifications: JSON.stringify([])
      }],
      ['resume-premium-01', {
        id: 'resume-premium-01',
        user_id: 'premium-user-uid',
        firstname: 'Premium',
        lastname: 'Candidate',
        template: 'Cv1',
        revision: 1,
        summary: 'Senior engineer resume',
        employments: JSON.stringify([{ jobTitle: 'Senior Engineer', employer: 'Apex Labs' }]),
        educations: JSON.stringify([]),
        skills: JSON.stringify([]),
        certifications: JSON.stringify([])
      }],
      ['resume-enterprise-01', {
        id: 'resume-enterprise-01',
        user_id: 'enterprise-user-uid',
        firstname: 'Enterprise',
        lastname: 'Leader',
        template: 'Cv1',
        revision: 1,
        summary: 'Enterprise engineering director',
        employments: JSON.stringify([{ jobTitle: 'Director', employer: 'Global Corp' }]),
        educations: JSON.stringify([]),
        skills: JSON.stringify([]),
        certifications: JSON.stringify([])
      }]
    ]);

    this.publicResumes = new Map();
    this.settings = new Map([
      ['public_config', { subscriptions: { enabled: true, state: true } }],
      ['system_settings', { subscriptions: { enabled: true, state: true } }]
    ]);
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();

    if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(normalized)) {
      const user = this.users.get(params[0]);
      return [[user ? { ...user } : null].filter(Boolean), []];
    }

    if (/^SELECT \* FROM resumes WHERE id = \? AND user_id = \? LIMIT 1$/i.test(normalized) ||
        /^SELECT \* FROM resumes WHERE id = \? AND user_id = \? FOR UPDATE$/i.test(normalized)) {
      const resume = this.resumes.get(params[0]);
      const match = resume && resume.user_id === params[1] ? { ...resume } : null;
      return [[match].filter(Boolean), []];
    }

    if (/^SELECT \* FROM resumes WHERE id = \? LIMIT 1$/i.test(normalized)) {
      const resume = this.resumes.get(params[0]);
      return [[resume ? { ...resume } : null].filter(Boolean), []];
    }

    if (/^SELECT \* FROM public_resumes WHERE id = \? LIMIT 1$/i.test(normalized) ||
        /^SELECT \* FROM public_resumes WHERE id = \? FOR UPDATE$/i.test(normalized)) {
      const pub = this.publicResumes.get(params[0]);
      return [[pub ? { ...pub } : null].filter(Boolean), []];
    }

    if (/^INSERT INTO public_resumes/i.test(normalized)) {
      const id = params[0];
      const existing = this.publicResumes.get(id) || {};
      const updated = {
        id,
        owner_uid: params[1],
        is_published: 1,
        publication_mode: 'explicit',
        object: params[2],
        source_revision: params[3],
        publication_revision: (existing.publication_revision || 0) + 1,
        published_at: new Date(),
        updated_at: new Date()
      };
      this.publicResumes.set(id, updated);
      return [{ affectedRows: 1 }, []];
    }

    if (/^UPDATE public_resumes SET is_published = 0/i.test(normalized)) {
      const pubRev = params[0];
      const id = params[1];
      const existing = this.publicResumes.get(id) || {};
      this.publicResumes.set(id, {
        ...existing,
        is_published: 0,
        publication_revision: pubRev,
        updated_at: new Date()
      });
      return [{ affectedRows: 1 }, []];
    }

    if (/^SELECT \* FROM system_settings WHERE category = \? LIMIT 1$/i.test(normalized) ||
        /^SELECT \* FROM settings WHERE setting_key = \? LIMIT 1$/i.test(normalized)) {
      const setting = this.settings.get(params[0]);
      return [[setting ? { category: params[0], setting_key: params[0], data: JSON.stringify(setting), value: JSON.stringify(setting) } : null].filter(Boolean), []];
    }

    return [[], []];
  }

  async getConnection() {
    return {
      query: this.query.bind(this),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };
  }
}

const mockPool = new MockMariaDbPool();
setPoolForTests(mockPool);

const app = require('../index');

test('CROSS-APPLICATION AUDIT: Entitlement, Download, Share & Security Invariants', async (t) => {
  mockPool.reset();

  await t.test('TEST A: Free user -> POST /api/export-docx -> HTTP 402 ACTIVE_SUBSCRIPTION_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/export-docx')
      .set('Authorization', 'Bearer free-user-token')
      .send({ resumeId: 'resume-free-01', resumeName: 'Cv1' });

    assert.equal(res.status, 402);
    assert.equal(res.body.error?.code, 'ACTIVE_SUBSCRIPTION_REQUIRED');
  });

  await t.test('TEST A2: Free user with allowFreeDocxDownload: true -> POST /api/export-docx -> HTTP 200 authorized', async () => {
    mockPool.settings.set('public_config', {
      subscriptions: { enabled: true, state: true },
      watermark: { allowFreeDocxDownload: true }
    });

    const res = await request(app)
      .post('/api/export-docx')
      .set('Authorization', 'Bearer free-user-token')
      .send({ resumeId: 'resume-free-01', resumeName: 'Cv1' });

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);

    // Reset settings
    mockPool.settings.set('public_config', {
      subscriptions: { enabled: true, state: true },
      watermark: { allowFreeDocxDownload: false }
    });
  });

  await t.test('TEST B: Free user -> POST /api/export (PDF) -> HTTP 402 ACTIVE_SUBSCRIPTION_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/export')
      .set('Authorization', 'Bearer free-user-token')
      .send({ resumeId: 'resume-free-01', resumeName: 'Cv1', language: 'en' });

    assert.equal(res.status, 402);
    assert.equal(res.body.error?.code, 'ACTIVE_SUBSCRIPTION_REQUIRED');
  });

  await t.test('TEST B2: Free user with allowFreePdfDownload: true -> Entitlement granted (proceeds to export pipeline)', async () => {
    mockPool.settings.set('public_config', {
      subscriptions: { enabled: true, state: true },
      watermark: { allowFreePdfDownload: true, enableFreeWatermark: true }
    });

    const res = await request(app)
      .post('/api/export')
      .set('Authorization', 'Bearer free-user-token')
      .send({ resumeId: 'resume-free-01', resumeName: 'Cv1', language: 'en' });

    assert.notEqual(res.status, 402, 'Must NOT return 402 when allowFreePdfDownload is true');

    // Reset settings
    mockPool.settings.set('public_config', {
      subscriptions: { enabled: true, state: true },
      watermark: { allowFreePdfDownload: false }
    });
  });

  await t.test('TEST C1: Premium user -> POST /api/export-docx -> HTTP 200 DOCX binary authorized', async () => {
    const res = await request(app)
      .post('/api/export-docx')
      .set('Authorization', 'Bearer premium-user-token')
      .send({ resumeId: 'resume-premium-01', resumeName: 'Cv1' });

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
    assert.ok(Number(res.headers['content-length']) > 0);
  });

  await t.test('TEST C2: Enterprise user -> POST /api/export-docx -> HTTP 200 DOCX binary authorized', async () => {
    const res = await request(app)
      .post('/api/export-docx')
      .set('Authorization', 'Bearer enterprise-user-token')
      .send({ resumeId: 'resume-enterprise-01', resumeName: 'Cv1' });

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
    assert.ok(Number(res.headers['content-length']) > 0);
  });

  await t.test('TEST F: IDOR Defense: Attacker cannot export or publish another user resume', async () => {
    // Attacker tries to export premium user's resume
    const exportRes = await request(app)
      .post('/api/export-docx')
      .set('Authorization', 'Bearer attacker-token')
      .send({ resumeId: 'resume-premium-01', resumeName: 'Cv1' });
    assert.equal(exportRes.status, 404, 'Must return 404 when requesting another user resume');

    // Attacker tries to publish premium user's resume
    const publishRes = await request(app)
      .post('/api/resumes/resume-premium-01/publish')
      .set('Authorization', 'Bearer attacker-token')
      .send({ firstname: 'Hacked', lastname: 'Snapshot' });
    assert.equal(publishRes.status, 404, 'Must reject publishing of another user resume');
  });

  await t.test('TEST E: Canonical Share Flow: Owner publishes resume -> public endpoint serves authorized snapshot', async () => {
    const pubRes = await request(app)
      .post('/api/resumes/resume-free-01/publish')
      .set('Authorization', 'Bearer free-user-token')
      .send({});

    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.isPublished, true);
    assert.ok(pubRes.body.publicationRevision >= 1);

    // Anonymous visitor fetches the public resume
    const anonRes = await request(app)
      .get('/api/resumes/public/resume-free-01');

    assert.equal(anonRes.status, 200);
    assert.equal(anonRes.body.publication?.isPublished, true);
    assert.equal(anonRes.body.resume.firstname, 'Free');
    assert.equal(anonRes.body.resume.summary, 'Software developer resume');
    // Ensure sensitive internal fields are not exposed in public payload
    assert.equal(anonRes.body.ownerUid, undefined);
  });

  await t.test('TEST G: Revocation: Owner unpublishes resume -> public endpoint returns HTTP 404', async () => {
    const unpubRes = await request(app)
      .post('/api/resumes/resume-free-01/unpublish')
      .set('Authorization', 'Bearer free-user-token');

    assert.equal(unpubRes.status, 200);
    assert.equal(unpubRes.body.isPublished, false);

    // Anonymous visitor fetches the unpublished resume
    const anonRes = await request(app)
      .get('/api/resumes/public/resume-free-01');

    assert.equal(anonRes.status, 404);
  });
});
