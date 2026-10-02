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

export default buildPortalCommands;
