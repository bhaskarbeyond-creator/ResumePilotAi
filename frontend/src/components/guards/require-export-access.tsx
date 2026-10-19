/**
 * Route Guard — Export Access for Headless Chromium PDF Rendering
 *
 * Allows access to export routes via #renderToken=... URL fragment authentication
 * for headless Chromium PDF rendering without redirecting to /login.
 *
 * This guard checks for:
 * 1. Standard authentication (for regular browser access)
 * 2. A render token in the URL fragment or query string.
 *
 * DIR-008 hardening: the token must be *shaped* like a server-issued token
 * (43 base64url characters). Presence alone is not authorization, and the
 * export page still has to redeem the single-use token server-side before any
 * resume content is available, so a hand-typed `#renderToken=x` grants nothing
 * but an empty shell that renders an honest error.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { PageSpinner } from '@/components/ui/loading';
import { useEffect, useState } from 'react';

/** Server-issued export tokens are 32 random bytes, base64url encoded. */
const RENDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface RequireExportAccessProps {
  children: React.ReactNode;
  /** Optional: require specific role(s) for non-headless access */
  roles?: string[];
}

export function RequireExportAccess({ children, roles }: RequireExportAccessProps) {
  const { user, claims, loading } = useAuth();
  const location = useLocation();
  const [hasRenderToken, setHasRenderToken] = useState(false);

  // Check for render token in URL fragment (#renderToken=...) or query param (?renderToken=...)
  useEffect(() => {
    const checkRenderToken = () => {
      // Check fragment: #renderToken=...
      const fragment = location.hash.slice(1); // Remove leading #
      const fragmentParams = new URLSearchParams(fragment);
      const fragmentToken = fragmentParams.get('renderToken');

      // Check query: ?renderToken=...
      const queryParams = new URLSearchParams(location.search);
      const queryToken = queryParams.get('renderToken');

      const candidate = fragmentToken || queryToken;
      setHasRenderToken(Boolean(candidate && RENDER_TOKEN_PATTERN.test(candidate)));
    };

    checkRenderToken();

    // Also listen for hash changes (SPA navigation with fragment)
    const handleHashChange = () => checkRenderToken();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [location.hash, location.search]);

  if (loading) {
    return <PageSpinner />;
  }

  // Grant access if render token is present (headless Chromium)
  if (hasRenderToken) {
    return <>{children}</>;
  }

  // Otherwise, require standard authentication
  if (!user) {
    const returnPath = `${location.pathname}${location.search}${location.hash}`;
    const loginUrl = `/login?next=${encodeURIComponent(returnPath)}`;
    return <Navigate to={loginUrl} replace />;
  }

  // Check role-based authorization for authenticated users
  if (roles && roles.length > 0) {
    const userRole = (claims.role ?? '').toUpperCase();
    const allowed = roles.some((r) => r.toUpperCase() === userRole);
    if (!allowed) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

/** Redirects authenticated users away from export pages (not typically needed) */
export function RedirectIfAuthenticatedExport({
  children,
  to = '/dashboard',
}: {
  children: React.ReactNode;
  to?: string;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageSpinner />;
  }

  if (user) {
    return <Navigate to={to} replace />;
  }

  return <>{children}</>;
}