process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.ENTERPRISE_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString('base64');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { setPoolForTests } = require('../database/mysql');
const { resolveEffectiveEntitlement } = require('../security/entitlements');

class MockAdversarialPool {
  constructor() {
    this.reset();
  }

  reset() {
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
    this.users = new Map([
      ['superadmin-free-uid', {
        id: 'superadmin-free-uid',
        email: 'superadmin.free@example.com',
        role: 'SUPER_ADMIN',
        membership: 'Basic',
        paymentStatus: 'INACTIVE',
        membershipEnds: null,
        revision: 1
      }],
      ['admin-free-uid', {
        id: 'admin-free-uid',
        email: 'admin.free@example.com',
        role: 'ADMIN',
        membership: 'Basic',
        paymentStatus: 'INACTIVE',
        membershipEnds: null,
        revision: 1
      }],
      ['candidate-free-uid', {
        id: 'candidate-free-uid',
        email: 'candidate.free@example.com',
        role: 'USER',
        membership: 'Basic',
        paymentStatus: 'INACTIVE',
        membershipEnds: null,
        revision: 1
      }],
      ['candidate-premium-uid', {
        id: 'candidate-premium-uid',
        email: 'candidate.premium@example.com',
        role: 'USER',
        membership: 'Premium',
        paymentStatus: 'ACTIVE',
        membershipEnds: futureDate,
        revision: 1
      }],
      ['candidate-pro-uid', {
        id: 'candidate-pro-uid',
        email: 'candidate.pro@example.com',
        role: 'USER',
        membership: 'Pro',
        paymentStatus: 'ACTIVE',
        membershipEnds: futureDate,
        revision: 1
      }],
      ['enterprise-member-uid', {
        id: 'enterprise-member-uid',
        email: 'enterprise.member@example.com',
        role: 'USER',
        membership: 'Enterprise',
        paymentStatus: 'ACTIVE',
        membershipEnds: futureDate,
        revision: 1
      }],
      ['enterprise-admin-uid', {
        id: 'enterprise-admin-uid',
        email: 'enterprise.admin@example.com',
        role: 'USER',
        membership: 'Enterprise',
        paymentStatus: 'ACTIVE',
        membershipEnds: futureDate,
        revision: 1
      }],
      ['superadmin-paid-uid', {
        id: 'superadmin-paid-uid',
        email: 'superadmin.paid@example.com',
        role: 'SUPER_ADMIN',
        membership: 'Premium',
        paymentStatus: 'ACTIVE',
        membershipEnds: futureDate,
        revision: 1
      }]
    ]);

    this.resumes = new Map([
      ['resume-superadmin-free', {
        id: 'resume-superadmin-free',
        user_id: 'superadmin-free-uid',
        firstname: 'Admin',
        lastname: 'Candidate',
        template: 'Cv1',
        revision: 1,
        summary: 'Admin acting as job candidate',
        employments: JSON.stringify([{ jobTitle: 'Platform Admin', employer: 'ResumePilot HQ' }]),
        educations: JSON.stringify([]),
        skills: JSON.stringify([]),
        certifications: JSON.stringify([])
      }],
      ['resume-candidate-free', {
        id: 'resume-candidate-free',
        user_id: 'candidate-free-uid',
        firstname: 'John',
        lastname: 'Free',
        template: 'Cv1',
        revision: 1,
        summary: 'Normal free candidate',
        employments: JSON.stringify([{ jobTitle: 'Developer', employer: 'Startup Inc' }]),
        educations: JSON.stringify([]),
        skills: JSON.stringify([]),
        certifications: JSON.stringify([])
      }],
      ['resume-candidate-premium', {
        id: 'resume-candidate-premium',
        user_id: 'candidate-premium-uid',
        firstname: 'Sarah',
        lastname: 'Premium',
        template: 'Cv1',
        revision: 1,
        summary: 'Pro subscriber candidate',
        employments: JSON.stringify([{ jobTitle: 'Senior Engineer', employer: 'Tech Corp' }]),
        educations: JSON.stringify([]),
        skills: JSON.stringify([]),
        certifications: JSON.stringify([])
      }],
      ['resume-enterprise-member', {
        id: 'resume-enterprise-member',
        user_id: 'enterprise-member-uid',
        firstname: 'Emma',
        lastname: 'Enterprise',
        template: 'Cv1',
        revision: 1,
        summary: 'Enterprise corporate member',
        employments: JSON.stringify([{ jobTitle: 'Director', employer: 'Global Corp' }]),
        educations: JSON.stringify([]),
        skills: JSON.stringify([]),
        certifications: JSON.stringify([])
      }]
    ]);

    this.publicResumes = new Map();
    this.settings = new Map([
      ['public_config', {
        subscriptions: { enabled: true, state: true },
        watermark: {
          enableFreeWatermark: true,
          watermarkText: 'Created with IME365 (Free Plan)',
          opacity: 0.18,
          position: 'diagonal',
          allowFreePdfDownload: false,
          allowFreeDocxDownload: false,
          allowFreeShareLink: false
        }
      }],
      ['system_settings', {
        subscriptions: { enabled: true, state: true }
      }]
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
      // Only return if actually published (is_published === 1)
      const visible = pub && pub.is_published === 1 ? { ...pub } : null;
      return [[visible].filter(Boolean), []];
    }

    if (/^INSERT INTO public_resumes/i.test(normalized)) {
      const id = params[0];
      const updated = {
        id,
        owner_uid: params[1],
        is_published: 1,
        publication_mode: 'explicit',
        object: params[2],
        source_revision: params[3],
        publication_revision: 1,
        published_at: new Date(),
        updated_at: new Date()
      };
      this.publicResumes.set(id, updated);
      return [{ affectedRows: 1 }, []];
    }

    if (/^UPDATE public_resumes SET is_published = 0/i.test(normalized)) {
      const id = params[1];
      const existing = this.publicResumes.get(id);
      if (existing) {
        this.publicResumes.set(id, { ...existing, is_published: 0 });
      }
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

const mockPool = new MockAdversarialPool();
setPoolForTests(mockPool);

setTokenVerifierForTests(async (token) => {
  const now = Math.floor(Date.now() / 1000);
  const user = mockPool.users.get(token);
  if (user) {
    return {
      uid: user.id,
      email: user.email,
      email_verified: true,
      role: user.role,
      superAdmin: user.role === 'SUPER_ADMIN',
      admin: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
      auth_time: now
    };
  }
  return null;
});

const app = require('../index');

test('ADVERSARIAL CERTIFICATION SUITE — 10/10 Verification', async (t) => {
  mockPool.reset();

  // -------------------------------------------------------------
  // 1. ENTITLEMENT MUST BE SEPARATE FROM ROLE
  // -------------------------------------------------------------
  await t.test('1. Entitlement Separation from Role', async (sub) => {
    // 1A. SUPER_ADMIN + Basic + INACTIVE -> Free
    const superAdminFree = mockPool.users.get('superadmin-free-uid');
    const entSuperAdmin = resolveEffectiveEntitlement(superAdminFree, { userClaims: { role: 'SUPER_ADMIN', superAdmin: true } });
    assert.equal(entSuperAdmin.effectiveTier, 'Basic', 'SUPER_ADMIN with Basic membership must resolve to Basic candidate tier');
    assert.equal(entSuperAdmin.isPremium, false, 'SUPER_ADMIN with Basic membership must have isPremium = false');
    assert.equal(entSuperAdmin.allowsDocxExport, false, 'SUPER_ADMIN with Basic membership must NOT be granted docx export');
    assert.equal(entSuperAdmin.removesWatermark, false, 'SUPER_ADMIN with Basic membership must NOT have watermark removed');
    assert.equal(entSuperAdmin.isAdmin, true, 'isAdmin must remain true for administrative permissions');

    // 1B. normal candidate + Basic + INACTIVE -> Free
    const candFree = mockPool.users.get('candidate-free-uid');
    const entCandFree = resolveEffectiveEntitlement(candFree, { userClaims: { role: 'USER' } });
    assert.equal(entCandFree.effectiveTier, 'Basic');
    assert.equal(entCandFree.isPremium, false);
    assert.equal(entCandFree.allowsDocxExport, false);
    assert.equal(entCandFree.removesWatermark, false);

    // 1C. normal candidate + Premium/Pro + ACTIVE -> Premium
    const candPrem = mockPool.users.get('candidate-premium-uid');
    const entCandPrem = resolveEffectiveEntitlement(candPrem, { userClaims: { role: 'USER' } });
    assert.equal(entCandPrem.effectiveTier, 'Premium');
    assert.equal(entCandPrem.isPremium, true);
    assert.equal(entCandPrem.allowsDocxExport, true);
    assert.equal(entCandPrem.removesWatermark, true);

    // 1D. Enterprise member -> Enterprise
    const entMember = mockPool.users.get('enterprise-member-uid');
    const entEnterprise = resolveEffectiveEntitlement(entMember, { userClaims: { role: 'USER' }, tenantData: { id: 'tenant-01' } });
    assert.equal(entEnterprise.effectiveTier, 'Enterprise');
    assert.equal(entEnterprise.isPremium, true);
    assert.equal(entEnterprise.allowsDocxExport, true);
    assert.equal(entEnterprise.removesWatermark, true);

    // 1E. SUPER_ADMIN + Paid Subscription -> Admin with full privileges
    const superAdminPaid = mockPool.users.get('superadmin-paid-uid');
    const entPaidAdmin = resolveEffectiveEntitlement(superAdminPaid, { userClaims: { role: 'SUPER_ADMIN', superAdmin: true } });
    assert.equal(entPaidAdmin.effectiveTier, 'Admin');
    assert.equal(entPaidAdmin.isPremium, true);
    assert.equal(entPaidAdmin.allowsDocxExport, true);
    assert.equal(entPaidAdmin.removesWatermark, true);
  });

  // -------------------------------------------------------------
  // 2. ADMIN TOGGLE DYNAMIC VERIFICATION (OFF -> ON -> OFF)
  // -------------------------------------------------------------
  await t.test('2. Admin Toggle Dynamic Cycle: OFF -> ON -> OFF', async (sub) => {
    const freeToken = 'candidate-free-uid';

    // Phase 1: PDF toggle cycle
    // OFF -> 402
    mockPool.settings.set('public_config', { subscriptions: { enabled: true, state: true }, watermark: { allowFreePdfDownload: false } });
    let res = await request(app).post('/api/export').set('Authorization', `Bearer ${freeToken}`).send({ resumeId: 'resume-candidate-free', resumeName: 'Cv1' });
    assert.equal(res.status, 402, 'PDF Export must return 402 when allowFreePdfDownload is OFF');

    // ON -> 200 / moves to pipeline
    mockPool.settings.set('public_config', { subscriptions: { enabled: true, state: true }, watermark: { allowFreePdfDownload: true } });
    res = await request(app).post('/api/export').set('Authorization', `Bearer ${freeToken}`).send({ resumeId: 'resume-candidate-free', resumeName: 'Cv1' });
    assert.notEqual(res.status, 402, 'PDF Export must NOT return 402 when allowFreePdfDownload is ON');

    // OFF again -> 402
    mockPool.settings.set('public_config', { subscriptions: { enabled: true, state: true }, watermark: { allowFreePdfDownload: false } });
    res = await request(app).post('/api/export').set('Authorization', `Bearer ${freeToken}`).send({ resumeId: 'resume-candidate-free', resumeName: 'Cv1' });
    assert.equal(res.status, 402, 'PDF Export must return 402 when allowFreePdfDownload is turned back OFF');

    // Phase 2: DOCX toggle cycle
    // OFF -> 402
    mockPool.settings.set('public_config', { subscriptions: { enabled: true, state: true }, watermark: { allowFreeDocxDownload: false } });
    res = await request(app).post('/api/export-docx').set('Authorization', `Bearer ${freeToken}`).send({ resumeId: 'resume-candidate-free', resumeName: 'Cv1' });
    assert.equal(res.status, 402, 'DOCX Export must return 402 when allowFreeDocxDownload is OFF');

    // ON -> 200 binary
    mockPool.settings.set('public_config', { subscriptions: { enabled: true, state: true }, watermark: { allowFreeDocxDownload: true } });
    res = await request(app).post('/api/export-docx').set('Authorization', `Bearer ${freeToken}`).send({ resumeId: 'resume-candidate-free', resumeName: 'Cv1' });
    assert.equal(res.status, 200, 'DOCX Export must return 200 when allowFreeDocxDownload is ON');
    assert.match(res.headers['content-type'], /vnd\.openxmlformats-officedocument/);

    // OFF again -> 402
    mockPool.settings.set('public_config', { subscriptions: { enabled: true, state: true }, watermark: { allowFreeDocxDownload: false } });
    res = await request(app).post('/api/export-docx').set('Authorization', `Bearer ${freeToken}`).send({ resumeId: 'resume-candidate-free', resumeName: 'Cv1' });
    assert.equal(res.status, 402, 'DOCX Export must return 402 when allowFreeDocxDownload is turned back OFF');
  });

  // -------------------------------------------------------------
  // 3. FRONTEND MUST NOT BE THE AUTHORITY (BYPASS RESISTANCE)
  // -------------------------------------------------------------
  await t.test('3. Frontend Bypass Resistance: Direct API calls rejected regardless of client claims', async () => {
    const freeToken = 'candidate-free-uid';
    mockPool.settings.set('public_config', {
      subscriptions: { enabled: true, state: true },
      watermark: { allowFreePdfDownload: false, allowFreeDocxDownload: false }
    });

    // Attacker sends spoofed claims in body
    const spoofedBody = {
      resumeId: 'resume-candidate-free',
      resumeName: 'Cv1',
      membership: 'Enterprise',
      isPremium: true,
      role: 'SUPER_ADMIN',
      paymentStatus: 'ACTIVE'
    };

    // PDF direct API call with spoofed claims -> still 402
    const pdfRes = await request(app).post('/api/export').set('Authorization', `Bearer ${freeToken}`).send(spoofedBody);
    assert.equal(pdfRes.status, 402, 'Server must ignore client-side spoofed membership claims for PDF');

    // DOCX direct API call with spoofed claims -> still 402
    const docxRes = await request(app).post('/api/export-docx').set('Authorization', `Bearer ${freeToken}`).send(spoofedBody);
    assert.equal(docxRes.status, 402, 'Server must ignore client-side spoofed membership claims for DOCX');
  });

  // -------------------------------------------------------------
  // 4. DOCX OOXML INTEGRITY MATRIX
  // -------------------------------------------------------------
  await t.test('4. DOCX Matrix: Valid OOXML generated for allowed tiers and toggles', async () => {
    // 4A. Premium user gets valid DOCX with toggle OFF
    mockPool.settings.set('public_config', { subscriptions: { enabled: true, state: true }, watermark: { allowFreeDocxDownload: false } });
    const premRes = await request(app)
      .post('/api/export-docx')
      .set('Authorization', 'Bearer candidate-premium-uid')
      .send({ resumeId: 'resume-candidate-premium', resumeName: 'Cv1' })
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    assert.equal(premRes.status, 200, `Premium DOCX expected 200, got ${premRes.status}`);
    assert.match(premRes.headers['content-type'], /vnd\.openxmlformats-officedocument/, 'Content-Type must be OOXML');
    assert.ok(premRes.body.length > 1000, `DOCX must have substantial binary size (got ${premRes.body.length} bytes)`);
    // Verify PK zip header for OOXML (.docx is a zip package)
    assert.equal(premRes.body[0], 0x50, 'Must start with PK (zip header byte 0)');
    assert.equal(premRes.body[1], 0x4B, 'Must start with PK (zip header byte 1)');

    // 4B. Enterprise user gets valid DOCX with toggle OFF
    const entRes = await request(app)
      .post('/api/export-docx')
      .set('Authorization', 'Bearer enterprise-member-uid')
      .send({ resumeId: 'resume-enterprise-member', resumeName: 'Cv1' })
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    assert.equal(entRes.status, 200);
    assert.equal(entRes.body[0], 0x50);
    assert.equal(entRes.body[1], 0x4B);

    // 4C. Free user gets valid DOCX when toggle is ON
    mockPool.settings.set('public_config', { subscriptions: { enabled: true, state: true }, watermark: { allowFreeDocxDownload: true } });
    const freeRes = await request(app)
      .post('/api/export-docx')
      .set('Authorization', 'Bearer candidate-free-uid')
      .send({ resumeId: 'resume-candidate-free', resumeName: 'Cv1' })
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    assert.equal(freeRes.status, 200);
    assert.equal(freeRes.body[0], 0x50);
    assert.equal(freeRes.body[1], 0x4B);
  });

  // -------------------------------------------------------------
  // 5. SHARE SECURITY & CANONICAL IMPLEMENTATION
  // -------------------------------------------------------------
  await t.test('5. Share Security: Ownership, Public snapshot, Revocation', async () => {
    // 5A. User A publishes own resume -> 200
    const pubRes = await request(app)
      .post('/api/resumes/resume-candidate-free/publish')
      .set('Authorization', 'Bearer candidate-free-uid')
      .send({ firstname: 'John', lastname: 'Free' });
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.isPublished, true);

    // 5B. User A attempts to publish User B's resume -> 404
    const idorPubRes = await request(app)
      .post('/api/resumes/resume-candidate-premium/publish')
      .set('Authorization', 'Bearer candidate-free-uid')
      .send({ firstname: 'Hacked' });
    assert.equal(idorPubRes.status, 404, 'Must reject publishing another user resume with 404');

    // 5C. Anonymous visitor fetches public resume -> 200
    const anonRes = await request(app).get('/api/resumes/public/resume-candidate-free');
    assert.equal(anonRes.status, 200);
    assert.equal(anonRes.body.publication?.isPublished, true);
    assert.equal(anonRes.body.resume?.firstname, 'John');

    // 5D. User A unpublishes resume -> 200
    const unpubRes = await request(app)
      .post('/api/resumes/resume-candidate-free/unpublish')
      .set('Authorization', 'Bearer candidate-free-uid')
      .send({});
    assert.equal(unpubRes.status, 200);

    // 5E. Anonymous visitor attempts to fetch revoked resume -> 404
    const revokedRes = await request(app).get('/api/resumes/public/resume-candidate-free');
    assert.equal(revokedRes.status, 404, 'Revoked resume must return 404');
  });
});
