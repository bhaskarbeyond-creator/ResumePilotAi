/**
 * Non-production preview identity session.
 *
 * Local, QA and certification environments without a Firebase identity
 * provider authenticate through `POST /api/auth/preview-login`. That endpoint
 * exists only when the backend's local verifier is enabled
 * (`NODE_ENV !== 'production'` and `TEST_AUTH_HMAC_SECRET` set). It answers
 * 404 everywhere else, and production rejects every `rptest.` token.
 *
 * The browser cannot verify the token's HMAC, so a stored session is never
 * trusted on its own:
 *   - the token must be well formed and unexpired;
 *   - uid, email and role are read from the token payload the server signed,
 *     never from separately stored, user-editable fields;
 *   - the AuthProvider confirms the token with the backend before rendering
 *     any authenticated surface, and drops it when the backend says 401.
 */

export const PREVIEW_SESSION_KEY = 'ime_dev_user';
/** Keys older code reads as a bearer-token fallback; cleared on sign-out. */
const LEGACY_TOKEN_KEYS = ['token', 'auth_token'] as const;
const TOKEN_SHAPE = /^rptest\.([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/;

export interface PreviewIdentity {
  uid: string;
  email: string | null;
  displayName: string;
  role: string;
  token: string;
  /** Expiry (seconds since epoch) taken from the signed payload. */
  exp: number | null;
}

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Decode a preview token's payload. Returns null for anything malformed or expired. */
export function decodePreviewToken(token: unknown, nowMs: number = Date.now()): Omit<PreviewIdentity, 'displayName'> | null {
  if (typeof token !== 'string') return null;
  const payloadSegment = TOKEN_SHAPE.exec(token)?.[1];
  if (!payloadSegment) return null;
  let payload: { uid?: unknown; email?: unknown; role?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(decodeBase64Url(payloadSegment));
  } catch {
    return null;
  }
  if (typeof payload.uid !== 'string' || payload.uid.length === 0 || payload.uid.length > 128) return null;
  const exp = typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
  if (exp !== null && exp * 1000 <= nowMs) return null;
  return {
    uid: payload.uid,
    email: typeof payload.email === 'string' ? payload.email : null,
    role: typeof payload.role === 'string' ? payload.role.toUpperCase() : 'USER',
    token,
    exp,
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Read the stored session; identity always comes from the token payload. */
export function readPreviewSession(nowMs: number = Date.now()): PreviewIdentity | null {
  const storage = safeStorage();
  if (!storage) return null;
  let stored: { token?: unknown; displayName?: unknown } | null = null;
  try {
    stored = JSON.parse(storage.getItem(PREVIEW_SESSION_KEY) || 'null');
  } catch {
    stored = null;
  }
  const decoded = decodePreviewToken(stored?.token, nowMs);
  if (!decoded) return null;
  const displayName = typeof stored?.displayName === 'string' && stored.displayName.trim()
    ? stored.displayName.trim().slice(0, 120)
    : (decoded.email?.split('@')[0] || 'Candidate');
  return { ...decoded, displayName };
}

/**
 * Persist a server-issued session. The stored record keeps the shape existing
 * readers expect (uid, email, displayName, role, token), but every identity
 * field is re-derived from the token on read.
 */
export function storePreviewSession(response: { token?: unknown; displayName?: unknown }): PreviewIdentity | null {
  const decoded = decodePreviewToken(response.token);
  const storage = safeStorage();
  if (!decoded || !storage) return null;
  const displayName = typeof response.displayName === 'string' && response.displayName.trim()
    ? response.displayName.trim().slice(0, 120)
    : (decoded.email?.split('@')[0] || 'Candidate');
  const record = { uid: decoded.uid, email: decoded.email, displayName, role: decoded.role, token: decoded.token };
  storage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(record));
  storage.setItem('token', decoded.token);
  return { ...decoded, displayName };
}

export function clearPreviewSession(): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(PREVIEW_SESSION_KEY);
  for (const key of LEGACY_TOKEN_KEYS) storage.removeItem(key);
}

export class PreviewLoginError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'PreviewLoginError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Sign in through the backend preview identity endpoint with the credentials
 * the person typed. Throws PreviewLoginError with the server's message; never
 * fabricates a session when the endpoint is unavailable.
 */
export async function requestPreviewLogin(input: { email: string; password: string; name?: string }): Promise<PreviewIdentity> {
  let response: Response;
  try {
    response = await fetch('/api/auth/preview-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new PreviewLoginError('Network error. Please check your connection.', 0, 'NETWORK_ERROR');
  }
  let body: { token?: unknown; displayName?: unknown; error?: unknown } = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = body.error;
    const nested = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : null;
    const message = typeof nested?.message === 'string'
      ? nested.message
      : response.status === 404
        ? 'Authentication is not configured in this environment.'
        : 'Sign-in failed. Please try again.';
    throw new PreviewLoginError(message, response.status, typeof nested?.code === 'string' ? nested.code : `HTTP_${response.status}`);
  }
  const session = storePreviewSession(body);
  if (!session) throw new PreviewLoginError('The server returned an invalid session.', response.status, 'INVALID_SESSION');
  return session;
}

/**
 * Ask the backend whether a preview token is still accepted.
 * 'valid' on 2xx, 'invalid' on 401/403, 'unknown' when the backend is unreachable.
 */
export async function verifyPreviewSession(token: string): Promise<'valid' | 'invalid' | 'unknown'> {
  try {
    const response = await fetch('/api/users-data/profile', { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) return 'valid';
    if (response.status === 401 || response.status === 403) return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
