/**
 * DIR-025: role-aware resolution of the M3 account-menu targets.
 *
 * WHY THIS FILE EXISTS
 * `M3UserMenu` renders "Your profile", "Settings" and "Security & MFA" from
 * `profileHref` / `settingsHref` / `securityHref`. Those three values used to be
 * hardcoded to the CANDIDATE paths in `CubaPortalShell`, which is the shared
 * chrome behind the recruiter, organization and platform-admin consoles too. The
 * observable defect: an operator standing in `/admin` who clicked "Security & MFA"
 * was silently navigated into `/dashboard/settings?tab=security` — a candidate
 * workspace — which is both a broken-navigation bug (INV-2) and a tenancy leak.
 *
 * The contract now lives in ONE pure, framework-free module so that Node tests and
 * the crawler can assert the same table the browser renders, and so the four
 * shells cannot drift apart.
 *
 * EVERY TARGET BELOW IS A MOUNTED ROUTE. That is the whole point: a "Security & MFA"
 * link is worse than no link if it points at an unmounted path, because it renders
 * as a dead control. The mounted evidence is recorded per entry:
 *
 *   candidate  `DashboardMain.jsx` mounts `settings`; the profile/security views are
 *              tabs of it, so `?tab=` is the canonical deep link (INV-4).
 *   recruiter  `EmployerPortal.jsx` mounts `settings`. There is deliberately NO
 *              `/employer/security` route, so the recruiter security entry resolves
 *              to its one real settings surface rather than to an invented URL.
 *   enterprise `orgRouteState.orgPathFor` builds `/org/<slug>/<tab>`, the same
 *              canonical form the console's own sidebar emits, with the
 *              server-resolved tenant slug. Both `settings` and `security` are real
 *              `ENTERPRISE_TABS` ids.
 *   admin      `Admin.jsx` mounts both `settings` and `security`.
 *
 * AUTHORIZATION IS UNTOUCHED. This module decides DISPLAY targets only. It grants
 * nothing, reads no permission and issues no request; the per-tab `RequireTabPerm`
 * gates and the backend policy engine remain the only authority (§7).
 */
// The explicit `.js` extension is deliberate: this module is imported both by the
// Vite app AND by Node's ESM test runner, and bare specifiers resolve in Vite but
// NOT in `node --test`. Keeping the extension makes one file serve both.
import { orgPathFor } from '../../enterprise/orgRouteState.js';

/** Stable portal identifiers. Mirrors `COPILOT_PORTALS` naming without importing it. */
export const ACCOUNT_PORTALS = Object.freeze({
    CANDIDATE: 'candidate',
    RECRUITER: 'recruiter',
    ENTERPRISE: 'enterprise',
    ADMIN: 'admin',
});

/**
 * @typedef {{ profile: string, settings: string, security: string }} AccountLinks
 */

/**
 * Resolves the three account-menu targets for a portal.
 *
 * @param {string} portal  one of `ACCOUNT_PORTALS`.
 * @param {{ slug?: string }} [context]  `slug` is the server-resolved tenant slug,
 *        used only by the enterprise portal. It is encoded by `orgPathFor`, so a
 *        crafted value can never escape the `/org` namespace.
 * @returns {AccountLinks}
 */
export function accountLinksFor(portal, context = {}) {
    switch (portal) {
        case ACCOUNT_PORTALS.ENTERPRISE:
            return {
                profile: orgPathFor('settings', context.slug || ''),
                settings: orgPathFor('settings', context.slug || ''),
                security: orgPathFor('security', context.slug || ''),
            };
        case ACCOUNT_PORTALS.ADMIN:
            return {
                profile: '/admin/settings',
                settings: '/admin/settings',
                security: '/admin/security',
            };
        case ACCOUNT_PORTALS.RECRUITER:
            return {
                profile: '/employer/settings',
                settings: '/employer/settings',
                security: '/employer/settings',
            };
        case ACCOUNT_PORTALS.CANDIDATE:
        default:
            return {
                profile: '/dashboard/settings?tab=profile',
                settings: '/dashboard/settings?tab=account',
                security: '/dashboard/settings?tab=security',
            };
    }
}

export default accountLinksFor;