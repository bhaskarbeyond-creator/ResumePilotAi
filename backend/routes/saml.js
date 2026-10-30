'use strict';

/**
 * SAML 2.0 service provider endpoints.
 *
 * Flow (SP-initiated, HTTP-Redirect binding out / HTTP-POST binding in):
 *   1. GET  /api/auth/saml/:tenantId/login     → 302 to the tenant's IdP
 *   2. IdP authenticates the user, POSTs  /api/auth/saml/:tenantId/acs
 *   3. The assertion is verified, correlated to request (1), replay-checked,
 *      mapped to a local identity and exchanged for the same one-time code the
 *      OAuth callbacks already use. No new session mechanism is introduced.
 *
 * Administrator endpoints for the trust configuration live on the same router but
 * behind `requireRecentAdminAuthentication`, because the certificates stored there
 * are the entire security boundary for the tenant.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireRecentAdminAuthentication } = require('../security/auth');
const saml = require('../enterprise/saml');

const TENANT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function badRequest(res, code, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(400).json({ error: { code, message } });
}

function readTenantId(req) {
  const value = String(req.params.tenantId || '');
  return TENANT_ID.test(value) ? value : null;
}

function createSamlRouter({
  store,
  upsertFederatedIdentity,
  issueOAuthExchange,
  entityIdBase,
  acsBaseUrl,
  now = () => Date.now(),
  logger = console,
}) {
  if (!store) throw new Error('createSamlRouter requires a store');
  if (!entityIdBase || !acsBaseUrl) throw new Error('createSamlRouter requires entityIdBase and acsBaseUrl');

  const router = express.Router();
  const acsLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'SAML_RATE_LIMITED', message: 'Too many assertion submissions' } },
  });

  const spEntityId = tenantId => `${entityIdBase}/${tenantId}`;
  const acsUrl = tenantId => `${acsBaseUrl}/${tenantId}/acs`;

  function handle(res, error) {
    if (error instanceof saml.SamlError) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(error.status || 400).json({ error: { code: error.code, message: error.message } });
    }
    logger.error('[SAML]', error && error.message ? error.message : error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      error: { code: 'SAML_UNAVAILABLE', message: 'Single sign-on is temporarily unavailable' },
    });
  }

  // --- Service provider metadata ------------------------------------------

  router.get('/:tenantId/metadata', async (req, res) => {
    const tenantId = readTenantId(req);
    if (!tenantId) return badRequest(res, 'INVALID_TENANT_ID', 'Tenant id is not valid');
    try {
      const xml = saml.buildSpMetadata({
        entityId: spEntityId(tenantId),
        acsUrl: acsUrl(tenantId),
        signingCertificate: process.env.SAML_SP_CERTIFICATE || null,
      });
      res.type('application/samlmetadata+xml');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(xml);
    } catch (error) {
      return handle(res, error);
    }
  });

  // --- SP-initiated login --------------------------------------------------

  router.get('/:tenantId/login', async (req, res) => {
    const tenantId = readTenantId(req);
    if (!tenantId) return badRequest(res, 'INVALID_TENANT_ID', 'Tenant id is not valid');
    try {
      const config = await store.loadConfig(tenantId);
      // An unconfigured or disabled tenant is indistinguishable from a nonexistent
      // one: the endpoint must not confirm which tenants exist to an anonymous caller.
      if (!config || !config.enabled) {
        return res.status(404).json({ error: { code: 'SAML_NOT_CONFIGURED', message: 'Single sign-on is not enabled' } });
      }
      const relayState = typeof req.query.relayState === 'string' ? req.query.relayState : null;
      const request = saml.buildAuthnRequest({
        spEntityId: spEntityId(tenantId),
        acsUrl: acsUrl(tenantId),
        idpSsoUrl: config.ssoUrl,
        relayState,
        now: now(),
      });
      await store.createAuthnRequest({
        id: request.requestId,
        tenantId,
        relayState,
        expiresAt: request.expiresAt,
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, request.url);
    } catch (error) {
      return handle(res, error);
    }
  });

  // --- Assertion consumer service ----------------------------------------

  router.post('/:tenantId/acs', acsLimiter, express.urlencoded({ extended: false, limit: '1mb' }), async (req, res) => {
    const tenantId = readTenantId(req);
    if (!tenantId) return badRequest(res, 'INVALID_TENANT_ID', 'Tenant id is not valid');
    const payload = req.body && (req.body.SAMLResponse || req.body.SAMLresponse);
    if (!payload) return badRequest(res, 'SAML_RESPONSE_MISSING', 'SAMLResponse is required');

    try {
      const config = await store.loadConfig(tenantId);
      if (!config || !config.enabled) {
        return res.status(404).json({ error: { code: 'SAML_NOT_CONFIGURED', message: 'Single sign-on is not enabled' } });
      }

      // Correlation first: the response must name a request this SP issued for
      // this tenant. This lookup key is unverified at this point and is only used
      // to select which request to check against — the signature check below is
      // what actually authorises it.
      const inResponseTo = saml.readInResponseTo(payload);
      if (!inResponseTo) return badRequest(res, 'SAML_INRESPONSETO_MISMATCH', 'Response does not answer a pending request');
      const pending = await store.readAuthnRequest(inResponseTo);
      if (!pending || pending.tenantId !== tenantId || pending.consumedAt !== null || pending.expiresAt <= now()) {
        return badRequest(res, 'SAML_UNKNOWN_REQUEST', 'Response does not answer a pending request');
      }

      const assertion = saml.verifySamlResponse({
        samlResponse: payload,
        certificates: config.certificates,
        spEntityId: spEntityId(tenantId),
        acsUrl: acsUrl(tenantId),
        idpEntityId: config.entityId,
        expectedRequestId: inResponseTo,
        now: now(),
      });

      // Consume the request only after the assertion is cryptographically trusted,
      // and before any identity side effect: a replayed POST must not provision.
      if (!(await store.consumeAuthnRequest({ id: inResponseTo, tenantId, now: now() }))) {
        return badRequest(res, 'SAML_REQUEST_REPLAYED', 'That sign-in request has already been used');
      }
      const fresh = await store.rememberAssertion({
        assertionId: assertion.assertionId,
        tenantId,
        expiresAt: assertion.notOnOrAfter,
      });
      if (!fresh) return badRequest(res, 'SAML_ASSERTION_REPLAYED', 'That assertion has already been used');

      if (!assertion.email) {
        return badRequest(res, 'SAML_SUBJECT_MISSING', 'The assertion did not carry a usable email address');
      }

      const uid = await upsertFederatedIdentity({
        provider: 'saml',
        providerId: `${tenantId}:${assertion.subjectId}`,
        email: assertion.email,
        emailVerified: true,
        displayName: assertion.attributes.displayName || assertion.attributes.cn || assertion.email,
        photoURL: null,
      });
      const code = await issueOAuthExchange(uid, 'saml');

      res.setHeader('Cache-Control', 'no-store');
      if (req.accepts(['html', 'json']) === 'json') {
        return res.json({ success: true, exchangeCode: code, tenantId, subject: assertion.subjectId });
      }
      return res.redirect(302, `/dashboard#oauth_code=${encodeURIComponent(code)}&provider=saml`);
    } catch (error) {
      return handle(res, error);
    }
  });

  // --- Trust configuration (administrators only) -------------------------

  router.get('/:tenantId/config', requireRecentAdminAuthentication, async (req, res) => {
    const tenantId = readTenantId(req);
    if (!tenantId) return badRequest(res, 'INVALID_TENANT_ID', 'Tenant id is not valid');
    try {
      const config = await store.loadConfig(tenantId);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, config });
    } catch (error) {
      return handle(res, error);
    }
  });

  router.put('/:tenantId/config', requireRecentAdminAuthentication, async (req, res) => {
    const tenantId = readTenantId(req);
    if (!tenantId) return badRequest(res, 'INVALID_TENANT_ID', 'Tenant id is not valid');
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      let source = body;
      if (body.metadataXml) {
        const metadata = saml.parseIdpMetadata(String(body.metadataXml));
        source = {
          entityId: metadata.entityId,
          ssoUrl: metadata.ssoUrl,
          sloUrl: metadata.sloUrl,
          certificates: metadata.certificates.map(cert => cert.base64),
          nameIdFormat: metadata.nameIdFormat,
        };
      }
      if (!source.entityId) return badRequest(res, 'SAML_CONFIG_INVALID', 'entityId is required (or supply metadataXml)');
      if (!source.ssoUrl) return badRequest(res, 'SAML_CONFIG_INVALID', 'ssoUrl is required (or supply metadataXml)');
      const certificates = saml.normalizeCertificates(source.certificates).map(cert => cert.base64);
      const saved = await store.saveConfig(tenantId, {
        entityId: String(source.entityId),
        ssoUrl: String(source.ssoUrl),
        sloUrl: source.sloUrl ? String(source.sloUrl) : null,
        certificates,
        nameIdFormat: source.nameIdFormat || null,
        defaultRole: body.defaultRole || 'MEMBER',
        jitProvisioning: body.jitProvisioning === true,
        enabled: body.enabled === true,
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, config: saved });
    } catch (error) {
      return handle(res, error);
    }
  });

  return router;
}

module.exports = { createSamlRouter };
