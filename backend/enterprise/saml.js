'use strict';

/**
 * SAML 2.0 Service Provider — assertion intake and trust verification.
 *
 * Scope: this module does the security-critical work and nothing else. It never
 * touches HTTP, the database, or identity provisioning; the router composes it.
 * That separation is deliberate — every rule below is exercised offline by
 * `backend/test/saml-sp.test.js` with real RSA signatures, so the security
 * properties are verifiable on a machine with no IdP, no network and no database.
 *
 * Trust rules (each one maps to an error code):
 *   SAML_XML_UNSAFE            — DTD / ENTITY / oversized payload refused before parsing
 *   SAML_RESPONSE_MALFORMED    — not well-formed XML, or root is not a Response
 *   SAML_STATUS_FAILED         — IdP did not report Success
 *   SAML_ASSERTION_AMBIGUOUS   — zero, or more than one, top-level Assertion
 *   SAML_SIGNATURE_MISSING     — neither the assertion nor the response is signed
 *   SAML_SIGNATURE_INVALID     — cryptographic verification failed
 *   SAML_UNKNOWN_SIGNING_CERT  — KeyInfo names a certificate we were not configured to trust
 *   SAML_REFERENCE_UNBOUND     — the signature does not cover the element we read claims from
 *   SAML_ISSUER_MISMATCH       — Response/Assertion Issuer differs from the configured IdP
 *   SAML_CONDITIONS_EXPIRED    — NotBefore/NotOnOrAfter outside the clock-skew window
 *   SAML_AUDIENCE_MISMATCH     — audience does not include our SP entity id
 *   SAML_RECIPIENT_MISMATCH    — SubjectConfirmationData Recipient/Destination is not our ACS
 *   SAML_INRESPONSETO_MISMATCH — response is not an answer to the request we issued
 *   SAML_SUBJECT_MISSING       — no usable NameID
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { SignedXml } = require('xml-crypto');

const NS = Object.freeze({
  samlp: 'urn:oasis:names:tc:SAML:2.0:protocol',
  saml: 'urn:oasis:names:tc:SAML:2.0:assertion',
  dsig: 'http://www.w3.org/2000/09/xmldsig#',
});

const BINDING_REDIRECT = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';
const BINDING_POST = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST';
const NAMEID_EMAIL = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
const NAMEID_PERSISTENT = 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SHA256_DIGEST = 'http://www.w3.org/2001/04/xmlenc#sha256';

const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_CLOCK_SKEW_MS = 120 * 1000;
const AUTHN_REQUEST_TTL_MS = 10 * 60 * 1000;

class SamlError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'SamlError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) {
  throw new SamlError(code, message, status);
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

function derToPem(base64Der) {
  const lines = String(base64Der).match(/.{1,76}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

/**
 * Accepts PEM or bare base64 DER and returns one canonical form.
 *
 * Operators paste certificates from IdP portals in both shapes; normalising here
 * means the trust comparison below is a byte comparison of DER, not a string
 * comparison that a stray newline could defeat.
 */
function normalizeCertificate(input) {
  const raw = String(input || '').trim();
  if (!raw) fail('SAML_CERT_INVALID', 'a signing certificate is required');
  const base64 = raw.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    fail('SAML_CERT_INVALID', 'certificate is not base64-encoded DER');
  }
  const pem = derToPem(base64);
  try {
    crypto.createPublicKey(pem);
  } catch (_error) {
    fail('SAML_CERT_INVALID', 'certificate is not a valid X.509 public key');
  }
  return {
    base64,
    pem,
    fingerprint: crypto.createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex'),
  };
}

function normalizeCertificates(input) {
  const list = Array.isArray(input) ? input : [input];
  const normalized = list.filter(item => String(item || '').trim()).map(normalizeCertificate);
  if (!normalized.length) fail('SAML_CERT_INVALID', 'at least one signing certificate is required');
  return normalized;
}

// ---------------------------------------------------------------------------
// XML parsing
// ---------------------------------------------------------------------------

function assertSafeXml(xml) {
  if (!/^<\?xml|^</i.test(xml.trim())) fail('SAML_RESPONSE_MALFORMED', 'payload is not XML');
  if (Buffer.byteLength(xml, 'utf8') > MAX_RESPONSE_BYTES) {
    fail('SAML_XML_UNSAFE', 'SAML payload exceeds the accepted size', 413);
  }
  // A SAML Response has no legitimate reason to declare a DTD. Refusing before
  // the parser runs removes entity-expansion and external-entity attacks from the
  // attack surface entirely rather than relying on parser defaults.
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    fail('SAML_XML_UNSAFE', 'DTD and entity declarations are not accepted in a SAML response');
  }
}

function parseXml(xml) {
  assertSafeXml(xml);
  const errors = [];
  const doc = new DOMParser({
    // @xmldom/xmldom >= 0.9 reports through `onError(level, message)`.
    onError: (level, message) => {
      if (level === 'error' || level === 'fatalError') errors.push(message);
    },
  }).parseFromString(xml, 'text/xml');
  if (errors.length || !doc || !doc.documentElement) {
    fail('SAML_RESPONSE_MALFORMED', 'response is not well-formed XML');
  }
  return doc;
}

function localName(node) {
  return node && node.localName ? node.localName : null;
}

function childElements(node) {
  const out = [];
  for (let child = node && node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) out.push(child);
  }
  return out;
}

function directChild(node, namespace, name) {
  return childElements(node).find(child =>
    localName(child) === name && (child.namespaceURI === namespace || !namespace)) || null;
}

function descendants(node, namespace, name) {
  const out = [];
  const walk = current => {
    for (const child of childElements(current)) {
      if (localName(child) === name && (child.namespaceURI === namespace || !namespace)) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

function textOf(node) {
  if (!node) return '';
  const value = typeof node.textContent === 'string' ? node.textContent : '';
  return value.trim();
}

function attribute(node, name) {
  if (!node || typeof node.getAttribute !== 'function') return null;
  const value = node.getAttribute(name);
  return value === null || value === '' ? null : value;
}

// ---------------------------------------------------------------------------
// IdP metadata
// ---------------------------------------------------------------------------

function assertHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(String(value));
  } catch (_error) {
    fail('SAML_METADATA_INVALID', `${label} is not an absolute URL`);
  }
  if (url.protocol !== 'https:') fail('SAML_METADATA_INVALID', `${label} must use https`);
  if (url.username || url.password) fail('SAML_METADATA_INVALID', `${label} must not embed credentials`);
  return url.toString();
}

/**
 * Parses IdP metadata XML into the single shape the SP needs.
 *
 * Only the signing KeyDescriptors are harvested. Encryption certificates are
 * ignored on purpose: accepting them would widen the trust set for no benefit,
 * because this SP never asks for encrypted assertions.
 */
function parseIdpMetadata(xml) {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  if (localName(root) !== 'EntityDescriptor') {
    fail('SAML_METADATA_INVALID', 'metadata root must be EntityDescriptor');
  }
  const entityId = attribute(root, 'entityID');
  if (!entityId) fail('SAML_METADATA_INVALID', 'metadata is missing entityID');

  const descriptor = descendants(root, 'urn:oasis:names:tc:SAML:2.0:metadata', 'IDPSSODescriptor')[0]
    || descendants(root, null, 'IDPSSODescriptor')[0];
  if (!descriptor) fail('SAML_METADATA_INVALID', 'metadata has no IDPSSODescriptor');

  const certificates = [];
  for (const keyDescriptor of descendants(descriptor, null, 'KeyDescriptor')) {
    const use = attribute(keyDescriptor, 'use');
    if (use && use !== 'signing') continue;
    for (const node of descendants(keyDescriptor, NS.dsig, 'X509Certificate')) {
      const value = textOf(node).replace(/\s+/g, '');
      if (value) certificates.push(value);
    }
  }
  if (!certificates.length) fail('SAML_METADATA_INVALID', 'metadata has no signing certificate');

  const services = descendants(descriptor, null, 'SingleSignOnService');
  const redirect = services.find(item => attribute(item, 'Binding') === BINDING_REDIRECT);
  const post = services.find(item => attribute(item, 'Binding') === BINDING_POST);
  const chosen = redirect || post;
  if (!chosen) fail('SAML_METADATA_INVALID', 'metadata has no HTTP-Redirect or HTTP-POST SSO service');

  const logout = descendants(descriptor, null, 'SingleLogoutService')[0] || null;
  const nameIdFormat = textOf(descendants(descriptor, null, 'NameIDFormat')[0]) || null;

  return Object.freeze({
    entityId,
    ssoUrl: assertHttpsUrl(attribute(chosen, 'Location'), 'SingleSignOnService Location'),
    ssoBinding: attribute(chosen, 'Binding'),
    sloUrl: logout ? assertHttpsUrl(attribute(logout, 'Location'), 'SingleLogoutService Location') : null,
    certificates: certificates.map(normalizeCertificate),
    nameIdFormat,
    wantAuthnRequestsSigned: attribute(descriptor, 'WantAuthnRequestsSigned') === 'true',
  });
}

// ---------------------------------------------------------------------------
// SP-initiated AuthnRequest (HTTP-Redirect binding)
// ---------------------------------------------------------------------------

function newRequestId() {
  return `_${crypto.randomBytes(20).toString('base64url')}`;
}

function isoInstant(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Builds a DEFLATE + base64url AuthnRequest and the redirect URL that carries it.
 *
 * The request id is returned so the caller can persist it: a response is only
 * accepted if it answers a request this SP actually issued (see InResponseTo).
 */
function buildAuthnRequest({ spEntityId, acsUrl, idpSsoUrl, relayState = null, now = Date.now(), requestId }) {
  if (!spEntityId) fail('SAML_CONFIG_INVALID', 'spEntityId is required');
  if (!acsUrl) fail('SAML_CONFIG_INVALID', 'acsUrl is required');
  const destination = assertHttpsUrl(idpSsoUrl, 'IdP SSO URL');
  const id = requestId || newRequestId();
  const xml = [
    `<samlp:AuthnRequest xmlns:samlp="${NS.samlp}" xmlns:saml="${NS.saml}"`,
    ` ID="${id}" Version="2.0" IssueInstant="${isoInstant(now)}"`,
    ` Destination="${escapeAttribute(destination)}"`,
    ` ProtocolBinding="${BINDING_POST}"`,
    ` AssertionConsumerServiceURL="${escapeAttribute(acsUrl)}">`,
    `<saml:Issuer>${escapeText(spEntityId)}</saml:Issuer>`,
    `<samlp:NameIDPolicy Format="${NAMEID_EMAIL}" AllowCreate="true"/>`,
    '</samlp:AuthnRequest>',
  ].join('');

  const encoded = zlib.deflateRawSync(Buffer.from(xml, 'utf8')).toString('base64');
  const params = new URLSearchParams({ SAMLRequest: encoded });
  if (relayState) params.set('RelayState', String(relayState).slice(0, 512));
  const separator = destination.includes('?') ? '&' : '?';
  return {
    requestId: id,
    xml,
    url: `${destination}${separator}${params.toString()}`,
    expiresAt: now + AUTHN_REQUEST_TTL_MS,
  };
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeText(value) {
  return escapeAttribute(value).replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Response verification
// ---------------------------------------------------------------------------

function decodeResponsePayload(payload) {
  const raw = String(payload || '').trim();
  if (!raw) fail('SAML_RESPONSE_MALFORMED', 'SAMLResponse is empty');
  if (raw.startsWith('<')) {
    // Some IdPs POST raw XML; accept it but apply the same guards.
    assertSafeXml(raw);
    return raw;
  }
  // Strict base64: Node's decoder silently stops at the first `=`, so a payload
  // like "<real response>==<attacker suffix>" would decode to the real response
  // and hide everything after it. Rejecting misaligned or interior padding keeps
  // the decoded bytes identical to the submitted bytes.
  const compact = raw.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    fail('SAML_RESPONSE_MALFORMED', 'SAMLResponse is not canonical base64');
  }
  const buffer = Buffer.from(compact, 'base64');
  if (!buffer.length) fail('SAML_RESPONSE_MALFORMED', 'SAMLResponse decoded to zero bytes');
  if (buffer.length > MAX_RESPONSE_BYTES) fail('SAML_XML_UNSAFE', 'SAML payload exceeds the accepted size', 413);
  const xml = buffer.toString('utf8');
  assertSafeXml(xml);
  return xml;
}

/**
 * Reads InResponseTo without trusting anything else in the document.
 *
 * The router needs this *before* verification: it is the lookup key for the
 * request-correlation row (the SAML analogue of an OAuth `state` parameter). It
 * is only ever used to select a candidate request id, never to authorise one —
 * `verifySamlResponse` re-checks it against the same value after the signature.
 */
function readInResponseTo(payload) {
  const xml = decodeResponsePayload(payload);
  const doc = parseXml(xml);
  const confirmation = descendants(doc.documentElement, NS.saml, 'SubjectConfirmationData')[0];
  const fromConfirmation = attribute(confirmation, 'InResponseTo');
  if (fromConfirmation) return fromConfirmation;
  return attribute(doc.documentElement, 'InResponseTo');
}

function embeddedSignatureCertificates(signatureNode) {
  return descendants(signatureNode, NS.dsig, 'X509Certificate')
    .map(node => textOf(node).replace(/\s+/g, ''))
    .filter(Boolean);
}

/**
 * Verifies one XML signature and binds it to the element claims are read from.
 *
 * Binding is the part that defeats signature wrapping: a valid signature over a
 * *different* assertion must never authorise the assertion we parse. Every
 * reference must point at either the assertion id or the response id, and the
 * signed scope must contain the assertion node.
 */
function verifySignature({ xml, signatureNode, signedNode, signedId, certificates, assertion, response }) {
  const signatureXml = new XMLSerializer().serializeToString(signatureNode);
  const embedded = embeddedSignatureCertificates(signatureNode);

  let trusted = null;
  if (embedded.length) {
    // The IdP told us which key signed. It must be one we already trust; an
    // attacker-supplied certificate in KeyInfo is worthless on its own.
    trusted = certificates.find(cert => embedded.includes(cert.base64)) || null;
    if (!trusted) {
      fail('SAML_UNKNOWN_SIGNING_CERT', 'response is signed by a certificate that is not configured for this tenant');
    }
  } else {
    trusted = certificates[0];
  }

  const verifier = new SignedXml({ publicCert: trusted.pem });
  try {
    verifier.loadSignature(signatureXml);
  } catch (_error) {
    fail('SAML_SIGNATURE_INVALID', 'signature element could not be parsed');
  }

  let valid = false;
  try {
    valid = verifier.checkSignature(xml) === true;
  } catch (_error) {
    valid = false;
  }
  if (!valid) fail('SAML_SIGNATURE_INVALID', 'XML signature verification failed');

  const references = verifier.getReferences() || [];
  if (!references.length) fail('SAML_SIGNATURE_INVALID', 'signature has no reference');

  const assertionId = attribute(assertion, 'ID');
  const responseId = attribute(response, 'ID');
  for (const reference of references) {
    const uri = String(reference.uri || '');
    if (!uri.startsWith('#')) fail('SAML_REFERENCE_UNBOUND', 'signature reference is not a same-document fragment');
    const target = uri.slice(1);
    if (target !== assertionId && target !== responseId) {
      // Signing something other than the assertion or the response means the
      // signature does not cover the claims we are about to trust.
      fail('SAML_REFERENCE_UNBOUND', 'signature does not cover the assertion being read');
    }
  }
  if (signedId && !references.some(reference => String(reference.uri) === `#${signedId}`)) {
    fail('SAML_REFERENCE_UNBOUND', 'signature does not cover the signed element');
  }
  return { fingerprint: trusted.fingerprint, signedNode: localName(signedNode) };
}

function parseInstant(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}

function assertWindow(startMs, endMs, now, skew, code, label) {
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    fail(code, `${label} carries an unparsable timestamp`);
  }
  if (startMs !== null && now + skew < startMs) {
    fail(code, `${label} is not valid yet`);
  }
  if (endMs !== null && now - skew >= endMs) {
    fail(code, `${label} has expired`);
  }
}

function collectAttributes(assertion) {
  const out = {};
  for (const statement of descendants(assertion, NS.saml, 'AttributeStatement')) {
    for (const attributeNode of descendants(statement, NS.saml, 'Attribute')) {
      const name = attribute(attributeNode, 'Name');
      if (!name) continue;
      const values = descendants(attributeNode, NS.saml, 'AttributeValue').map(textOf).filter(Boolean);
      if (!values.length) continue;
      out[name] = out[name] ? [].concat(out[name], values) : (values.length === 1 ? values[0] : values);
    }
  }
  return out;
}

function pickSubject(nameId) {
  const value = textOf(nameId);
  if (!value) fail('SAML_SUBJECT_MISSING', 'assertion has no NameID');
  const format = attribute(nameId, 'Format');
  if (value.length > 320) fail('SAML_SUBJECT_MISSING', 'NameID is implausibly long');
  return { subjectId: value, nameIdFormat: format, email: value.includes('@') ? value.toLowerCase() : null };
}

/**
 * Full response validation.
 *
 * Order matters: structural checks first (cheap, and they bound what the crypto
 * layer has to reason about), then the signature, then the semantic conditions.
 * Nothing is read out of the assertion until its signature has been bound to it.
 */
function verifySamlResponse({
  samlResponse,
  certificates,
  spEntityId,
  acsUrl,
  idpEntityId = null,
  expectedRequestId = null,
  now = Date.now(),
  clockSkewMs = DEFAULT_CLOCK_SKEW_MS,
}) {
  if (!spEntityId) fail('SAML_CONFIG_INVALID', 'spEntityId is required');
  if (!acsUrl) fail('SAML_CONFIG_INVALID', 'acsUrl is required');
  const trusted = normalizeCertificates(certificates);
  const xml = decodeResponsePayload(samlResponse);
  const doc = parseXml(xml);
  const response = doc.documentElement;

  if (localName(response) !== 'Response' || response.namespaceURI !== NS.samlp) {
    fail('SAML_RESPONSE_MALFORMED', 'root element is not samlp:Response');
  }

  const statusCode = descendants(response, NS.samlp, 'StatusCode')[0];
  const statusValue = attribute(statusCode, 'Value') || '';
  if (!statusValue.endsWith(':Success')) {
    const message = textOf(descendants(response, NS.samlp, 'StatusMessage')[0]);
    fail('SAML_STATUS_FAILED', message ? `IdP returned ${statusValue}: ${message}` : `IdP returned ${statusValue}`);
  }

  const assertions = childElements(response)
    .filter(child => localName(child) === 'Assertion' && child.namespaceURI === NS.saml);
  if (assertions.length !== 1) {
    fail('SAML_ASSERTION_AMBIGUOUS', `response must carry exactly one assertion, found ${assertions.length}`);
  }
  const assertion = assertions[0];

  const responseSignature = directChild(response, NS.dsig, 'Signature');
  const assertionSignature = directChild(assertion, NS.dsig, 'Signature');
  if (!responseSignature && !assertionSignature) {
    fail('SAML_SIGNATURE_MISSING', 'neither the response nor the assertion is signed');
  }
  const signature = verifySignature({
    xml,
    signatureNode: assertionSignature || responseSignature,
    signedNode: assertionSignature ? assertion : response,
    signedId: attribute(assertionSignature ? assertion : response, 'ID'),
    certificates: trusted,
    assertion,
    response,
  });

  const responseIssuer = textOf(descendants(response, NS.saml, 'Issuer')[0]);
  const assertionIssuerNode = directChild(assertion, NS.saml, 'Issuer');
  const assertionIssuer = textOf(assertionIssuerNode);
  if (idpEntityId && responseIssuer && responseIssuer !== idpEntityId) {
    fail('SAML_ISSUER_MISMATCH', 'response issuer does not match the configured IdP entity id');
  }
  if (idpEntityId && assertionIssuer && assertionIssuer !== idpEntityId) {
    fail('SAML_ISSUER_MISMATCH', 'assertion issuer does not match the configured IdP entity id');
  }
  if (responseIssuer && assertionIssuer && responseIssuer !== assertionIssuer) {
    fail('SAML_ISSUER_MISMATCH', 'response and assertion disagree about the issuer');
  }

  const conditions = directChild(assertion, NS.saml, 'Conditions');
  if (conditions) {
    assertWindow(
      parseInstant(attribute(conditions, 'NotBefore')),
      parseInstant(attribute(conditions, 'NotOnOrAfter')),
      now,
      clockSkewMs,
      'SAML_CONDITIONS_EXPIRED',
      'assertion Conditions',
    );
    const audiences = descendants(conditions, NS.saml, 'Audience').map(textOf).filter(Boolean);
    if (!audiences.includes(spEntityId)) {
      fail('SAML_AUDIENCE_MISMATCH', 'assertion audience does not include this service provider');
    }
  } else {
    fail('SAML_CONDITIONS_EXPIRED', 'assertion carries no Conditions; its validity cannot be established');
  }

  const subject = directChild(assertion, NS.saml, 'Subject');
  const nameId = subject ? descendants(subject, NS.saml, 'NameID')[0] : null;
  const identity = pickSubject(nameId);

  const confirmation = subject ? descendants(subject, NS.saml, 'SubjectConfirmationData')[0] : null;
  if (!confirmation) fail('SAML_SUBJECT_MISSING', 'assertion has no SubjectConfirmationData');
  assertWindow(
    parseInstant(attribute(confirmation, 'NotBefore')),
    parseInstant(attribute(confirmation, 'NotOnOrAfter')),
    now,
    clockSkewMs,
    'SAML_CONDITIONS_EXPIRED',
    'subject confirmation',
  );
  const recipient = attribute(confirmation, 'Recipient');
  if (recipient && recipient !== acsUrl) {
    fail('SAML_RECIPIENT_MISMATCH', 'assertion was issued for a different assertion consumer service');
  }
  const destination = attribute(response, 'Destination');
  if (destination && destination !== acsUrl) {
    fail('SAML_RECIPIENT_MISMATCH', 'response destination is not this assertion consumer service');
  }
  const inResponseTo = attribute(confirmation, 'InResponseTo') || attribute(response, 'InResponseTo');
  if (expectedRequestId && inResponseTo !== expectedRequestId) {
    fail('SAML_INRESPONSETO_MISMATCH', 'response does not answer the request this SP issued');
  }
  if (!expectedRequestId && inResponseTo) {
    // An unsolicited response is only acceptable if the caller explicitly opts in
    // by passing no expected id; with an id present the response must echo it.
    fail('SAML_INRESPONSETO_MISMATCH', 'response answers a request this SP did not issue');
  }

  const assertionId = attribute(assertion, 'ID');
  if (!assertionId) fail('SAML_RESPONSE_MALFORMED', 'assertion has no ID');

  const confirmationEnd = parseInstant(attribute(confirmation, 'NotOnOrAfter'));
  const conditionsEnd = parseInstant(attribute(conditions, 'NotOnOrAfter'));
  const expiresAt = Math.min(
    ...[confirmationEnd, conditionsEnd].filter(value => Number.isFinite(value) && value !== null),
    Number.POSITIVE_INFINITY,
  );

  return Object.freeze({
    responseId: attribute(response, 'ID'),
    inResponseTo,
    assertionId,
    subjectId: identity.subjectId,
    nameIdFormat: identity.nameIdFormat,
    email: identity.email || (String(collectAttributes(assertion).email || '') || null),
    attributes: collectAttributes(assertion),
    sessionIndex: attribute(descendants(assertion, NS.saml, 'AuthnStatement')[0], 'SessionIndex'),
    issuer: assertionIssuer || responseIssuer,
    notOnOrAfter: Number.isFinite(expiresAt) ? expiresAt : null,
    signatureFingerprint: signature.fingerprint,
    signedScope: signature.signedNode,
  });
}

// ---------------------------------------------------------------------------
// SP metadata
// ---------------------------------------------------------------------------

function buildSpMetadata({ entityId, acsUrl, sloUrl = null, nameIdFormat = NAMEID_EMAIL, signingCertificate = null }) {
  if (!entityId || !acsUrl) fail('SAML_CONFIG_INVALID', 'entityId and acsUrl are required');
  const keyDescriptor = signingCertificate
    ? `<md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="${NS.dsig}"><ds:X509Data><ds:X509Certificate>${
      normalizeCertificate(signingCertificate).base64
    }</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`
    : '';
  const slo = sloUrl
    ? `<md:SingleLogoutService Binding="${BINDING_POST}" Location="${escapeAttribute(sloUrl)}"/>`
    : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escapeAttribute(entityId)}">`,
    '<md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"',
    ` protocolSupportEnumeration="${NS.samlp}">`,
    keyDescriptor,
    slo,
    `<md:NameIDFormat>${escapeText(nameIdFormat)}</md:NameIDFormat>`,
    `<md:AssertionConsumerService Binding="${BINDING_POST}" Location="${escapeAttribute(acsUrl)}" index="0" isDefault="true"/>`,
    '</md:SPSSODescriptor>',
    '</md:EntityDescriptor>',
  ].filter(Boolean).join('');
}

module.exports = {
  NS,
  BINDING_POST,
  BINDING_REDIRECT,
  NAMEID_EMAIL,
  NAMEID_PERSISTENT,
  DEFAULT_CLOCK_SKEW_MS,
  AUTHN_REQUEST_TTL_MS,
  MAX_RESPONSE_BYTES,
  SamlError,
  assertSafeXml,
  buildAuthnRequest,
  buildSpMetadata,
  decodeResponsePayload,
  normalizeCertificate,
  normalizeCertificates,
  parseIdpMetadata,
  readInResponseTo,
  verifySamlResponse,
};
