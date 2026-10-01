/**
 * IME365 — Deterministic route inventory.
 *
 * Derived from the real router definitions:
 *   src/main.jsx, src/components/Dashboard/DashboardMain/DashboardMain.jsx,
 *   src/components/BuildResume/BuildResume.jsx,
 *   src/components/EmployerPortal/EmployerPortal.jsx,
 *   src/components/admin/Admin.jsx
 *
 * `auth: 'public'`  — reachable without a session; crawled as an anonymous user.
 * `auth: 'private'` — session-guarded; crawled to assert the guard redirects to
 *                     login rather than leaking a private workspace.
 */

export const PUBLIC_ROUTES = [
  { route: '/', name: 'home', auth: 'public' },
  { route: '/features', name: 'features', auth: 'public' },
  { route: '/templates', name: 'templates', auth: 'public' },
  { route: '/faq', name: 'faq', auth: 'public' },
  { route: '/faqs', name: 'faqs', auth: 'public' },
  { route: '/plans', name: 'plans', auth: 'public' },
  { route: '/pricing', name: 'pricing', auth: 'public' },
  { route: '/career-resources', name: 'career-resources', auth: 'public' },
  { route: '/privacy', name: 'privacy', auth: 'public' },
  { route: '/terms', name: 'terms', auth: 'public' },
  { route: '/cookies', name: 'cookies', auth: 'public' },
  { route: '/about', name: 'about-redirect', auth: 'public' },
  { route: '/about-us', name: 'about-us-redirect', auth: 'public' },
  { route: '/contact', name: 'contact', auth: 'public' },
  { route: '/login', name: 'login', auth: 'public' },
  { route: '/sign-up', name: 'sign-up-redirect', auth: 'public' },
  { route: '/billing/plans', name: 'billing-plans', auth: 'public' },
  { route: '/jobs', name: 'jobs-landing', auth: 'public' },
  { route: '/jobs/portal', name: 'jobs-portal', auth: 'public' },
  { route: '/jobs/browse', name: 'jobs-browse', auth: 'public' },
  { route: '/jobs/categories', name: 'jobs-categories', auth: 'public' },
  { route: '/blog', name: 'blog-list', auth: 'public' },
  { route: '/p/privacy-policy', name: 'custom-page-privacy', auth: 'public' },
  { route: '/p/terms-of-service', name: 'custom-page-terms', auth: 'public' },
  { route: '/p/cookie-policy', name: 'custom-page-cookies', auth: 'public' },
  { route: '/portfolios', name: 'portfolio-gallery', auth: 'public' },
  { route: '/dashboard2', name: 'dashboard2-redirect', auth: 'public' },
  { route: '/enterprise', name: 'enterprise-redirect', auth: 'public' },
  { route: '/this-route-does-not-exist-zzz', name: 'not-found-404', auth: 'public', expectNotFound: true },
];

/** Session-guarded routes: the crawler asserts a redirect to /login, not content. */
export const PRIVATE_ROUTES = [
  { route: '/dashboard', name: 'dashboard' },
  { route: '/dashboard/settings', name: 'dashboard-settings' },
  { route: '/dashboard/messages', name: 'dashboard-messages' },
  { route: '/dashboard/favorites', name: 'dashboard-favorites' },
  { route: '/dashboard/interview', name: 'dashboard-interview' },
  { route: '/dashboard/cover-letters', name: 'dashboard-cover-letters' },
  { route: '/dashboard/portfolios', name: 'dashboard-portfolios' },
  { route: '/dashboard/applied-jobs', name: 'dashboard-applied-jobs' },
  { route: '/dashboard/job-tracker', name: 'dashboard-job-tracker' },
  { route: '/dashboard/jobs', name: 'dashboard-jobs' },
  { route: '/dashboard/plans', name: 'dashboard-plans' },
  { route: '/dashboard/support', name: 'dashboard-support' },
  { route: '/build-resume', name: 'build-resume' },
  { route: '/create-resume/heading', name: 'create-resume-heading' },
  { route: '/cover-letter', name: 'cover-letter' },
  { route: '/portfolio/builder', name: 'portfolio-builder' },
  { route: '/employer', name: 'employer' },
  { route: '/admin', name: 'admin' },
  { route: '/org/acme', name: 'org-workspace' },
  { route: '/blog-editor', name: 'blog-editor' },
];

export const ALL_ROUTES = [
  ...PUBLIC_ROUTES.map((r) => ({ ...r, kind: 'public' })),
  ...PRIVATE_ROUTES.map((r) => ({ ...r, kind: 'private' })),
];
