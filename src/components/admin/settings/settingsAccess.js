/**
 * DIR-105 — settings authorization + grouping primitives.
 *
 * Deliberately a plain `.js` module (not `.jsx`) so the test suite can import and
 * exercise the predicate directly, rather than asserting against source text.
 *
 * This is the ONE place that decides whether an operator may see a settings panel.
 * `Settings.jsx` (the denial gate) and `SettingsNavigator.jsx` (the hub) both call
 * it, so the navigator can never offer a panel the gate would refuse, nor hide one
 * it would allow. It narrows presentation only — the route's `RequireTabPerm
 * required="*"` and the backend policy engine remain the sole authorities.
 */

/** Canonical group order, matching the legacy sidebar so parity is exact. */
export const SETTINGS_GROUP_ORDER = Object.freeze([
    'Modules',
    'General',
    'AI & Services',
    'Payments',
    'Security & Health',
    'Content & Media',
]);

/**
 * The single authorization predicate for a settings entry.
 *
 * Mirrors the pre-DIR-105 inline helper exactly:
 *  - a Super Admin passes everything;
 *  - otherwise `superAdminOnly` entries are denied outright;
 *  - a `permission` entry requires that permission, a `*` grant, or — for
 *    array-form permissions — at least one match (OR semantics).
 */
export function canAccessSetting(setting, { isSuperAdmin = false, permissions = [] } = {}) {
    if (!setting) return false;
    if (isSuperAdmin) return true;
    if (setting.superAdminOnly) return false;
    if (!setting.permission) return true;
    const granted = Array.isArray(permissions) ? permissions : [];
    if (granted.includes('*')) return true;
    const required = Array.isArray(setting.permission) ? setting.permission : [setting.permission];
    return required.some((p) => granted.includes(p));
}

/** Groups present in an inventory, in canonical order. */
export function presentGroups(settings = []) {
    const present = new Set(settings.map((s) => s.group));
    return SETTINGS_GROUP_ORDER.filter((g) => present.has(g));
}
