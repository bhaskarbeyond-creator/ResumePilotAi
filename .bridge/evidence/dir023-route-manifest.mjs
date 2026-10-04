// @ts-check
/**
 * DIR-023: Authoritative route manifest for the Universal Contrast Auditor.
 *
 * WHY THIS FILE EXISTS
 * The DIR-023 spec quoted a literal list of "68 routes". That list was an
 * illustrative approximation written before the four portals were finished, and
 * the Lead has formally confirmed (bridge evt_mut8za2a_39efab96) that it must
 * be superseded by the REAL canonical surface, derived from the router sources
 * themselves, so the census contains zero 404/redirect false-positives.
 *
 * DERIVATION (every list below is read from the live router, not hand-written):
 *   - public/guest routes  : <Route> in src/main.jsx
 *   - candidate sub-routes : <Route> in DashboardMain.jsx
 *   - recruiter sub-routes : <Route> in EmployerPortal.jsx
 *   - enterprise sub-routes : ENTERPRISE_TABS in components/cuba/portalNavigation.js
 *   - admin sub-routes     : <Route> in components/admin/Admin.jsx
 *
 * POLICY RULES (each is an explicit, defensible decision, not a convenience):
 *   1. REDIRECT-ONLY routes are EXCLUDED. A <Route> whose element is only a
 *      <Navigate> renders no unique surface of its own; auditing it would
 *      measure a page it immediately leaves, producing pure false-positives.
 *      This is why /pricing, /privacy, /templates ... are all omitted below
 *      while their CANONICAL DESTINATIONS are kept.
 *   2. `:param` routes are kept ONLY when a live, server-resolved example
 *      exists (the enterprise tenant slug, resolved via /api/enterprise/context).
 *      A route needing a resumeId/blog slug is data-dependent and is covered by
 *      its owning list/detail surface instead.
 *   3. Every kept route is asserted at crawl time to have rendered a real
 *      surface (main landmark + non-empty text), so a stale path fails loudly
 *      instead of silently counting as "0 violations on an empty page".
 */

/* ------------------------- Public / guest ------------------------- */

export const PUBLIC_ROUTES = Object.freeze([
    { path: '/', surface: 'Welcome' },
    { path: '/contact', surface: 'Contact' },
    { path: '/features', surface: 'Features' },
    { path: '/jobs', surface: 'JobsLanding' },
    { path: '/jobs/portal', surface: 'JobsPortalRoute' },
    { path: '/jobs/browse', surface: 'JobsBrowseRoute' },
    { path: '/jobs/categories', surface: 'JobsLanding' },
    { path: '/blog', surface: 'BlogList' },
    { path: '/portfolios', surface: 'PortfolioGallery' },
    { path: '/login', surface: 'Welcome' },
    // /p/:custompage is data-driven. The canonical pages the nav links to are
    // audited through their real routes below (see LEGAL_ROUTES).
]);

/**
 * Legal/marketing custom pages. These resolve through /p/:custompage and are
 * what /privacy, /terms and /about redirect to (main.jsx:557-560), so they are
 * the canonical surfaces the redirect-only routes were pointing at.
 */
export const LEGAL_ROUTES = Object.freeze([
    { path: '/p/privacy-policy', surface: 'CustomePage' },
    { path: '/p/terms-of-service', surface: 'CustomePage' },
    { path: '/p/about-us', surface: 'CustomePage' },
]);

/* ------------------------- Candidate portal ------------------------- */

/** /dashboard/* -- the index element is the bare Dashboard shell. */
export const CANDIDATE_ROUTES = Object.freeze([
    { path: '/dashboard', surface: 'Dashboard' },
    { path: '/dashboard/settings', surface: 'DashboardSettings' },
    { path: '/dashboard/messages', surface: 'DashboardMessages' },
    { path: '/dashboard/favorites', surface: 'DashboardFavourites' },
    { path: '/dashboard/interview', surface: 'DashboardInterviews' },
    { path: '/dashboard/cover-letters', surface: 'CoverLetter' },
    { path: '/dashboard/portfolios', surface: 'DashboardPortfolios' },
    { path: '/dashboard/applied-jobs', surface: 'AppliedJobs' },
    { path: '/dashboard/job-tracker', surface: 'JobTracker' },
    { path: '/dashboard/jobs', surface: 'MainJobListings' },
    { path: '/dashboard/jobs/portal', surface: 'MainJobListings' },
    { path: '/dashboard/jobs/browse', surface: 'MainJobListings' },
    { path: '/dashboard/plans', surface: 'Billing' },
    { path: '/dashboard/support', surface: 'DashboardSupport' },
    { path: '/dashboard/design-system', surface: 'DesignSystemShowcase' },
]);

/** Standalone authenticated surfaces mounted outside the dashboard shell. */
export const CANDIDATE_STANDALONE = Object.freeze([
    { path: '/build-resume', surface: 'BuildResume' },
    { path: '/cover-letter', surface: 'CoverLetter' },
    { path: '/portfolio/builder', surface: 'PortfolioBuilder' },
    { path: '/blog-editor', surface: 'BlogEditor' },
]);

/* ------------------------- Recruiter portal ------------------------- */

export const RECRUITER_ROUTES = Object.freeze([
    { path: '/employer', surface: 'EmployerOverview' },
    { path: '/employer/jobs', surface: 'EmployerJobPostings' },
    { path: '/employer/applicants', surface: 'EmployerApplicantPipeline' },
    { path: '/employer/company', surface: 'EmployerCompanyProfile' },
    { path: '/employer/messages', surface: 'EmployerCandidateMessages' },
    { path: '/employer/settings', surface: 'EmployerHiringPreferences' },
]);
/* ------------------------- Enterprise console ------------------------- */

/**
 * ENTERPRISE_TABS ids, mirrored verbatim from portalNavigation.js:52-78.
 * `platform` is platformOnly and renders only for a server-derived platform
 * admin; it is still audited because the AUDIT identity IS the platform Super
 * Admin (Lead-confirmed), so the tab is genuinely reachable.
 */
export const ENTERPRISE_TAB_IDS = Object.freeze([
    'overview', 'resumes', 'members', 'teams', 'workspaces', 'access',
    'ai', 'security', 'usage', 'email', 'audit', 'support', 'settings', 'platform',
]);

/**
 * Builds `/org/:slug/<tab>` for a SERVER-RESOLVED tenant slug.
 * @param {string | null | undefined} slug
 */
export function enterpriseRoutesFor(slug) {
    if (!slug) return [];
    const base = `/org/${encodeURIComponent(slug)}`;
    return ENTERPRISE_TAB_IDS.map((id) => ({
        path: `${base}/${id}`,
        surface: `EnterpriseConsole:${id}`,
    }));
}

/* ------------------------- Admin console ------------------------- */

/** <Route> paths in components/admin/Admin.jsx (all non-redirect). */
export const ADMIN_ROUTES = Object.freeze([
    { path: '/admin/dashboard', surface: 'CommandCenter' },
    { path: '/admin/health', surface: 'PlatformHealth' },
    { path: '/admin/queues', surface: 'QueuesDLQ' },
    { path: '/admin/operations', surface: 'Operations' },
    { path: '/admin/attention', surface: 'AttentionNeeded' },
    { path: '/admin/audit-logs', surface: 'AuditTrail' },
    { path: '/admin/security', surface: 'SecurityEvents' },
    { path: '/admin/help-desk', surface: 'HelpDesk' },
    { path: '/admin/users', surface: 'UsersManager' },
    { path: '/admin/operators', surface: 'OperatorsStaff' },
    { path: '/admin/messages', surface: 'SystemBroadcasts' },
    { path: '/admin/employer-applications', surface: 'EmployerVerifications' },
    { path: '/admin/jobs-manager', surface: 'JobsModeration' },
    { path: '/admin/company-management', surface: 'CompanyRegistry' },
    { path: '/admin/tenants', surface: 'TenantsRegistry' },
    { path: '/admin/blog-management', surface: 'BlogEngine' },
    { path: '/admin/landing-pages', surface: 'LandingPages' },
    { path: '/admin/reviews', surface: 'Reviews' },
    { path: '/admin/trustedby', surface: 'TrustedBy' },
    { path: '/admin/phrases', surface: 'Localization' },
    { path: '/admin/settings', surface: 'SystemSettings' },
    { path: '/admin/user/ss', surface: 'SettingsShell' },
]);

/* ------------------------- Assembly ------------------------- */

/**
 * Builds the full de-duplicated manifest.
 * @param {{ tenantSlug?: string | null }} [options]
 * @returns {Array<{ path: string, surface: string, portal: string, auth: string }>}
 */
export function buildRouteManifest(options = {}) {
    const pub = (r) => ({ ...r, portal: 'public', auth: 'public' });
    const priv = (portal) => (r) => ({ ...r, portal, auth: 'private' });

    /** @type {Array<{ path: string, surface: string, portal: string, auth: string }>} */
    const all = [
        ...PUBLIC_ROUTES.map(pub),
        ...LEGAL_ROUTES.map(pub),
        ...CANDIDATE_ROUTES.map(priv('candidate')),
        ...CANDIDATE_STANDALONE.map(priv('candidate')),
        ...RECRUITER_ROUTES.map(priv('recruiter')),
        ...enterpriseRoutesFor(options.tenantSlug).map(priv('enterprise')),
        ...ADMIN_ROUTES.map(priv('admin')),
    ];

    const seen = new Set();
    /** @type {Array<{ path: string, surface: string, portal: string, auth: string }>} */
    const out = [];
    for (const route of all) {
        if (seen.has(route.path)) continue;
        seen.add(route.path);
        out.push(route);
    }
    // Deterministic order keeps the census diff-stable across runs.
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
}

export default buildRouteManifest;