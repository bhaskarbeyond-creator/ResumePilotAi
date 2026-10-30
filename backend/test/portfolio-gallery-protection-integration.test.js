'use strict';

/**
 * Domain C Complete Verification Suite:
 * - FP-C07: Portfolio Case Study Gallery & Media Upload (Module 17)
 * - FP-C10: Portfolio Password Protection Challenge & Bcrypt/PBKDF2 Verifier (Module 19)
 *
 * Verifies live MariaDB integration against `airesume_test`:
 * - Migration 042: `portfolios.password_hash` & `portfolio_media` relational table
 * - PBKDF2-SHA512 password hashing & constant-time verification
 * - Owner password set/clear lifecycle
 * - Public redacted challenge stub on locked portfolios
 * - Public unlocking via POST /unlock and X-Portfolio-Password header
 * - Owner media upload, MIME enforcement, 5MB file-size guard, ordering, deletion
 * - Public gallery access respecting password locks
 */

process.env.NODE_ENV = 'test';
process.env.RUN_MARIADB_INTEGRATION = 'true';
process.env.MARIADB_TEST_ALLOW_RESET = 'true';
process.env.SESSION_REVOCATION_IN_TEST = 'true';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
process.env.DB_NAME = process.env.DB_NAME || 'airesume_test';

const assert = require('node:assert/strict');
const request = require('supertest');

const fixtures = require('./helpers/mandate11a');
const { mariaTest, bearer, IDENTITIES, newId } = fixtures;

if (fixtures.isMariaEnabled()) fixtures.requireDisposableTarget();

fixtures.installIdentities();

const { getPool } = require('../database/mysql');
const app = require('../index');
const protectionService = require('../services/portfolioProtectionService');

let pool;
const testPortfolioId = newId('portfolio');
const rivalPortfolioId = newId('portfolio');
const testSlug = `gallery-prot-${Date.now().toString(36)}`;
let originalConfig = null;

async function setup() {
  pool = getPool();
  await fixtures.seedUsers(pool);

  // Enable portfolio module in system_settings if disabled
  const config = await pool.query('SELECT data FROM system_settings WHERE category = ? LIMIT 1', ['public_config']);
  const row = config[0][0];
  originalConfig = row ? row.data : null;
  const parsed = row ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : {};
  parsed.modules = { ...(parsed.modules || {}), enablePortfolioModule: true };
  await pool.query(
    `INSERT INTO system_settings (category, data, revision, updated_at) VALUES ('public_config', ?, 1, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
    [JSON.stringify(parsed)]
  );

  // Clean test portfolios
  await pool.query('DELETE FROM portfolio_media WHERE portfolio_id IN (?, ?)', [testPortfolioId, rivalPortfolioId]);
  await pool.query('DELETE FROM portfolios WHERE id IN (?, ?) OR slug = ?', [testPortfolioId, rivalPortfolioId, testSlug]);

  // Seed test portfolio with canonical data
  const canonicalData = {
    canonical: {
      template: 'modern-minimal',
      heading: {
        firstname: 'Alex',
        lastname: 'Morgan',
        fullName: 'Alex Morgan',
        occupation: 'Lead Systems Architect',
        email: 'alex@example.com',
        phone: '+1-555-0199',
      },
      summary: 'Confidential executive profile with proprietary architectures.',
      experiences: [
        { id: 'exp-1', jobTitle: 'Principal Architect', employer: 'Stealth AI', begin: '2022', end: 'Present' },
      ],
      education: [
        { id: 'edu-1', school: 'MIT', degree: 'M.S. Computer Science', started: '2016', finished: '2018' },
      ],
      skills: [{ id: 'sk-1', name: 'Distributed Systems', rating: 95 }],
      projects: [{ id: 'proj-1', title: 'High-Throughput Matching Engine', link: 'https://example.com' }],
    },
  };

  const portfolioDocument = {
    title: 'Confidential Portfolio',
    slug: testSlug,
    theme: 'modern-minimal',
    isPublished: true,
    metadata: { seoTitle: 'Alex Morgan · Architect', description: 'Classified candidate profile', tags: [] },
    data: canonicalData,
  };

  await pool.query(
    `INSERT INTO portfolios (id, user_id, title, slug, theme, is_published, published_at, data, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'modern-minimal', 1, CURRENT_TIMESTAMP, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      testPortfolioId,
      IDENTITIES.owner.uid,
      'Confidential Portfolio',
      testSlug,
      JSON.stringify(portfolioDocument),
    ]
  );

  // Seed rival portfolio belonging to different user
  const rivalDocument = {
    title: 'Rival Portfolio',
    slug: `rival-${testSlug}`,
    theme: 'modern-minimal',
    isPublished: true,
    metadata: { seoTitle: 'Rival Work', tags: [] },
    data: canonicalData,
  };

  await pool.query(
    `INSERT INTO portfolios (id, user_id, title, slug, theme, is_published, published_at, data, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'modern-minimal', 1, CURRENT_TIMESTAMP, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      rivalPortfolioId,
      IDENTITIES.other.uid,
      'Rival Portfolio',
      `rival-${testSlug}`,
      JSON.stringify(rivalDocument),
    ]
  );
}

async function teardown() {
  if (pool) {
    await pool.query('DELETE FROM portfolio_media WHERE portfolio_id IN (?, ?)', [testPortfolioId, rivalPortfolioId]);
    await pool.query('DELETE FROM portfolios WHERE id IN (?, ?) OR slug = ?', [testPortfolioId, rivalPortfolioId, testSlug]);
    if (originalConfig !== null) {
      await pool.query('UPDATE system_settings SET data = ? WHERE category = ?', [originalConfig, 'public_config']);
    }
  }
}

mariaTest('FP-C10 & FP-C07: Portfolio Password Protection & Case Study Media Gallery Integration', async (t) => {
  try {
    await setup();
  } catch (err) {
    console.error('SETUP ERROR OCCURRED:', err);
    throw err;
  }

  await t.test('1. PBKDF2 Password Hashing & Constant-Time Verification', () => {
    const rawPass = 'SecretP@ssw0rd2026!';
    const hashed = protectionService.hashPassword(rawPass);

    assert.ok(hashed.startsWith('pbkdf2$sha512$100000$'), 'Hash must use PBKDF2-SHA512 format with 100,000 iterations');
    assert.equal(protectionService.verifyPassword(rawPass, hashed), true, 'Valid password must verify');
    assert.equal(protectionService.verifyPassword('WrongP@ssword!', hashed), false, 'Wrong password must be rejected');
    assert.equal(protectionService.verifyPassword('', hashed), false, 'Empty password must be rejected');
    assert.equal(protectionService.verifyPassword(null, hashed), false, 'Null password must be rejected');
  });

  await t.test('2. Owner sets portfolio password and verifies DB persistence', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${testPortfolioId}/password`)
      .set(bearer('owner'))
      .send({ password: 'CandidateVault2026!' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isPasswordProtected, true);

    // Verify raw hash in MariaDB
    const [rows] = await pool.query('SELECT password_hash FROM portfolios WHERE id = ?', [testPortfolioId]);
    assert.ok(rows[0].password_hash, 'MariaDB password_hash must be populated');
    assert.ok(rows[0].password_hash.startsWith('pbkdf2$sha512$'));
  });

  await t.test('3. Non-owner cannot set or change portfolio password', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${testPortfolioId}/password`)
      .set(bearer('other'))
      .send({ password: 'HackerAttempt!' });

    assert.equal(res.status, 404, 'Non-owner must be rejected with 404/Not Found');
  });

  await t.test('4. Public GET on password-protected portfolio returns redacted stub without private data', async () => {
    const res = await request(app).get(`/api/public/portfolios/${testSlug}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isPasswordProtected, true);
    assert.equal(res.body.unlocked, false);

    const portfolio = res.body.portfolio;
    assert.equal(portfolio.slug, testSlug);
    assert.equal(portfolio.isPasswordProtected, true);

    // Assert zero sensitive data leakage across public boundary
    assert.equal(portfolio.data.canonical, null, 'Canonical sensitive data must be redacted');
    assert.deepEqual(portfolio.data.content, [], 'Content blocks must be empty array');
    assert.equal(portfolio.password_hash, undefined, 'password_hash must NEVER be returned');
    assert.match(res.headers['cache-control'], /no-store/, 'Protected portfolios must not be cached publicly');
  });

  await t.test('5. Public unlock with wrong password fails with 401 INVALID_PORTFOLIO_PASSWORD', async () => {
    const res = await request(app)
      .post(`/api/public/portfolios/${testSlug}/unlock`)
      .send({ password: 'IncorrectPassword' });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'INVALID_PORTFOLIO_PASSWORD');
  });

  await t.test('6. Public unlock with correct password returns full canonical portfolio data', async () => {
    const res = await request(app)
      .post(`/api/public/portfolios/${testSlug}/unlock`)
      .send({ password: 'CandidateVault2026!' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.unlocked, true);

    const portfolio = res.body.portfolio;
    assert.ok(portfolio.data.canonical, 'Unlocked portfolio must contain canonical data');
    assert.equal(portfolio.data.canonical.heading.fullName, 'Alex Morgan');
    assert.equal(portfolio.data.canonical.experiences.length, 1);
    assert.equal(portfolio.data.canonical.skills.length, 1);
  });

  await t.test('7. Header X-Portfolio-Password unlocks portfolio directly on GET', async () => {
    const res = await request(app)
      .get(`/api/public/portfolios/${testSlug}`)
      .set('X-Portfolio-Password', 'CandidateVault2026!');

    assert.equal(res.status, 200);
    assert.equal(res.body.isPasswordProtected, true);
    assert.equal(res.body.unlocked, true);
    assert.ok(res.body.portfolio.data.canonical, 'Should be unlocked via header');
    assert.equal(res.body.portfolio.data.canonical.heading.occupation, 'Lead Systems Architect');
  });

  await t.test('8. Gallery media upload rejects unsupported MIME types', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${testPortfolioId}/gallery`)
      .set(bearer('owner'))
      .send({
        title: 'Malicious PDF',
        mimeType: 'application/pdf',
        url: 'https://example.com/evil.pdf',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_MIME_TYPE');
  });

  await t.test('9. Gallery media upload rejects files larger than 5MB', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${testPortfolioId}/gallery`)
      .set(bearer('owner'))
      .send({
        title: 'Oversized Asset',
        mimeType: 'image/png',
        fileSize: 6 * 1024 * 1024, // 6MB
        url: 'https://example.com/huge.png',
      });

    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'FILE_TOO_LARGE');
  });

  let createdMediaId1 = null;
  let createdMediaId2 = null;

  await t.test('10. Owner uploads valid image media items into case study gallery', async () => {
    const res1 = await request(app)
      .post(`/api/portfolios/${testPortfolioId}/gallery`)
      .set(bearer('owner'))
      .send({
        projectId: 'proj-1',
        title: 'System Architecture Diagram',
        caption: 'Distributed event-driven architecture diagram',
        mimeType: 'image/png',
        fileSize: 102400,
        url: 'https://images.unsplash.com/photo-diagram-1',
        displayOrder: 1,
      });

    assert.equal(res1.status, 201);
    assert.equal(res1.body.success, true);
    assert.ok(res1.body.media.id);
    assert.equal(res1.body.media.title, 'System Architecture Diagram');
    assert.equal(res1.body.media.mimeType, 'image/png');
    createdMediaId1 = res1.body.media.id;

    const res2 = await request(app)
      .post(`/api/portfolios/${testPortfolioId}/gallery`)
      .set(bearer('owner'))
      .send({
        projectId: 'proj-1',
        title: 'Throughput Benchmark Graph',
        caption: '100k requests/sec low-latency benchmark graph',
        mimeType: 'image/webp',
        fileSize: 45000,
        url: 'https://images.unsplash.com/photo-benchmark-2',
        displayOrder: 2,
      });

    assert.equal(res2.status, 201);
    createdMediaId2 = res2.body.media.id;

    // Verify row persistence in MariaDB
    const [rows] = await pool.query('SELECT * FROM portfolio_media WHERE portfolio_id = ? ORDER BY display_order ASC', [testPortfolioId]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, 'System Architecture Diagram');
    assert.equal(rows[1].title, 'Throughput Benchmark Graph');
  });

  await t.test('11. Owner lists gallery media items', async () => {
    const res = await request(app)
      .get(`/api/portfolios/${testPortfolioId}/gallery`)
      .set(bearer('owner'));

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.media.length, 2);
    assert.equal(res.body.media[0].id, createdMediaId1);
    assert.equal(res.body.media[1].id, createdMediaId2);
  });

  await t.test('12. Reordering gallery items updates display_order in MariaDB', async () => {
    const res = await request(app)
      .put(`/api/portfolios/${testPortfolioId}/gallery/reorder`)
      .set(bearer('owner'))
      .send({ mediaIds: [createdMediaId2, createdMediaId1] });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const [rows] = await pool.query('SELECT id, display_order FROM portfolio_media WHERE portfolio_id = ? ORDER BY display_order ASC', [testPortfolioId]);
    assert.equal(rows[0].id, createdMediaId2, 'createdMediaId2 should now be first');
    assert.equal(rows[1].id, createdMediaId1, 'createdMediaId1 should now be second');
  });

  await t.test('13. Public gallery access requires password when portfolio is locked', async () => {
    const res = await request(app).get(`/api/public/portfolios/${testSlug}/gallery`);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'PORTFOLIO_PASSWORD_REQUIRED');
  });

  await t.test('14. Public gallery access succeeds when unlocked with password header', async () => {
    const res = await request(app)
      .get(`/api/public/portfolios/${testSlug}/gallery`)
      .set('X-Portfolio-Password', 'CandidateVault2026!');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.media.length, 2);
  });

  await t.test('15. Owner deletes gallery item relationally', async () => {
    const res = await request(app)
      .delete(`/api/portfolios/${testPortfolioId}/gallery/${createdMediaId1}`)
      .set(bearer('owner'));

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const [rows] = await pool.query('SELECT * FROM portfolio_media WHERE id = ?', [createdMediaId1]);
    assert.equal(rows.length, 0, 'Item must be removed from MariaDB');
  });

  await t.test('16. Owner removes password protection, restoring open public access', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${testPortfolioId}/password`)
      .set(bearer('owner'))
      .send({ password: null });

    assert.equal(res.status, 200);
    assert.equal(res.body.isPasswordProtected, false);

    // Verify in MariaDB
    const [rows] = await pool.query('SELECT password_hash FROM portfolios WHERE id = ?', [testPortfolioId]);
    assert.equal(rows[0].password_hash, null, 'password_hash must be cleared to NULL');

    // Public GET now returns full canonical without challenge
    const publicRes = await request(app).get(`/api/public/portfolios/${testSlug}`);
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.body.isPasswordProtected, false);
    assert.equal(publicRes.body.unlocked, true);
    assert.ok(publicRes.body.portfolio.data.canonical, 'Open public portfolio must return canonical data');
  });

  await teardown();
});
