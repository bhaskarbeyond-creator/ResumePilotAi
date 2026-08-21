/**
 * Same-origin relative path used as a post-login return target.
 * Rejects protocol-relative URLs, schemes, and control characters so an
 * email or query string cannot bounce the browser off-site after sign-in.
 */
export function isSafeInternalPath(value) {
  const next = String(value || '');
  if (!next.startsWith('/') || next.startsWith('//')) return false;
  if (next.includes('\\') || next.includes('://')) return false;
  if (/[\u0000-\u001f\u007f]/.test(next)) return false;
  if (next.length > 1024) return false;
  return true;
}

export function loginPathWithNext(nextPath) {
  if (!isSafeInternalPath(nextPath)) return '/login';
  return `/login?next=${encodeURIComponent(nextPath)}`;
}
