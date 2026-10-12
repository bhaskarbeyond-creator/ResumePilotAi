import { FiServer, FiUsers, FiHelpCircle } from 'react-icons/fi';
import { FaReceipt } from 'react-icons/fa';
import { searchPlatform } from '../../../services/platformApi';
import { matchSettingsCommands } from '../../cuba/portalCommands';
import { ALL_SETTINGS } from '../settings/settingsAccess';

/**
 * DIR-012 — live entity search for the platform admin command palette.
 *
 * WHY THIS FILE IS SEPARATE FROM `AdminCommandPalette.jsx`:
 *   The legacy palette owned the `searchPlatform` lookup, but under Cuba chrome —
 *   the DEFAULT shell — none of its three openers is mounted, so the lookup was
 *   dead code and admin fuzzy/live search was simply absent from the product.
 *   The Lead's ASK-2 decision was to extend the SHARED `CubaCommandPalette` with an
 *   optional provider rather than bolt a second palette onto the admin portal.
 *
 * WHY IT IS ALSO NOT IN `AdminPortalCuba.jsx`:
 *   That wrapper is guard-tested to issue no request of its own
 *   (`cuba-admin-console.test.mjs`: no `fetch(`, no `/api/`). The data mapping is
 *   behaviour, the wrapper is chrome; separating them keeps both invariants true
 *   at once instead of trading one for the other.
 *
 * SECURITY: this performs no authorization of its own. `searchPlatform` reaches
 * `GET /api/platform/search`, which projects tenants / users / orders / tickets
 * server-side from the caller's permissions and drops every category the caller
 * lacks. A hit the backend withheld can therefore never reach the DOM (§7).
 *
 * NO FABRICATED DATA: every field below is read from the live response. Missing
 * values render as empty strings; nothing is defaulted into a fake record.
 */

/** Below this length a lookup is noise, not signal. Mirrors the palette's own floor. */
export const ADMIN_ENTITY_SEARCH_MIN_LENGTH = 2;

/** `amount` is minor units (cents) on the wire; formatting here would duplicate the money model. */
const formatOrderAmount = (order) => {
    const parts = [];
    if (order.status) parts.push(order.status);
    if (order.currency) parts.push(order.currency);
    if (typeof order.amount === 'number') parts.push(String(order.amount / 100));
    return parts.join(' · ');
};

/**
 * Maps one `GET /api/platform/search` response into palette-shaped hits.
 * Pure and exported so it can be asserted in Node without a browser.
 */
export function mapPlatformSearchResult(result) {
    if (!result || typeof result !== 'object') return [];
    const hits = [];

    for (const tenant of result.tenants || []) {
        if (!tenant) continue;
        const name = tenant.displayName || tenant.slug || tenant.id;
        hits.push({
            id: `entity-tenant-${tenant.id}`,
            label: `Tenant: ${name}`,
            group: 'Platform records',
            to: `/admin/tenants?focus=${encodeURIComponent(tenant.id)}`,
            icon: FiServer,
        });
    }

    for (const user of result.users || []) {
        if (!user) continue;
        hits.push({
            id: `entity-user-${user.id}`,
            label: `User: ${user.email || user.id || ''}`,
            group: 'Platform records',
            to: '/admin/users',
            icon: FiUsers,
        });
    }

    for (const order of result.orders || []) {
        if (!order) continue;
        const detail = formatOrderAmount(order);
        hits.push({
            id: `entity-order-${order.id}`,
            label: `Order: ${order.id}${detail ? ` (${detail})` : ''}`,
            group: 'Platform records',
            to: '/admin/settings?tab=ordersManagement',
            icon: FaReceipt,
        });
    }

    for (const ticket of result.tickets || []) {
        if (!ticket) continue;
        hits.push({
            id: `entity-ticket-${ticket.id}`,
            // subject is operator-authored free text and may be absent; never invent one.
            label: `Ticket #${ticket.id}${ticket.subject ? `: ${ticket.subject}` : ''}`,
            group: 'Platform records',
            to: '/admin/help-desk',
            icon: FiHelpCircle,
        });
    }

    return hits;
}

/**
 * DIR-105 — Platform Settings panels as palette hits.
 *
 * The settings console puts 26+ panels behind a SINGLE `/admin/settings` route,
 * so the nav-model command builder cannot see them (one nav item, many panels).
 * This indexes the settings inventory itself, which is why the Ctrl+K palette can
 * now reach `Firebase Identity`, `Code Injection`, `Templates` and the rest.
 *
 * ENFORCEMENT IS NOT HERE. This is a search index, not a gate: a hit only carries
 * a `?tab=` deep link. If the caller is not entitled to that panel, `SettingsWrapper`
 * renders "Settings Access Restricted" exactly as it does for a hand-typed URL, and
 * the route's `RequireTabPerm` / the backend policy engine remain the authorities.
 * Indexing the full inventory is therefore not a bypass — it is a site map (§7).
 *
 * Pure and exported so it can be asserted in Node without a browser.
 */
export function settingsCommandHits(term, settings = ALL_SETTINGS) {
    return matchSettingsCommands(settings, term);
}

/**
 * The provider handed to `CubaCommandPalette`. Errors surface as "no entity hits".
 *
 * DIR-105: settings hits are resolved LOCALLY (they are static inventory, not a
 * network call) and lead the list, so a platform-search outage degrades to "no
 * record hits" instead of emptying the palette of settings too.
 */
export async function searchAdminEntities(term) {
    const settings = settingsCommandHits(term);

    let records = [];
    try {
        records = mapPlatformSearchResult(await searchPlatform(term));
    } catch {
        records = [];
    }

    return [...settings, ...records];
}

export default searchAdminEntities;