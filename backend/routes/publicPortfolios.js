'use strict';

/**
 * Canonical public portfolio API — mounted at `/api/public/portfolios`.
 *
 *   GET /api/public/portfolios/:slug
 *
 * This aliases the long-standing frontend route
 * `GET /api/portfolios/public/:slug` (see `frontend/src/lib/portfolio.ts`).
 * Both handlers call `services/publicPortfolio.getPublicPortfolio`, so response
 * contract, visibility rules and privacy allowlisting are identical by
 * construction rather than by convention.
 *
 * Authentication: none. The path is on the global public allowlist, so an
 * anonymous caller is never blocked; a presented bearer token is decoded but
 * grants nothing and is not required.
 */

const express = require('express');
const { getRepository } = require('../repositories');
const { replyRepoError } = require('./errorResponder');
const { getPublicPortfolio } = require('../services/publicPortfolio');

const router = express.Router();

router.get('/:slug', async (req, res) => {
  try {
    const portfolio = await getPublicPortfolio({
      repository: req.repository || getRepository(),
      slug: req.params.slug,
    });
    if (!portfolio) {
      return res.status(404).json({
        success: false,
        code: 'PORTFOLIO_NOT_FOUND',
        error: 'Portfolio not found',
        requestId: res.locals?.requestId,
      });
    }
    // Published content is cacheable, but unpublishing must take effect within a
    // bounded window rather than being pinned by an intermediary.
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json({ success: true, portfolio });
  } catch (error) {
    if (error?.code === 'INVALID_PORTFOLIO_SLUG') {
      return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_SLUG', error: error.message, requestId: res.locals?.requestId });
    }
    return replyRepoError(res, error, 'Failed to fetch portfolio');
  }
});

module.exports = { publicPortfoliosRouter: router };
