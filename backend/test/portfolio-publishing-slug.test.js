'use strict';

/**
 * Portfolio publishing, slug collisions and custom-domain verification
 * (DISC-039 / DISC-043).
 *
 * DATABASE-BACKED: publication state and slug uniqueness are asserted against
 * the real `portfolios` table (including its `uq_portfolios_slug` index), and
 * the two public routes are exercised over HTTP with supertest.
 *
 * DNS is the one external dependency; the service accepts an injected resolver
 * so TXT verification logic is proven deterministically. The route-level
 * verification test also exercises the real resolver path, where the only
 * acceptable outcome in this sandbox is a controlled failure — never a
 * fabricated success.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const fixtures = require('./helpers/mandate11a');
const { mariaTest, bearer, IDENTITIES, newId } = fixtures;

if (fixtures.isMariaEnabled()) fixtures.requireDisposableTarget();

const request = require('supertest');
const app = require('../index');
const { getPool } = require('../database/mysql');
const publishing = require('../services/portfolioPublishing');
const customDomains = require('../services/customDomains');
const publicPortfolio = require('../services/publicPortfolio');

fixtures.installIdentities();

let pool;
const portfolios = { primary: newId('portfolio'), rival: newId('portfolio'), foreign: newId('portfolio') };
let originalConfig = null;

async function setup() {
  pool = getPool();
  await fixtures.seedUsers(pool);
  // The portfolio module ships disabled; the owner routes are gated by it.
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
  await cleanupPortfolios();
  await fixtures.seedPortfolio(pool, { portfolioId: portfolios.primary, userId: IDENTITIES.owner.uid, title: 'Owner Portfolio' });
  await fixtures.seedPortfolio(pool, { portfolioId: portfolios.rival, userId: IDENTITIES.other.uid, title: 'Rival Portfolio' });
  await fixtures.seedPortfolio(pool, { portfolioId: portfolios.foreign, userId: IDENTITIES.candidate.uid, title: 'Foreign Portfolio' });
}

async function cleanupPortfolios() {
  await pool.query(
    "DELETE FROM portfolio_custom_domains WHERE portfolio_id IN (?, ?, ?)",
    [portfolios.primary, portfolios.rival, portfolios.foreign]
  ).catch(() => {});
  await pool.query(
    'DELETE FROM portfolios WHERE id IN (?, ?, ?)',
    [portfolios.primary, portfolios.rival, portfolios.foreign]
  ).catch(() => {});
}

test.after(async () => {
  if (!fixtures.isMariaEnabled() || !pool) return;
  await cleanupPortfolios();
  if (originalConfig !== null) {
    await pool.query('UPDATE system_settings SET data = ? WHERE category = ?', [originalConfig, 'public_config']).catch(() => {});
  }
  await fixtures.cleanup(pool, { userIds: Object.values(IDENTITIES).map(identity => identity.uid) });
  await pool.end().catch(() => {});
});

// ─── Pure policy (executes without a database) ─────────────────────────────

test('slug policy accepts valid addresses and rejects reserved/oversized ones', () => {
  assert.equal(publishing.assertPublishableSlug('john-doe'), 'john-doe');
  assert.equal(publishing.assertPublishableSlug('  JOHN-DOE-2026  '), 'john-doe-2026');
  for (const invalid of ['ab', 'a'.repeat(41), 'John_Doe', '-lead', 'trail-', 'double--hyphen', 'has space', '']) {
    assert.throws(() => publishing.assertPublishableSlug(invalid), error => error.code === 'INVALID_SLUG', `${invalid} must be invalid`);
  }
  for (const reserved of ['api', 'admin', 'login', 'support', 'billing', 'enterprise', 'dashboard', 'auth', 'portfolios', 'healthz']) {
    assert.throws(
      () => publishing.assertPublishableSlug(reserved),
      error => error.code === 'RESERVED_SLUG' && error.status === 400,
      `${reserved} must be reserved`
    );
  }
});

test('public projection is an allowlist that cannot leak owner identity', () => {
  const projected = publicPortfolio.toPublicPortfolio({
    id: 'p1',
    title: 'Portfolio',
    theme: 'modern',
    slug: 'john-doe',
    isPublished: true,
    publishedAt: '2026-01-01T00:00:00.000Z',
    metadata: { description: 'd', tags: ['t'], seoTitle: 's', seoDescription: 'sd' },
    data: { content: [], root: { props: {} }, canonical: null },
    userId: 'secret-uid',
    user_id: 'secret-uid',
    email: 'owner@example.test',
    revision: 7,
    billing: { gstin: 'x' },
    supplierSnapshot: { gstin: 'y' },
  });
  assert.equal(projected.userId, undefined);
  assert.equal(projected.user_id, undefined);
  assert.equal(projected.email, undefined);
  assert.equal(projected.revision, undefined);
  assert.equal(projected.billing, undefined);
  assert.equal(JSON.stringify(projected).includes('secret-uid'), false);
  assert.equal(JSON.stringify(projected).includes('@example.test'), false);
  assert.equal(projected.isPublished, true);
  assert.deepEqual(Object.keys(projected).sort(), ['data', 'id', 'isPublished', 'metadata', 'publishedAt', 'slug', 'theme', 'title']);
});

test('domain normalisation rejects schemes, paths, IPs and internal names', () => {
  assert.equal(customDomains.normalizeDomain('Portfolio.Example.COM.'), 'portfolio.example.com');
  const invalid = [
    'https://example.com', 'example.com/path', 'user:pass@example.com', 'example.com:8080',
    '127.0.0.1', '192.168.1.10', '::1', 'localhost', 'box.local', 'svc.internal',
    'example', 'exa mple.com', '-bad.example.com', 'bad-.example.com', '.example.com',
    'example..com', 'example.c', 'xn--', '*.example.com',
  ];
  for (const value of invalid) {
    assert.throws(() => customDomains.normalizeDomain(value), error => ['INVALID_DOMAIN', 'RESERVED_DOMAIN'].includes(error.code), `${value} must be rejected`);
  }
  assert.equal(customDomains.normalizeDomain('sub.example.co.in'), 'sub.example.co.in');
  assert.equal(customDomains.normalizeDomain('xn--80ak6aa92e.com'), 'xn--80ak6aa92e.com');
});

test('verification tokens are unique, prefix-scoped and only their digest is derivable', () => {
  const tokens = new Set();
  for (let index = 0; index < 50; index += 1) {
    const token = customDomains.generateVerificationToken();
    assert.match(token, /^ime365-verify=[0-9a-f-]{36}$/);
    tokens.add(token);
  }
  assert.equal(tokens.size, 50, 'tokens must never repeat');
  const token = [...tokens][0];
  const digest = customDomains.tokenDigest(token);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(customDomains.constantTimeEqualHex(digest, customDomains.tokenDigest(token)), true);
  assert.equal(customDomains.constantTimeEqualHex(digest, customDomains.tokenDigest(`${token}x`)), false);
  assert.equal(customDomains.constantTimeEqualHex('not-a-digest', digest), false);
});

// ─── Publication ───────────────────────────────────────────────────────────

mariaTest('publishing requires authentication and portfolio ownership', async () => {
  await setup();
  const anonymous = await request(app).post(`/api/portfolios/${portfolios.primary}/publish`).send({ slug: 'anonymous-slug' });
  assert.equal(anonymous.status, 401);

  const foreign = await request(app)
    .post(`/api/portfolios/${portfolios.foreign}/publish`)
    .set(bearer('owner'))
    .send({ slug: 'not-mine' });
  assert.equal(foreign.status, 404, 'another owner\'s portfolio must be indistinguishable from a missing one');
  assert.equal(foreign.body?.code, 'PORTFOLIO_NOT_FOUND');

  const [rows] = await pool.query('SELECT is_published FROM portfolios WHERE id = ?', [portfolios.foreign]);
  assert.equal(Number(rows[0].is_published), 0, 'a failed publish must not mutate the row');
});

mariaTest('slug formatting and reserved words are rejected with stable codes', async () => {
  await setup();
  const cases = [
    ['Bad_Slug', 400, 'INVALID_SLUG'],
    ['ab', 400, 'INVALID_SLUG'],
    ['a'.repeat(41), 400, 'INVALID_SLUG'],
    ['api', 400, 'RESERVED_SLUG'],
    ['dashboard', 400, 'RESERVED_SLUG'],
    ['billing', 400, 'RESERVED_SLUG'],
  ];
  for (const [slug, status, code] of cases) {
    const response = await request(app)
      .post(`/api/portfolios/${portfolios.primary}/publish`)
      .set(bearer('owner'))
      .send({ slug });
    assert.equal(response.status, status, `slug ${slug} must be rejected with ${status}`);
    assert.equal(response.body.code, code);
  }
});

mariaTest('successful publication persists slug, state and timestamp', async () => {
  await setup();
  const response = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/publish`)
    .set(bearer('owner'))
    .send({ slug: 'owner-public-page' });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.portfolio.slug, 'owner-public-page');
  assert.equal(response.body.portfolio.isPublished, true);
  assert.ok(response.body.portfolio.publishedAt);

  const [rows] = await pool.query('SELECT slug, is_published, published_at FROM portfolios WHERE id = ?', [portfolios.primary]);
  assert.equal(rows[0].slug, 'owner-public-page');
  assert.equal(Number(rows[0].is_published), 1);
  assert.ok(rows[0].published_at, 'publication timestamp must be persisted');

  // Re-publishing with the portfolio's own slug is not a self-conflict.
  const republish = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/publish`)
    .set(bearer('owner'))
    .send({ slug: 'owner-public-page' });
  assert.equal(republish.status, 200);
  assert.equal(republish.body.portfolio.slug, 'owner-public-page');

  // ...and it can still move to a new address.
  const renamed = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/publish`)
    .set(bearer('owner'))
    .send({ slug: 'owner-renamed-page' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.portfolio.slug, 'owner-renamed-page');
});

mariaTest('a slug owned by another portfolio is a database-level conflict', async () => {
  await setup();
  const first = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/publish`)
    .set(bearer('owner'))
    .send({ slug: 'contested-address' });
  assert.equal(first.status, 200);

  const second = await request(app)
    .post(`/api/portfolios/${portfolios.rival}/publish`)
    .set(bearer('other'))
    .send({ slug: 'contested-address' });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'SLUG_ALREADY_EXISTS');

  const [rows] = await pool.query('SELECT slug FROM portfolios WHERE id = ?', [portfolios.rival]);
  assert.notEqual(rows[0].slug, 'contested-address', 'the losing portfolio must not take the address');
  assert.equal(Number((await pool.query('SELECT is_published FROM portfolios WHERE id = ?', [portfolios.rival]))[0][0].is_published), 0);
});

mariaTest('concurrent slug reservations cannot both succeed', async () => {
  await setup();
  const [owner_publish, rival_publish] = await Promise.all([
    request(app).post(`/api/portfolios/${portfolios.primary}/publish`).set(bearer('owner')).send({ slug: 'race-address' }),
    request(app).post(`/api/portfolios/${portfolios.rival}/publish`).set(bearer('other')).send({ slug: 'race-address' }),
  ]);
  const statuses = [owner_publish.status, rival_publish.status].sort();
  assert.deepEqual(statuses, [200, 409], 'exactly one concurrent reservation may win');
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM portfolios WHERE slug = ?', ['race-address']);
  assert.equal(Number(rows[0].total), 1, 'the unique index must leave exactly one owner of the address');
});

mariaTest('unpublishing removes public access immediately', async () => {
  await setup();
  await request(app).post(`/api/portfolios/${portfolios.primary}/publish`).set(bearer('owner')).send({ slug: 'temporary-address' });
  const live = await request(app).get('/api/public/portfolios/temporary-address');
  assert.equal(live.status, 200);

  const unpublish = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/publish`)
    .set(bearer('owner'))
    .send({ isPublished: false });
  assert.equal(unpublish.status, 200);
  assert.equal(unpublish.body.portfolio.isPublished, false);
  assert.equal(unpublish.body.portfolio.slug, 'temporary-address', 'the address is retained for republication');

  for (const path of ['/api/public/portfolios/temporary-address', '/api/portfolios/public/temporary-address']) {
    const response = await request(app).get(path);
    assert.equal(response.status, 404, `${path} must stop serving an unpublished portfolio`);
  }

  const rejected = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/publish`)
    .set(bearer('owner'))
    .send({ isPublished: 'false' });
  assert.equal(rejected.status, 400, 'a non-boolean publication state must be rejected, not coerced');
  assert.equal(rejected.body.code, 'INVALID_PUBLICATION_STATE');
});

// ─── Public routes ─────────────────────────────────────────────────────────

mariaTest('both public aliases serve the same DTO and preserve the frontend contract', async () => {
  await setup();
  await request(app).post(`/api/portfolios/${portfolios.primary}/publish`).set(bearer('owner')).send({ slug: 'shared-address' });

  const [canonical, legacy] = await Promise.all([
    request(app).get('/api/public/portfolios/shared-address'),
    request(app).get('/api/portfolios/public/shared-address'),
  ]);
  assert.equal(canonical.status, 200);
  assert.equal(legacy.status, 200);
  assert.deepEqual(canonical.body, legacy.body, 'both aliases must return byte-identical DTOs');

  const portfolio = canonical.body.portfolio;
  // frontend/src/lib/portfolio.ts PublicPortfolio
  for (const key of ['id', 'title', 'theme', 'slug', 'publishedAt', 'metadata', 'data']) {
    assert.ok(key in portfolio, `frontend contract field ${key} must be present`);
  }
  assert.equal(portfolio.slug, 'shared-address');
  assert.equal(portfolio.id, portfolios.primary);
  assert.ok(Array.isArray(portfolio.data.content));
  assert.ok(portfolio.data.root && typeof portfolio.data.root === 'object');
  assert.ok('canonical' in portfolio.data);

  // Privacy: no owner identity, credentials, billing or internal fields.
  const serialized = JSON.stringify(portfolio);
  for (const forbidden of [IDENTITIES.owner.uid, IDENTITIES.owner.email, 'userId', 'revision', 'gstin', 'paymentOrderId']) {
    assert.equal(serialized.includes(forbidden), false, `public payload must not contain ${forbidden}`);
  }
});

mariaTest('drafts and unknown slugs are 404 on both public routes', async () => {
  await setup();
  const draftId = newId('portfolio');
  await fixtures.seedPortfolio(pool, { portfolioId: draftId, userId: IDENTITIES.owner.uid, title: 'Draft', slug: 'draft-address', isPublished: false });
  try {
    for (const path of ['/api/public/portfolios/draft-address', '/api/portfolios/public/draft-address', '/api/public/portfolios/never-existed']) {
      const response = await request(app).get(path);
      assert.equal(response.status, 404, `${path} must not serve drafts`);
      assert.equal(response.body.code, 'PORTFOLIO_NOT_FOUND');
    }
    const invalid = await request(app).get('/api/public/portfolios/Invalid_Slug');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'INVALID_PORTFOLIO_SLUG');
  } finally {
    await pool.query('DELETE FROM portfolios WHERE id = ?', [draftId]).catch(() => {});
  }
});

// ─── Custom domains ────────────────────────────────────────────────────────

mariaTest('custom-domain registration validates input and stores only a token digest', async () => {
  await setup();
  for (const domain of ['https://example.com', 'localhost', '127.0.0.1', 'example.com/path', 'user:pass@example.com', 'box.local']) {
    const response = await request(app)
      .post(`/api/portfolios/${portfolios.primary}/custom-domain`)
      .set(bearer('owner'))
      .send({ domain });
    assert.equal(response.status, 400, `${domain} must be rejected`);
    assert.ok(['INVALID_DOMAIN', 'RESERVED_DOMAIN'].includes(response.body.code));
  }

  const anonymous = await request(app).post(`/api/portfolios/${portfolios.primary}/custom-domain`).send({ domain: 'portfolio.example.com' });
  assert.equal(anonymous.status, 401);

  const foreign = await request(app)
    .post(`/api/portfolios/${portfolios.foreign}/custom-domain`)
    .set(bearer('owner'))
    .send({ domain: 'portfolio.example.com' });
  assert.equal(foreign.status, 404);

  const registered = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/custom-domain`)
    .set(bearer('owner'))
    .send({ domain: 'Portfolio.Example.COM.' });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.success, true);
  assert.equal(registered.body.domain, 'portfolio.example.com');
  assert.match(registered.body.verificationToken, /^ime365-verify=[0-9a-f-]{36}$/);
  assert.match(registered.body.instructions, /TXT/);
  assert.equal(registered.body.verificationRecord.type, 'TXT');

  const [rows] = await pool.query('SELECT domain, token_hash, status FROM portfolio_custom_domains WHERE portfolio_id = ?', [portfolios.primary]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].domain, 'portfolio.example.com');
  assert.equal(rows[0].status, 'PENDING');
  assert.equal(rows[0].token_hash, customDomains.tokenDigest(registered.body.verificationToken));
  assert.equal(JSON.stringify(rows[0]).includes(registered.body.verificationToken), false, 'the plaintext token must not be stored');
});

mariaTest('a domain cannot be claimed twice', async () => {
  await setup();
  const first = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/custom-domain`)
    .set(bearer('owner'))
    .send({ domain: 'claimed.example.com' });
  assert.equal(first.status, 201);

  const rival = await request(app)
    .post(`/api/portfolios/${portfolios.rival}/custom-domain`)
    .set(bearer('other'))
    .send({ domain: 'claimed.example.com' });
  assert.equal(rival.status, 409);
  assert.equal(rival.body.code, 'DOMAIN_ALREADY_CLAIMED');

  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM portfolio_custom_domains WHERE domain = ?', ['claimed.example.com']);
  assert.equal(Number(rows[0].total), 1, 'the unique index must keep exactly one claim');
});

mariaTest('DNS TXT verification transitions state only on a matching record', async () => {
  await setup();
  const registration = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/custom-domain`)
    .set(bearer('owner'))
    .send({ domain: 'verify.example.com' });
  assert.equal(registration.status, 201);
  const token = registration.body.verificationToken;

  const missingResolver = { resolveTxt: async () => { throw Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' }); } };
  const lookupFailure = await customDomains.verifyCustomDomain({
    userId: IDENTITIES.owner.uid,
    portfolioId: portfolios.primary,
    resolver: missingResolver,
    now: new Date(Date.now() + 31_000),
  }).catch(error => error);
  assert.equal(lookupFailure.code, 'DNS_LOOKUP_FAILED', 'a DNS failure must never be reported as verification');

  const wrongResolver = { resolveTxt: async () => [['ime365-verify=00000000-0000-4000-8000-000000000000']] };
  const mismatch = await customDomains.verifyCustomDomain({
    userId: IDENTITIES.owner.uid,
    portfolioId: portfolios.primary,
    resolver: wrongResolver,
    now: new Date(Date.now() + 62_000),
  });
  assert.equal(mismatch.verified, false);
  assert.equal(mismatch.reason, 'TXT_RECORD_MISMATCH');

  const goodResolver = { resolveTxt: async () => [[token.slice(0, 20), token.slice(20)]] };
  const verified = await customDomains.verifyCustomDomain({
    userId: IDENTITIES.owner.uid,
    portfolioId: portfolios.primary,
    resolver: goodResolver,
    now: new Date(Date.now() + 93_000),
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.status, 'VERIFIED');

  const [rows] = await pool.query('SELECT status, verified_at FROM portfolio_custom_domains WHERE portfolio_id = ?', [portfolios.primary]);
  assert.equal(rows[0].status, 'VERIFIED');
  assert.ok(rows[0].verified_at);

  const again = await customDomains.verifyCustomDomain({
    userId: IDENTITIES.owner.uid,
    portfolioId: portfolios.primary,
    resolver: goodResolver,
  });
  assert.equal(again.verified, true);
  assert.equal(again.reason, 'ALREADY_VERIFIED');
});

mariaTest('verification is throttled and expired tokens cannot be verified', async () => {
  await setup();
  await request(app)
    .post(`/api/portfolios/${portfolios.primary}/custom-domain`)
    .set(bearer('owner'))
    .send({ domain: 'throttle.example.com' });

  const resolver = { resolveTxt: async () => [['ime365-verify=11111111-1111-4111-8111-111111111111']] };
  const start = new Date();
  await customDomains.verifyCustomDomain({ userId: IDENTITIES.owner.uid, portfolioId: portfolios.primary, resolver, now: start });
  const throttled = await customDomains.verifyCustomDomain({
    userId: IDENTITIES.owner.uid,
    portfolioId: portfolios.primary,
    resolver,
    now: new Date(start.getTime() + 1_000),
  }).catch(error => error);
  assert.equal(throttled.code, 'DOMAIN_VERIFICATION_THROTTLED');
  assert.equal(throttled.status, 429);

  const expired = await customDomains.verifyCustomDomain({
    userId: IDENTITIES.owner.uid,
    portfolioId: portfolios.primary,
    resolver,
    now: new Date(start.getTime() + customDomains.TOKEN_TTL_MS + 60_000),
  }).catch(error => error);
  assert.equal(expired.code, 'DOMAIN_VERIFICATION_EXPIRED');
  const [rows] = await pool.query('SELECT status FROM portfolio_custom_domains WHERE portfolio_id = ?', [portfolios.primary]);
  assert.equal(rows[0].status, 'EXPIRED');
});

mariaTest('the verification route fails closed when DNS cannot be reached', async () => {
  await setup();
  await request(app)
    .post(`/api/portfolios/${portfolios.primary}/custom-domain`)
    .set(bearer('owner'))
    .send({ domain: 'unreachable.example.com' });

  const response = await request(app)
    .post(`/api/portfolios/${portfolios.primary}/custom-domain/verify`)
    .set(bearer('owner'))
    .send({});
  // Either the sandbox DNS answers with no matching record (verified:false) or
  // the lookup fails (502). Neither may report success.
  assert.ok([200, 502].includes(response.status), `unexpected status ${response.status}`);
  if (response.status === 200) assert.equal(response.body.verified, false);
  else assert.ok(['DNS_LOOKUP_FAILED', 'CUSTOM_DOMAIN_UNAVAILABLE'].includes(response.body.code));

  const [rows] = await pool.query('SELECT status FROM portfolio_custom_domains WHERE portfolio_id = ?', [portfolios.primary]);
  assert.notEqual(rows[0].status, 'VERIFIED', 'no DNS answer means no verification');
});
