/**
 * Portal navigation models for the recruiter, organization and admin consoles
 * (Phases 5â€“7).
 *
 * WHY THIS FILE EXISTS ALONGSIDE THE EXISTING SIDEBARS:
 *   Each portal already owns a proven, tested navigation source:
 *     - recruiter  â†’ EMPLOYER_NAV  (EmployerPortal/EmployerSidebar.jsx)
 *     - enterprise â†’ NAVIGATION   (enterprise/EnterpriseConsole.jsx, permission-tagged)
 *     - admin      â†’ PATH_PERMS   (components/admin/sidebar/sidebar.jsx)
 *
 *   Those definitions are authoritative and are NOT rewritten here. This module
 *   mirrors the same targets in a plain `.js` form so the Cuba shells can render
 *   them, Node can assert them, and `tests/cuba-portal-navigation.test.mjs` can
 *   prove the mirror has not drifted from the originals.
 *
 * PERMISSIONS ARE NOT DECIDED HERE. The `permission` values are copied verbatim
 * for display parity only. The real authorization decision stays server-side in
 * `backend/security/policy.js` plus each portal's existing `RequireTabPerm`
 * gate, so this module can never widen access (Â§7).
 */

/* â”€â”€ Recruiter / employer console â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const EMPLOYER_PORTAL_NAVIGATION = Object.freeze([
    {
        id: 'hiring',
        label: 'Hiring Command',
        items: [
            { id: 'employer-overview', label: 'Recruiter Overview', to: '/employer' },
            { id: 'employer-jobs', label: 'Job Postings', to: '/employer/jobs' },
            { id: 'employer-applicants', label: 'Applicant ATS Pipeline', to: '/employer/applicants' },
            { id: 'employer-messages', label: 'Candidate Messages', to: '/employer/messages' },
        ],
    },
    {
        id: 'brand',
        label: 'Brand & Settings',
        items: [
            { id: 'employer-company', label: 'Company Profile', to: '/employer/company' },
            { id: 'employer-settings', label: 'Hiring Preferences', to: '/employer/settings' },
        ],
    },
]);

/* â”€â”€ Organization console â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Enterprise tabs are relative to the tenant slug, which the server resolves
 * from `/api/enterprise/context`. `to` therefore carries the resolved base and
 * the browser never guesses a slug.
 */
export const ENTERPRISE_TABS = Object.freeze([
    { id: 'overview', label: 'Overview', permission: null },
    { id: 'resumes', label: 'Talent & Resumes', permission: null },
    { id: 'members', label: 'Users & IAM', permission: 'tenant.members.read' },
    { id: 'teams', label: 'Teams', permission: 'workspace.read' },
    { id: 'workspaces', label: 'Workspaces', permission: 'workspace.read' },
    { id: 'access', label: 'Roles & Permissions', permission: 'tenant.roles.manage' },
    { id: 'ai', label: 'AI Workspace', permission: 'tenant.ai.manage' },
    { id: 'security', label: 'Security & M2M', permission: 'tenant.security.read' },
    { id: 'usage', label: 'Usage & Quotas', permission: 'tenant.usage.read' },
    { id: 'email', label: 'Email & Notifications', permission: 'tenant.settings.write' },
    { id: 'audit', label: 'Audit Logs', permission: 'tenant.audit.read' },
    { id: 'support', label: 'Support Access', permission: 'tenant.settings.write' },
    { id: 'settings', label: 'Organization Settings', permission: 'tenant.settings.write' },
]);

export const ENTERPRISE_BASE = '/org';

const ENTERPRISE_GROUPS = [
    { id: 'home', label: 'Home', tabs: ['overview', 'resumes'] },
    { id: 'organization', label: 'Organization', tabs: ['members', 'teams', 'workspaces'] },
    { id: 'governance', label: 'Governance', tabs: ['access', 'ai', 'security', 'usage', 'email', 'audit'] },
    { id: 'administration', label: 'Administration', tabs: ['support', 'settings'] },
];

/** Builds the enterprise navigation for a server-resolved tenant slug. */
export const enterpriseNavigationFor = (slug) => {
    const base = slug ? `${ENTERPRISE_BASE}/${encodeURIComponent(slug)}` : ENTERPRISE_BASE;
    return ENTERPRISE_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        items: group.tabs.map((id) => {
            const tab = ENTERPRISE_TABS.find((t) => t.id === id);
            // `permission` MUST be carried through. Dropping it here made
            // filterByPermissions a no-op that showed every gated tab to every
            // tenant member; the tag is copied verbatim from ENTERPRISE_TABS.
            return { id: tab.id, label: tab.label, to: `${base}/${tab.id}`, permission: tab.permission };
        }),
    }));
};

/* â”€â”€ Platform admin control plane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Mirrors `PATH_PERMS` in `components/admin/sidebar/sidebar.jsx` verbatim.
 * The `permission` field is copied for display parity; the real gate remains
 * `RequireTabPerm` plus the backend policy engine.
 */
export const ADMIN_PORTAL_NAVIGATION = Object.freeze([
    {
        id: 'observability',
        label: 'Control Plane & Observability',
        items: [
            { id: 'admin-dashboard', label: 'Command Center', to: '/admin/dashboard', permission: ['system.config.read', 'users.read', 'audit.read'] },
            { id: 'admin-health', label: 'Platform Health', to: '/admin/health', permission: 'security.read' },
            { id: 'admin-queues', label: 'Queues & DLQ', to: '/admin/queues', permission: ['system.config.read', 'security.read'] },
            { id: 'admin-operations', label: 'Operations', to: '/admin/operations', permission: ['system.config.read', 'security.read'] },
            { id: 'admin-attention', label: 'Attention Needed', to: '/admin/attention', permission: ['system.config.read', 'tickets.manage'] },
            { id: 'admin-audit-logs', label: 'Audit Trail', to: '/admin/audit-logs', permission: 'audit.read' },
            { id: 'admin-security', label: 'Security Events', to: '/admin/security', permission: 'security.read' },
        ],
    },
    {
        id: 'identity',
        label: 'Support & Identity',
        items: [
            { id: 'admin-help-desk', label: 'Help Desk & Tickets', to: '/admin/help-desk', permission: 'tickets.manage' },
            { id: 'admin-users', label: 'Users Manager', to: '/admin/users', permission: 'users.read' },
            { id: 'admin-operators', label: 'Operators & Staff', to: '/admin/operators', permission: '*' },
            { id: 'admin-messages', label: 'System Broadcasts', to: '/admin/messages', permission: 'notifications.send' },
        ],
    },
    {
        id: 'moderation',
        label: 'Marketplace & Hiring Moderation',
        items: [
            { id: 'admin-employer-applications', label: 'Employer Verifications', to: '/admin/employer-applications', permission: ['applications.review', 'users.read'] },
            { id: 'admin-jobs-manager', label: 'Jobs Moderation', to: '/admin/jobs-manager', permission: ['jobs.manage', 'system.config.write'] },
            { id: 'admin-company-management', label: 'Company Registry', to: '/admin/company-management', permission: ['jobs.manage', 'system.config.write'] },
            { id: 'admin-tenants', label: 'Tenants Registry', to: '/admin/tenants', permission: 'tenants.read' },
        ],
    },
    {
        id: 'content',
        label: 'Content & Marketing CMS',
        items: [
            { id: 'admin-blog-management', label: 'Blog Engine', to: '/admin/blog-management', permission: 'system.config.write' },
            { id: 'admin-landing-pages', label: 'Landing Pages', to: '/admin/landing-pages', permission: 'system.config.write' },
            { id: 'admin-reviews', label: 'Reviews & Testimonials', to: '/admin/reviews', permission: 'system.config.write' },
            { id: 'admin-trustedby', label: 'Trusted By', to: '/admin/trustedby', permission: 'system.config.write' },
            { id: 'admin-phrases', label: 'Localization & Phrases', to: '/admin/phrases', permission: 'system.config.write' },
        ],
    },
]);

/** Every admin path present in PATH_PERMS, including /admin/settings. */
export const ADMIN_ALL_PATHS = Object.freeze([
    ...ADMIN_PORTAL_NAVIGATION.flatMap((g) => g.items.map((i) => i.to)),
    '/admin/settings',
]);

/* â”€â”€ Role isolation (Phase 5â€“7) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Returns the navigation entries a portal may render, WITHOUT making any
 * authorization decision. Callers pass the already-resolved, server-authoritative
 * permission list; this only narrows, and an empty/absent list falls back to the
 * ungated items rather than hiding everything (so a permissions outage cannot
 * silently hide the whole console from an authorised operator).
 */
export function filterByPermissions(groups, granted) {
    const has = (required) => {
        if (!required) return true;
        if (Array.isArray(granted) && granted.includes('*')) return true;
        if (Array.isArray(granted) && granted.includes(required)) return true;
        if (typeof required === 'string' && required !== '*' && Array.isArray(granted)) {
            return granted.includes(required);
        }
        return false;
    };
    return groups
        .map((group) => ({ ...group, items: group.items.filter((item) => has(item.permission)) }))
        .filter((group) => group.items.length > 0);
}

