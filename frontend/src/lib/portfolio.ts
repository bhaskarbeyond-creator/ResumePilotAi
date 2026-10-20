/**
 * Typed client for the portfolio API (backend/routes/portfolios.js), through the
 * shared apiClient (base URL /api, Bearer token, refresh). Paths are written
 * without the /api prefix: the earlier pages wrote '/api/portfolios', so every
 * request went to /api/api/portfolios and returned 404.
 *
 *   GET    /portfolios                       the signed-in owner's portfolios
 *   GET    /portfolios/:id                   one of them
 *   POST   /portfolios/:id                   create (expectedRevision 0) or update, revision-checked
 *   DELETE /portfolios/:id                   delete, revision-checked
 *   GET    /portfolios/slug-availability     exact address a first publication would issue
 *   GET    /portfolios/public                published summaries (anonymous)
 *   GET    /portfolios/public/:slug          one published portfolio (anonymous)
 *
 * Owner routes answer 403 PORTFOLIO_MODULE_DISABLED while an administrator has the
 * module turned off (the shipped default); the public routes always answer.
 */
import axios from 'axios';
import { apiClient, normalizeError } from '@/lib/api-client';

export interface StoredPortfolio {
  id: string;
  title: string;
  theme?: string;
  /** Issued address, set on first publication and kept afterwards. */
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
  publishedAt: string | null;
  metadata: PublicMetadata;
  data: { content: unknown[]; root: { props?: Record<string, unknown> }; renderer?: string; templateKey?: string; template?: string; canonical: Record<string, unknown> | null };
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

  get notFound(): boolean {
    return this.status === 404;
  }

  get cancelled(): boolean {
    return this.code === 'CANCELLED';
  }
}

export function toPortfolioError(error: unknown): PortfolioApiError {
  if (error instanceof PortfolioApiError) return error;
  if (axios.isCancel(error)) return new PortfolioApiError(0, 'CANCELLED', 'The request was cancelled.');
  const normalized = normalizeError(error);
  const details = normalized.details as { remoteRevision?: unknown } | undefined;
  const remote = Number(details?.remoteRevision);
  const message = normalized.status === 0 && normalized.code === 'NETWORK_ERROR'
    ? 'The server could not be reached. Check your connection and try again.'
    : normalized.message;
  return new PortfolioApiError(normalized.status, normalized.code, message, Number.isSafeInteger(remote) ? remote : undefined);
}

async function call<T>(work: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await work()).data;
  } catch (error) {
    throw toPortfolioError(error);
  }
}

/** The primary key is minted by the client before the first save, as the legacy studio does. */
export function mintPortfolioId(): string {
  return `portfolio_${crypto.randomUUID()}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
}

export async function listPortfolios(signal?: AbortSignal): Promise<StoredPortfolio[]> {
  const data = await call(() => apiClient.get<{ portfolios?: StoredPortfolio[] }>('/portfolios', { signal }));
  return Array.isArray(data.portfolios) ? data.portfolios : [];
}

export async function getPortfolio(id: string, signal?: AbortSignal): Promise<StoredPortfolio> {
  const data = await call(() => apiClient.get<{ portfolio: StoredPortfolio }>(`/portfolios/${encodeURIComponent(id)}`, { signal }));
  return data.portfolio;
}

/** expectedRevision 0 creates; otherwise it must equal the stored revision or the server answers 409. */
export async function savePortfolio(id: string, portfolio: Record<string, unknown>, expectedRevision: number): Promise<StoredPortfolio> {
  const data = await call(() => apiClient.post<{ portfolio: StoredPortfolio }>(`/portfolios/${encodeURIComponent(id)}`, { portfolio, expectedRevision }));
  return data.portfolio;
}

export async function deletePortfolio(id: string, expectedRevision: number): Promise<void> {
  await call(() => apiClient.delete(`/portfolios/${encodeURIComponent(id)}`, { data: { expectedRevision } }));
}

export interface SlugAvailability {
  base: string;
  /** The exact address a first publication would issue: `<base>-<8 hex>`. */
  slug: string;
  available: boolean;
}

export async function checkSlugAvailability(base: string, portfolioId: string, signal?: AbortSignal): Promise<SlugAvailability> {
  const data = await call(() => apiClient.get<SlugAvailability>('/portfolios/slug-availability', { params: { base, portfolioId }, signal }));
  return { base: data.base, slug: data.slug, available: data.available === true };
}

export async function listPublishedPortfolios(signal?: AbortSignal): Promise<PublicPortfolioSummary[]> {
  const data = await call(() => apiClient.get<{ portfolios?: PublicPortfolioSummary[] }>('/portfolios/public', { params: { limit: 100 }, signal }));
  return Array.isArray(data.portfolios) ? data.portfolios : [];
}

export async function getPublishedPortfolio(slug: string, signal?: AbortSignal): Promise<PublicPortfolio> {
  const data = await call(() => apiClient.get<{ portfolio: PublicPortfolio }>(`/portfolios/public/${encodeURIComponent(slug)}`, { signal }));
  return data.portfolio;
}

/* ─── Resumes, as a starting point for a new portfolio ─── */

export interface ResumeChoice {
  id: string;
  title: string;
}

/** Named so the endpoint-contract scanner can read the call (it cannot parse nested generics inline). */
type ResumeRows = { resumes?: Array<Record<string, unknown>> };

export async function listResumeChoices(signal?: AbortSignal): Promise<ResumeChoice[]> {
  const data = await call(() => apiClient.get<ResumeRows>('/resumes', { signal }));
  return (Array.isArray(data.resumes) ? data.resumes : [])
    .filter((resume) => typeof resume.id === 'string' && resume.id)
    .map((resume) => ({ id: String(resume.id), title: String(resume.name || resume.title || 'Untitled resume') }));
}

export async function getResumeRecord(id: string): Promise<Record<string, unknown>> {
  const data = await call(() => apiClient.get<{ resume?: Record<string, unknown> }>(`/resumes/${encodeURIComponent(id)}`));
  if (!data.resume) throw new PortfolioApiError(404, 'RESUME_NOT_FOUND', 'That resume could not be found. It may have been deleted.');
  return data.resume;
}

export function publicPortfolioUrl(slug: string): string {
  return `${window.location.origin}/portfolio/${slug}`;
}
