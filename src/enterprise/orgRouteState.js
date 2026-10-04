/**
 * Organization console route resolution (DIR-008).
 *
 * WHY THIS MODULE EXISTS:
 *   The Cuba chrome drives the organization console with real PATHS
 *   (`/org/:slug/:tabId`), while the console historically read the active module
 *   from `?tab=`. Because the console only ever looked at the query string, every
 *   sidebar click landed on an empty `?tab` and silently fell back to `overview`,
 *   leaving all thirteen modules unreachable.
 *
 *   Rather than patching the symptom, the routing contract is made explicit and
 *   lives in ONE pure, framework-free module so it can be unit-tested directly:
 *
 *   PRECEDENCE (pathname is authoritative):
 *     1. pathname  - last segment matched against the caller's VISIBLE tab ids
 *     2. `?tab=`   - mirrored query contract, kept for deep links and back-compat
 *     3. `#tab=`   - legacy hash deep link
 *     4. fallback  - `overview` when nothing resolved
 *
 *   Matching against the *visible* ids is deliberate: a slug that happens to equal
 *   a tab id, or a tab the signed-in role may not see, can never be resolved as a
 *   module. This is display resolution only and decides NOTHING about access;
 *   authorization stays entirely server-side.
 *
 *   Both shapes are supported so React Router route shadowing is harmless:
 *     `/org/:slug/:tabId`  (canonical, emitted by this module)
 *     `/org/:tabId`        (slug-less alias)
 */

/** Canonical organization namespace. Must match `ENTERPRISE_BASE`. */
export const ORG_BASE = '/org';

/** Query keys that survive a module transition (tenant/workspace context). */
export const PRESERVED_QUERY_KEYS = Object.freeze(['tenant', 'workspace']);

/** The module rendered when nothing else resolves. */
export const DEFAULT_ORG_TAB = 'overview';

/** Strips query/hash and trailing slashes so path comparisons are exact. */
const cleanPath = (pathname) => String(pathname || '').split('?')[0].split('#')[0].replace(/\/+$/, '');

/** Splits a pathname into non-empty segments, dropping a leading `org` marker. */
const toSegments = (pathname) => {
    const raw = cleanPath(pathname).split('/').filter(Boolean);
    // A leading `org` namespace marker is not a route segment.
    return raw[0] === ORG_BASE.replace(/^\//, '') ? raw.slice(1) : raw;
};

/** Decodes one segment defensively; a malformed escape is compared literally. */
const decodeSegment = (segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
};

/**
 * Builds the canonical organization pathname for a module.
 *
 * `/org/<slug>/<tabId>` when the server-resolved slug is known, otherwise the
 * slug-less alias `/org/<tabId>`. The slug is encoded so a crafted value can
 * never escape the `/org` namespace.
 */
export function orgPathFor(tabId, slug = '') {
    const tab = String(tabId || DEFAULT_ORG_TAB);
    const base = String(slug || '').trim();
    return base
        ? `${ORG_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(tab)}`
        : `${ORG_BASE}/${encodeURIComponent(tab)}`;
}


/**
 * Resolves the active organization module from the URL.
 *
 * @param {object} input
 * @param {string} input.pathname       e.g. `/org/global-tech/members`
 * @param {string} [input.search]       e.g. `?tab=members&status=INVITED`
 * @param {string} [input.hash]         e.g. `#tab=usage`
 * @param {string[]} [input.visibleIds] ids the signed-in role may actually see
 * @param {string} [input.slug]         server-resolved tenant slug
 * @param {string} [input.fallbackTab]
 * @returns {{
 *   tabId: string,
 *   source: 'pathname'|'query'|'hash'|'fallback',
 *   visible: boolean,
 *   isBare: boolean,
 *   canonicalPathname: string,
 *   needsCanonicalRedirect: boolean
 * }}
 */
export function resolveOrgRoute({
    pathname = '',
    search = '',
    hash = '',
    visibleIds = [],
    slug = '',
    fallbackTab = DEFAULT_ORG_TAB,
} = {}) {
    const ids = new Set((Array.isArray(visibleIds) ? visibleIds : []).map(String));
    // A fallback that is not itself visible would render nothing, so degrade to
    // the first visible module rather than a blank console.
    const safeFallback = ids.has(fallbackTab) ? fallbackTab : ([...ids][0] || fallbackTab);

    const segments = toSegments(pathname);
    const last = segments.length ? decodeSegment(segments[segments.length - 1]) : '';
    const slugSegment = String(slug || '');

    // `/org` and `/org/<slug>` carry no module: redirect to the canonical
    // overview path instead of clobbering the query string in place.
    const isBare = segments.length === 0
        || (segments.length === 1 && (last === slugSegment || !ids.has(last)));

    let tabId = null;
    let source = 'fallback';

    if (!isBare && last && ids.has(last)) {
        tabId = last;
        source = 'pathname';
    }

    if (!tabId) {
        const queryTab = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('tab');
        if (queryTab && ids.has(queryTab)) {
            tabId = queryTab;
            source = 'query';
        }
    }

    if (!tabId) {
        const hashTab = new URLSearchParams(String(hash || '').replace(/^#/, '')).get('tab');
        if (hashTab && ids.has(hashTab)) {
            tabId = hashTab;
            source = 'hash';
        }
    }

    const resolved = tabId || safeFallback;

    // True when the browser is not already sitting on the canonical module path,
    // which is exactly when the console should replace-normalize the URL.
    const needsCanonicalRedirect = cleanPath(pathname) !== orgPathFor(resolved, slugSegment);

    const requestedModule = !isBare && last ? last : null;
    const visible = requestedModule ? ids.has(requestedModule) : true;

    return {
        tabId: resolved,
        source,
        visible,
        isBare,
        canonicalPathname: orgPathFor(resolved, slugSegment),
        needsCanonicalRedirect,
    };
}

/**
 * Builds the mirrored query string for a canonical navigation.
 *
 * `?tab=` is ALWAYS written so deep links, refreshes and shared URLs keep
 * working against the legacy query contract, while `tenant`/`workspace` are
 * carried across module transitions so the server-resolved context is never lost
 * mid-console.
 */
export function buildOrgSearch({ currentSearch = '', tabId, params = null } = {}) {
    const search = new URLSearchParams();
    const previous = new URLSearchParams(String(currentSearch || '').replace(/^\?/, ''));
    search.set('tab', String(tabId || DEFAULT_ORG_TAB));
    for (const key of PRESERVED_QUERY_KEYS) {
        const value = previous.get(key);
        if (value) search.set(key, value);
    }
    if (params && typeof params === 'object') {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
        }
    }
    return `?${search.toString()}`;
}

export default resolveOrgRoute;