'use strict';

/**
 * Merge an incoming admin-settings category with the currently persisted
 * document so a partial write cannot drop sibling flags.
 *
 * Explicit `false` in either layer is preserved by object spread.
 */
function mergeAdminSettingCategory(current, next) {
    const previous = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    const incoming = next && typeof next === 'object' && !Array.isArray(next) ? next : {};
    return { ...previous, ...incoming };
}

module.exports = { mergeAdminSettingCategory };
