'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MySQLRepository = require('../repositories/MySQLRepository');
const { PUBLIC_PORTFOLIO_FIELDS, FORBIDDEN_PUBLIC_FIELDS } = require('../services/publicPortfolio');

function publishedRow(overrides = {}) {
  return {
    id: 'portfolio_public_1',
    user_id: 'private-owner-uid',
    title: 'Public Work',
    theme: 'minimal',
    slug: 'public-work-deadbeef',
    is_published: 1,
    revision: 47,
    published_at: new Date('2026-08-20T10:00:00Z'),
    created_at: new Date('2026-08-01T10:00:00Z'),
    updated_at: new Date('2026-08-21T10:00:00Z'),
    data: JSON.stringify({
      content: [{ type: 'Hero', props: { name: 'Asha' } }],
      root: { props: { title: 'Asha Rao' } },
      renderer: 'puck',
      templateKey: 'modernMinimal',
      title: 'Public Work',
      description: 'A public engineering portfolio',
      tags: ['engineering'],
      seoTitle: 'Asha — Engineer',
      draftData: { privateNotes: 'never publish this' },
      draftTitle: 'private draft title',
      hasUnpublishedChanges: true,
      userId: 'nested-private-owner-uid',
      revision: 99,
      secretNote: 'internal only',
    }),
    ...overrides,
  };
}

test('anonymous portfolio detail is an explicit public allowlist', async () => {
  const repository = new MySQLRepository();
  repository._getPool = () => ({
    query: async (sql, params) => {
      assert.match(sql, /slug = \? AND is_published = 1/);
      assert.deepEqual(params, ['public-work-deadbeef']);
      return [[publishedRow()], []];
    },
  });

  const portfolio = await repository.getPublishedPortfolioBySlug('public-work-deadbeef');
  // Bind to the authoritative allowlist in services/publicPortfolio.js rather than
  // a duplicated literal, so the repository projection cannot drift from the
  // canonical public DTO without failing here. `isPasswordProtected` joined the
  // allowlist with the FP-C10 password-protection work: it is Boolean(password_hash),
  // which the public UI needs to decide whether to prompt, and it is not a secret.
  assert.deepEqual(Object.keys(portfolio).sort(), [...PUBLIC_PORTFOLIO_FIELDS].sort());
  assert.equal(typeof portfolio.isPasswordProtected, 'boolean');
  // The hash itself is on the forbidden list and must never cross the boundary.
  assert.ok(FORBIDDEN_PUBLIC_FIELDS.includes('password_hash'), 'password_hash must stay forbidden');
  assert.equal(portfolio.password_hash, undefined);
  assert.equal(portfolio.userId, undefined);
  assert.equal(portfolio.revision, undefined);
  assert.equal(portfolio.createdAt, undefined);
  assert.equal(portfolio.updatedAt, undefined);
  assert.equal(portfolio.draftData, undefined);
  assert.equal(portfolio.data.draftData, undefined);
  assert.equal(portfolio.data.userId, undefined);
  assert.equal(portfolio.data.revision, undefined);
  assert.equal(portfolio.data.secretNote, undefined);
  assert.equal(portfolio.data.content[0].props.name, 'Asha');
  assert.equal(portfolio.metadata.description, 'A public engineering portfolio');
});

test('public gallery projection excludes full content and parameterizes theme filtering', async () => {
  const repository = new MySQLRepository();
  let observed;
  repository._getPool = () => ({
    query: async (sql, params) => {
      observed = { sql, params };
      return [[publishedRow()], []];
    },
  });

  const portfolios = await repository.getPublishedPortfolios(500, 'minimal');
  assert.match(observed.sql, /AND theme = \?/);
  assert.match(observed.sql, /LIMIT 100/);
  assert.deepEqual(observed.params, ['minimal']);
  assert.equal(portfolios.length, 1);
  assert.deepEqual(portfolios[0].data, { renderer: 'puck', templateKey: 'modernMinimal', template: '' });
  assert.equal(portfolios[0].userId, undefined);
  assert.equal(portfolios[0].revision, undefined);
  assert.equal(portfolios[0].data.content, undefined);
});

test('unpublished slug rows do not become public through repository projection', async () => {
  const repository = new MySQLRepository();
  repository._getPool = () => ({ query: async () => [[], []] });
  assert.equal(await repository.getPublishedPortfolioBySlug('private-work-deadbeef'), null);
});
