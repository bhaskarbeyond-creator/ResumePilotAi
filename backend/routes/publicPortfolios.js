'use strict';

/**
 * Canonical public portfolio API — mounted at `/api/public/portfolios`.
 *
 *   GET  /api/public/portfolios/:slug
 *   POST /api/public/portfolios/:slug/unlock
 *   GET  /api/public/portfolios/:slug/gallery
 *
 * Implements FP-C10 (Portfolio Server-Side Password Protection Challenge)
 * and FP-C07 (Portfolio Case Study Gallery & Media Showcase).
 */

const express = require('express');
const { getRepository } = require('../repositories');
const { replyRepoError } = require('./errorResponder');
const { getPublicPortfolio } = require('../services/publicPortfolio');
const { checkPortfolioProtection, verifyPassword } = require('../services/portfolioProtectionService');
const { listGalleryMedia } = require('../services/portfolioMediaService');

const router = express.Router();

async function resolvePublicPortfolioWithProtection(req, slug) {
  const repo = req.repository || getRepository();
  const pool = repo?._getPool ? repo._getPool() : getRepository()._getPool();

  const portfolio = await getPublicPortfolio({ repository: repo, slug });
  if (!portfolio) return { notFound: true };

  const protection = await checkPortfolioProtection(pool, slug);
  const isProtected = Boolean(protection?.isPasswordProtected);

  if (!isProtected) {
    return { portfolio, isProtected: false, unlocked: true };
  }

  // If password protected, check header or query parameter
  const candidatePassword = req.headers['x-portfolio-password'] || req.query.password || null;
  if (candidatePassword && verifyPassword(candidatePassword, protection.passwordHash)) {
    return { portfolio, isProtected: true, unlocked: true };
  }

  // Locked state: redact sensitive contents
  const lockedPortfolio = {
    id: portfolio.id,
    title: portfolio.title,
    theme: portfolio.theme,
    slug: portfolio.slug,
    isPublished: true,
    isPasswordProtected: true,
    publishedAt: portfolio.publishedAt || null,
    metadata: {
      seoTitle: portfolio.metadata?.seoTitle || portfolio.title,
      seoDescription: 'This portfolio is protected with a password.',
      tags: [],
      description: 'This portfolio is protected with a password. Please enter the password to view the content.',
    },
    data: {
      content: [],
      root: { props: {} },
      canonical: null,
    },
  };

  return { portfolio: lockedPortfolio, isProtected: true, unlocked: false, protection };
}

router.get('/:slug', async (req, res) => {
  try {
    const result = await resolvePublicPortfolioWithProtection(req, req.params.slug);
    if (result.notFound) {
      return res.status(404).json({
        success: false,
        code: 'PORTFOLIO_NOT_FOUND',
        error: 'Portfolio not found',
        requestId: res.locals?.requestId,
      });
    }

    if (result.unlocked && !result.isProtected) {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    } else {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    return res.json({
      success: true,
      portfolio: result.portfolio,
      isPasswordProtected: result.isProtected,
      unlocked: result.unlocked,
    });
  } catch (error) {
    if (error?.code === 'INVALID_PORTFOLIO_SLUG') {
      return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_SLUG', error: error.message, requestId: res.locals?.requestId });
    }
    return replyRepoError(res, error, 'Failed to fetch portfolio');
  }
});

router.post('/:slug/unlock', express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const repo = req.repository || getRepository();
    const pool = repo?._getPool ? repo._getPool() : getRepository()._getPool();
    const slug = req.params.slug;

    const protection = await checkPortfolioProtection(pool, slug);
    if (!protection) {
      return res.status(404).json({
        success: false,
        code: 'PORTFOLIO_NOT_FOUND',
        error: 'Portfolio not found',
      });
    }

    if (!protection.isPasswordProtected) {
      const portfolio = await getPublicPortfolio({ repository: repo, slug });
      return res.json({ success: true, unlocked: true, portfolio });
    }

    const password = req.body?.password;
    if (!password || !verifyPassword(password, protection.passwordHash)) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PORTFOLIO_PASSWORD',
        error: 'Incorrect portfolio password.',
      });
    }

    const portfolio = await getPublicPortfolio({ repository: repo, slug });
    return res.json({
      success: true,
      unlocked: true,
      portfolio,
    });
  } catch (error) {
    if (error?.code === 'INVALID_PORTFOLIO_SLUG') {
      return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_SLUG', error: error.message });
    }
    return replyRepoError(res, error, 'Failed to unlock portfolio');
  }
});

router.get('/:slug/gallery', async (req, res) => {
  try {
    const repo = req.repository || getRepository();
    const pool = repo?._getPool ? repo._getPool() : getRepository()._getPool();
    const slug = req.params.slug;

    const result = await resolvePublicPortfolioWithProtection(req, slug);
    if (result.notFound) {
      return res.status(404).json({ success: false, code: 'PORTFOLIO_NOT_FOUND', error: 'Portfolio not found' });
    }

    if (result.isProtected && !result.unlocked) {
      return res.status(401).json({
        success: false,
        code: 'PORTFOLIO_PASSWORD_REQUIRED',
        error: 'This portfolio is protected with a password. Please unlock it to view the gallery.',
      });
    }

    const media = await listGalleryMedia(pool, {
      portfolioId: result.portfolio.id,
      projectId: req.query.projectId || null,
    });

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json({ success: true, media });
  } catch (error) {
    if (error?.code === 'INVALID_PORTFOLIO_SLUG') {
      return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_SLUG', error: error.message });
    }
    return replyRepoError(res, error, 'Failed to fetch portfolio gallery');
  }
});

module.exports = {
  publicPortfoliosRouter: router,
  resolvePublicPortfolioWithProtection,
};
