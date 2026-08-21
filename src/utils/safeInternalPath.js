/**
 * Same-origin relative path used as a post-login return target.
 * Rejects protocol-relative URLs, schemes, and control characters so an
 * email or query string cannot bounce the browser off-site after sign-in.
 */
export function isSafeInternalPath(value) {
  const next = String(value || '').trim();
  if (!next.startsWith('/') || next.startsWith('//')) return false;
  if (next.includes('\\') || next.includes('://')) return false;
  if (/[\u0000-\u001f\u007f]/.test(next)) return false;
  if (next.length > 1024) return false;
  try {
    const decoded = decodeURIComponent(next);
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return false;
    if (decoded.includes('\\') || decoded.includes('://')) return false;
    if (/[\u0000-\u001f\u007f]/.test(decoded)) return false;
  } catch (_) {
    return false;
  }
  return true;
}

export function loginPathWithNext(nextPath) {
  if (!isSafeInternalPath(nextPath)) return '/login';
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function getPostLoginRedirectPath(search = (typeof window !== 'undefined' ? window.location.search : '')) {
  try {
    const params = new URLSearchParams(search);
    const next = params.get('next');
    if (next && isSafeInternalPath(next)) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('post_login_redirect', next);
        }
      } catch (_) {}
      return next;
    }
  } catch (_) {}
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem('post_login_redirect');
      if (stored && isSafeInternalPath(stored)) {
        return stored;
      }
    }
  } catch (_) {}
  return null;
}

export function clearPostLoginRedirectPath() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('post_login_redirect');
    }
  } catch (_) {}
}
