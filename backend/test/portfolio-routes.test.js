'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

const observed = [];
const fakeRepository = {
  async getPublishedPortfolioBySlug(slug) {
    observed.push(['public-detail', slug]);
    return slug === 'published-work' ? { id: 'portfolio_1234', slug, title: 'Published Work', data: {}, metadata: {}, isPublished: true } : null;
  },
  async getPublishedPortfolios(limit, theme) {
    observed.push(['public-list', limit, theme]);
    return [{ id: 'portfolio_1234', slug: 'published-work', title: 'Published Work', data: {}, metadata: {}, isPublished: true }];
  },
  async getPortfolios(uid) { observed.push(['owner-list', uid]); return []; },
  async getPortfolio(uid, id) { observed.push(['owner-detail', uid, id]); return { id, userId: uid, revision: 3 }; },
  async savePortfolio(uid, id, data, { expectedRevision }) {
    observed.push(['save', uid, id, data, expectedRevision]);
    if (expectedRevision === 2) throw Object.assign(new Error('stale'), { code: 'PORTFOLIO_CONFLICT', status: 409, remoteRevision: 3 });
    return { ...data, id, userId: uid, revision: expectedRevision + 1 };
  },
  async deletePortfolio(uid, id, revision) { observed.push(['delete', uid, id, revision]); return true; },
};
const repositories = require('../repositories');
repositories.getRepository = () => fakeRepository;
setTokenVerifierForTests(async token => {
  if (token !== 'owner') throw new Error('invalid token');
  return { uid: 'owner_uid', email: 'owner@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) };
});
const app = require('../index');
const auth = { Authorization: 'Bearer owner' };

test('only exact validated published-portfolio paths bypass authentication', async () => {
  const list = await request(app).get('/api/portfolios/public?limit=20&theme=minimal');
  assert.equal(list.status, 200);
  assert.equal(list.body.portfolios.length, 1);
  assert.deepEqual(observed.find(item => item[0] === 'public-list'), ['public-list', '20', 'minimal']);

  const detail = await request(app).get('/api/portfolios/public/published-work');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.portfolio.slug, 'published-work');
  assert.match(detail.headers['cache-control'], /public/);

  for (const path of [
    '/api/portfolios/public/not_valid',
    '/api/portfolios/public/published-work/extra',
    '/api/portfolios/publicity',
    '/api/portfolios/private/published-work',
  ]) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path} must remain authenticated`);
  }
});

test('draft and owner portfolio surfaces require Firebase authentication and use token ownership', async () => {
  assert.equal((await request(app).get('/api/portfolios')).status, 401);
  const list = await request(app).get('/api/portfolios').set(auth);
  assert.equal(list.status, 200);
  assert.ok(observed.some(item => item[0] === 'owner-list' && item[1] === 'owner_uid'));

  const detail = await request(app).get('/api/portfolios/portfolio_1234').set(auth);
  assert.equal(detail.status, 200);
  assert.ok(observed.some(item => item[0] === 'owner-detail' && item[1] === 'owner_uid'));
});

test('portfolio writes reject owner injection and require optimistic revisions', async () => {
  const mismatch = await request(app).post('/api/portfolios/portfolio_1234').set(auth).send({
    expectedRevision: 3, portfolio: { userId: 'victim_uid', title: 'Takeover' },
  });
  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.body.code, 'PORTFOLIO_OWNER_MISMATCH');

  const missingRevision = await request(app).post('/api/portfolios/portfolio_1234').set(auth).send({ portfolio: { title: 'No CAS' } });
  assert.equal(missingRevision.status, 400);
  assert.equal(missingRevision.body.code, 'PORTFOLIO_REVISION_REQUIRED');

  const stale = await request(app).post('/api/portfolios/portfolio_1234').set(auth).send({
    expectedRevision: 2, portfolio: { title: 'Stale' },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'PORTFOLIO_CONFLICT');
  assert.equal(stale.body.remoteRevision, 3);

  const saved = await request(app).post('/api/portfolios/portfolio_1234').set(auth).send({
    expectedRevision: 3, portfolio: { title: 'Current' },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.portfolio.revision, 4);
});

test('portfolio deletion is owner-scoped and revision-required', async () => {
  const noRevision = await request(app).delete('/api/portfolios/portfolio_1234').set(auth).send({});
  assert.equal(noRevision.status, 400);
  const deleted = await request(app).delete('/api/portfolios/portfolio_1234').set(auth).send({ expectedRevision: 3 });
  assert.equal(deleted.status, 200);
  assert.ok(observed.some(item => item[0] === 'delete' && item[1] === 'owner_uid' && item[3] === 3));
});
