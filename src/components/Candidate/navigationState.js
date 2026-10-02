/**
 * Active-navigation resolution (Phase 4).
 *
 * Pure logic, kept free of React so it can be unit-tested directly and reused by
 * the sidebar, the command palette and the breadcrumb without any of them
 * re-implementing the matching rules.
 */

/** Strips the query string and any trailing slash from a navigation target. */
export const pathOf = (to) => String(to || '').split('?')[0].replace(/\/+$/, '');

/**
 * Resolves the active item for a pathname.
 *
 * Precedence:
 *   1. Exact match always wins.
 *   2. Otherwise the longest matching ancestor, so /build-resume/heading
 *      highlights "Resumes" rather than the top-level Overview.
 *
 * A pathname outside the candidate namespace resolves to null, so the removed
 * /dashboard2 alias and the employer portal can never light up a candidate item.
 */
export function resolveActiveItem(pathname, groups) {
    const target = pathOf(pathname);
    if (!target) return null;

    let best = null;
    for (const group of groups) {
        for (const item of group.items) {
            const base = pathOf(item.to);
            if (target === base) return item;
            if (target.startsWith(`${base}/`) && (!best || base.length > pathOf(best.to).length)) {
                best = item;
            }
        }
    }
    return best;
}

export default resolveActiveItem;
