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

/** expectedRevision 0 creates; otherwise it must equal the stored revision or the server answers 409. */
export async function savePortfolio(
  id: string,
  portfolio: Record<string, unknown>,
  expectedRevision: number,
): Promise<StoredPortfolio> {
  const data = await call(() =>
    apiClient.post<StoredPortfolioItemEnvelope>(`/portfolios/${encodeURIComponent(id)}`, {
      portfolio,
      expectedRevision,
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

    safeCanonical = {
      template: incoming.template,
      heading: safeHeading,
      summary: incoming.summary,
      experiences: Array.isArray(incoming.experiences) ? incoming.experiences : [],
      education: Array.isArray(incoming.education) ? incoming.education : [],
      skills: Array.isArray(incoming.skills) ? incoming.skills : [],
      projects: Array.isArray(incoming.projects) ? incoming.projects : [],
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
  const configured =
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ||
    (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined);
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
