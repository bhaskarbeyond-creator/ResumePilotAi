const crypto = require('crypto');
const express = require('express');
const { getRepository } = require('../repositories');
const { replyRepoError } = require('./errorResponder');
const { normalizeSlugBase } = require('../repositories/portfolioSlug');
const { getPublicPortfolio } = require('../services/publicPortfolio');
const { assertPublishableSlug, publishPortfolio } = require('../services/portfolioPublishing');
const customDomains = require('../services/customDomains');
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
    // FRONTEND-COMPATIBLE ALIAS. `/api/public/portfolios/:slug` is the canonical
    // public route; both call the same service so the DTO, visibility rules and
    // privacy allowlist cannot drift apart (frontend/src/lib/portfolio.ts).
    try {
        const portfolio = await getPublicPortfolio({ repository: req.repository, slug: req.params.slug });
        if (!portfolio) return res.status(404).json({ success: false, code: 'PORTFOLIO_NOT_FOUND', error: 'Portfolio not found' });
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return res.json({ success: true, portfolio });
    } catch (error) {
        if (error?.code === 'INVALID_PORTFOLIO_SLUG') {
            return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_SLUG', error: error.message });
        }
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

// Vanity-address availability probe (DIR-019 AC-3).
//
// Authenticated owner route: it is intentionally NOT part of the public
// allowlist, because enumerating which addresses exist is an enumeration
// oracle for unpublished drafts if it were.
//
// The response reports availability for the EXACT slug the save path will
// persist, which the repository derives as `<normalized base>-<8 hex of
// sha256(portfolioId)>`. We therefore return both the normalized base the
// candidate typed and the concrete address that will be issued.
router.get('/slug-availability', async (req, res) => {
    const base = normalizeSlugBase(req.query.base);
    if (!base || base.length < 3) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PORTFOLIO_SLUG_BASE',
            error: 'Portfolio addresses must be at least 3 characters long.',
        });
    }
    const portfolioId = VALID_ID.test(String(req.query.portfolioId || '')) ? String(req.query.portfolioId) : null;
    // The client mints the primary key before its first save, so it can send the
    // id it intends to use and we can resolve the deterministic suffix here.
    const suffix = crypto.createHash('sha256').update(String(portfolioId || req.user.uid)).digest('hex').slice(0, 8);
    const candidateSlug = `${base}-${suffix}`;
    try {
        const available = await req.repository.isPortfolioSlugAvailable(candidateSlug, portfolioId);
        return res.json({ success: true, base, slug: candidateSlug, available });
    } catch (error) {
        return replyRepoError(res, error, 'Failed to check portfolio address availability');
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

/* ─── Publication (DISC-039) ─────────────────────────────────────────────────
 *
 * Publishing is a distinct, explicit operation: it validates the requested
 * public address, persists the slug and publication timestamp, and lets the
 * database unique index arbitrate collisions (409 SLUG_ALREADY_EXISTS) so two
 * concurrent claims cannot both succeed.
 *
 * `isPublished: false` genuinely unpublishes: the row is marked unpublished in
 * the same commit that responds, and the public route only serves published
 * rows, so access is removed immediately.
 */
router.post('/:id/publish', express.json({ limit: '8kb' }), async (req, res) => {
    const portfolioId = String(req.params.id || '');
    if (!VALID_ID.test(portfolioId)) {
        return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_ID', error: 'Invalid portfolio identifier.' });
    }
    const rawPublished = req.body?.isPublished ?? req.body?.is_published;
    if (rawPublished !== undefined && typeof rawPublished !== 'boolean') {
        return res.status(400).json({ success: false, code: 'INVALID_PUBLICATION_STATE', error: 'isPublished must be a boolean.' });
    }
    const isPublished = rawPublished === undefined ? true : rawPublished;
    try {
        const slug = isPublished ? assertPublishableSlug(req.body?.slug) : null;
        const result = await publishPortfolio({
            userId: req.user.uid,
            portfolioId,
            slug,
            isPublished,
        });
        return res.json({
            success: true,
            portfolio: {
                id: result.portfolioId,
                slug: result.slug,
                isPublished: result.isPublished,
                publishedAt: result.publishedAt,
                revision: result.revision,
            },
        });
    } catch (error) {
        const status = [400, 401, 404, 409].includes(Number(error?.status)) ? Number(error.status) : 503;
        if (status === 503) console.error('[portfolios] publish failed:', error?.code || error?.message);
        return res.status(status).json({
            success: false,
            code: status === 503 ? 'PORTFOLIO_PUBLICATION_UNAVAILABLE' : (error.code || 'PORTFOLIO_PUBLICATION_REJECTED'),
            error: status === 503 ? 'Portfolio publication is temporarily unavailable.' : error.message,
        });
    }
});

/* ─── Custom domain registration and DNS verification (DISC-043) ─────────── */

function customDomainError(res, error, fallback) {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 503;
    if (status >= 500) console.error('[portfolios] custom domain:', error?.code || error?.message);
    return res.status(status).json({
        success: false,
        code: status === 503 ? 'CUSTOM_DOMAIN_UNAVAILABLE' : (error.code || 'CUSTOM_DOMAIN_REJECTED'),
        error: status >= 500 ? fallback : error.message,
    });
}

router.post('/:id/custom-domain', express.json({ limit: '8kb' }), async (req, res) => {
    if (!VALID_ID.test(String(req.params.id || ''))) {
        return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_ID', error: 'Invalid portfolio identifier.' });
    }
    try {
        const registration = await customDomains.registerCustomDomain({
            userId: req.user.uid,
            portfolioId: req.params.id,
            domain: req.body?.domain,
        });
        // The plaintext token is returned exactly once; only its digest is stored.
        return res.status(201).json({
            success: true,
            domain: registration.domain,
            verificationToken: registration.verificationToken,
            status: registration.status,
            expiresAt: registration.expiresAt,
            instructions: registration.instructions,
            verificationRecord: { type: 'TXT', name: registration.domain, value: registration.verificationToken },
        });
    } catch (error) {
        return customDomainError(res, error, 'Custom domain registration is temporarily unavailable.');
    }
});

router.post('/:id/custom-domain/verify', express.json({ limit: '8kb' }), async (req, res) => {
    if (!VALID_ID.test(String(req.params.id || ''))) {
        return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_ID', error: 'Invalid portfolio identifier.' });
    }
    try {
        const result = await customDomains.verifyCustomDomain({
            userId: req.user.uid,
            portfolioId: req.params.id,
        });
        return res.json({ success: true, ...result });
    } catch (error) {
        return customDomainError(res, error, 'DNS verification is temporarily unavailable.');
    }
});

router.get('/:id/custom-domain', async (req, res) => {
    if (!VALID_ID.test(String(req.params.id || ''))) {
        return res.status(400).json({ success: false, code: 'INVALID_PORTFOLIO_ID', error: 'Invalid portfolio identifier.' });
    }
    try {
        const domain = await customDomains.getCustomDomain({ userId: req.user.uid, portfolioId: req.params.id });
        if (!domain) return res.status(404).json({ success: false, code: 'CUSTOM_DOMAIN_NOT_FOUND', error: 'No custom domain is registered for this portfolio.' });
        return res.json({ success: true, customDomain: domain });
    } catch (error) {
        return customDomainError(res, error, 'Custom domain lookup is temporarily unavailable.');
    }
});

module.exports = { portfoliosRouter: router };
