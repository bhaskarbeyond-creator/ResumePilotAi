'use strict';

const express = require('express');

/**
 * Export routes: PDF rendering, DOCX generation, render token consumption.
 *
 * @param {object} deps
 * @param {Function} deps.getRepository
 * @param {Function} deps.consumeExportRenderToken
 * @param {Function} deps.discardExportRenderToken
 * @param {Function} deps.createExportRenderToken
 * @param {Function} deps.acquireSlot
 * @param {Function} deps.releaseSlot
 * @param {Function} deps.chromium
 * @param {Function} deps.resolveExportTemplate
 * @param {Function} deps.createResumeDocx
 * @param {Function} deps.resolveEffectiveEntitlement
 * @param {Function} deps.isMembershipActive
 * @param {Function} deps.isPaidMembershipTier
 * @param {Function} deps.toCanonicalUser
 * @param {string} deps.protocol
 * @param {string} deps.websiteName
 * @param {object} deps.logger
 */
function createExportRouter(deps) {
    const router = express.Router();
    const {
        getRepository,
        consumeExportRenderToken,
        discardExportRenderToken,
        createExportRenderToken,
        acquireSlot,
        releaseSlot,
        chromium,
        resolveExportTemplate,
        createResumeDocx,
        resolveEffectiveEntitlement,
        isMembershipActive,
        isPaidMembershipTier,
        toCanonicalUser,
        protocol,
        websiteName,
        logger,
    } = deps;

    const EXPORTABLE_TEMPLATE = /^(?:Cv(?:[1-9]|[1-4][0-9]|5[0-1])|Cover[1-4])$/;

    // Redeems a single-use render token for the resume payload.
    router.get('/export-render-data', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        try {
            const data = await consumeExportRenderToken(req.query.token);
            if (!data) return res.status(404).json({ error: 'Export data not found', code: 'RENDER_TOKEN_NOT_FOUND' });
            return res.json({ data });
        } catch (error) {
            logger.error('[Export render data]', { error: error.message, requestId: res.locals.requestId });
            return res.status(503).json({ error: 'Export data is temporarily unavailable' });
        }
    });

    // PDF export
    router.post(['/export', '/public-export'], async (req, res) => {
        if (!acquireSlot()) {
            return res.status(429).json({ error: 'Server is busy processing PDF exports. Please try again in a few seconds.' });
        }
        let browser;
        let renderToken;
        try {
            const resumeId = String(req.body.resumeId || '');
            const resumeName = String(req.body.resumeName || '');
            const language = String(req.body.language || 'en');
            if (!/^[A-Za-z0-9_-]{4,128}$/.test(resumeId)
                || !EXPORTABLE_TEMPLATE.test(resumeName)
                || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) {
                return res.status(400).json({ error: 'Invalid export request' });
            }
            const repo = getRepository();

            let stored;
            let ownerUid;
            if (req.path.endsWith('/public-export')) {
                const published = await repo.getPublicResume(resumeId);
                if (!published || published.isPublished !== true || published.publicationMode !== 'explicit') {
                    return res.status(404).json({ error: 'Resume not found' });
                }
                ownerUid = published.ownerUid;
                stored = published.data;
                if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
                    return res.status(422).json({ error: 'Resume data is invalid' });
                }
            } else {
                ownerUid = req.user?.uid;
                const isCover = resumeName.startsWith('Cover');
                const draft = isCover
                    ? await repo.getCover(ownerUid, resumeId)
                    : await repo.getResume(ownerUid, resumeId);
                if (!draft) return res.status(404).json({ error: 'Resume not found' });
                stored = { ...draft };
                for (const field of ['revision', 'created_at', 'createdAt', 'updatedAt', 'ownerUid', 'userId']) delete stored[field];
            }

            const owner = await repo.getUser(ownerUid);
            if (!owner) return res.status(404).json({ error: 'Resume owner not found' });
            const ownerCanonical = toCanonicalUser(owner);
            const publicConfig = (await repo.getSetting('public_config')) || {};
            const systemSettings = (await repo.getSetting('system_settings')) || {};
            const isGlobalFreeMode = publicConfig.subscriptions === false
                || publicConfig.subscriptions?.state === false
                || publicConfig.subscriptions?.enabled === false
                || systemSettings.subscriptions?.state === false;
            const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(String(ownerCanonical.role || req.user?.role || '').toUpperCase());

            const entitled = isGlobalFreeMode || isPrivileged || isMembershipActive(ownerCanonical) || (
                isPaidMembershipTier(ownerCanonical.membership)
                && ['ACTIVE', 'ADMIN_GRANTED'].includes(String(ownerCanonical.paymentStatus || '').toUpperCase())
                && (!ownerCanonical.membershipEnds || new Date(ownerCanonical.membershipEnds) > new Date())
            );
            if (!entitled) {
                return res.status(402).json({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED', message: 'An active subscription is required for PDF export', requestId: res.locals.requestId } });
            }
            if (stored?.template && stored.template !== resumeName) return res.status(400).json({ error: 'Template mismatch' });

            let exportPreferences = { renderTimeout: 60_000, paperFormat: 'A4' };
            try {
                const preferences = (await repo.getSetting('public_config').catch(() => null)) || {};
                const configured = preferences.exportPdf || {};
                const timeout = Number(configured.renderTimeout);
                if (Number.isFinite(timeout)) exportPreferences.renderTimeout = Math.max(5_000, Math.min(Math.floor(timeout), 120_000));
                if (['A4', 'Letter', 'Legal'].includes(configured.paperFormat)) exportPreferences.paperFormat = configured.paperFormat;
            } catch (preferenceError) {
                console.warn('[Export preferences] unavailable; using bounded defaults:', preferenceError.message);
            }
            renderToken = await createExportRenderToken(stored);
            const launchOptions = {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--no-zygote']
            };
            browser = await chromium.launch(launchOptions);
            const context = await browser.newContext({
                viewport: { width: 794, height: 1123 },
                deviceScaleFactor: 1,
                ignoreHTTPSErrors: true
            });
            const rawHost = req.headers['x-forwarded-host'] || req.headers.host || websiteName;
            const hostClean = /^[a-zA-Z0-9.:_-]+$/.test(rawHost) ? rawHost : websiteName;
            const isLocalOrHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || protocol === 'https';
            const requestProto = isLocalOrHttps ? 'https' : (req.headers['x-forwarded-proto'] || protocol);
            const renderOrigin = `${requestProto}://${hostClean}`;
            let allowedRenderOrigin = `${protocol}://${websiteName}`;
            try { allowedRenderOrigin = new URL(renderOrigin).origin; } catch {}

            const allowedHosts = new Set([
                websiteName,
                'ai-resume-builder.local',
                'localhost',
                '127.0.0.1',
                'lh3.googleusercontent.com',
                'fonts.googleapis.com',
                'fonts.gstatic.com',
                'cdnjs.cloudflare.com',
                'unpkg.com'
            ]);
            try {
                const parsedRender = new URL(renderOrigin);
                if (parsedRender.hostname) allowedHosts.add(parsedRender.hostname);
            } catch {}

            await context.route('**/*', async route => {
                const requestUrl = route.request().url();
                if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return route.continue();
                try {
                    const parsed = new URL(requestUrl);
                    if (allowedHosts.has(parsed.hostname) || parsed.origin === allowedRenderOrigin) return route.continue();
                    const resourceType = route.request().resourceType();
                    if (['image', 'font', 'stylesheet'].includes(resourceType) && (parsed.protocol === 'https:' || parsed.protocol === 'http:')) {
                        return route.continue();
                    }
                } catch (_) {}
                return route.abort('blockedbyclient');
            });
            const page = await context.newPage();
            const targetUrl = `${renderOrigin}/export/${encodeURIComponent(resumeName)}/${encodeURIComponent(resumeId)}/${encodeURIComponent(language)}#renderToken=${encodeURIComponent(renderToken)}`;
            console.log('Playwright exporting PDF, navigating to: ', targetUrl);
            await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: exportPreferences.renderTimeout,
            });
            await page.waitForSelector('html[data-export-ready="true"], html[data-export-error]', { timeout: Math.min(exportPreferences.renderTimeout, 30_000) });
            const exportError = await page.evaluate(() => globalThis.document.documentElement.getAttribute('data-export-error'));
            if (exportError) throw new Error(`EXPORT_RENDER_FAILED:${exportError}`);
            await page.evaluate(async () => {
                await globalThis.document.fonts?.ready;
                await Promise.all([...globalThis.document.images].map(image => image.complete || !image.decode ? Promise.resolve() : image.decode().catch(() => {})));
            }).catch(() => {});
            await page.waitForTimeout(250);

            const pdfBuffer = await page.pdf({
                format: exportPreferences.paperFormat,
                printBackground: true,
                preferCSSPageSize: true,
                margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
            });
            await browser.close();
            browser = undefined;

            if (!pdfBuffer || pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
                throw new Error('EXPORT_PDF_INVALID');
            }
            res.setHeader('Cache-Control', 'no-store, private');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
            res.setHeader('Content-Length', String(pdfBuffer.length));
            return res.send(pdfBuffer);
        } catch (error) {
            console.error('[Export PDF]', { code: error.code || 'EXPORT_FAILED', message: error.message, requestId: res.locals.requestId });
            if (browser) await browser.close().catch(() => {});
            if (res.headersSent) return res.end();
            return res.status(500).json({ error: { code: 'EXPORT_FAILED', message: 'Unable to generate the PDF export. Please try again.', requestId: res.locals.requestId } });
        } finally {
            if (renderToken) {
                try { await discardExportRenderToken(renderToken); }
                catch (discardError) {
                    console.error('[Export token revocation]', { code: discardError.code || 'REVOCATION_FAILED', requestId: res.locals.requestId });
                }
            }
            releaseSlot();
        }
    });

    // DOCX export
    router.post('/export-docx', async (req, res) => {
        const { resumeName, resumeId } = req.body;
        if (!/^[A-Za-z0-9_-]{4,128}$/.test(String(resumeId || ''))) return res.status(400).json({ error: 'Invalid resume' });
        const requestedTemplate = String(resumeName || req.body.template || '').trim();
        if (requestedTemplate && !EXPORTABLE_TEMPLATE.test(requestedTemplate)) {
            return res.status(400).json({ error: 'Invalid export request' });
        }
        const repo = getRepository();
        const docId = String(resumeId);
        const stored = requestedTemplate.startsWith('Cover')
            ? await repo.getCover(req.user.uid, docId)
            : await repo.getResume(req.user.uid, docId);
        if (!stored) return res.status(404).json({ error: 'Resume not found' });
        const owner = await repo.getUser(req.user.uid);
        if (!owner) return res.status(404).json({ error: 'Resume owner not found' });
        const publicConfig = (await repo.getSetting('public_config')) || {};
        const systemSettings = (await repo.getSetting('system_settings')) || {};
        const isGlobalFreeMode = publicConfig.subscriptions === false
            || publicConfig.subscriptions?.state === false
            || publicConfig.subscriptions?.enabled === false
            || systemSettings.subscriptions?.state === false;
        const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(String(owner.role || req.user?.role || '').toUpperCase());

        const entitlement = resolveEffectiveEntitlement(owner, { userClaims: req.user || {} });
        if (!isGlobalFreeMode && !isPrivileged && !entitlement.allowsDocxExport) {
            return res.status(402).json({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED', message: 'An active subscription or enterprise plan is required for DOCX export', requestId: res.locals.requestId } });
        }
        try {
            let resolvedTemplate;
            try {
                resolvedTemplate = resolveExportTemplate(stored, requestedTemplate);
            } catch (templateError) {
                return res.status(400).json({ error: templateError.code === 'TEMPLATE_MISMATCH' ? 'Template mismatch' : 'Invalid export request' });
            }
            const personName = [stored.firstname, stored.lastname].filter(Boolean).join(' ');
            const safeName = String(personName || stored.title || 'Resume').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 80) || 'Resume';
            const resumeData = {
                ...stored,
                template: resolvedTemplate,
                resumeName: resolvedTemplate,
                colors: null,
            };
            const buffer = await createResumeDocx(resumeData);
            res.setHeader('Cache-Control', 'no-store, private');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/\s+/g, '_')}.docx"`);
            res.setHeader('Content-Length', String(buffer.length));
            return res.send(buffer);
        } catch (error) {
            console.error('[DOCX export]', error.message);
            return res.status(500).json({ error: { code: 'DOCX_EXPORT_FAILED', message: 'Unable to generate DOCX export', requestId: res.locals.requestId } });
        }
    });

    return router;
}

module.exports = { createExportRouter };
