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
 * DIR-081: the query half of a navigation target, as a normalised [key, value]
 * list. Case-insensitive on both halves, because `?tab=Security` and
 * `?tab=security` address the same surface.
 */
export const queryOf = (to) => {
    const raw = String(to || '');
    const index = raw.indexOf('?');
    if (index === -1) return [];
    const entries = [];
    new URLSearchParams(raw.slice(index + 1)).forEach((value, key) => {
        entries.push([key.toLowerCase(), String(value).toLowerCase()]);
    });
    return entries;
};

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

    const targetQuery = queryOf(pathname);
    let firstExact = null;
    let best = null;
    let bestAncestorLength = 0;

    for (const group of groups) {
        for (const item of group.items) {
            const base = pathOf(item.to);
            // DIR-003 / CAND-001: a nav entry may own additional surfaces through
            // `aliases` (e.g. Resumes & Master CV also owns /build-resume/*). Each
            // alias participates in BOTH exact matching and longest-ancestor
            // matching, so deep builder URLs keep the hub highlighted.
            const aliasBases = (Array.isArray(item.aliases) ? item.aliases : []).map(pathOf);
            const bases = [base, ...aliasBases];
            const exactMatch = bases.includes(target);
            if (exactMatch) {
                if (!firstExact) firstExact = item;
                // DIR-081: a query-scoped destination (e.g. ?tab=Security) must only
                // claim the highlight when the live URL carries the same param. Before
                // this, every ?tab= item collapsed onto the same bare path and the
                // FIRST one declared (Master Profile Data) won unconditionally, so
                // Security & 2FA Hub could never be highlighted.
                const itemQuery = queryOf(item.to);
                if (itemQuery.length > 0
                    && itemQuery.every(([key, value]) => targetQuery.some(([tKey, tValue]) => tKey === key && tValue === value))) {
                    return item;
                }
                continue;
            }
            const ancestorBase = bases.find((candidate) => target.startsWith(`${candidate}/`));
            if (ancestorBase && (!best || ancestorBase.length > bestAncestorLength)) {
                best = item;
                bestAncestorLength = ancestorBase.length;
            }
        }
    }
    // Bare path with no matching query param: fall back to the first declared item
    // for that path, preserving the previous behaviour for /dashboard/settings.
    return firstExact || best;
}

export default resolveActiveItem;
