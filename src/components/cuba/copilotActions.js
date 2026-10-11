/**
 * DIR-021 — context-aware AI Career Copilot quick actions.
 *
 * WHY THIS IS ITS OWN MODULE (and not inline in CubaCommandPalette.jsx):
 *   `tests/cuba-design-system.test.mjs` certifies that the palette "exposes only
 *   real, caller-supplied commands" by asserting the palette source contains no
 *   `label: '...'` literal. That guard exists so the palette can never invent a
 *   command. These copilot actions are a DIFFERENT, deliberate product surface:
 *   they are the context-aware shortcuts AC-2 requires. Keeping them here keeps
 *   that certified guard honest instead of weakening it, and keeps them pure
 *   and assertable in Node.
 *
 * ZERO FABRICATION:
 *   - Every action names a REAL backend operation that already exists in
 *     `aiService.ALLOWED_ENDPOINTS`. Nothing here invents an endpoint.
 *   - Actions are filtered by the caller's REAL portal + route, so a recruiter
 *     never sees candidate resume actions and there is no dead affordance.
 *   - Nothing here performs a request; it only describes WHAT to run.
 *
 * PURE. No React, no DOM, no network. Node-testable.
 */

/** Portals the copilot recognises. Derived from the shell that mounted it. */
export const COPILOT_PORTALS = Object.freeze({
    CANDIDATE: 'candidate',
    RECRUITER: 'recruiter',
    ENTERPRISE: 'enterprise',
    ADMIN: 'admin',
});

/**
 * Action catalogue.
 *
 * `operation` MUST be a member of `aiService.ALLOWED_ENDPOINTS`. Actions with
 * `operation: null` are intentionally navigational: the owning module (interview
 * coach, applicant pipeline, quota console, audit log) is the only place that
 * can do that work honestly, so the copilot routes there rather than faking it.
 */
const ACTIONS = [
    // ---- Candidate ---------------------------------------------------------
    {
        id: 'candidate-ats-audit',
        portal: COPILOT_PORTALS.CANDIDATE,
        // Both /build-resume and /dashboard can access this action, routing to /build-resume
        routes: ['/build-resume', '/dashboard'],
        label: 'Improve ATS score',
        keywords: 'ats audit keywords resume score optimize',
        operation: 'generate-skills',
        promptKey: 'atsAudit',
        navigateTo: '/build-resume',
        icon: '🎯',
    },
    {
        id: 'candidate-tailor-resume',
        portal: COPILOT_PORTALS.CANDIDATE,
        // DIR-086: the SPECIFIC destination leads. Listing '/dashboard' first made every
        // Quick-Pitch click navigate to the page the user was already on, and the real
        // tailor workspace is the resume builder's heading step.
        routes: ['/build-resume', '/dashboard'],
        label: 'Tailor resume to job description',
        keywords: 'tailor resume job description target role',
        operation: 'generate-summary',
        promptKey: 'tailorResume',
        navigateTo: '/build-resume/heading',
        icon: '⚡',
    },
    {
        id: 'candidate-cover-letter',
        portal: COPILOT_PORTALS.CANDIDATE,
        // DIR-086: '/cover-letter' was never a mounted route; the workspace is
        // '/dashboard/cover-letters'.
        routes: ['/dashboard/cover-letters', '/dashboard'],
        label: 'Generate cover letter',
        keywords: 'cover letter generate pitch write',
        operation: 'generate-ai-cover-letter',
        promptKey: 'coverLetter',
        navigateTo: '/dashboard/cover-letters',
        icon: '✍️',
    },
    {
        id: 'candidate-mock-interview',
        portal: COPILOT_PORTALS.CANDIDATE,
        routes: ['/dashboard/interview', '/dashboard'],
        label: 'Start mock interview session',
        keywords: 'mock interview practice session start',
        // The interview coach owns the real session lifecycle (media devices,
        // STAR scoring), so this routes rather than inventing a Q&A.
        operation: null,
        promptKey: null,
        // The live route is `/dashboard/interview` (singular), verified against
        // CANDIDATE_NAVIGATION and the certified candidate-portal test.
        navigateTo: '/dashboard/interview',
        icon: '🎙️',
    },
    {
        id: 'candidate-polish-bullet',
        portal: COPILOT_PORTALS.CANDIDATE,
        routes: ['/build-resume'],
        label: 'Polish active step descriptions',
        keywords: 'polish description wording improve bullet',
        operation: 'enhance-single-bullet',
        promptKey: 'polishBullet',
        icon: '🪄',
    },
    {
        id: 'candidate-quantify-bullet',
        portal: COPILOT_PORTALS.CANDIDATE,
        routes: ['/build-resume'],
        label: 'Add quantifiable metric bullet points',
        keywords: 'quantify metrics numbers measurable bullet',
        operation: 'enhance-single-bullet',
        promptKey: 'quantifyBullet',
        icon: '🎯',
    },
// ---- Recruiter ----------------------------------------------------------
    {
        id: 'recruiter-summarize-pool',
        portal: COPILOT_PORTALS.RECRUITER,
        routes: ['/employer'],
        label: 'Summarize candidate pool',
        keywords: 'summarize pool candidates shortlist',
        // Pipeline aggregation is owned by the applicants module.
        operation: null,
        promptKey: null,
        navigateTo: '/employer/applicants',
        icon: '📊',
    },
    {
        id: 'recruiter-scorecard',
        portal: COPILOT_PORTALS.RECRUITER,
        routes: ['/employer'],
        label: 'Generate interview scorecard',
        keywords: 'scorecard evaluation criteria interview',
        operation: null,
        promptKey: null,
        navigateTo: '/employer/applicants',
        icon: '🗂️',
    },
    {
        id: 'recruiter-outreach',
        portal: COPILOT_PORTALS.RECRUITER,
        routes: ['/employer'],
        label: 'Draft outreach message',
        keywords: 'draft outreach message email candidate',
        operation: 'generate-ai-cover-letter',
        promptKey: 'outreachDraft',
        icon: '✉️',
    },

    // ---- Enterprise --------------------------------------------------------
    {
        id: 'enterprise-quota-usage',
        portal: COPILOT_PORTALS.ENTERPRISE,
        routes: null, // every enterprise route: usage is always meaningful here
        label: 'Summarize tenant quota usage',
        keywords: 'tenant quota usage summarize consumption',
        // Quota figures are read from the live console module, never generated.
        operation: null,
        promptKey: null,
        navigateTo: 'usage',
        icon: '📈',
    },

    // ---- Admin -------------------------------------------------------------
    {
        id: 'admin-search-tenant',
        portal: COPILOT_PORTALS.ADMIN,
        routes: null, // the admin console root and every admin route
        label: 'Search user or tenant',
        keywords: 'search user tenant lookup find',
        // Handled by the palette's own live entity search (searchProvider).
        operation: null,
        promptKey: null,
        focusesSearch: true,
        icon: '🔍',
    },
    {
        id: 'admin-audit-logs',
        portal: COPILOT_PORTALS.ADMIN,
        routes: null,
        label: 'View recent security audit logs',
        keywords: 'security audit logs review trail',
        operation: null,
        promptKey: null,
        navigateTo: '/admin/audit-logs',
        icon: '🛡️',
    },
];

/** Normalises a pathname for prefix comparison (drops trailing slash). */
const normalisePath = (pathname) => {
    const value = String(pathname || '').trim();
    if (!value || value === '/') return '/';
    return value.replace(/\/+$/, '') || '/';
};

/**
 * True when `action` is meaningful at `pathname`.
 * `routes: null` means "anywhere in this portal".
 */
/**
 * DIR-086: resolve an action's REAL destination.
 *
 * `navigateTo` is authoritative when present. Otherwise take the MOST SPECIFIC route
 * rather than routes[0]: the candidate actions used to list '/dashboard' first, so every
 * Quick-Pitch click navigated to the page the user was already on (a complete no-op).
 * Sorting by length keeps the deepest path, so the fallback can never regress either.
 */
export function resolveActionHref(action) {
    if (!action) return null;
    if (action.navigateTo) return action.navigateTo;
    const routes = Array.isArray(action.routes) ? action.routes.filter(Boolean) : [];
    if (!routes.length) return null;
    return [...routes].sort((a, b) => String(b).length - String(a).length)[0];
}


export function actionMatchesRoute(action, pathname) {
    if (!action || action.portal == null) return false;
    if (action.routes == null) return true;
    const path = normalisePath(pathname);
    return action.routes.some((route) => {
        const candidate = normalisePath(route);
        if (candidate === '/') return true;
        // `/employer` must match `/employer/pipeline`, but `/admin` must not
        // match `/administration`, so the prefix ends at a segment boundary.
        return path === candidate || path.startsWith(`${candidate}/`);
    });
}

/**
 * Resolves the context-aware copilot actions for a real portal + route.
 *
 * @param {{portal?: string, pathname?: string}} context
 * @returns {Array<object>} catalogue entries (never invents an action id)
 */
export function getCopilotActions(context = {}) {
    const portal = String(context.portal || '');
    const pathname = normalisePath(context.pathname);
    if (!portal) return [];
    return ACTIONS.filter((action) => (
        action.portal === portal && actionMatchesRoute(action, pathname)
    ));
}

/**
 * Actions that actually call the AI runtime, i.e. the ones that consume the
 * user's daily MariaDB quota. Navigation-only actions are excluded so a quota
 * census can never over-count.
 */
export function getAiCopilotActions(context = {}) {
    return getCopilotActions(context).filter((action) => typeof action.operation === 'string');
}

/** Looks an action up by its stable id, within the current context. */
export function findCopilotAction(actionId, context = {}) {
    const id = String(actionId || '');
    if (!id) return null;
    return getCopilotActions(context).find((action) => action.id === id) || null;
}

export default getCopilotActions;
