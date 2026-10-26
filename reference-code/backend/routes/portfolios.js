const express = require('express');
const { getRepository } = require('../repositories');
const { replyRepoError } = require('./errorResponder');
const router = express.Router();

const VALID_ID = /^[A-Za-z0-9_-]{4,128}$/;
const VALID_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/;

router.use(async (req, res, next) => {
    try {
        req.repository = req.repository || getRepository();
        if (typeof req.repository?.getSetting === 'function') {
            const config = await req.repository.getSetting('public_config');
            const isModuleEnabled = config?.modules?.enablePortfolioModule !== false;
            if (!isModuleEnabled) {
                const isPublicRoute = req.path.startsWith('/public');
                const isOperator = ['ADMIN', 'SUPER_ADMIN'].includes(String(req.user?.role || '').toUpperCase());
                if (!isPublicRoute && !isOperator) {
                    return res.status(403).json({
                        success: false,
                        code: 'PORTFOLIO_MODULE_DISABLED',
                        error: 'Portfolio module is currently disabled by system administration.',
                        requestId: res.locals?.requestId,
                    });
                }
            }
        }
        next();
    } catch (_error) {
        return res.status(503).json({ success: false, code: 'APPLICATION_DATABASE_UNAVAILABLE', error: 'Application database unavailable' });
    }
});

// Explicitly published portfolio projection. The global API policy allowlists
// only this bounded route; drafts and owner lists remain authenticated.
router.get('/public/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!VALID_SLUG.test(slug)) return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_SLUG', error: 'Invalid portfolio address.' });
    try {
        const portfolio = await req.repository.getPublishedPortfolioBySlug(slug);
        if (!portfolio) return res.status(404).json({ success: false, code: 'PORTFOLIO_NOT_FOUND', error: 'Portfolio not found' });
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return res.json({ success: true, portfolio });
    } catch (error) {
        return replyRepoError(res, error, 'Failed to fetch portfolio');
    }
});

router.get('/public', async (req, res) => {
    try {
        const theme = String(req.query.theme || '');
        if (theme && !/^[A-Za-z0-9_-]{1,50}$/.test(theme)) return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_THEME', error: 'Invalid portfolio theme.' });
        const portfolios = await req.repository.getPublishedPortfolios(req.query.limit, theme || null);
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return res.json({ success: true, portfolios });
    } catch (error) {
        return replyRepoError(res, error, 'Failed to fetch published portfolios');
    }
});

router.get('/', async (req, res) => {
    try {
        const portfolios = await req.repository.getPortfolios(req.user.uid);
        return res.json({ success: true, portfolios });
    } catch (error) {
        return replyRepoError(res, error, 'Failed to fetch portfolios');
    }
});

router.get('/:id', async (req, res) => {
    if (!VALID_ID.test(String(req.params.id || ''))) return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_ID', error: 'Invalid portfolio identifier.' });
    try {
        const portfolio = await req.repository.getPortfolio(req.user.uid, req.params.id);
        if (!portfolio) return res.status(404).json({ success: false, code: 'PORTFOLIO_NOT_FOUND', error: 'Portfolio not found' });
        return res.json({ success: true, portfolio });
    } catch (error) {
        return replyRepoError(res, error, 'Failed to fetch portfolio');
    }
});

router.post('/:id', express.json({ limit: '5mb' }), async (req, res) => {
    const portfolioId = String(req.params.id || '');
    if (!VALID_ID.test(portfolioId)) return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_ID', error: 'Invalid portfolio identifier.' });
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return res.status(400).json({ success: false, code: 'PORTFOLIO_REVISION_REQUIRED', error: 'A non-negative expectedRevision is required.' });
    }
    const portfolio = req.body?.portfolio;
    if (!portfolio || typeof portfolio !== 'object' || Array.isArray(portfolio)) {
        return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_ENVELOPE', error: 'Portfolio data must be supplied in the portfolio object.' });
    }
    if (portfolio.userId && String(portfolio.userId) !== req.user.uid) {
        return res.status(403).json({ success: false, code: 'PORTFOLIO_OWNER_MISMATCH', error: 'Cannot write another user’s portfolio.' });
    }
    try {
        const saved = await req.repository.savePortfolio(req.user.uid, portfolioId, portfolio, { expectedRevision });
        return res.status(expectedRevision === 0 ? 201 : 200).json({ success: true, portfolio: saved });
    } catch (error) {
        return replyRepoError(res, error, 'Failed to save portfolio');
    }
});

router.delete('/:id', async (req, res) => {
    const portfolioId = String(req.params.id || '');
    const expectedRevision = Number(req.body?.expectedRevision);
    if (!VALID_ID.test(portfolioId)) return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_ID', error: 'Invalid portfolio identifier.' });
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        return res.status(400).json({ success: false, code: 'PORTFOLIO_REVISION_REQUIRED', error: 'The current portfolio revision is required.' });
    }
    try {
        await req.repository.deletePortfolio(req.user.uid, portfolioId, expectedRevision);
        return res.json({ success: true });
    } catch (error) {
        return replyRepoError(res, error, 'Failed to delete portfolio');
    }
});

module.exports = { portfoliosRouter: router };
