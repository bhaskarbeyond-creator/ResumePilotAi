// Mandate 13 — Enterprise SSO console contract tests.
//
// Two levels of evidence, both real:
//
//   1. The console's decision logic is imported directly from
//      `frontend/src/lib/saml-admin.ts` (Node strips the types). Validation,
//      normalisation and payload construction are therefore tested as shipped,
//      not re-implemented here.
//
//   2. The payloads that logic produces are pushed through the actual backend
//      router (`createSamlRouter` + the in-memory store with production
//      semantics) with supertest. This is what proves the console and the API
//      agree — the failure mode a UI-only test cannot catch.
//
// Not claimed here: anything about rendering, layout or browsers. No frontend
// browser session is exercised.

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import {
  TENANT_SLUG_PATTERN,
  acsUrlFor,
  buildConfigPayload,
  emptyForm,
  formFromConfig,
  metadataDownloadName,
  parseCertificateBlock,
  payloadSummary,
  samlStatus,
  spEntityIdFor,
  spMetadataUrlFor,
  tenantConfigUrl,
  validateSamlForm,
} from '../../../frontend/src/lib/saml-admin.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(new URL('../../../backend/index.js', import.meta.url));
const express = require('express');
const request = require('supertest');
const { createSamlRouter } = require('./routes/saml');
const { createInMemorySamlStore } = require('./enterprise/samlStore');

const BASE = 'https://app.example.test/api/auth/saml';

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

// A real certificate, so the server-side normaliser is exercised for real.
let certificate;
test.before(() => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saml-admin-ui-'));
  const certPath = path.join(directory, 'idp.crt.pem');
  execFileSync(OPENSSL_BIN, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', path.join(directory, 'idp.key.pem'), '-out', certPath,
    '-days', '2', '-subj', '/CN=idp.example.test',
  ], { stdio: 'ignore' });
  const pem = fs.readFileSync(certPath, 'utf8');
  certificate = {
    pem,
    base64: pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''),
    directory,
  };
});

test.after(() => {
  if (certificate?.directory) fs.rmSync(certificate.directory, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

test('Console validation: tenant slug matches the server-side pattern', () => {
  assert.equal(TENANT_SLUG_PATTERN.test('acme-corp'), true);
  assert.equal(TENANT_SLUG_PATTERN.test('a'), true);
  assert.equal(TENANT_SLUG_PATTERN.test('-leading'), false);
  assert.equal(TENANT_SLUG_PATTERN.test('has space'), false);
  assert.equal(TENANT_SLUG_PATTERN.test('x'.repeat(65)), false);

  assert.equal(validateSamlForm(emptyForm('')).tenantId, 'Enter the tenant slug.');
  assert.ok(validateSamlForm(emptyForm('bad slug')).tenantId);
  assert.equal(validateSamlForm({ ...emptyForm('acme-corp'), mode: 'metadata', metadataXml: '<md:EntityDescriptor><X509Certificate>a</X509Certificate></md:EntityDescriptor>' }).tenantId, undefined);
});

test('Console validation: metadata mode accepts XML or URL, never both and never neither', () => {
  const both = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'metadata',
    metadataXml: '<md:EntityDescriptor><ds:X509Certificate>AAA</ds:X509Certificate></md:EntityDescriptor>',
    metadataUrl: 'https://idp.example.test/metadata',
  });
  assert.match(both.metadataXml, /either as XML or as a URL, not both/);

  const neither = validateSamlForm({ ...emptyForm('acme'), mode: 'metadata' });
  assert.match(neither.metadataXml, /Paste the IdP metadata XML, or give a metadata URL/);

  const noCert = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'metadata',
    metadataXml: '<md:EntityDescriptor entityID="x"/>',
  });
  assert.match(noCert.metadataXml, /no signing certificate/);

  const notMetadata = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'metadata',
    metadataXml: '<hello><X509Certificate>x</X509Certificate></hello>',
  });
  assert.match(notMetadata.metadataXml, /does not look like SAML metadata/);

  const good = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'metadata',
    metadataXml: '<md:EntityDescriptor><md:KeyDescriptor><ds:X509Certificate>AAA</ds:X509Certificate></md:KeyDescriptor></md:EntityDescriptor>',
  });
  assert.deepEqual(good, {});
});

test('Console validation: metadata URLs must be https and credential-free', () => {
  for (const metadataUrl of ['http://idp.example.test/metadata', 'https://user:pw@idp.example.test/metadata', 'not-a-url']) {
    const errors = validateSamlForm({ ...emptyForm('acme'), mode: 'metadata', metadataUrl });
    assert.match(errors.metadataUrl, /https URL without embedded credentials/, metadataUrl);
  }
  const ok = validateSamlForm({ ...emptyForm('acme'), mode: 'metadata', metadataUrl: 'https://idp.example.test/metadata' });
  assert.deepEqual(ok, {});
});

test('Console validation: manual mode requires entity id, https SSO URL and a usable certificate', () => {
  const missing = validateSamlForm({ ...emptyForm('acme'), mode: 'manual' });
  assert.ok(missing.entityId);
  assert.ok(missing.ssoUrl);
  assert.ok(missing.certificates);

  const plaintext = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'http://idp.example.test/sso',
    certificates: certificate.pem,
  });
  assert.match(plaintext.ssoUrl, /https URL/);

  const junkCertificate = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    certificates: 'not a certificate',
  });
  assert.match(junkCertificate.certificates, /No usable certificate found/);

  const badRole = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    certificates: certificate.pem,
    defaultRole: 'OWNER',
  });
  assert.ok(badRole.defaultRole);

  const good = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    certificates: certificate.pem,
  });
  assert.deepEqual(good, {});
});

test('Console validation: manual mode ignores metadata fields and vice versa', () => {
  // A stale metadata error must not survive a switch to manual entry.
  const manual = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    certificates: certificate.pem,
    metadataXml: '',
    metadataUrl: '',
  });
  assert.equal(manual.metadataXml, undefined);
  assert.equal(manual.metadataUrl, undefined);
});

// ---------------------------------------------------------------------------
// Certificate normalisation
// ---------------------------------------------------------------------------

test('Certificates: PEM blocks and bare base64 DER normalise to the same bytes', () => {
  const fromPem = parseCertificateBlock(certificate.pem);
  const fromBase64 = parseCertificateBlock(certificate.base64);
  assert.equal(fromPem.length, 1);
  assert.deepEqual(fromPem, fromBase64);
  assert.equal(fromPem[0], certificate.base64);
  assert.equal(fromPem[0].includes('BEGIN CERTIFICATE'), false);
});

test('Certificates: several lines are parsed independently and junk is dropped, not silently kept', () => {
  const block = [certificate.pem, '', 'not-a-cert', certificate.base64].join('\n');
  const parsed = parseCertificateBlock(block);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed, [certificate.base64, certificate.base64]);

  const errors = validateSamlForm({
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    certificates: block,
  });
  assert.match(errors.certificates, /not valid base64 DER/);
});

// ---------------------------------------------------------------------------
// Payload construction
// ---------------------------------------------------------------------------

test('Payload: metadata XML mode sends only metadataXml plus the shared switches', () => {
  const payload = buildConfigPayload({
    ...emptyForm('acme'),
    mode: 'metadata',
    metadataXml: '  <md:EntityDescriptor/>  ',
    enabled: true,
    jitProvisioning: true,
    defaultRole: 'ADMIN',
  });
  assert.deepEqual(payload, {
    metadataXml: '<md:EntityDescriptor/>',
    enabled: true,
    jitProvisioning: true,
    defaultRole: 'ADMIN',
  });
  assert.match(payloadSummary(payload), /pasted IdP metadata/);
});

test('Payload: URL mode sends only metadataUrl', () => {
  const payload = buildConfigPayload({
    ...emptyForm('acme'),
    mode: 'metadata',
    metadataUrl: ' https://idp.example.test/metadata ',
  });
  assert.deepEqual(payload, {
    metadataUrl: 'https://idp.example.test/metadata',
    enabled: true,
    jitProvisioning: false,
    defaultRole: 'MEMBER',
  });
});

test('Payload: manual mode sends normalised certificates and omits an empty SLO URL', () => {
  const payload = buildConfigPayload({
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: ' https://idp.example.test/metadata ',
    ssoUrl: 'https://idp.example.test/sso',
    sloUrl: '   ',
    certificates: certificate.pem,
    enabled: false,
  });
  assert.equal(payload.entityId, 'https://idp.example.test/metadata');
  assert.deepEqual(payload.certificates, [certificate.base64]);
  assert.equal('sloUrl' in payload, false);
  assert.equal(payload.enabled, false);

  const withSlo = buildConfigPayload({
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    sloUrl: 'https://idp.example.test/slo',
    certificates: certificate.pem,
  });
  assert.equal(withSlo.sloUrl, 'https://idp.example.test/slo');
});

test('Payload: an unsupported role degrades to MEMBER instead of sending garbage', () => {
  const payload = buildConfigPayload({ ...emptyForm('acme'), mode: 'metadata', metadataUrl: 'https://idp.example.test/metadata', defaultRole: 'OWNER' });
  assert.equal(payload.defaultRole, 'MEMBER');
});

// ---------------------------------------------------------------------------
// Status and URL builders
// ---------------------------------------------------------------------------

test('Status: unconfigured, disabled and active are distinguishable', () => {
  assert.equal(samlStatus(null), 'UNCONFIGURED');
  assert.equal(samlStatus(formConfig({ enabled: false })), 'DISABLED');
  assert.equal(samlStatus(formConfig({ enabled: true })), 'ACTIVE');
});

function formConfig(overrides = {}) {
  return {
    tenantId: 'acme',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    sloUrl: null,
    certificates: [],
    nameIdFormat: null,
    defaultRole: 'MEMBER',
    jitProvisioning: false,
    enabled: true,
    updatedAt: null,
    ...overrides,
  };
}

test('URLs: the console builds exactly the paths the server serves', () => {
  assert.equal(spEntityIdFor(BASE, 'acme'), `${BASE}/acme`);
  assert.equal(acsUrlFor(BASE, 'acme'), `${BASE}/acme/acs`);
  assert.equal(spMetadataUrlFor('/api/auth/saml', 'acme'), '/api/auth/saml/acme/metadata');
  assert.equal(tenantConfigUrl('acme'), '/api/auth/saml/acme/config');
  assert.equal(tenantConfigUrl('a b'), '/api/auth/saml/a%20b/config');
  assert.equal(metadataDownloadName('acme'), 'sp-metadata-acme.xml');
  // Trailing slashes never produce a double slash in the ACS URL a customer pastes.
  assert.equal(acsUrlFor('https://x.test/api/auth/saml/', 'acme'), 'https://x.test/api/auth/saml/acme/acs');
});

test('Form hydration: a stored config opens in manual mode so saving cannot discard it', () => {
  const form = formFromConfig(formConfig({ certificates: [certificate.base64], sloUrl: 'https://idp.example.test/slo' }));
  assert.equal(form.mode, 'manual');
  assert.equal(form.certificates, certificate.base64);
  assert.equal(form.sloUrl, 'https://idp.example.test/slo');
  assert.equal(form.enabled, true);

  const blank = formFromConfig(null, 'acme');
  assert.equal(blank.tenantId, 'acme');
  assert.equal(blank.mode, 'metadata');
});

// ---------------------------------------------------------------------------
// The payload the console produces, accepted by the real router
// ---------------------------------------------------------------------------

async function buildApp({ fetchMetadata } = {}) {
  const store = createInMemorySamlStore();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      uid: 'super-uid',
      email: 'super@example.test',
      claims: { role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) },
      admin: true,
    };
    next();
  });
  app.use('/api/auth/saml', createSamlRouter({
    store,
    entityIdBase: BASE,
    acsBaseUrl: BASE,
    ...(fetchMetadata ? { fetchMetadata } : {}),
    upsertFederatedIdentity: async () => 'uid',
    issueOAuthExchange: async () => 'code',
  }));
  return { app, store };
}

function manualForm(overrides = {}) {
  return {
    ...emptyForm('acme'),
    mode: 'manual',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
    certificates: certificate.pem,
    enabled: true,
    ...overrides,
  };
}

test('HTTP contract: the manual payload the console builds is accepted and read back', async () => {
  const { app } = await buildApp();
  const form = manualForm();
  assert.deepEqual(validateSamlForm(form), {});

  const saved = await request(app).put(tenantConfigUrl('acme')).send(buildConfigPayload(form));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.success, true);
  assert.equal(saved.body.config.entityId, form.entityId);
  assert.deepEqual(saved.body.config.certificates, [certificate.base64]);
  assert.equal(saved.body.config.enabled, true);

  const loaded = await request(app).get(tenantConfigUrl('acme'));
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.body.config.certificates, [certificate.base64]);
  assert.equal(samlStatus(loaded.body.config), 'ACTIVE');

  // The console hydrates from that load and would re-save the same bytes.
  const roundTrip = buildConfigPayload(formFromConfig(loaded.body.config, 'acme'));
  assert.deepEqual(roundTrip.certificates, [certificate.base64]);
});

test('HTTP contract: POST is accepted as an alias of PUT and writes the same record', async () => {
  const { app } = await buildApp();
  const response = await request(app)
    .post(tenantConfigUrl('acme'))
    .send(buildConfigPayload(manualForm({ enabled: false })));
  assert.equal(response.status, 200);
  assert.equal(response.body.config.enabled, false);
  assert.equal(samlStatus(response.body.config), 'DISABLED');
});

test('HTTP contract: the metadata XML the console pastes becomes the stored trust config', async () => {
  const { app } = await buildApp();
  const metadataXml = [
    '<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"',
    ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="https://idp.example.test/metadata">',
    '<md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">',
    `<md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificate.base64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`,
    '<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.test/sso"/>',
    '</md:IDPSSODescriptor></md:EntityDescriptor>',
  ].join('');

  const form = { ...emptyForm('acme'), mode: 'metadata', metadataXml };
  assert.deepEqual(validateSamlForm(form), {});

  const saved = await request(app).put(tenantConfigUrl('acme')).send(buildConfigPayload(form));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.config.entityId, 'https://idp.example.test/metadata');
  assert.equal(saved.body.config.ssoUrl, 'https://idp.example.test/sso');
  assert.deepEqual(saved.body.config.certificates, [certificate.base64]);
});

test('HTTP contract: the metadata URL mode is fetched server-side and validated', async () => {
  const metadataXml = `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="https://idp.example.test/metadata">`
    + `<md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">`
    + `<md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificate.base64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`
    + '<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.test/sso"/>'
    + '</md:IDPSSODescriptor></md:EntityDescriptor>';

  let fetched = null;
  const { app } = await buildApp({
    fetchMetadata: async url => {
      fetched = url;
      return metadataXml;
    },
  });

  const form = { ...emptyForm('acme'), mode: 'metadata', metadataUrl: 'https://idp.example.test/metadata' };
  assert.deepEqual(validateSamlForm(form), {});

  const saved = await request(app).put(tenantConfigUrl('acme')).send(buildConfigPayload(form));
  assert.equal(saved.status, 200);
  assert.equal(fetched, 'https://idp.example.test/metadata');
  assert.equal(saved.body.config.entityId, 'https://idp.example.test/metadata');
  assert.deepEqual(saved.body.config.certificates, [certificate.base64]);
});

test('HTTP contract: validation errors from the server surface as a stable error code', async () => {
  const { app } = await buildApp();
  const response = await request(app)
    .put(tenantConfigUrl('acme'))
    .send({ entityId: 'https://idp.example.test/metadata', ssoUrl: 'http://idp.example.test/sso', certificates: [certificate.base64] });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'SAML_CONFIG_INVALID');
  // A plaintext SSO URL is refused at write time: storing it would downgrade
  // every future sign-in for the tenant.
  assert.equal(response.body.error.message, 'ssoUrl must be an absolute https URL');
});

test('HTTP contract: the configuration endpoints are not reachable without an administrator', async () => {
  const store = createInMemorySamlStore();
  const app = express();
  app.use(express.json());
  app.use('/api/auth/saml', createSamlRouter({
    store,
    entityIdBase: BASE,
    acsBaseUrl: BASE,
    upsertFederatedIdentity: async () => 'uid',
    issueOAuthExchange: async () => 'code',
  }));

  assert.equal((await request(app).get(tenantConfigUrl('acme'))).status, 401);
  assert.equal((await request(app).put(tenantConfigUrl('acme')).send({})).status, 401);
  assert.equal((await request(app).post(tenantConfigUrl('acme')).send({})).status, 401);
});

// ---------------------------------------------------------------------------
// Source guard: the component must not invent endpoints
// ---------------------------------------------------------------------------

test('Component: every SAML URL comes from the shared helper module, not from inline strings', () => {
  const source = fs.readFileSync(path.join(root, 'frontend/src/components/admin/AdminEnterpriseSsoTab.tsx'), 'utf8');
  assert.equal(/['"`]\/api\/auth\/saml\//.test(source), false, 'the component must not hardcode SAML paths');
  assert.match(source, /from '@\/lib\/saml-admin'/);
  assert.match(source, /data-testid="saml-acs-url"/);
  assert.match(source, /data-testid="saml-download-metadata"/);
  assert.match(source, /data-testid="saml-status-badge"/);
  // No retired or invented admin endpoints.
  assert.equal(source.includes('/api/admin/saml'), false);
  assert.equal(source.includes('/api/platform/saml'), false);
});
