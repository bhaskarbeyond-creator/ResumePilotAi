/**
 * Public marketing navigation (Phase 8).
 *
 * Derived from the routes `src/main.jsx` actually mounts. Every entry resolves to
 * a real public page or to an existing on-page anchor, so the marketing header
 * cannot contain a dead link (§16, §28).
 *
 * Nothing here is authenticated. No entry points at a private namespace, and the
 * suite asserts that, so the public surface cannot leak portal structure.
 */
export const PUBLIC_NAV_LINKS = Object.freeze([
    { id: 'features', label: 'Features', to: '/features' },
    { id: 'templates', label: 'Templates', to: '/#templates' },
    { id: 'pricing', label: 'Pricing', to: '/pricing' },
    { id: 'jobs', label: 'Jobs', to: '/jobs' },
    { id: 'blog', label: 'Blog', to: '/blog' },
    { id: 'contact', label: 'Contact', to: '/contact' },
]);

/** Authenticated destinations. Rendered only when a session exists. */
export const PUBLIC_AUTH_LINKS = Object.freeze([
    { id: 'login', label: 'Sign in', to: '/login' },
    { id: 'dashboard', label: 'Dashboard', to: '/dashboard', requiresAuth: true },
]);

export default PUBLIC_NAV_LINKS;
