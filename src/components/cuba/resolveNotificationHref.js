/**
 * resolveNotificationHref — DIR-055 S1
 *
 * PURE module. No React, no I/O, no side effects, no query-param payloads.
 *
 * WHY THIS EXISTS
 *   `M3NotificationCenter` previously rendered
 *       onClick={() => onNavigate?.(item.href)}
 *   but the `notifications` table has NO `href` column (verified against
 *   MariaDB: id, user_id, event_id, type, title, message, data, is_read, state,
 *   delivery_state, created_at, updated_at). So `item.href` was ALWAYS
 *   `undefined` and every row click was silently dead. This module derives the
 *   destination from `type` instead.
 *
 * ROUTE SOURCE OF TRUTH
 *   Every path below is validated against the real mounted route tables:
 *     candidate → src/components/Dashboard/DashboardMain/DashboardMain.jsx
 *     employer  → src/components/EmployerPortal/EmployerPortalCuba.jsx
 *   Note the candidate interview route is SINGULAR (`/dashboard/interview`).
 *
 * CONTRACT
 *   resolveNotificationHref(row) -> string | null
 *     • returns a REAL, mounted route for a known type
 *     • returns null for unknown/system types so the row does NOT navigate
 *       (a dead link is worse than no link — "zero dead hrefs" is the goal)
 */

/** Real, mounted candidate routes (DashboardMain.jsx). */
export const CANDIDATE_ROUTES = Object.freeze({
    dashboard: '/dashboard',
    messages: '/dashboard/messages',
    interview: '/dashboard/interview',
    appliedJobs: '/dashboard/applied-jobs',
    jobTracker: '/dashboard/job-tracker',
    jobs: '/dashboard/jobs',
    plans: '/dashboard/plans',
    settings: '/dashboard/settings',
    support: '/dashboard/support',
    coverLetters: '/dashboard/cover-letters',
    portfolios: '/dashboard/portfolios',
    favorites: '/dashboard/favorites'
});

/** Real, mounted employer routes (EmployerPortalCuba.jsx). */
export const EMPLOYER_ROUTES = Object.freeze({
    root: '/employer',
    jobs: '/employer/jobs',
    applicants: '/employer/applicants',
    company: '/employer/company',
    settings: '/employer/settings'
});

/**
 * Notification `type` → destination. Covers BOTH vocabularies in play:
 * the stored `type` values seen in MariaDB (message, job_application_received,
 * application_interview, application_rejected) and the deterministic producer
 * event names pinned by tests/notification-lifecycle.test.mjs
 * (job_application_submitted, job_application_status, message, payment_active,
 * payment_refunded).
 */
export const NOTIFICATION_ROUTE_BY_TYPE = Object.freeze({
    // ── messaging ──
    message: CANDIDATE_ROUTES.messages,
    new_message: CANDIDATE_ROUTES.messages,
    conversation: CANDIDATE_ROUTES.messages,

    // ── employer-side: someone applied to my job ──
    job_application_received: EMPLOYER_ROUTES.applicants,
    job_application_submitted: EMPLOYER_ROUTES.applicants,
    new_applicant: EMPLOYER_ROUTES.applicants,
    applicant: EMPLOYER_ROUTES.applicants,

    // ── candidate-side: my application moved ──
    job_application_status: CANDIDATE_ROUTES.appliedJobs,
    application_interview: CANDIDATE_ROUTES.interview,
    interview_scheduled: CANDIDATE_ROUTES.interview,
    application_rejected: CANDIDATE_ROUTES.appliedJobs,
    application_offer: CANDIDATE_ROUTES.appliedJobs,
    application_viewed: CANDIDATE_ROUTES.appliedJobs,
    job_match: CANDIDATE_ROUTES.jobTracker,

    // ── billing ──
    payment_active: CANDIDATE_ROUTES.plans,
    payment_refunded: CANDIDATE_ROUTES.plans,
    subscription: CANDIDATE_ROUTES.plans,

    // ── account ──
    portfolio_published: CANDIDATE_ROUTES.portfolios,
    resume_published: CANDIDATE_ROUTES.portfolios,
    security_alert: CANDIDATE_ROUTES.settings,
    welcome: CANDIDATE_ROUTES.dashboard
});

/**
 * Semantic kind, used for contextual row icons. Kept separate from the route
 * map so an icon can be chosen even when there is no destination.
 */
export const NOTIFICATION_KIND_BY_TYPE = Object.freeze({
    message: 'message', new_message: 'message', conversation: 'message',
    job_application_received: 'application', job_application_submitted: 'application',
    new_applicant: 'application', applicant: 'application',
    job_application_status: 'application', application_viewed: 'application',
    application_rejected: 'rejected', application_offer: 'offer',
    application_interview: 'interview', interview_scheduled: 'interview',
    job_match: 'match',
    payment_active: 'payment', payment_refunded: 'payment', subscription: 'payment',
    portfolio_published: 'portfolio', resume_published: 'portfolio',
    security_alert: 'security', welcome: 'system'
});

const normalizeType = (value) => String(value ?? '').trim().toLowerCase();

/** The row's type, tolerating either `type` or `data.type`. */
export function notificationType(row) {
    if (!row || typeof row !== 'object') return '';
    const direct = normalizeType(row.type);
    if (direct) return direct;
    const data = row.data;
    if (data && typeof data === 'object') return normalizeType(data.type);
    return '';
}

/**
 * Resolve a notification row to a mounted route.
 * @returns {string|null} a real route, or null when there is no honest target.
 */
export function resolveNotificationHref(row) {
    const type = notificationType(row);
    if (!type) return null;
    return NOTIFICATION_ROUTE_BY_TYPE[type] ?? null;
}

/** Contextual icon kind; falls back to 'system' so the UI always has one. */
export function resolveNotificationKind(row) {
    const type = notificationType(row);
    return NOTIFICATION_KIND_BY_TYPE[type] ?? 'system';
}

/** True only when a row has a real, navigable destination. */
export function isNavigableNotification(row) {
    return resolveNotificationHref(row) !== null;
}
