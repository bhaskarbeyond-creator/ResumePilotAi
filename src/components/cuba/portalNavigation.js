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
    // DIR-016: the Platform Administration & Tenant Provisioning console is a real,
    // mounted tab (`EnterpriseConsole.jsx` renders `<EnterprisePlatformTab />` under
    // `activeTab === 'platform'`, and `tests/enterprise-e2e.spec.js:335` drives it),
    // but it was absent from this mirror. Because the Cuba shell is the DEFAULT chrome,
    // the whole tenant-provisioning surface had NO navigation entry and NO command
    // palette command for any operator — a silent omission, not a deliberate removal.
    //
    // It carries NO tenant permission tag on purpose: its authority is the
    // server-derived `platformAdmin` capability from `/api/enterprise/context`
    // (backend/routes/enterprise.js:337), never a permission the tenant grants.
    // `platformOnly` mirrors EnterpriseConsole's own `canSee()` gate exactly.
    { id: 'platform', label: 'Platform Administration & Tenant Provisioning', permission: null, platformOnly: true },
]);

export const ENTERPRISE_BASE = '/org';

const ENTERPRISE_GROUPS = [
    { id: 'home', label: 'Home', tabs: ['overview', 'resumes'] },
    { id: 'organization', label: 'Organization', tabs: ['members', 'teams', 'workspaces'] },
    { id: 'governance', label: 'Governance', tabs: ['access', 'ai', 'security', 'usage', 'email', 'audit'] },
    { id: 'administration', label: 'Administration', tabs: ['support', 'settings', 'platform'] },
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
            //
            // DIR-016: `platformOnly` is carried for the same reason. It is copied
            // verbatim too, and it is the ONLY thing that decides the provisioning
            // console's visibility — see filterByPermissions below.
            return {
                id: tab.id,
                label: tab.label,
                to: `${base}/${tab.id}`,
                permission: tab.permission,
                platformOnly: tab.platformOnly === true,
            };
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
    // DIR-012: `/admin/settings` was absent from BOTH `PATH_PERMS` and this nav, so
    // Cuba chrome offered no link and `buildPortalCommands` produced no command for it.
    // The legacy sidebar reached it through a separate `SETTINGS_GROUPS` array, and
    // Cuba is the DEFAULT shell (cubaShellFlag.js:47-51) — meaning the whole System
    // Configuration surface (database, Firebase, social auth, AI providers, branding,
    // feature flags, orders) was unreachable for every operator.
    //
    // It is mounted at Admin.jsx behind `<RequireTabPerm required="*">`, i.e. Super
    // Admin only, so the mirrored permission tag is `'*'`. Adding the ENTRY does not
    // widen access: the gate still decides, and the backend still decides (§7).
    {
        id: 'configuration',
        label: 'System Configuration',
        items: [
            { id: 'admin-settings', label: 'System Settings', to: '/admin/settings', permission: '*' },
        ],
    },
]);

/**
 * Every admin path present in PATH_PERMS, including /admin/settings.
 *
 * DIR-012: the settings entry is now a real navigation item, so it is no longer
 * appended by hand below — doing both would list the same route twice and let the
 * two definitions drift apart. `ADMIN_ALL_PATHS` is derived from the nav alone and
 * de-duplicated, so it can never disagree with what the sidebar renders.
 */
export const ADMIN_ALL_PATHS = Object.freeze(
    Array.from(new Set(ADMIN_PORTAL_NAVIGATION.flatMap((g) => g.items.map((i) => i.to)))),
);

/* â”€â”€ Role isolation (Phase 5â€“7) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Returns the navigation entries a portal may render, WITHOUT making any
 * authorization decision. Callers pass the already-resolved, server-authoritative
 * permission list; this only narrows, and an empty/absent list falls back to the
 * ungated items rather than hiding everything (so a permissions outage cannot
 * silently hide the whole console from an authorised operator).
 */
export function filterByPermissions(groups, granted, options = {}) {
    // DIR-016 / INV-3: the platform administration surface is gated by the
    // SERVER-DERIVED `platformAdmin` capability, never by a tenant permission
    // list. A `'*'` wildcard grant deliberately does NOT unlock it: `*` is a
    // tenant-scoped wildcard and the provisioning console spans tenants, so
    // treating them as equivalent would widen access (DIR-012 precedent: a
    // mirrored tag must never decide anything the real gate does not).
    //
    // The default is `false` and only an explicit `=== true` passes. That is
    // fail-closed on purpose: a permissions outage, an older caller, or a new
    // call site that forgets the flag all hide the surface rather than reveal
    // it. Mirrors EnterpriseConsole.jsx `canSee()` exactly:
    //   if (item.platformOnly) return platformAdmin === true;
    const { platformAdmin = false } = options || {};
    const has = (item) => {
        if (item.platformOnly) return platformAdmin === true;
        const required = item.permission;
        if (!required) return true;
        if (Array.isArray(granted) && granted.includes('*')) return true;
        if (Array.isArray(granted) && granted.includes(required)) return true;
        if (typeof required === 'string' && required !== '*' && Array.isArray(granted)) {
            return granted.includes(required);
        }
        return false;
    };
    return groups
        .map((group) => ({ ...group, items: group.items.filter((item) => has(item)) }))
        .filter((group) => group.items.length > 0);
}

