'use strict';

/**
 * Module 14: Enterprise SAML 2.0 Integration & Live IdP Validation Test Suite
 *
 * Verifies end-to-end SAML 2.0 Single Sign-On against live MariaDB:
 * 1. Admin trust configuration persistence (entityId, ssoUrl, certificates) in `enterprise_sso_config`
 * 2. SP Metadata publication (`GET /api/auth/saml/:tenantId/metadata`)
 * 3. SP-initiated authentication flow (`GET /api/auth/saml/:tenantId/login`), generating
 *    AuthnRequest signed/deflated payload and tracking in `saml_authn_requests`
 * 4. Assertion Consumer Service (`POST /api/auth/saml/:tenantId/acs`) processing cryptographically
 *    signed SAMLResponse assertions from a simulated Live IdP
 * 5. Federated identity provisioning into MariaDB users table & OAuth exchange code generation
 * 6. Single-use AuthnRequest consumption (`consumed_at` timestamp)
 * 7. Durable assertion replay defense (`saml_assertion_replay` tracking)
 * 8. Cryptographic tamper detection (signature invalidation upon payload mutation)
 * 9. Untrusted IdP certificate rejection
 * 10. Cross-tenant assertion containment (audience restriction)
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const express = require('express');
const request = require('supertest');

const saml = require('../enterprise/saml');
const { createMysqlSamlStore } = require('../enterprise/samlStore');
const { createSamlRouter } = require('../routes/saml');
const { getPool } = require('../database/mysql');

// ---------------------------------------------------------------------------
// OpenSSL & Certificate Helpers
// ---------------------------------------------------------------------------

function resolveOpenssl() {
  if (process.env.OPENSSL_BIN) return process.env.OPENSSL_BIN;
  for (const candidate of ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'D:\\xampp\\apache\\bin\\openssl.exe']) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' });
      return candidate;
    } catch (_) {}
  }
  return 'openssl';
}
const OPENSSL_BIN = resolveOpenssl();

function makeCertificate(directory, name, commonName) {
  const keyPath = path.join(directory, `${name}.key.pem`);
  const certPath = path.join(directory, `${name}.crt.pem`);
  execFileSync(OPENSSL_BIN, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '2', '-subj', `/CN=${commonName}`,
  ], { stdio: 'ignore' });
  const privateKey = fs.readFileSync(keyPath, 'utf8');
  const certificate = fs.readFileSync(certPath, 'utf8');
  const base64 = certificate.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { privateKey, certificate, base64 };
}

function iso(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ---------------------------------------------------------------------------
// Live IdP Assertion Generator
// ---------------------------------------------------------------------------

function buildSignedSamlResponse({
  now = Date.now(),
  responseId = `resp_${crypto.randomBytes(8).toString('hex')}`,
  assertionId = `assert_${crypto.randomBytes(8).toString('hex')}`,
  issuer,
  audience,
  recipient,
  destination,
  requestId,
  email = 'jane.doe@enterprise-corp.test',
  displayName = 'Jane Doe',
  signWith,
  notBefore = now - 60_000,
  notOnOrAfter = now + 300_000,
}) {
  const assertion = [
    `<saml:Assertion xmlns:saml="${saml.NS.saml}" ID="${assertionId}" Version="2.0" IssueInstant="${iso(now)}">`,
    `<saml:Issuer>${issuer}</saml:Issuer>`,
    `<saml:Conditions NotBefore="${iso(notBefore)}" NotOnOrAfter="${iso(notOnOrAfter)}">`,
    `<saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction>`,
    '</saml:Conditions>',
    '<saml:Subject>',
    `<saml:NameID Format="${saml.NAMEID_EMAIL}">${email}</saml:NameID>`,
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">`,
    `<saml:SubjectConfirmationData NotOnOrAfter="${iso(notOnOrAfter)}" Recipient="${recipient}" InResponseTo="${requestId}"/>`,
    '</saml:SubjectConfirmation>',
    '</saml:Subject>',
    `<saml:AuthnStatement AuthnInstant="${iso(now)}" SessionIndex="sess_${crypto.randomBytes(6).toString('hex')}">`,
    '<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext>',
    '</saml:AuthnStatement>',
    '<saml:AttributeStatement>',
    `<saml:Attribute Name="displayName"><saml:AttributeValue>${displayName}</saml:AttributeValue></saml:Attribute>`,
    `<saml:Attribute Name="email"><saml:AttributeValue>${email}</saml:AttributeValue></saml:Attribute>`,
    '</saml:AttributeStatement>',
    '</saml:Assertion>',
  ].join('');

  const xml = [
    `<samlp:Response xmlns:samlp="${saml.NS.samlp}" xmlns:saml="${saml.NS.saml}"`,
    ` ID="${responseId}" Version="2.0" IssueInstant="${iso(now)}" Destination="${destination}" InResponseTo="${requestId}">`,
    `<saml:Issuer>${issuer}</saml:Issuer>`,
    '<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>',
    assertion,
    '</samlp:Response>',
  ].join('');

  const { SignedXml } = require('xml-crypto');
  const signature = new SignedXml({
    privateKey: signWith.privateKey,
    publicCert: signWith.certificate,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    getKeyInfoContent: () =>
      `<X509Data xmlns="http://www.w3.org/2000/09/xmldsig#"><X509Certificate>${signWith.base64}</X509Certificate></X509Data>`,
  });

  signature.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    uri: `#${assertionId}`,
  });

  signature.computeSignature(xml, {
    location: {
      reference: "//*[local-name(.)='Assertion']",
      action: 'append',
    },
  });

  return {
    rawXml: signature.getSignedXml(),
    base64Response: Buffer.from(signature.getSignedXml(), 'utf8').toString('base64'),
    assertionId,
    responseId,
  };
}

// ---------------------------------------------------------------------------
// Main Test Suite
// ---------------------------------------------------------------------------

test('Module 14: Enterprise SAML 2.0 Live IdP Validation & MariaDB Integration', async (t) => {
  const pool = getPool();
  let workdir = null;
  let trustedIdp = null;
  let rogueIdp = null;

  // Generate test certificates
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'saml-live-test-'));
  trustedIdp = makeCertificate(workdir, 'live-idp', 'idp.enterprise-corp.test');
  rogueIdp = makeCertificate(workdir, 'rogue-idp', 'attacker.evil.test');

  const tenantId = `ent_${crypto.randomBytes(8).toString('hex')}`;
  const idpEntityId = 'https://idp.enterprise-corp.test/metadata';
  const idpSsoUrl = 'https://idp.enterprise-corp.test/sso/login';

  const entityIdBase = 'https://ime365.test/api/auth/saml';
  const acsBaseUrl = 'https://ime365.test/api/auth/saml';

  // Seed test tenant in MariaDB (both id and slug equal tenantId)
  await pool.query(
    `INSERT INTO enterprise_tenants (id, slug, displayName, lifecycleState, isolationTier, policyVersion)
     VALUES (?, ?, 'Enterprise Corp Test', 'ACTIVE', 'ENTERPRISE', 1)`,
    [tenantId, tenantId]
  );

  // App setup with live MySQL SAML store
  const samlStore = createMysqlSamlStore();
  const createdIdentities = [];
  const issuedCodes = [];

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Bypass admin authentication guard for integration testing configuration route
  app.use((req, res, next) => {
    req.user = {
      uid: 'usr_admin_test',
      email: 'admin@ime365.test',
      claims: { role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) },
      admin: true,
    };
    next();
  });

  app.use('/api/auth/saml', createSamlRouter({
    store: samlStore,
    upsertFederatedIdentity: async (identity) => {
      createdIdentities.push(identity);
      const uid = `usr_saml_${crypto.randomBytes(6).toString('hex')}`;
      // Persist user record in MariaDB users table
      await pool.query(
        `INSERT INTO users (id, email, role, created_at)
         VALUES (?, ?, 'MEMBER', NOW(3))
         ON DUPLICATE KEY UPDATE email = VALUES(email)`,
        [uid, identity.email]
      );
      return uid;
    },
    issueOAuthExchange: async (uid, provider) => {
      const code = `code_${crypto.randomBytes(16).toString('hex')}`;
      issuedCodes.push({ uid, provider, code });
      return code;
    },
    entityIdBase,
    acsBaseUrl,
  }));

  t.after(async () => {
    // Teardown: delete tenant cascading through enterprise_sso_config, saml_authn_requests, saml_assertion_replay
    try {
      await pool.query('DELETE FROM enterprise_tenants WHERE id = ?', [tenantId]);
    } catch (_) {}
    if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
  });

  // Step 1: Save trust configuration
  await t.test('1. Trust Configuration PUT persists IdP config into MariaDB enterprise_sso_config', async () => {
    const configRes = await request(app)
      .put(`/api/auth/saml/${tenantId}/config`)
      .send({
        entityId: idpEntityId,
        ssoUrl: idpSsoUrl,
        sloUrl: 'https://idp.enterprise-corp.test/slo',
        certificates: [trustedIdp.base64],
        enabled: true,
        jitProvisioning: true,
        defaultRole: 'MEMBER',
      });

    assert.equal(configRes.status, 200, `Configuration failed: ${JSON.stringify(configRes.body)}`);
    assert.equal(configRes.body.success, true);
    assert.equal(configRes.body.config.entityId, idpEntityId);
    assert.equal(configRes.body.config.enabled, true);

    // Verify row in MariaDB table enterprise_sso_config
    const [rows] = await pool.query('SELECT * FROM enterprise_sso_config WHERE tenant_id = ?', [tenantId]);
    assert.equal(rows.length, 1, 'enterprise_sso_config row must exist');
    assert.equal(rows[0].entity_id, idpEntityId);
    assert.equal(rows[0].sso_url, idpSsoUrl);
    assert.equal(Number(rows[0].enabled), 1);
  });

  // Step 2: Fetch SP Metadata
  await t.test('2. GET /api/auth/saml/:tenantId/metadata serves valid XML SP EntityDescriptor', async () => {
    const metaRes = await request(app)
      .get(`/api/auth/saml/${tenantId}/metadata`);

    assert.equal(metaRes.status, 200);
    assert.match(metaRes.headers['content-type'], /xml/);
    assert.ok(metaRes.text.includes(`entityID="${entityIdBase}/${tenantId}"`), 'Metadata must include SP entityID');
    assert.ok(metaRes.text.includes(`Location="${acsBaseUrl}/${tenantId}/acs"`), 'Metadata must include ACS URL');
  });

  // Step 3: SP-initiated login
  let activeRequestId = null;
  await t.test('3. GET /api/auth/saml/:tenantId/login mints AuthnRequest & records in MariaDB', async () => {
    const loginRes = await request(app)
      .get(`/api/auth/saml/${tenantId}/login?relayState=/onboarding`);

    assert.equal(loginRes.status, 302, 'Login endpoint must redirect to IdP SSO URL');
    const redirectUrl = new URL(loginRes.headers.location);
    assert.equal(redirectUrl.origin, new URL(idpSsoUrl).origin);
    assert.equal(redirectUrl.pathname, new URL(idpSsoUrl).pathname);

    const samlRequest = redirectUrl.searchParams.get('SAMLRequest');
    const relayState = redirectUrl.searchParams.get('RelayState');
    assert.ok(samlRequest, 'Redirect must contain SAMLRequest query param');
    assert.equal(relayState, '/onboarding', 'RelayState must be passed through');

    // Decode and parse AuthnRequest
    const zlib = require('zlib');
    const inflatedXml = zlib.inflateRawSync(Buffer.from(samlRequest, 'base64')).toString('utf8');
    assert.ok(inflatedXml.includes('<samlp:AuthnRequest'), 'Must be valid AuthnRequest XML');

    // Extract request ID
    const match = inflatedXml.match(/ID="([^"]+)"/);
    assert.ok(match && match[1], 'AuthnRequest must contain an ID attribute');
    activeRequestId = match[1];

    // Verify row was persisted in MariaDB saml_authn_requests table
    const [reqRows] = await pool.query('SELECT * FROM saml_authn_requests WHERE id = ?', [activeRequestId]);
    assert.equal(reqRows.length, 1, 'AuthnRequest must be stored in MariaDB');
    assert.equal(reqRows[0].tenant_id, tenantId);
    assert.equal(reqRows[0].consumed_at, null, 'Must not be consumed yet');
    assert.ok(new Date(reqRows[0].expires_at).getTime() > Date.now(), 'Must have valid future expiration');
  });

  const candidateEmail = `jane.candidate.${tenantId}@enterprise-corp.test`;

  // Step 4: Live IdP Assertion Consumption
  let validSignedAssertion = null;
  await t.test('4. POST /api/auth/saml/:tenantId/acs verifies live signed assertion and logs user in', async () => {
    validSignedAssertion = buildSignedSamlResponse({
      issuer: idpEntityId,
      audience: `${entityIdBase}/${tenantId}`,
      recipient: `${acsBaseUrl}/${tenantId}/acs`,
      destination: `${acsBaseUrl}/${tenantId}/acs`,
      requestId: activeRequestId,
      email: candidateEmail,
      displayName: 'Jane Candidate',
      signWith: trustedIdp,
    });

    const acsRes = await request(app)
      .post(`/api/auth/saml/${tenantId}/acs`)
      .set('Accept', 'application/json')
      .type('form')
      .send({ SAMLResponse: validSignedAssertion.base64Response });

    assert.equal(acsRes.status, 200, `ACS failed: ${JSON.stringify(acsRes.body)}`);
    assert.equal(acsRes.body.success, true);
    assert.ok(acsRes.body.exchangeCode, 'Must issue OAuth exchange code');
    assert.equal(acsRes.body.tenantId, tenantId);

    // Verify AuthnRequest is consumed in MariaDB
    const [reqRows] = await pool.query('SELECT * FROM saml_authn_requests WHERE id = ?', [activeRequestId]);
    assert.equal(reqRows.length, 1);
    assert.ok(reqRows[0].consumed_at !== null, 'consumed_at must be populated in MariaDB');

    // Verify assertion is remembered in MariaDB saml_assertion_replay ledger
    const [replayRows] = await pool.query('SELECT * FROM saml_assertion_replay WHERE assertion_id = ?', [validSignedAssertion.assertionId]);
    assert.equal(replayRows.length, 1, 'Assertion ID must be stored in replay ledger in MariaDB');
    assert.equal(replayRows[0].tenant_id, tenantId);

    // Verify identity was created and persisted in MariaDB users table
    const [userRows] = await pool.query('SELECT * FROM users WHERE email = ?', [candidateEmail]);
    assert.equal(userRows.length, 1, 'User must be created in MariaDB users table');
  });

  // Step 5: Replay Defense
  await t.test('5. Replaying the identical SAML assertion is rejected with 400', async () => {
    const replayRes = await request(app)
      .post(`/api/auth/saml/${tenantId}/acs`)
      .set('Accept', 'application/json')
      .type('form')
      .send({ SAMLResponse: validSignedAssertion.base64Response });

    assert.equal(replayRes.status, 400);
    assert.ok(
      replayRes.body.error.code === 'SAML_UNKNOWN_REQUEST' ||
      replayRes.body.error.code === 'SAML_REQUEST_REPLAYED' ||
      replayRes.body.error.code === 'SAML_ASSERTION_REPLAYED',
      `Expected replay rejection code, got ${replayRes.body.error.code}`
    );
  });

  // Step 6: Cryptographic Tamper Defense
  await t.test('6. Tampered assertion attributes invalidate cryptographic signature (400 SAML_SIGNATURE_INVALID)', async () => {
    // Generate new valid login request to have a fresh inResponseTo
    const loginRes = await request(app).get(`/api/auth/saml/${tenantId}/login`);
    const samlRequest = new URL(loginRes.headers.location).searchParams.get('SAMLRequest');
    const zlib = require('zlib');
    const inflatedXml = zlib.inflateRawSync(Buffer.from(samlRequest, 'base64')).toString('utf8');
    const freshRequestId = inflatedXml.match(/ID="([^"]+)"/)[1];

    const genuine = buildSignedSamlResponse({
      issuer: idpEntityId,
      audience: `${entityIdBase}/${tenantId}`,
      recipient: `${acsBaseUrl}/${tenantId}/acs`,
      destination: `${acsBaseUrl}/${tenantId}/acs`,
      requestId: freshRequestId,
      email: 'attacker@evil.test',
      signWith: trustedIdp,
    });

    // Tamper the email in the signed XML
    const tamperedXml = genuine.rawXml.replace('attacker@evil.test', 'admin@enterprise-corp.test');
    const tamperedBase64 = Buffer.from(tamperedXml, 'utf8').toString('base64');

    const tamperRes = await request(app)
      .post(`/api/auth/saml/${tenantId}/acs`)
      .set('Accept', 'application/json')
      .type('form')
      .send({ SAMLResponse: tamperedBase64 });

    assert.equal(tamperRes.status, 400);
    assert.equal(tamperRes.body.error.code, 'SAML_SIGNATURE_INVALID');
  });

  // Step 7: Untrusted IdP Certificate Rejection
  await t.test('7. Assertion signed by untrusted rogue IdP certificate is rejected', async () => {
    const loginRes = await request(app).get(`/api/auth/saml/${tenantId}/login`);
    const samlRequest = new URL(loginRes.headers.location).searchParams.get('SAMLRequest');
    const zlib = require('zlib');
    const inflatedXml = zlib.inflateRawSync(Buffer.from(samlRequest, 'base64')).toString('utf8');
    const freshRequestId = inflatedXml.match(/ID="([^"]+)"/)[1];

    const rogueSigned = buildSignedSamlResponse({
      issuer: idpEntityId,
      audience: `${entityIdBase}/${tenantId}`,
      recipient: `${acsBaseUrl}/${tenantId}/acs`,
      destination: `${acsBaseUrl}/${tenantId}/acs`,
      requestId: freshRequestId,
      email: 'rogue@evil.test',
      signWith: rogueIdp, // Signed by untrusted attacker key
    });

    const rogueRes = await request(app)
      .post(`/api/auth/saml/${tenantId}/acs`)
      .set('Accept', 'application/json')
      .type('form')
      .send({ SAMLResponse: rogueSigned.base64Response });

    assert.equal(rogueRes.status, 400);
    assert.ok(
      rogueRes.body.error.code === 'SAML_SIGNATURE_INVALID' ||
      rogueRes.body.error.code === 'SAML_UNKNOWN_SIGNING_CERT'
    );
  });

  // Step 8: Audience Restriction Containment
  await t.test('8. Cross-tenant assertion containment: mismatching audience is rejected', async () => {
    const loginRes = await request(app).get(`/api/auth/saml/${tenantId}/login`);
    const samlRequest = new URL(loginRes.headers.location).searchParams.get('SAMLRequest');
    const zlib = require('zlib');
    const inflatedXml = zlib.inflateRawSync(Buffer.from(samlRequest, 'base64')).toString('utf8');
    const freshRequestId = inflatedXml.match(/ID="([^"]+)"/)[1];

    const mismatchAudience = buildSignedSamlResponse({
      issuer: idpEntityId,
      audience: 'https://other-sp.test/saml', // Wrong audience!
      recipient: `${acsBaseUrl}/${tenantId}/acs`,
      destination: `${acsBaseUrl}/${tenantId}/acs`,
      requestId: freshRequestId,
      email: 'cross@enterprise-corp.test',
      signWith: trustedIdp,
    });

    const crossRes = await request(app)
      .post(`/api/auth/saml/${tenantId}/acs`)
      .set('Accept', 'application/json')
      .type('form')
      .send({ SAMLResponse: mismatchAudience.base64Response });

    assert.equal(crossRes.status, 400);
    assert.equal(crossRes.body.error.code, 'SAML_AUDIENCE_MISMATCH');
  });
});
