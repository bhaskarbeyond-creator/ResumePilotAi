'use strict';

/**
 * SAML 2.0 service provider — cryptographic and protocol contracts.
 *
 * Every test here is executed offline: real RSA keys, real X.509 certificates
 * generated at runtime, real XML signatures, real DEFLATE round trips. No IdP,
 * no network, no database. That is deliberate — the security properties of an
 * assertion intake are exactly the part that must be provable without asking a
 * third party to authenticate anything.
 *
 * Certificates are created with the `openssl` CLI into a temporary directory and
 * discarded with the process.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const express = require('express');

const saml = require('../enterprise/saml');
const { createInMemorySamlStore } = require('../enterprise/samlStore');
const { createSamlRouter } = require('../routes/saml');

const SP_ENTITY = 'https://app.example.test/api/auth/saml/acme';
const ACS_URL = 'https://app.example.test/api/auth/saml/acme/acs';
const IDP_ENTITY = 'https://idp.example.test/metadata';

// ---------------------------------------------------------------------------
// Fixtures: two independent key pairs
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

let trusted;
let attacker;
let workdir;

test.before(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'saml-sp-test-'));
  trusted = makeCertificate(workdir, 'idp', 'idp.example.test');
  attacker = makeCertificate(workdir, 'attacker', 'evil.example.test');
});

test.after(() => {
  if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Response builder
// ---------------------------------------------------------------------------

function iso(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildResponse({
  now = Date.now(),
  responseId = 'resp-1',
  assertionId = 'assert-1',
  issuer = IDP_ENTITY,
  audience = SP_ENTITY,
  recipient = ACS_URL,
  destination = ACS_URL,
  requestId = '_request-1',
  email = 'alice@example.com',
  status = 'Success',
  signWith = trusted,
  signedScope = 'assertion',
  conditions = true,
  nameId = true,
  extraAssertion = null,
  notBefore = now - 60_000,
  notOnOrAfter = now + 300_000,
} = {}) {
  const assertion = [
    `<saml:Assertion xmlns:saml="${saml.NS.saml}" ID="${assertionId}" Version="2.0" IssueInstant="${iso(now)}">`,
    `<saml:Issuer>${issuer}</saml:Issuer>`,
    conditions
      ? `<saml:Conditions NotBefore="${iso(notBefore)}" NotOnOrAfter="${iso(notOnOrAfter)}">`
        + `<saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction>`
        + '</saml:Conditions>'
      : '',
    '<saml:Subject>',
    nameId ? `<saml:NameID Format="${saml.NAMEID_EMAIL}">${email}</saml:NameID>` : '',
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">`
      + `<saml:SubjectConfirmationData NotOnOrAfter="${iso(notOnOrAfter)}" Recipient="${recipient}"`
      + ` InResponseTo="${requestId}"/>`
      + '</saml:SubjectConfirmation>',
    '</saml:Subject>',
    `<saml:AuthnStatement AuthnInstant="${iso(now)}" SessionIndex="session-1">`
      + '<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext>'
      + '</saml:AuthnStatement>',
    '<saml:AttributeStatement><saml:Attribute Name="displayName">'
      + '<saml:AttributeValue>Alice Example</saml:AttributeValue>'
      + '</saml:Attribute></saml:AttributeStatement>',
    '</saml:Assertion>',
  ].join('');

  const xml = [
    `<samlp:Response xmlns:samlp="${saml.NS.samlp}" xmlns:saml="${saml.NS.saml}"`,
    ` ID="${responseId}" Version="2.0" IssueInstant="${iso(now)}" Destination="${destination}"`,
    ` InResponseTo="${requestId}">`,
    `<saml:Issuer>${issuer}</saml:Issuer>`,
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:${status}"/></samlp:Status>`,
    extraAssertion || '',
    assertion,
    '</samlp:Response>',
  ].join('');

  if (!signWith) return xml;

  const { SignedXml } = require('xml-crypto');
  const signature = new SignedXml({
    privateKey: signWith.privateKey,
    publicCert: signWith.certificate,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    getKeyInfoContent: () =>
      `<X509Data xmlns="http://www.w3.org/2000/09/xmldsig#"><X509Certificate>${signWith.base64}</X509Certificate></X509Data>`,
  });
  const responseScoped = signedScope === 'response';
  const targetId = responseScoped ? responseId : assertionId;
  signature.addReference({
    xpath: responseScoped ? "/*[local-name(.)='Response']" : "//*[local-name(.)='Assertion']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    uri: `#${targetId}`,
  });
  signature.computeSignature(xml, {
    location: {
      reference: responseScoped ? "/*[local-name(.)='Response']" : "//*[local-name(.)='Assertion']",
      action: 'append',
    },
  });
  return signature.getSignedXml();
}

function verify(xml, overrides = {}) {
  return saml.verifySamlResponse({
    samlResponse: Buffer.from(xml, 'utf8').toString('base64'),
    certificates: [trusted.base64],
    spEntityId: SP_ENTITY,
    acsUrl: ACS_URL,
    idpEntityId: IDP_ENTITY,
    expectedRequestId: '_request-1',
    now: Date.now(),
    ...overrides,
  });
}

function rejectsWith(fn, code) {
  assert.throws(fn, error => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

// ---------------------------------------------------------------------------
// IdP metadata
// ---------------------------------------------------------------------------

function metadataXml({ entityId = IDP_ENTITY, sso = 'https://idp.example.test/sso', cert = trusted.base64, includeCert = true } = {}) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"',
    ` xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="${entityId}">`,
    '<md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">',
    includeCert
      ? `<md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`
      : '',
    '<md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>',
    `<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${sso}"/>`,
    '<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.test/sso-post"/>',
    '<md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.test/slo"/>',
    '</md:IDPSSODescriptor>',
    '</md:EntityDescriptor>',
  ].join('');
}

test('IdP metadata: entity id, redirect SSO endpoint, signing certificate and SLO are extracted', () => {
  const metadata = saml.parseIdpMetadata(metadataXml());
  assert.equal(metadata.entityId, IDP_ENTITY);
  assert.equal(metadata.ssoUrl, 'https://idp.example.test/sso');
  assert.equal(metadata.ssoBinding, saml.BINDING_REDIRECT);
  assert.equal(metadata.sloUrl, 'https://idp.example.test/slo');
  assert.equal(metadata.certificates.length, 1);
  assert.equal(metadata.certificates[0].base64, trusted.base64);
  assert.equal(metadata.nameIdFormat, saml.NAMEID_EMAIL);
});

test('IdP metadata: a certificate-free or plaintext-SSO document is refused', () => {
  rejectsWith(() => saml.parseIdpMetadata(metadataXml({ includeCert: false })), 'SAML_METADATA_INVALID');
  rejectsWith(() => saml.parseIdpMetadata(metadataXml({ sso: 'http://idp.example.test/sso' })), 'SAML_METADATA_INVALID');
  rejectsWith(() => saml.parseIdpMetadata('<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"/>'), 'SAML_METADATA_INVALID');
});

test('IdP metadata: a DTD is rejected before parsing', () => {
  const bomb = `<!DOCTYPE EntityDescriptor [<!ENTITY a "aaaaaaaaaa">]>${metadataXml()}`;
  rejectsWith(() => saml.parseIdpMetadata(bomb), 'SAML_XML_UNSAFE');
});

// ---------------------------------------------------------------------------
// AuthnRequest
// ---------------------------------------------------------------------------

test('AuthnRequest: DEFLATE payload carries issuer, ACS, destination and a fresh id', () => {
  const built = saml.buildAuthnRequest({
    spEntityId: SP_ENTITY,
    acsUrl: ACS_URL,
    idpSsoUrl: 'https://idp.example.test/sso',
    relayState: '/dashboard',
    now: Date.now(),
  });
  const url = new URL(built.url);
  assert.equal(url.origin + url.pathname, 'https://idp.example.test/sso');
  assert.equal(url.searchParams.get('RelayState'), '/dashboard');
  const inflated = zlib.inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest'), 'base64')).toString('utf8');
  assert.match(inflated, new RegExp(`ID="${built.requestId}"`));
  assert.match(inflated, new RegExp(`AssertionConsumerServiceURL="${ACS_URL.replace(/[.]/g, '\\.')}"`));
  assert.match(inflated, /<saml:Issuer>https:\/\/app\.example\.test\/api\/auth\/saml\/acme<\/saml:Issuer>/);
  assert.match(inflated, /Destination="https:\/\/idp\.example\.test\/sso"/);
  assert.equal(built.expiresAt > Date.now(), true);
});

test('AuthnRequest: a plaintext IdP endpoint is refused', () => {
  rejectsWith(() => saml.buildAuthnRequest({
    spEntityId: SP_ENTITY, acsUrl: ACS_URL, idpSsoUrl: 'http://idp.example.test/sso',
  }), 'SAML_METADATA_INVALID');
});

test('SP metadata advertises the tenant ACS as the default consumer', () => {
  const xml = saml.buildSpMetadata({ entityId: SP_ENTITY, acsUrl: ACS_URL });
  assert.match(xml, new RegExp(`entityID="${SP_ENTITY.replace(/[.]/g, '\\.')}"`));
  assert.match(xml, /WantAssertionsSigned="true"/);
  assert.match(xml, /AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"/);
  assert.match(xml, /index="0" isDefault="true"/);
});

// ---------------------------------------------------------------------------
// Assertion verification — the accepted path
// ---------------------------------------------------------------------------

test('Assertion: a correctly signed response yields the verified identity and attributes', () => {
  const result = verify(buildResponse());
  assert.equal(result.email, 'alice@example.com');
  assert.equal(result.subjectId, 'alice@example.com');
  assert.equal(result.assertionId, 'assert-1');
  assert.equal(result.issuer, IDP_ENTITY);
  assert.equal(result.inResponseTo, '_request-1');
  assert.equal(result.sessionIndex, 'session-1');
  assert.equal(result.attributes.displayName, 'Alice Example');
  assert.equal(result.signedScope, 'Assertion');
  assert.equal(result.signatureFingerprint, crypto.createHash('sha256').update(Buffer.from(trusted.base64, 'base64')).digest('hex'));
  assert.ok(result.notOnOrAfter > Date.now());
});

test('Assertion: a response-level signature over the whole document is accepted', () => {
  const result = verify(buildResponse({ signedScope: 'response' }));
  assert.equal(result.email, 'alice@example.com');
  assert.equal(result.signedScope, 'Response');
});

test('Assertion: raw XML bodies are accepted and base64 payloads are decoded identically', () => {
  const xml = buildResponse();
  const fromRaw = saml.verifySamlResponse({
    samlResponse: xml,
    certificates: [trusted.base64],
    spEntityId: SP_ENTITY,
    acsUrl: ACS_URL,
    idpEntityId: IDP_ENTITY,
    expectedRequestId: '_request-1',
  });
  assert.equal(fromRaw.assertionId, 'assert-1');
});

test('Assertion: small clock skew between IdP and SP is tolerated', () => {
  const now = Date.now();
  const result = verify(buildResponse({ now, notBefore: now + 30_000, notOnOrAfter: now + 300_000 }));
  assert.equal(result.assertionId, 'assert-1');
});

// ---------------------------------------------------------------------------
// Assertion verification — every rejection path
// ---------------------------------------------------------------------------

test('Assertion: tampering with any signed byte is detected', () => {
  const xml = buildResponse();
  const tampered = xml.replace('alice@example.com', 'mallory@example.com');
  assert.notEqual(tampered, xml);
  rejectsWith(() => verify(tampered), 'SAML_SIGNATURE_INVALID');
});

test('Assertion: an unsigned response is refused outright', () => {
  rejectsWith(() => verify(buildResponse({ signWith: null })), 'SAML_SIGNATURE_MISSING');
});

test('Assertion: a signature from an untrusted key is refused even though it verifies', () => {
  rejectsWith(() => verify(buildResponse({ signWith: attacker })), 'SAML_UNKNOWN_SIGNING_CERT');
});

test('Assertion: expiration, premature validity and a missing Conditions block are refused', () => {
  const now = Date.now();
  rejectsWith(
    () => verify(buildResponse({ notBefore: now - 900_000, notOnOrAfter: now - 600_000 })),
    'SAML_CONDITIONS_EXPIRED',
  );
  rejectsWith(
    () => verify(buildResponse({ notBefore: now + 900_000, notOnOrAfter: now + 1_800_000 })),
    'SAML_CONDITIONS_EXPIRED',
  );
  rejectsWith(() => verify(buildResponse({ conditions: false })), 'SAML_CONDITIONS_EXPIRED');
});

test('Assertion: audience, recipient, destination and InResponseTo must all match this SP', () => {
  rejectsWith(() => verify(buildResponse({ audience: 'https://other.example.test' })), 'SAML_AUDIENCE_MISMATCH');
  rejectsWith(() => verify(buildResponse({ recipient: 'https://other.example.test/acs' })), 'SAML_RECIPIENT_MISMATCH');
  rejectsWith(() => verify(buildResponse({ destination: 'https://other.example.test/acs' })), 'SAML_RECIPIENT_MISMATCH');
  rejectsWith(() => verify(buildResponse({ requestId: '_somebody-elses' })), 'SAML_INRESPONSETO_MISMATCH');
});

test('Assertion: a failed IdP status is not a login', () => {
  rejectsWith(() => verify(buildResponse({ status: 'Requester' })), 'SAML_STATUS_FAILED');
});

test('Assertion: a subject without a NameID cannot provision an account', () => {
  rejectsWith(() => verify(buildResponse({ nameId: false })), 'SAML_SUBJECT_MISSING');
});

test('Assertion: two assertions in one response are rejected (signature wrapping surface)', () => {
  const rogue = '<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="assert-rogue">'
    + '<saml:Issuer>https://idp.example.test/metadata</saml:Issuer>'
    + '<saml:Subject><saml:NameID>mallory@example.com</saml:NameID></saml:Subject></saml:Assertion>';
  rejectsWith(() => verify(buildResponse({ extraAssertion: rogue })), 'SAML_ASSERTION_AMBIGUOUS');
});

test('Assertion: a signature that covers something other than the assertion is refused', () => {
  // Sign the Response element but reference an element id that is neither the
  // response nor the assertion — the classic pre-wrapping move.
  const { SignedXml } = require('xml-crypto');
  const xml = buildResponse({ signWith: null })
    .replace('<samlp:Status>', '<samlp:Status ID="status-1">');
  const signature = new SignedXml({
    privateKey: trusted.privateKey,
    publicCert: trusted.certificate,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    getKeyInfoContent: () =>
      `<X509Data xmlns="http://www.w3.org/2000/09/xmldsig#"><X509Certificate>${trusted.base64}</X509Certificate></X509Data>`,
  });
  signature.addReference({
    xpath: "//*[local-name(.)='Status']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    uri: '#status-1',
  });
  signature.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='Assertion']", action: 'append' },
  });
  rejectsWith(() => verify(signature.getSignedXml()), 'SAML_REFERENCE_UNBOUND');
});

test('Assertion: DTD and entity declarations are refused before parsing', () => {
  const xml = `<!DOCTYPE Response [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${buildResponse()}`;
  rejectsWith(() => verify(xml), 'SAML_XML_UNSAFE');
});

test('Assertion: an oversized payload is refused', () => {
  const huge = Buffer.alloc(saml.MAX_RESPONSE_BYTES + 1024, 0x41).toString('base64');
  rejectsWith(() => saml.decodeResponsePayload(huge), 'SAML_XML_UNSAFE');
});

test('Assertion: trailing bytes after padded base64 cannot smuggle a second payload', () => {
  // A decoder that stops at the first `=` would silently accept this; the strict
  // check refuses it outright.
  const smuggled = `${Buffer.from(buildResponse()).toString('base64')}${Buffer.from(buildResponse({ email: 'mallory@example.com' })).toString('base64')}`;
  rejectsWith(() => saml.decodeResponsePayload(smuggled), 'SAML_RESPONSE_MALFORMED');
});

// ---------------------------------------------------------------------------
// Router: the full browser-visible flow
// ---------------------------------------------------------------------------

async function buildApp({ enabled = true, now = () => Date.now() } = {}) {
  const store = createInMemorySamlStore();
  await store.saveConfig('acme', {
    entityId: IDP_ENTITY,
    ssoUrl: 'https://idp.example.test/sso',
    certificates: [trusted.base64],
    enabled,
  });
  const identities = [];
  const exchanges = [];
  const app = express();
  app.use(express.json());
  app.use('/api/auth/saml', createSamlRouter({
    store,
    entityIdBase: 'https://app.example.test/api/auth/saml',
    acsBaseUrl: 'https://app.example.test/api/auth/saml',
    now,
    upsertFederatedIdentity: async identity => {
      identities.push(identity);
      return `saml:${identity.providerId}`;
    },
    issueOAuthExchange: async (uid, provider) => {
      exchanges.push({ uid, provider });
      return `code-for-${uid}`;
    },
  }));
  return { app, store, identities, exchanges };
}

async function startLogin(app, tenantId = 'acme') {
  const response = await request(app).get(`/api/auth/saml/${tenantId}/login`).redirects(0);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.location);
  const requestId = /ID="([^"]+)"/.exec(
    zlib.inflateRawSync(Buffer.from(location.searchParams.get('SAMLRequest'), 'base64')).toString('utf8'),
  )[1];
  return { requestId, location };
}

function postAssertion(app, xml, tenantId = 'acme') {
  return request(app)
    .post(`/api/auth/saml/${tenantId}/acs`)
    .set('Accept', 'application/json')
    .type('form')
    .send({ SAMLResponse: Buffer.from(xml, 'utf8').toString('base64') });
}

test('Router: login redirects to the configured IdP and persists the request id', async () => {
  const { app, store } = await buildApp();
  const { requestId, location } = await startLogin(app);
  assert.equal(location.origin + location.pathname, 'https://idp.example.test/sso');
  const pending = await store.readAuthnRequest(requestId);
  assert.equal(pending.tenantId, 'acme');
  assert.equal(pending.consumedAt, null);
});

test('Router: ACS verifies the assertion, provisions the identity and issues one exchange code', async () => {
  const { app, identities, exchanges } = await buildApp();
  const { requestId } = await startLogin(app);
  const response = await postAssertion(app, buildResponse({ requestId }));

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.exchangeCode, 'code-for-saml:acme:alice@example.com');
  assert.equal(identities.length, 1);
  assert.equal(identities[0].provider, 'saml');
  assert.equal(identities[0].providerId, 'acme:alice@example.com');
  assert.equal(identities[0].email, 'alice@example.com');
  assert.equal(identities[0].emailVerified, true);
  assert.deepEqual(exchanges, [{ uid: 'saml:acme:alice@example.com', provider: 'saml' }]);
});

test('Router: replaying the same POST is refused because the request was consumed', async () => {
  const { app } = await buildApp();
  const { requestId } = await startLogin(app);
  const payload = { SAMLResponse: Buffer.from(buildResponse({ requestId }), 'utf8').toString('base64') };

  const first = await request(app).post('/api/auth/saml/acme/acs').set('Accept', 'application/json').type('form').send(payload);
  assert.equal(first.status, 200);

  const second = await request(app).post('/api/auth/saml/acme/acs').set('Accept', 'application/json').type('form').send(payload);
  assert.equal(second.status, 400);
  assert.equal(second.body.error.code, 'SAML_UNKNOWN_REQUEST');
});

test('Router: a re-signed replay of the same assertion under a new request is refused', async () => {
  const { app, identities } = await buildApp();
  const first = await startLogin(app);
  const accepted = await postAssertion(app, buildResponse({ requestId: first.requestId }));
  assert.equal(accepted.status, 200);

  const second = await startLogin(app);
  const replayed = await postAssertion(app, buildResponse({ requestId: second.requestId, responseId: 'resp-2' }));
  assert.equal(replayed.status, 400);
  assert.equal(replayed.body.error.code, 'SAML_ASSERTION_REPLAYED');
  // The replay must not have provisioned a second identity.
  assert.equal(identities.length, 1);
});

test('Router: SSO is invisible for a tenant that has not enabled it', async () => {
  const { app } = await buildApp({ enabled: false });
  const login = await request(app).get('/api/auth/saml/acme/login').redirects(0);
  assert.equal(login.status, 404);
  assert.equal(login.body.error.code, 'SAML_NOT_CONFIGURED');

  const acs = await postAssertion(app, buildResponse());
  assert.equal(acs.status, 404);
  assert.equal(acs.body.error.code, 'SAML_NOT_CONFIGURED');

  const unknown = await request(app).get('/api/auth/saml/nobody/login').redirects(0);
  assert.equal(unknown.status, 404);
});

test('Router: an assertion for another tenant cannot sign in here', async () => {
  const { app } = await buildApp();
  const { requestId } = await startLogin(app);
  // Same request id, but the audience/ACS belong to a different tenant.
  const response = await postAssertion(app, buildResponse({
    requestId,
    audience: 'https://app.example.test/api/auth/saml/other',
    recipient: 'https://app.example.test/api/auth/saml/other/acs',
  }));
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'SAML_AUDIENCE_MISMATCH');
});

test('Router: the ACS ignores an InResponseTo it never issued', async () => {
  const { app } = await buildApp();
  const response = await postAssertion(app, buildResponse({ requestId: '_never-issued' }));
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'SAML_UNKNOWN_REQUEST');
});

test('Router: the trust configuration is not readable without an administrator session', async () => {
  const { app } = await buildApp();
  const response = await request(app).get('/api/auth/saml/acme/config');
  assert.equal(response.status, 401);
});

test('Router: SP metadata is anonymous and tenant-scoped', async () => {
  const { app } = await buildApp();
  const response = await request(app).get('/api/auth/saml/acme/metadata');
  assert.equal(response.status, 200);
  assert.match(response.text, /entityID="https:\/\/app\.example\.test\/api\/auth\/saml\/acme"/);
  assert.match(response.text, /Location="https:\/\/app\.example\.test\/api\/auth\/saml\/acme\/acs"/);
});

// ---------------------------------------------------------------------------
// Durable store semantics (against the in-memory double)
// ---------------------------------------------------------------------------

test('Store: a request can be consumed exactly once and an assertion remembered exactly once', async () => {
  const store = createInMemorySamlStore();
  const now = Date.now();
  await store.createAuthnRequest({ id: '_r1', tenantId: 'acme', relayState: null, expiresAt: now + 60_000 });

  assert.equal(await store.consumeAuthnRequest({ id: '_r1', tenantId: 'acme', now }), true);
  assert.equal(await store.consumeAuthnRequest({ id: '_r1', tenantId: 'acme', now }), false);

  assert.equal(await store.rememberAssertion({ assertionId: 'a-1', tenantId: 'acme', expiresAt: now + 60_000 }), true);
  assert.equal(await store.rememberAssertion({ assertionId: 'a-1', tenantId: 'acme', expiresAt: now + 60_000 }), false);

  // A different tenant cannot consume another tenant's request by id.
  await store.createAuthnRequest({ id: '_r2', tenantId: 'acme', relayState: null, expiresAt: now + 60_000 });
  assert.equal(await store.consumeAuthnRequest({ id: '_r2', tenantId: 'other', now }), false);
});

test('Store: an expired request is not consumable', async () => {
  const store = createInMemorySamlStore();
  const now = Date.now();
  await store.createAuthnRequest({ id: '_old', tenantId: 'acme', relayState: null, expiresAt: now - 1 });
  assert.equal(await store.consumeAuthnRequest({ id: '_old', tenantId: 'acme', now }), false);
});
