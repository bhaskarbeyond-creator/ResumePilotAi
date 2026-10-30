/**
 * Typed client for the portfolio API (/api/portfolios/*) through the shared
 * apiClient (base URL /api, Bearer token, refresh), plus Mandate 11B slug
 * publishing, custom-domain registration, and public DTO sanitization.
 */
import axios from 'axios';
import { apiClient, normalizeError } from '@/lib/api-client';

export interface StoredPortfolio {
  id: string;
  title: string;
  theme?: string;
  /** Issued address, set on publication and preserved unless removed by server. */
  slug: string | null;
  isPublished: boolean;
  revision: number;
  publishedAt: string | null;
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface PublicMetadata {
  description: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}

export interface PublicPortfolioSummary {
  id: string;
  title: string;
  theme: string;
  slug: string;
  publishedAt: string | null;
  metadata: PublicMetadata;
  data: { renderer: string; templateKey: string; template: string };
}

export interface PublicPortfolio {
  id: string;
  title: string;
  theme: string;
  slug: string;
  isPublished?: boolean;
  publishedAt: string | null;
  metadata: PublicMetadata;
  data: {
    content: unknown[];
    root: { props?: Record<string, unknown> };
    renderer?: string;
    templateKey?: string;
    template?: string;
    canonical: Record<string, unknown> | null;
  };
}

export interface CustomDomainConfig {
  domain: string;
  recordType: string;
  host: string | null;
  verificationToken: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  instructions: string | null;
  verifiedAt: string | null;
}

export interface PublishPortfolioResult {
  slug: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  portfolio: StoredPortfolio | null;
}

export type SlugValidationResult =
  | { valid: true; slug: string; reason?: undefined }
  | { valid: false; slug?: undefined; reason: string };

export type DomainValidationResult =
  | { valid: true; domain: string; reason?: undefined }
  | { valid: false; domain?: undefined; reason: string };

export const PORTFOLIO_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_PORTFOLIO_SLUGS = new Set([
  'api',
  'admin',
  'login',
  'support',
  'billing',
  'enterprise',
  'dashboard',
  'auth',
  'org',
  'employer',
  'portfolio',
  'portfolios',
  'checkout',
  'pricing',
  'shared',
  'export',
  'preview',
  'settings',
  'register',
  'logout',
]);

const DOMAIN_HOSTNAME_PATTERN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export class PortfolioApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Present on 409 PORTFOLIO_CONFLICT: the revision now stored on the server. */
  readonly remoteRevision?: number;

  constructor(status: number, code: string, message: string, remoteRevision?: number) {
    super(message);
    this.name = 'PortfolioApiError';
    this.status = status;
    this.code = code;
    this.remoteRevision = remoteRevision;
  }

  get moduleDisabled(): boolean {
    return this.status === 403 && this.code === 'PORTFOLIO_MODULE_DISABLED';
  }

  get conflict(): boolean {
    return this.status === 409 && this.code === 'PORTFOLIO_CONFLICT';
  }

  get slugConflict(): boolean {
    return (
      this.status === 409 &&
      (this.code === 'SLUG_ALREADY_EXISTS' ||
        this.code === 'PORTFOLIO_SLUG_CONFLICT' ||
        /slug.*exist|already.*claim|already.*taken/i.test(this.message))
    );
  }

  get notFound(): boolean {
    return this.status === 404;
  }

  get cancelled(): boolean {
    return this.code === 'CANCELLED';
  }
}

export function toPortfolioError(error: unknown): PortfolioApiError {
  if (error instanceof PortfolioApiError) return error;
  if (axios.isCancel(error)) {
    return new PortfolioApiError(0, 'CANCELLED', 'The request was cancelled.');
  }
  const normalized = normalizeError(error);
  const details = normalized.details as { remoteRevision?: unknown } | undefined;
  const remote = Number(details?.remoteRevision);
  const message =
    normalized.status === 0 && normalized.code === 'NETWORK_ERROR'
      ? 'The server could not be reached. Check your connection and try again.'
      : normalized.message;
  return new PortfolioApiError(
    normalized.status,
    normalized.code,
    message,
    Number.isSafeInteger(remote) ? remote : undefined,
  );
}

async function call<T>(work: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await work()).data;
  } catch (error) {
    throw toPortfolioError(error);
  }
}

/**
 * Validates a portfolio slug against Mandate 11B rules:
 * - Lowercase alphanumeric + single hyphens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
 * - Length 3..40
 * - No leading, trailing, or consecutive hyphens
 * - Rejects reserved system paths
 */
export function validatePortfolioSlug(raw: string): SlugValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Enter a URL slug between 3 and 40 characters.' };
  }
  if (trimmed !== trimmed.toLowerCase()) {
    return {
      valid: false,
      reason: 'Use lowercase letters (a–z), numbers (0–9), and single hyphens only.',
    };
  }
  if (trimmed.length < 3) {
    return { valid: false, reason: 'Slug must be at least 3 characters long.' };
  }
  if (trimmed.length > 40) {
    return { valid: false, reason: 'Slug must be 40 characters or fewer.' };
  }
  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return { valid: false, reason: 'Slug cannot start or end with a hyphen.' };
  }
  if (trimmed.includes('--')) {
    return { valid: false, reason: 'Slug cannot contain consecutive hyphens.' };
  }
  if (!PORTFOLIO_SLUG_PATTERN.test(trimmed)) {
    return {
      valid: false,
      reason: 'Use lowercase letters (a–z), numbers (0–9), and single hyphens only.',
    };
  }
  if (RESERVED_PORTFOLIO_SLUGS.has(trimmed)) {
    return {
      valid: false,
      reason: `“${trimmed}” is a reserved system path. Please choose another slug.`,
    };
  }
  return { valid: true, slug: trimmed };
}

export function suggestPortfolioSlug(base: string): string {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40)
    .replace(/-+$/g, '');

  if (!cleaned || cleaned.length < 3) return '';
  if (RESERVED_PORTFOLIO_SLUGS.has(cleaned)) {
    return `${cleaned}-cv`.slice(0, 40);
  }
  return cleaned;
}

export function validateCustomDomain(raw: string): DomainValidationResult {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, reason: 'Enter a custom domain (for example, alex-smith.dev).' };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return {
      valid: false,
      reason: 'Enter the domain hostname only, without http:// or https://.',
    };
  }
  if (/[/?#:\\@]/.test(trimmed)) {
    return {
      valid: false,
      reason: 'Enter a domain hostname only, without paths, ports, or query parameters.',
    };
  }
  if (trimmed === 'localhost' || IPV4_PATTERN.test(trimmed)) {
    return {
      valid: false,
      reason: 'Enter a public domain name rather than localhost or an IP address.',
    };
  }
  if (!DOMAIN_HOSTNAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      reason: 'Enter a valid domain name such as alex-smith.dev or cv.alex-smith.com.',
    };
  }
  return { valid: true, domain: trimmed };
}

/** The primary key is minted by the client before the first save, as the legacy studio does. */
export function mintPortfolioId(): string {
  return `portfolio_${crypto.randomUUID()}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
}

type StoredPortfolioListEnvelope = { portfolios?: StoredPortfolio[] };
type StoredPortfolioItemEnvelope = { portfolio: StoredPortfolio };

export async function listPortfolios(signal?: AbortSignal): Promise<StoredPortfolio[]> {
  const data = await call(() =>
    apiClient.get<StoredPortfolioListEnvelope>('/portfolios', { signal }),
  );
  return Array.isArray(data.portfolios) ? data.portfolios : [];
}

export async function getPortfolio(id: string, signal?: AbortSignal): Promise<StoredPortfolio> {
  const data = await call(() =>
    apiClient.get<StoredPortfolioItemEnvelope>(`/portfolios/${encodeURIComponent(id)}`, { signal }),
  );
  return data.portfolio;
}

/** Same identifier contract the backend enforces on `:id` (`^[A-Za-z0-9_-]{4,128}$`). */
export const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;

export interface PortfolioSaveEnvelope {
  id: string;
  portfolio: Record<string, unknown>;
  expectedRevision: number;
}

/**
 * The save payload: the document plus the revision the edit was based on.
 *
 * `expectedRevision` is required and must be a non-negative safe integer — 0
 * creates, anything else must equal the stored revision or the server answers 409
 * PORTFOLIO_CONFLICT. Refusing to build an envelope without it is what keeps a
 * stale or missing revision from being sent as `undefined` (which the server would
 * reject as a 400 anyway, but only after a round trip).
 */
export function portfolioSaveEnvelope(
  id: string,
  portfolio: Record<string, unknown>,
  expectedRevision: unknown,
): PortfolioSaveEnvelope {
  const identifier = String(id ?? '');
  if (!PORTFOLIO_ID_PATTERN.test(identifier)) {
    throw new PortfolioApiError(400, 'INVALID_PORTFOLIO_ID', 'Invalid portfolio identifier.');
  }
  if (!portfolio || typeof portfolio !== 'object' || Array.isArray(portfolio)) {
    throw new PortfolioApiError(400, 'INVALID_PORTFOLIO_ENVELOPE', 'Portfolio data must be an object.');
  }
  // Strict: `null`/`''` would otherwise coerce to 0, which the server reads as
  // "create". A revision must be a real, non-negative safe integer.
  const revision = expectedRevision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new PortfolioApiError(
      400,
      'PORTFOLIO_REVISION_REQUIRED',
      'This portfolio has no saved revision yet. Reload it and try again.',
    );
  }
  return { id: identifier, portfolio, expectedRevision: revision };
}

/** expectedRevision 0 creates; otherwise it must equal the stored revision or the server answers 409. */
export async function savePortfolio(
  id: string,
  portfolio: Record<string, unknown>,
  expectedRevision: number,
): Promise<StoredPortfolio> {
  const envelope = portfolioSaveEnvelope(id, portfolio, expectedRevision);
  const data = await call(() =>
    apiClient.post<StoredPortfolioItemEnvelope>(`/portfolios/${encodeURIComponent(envelope.id)}`, {
      portfolio: envelope.portfolio,
      expectedRevision: envelope.expectedRevision,
    }),
  );
  return data.portfolio;
}

export async function deletePortfolio(id: string, expectedRevision: number): Promise<void> {
  await call(() =>
    apiClient.delete(`/portfolios/${encodeURIComponent(id)}`, { data: { expectedRevision } }),
  );
}

/**
 * Publishes a portfolio via `POST /api/portfolios/:id/publish` with `{ slug, isPublished: true }`.
 */
export async function publishPortfolioSlug(
  id: string,
  slug: string,
): Promise<PublishPortfolioResult> {
  const check = validatePortfolioSlug(slug);
  if (!check.valid) {
    throw new PortfolioApiError(400, 'INVALID_SLUG', check.reason);
  }
  const data = await call(() =>
    apiClient.post<unknown>(`/portfolios/${encodeURIComponent(id)}/publish`, {
      slug: check.slug,
      isPublished: true,
    }),
  );
  return parsePublishResponse(data, check.slug, true);
}

/**
 * Unpublishes a portfolio via `POST /api/portfolios/:id/publish` with `{ isPublished: false }`.
 */
export async function unpublishPortfolioById(
  id: string,
  existingSlug: string | null = null,
): Promise<PublishPortfolioResult> {
  const data = await call(() =>
    apiClient.post<unknown>(`/portfolios/${encodeURIComponent(id)}/publish`, {
      isPublished: false,
    }),
  );
  return parsePublishResponse(data, existingSlug, false);
}

function parsePublishResponse(
  payload: unknown,
  fallbackSlug: string | null,
  expectedPublished: boolean,
): PublishPortfolioResult {
  if (!isObjectRecord(payload)) {
    throw new PortfolioApiError(
      502,
      'INVALID_PUBLISH_RESPONSE',
      'Unexpected response from portfolio publication service.',
    );
  }
  const nestedPortfolio = isObjectRecord(payload.portfolio)
    ? (payload.portfolio as StoredPortfolio)
    : null;

  const explicitPublished =
    typeof payload.isPublished === 'boolean'
      ? payload.isPublished
      : typeof nestedPortfolio?.isPublished === 'boolean'
        ? nestedPortfolio.isPublished
        : expectedPublished;

  const hasExplicitNullSlug =
    payload.slug === null || (nestedPortfolio !== null && nestedPortfolio.slug === null);

  const resolvedSlug =
    typeof payload.slug === 'string' && payload.slug.trim()
      ? payload.slug.trim()
      : typeof nestedPortfolio?.slug === 'string' && nestedPortfolio.slug.trim()
        ? nestedPortfolio.slug.trim()
        : hasExplicitNullSlug
          ? null
          : fallbackSlug;

  const publishedAt =
    typeof payload.publishedAt === 'string'
      ? payload.publishedAt
      : typeof nestedPortfolio?.publishedAt === 'string'
        ? nestedPortfolio.publishedAt
        : null;

  return {
    slug: resolvedSlug,
    isPublished: explicitPublished,
    publishedAt,
    portfolio: nestedPortfolio,
  };
}

/**
 * Registers a custom domain via `POST /api/portfolios/:id/custom-domain`
 * and extracts the exact TXT verification host and token returned by the backend.
 * Displays `PENDING` ("Pending verification") until the backend explicitly confirms verification.
 */
export async function configurePortfolioCustomDomain(
  id: string,
  rawDomain: string,
): Promise<CustomDomainConfig> {
  const check = validateCustomDomain(rawDomain);
  if (!check.valid) {
    throw new PortfolioApiError(400, 'INVALID_CUSTOM_DOMAIN', check.reason);
  }

  const data = await call(() =>
    apiClient.post<unknown>(`/portfolios/${encodeURIComponent(id)}/custom-domain`, {
      domain: check.domain,
    }),
  );

  const parsed = parseCustomDomainPayload(data, check.domain);
  if (!parsed) {
    throw new PortfolioApiError(
      502,
      'INVALID_CUSTOM_DOMAIN_RESPONSE',
      'Server did not return DNS verification details for the custom domain.',
    );
  }
  return parsed;
}

export function parseCustomDomainPayload(
  payload: unknown,
  fallbackDomain?: string,
): CustomDomainConfig | null {
  if (!isObjectRecord(payload)) return null;
  const source = isObjectRecord(payload.customDomain)
    ? payload.customDomain
    : isObjectRecord(payload.domainConfig)
      ? payload.domainConfig
      : isObjectRecord(payload.data)
        ? payload.data
        : payload;

  const dnsRecord = isObjectRecord(source.dnsRecord)
    ? source.dnsRecord
    : isObjectRecord(source.txtRecord)
      ? source.txtRecord
      : isObjectRecord(payload.dnsRecord)
        ? payload.dnsRecord
        : null;

  const domain =
    (typeof source.domain === 'string' && source.domain.trim()) ||
    (typeof payload.domain === 'string' && payload.domain.trim()) ||
    fallbackDomain ||
    '';

  if (!domain) return null;

  const recordType =
    (typeof dnsRecord?.type === 'string' && dnsRecord.type.trim().toUpperCase()) ||
    (typeof source.recordType === 'string' && source.recordType.trim().toUpperCase()) ||
    'TXT';

  const host =
    (typeof dnsRecord?.host === 'string' && dnsRecord.host.trim()) ||
    (typeof dnsRecord?.name === 'string' && dnsRecord.name.trim()) ||
    (typeof source.host === 'string' && source.host.trim()) ||
    (typeof source.recordName === 'string' && source.recordName.trim()) ||
    (typeof source.txtHost === 'string' && source.txtHost.trim()) ||
    (typeof source.verificationHost === 'string' && source.verificationHost.trim()) ||
    null;

  const verificationToken =
    (typeof dnsRecord?.value === 'string' && dnsRecord.value.trim()) ||
    (typeof source.verificationToken === 'string' && source.verificationToken.trim()) ||
    (typeof source.token === 'string' && source.token.trim()) ||
    (typeof source.txtValue === 'string' && source.txtValue.trim()) ||
    (typeof payload.verificationToken === 'string' && payload.verificationToken.trim()) ||
    (typeof payload.token === 'string' && payload.token.trim()) ||
    '';

  const rawStatus = String(
    source.verificationStatus ?? source.status ?? payload.verificationStatus ?? payload.status ?? '',
  )
    .trim()
    .toUpperCase();

  const explicitlyVerified =
    source.verified === true ||
    source.isVerified === true ||
    payload.verified === true ||
    rawStatus === 'VERIFIED' ||
    rawStatus === 'ACTIVE_VERIFIED';

  const status: 'PENDING' | 'VERIFIED' | 'FAILED' = explicitlyVerified
    ? 'VERIFIED'
    : rawStatus === 'FAILED'
      ? 'FAILED'
      : 'PENDING';

  if (!explicitlyVerified && !verificationToken) {
    return null;
  }

  const instructions =
    (typeof source.instructions === 'string' && source.instructions.trim()) ||
    (typeof payload.instructions === 'string' && payload.instructions.trim()) ||
    null;

  const verifiedAt =
    typeof source.verifiedAt === 'string'
      ? source.verifiedAt
      : typeof payload.verifiedAt === 'string'
        ? payload.verifiedAt
        : null;

  return {
    domain,
    recordType,
    host,
    verificationToken,
    status,
    instructions,
    verifiedAt,
  };
}

export function extractStoredCustomDomain(
  stored: StoredPortfolio | null | undefined,
): CustomDomainConfig | null {
  if (!stored) return null;
  if (isObjectRecord(stored.customDomain)) {
    return parseCustomDomainPayload(stored.customDomain);
  }
  if (isObjectRecord(stored.domainVerification)) {
    const fallback = typeof stored.customDomain === 'string' ? stored.customDomain : undefined;
    return parseCustomDomainPayload(stored.domainVerification, fallback);
  }
  return null;
}

export interface SlugAvailability {
  base: string;
  slug: string;
  available: boolean;
}

export async function checkSlugAvailability(
  base: string,
  portfolioId: string,
  signal?: AbortSignal,
): Promise<SlugAvailability> {
  const data = await call(() =>
    apiClient.get<SlugAvailability>('/portfolios/slug-availability', {
      params: { base, portfolioId },
      signal,
    }),
  );
  return { base: data.base, slug: data.slug, available: data.available === true };
}

type PublicPortfolioListEnvelope = { portfolios?: PublicPortfolioSummary[] };

export async function listPublishedPortfolios(
  signal?: AbortSignal,
): Promise<PublicPortfolioSummary[]> {
  const data = await call(() =>
    apiClient.get<PublicPortfolioListEnvelope>('/portfolios/public', {
      params: { limit: 100 },
      signal,
    }),
  );
  return Array.isArray(data.portfolios) ? data.portfolios : [];
}

/**
 * Sanitizes public portfolio responses so private owner/tenant/street-address fields
 * never cross into the public portfolio reader.
 */
export function sanitizePublicPortfolioDto(raw: unknown): PublicPortfolio {
  if (!isObjectRecord(raw)) {
    throw new PortfolioApiError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found.');
  }
  const source = isObjectRecord(raw.portfolio) ? raw.portfolio : raw;
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '';
  const slug = typeof source.slug === 'string' && source.slug.trim() ? source.slug.trim() : '';
  if (!id || source.isPublished === false) {
    throw new PortfolioApiError(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found.');
  }

  const rawMeta = isObjectRecord(source.metadata) ? source.metadata : {};
  const metadata: PublicMetadata = {
    description: typeof rawMeta.description === 'string' ? rawMeta.description : '',
    tags: Array.isArray(rawMeta.tags)
      ? rawMeta.tags.filter((t): t is string => typeof t === 'string')
      : [],
    seoTitle: typeof rawMeta.seoTitle === 'string' ? rawMeta.seoTitle : '',
    seoDescription: typeof rawMeta.seoDescription === 'string' ? rawMeta.seoDescription : '',
  };

  const rawData = isObjectRecord(source.data) ? source.data : {};
  let safeCanonical: Record<string, unknown> | null = null;
  if (isObjectRecord(rawData.canonical)) {
    const incoming = rawData.canonical;
    const incomingHeading = isObjectRecord(incoming.heading) ? incoming.heading : {};
    // Explicitly omit street `address`, `postalCode`, `source`, and any private keys.
    const safeHeading: Record<string, unknown> = {
      firstname: incomingHeading.firstname ?? '',
      lastname: incomingHeading.lastname ?? '',
      fullName: incomingHeading.fullName ?? '',
      occupation: incomingHeading.occupation ?? '',
      city: incomingHeading.city ?? '',
      country: incomingHeading.country ?? '',
      email: incomingHeading.email ?? '',
      phone: incomingHeading.phone ?? '',
      photo: incomingHeading.photo ?? '',
      website: incomingHeading.website ?? '',
      linkedin: incomingHeading.linkedin ?? '',
      github: incomingHeading.github ?? '',
    };

    const visibility = isObjectRecord(incoming.visibility) ? incoming.visibility : {};
    const visible = (key: string) => visibility[key] !== false;
    safeCanonical = {
      template: incoming.template,
      visibility,
      heading: visible('showContact') ? safeHeading : {
        ...safeHeading,
        email: '',
        phone: '',
        website: '',
        linkedin: '',
        github: '',
      },
      summary: incoming.summary,
      experiences: visible('showExperience') && Array.isArray(incoming.experiences) ? incoming.experiences : [],
      education: visible('showEducation') && Array.isArray(incoming.education) ? incoming.education : [],
      skills: visible('showSkills') && Array.isArray(incoming.skills) ? incoming.skills : [],
      projects: visible('showProjects') && Array.isArray(incoming.projects) ? incoming.projects : [],
      certifications: Array.isArray(incoming.certifications) ? incoming.certifications : [],
      achievements: Array.isArray(incoming.achievements) ? incoming.achievements : [],
      languages: Array.isArray(incoming.languages) ? incoming.languages : [],
      hobbies: Array.isArray(incoming.hobbies) ? incoming.hobbies : [],
      customSections: Array.isArray(incoming.customSections) ? incoming.customSections : [],
      extras: isObjectRecord(incoming.extras) ? { tagline: incoming.extras.tagline ?? '' } : {},
    };
  }

  return {
    id,
    title: typeof source.title === 'string' ? source.title : 'Portfolio',
    theme: typeof source.theme === 'string' ? source.theme : 'modern-minimal',
    slug,
    isPublished: true,
    publishedAt: typeof source.publishedAt === 'string' ? source.publishedAt : null,
    metadata,
    data: {
      content: Array.isArray(rawData.content) ? rawData.content : [],
      root: isObjectRecord(rawData.root)
        ? { props: isObjectRecord(rawData.root.props) ? rawData.root.props : undefined }
        : {},
      renderer: typeof rawData.renderer === 'string' ? rawData.renderer : undefined,
      templateKey: typeof rawData.templateKey === 'string' ? rawData.templateKey : undefined,
      template: typeof rawData.template === 'string' ? rawData.template : undefined,
      canonical: safeCanonical,
    },
  };
}

export async function getPublishedPortfolio(
  slug: string,
  signal?: AbortSignal,
): Promise<PublicPortfolio> {
  const data = await call(() =>
    apiClient.get<unknown>(`/portfolios/public/${encodeURIComponent(slug)}`, { signal }),
  );
  return sanitizePublicPortfolioDto(data);
}

/* ─── Resumes, as a starting point for a new portfolio ─── */

export interface ResumeChoice {
  id: string;
  title: string;
}

/** Named so the endpoint-contract scanner can read the call (it cannot parse nested generics inline). */
type ResumeRows = { resumes?: Array<Record<string, unknown>> };
type SingleResumeRow = { resume?: Record<string, unknown> };

export async function listResumeChoices(signal?: AbortSignal): Promise<ResumeChoice[]> {
  const data = await call(() => apiClient.get<ResumeRows>('/resumes', { signal }));
  return (Array.isArray(data.resumes) ? data.resumes : [])
    .filter((resume) => typeof resume.id === 'string' && resume.id)
    .map((resume) => ({
      id: String(resume.id),
      title: String(resume.name || resume.title || 'Untitled resume'),
    }));
}

export async function getResumeRecord(id: string): Promise<Record<string, unknown>> {
  const data = await call(() =>
    apiClient.get<SingleResumeRow>(`/resumes/${encodeURIComponent(id)}`),
  );
  if (!data.resume) {
    throw new PortfolioApiError(
      404,
      'RESUME_NOT_FOUND',
      'That resume could not be found. It may have been deleted.',
    );
  }
  return data.resume;
}

export function publicPortfolioBaseUrl(): string {
  // Optional chaining keeps this module importable outside a bundler (the contract
  // tests import it directly under Node), where `import.meta.env` does not exist.
  const configured =
    (import.meta.env?.VITE_PUBLIC_SITE_URL as string | undefined) ||
    (import.meta.env?.VITE_PUBLIC_BASE_URL as string | undefined);
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return '';
}

export function publicPortfolioUrl(slug: string): string {
  return `${publicPortfolioBaseUrl()}/portfolio/${encodeURIComponent(slug)}`;
}

export function publicPortfolioPreviewLabel(slugCandidate: string): string {
  const base = publicPortfolioBaseUrl().replace(/^https?:\/\//i, '');
  const displaySlug = slugCandidate.trim() || '{slug}';
  return `${base || 'ime365.com'}/portfolio/${displaySlug}`;
}

/* ─── Custom-domain verification (real backend contract) ─────────────────────
 *
 * The deployment verifies ownership with a DNS TXT record at the claimed
 * hostname (`POST /api/portfolios/:id/custom-domain` issues the token,
 * `POST /api/portfolios/:id/custom-domain/verify` resolves it live, and
 * `GET /api/portfolios/:id/custom-domain` reports the stored state). Nothing
 * here infers verification from a typed domain name: the status always comes
 * from the server.
 */

export type CustomDomainStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED' | 'UNAVAILABLE' | 'NONE';

export interface CustomDomainStatusReport {
  status: CustomDomainStatus;
  domain: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
  verifyAttempts: number | null;
  /** Human copy for the dialog; never claims more than the server returned. */
  label: string;
  detail: string;
  verified: boolean;
}

const DOMAIN_STATUS_COPY: Record<CustomDomainStatus, { label: string; detail: string }> = {
  VERIFIED: {
    label: 'Verified',
    detail: 'The server resolved the TXT record and confirmed ownership of this domain.',
  },
  PENDING: {
    label: 'Pending verification',
    detail: 'The TXT record has not been confirmed yet. DNS changes can take a few minutes to propagate.',
  },
  FAILED: {
    label: 'Verification failed',
    detail: 'The server looked up the TXT record but did not find a matching token.',
  },
  EXPIRED: {
    label: 'Verification expired',
    detail: 'The verification token expired. Register the domain again to receive a new token.',
  },
  UNAVAILABLE: {
    label: 'Verification unavailable',
    detail: 'DNS verification could not be completed by the server. Nothing was verified.',
  },
  NONE: {
    label: 'Not registered',
    detail: 'No custom domain is registered for this portfolio yet.',
  },
};

function normalizeDomainStatus(raw: unknown): CustomDomainStatus {
  const value = String(raw ?? '').trim().toUpperCase();
  if (value === 'VERIFIED' || value === 'ACTIVE_VERIFIED') return 'VERIFIED';
  if (value === 'FAILED' || value === 'ERROR') return 'FAILED';
  if (value === 'EXPIRED') return 'EXPIRED';
  if (value === 'PENDING' || value === 'ACTIVE_PENDING' || value === 'UNVERIFIED') return 'PENDING';
  return 'NONE';
}

function statusReport(
  status: CustomDomainStatus,
  source: { domain?: unknown; verifiedAt?: unknown; expiresAt?: unknown; lastError?: unknown; verifyAttempts?: unknown },
): CustomDomainStatusReport {
  const copy = DOMAIN_STATUS_COPY[status];
  return {
    status,
    domain: typeof source.domain === 'string' && source.domain.trim() ? source.domain.trim() : null,
    verifiedAt: typeof source.verifiedAt === 'string' ? source.verifiedAt : null,
    expiresAt: typeof source.expiresAt === 'string' ? source.expiresAt : null,
    lastError: typeof source.lastError === 'string' ? source.lastError : null,
    verifyAttempts: Number.isSafeInteger(Number(source.verifyAttempts)) ? Number(source.verifyAttempts) : null,
    label: copy.label,
    detail: copy.detail,
    verified: status === 'VERIFIED',
  };
}

/** Reads `GET /api/portfolios/:id/custom-domain`; 404 means "none registered". */
export async function getPortfolioCustomDomain(
  id: string,
  signal?: AbortSignal,
): Promise<CustomDomainStatusReport> {
  try {
    const data = await call(() =>
      apiClient.get<unknown>(`/portfolios/${encodeURIComponent(id)}/custom-domain`, { signal }),
    );
    const source = isObjectRecord(data)
      ? isObjectRecord(data.customDomain)
        ? data.customDomain
        : data
      : {};
    return statusReport(normalizeDomainStatus(source.status), source);
  } catch (error) {
    const failure = toPortfolioError(error);
    if (failure.cancelled) throw failure;
    if (failure.notFound) return statusReport('NONE', {});
    return statusReport('UNAVAILABLE', { lastError: failure.message });
  }
}

/**
 * Calls `POST /api/portfolios/:id/custom-domain/verify`. A negative result is a
 * real verification outcome (`verified: false`), not an error: it is reported as
 * PENDING/FAILED with the reason the server gave. Transport failures surface as
 * UNAVAILABLE — never as success.
 */
export async function verifyPortfolioCustomDomain(id: string): Promise<CustomDomainStatusReport> {
  try {
    const data = await call(() =>
      apiClient.post<unknown>(`/portfolios/${encodeURIComponent(id)}/custom-domain/verify`, {}),
    );
    const source = isObjectRecord(data) ? data : {};
    const verified = source.verified === true;
    const reported = normalizeDomainStatus(source.status);
    const status: CustomDomainStatus = verified
      ? 'VERIFIED'
      : reported === 'FAILED' || reported === 'EXPIRED'
        ? reported
        : 'PENDING';
    const report = statusReport(status, source);
    if (!verified) {
      const reason = typeof source.reason === 'string' ? source.reason : '';
      report.detail =
        reason === 'TXT_RECORD_MISSING'
          ? 'The server resolved no TXT record at this domain yet. Add the record, wait for propagation, then check again.'
          : reason === 'TXT_RECORD_MISMATCH'
            ? 'The server found TXT records at this domain, but none matched this portfolio’s token.'
            : DOMAIN_STATUS_COPY[status].detail;
    }
    return report;
  } catch (error) {
    const failure = toPortfolioError(error);
    if (failure.cancelled) throw failure;
    return statusReport(failure.status === 404 ? 'NONE' : 'UNAVAILABLE', { lastError: failure.message });
  }
}

export interface DomainDnsRecord {
  type: string;
  host: string;
  value: string;
  purpose: string;
}

/**
 * The DNS records the backend actually asked for. The registration response
 * returns a single TXT record whose name is the claimed hostname; no CNAME or A
 * routing target is configured or verified by this deployment, so none is
 * invented here (see `CUSTOM_DOMAIN_ROUTING_SUPPORTED`).
 */
export function customDomainDnsRecords(config: CustomDomainConfig | null): DomainDnsRecord[] {
  if (!config) return [];
  const records: DomainDnsRecord[] = [];
  if (config.verificationToken) {
    records.push({
      type: config.recordType || 'TXT',
      host: config.host || config.domain,
      value: config.verificationToken,
      purpose: 'Ownership verification (resolved live by the server)',
    });
  }
  return records;
}

/**
 * This deployment's custom-domain backend verifies ownership by TXT lookup only.
 * It does not return — and the repository does not configure — a CNAME/A routing
 * target, so the UI must not claim one exists.
 */
export const CUSTOM_DOMAIN_ROUTING_SUPPORTED = false;

export const CUSTOM_DOMAIN_ROUTING_NOTE =
  'This deployment verifies domain ownership with a DNS TXT record only. Front-end routing for custom hostnames is not configured by the portfolio API, so no CNAME or A-record target is published here.';

/* ─── QR codes (self-contained, no new dependency) ───────────────────────────
 *
 * A byte-mode QR encoder (versions 1–13, error-correction level L, penalty-based
 * mask selection). It exists so the share dialog can render a QR code for the
 * canonical public URL without adding a dependency to package manifests that
 * this change may not modify. The algorithm follows ISO/IEC 18004: mode and
 * character-count header, Reed–Solomon over GF(256), block interleaving,
 * function-pattern layout, mask selection and format/version information.
 */

/** [ecc codewords per block, group-1 blocks, group-1 data codewords, group-2 blocks, group-2 data codewords] */
const QR_ECC_L: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0, 0, 0, 0],
  [7, 1, 19, 0, 0],
  [10, 1, 34, 0, 0],
  [15, 1, 55, 0, 0],
  [20, 1, 80, 0, 0],
  [26, 1, 108, 0, 0],
  [18, 2, 68, 0, 0],
  [20, 2, 78, 0, 0],
  [24, 2, 97, 0, 0],
  [30, 2, 116, 0, 0],
  [18, 2, 68, 2, 69],
  [20, 4, 81, 0, 0],
  [24, 2, 92, 2, 93],
  [26, 4, 98, 0, 0],
];
const QR_ALIGNMENT_CENTERS: ReadonlyArray<readonly number[]> = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
  [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
];
export const QR_MAX_SUPPORTED_VERSION = 13;

export interface QrMatrix {
  /** Modules per side, excluding the 4-module quiet zone. */
  size: number;
  version: number;
  /** Mask pattern actually applied (0–7), so a decoder/test can verify the matrix. */
  mask: number;
  /** `true` = dark module; row-major, `modules[row][column]`. */
  modules: boolean[][];
  /** The exact text encoded. */
  text: string;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) GF_EXP[index] = GF_EXP[index - 255];
}

function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function rsGenerator(degree: number): number[] {
  let polynomial = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = Array.from({ length: polynomial.length + 1 }, () => 0);
    for (let position = 0; position < polynomial.length; position += 1) {
      next[position] ^= polynomial[position];
      next[position + 1] ^= gfMultiply(polynomial[position], GF_EXP[index]);
    }
    polynomial = next;
  }
  return polynomial;
}

function rsRemainder(data: number[], degree: number): number[] {
  const generator = rsGenerator(degree);
  const remainder = Array.from({ length: degree }, () => 0);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let index = 0; index < degree; index += 1) {
        remainder[index] ^= gfMultiply(generator[index + 1], factor);
      }
    }
  }
  return remainder;
}

function qrDataCodewordCount(version: number): number {
  const [, blocks1, data1, blocks2, data2] = QR_ECC_L[version];
  return blocks1 * data1 + blocks2 * data2;
}

/** Bytes of payload that fit in `version` at level L (header included). */
export function qrCapacityBytes(version: number): number {
  if (!Number.isInteger(version) || version < 1 || version > QR_MAX_SUPPORTED_VERSION) return 0;
  return qrDataCodewordCount(version) - (version >= 10 ? 3 : 2);
}

export function utf8Bytes(input: string): number[] {
  return Array.from(new TextEncoder().encode(input));
}

function buildDataBits(payload: number[], version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
  };
  push(0b0100, 4); // byte mode
  push(payload.length, version >= 10 ? 16 : 8);
  for (const byte of payload) push(byte, 8);
  const capacityBits = qrDataCodewordCount(version) * 8;
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let index = 0; index < terminator; index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | bits[index + offset];
    codewords.push(byte);
  }
  const target = qrDataCodewordCount(version);
  for (let pad = 0; codewords.length < target; pad += 1) codewords.push(pad % 2 === 0 ? 0xec : 0x11);
  return codewords;
}

function buildCodewords(payload: number[], version: number): number[] {
  const [eccPerBlock, blocks1, data1, blocks2, data2] = QR_ECC_L[version];
  const data = buildDataBits(payload, version);
  const blocks: Array<{ data: number[]; ecc: number[] }> = [];
  let offset = 0;
  for (let index = 0; index < blocks1; index += 1) {
    const chunk = data.slice(offset, offset + data1);
    offset += data1;
    blocks.push({ data: chunk, ecc: rsRemainder(chunk, eccPerBlock) });
  }
  for (let index = 0; index < blocks2; index += 1) {
    const chunk = data.slice(offset, offset + data2);
    offset += data2;
    blocks.push({ data: chunk, ecc: rsRemainder(chunk, eccPerBlock) });
  }
  const longest = Math.max(data1, data2 || 0);
  const out: number[] = [];
  for (let column = 0; column < longest; column += 1) {
    for (const block of blocks) if (column < block.data.length) out.push(block.data[column]);
  }
  for (let column = 0; column < eccPerBlock; column += 1) {
    for (const block of blocks) out.push(block.ecc[column]);
  }
  return out;
}

interface QrLayout {
  modules: boolean[][];
  functions: boolean[][];
  size: number;
}

function newLayout(version: number): QrLayout {
  const size = version * 4 + 17;
  return {
    size,
    modules: Array.from({ length: size }, () => Array.from({ length: size }, () => false)),
    functions: Array.from({ length: size }, () => Array.from({ length: size }, () => false)),
  };
}

function setFunction(layout: QrLayout, column: number, row: number, dark: boolean) {
  if (row < 0 || column < 0 || row >= layout.size || column >= layout.size) return;
  layout.modules[row][column] = dark;
  layout.functions[row][column] = true;
}

function drawFinder(layout: QrLayout, centerColumn: number, centerRow: number) {
  for (let deltaRow = -4; deltaRow <= 4; deltaRow += 1) {
    for (let deltaColumn = -4; deltaColumn <= 4; deltaColumn += 1) {
      const distance = Math.max(Math.abs(deltaRow), Math.abs(deltaColumn));
      setFunction(layout, centerColumn + deltaColumn, centerRow + deltaRow, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignment(layout: QrLayout, centerColumn: number, centerRow: number) {
  for (let deltaRow = -2; deltaRow <= 2; deltaRow += 1) {
    for (let deltaColumn = -2; deltaColumn <= 2; deltaColumn += 1) {
      setFunction(layout, centerColumn + deltaColumn, centerRow + deltaRow, Math.max(Math.abs(deltaRow), Math.abs(deltaColumn)) !== 1);
    }
  }
}

function drawFormatBits(layout: QrLayout, mask: number) {
  const data = (0b01 << 3) | mask; // error-correction level L
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (position: number) => ((bits >>> position) & 1) === 1;
  for (let index = 0; index <= 5; index += 1) setFunction(layout, 8, index, bit(index));
  setFunction(layout, 8, 7, bit(6));
  setFunction(layout, 8, 8, bit(7));
  setFunction(layout, 7, 8, bit(8));
  for (let index = 9; index < 15; index += 1) setFunction(layout, 14 - index, 8, bit(index));
  for (let index = 0; index < 8; index += 1) setFunction(layout, layout.size - 1 - index, 8, bit(index));
  for (let index = 8; index < 15; index += 1) setFunction(layout, 8, layout.size - 15 + index, bit(index));
  setFunction(layout, 8, layout.size - 8, true); // the always-dark module
}

function drawVersionBits(layout: QrLayout, version: number) {
  if (version < 7) return;
  let remainder = version;
  for (let index = 0; index < 12; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | remainder;
  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >>> index) & 1) === 1;
    const first = layout.size - 11 + (index % 3);
    const second = Math.floor(index / 3);
    setFunction(layout, first, second, dark);
    setFunction(layout, second, first, dark);
  }
}

function drawFunctionPatterns(layout: QrLayout, version: number) {
  const { size } = layout;
  for (let index = 0; index < size; index += 1) {
    setFunction(layout, 6, index, index % 2 === 0);
    setFunction(layout, index, 6, index % 2 === 0);
  }
  drawFinder(layout, 3, 3);
  drawFinder(layout, size - 4, 3);
  drawFinder(layout, 3, size - 4);
  const centers = QR_ALIGNMENT_CENTERS[version];
  for (const row of centers) {
    for (const column of centers) {
      const overlapsFinder =
        (row <= 8 && column <= 8) ||
        (row <= 8 && column >= size - 9) ||
        (row >= size - 9 && column <= 8);
      if (!overlapsFinder) drawAlignment(layout, column, row);
    }
  }
  drawFormatBits(layout, 0); // reserves the area; redrawn once the mask is known
  drawVersionBits(layout, version);
}

function drawCodewords(layout: QrLayout, codewords: number[]) {
  const { size } = layout;
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const column = right - columnOffset;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (layout.functions[row][column] || index >= codewords.length * 8) continue;
        layout.modules[row][column] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
        index += 1;
      }
    }
  }
}

const QR_MASKS: ReadonlyArray<(row: number, column: number) => boolean> = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
];

function applyMask(layout: QrLayout, mask: number) {
  const test = QR_MASKS[mask];
  for (let row = 0; row < layout.size; row += 1) {
    for (let column = 0; column < layout.size; column += 1) {
      if (!layout.functions[row][column] && test(row, column)) {
        layout.modules[row][column] = !layout.modules[row][column];
      }
    }
  }
}

/** Standard penalty rules 1–4, used to choose the mask with the cleanest result. */
export function qrPenaltyScore(modules: ReadonlyArray<ReadonlyArray<boolean>>): number {
  const size = modules.length;
  let score = 0;
  const runs = (line: ReadonlyArray<boolean>) => {
    let runScore = 0;
    let runLength = 1;
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === line[index - 1]) {
        runLength += 1;
        if (runLength === 5) runScore += 3;
        else if (runLength > 5) runScore += 1;
      } else {
        runLength = 1;
      }
    }
    return runScore;
  };
  for (let row = 0; row < size; row += 1) score += runs(modules[row]);
  for (let column = 0; column < size; column += 1) score += runs(modules.map((line) => line[column]));
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const value = modules[row][column];
      if (value === modules[row][column + 1] && value === modules[row + 1][column] && value === modules[row + 1][column + 1]) {
        score += 3;
      }
    }
  }
  const finderLike = [true, false, true, true, true, false, true];
  const matchesAt = (line: ReadonlyArray<boolean>, start: number) =>
    finderLike.every((expected, offset) => line[start + offset] === expected);
  const patternScore = (line: ReadonlyArray<boolean>) => {
    let found = 0;
    for (let start = 0; start + 7 <= line.length; start += 1) {
      if (!matchesAt(line, start)) continue;
      const before = start >= 4 && line.slice(start - 4, start).every((value) => !value);
      const after = start + 11 <= line.length && line.slice(start + 7, start + 11).every((value) => !value);
      if (before || after) found += 40;
    }
    return found;
  };
  for (let row = 0; row < size; row += 1) score += patternScore(modules[row]);
  for (let column = 0; column < size; column += 1) score += patternScore(modules.map((line) => line[column]));
  let dark = 0;
  for (const line of modules) for (const value of line) if (value) dark += 1;
  const total = size * size;
  score += Math.floor(Math.abs(dark * 100 / total - 50) / 5) * 10;
  return score;
}

export class QrEncodeError extends Error {
  readonly textLength: number;
  constructor(message: string, textLength: number) {
    super(message);
    this.name = 'QrEncodeError';
    this.textLength = textLength;
  }
}

/**
 * Encodes `text` as a QR symbol. Returns `null` for text too long for the
 * supported versions (13, level L ≈ 425 bytes) so callers can explain the
 * limitation instead of rendering a code that encodes something else.
 */
export function encodeQrMatrix(text: string): QrMatrix | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  const payload = utf8Bytes(text);
  let version = 1;
  while (version <= QR_MAX_SUPPORTED_VERSION && qrCapacityBytes(version) < payload.length) version += 1;
  if (version > QR_MAX_SUPPORTED_VERSION) return null;

  const codewords = buildCodewords(payload, version);
  let best: { layout: QrLayout; mask: number; score: number } | null = null;
  for (let mask = 0; mask < QR_MASKS.length; mask += 1) {
    const layout = newLayout(version);
    drawFunctionPatterns(layout, version);
    drawCodewords(layout, codewords);
    applyMask(layout, mask);
    drawFormatBits(layout, mask);
    const score = qrPenaltyScore(layout.modules);
    if (!best || score < best.score) best = { layout, mask, score };
  }
  if (!best) return null;
  return {
    size: best.layout.size,
    version,
    mask: best.mask,
    modules: best.layout.modules.map((line) => line.slice()),
    text,
  };
}

/** The canonical public URL a visitor should be sent to, or '' when it cannot be built. */
export function publicPortfolioQrTarget(slug: string | null | undefined): string {
  const value = String(slug ?? '').trim();
  if (!value) return '';
  const url = publicPortfolioUrl(value);
  return /^https?:\/\/[^/]/i.test(url) ? url : '';
}

/**
 * Encodes the canonical public URL of a published portfolio. `null` when there is
 * no absolute URL to encode (unpublished, or no configured base and no browser
 * origin) — the caller must then say so rather than show a QR for another value.
 */
export function publicPortfolioQr(slug: string | null | undefined): QrMatrix | null {
  const target = publicPortfolioQrTarget(slug);
  if (!target) return null;
  const matrix = encodeQrMatrix(target);
  return matrix ? { ...matrix, text: target } : null;
}

/** SVG path data for the dark modules; keeps the component free of layout maths. */
export function qrSvgPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.modules[row][column]) parts.push(`M${column} ${row}h1v1h-1z`);
    }
  }
  return parts.join('');
}
