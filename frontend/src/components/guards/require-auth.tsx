/**
 * Route Guard — Protects authenticated routes.
 * Redirects unauthenticated users to login with a return-to path.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { PageSpinner } from '@/components/ui/loading';

interface RequireAuthProps {
  children: React.ReactNode;
  /** Optional: require specific role(s) */
  roles?: string[];
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { user, claims, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageSpinner />;
  }

  if (!user) {
    const returnPath = `${location.pathname}${location.search}${location.hash}`;
    const loginUrl = `/login?next=${encodeURIComponent(returnPath)}`;
    return <Navigate to={loginUrl} replace />;
  }

  if (roles && roles.length > 0) {
    const userRole = (claims.role ?? '').toUpperCase();
    const allowed = roles.some((r) => r.toUpperCase() === userRole);
    if (!allowed) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

/** Redirects authenticated users away from public-only pages (e.g., login) */
export function RedirectIfAuthenticated({
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
