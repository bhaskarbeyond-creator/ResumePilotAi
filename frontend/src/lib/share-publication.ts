/**
 * Public sharing client (DIR-008).
 *
 * Pure, testable wrappers around the publication API. The Share dialog keeps
 * only presentation state; every claim about publication comes from these
 * calls, so the UI can never show "published" without the server having
 * committed it.
 */

export interface PublicationState {
  isPublished: boolean;
  publicationRevision?: number;
  shareToken?: string;
  sharePath?: string;
}

export interface ApiClientLike {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, body?: unknown): Promise<T>;
}

export class ShareUnavailableError extends Error {
  code: 'SHARE_LINK_MISSING' | 'RESUME_ID_MISSING';

  constructor(code: 'SHARE_LINK_MISSING' | 'RESUME_ID_MISSING', message: string) {
    super(message);
    this.name = 'ShareUnavailableError';
    this.code = code;
  }
}

function assertResumeId(resumeId: string): string {
  if (!resumeId || !String(resumeId).trim()) {
    throw new ShareUnavailableError('RESUME_ID_MISSING', 'This resume has not been saved yet, so it cannot be shared.');
  }
  return encodeURIComponent(String(resumeId));
}

export async function fetchPublicationState(api: ApiClientLike, resumeId: string): Promise<PublicationState> {
  const id = assertResumeId(resumeId);
  const state = await api.get<PublicationState>(`/resumes/${id}/publication`);
  return {
    isPublished: Boolean(state?.isPublished),
    publicationRevision: typeof state?.publicationRevision === 'number' ? state.publicationRevision : undefined,
    shareToken: state?.shareToken,
    sharePath: state?.sharePath,
  };
}

export async function publishResume(api: ApiClientLike, resumeId: string): Promise<PublicationState> {
  const id = assertResumeId(resumeId);
  const result = await api.post<PublicationState>(`/resumes/${id}/publish`, {});
  if (!result?.shareToken) {
    // The server owns link custody. If it did not return one, publication did
    // not produce a usable link and the UI must say so instead of inventing a URL.
    throw new ShareUnavailableError('SHARE_LINK_MISSING', 'The server did not return a share link, so nothing was published.');
  }
  return {
    isPublished: true,
    publicationRevision: typeof result.publicationRevision === 'number' ? result.publicationRevision : undefined,
    shareToken: result.shareToken,
    sharePath: result.sharePath || `/shared/${result.shareToken}`,
  };
}

export async function revokeResume(
  api: ApiClientLike,
  resumeId: string,
  publicationRevision?: number | null
): Promise<PublicationState> {
  const id = assertResumeId(resumeId);
  const body = typeof publicationRevision === 'number' ? { expectedPublicationRevision: publicationRevision } : {};
  const result = await api.post<{ publicationRevision?: number }>(`/resumes/${id}/unpublish`, body);
  return {
    isPublished: false,
    publicationRevision: typeof result?.publicationRevision === 'number' ? result.publicationRevision : undefined,
  };
}

/**
 * Honest operator/candidate-facing copy. The dialog must never claim success
 * for a failed call, and a 409 is a recoverable concurrency state, not an error
 * the user should retry blindly.
 */
export function describeShareError(error: unknown): string {
  const anyError = error as { status?: number; message?: string; code?: string };
  if (error instanceof ShareUnavailableError) return error.message;
  if (anyError?.code === 'SHARE_SECRET_UNAVAILABLE' || anyError?.status === 503) {
    return 'Public links are not configured on this deployment yet. Nothing was published.';
  }
  if (anyError?.status === 409) {
    return 'This resume changed in another tab or session. Reload the share dialog to pick up the latest revision, then try again.';
  }
  if (anyError?.status === 401) {
    return 'Your session expired. Sign in again to change sharing.';
  }
  if (anyError?.status === 404) {
    return 'This resume no longer exists on the server, so sharing could not be changed.';
  }
  if (anyError?.status === 429) {
    return 'Too many share changes in a short time. Please wait a moment and retry.';
  }
  return anyError?.message || 'The share setting could not be saved.';
}

export function buildShareUrl(origin: string, sharePathOrToken: string | null | undefined): string {
  if (!sharePathOrToken) return '';
  const path = sharePathOrToken.startsWith('/shared/')
    ? sharePathOrToken
    : `/shared/${sharePathOrToken}`;
  return `${origin.replace(/\/$/, '')}${path}`;
}

/** Server-issued share tokens: `v1.<base64url id>.<22-char HMAC>`. */
export const SHARE_TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]{1,160}\.[A-Za-z0-9_-]{22}$/;

/**
 * Anonymous viewer endpoint for a share route parameter. Tokenized links go to
 * the signed route; pre-token links fall back to the id route (which still
 * enforces published-only). Never returns a URL with a duplicated `/api`
 * prefix — the API client already supplies the base path.
 */
export function resolvePublicResumeEndpoint(tokenOrId: string): string {
  const value = String(tokenOrId || '').trim();
  if (!value) throw new ShareUnavailableError('RESUME_ID_MISSING', 'This shared resume was not found or is no longer published.');
  return SHARE_TOKEN_PATTERN.test(value)
    ? `/resumes/public/token/${encodeURIComponent(value)}`
    : `/resumes/public/${encodeURIComponent(value)}`;
}

/** Whether a share route parameter is a signed token (vs a legacy resume id). */
export function isShareToken(value: string): boolean {
  return SHARE_TOKEN_PATTERN.test(String(value || ''));
}
