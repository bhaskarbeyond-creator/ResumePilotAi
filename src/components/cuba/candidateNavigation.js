/**
 * Candidate portal navigation model (Phase 4).
 *
 * This is the SINGLE SOURCE OF TRUTH for the Cuba candidate shell's navigation,
 * and it is derived from the routes that are actually mounted in
 * `DashboardMain.jsx` — not from a design document.
 *
 * `tests/cuba-candidate-portal.test.mjs` cross-checks every `to` value below
 * against the real route table, so a navigation entry can never point at a route
 * that was removed or renamed (§16: zero dead navigation links).
 *
 * Module-level paths carry a leading slash; the shell renders them with a plain
 * `href`, which is correct for the server-rendered document and avoids attaching
 * a router listener to every item.
 */

export const CANDIDATE_NAVIGATION = Object.freeze([
    {
        id: 'workspace',
        label: 'Workspace',
        items: [
            { id: 'overview', label: 'Overview', to: '/dashboard' },
            { id: 'resumes', label: 'Resumes & Master CV', to: '/build-resume' },
            { id: 'cover-letters', label: 'Cover Letters', to: '/dashboard/cover-letters' },
            { id: 'portfolios', label: 'Portfolios & Web CV', to: '/dashboard/portfolios' },
            // DIR-016: `/dashboard/favorites` is genuinely mounted — DashboardMain.jsx
            // declares `<Route path="favorites" element={<DashboardFavourites />} />`
            // in BOTH its Cuba and legacy route blocks — yet this model never listed
            // it, so the Saved Favorites & Bookmarks hub was reachable only by typing
            // the URL. Because Cuba is the default candidate chrome, that is a silent
            // omission rather than a deliberate removal, and it also left the command
            // palette with no way to surface it.
            //
            // `keywords` is declared here (not derived) so ⌘K matches the words a user
            // actually types for this feature. The route path is still appended
            // automatically below, so the two can never drift apart.
            { id: 'favorites', label: 'Saved Favorites & Bookmarks', to: '/dashboard/favorites', keywords: 'saved jobs bookmarked resumes starred favorites' },
            // DIR-072: the dedicated full-page notifications workspace. Mounted in
            // DashboardMain.jsx, so the cross-check test below can verify it.
            { id: 'notifications', label: 'Notifications', to: '/dashboard/notifications', keywords: 'notifications alerts activity bell updates unread' },
        ],
    },
    {
        id: 'intelligence',
        label: 'Job Intelligence',
        items: [
            { id: 'jobs', label: 'Browse Job Portal', to: '/dashboard/jobs' },
            { id: 'tracker', label: 'Job Tracker', to: '/dashboard/job-tracker' },
            { id: 'applied', label: 'Submitted Applications', to: '/dashboard/applied-jobs' },
            { id: 'interview', label: 'AI Interview Coach', to: '/dashboard/interview' },
            { id: 'messages', label: 'Messages & Chat', to: '/dashboard/messages' },
        ],
    },
    {
        id: 'account',
        label: 'Account & Security',
        items: [
            { id: 'plans', label: 'Subscription & Plans', to: '/dashboard/plans' },
            { id: 'profile', label: 'Master Profile Data', to: '/dashboard/settings?tab=Profile' },
            { id: 'security', label: 'Security & 2FA Hub', to: '/dashboard/settings?tab=Security' },
            { id: 'support', label: 'Help Desk & Support', to: '/dashboard/support' },
        ],
    },
]);

/**
 * Flat lookup used by the command palette; same real routes, no invented ones.
 *
 * DIR-016: keywords are now the union of the derived terms (`label` + `to`) and any
 * item-level `keywords`. The derived part is kept for EVERY item — not just the ones
 * without an override — so `command.keywords` still contains the real route path and
 * the §25 "a command is a real destination" guarantee still holds for every entry.
 */
export const CANDIDATE_COMMAND_INDEX = Object.freeze(
    CANDIDATE_NAVIGATION.flatMap((group) => group.items.map((item) => ({
        id: item.id,
        label: item.label,
        group: group.label,
        keywords: [item.label, item.to, item.keywords].filter(Boolean).join(' '),
    }))),
);

export default CANDIDATE_NAVIGATION;
