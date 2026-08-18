/**
 * Shared module-flag helpers.
 *
 * Explicit `false` must never become `true` because of JavaScript truthiness
 * or default-object merges. Only an explicit `true` enables a default-ON flag
 * once a stored value is present.
 */
export function resolveEnabledFlag(value, defaultEnabled = true) {
    if (value === undefined) return defaultEnabled === true;
    return value === true;
}

export function isAtsScoreModuleEnabled(settings) {
    return resolveEnabledFlag(settings?.modules?.enableAtsScoreModule, true);
}

/**
 * Distinguish a successful Firestore/public_config read from the static
 * default-ON fallback. Missing `_settingsSource` means the caller already
 * has remote document data (for example a public_config snapshot).
 */
export function isFallbackSettings(settings) {
    return settings?._settingsSource === 'fallback';
}

/**
 * Resolve ATS visibility for a settings payload.
 * Returns `null` when a partial modules patch omitted the flag so the
 * caller can keep the last known remote value instead of defaulting ON.
 */
export function resolveAtsScoreVisibility(settings, { allowMissingDefault = true } = {}) {
    if (isFallbackSettings(settings)) return false;
    const value = settings?.modules?.enableAtsScoreModule;
    if (value === undefined && allowMissingDefault !== true) return null;
    return resolveEnabledFlag(value, true);
}

export function mergeSettingsCategory(defaults = {}, ...layers) {
    const merged = { ...(defaults && typeof defaults === 'object' ? defaults : {}) };
    for (const layer of layers) {
        if (!layer || typeof layer !== 'object' || Array.isArray(layer)) continue;
        Object.assign(merged, layer);
    }
    return merged;
}

export function evaluateAtsVisibilityMatrix(enableAtsScoreModule) {
    const enabled = resolveEnabledFlag(enableAtsScoreModule, true);
    return {
        atsScoreChecker: enabled,
        optimizationMeter: enabled,
        sharedFlag: 'enableAtsScoreModule',
    };
}
