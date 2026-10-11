/**
 * DIR-074 — pure, framework-free identity parsing for the universal account menu.
 *
 * WHY THIS EXISTS
 *   The session `displayName` is human-authored and sometimes carries the role in
 *   parentheses (e.g. `Bhaskar Beyond (Super Admin)`, written by
 *   scripts/deep-clean-production.cjs). Rendered verbatim it produced a raw,
 *   unprofessional header chip and menu row: the person's name and their role were
 *   glued together inside one string with brackets. This module splits that value
 *   into a CLEAN name and a canonical role, so the UI can render each on its own
 *   row/badge and never show parentheses.
 *
 * ZERO FABRICATION
 *   Nothing here invents a value: a name that carries no parenthetical is returned
 *   unchanged, and an absent role stays an empty string rather than becoming a
 *   guessed persona.
 *
 * AUTHORIZATION IS UNTOUCHED. This module decides DISPLAY strings only. It reads
 * no permission and grants nothing; the backend policy engine stays authoritative.
 */

/** Canonical, human-readable label per normalized role key. */
export const ACCOUNT_ROLE_LABELS = Object.freeze({
    SUPER_ADMIN: 'Super Admin',
    SUPERADMIN: 'Super Admin',
    ADMIN: 'Admin',
    RECRUITER: 'Recruiter',
    EMPLOYER: 'Recruiter',
    ENTERPRISE: 'Org Admin',
    ORG_ADMIN: 'Org Admin',
    ORGANIZATION_ADMIN: 'Org Admin',
    CANDIDATE: 'Candidate',
    USER: 'Candidate',
});

/**
 * Role-tailored executive badge styling. Cuba tokens are used for the neutral
 * candidate tone; the elevated tones use the Tailwind accent scales (with dark
 * variants) so each role is visually distinct at AA contrast.
 */
export const ACCOUNT_ROLE_TONES = Object.freeze({
    superAdmin: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30',
    admin: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30',
    recruiter: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
    orgAdmin: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30',
    candidate: 'bg-cuba-primary-soft text-cuba-primary-ink-strong',
});

/** Normalized role key -> tone key. */
const TONE_BY_ROLE = Object.freeze({
    SUPER_ADMIN: 'superAdmin',
    SUPERADMIN: 'superAdmin',
    ADMIN: 'admin',
    RECRUITER: 'recruiter',
    EMPLOYER: 'recruiter',
    ENTERPRISE: 'orgAdmin',
    ORG_ADMIN: 'orgAdmin',
    ORGANIZATION_ADMIN: 'orgAdmin',
    CANDIDATE: 'candidate',
    USER: 'candidate',
});

const normalizeRoleKey = (value) => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');

/** Canonical display label for a role (raw claim, human label, or empty). */
export function roleLabelFor(role) {
    const key = normalizeRoleKey(role);
    if (ACCOUNT_ROLE_LABELS[key]) return ACCOUNT_ROLE_LABELS[key];
    // A human-authored role that is already a label (e.g. 'Super Admin') is kept
    // as-is rather than dropped.
    return String(role ?? '').trim();
}

/** Tone key for a role; unknown roles fall back to the neutral candidate tone. */
export function roleToneFor(role) {
    return TONE_BY_ROLE[normalizeRoleKey(role)] || 'candidate';
}

/** The badge contract: label + tone + the ready-to-apply class string. */
export function roleBadgeFor(role) {
    const tone = roleToneFor(role);
    return { label: roleLabelFor(role), tone, className: ACCOUNT_ROLE_TONES[tone] || ACCOUNT_ROLE_TONES.candidate };
}

/**
 * Splits a display name / session object into a clean identity.
 *
 * @param {string|{name?:string, displayName?:string, email?:string, role?:string, customClaims?:object}} input
 * @returns {{ name: string, email: string, role: string, roleLabel: string, roleTone: string }}
 */
export function parseUserIdentity(input) {
    const isObject = Boolean(input) && typeof input === 'object';
    const rawName = String(isObject ? (input.name || input.displayName || '') : (input || '')).trim();
    const email = String(isObject ? (input.email || '') : '').trim();
    const explicitRole = String(
        isObject
            ? (input.role || input.customClaims?.role || input.customClaims?.accountType || '')
            : '',
    ).trim();

    let name = rawName;
    let parentheticalRole = '';
    const match = rawName.match(/^([^()]*)\(([^()]*)\)\s*$/);
    if (match) {
        name = match[1].trim();
        parentheticalRole = match[2].trim();
    }

    // A parenthetical role is the human-authored truth and wins for DISPLAY; the
    // explicit claim is the fallback when the name carries none.
    const role = parentheticalRole || explicitRole;

    return {
        name,
        email,
        role,
        roleLabel: roleLabelFor(role),
        roleTone: roleToneFor(role),
    };
}

export default parseUserIdentity;
