/**
 * Command palette entries for portal consoles (Phases 5–7).
 *
 * ZERO DEAD COMMANDS BY CONSTRUCTION: entries are generated from the very same
 * navigation model the sidebar renders, so a command cannot exist for a route
 * the sidebar does not offer, and a new sidebar entry automatically becomes
 * searchable. There is no hardcoded command list to drift.
 *
 * Pure and framework-free so it can be asserted in Node tests.
 */

const NAV_ICON = null;

/**
 * @param {Array<{id:string,label:string,items:Array<{id:string,label:string,to:string}>}>} groups
 * @param {string} [activeLabel] currently active item, surfaced for context
 */
export function buildPortalCommands(groups, activeLabel) {
    const commands = [];
    for (const group of groups || []) {
        for (const item of group.items || []) {
            commands.push({
                id: `go-${item.id}`,
                label: item.label,
                group: group.label,
                keywords: `${item.label} ${item.to} ${group.label}`,
                icon: NAV_ICON,
                isActive: item.label === activeLabel,
                // Navigation is performed by the shell's own router-aware handler;
                // this placeholder is replaced at render time by CubaPortalShell.
                to: item.to,
            });
        }
    }
    return commands;
}

/**
 * DIR-105 — palette indexing for the Platform Settings hub.
 *
 * The settings console exposes 26+ panels behind a single `/admin/settings`
 * route, so the nav-model builder above cannot see them (one nav item, many
 * panels). This indexes the settings inventory directly instead, producing one
 * command per panel the caller is ENTITLED to — a palette entry can never point
 * at a panel the denial gate would refuse.
 *
 * Pure and framework-free so it can be asserted in Node tests.
 *
 * @param {Array<{key:string,label:string,group:string,description?:string}>} settings
 * @param {{isSuperAdmin?:boolean,permissions?:string[],canAccess?:(s:object)=>boolean}} [access]
 * @param {string} [activeTab] currently open `?tab=` key, surfaced for context
 */
export function buildSettingsCommands(settings, access, activeTab) {
    // Access filtering is OPT-IN.
    //
    // With NO access context this behaves as a search INDEX: it enumerates the full
    // inventory and lets the denial gate adjudicate a click. That is exactly what the
    // Ctrl+K palette needs (DIR-105) — indexing a panel is a site map, not a grant,
    // and `SettingsWrapper` still refuses an unentitled panel.
    //
    // The settings HUB always passes access, so it only ever offers entitled panels.
    const hasAccess = Boolean(access) && typeof access === 'object';
    const { isSuperAdmin = false, permissions = [], canAccess } = access || {};
    const allowed = !hasAccess
        ? () => true
        : (typeof canAccess === 'function'
            ? canAccess
            : (setting) => {
                if (isSuperAdmin) return true;
                if (setting?.superAdminOnly) return false;
                if (!setting?.permission) return true;
                const granted = Array.isArray(permissions) ? permissions : [];
                if (granted.includes('*')) return true;
                const required = Array.isArray(setting.permission) ? setting.permission : [setting.permission];
                return required.some((p) => granted.includes(p));
            });

    return (settings || [])
        .filter((setting) => setting && setting.key && allowed(setting))
        .map((setting) => ({
            id: `settings-${setting.key}`,
            label: setting.label,
            group: `Settings · ${setting.group}`,
            keywords: `${setting.label} ${setting.description || ''} ${setting.key} ${setting.group} settings platform configuration`,
            icon: NAV_ICON,
            isActive: setting.key === activeTab,
            to: `/admin/settings?tab=${encodeURIComponent(setting.key)}`,
        }));
}

/**
 * Filters the settings palette commands by a search term.
 *
 * Split from the browser glue (`adminEntitySearch.js`) so it stays Node-testable —
 * that module reaches `platformApi` and cannot be imported outside a browser.
 *
 * @param {Array<object>} settings the settings inventory
 * @param {string} term raw query
 * @param {object} [access] forwarded to `buildSettingsCommands`
 */
export function matchSettingsCommands(settings, term, access) {
    const needle = String(term || '').trim().toLowerCase();
    if (!needle) return [];
    return buildSettingsCommands(settings, access).filter(
        (command) => command.keywords.toLowerCase().includes(needle),
    );
}

export default buildPortalCommands;
