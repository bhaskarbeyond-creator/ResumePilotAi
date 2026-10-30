/**
 * Enterprise SSO console — form model, validation and payload construction.
 *
 * Kept free of React and of the network on purpose: everything the console
 * decides (is this slug addressable, is this certificate plausibly a certificate,
 * does the body match the API contract) is a pure function, and is therefore
 * testable without a browser. The component in
 * `components/admin/AdminEnterpriseSsoTab.tsx` only renders this and calls the API.
 *
 * The contract it encodes is the one `backend/routes/saml.js` actually exposes:
 *   GET /api/auth/saml/:tenantId/config   → { success, config | null }
 *   PUT /api/auth/saml/:tenantId/config   → { success, config }
 *   GET /api/auth/saml/:tenantId/metadata → SP metadata XML
 *
 * `tenantId` is the tenant identifier the platform uses elsewhere; the console
 * label is "tenant slug" because that is what an operator recognises.
 */

export type SamlFormMode = 'metadata' | 'manual';
export type SamlStatus = 'ACTIVE' | 'DISABLED' | 'UNCONFIGURED';

/** Mirrors the server-side guard in `backend/routes/saml.js`. */
export const TENANT_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const SAML_ROLE_OPTIONS = ['MEMBER', 'ADMIN', 'VIEWER'] as const;
export type SamlRole = typeof SAML_ROLE_OPTIONS[number];

export interface SamlConfigView {
  tenantId: string;
  entityId: string;
  ssoUrl: string;
  sloUrl: string | null;
  certificates: string[];
  nameIdFormat: string | null;
  defaultRole: string;
  jitProvisioning: boolean;
  enabled: boolean;
  updatedAt: string | null;
}

export interface SamlAdminForm {
  tenantId: string;
  mode: SamlFormMode;
  metadataXml: string;
  metadataUrl: string;
  entityId: string;
  ssoUrl: string;
  sloUrl: string;
  /** One certificate per line, PEM or bare base64 DER. */
  certificates: string;
  defaultRole: string;
  jitProvisioning: boolean;
  enabled: boolean;
}

export type SamlFormErrors = Partial<Record<keyof SamlAdminForm, string>>;

export function emptyForm(tenantId = ''): SamlAdminForm {
  return {
    tenantId,
    mode: 'metadata',
    metadataXml: '',
    metadataUrl: '',
    entityId: '',
    ssoUrl: '',
    sloUrl: '',
    certificates: '',
    defaultRole: 'MEMBER',
    jitProvisioning: false,
    enabled: true,
  };
}

/** Populates the form from a loaded config so an operator edits, not retypes. */
export function formFromConfig(config: SamlConfigView | null, tenantId = ''): SamlAdminForm {
  if (!config) return emptyForm(tenantId);
  return {
    tenantId: config.tenantId || tenantId,
    // A stored config has explicit values; editing it in metadata mode would
    // silently discard them on save, so start in manual mode.
    mode: 'manual',
    metadataXml: '',
    metadataUrl: '',
    entityId: config.entityId || '',
    ssoUrl: config.ssoUrl || '',
    sloUrl: config.sloUrl || '',
    certificates: (config.certificates || []).join('\n'),
    defaultRole: config.defaultRole || 'MEMBER',
    jitProvisioning: Boolean(config.jitProvisioning),
    enabled: Boolean(config.enabled),
  };
}

export function samlStatus(config: SamlConfigView | null): SamlStatus {
  if (!config) return 'UNCONFIGURED';
  return config.enabled ? 'ACTIVE' : 'DISABLED';
}

export function spEntityIdFor(baseUrl: string, tenantId: string): string {
  return `${String(baseUrl).replace(/\/+$/, '')}/${tenantId}`;
}

export function acsUrlFor(baseUrl: string, tenantId: string): string {
  return `${String(baseUrl).replace(/\/+$/, '')}/${tenantId}/acs`;
}

export function spMetadataUrlFor(baseUrl: string, tenantId: string): string {
  return `${String(baseUrl).replace(/\/+$/, '')}/${tenantId}/metadata`;
}

export function tenantConfigUrl(tenantId: string): string {
  return `/api/auth/saml/${encodeURIComponent(tenantId)}/config`;
}

export function metadataDownloadName(tenantId: string): string {
  return `sp-metadata-${tenantId || 'tenant'}.xml`;
}

function isHttpsUrl(value: string, maxLength: number): boolean {
  if (!value || value.length > maxLength) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (!url.hostname) return false;
  return true;
}

/**
 * Normalises one certificate line to bare base64 DER.
 *
 * The server does the same normalisation; doing it here as well means the console
 * shows the operator the exact bytes that will be pinned, and rejects an obvious
 * paste error before a round trip.
 */
export function normalizeCertificateLine(line: string): string | null {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const base64 = raw.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (!base64) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  if (base64.length % 4 !== 0) return null;
  // A DER certificate is never this short; anything smaller is a mis-paste.
  if (base64.length < 200) return null;
  return base64;
}

const PEM_BLOCK = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;

/**
 * Extracts certificates from a paste that may mix PEM blocks with bare base64
 * lines. A PEM block spans several lines, so splitting on newlines first would
 * shred it into unusable fragments — the blocks are lifted out first.
 */
export function parseCertificateBlock(value: string): string[] {
  const text = String(value || '');
  const out: string[] = [];
  for (const block of text.match(PEM_BLOCK) || []) {
    const normalized = normalizeCertificateLine(block);
    if (normalized) out.push(normalized);
  }
  for (const line of text.replace(PEM_BLOCK, '').split(/[\r\n]+/)) {
    const normalized = normalizeCertificateLine(line);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** How many certificates the operator meant to provide (block or line). */
export function countCertificateInputs(value: string): number {
  const text = String(value || '');
  const blocks = (text.match(PEM_BLOCK) || []).length;
  const lines = text.replace(PEM_BLOCK, '').split(/[\r\n]+/).filter(line => line.trim()).length;
  return blocks + lines;
}

/**
 * Validation for the form as a whole.
 *
 * Only the fields that are actually in play for the selected mode are validated —
 * switching to manual entry must not leave a stale "metadata XML required" error,
 * and vice versa.
 */
export function validateSamlForm(form: SamlAdminForm): SamlFormErrors {
  const errors: SamlFormErrors = {};

  if (!form.tenantId.trim()) errors.tenantId = 'Enter the tenant slug.';
  else if (!TENANT_SLUG_PATTERN.test(form.tenantId.trim())) {
    errors.tenantId = 'Use 1–64 characters: letters, digits, hyphen or underscore, starting with a letter or digit.';
  }

  if (form.mode === 'metadata') {
    const xml = form.metadataXml.trim();
    const url = form.metadataUrl.trim();
    if (xml && url) {
      errors.metadataXml = 'Provide the metadata either as XML or as a URL, not both.';
      errors.metadataUrl = 'Provide the metadata either as XML or as a URL, not both.';
    } else if (!xml && !url) {
      errors.metadataXml = 'Paste the IdP metadata XML, or give a metadata URL.';
    } else if (xml) {
      if (!/<(?:\w+:)?EntityDescriptor\b/i.test(xml)) {
        errors.metadataXml = 'That does not look like SAML metadata (no EntityDescriptor element).';
      } else if (!/<(?:\w+:)?X509Certificate\b/i.test(xml)) {
        errors.metadataXml = 'The metadata carries no signing certificate, so assertions could not be trusted.';
      }
    } else if (!isHttpsUrl(url, 2048)) {
      errors.metadataUrl = 'Use an https URL without embedded credentials.';
    }
  } else {
    if (!form.entityId.trim()) errors.entityId = 'The IdP entity id is required.';
    else if (form.entityId.trim().length > 512) errors.entityId = 'Use at most 512 characters.';
    if (!form.ssoUrl.trim()) errors.ssoUrl = 'The IdP SSO URL is required.';
    else if (!isHttpsUrl(form.ssoUrl.trim(), 1024)) errors.ssoUrl = 'Use an https URL without embedded credentials.';
    if (form.sloUrl.trim() && !isHttpsUrl(form.sloUrl.trim(), 1024)) {
      errors.sloUrl = 'Use an https URL, or leave it empty.';
    }
    if (!form.certificates.trim()) {
      errors.certificates = 'Paste at least one IdP signing certificate.';
    } else {
      const parsed = parseCertificateBlock(form.certificates);
      const attempted = countCertificateInputs(form.certificates);
      if (!parsed.length) errors.certificates = 'No usable certificate found — paste PEM or base64 DER.';
      else if (parsed.length !== attempted) errors.certificates = 'One of the pasted certificates is not valid base64 DER.';
    }
    if (!SAML_ROLE_OPTIONS.includes(form.defaultRole as SamlRole)) {
      errors.defaultRole = 'Choose a supported default role.';
    }
  }

  return errors;
}

export type SamlConfigPayload =
  | { metadataXml: string; enabled: boolean; jitProvisioning: boolean; defaultRole: string }
  | { metadataUrl: string; enabled: boolean; jitProvisioning: boolean; defaultRole: string }
  | { entityId: string; ssoUrl: string; sloUrl?: string; certificates: string[]; defaultRole: string; jitProvisioning: boolean; enabled: boolean };

/**
 * Builds the request body.
 *
 * Only the fields the server reads are sent — no form state leaks into the
 * request, which keeps the audit trail of a trust-store change readable.
 */
export function buildConfigPayload(form: SamlAdminForm): SamlConfigPayload {
  const common = {
    enabled: Boolean(form.enabled),
    jitProvisioning: Boolean(form.jitProvisioning),
    defaultRole: SAML_ROLE_OPTIONS.includes(form.defaultRole as SamlRole) ? form.defaultRole : 'MEMBER',
  };

  if (form.mode === 'metadata') {
    const xml = form.metadataXml.trim();
    if (xml) return { metadataXml: xml, ...common };
    return { metadataUrl: form.metadataUrl.trim(), ...common };
  }

  const payload: Extract<SamlConfigPayload, { entityId: string }> = {
    entityId: form.entityId.trim(),
    ssoUrl: form.ssoUrl.trim(),
    certificates: parseCertificateBlock(form.certificates),
    ...common,
  };
  if (form.sloUrl.trim()) payload.sloUrl = form.sloUrl.trim();
  return payload;
}

/** What the console shows above the save button, so an operator sees the mode. */
export function payloadSummary(payload: SamlConfigPayload): string {
  if ('metadataXml' in payload) return 'Saving from pasted IdP metadata (entity id, SSO URL and certificate are taken from it).';
  if ('metadataUrl' in payload) return 'Saving from an IdP metadata URL (fetched and validated by the server).';
  return `Saving ${payload.certificates.length} certificate${payload.certificates.length === 1 ? '' : 's'} and ${payload.entityId}.`;
}
