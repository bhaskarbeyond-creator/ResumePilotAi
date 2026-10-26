'use strict';

const express = require('express');

/**
 * Miscellaneous routes — simple, low-coupling endpoints.
 *
 * @param {object} deps
 * @param {Function} deps.getRepository
 * @param {Function} deps.normalizeLlmDiscoverySettings
 * @param {Function} deps.loadTwilioRuntimeConfig
 * @param {Function} deps.requireRecentAdminAuthentication
 * @param {object} deps.logger
 * @param {object} deps.fetch
 */
function createMiscRouter(deps) {
    const router = express.Router();
    const { getRepository, normalizeLlmDiscoverySettings, loadTwilioRuntimeConfig, requireRecentAdminAuthentication, logger, fetch } = deps;

    // ── Retired endpoints (410/501) ──

    router.post('/invoice', (_req, res) => {
        return res.status(410).json({ error: { code: 'LEGACY_INVOICE_ENDPOINT_RETIRED', message: 'Generate invoices from a verified payment order', requestId: res.locals.requestId } });
    });

    router.post('/jobs/naukri', async (_req, res) => {
        return res.status(501).json({
            success: false,
            code: 'SCRAPER_NOT_CONFIGURED',
            error: 'Naukri ingestion is not configured. No demo or fabricated listings are returned.',
        });
    });

    // ── Simple static/config routes ──

    router.get('/rtl-font-config', (_req, res) => {
        res.json({
            supportedLanguages: ['ar', 'he', 'fa', 'ur'],
            isRtlSupported: true,
            rtlFonts: ['Amiri', 'Noto Naskh Arabic', 'David Libre', 'Segoe UI']
        });
    });

    router.get('/llms.txt', async (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const publicConfig = await getRepository().getSetting('public_config');
            const llmGeo = normalizeLlmDiscoverySettings(publicConfig?.llmGeo || {});
            if (!llmGeo.enableLlmGeo || !llmGeo.llmsTxtContent) {
                return res.status(404).type('text/plain').send('LLM discovery metadata is not published.\n');
            }
            return res.type('text/plain').send(`${llmGeo.llmsTxtContent}\n`);
        } catch (error) {
            if (error.status === 400) {
                return res.status(503).type('text/plain').send('LLM discovery metadata is unavailable.\n');
            }
            console.error('[llms.txt]', { code: error.code, requestId: res.locals.requestId });
            return res.status(503).type('text/plain').send('LLM discovery metadata is unavailable.\n');
        }
    });

    router.get('/service-availability', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const { getServiceAvailability } = require('../services/platformHealth');
            return res.json({ success: true, ...(await getServiceAvailability(req.app)) });
        } catch (error) {
            console.error('[Service availability]', error?.message || error);
            return res.status(503).json({ success: false, error: { code: 'AVAILABILITY_UNAVAILABLE', message: 'Service availability could not be determined' } });
        }
    });

    // ── Admin SMS (requires admin auth) ──

    router.post('/send-sms', requireRecentAdminAuthentication, async (req, res) => {
        const { toPhone, messageBody } = req.body;
        if (!toPhone || !messageBody) {
            return res.status(400).json({ success: false, error: 'Target phone number and message body are required.' });
        }
        try {
            const { accountSid, authToken, fromPhoneNumber } = await loadTwilioRuntimeConfig();
            if (!accountSid || !authToken || !fromPhoneNumber) {
                return res.status(400).json({ success: false, error: 'Twilio Gateway not configured. Please enter Account SID, Auth Token, and From Phone Number in Admin -> Twilio Settings.' });
            }
            if (!/^AC[a-f0-9]{32}$/i.test(accountSid) || !/^\+[1-9]\d{7,14}$/.test(String(toPhone))
                || !/^\+[1-9]\d{7,14}$/.test(String(fromPhoneNumber)) || String(messageBody).length > 1600) {
                return res.status(400).json({ success: false, error: 'Invalid phone number or message format.' });
            }
            const twilio = require('twilio');
            const client = twilio(accountSid, authToken);
            const message = await client.messages.create({ body: messageBody, from: fromPhoneNumber, to: toPhone });
            return res.json({ success: true, sid: message.sid, status: message.status });
        } catch (error) {
            logger.error('[SMS send]', { error: error.message, requestId: res.locals.requestId });
            return res.status(500).json({ success: false, error: 'Failed to send SMS.' });
        }
    });

    return router;
}

module.exports = { createMiscRouter };
