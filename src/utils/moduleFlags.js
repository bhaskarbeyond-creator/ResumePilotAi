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
    return resolveAtsScoreVisibility(settings);
}

export function isPortfolioModuleEnabled(settings) {
    return resolvePortfolioVisibility(settings);
}

/**
 * Distinguish a successful server configuration read from presentation-only
 * defaults or a previously fetched but now stale snapshot. Missing provenance
 * means the caller already has authoritative API data.
 */
export function isFallbackSettings(settings) {
    if (settings?._settingsStale === true) return true;
    return ['fallback', 'safe-defaults', 'stale-cache', 'cache', 'unavailable'].includes(settings?._settingsSource);
}

/**
 * Resolve ATS visibility for a settings payload.
 * Returns `null` when a partial modules patch omitted the flag so the
 * caller can keep the last known remote value instead of defaulting ON.
 */
export function resolveAtsScoreVisibility(settings, { allowMissingDefault = true } = {}) {
    // A fallback payload contains static default-ON values. It is not proof of the
    // remotely persisted flag, so it must fail closed before inspecting those values.
    if (isFallbackSettings(settings)) return false;

    const value = settings?.modules?.enableAtsScoreModule;
    if (value !== undefined) {
        return resolveEnabledFlag(value, true);
    }
    if (allowMissingDefault !== true) return null;
    // Missing is not affirmative authorization to expose ATS functionality.
    return false;
}

/**
 * Resolve Portfolio visibility for a settings payload.
 * Portfolios & Web CV is OFF by default.
 */
export function resolvePortfolioVisibility(settings, { allowMissingDefault = true } = {}) {
    if (isFallbackSettings(settings)) return false;

    const value = settings?.modules?.enablePortfolioModule;
    if (value !== undefined) {
        return resolveEnabledFlag(value, false);
    }
    if (allowMissingDefault !== true) return null;
    return false;
}

export function isMessagesModuleEnabled(settings) {
    return resolveMessagesVisibility(settings);
}

export function resolveMessagesVisibility(settings, { allowMissingDefault = true } = {}) {
    if (isFallbackSettings(settings)) return false;
    const value = settings?.modules?.enableMessagesModule;
    if (value !== undefined) {
        return resolveEnabledFlag(value, false);
    }
    if (allowMissingDefault !== true) return null;
    return false;
}

export function isJobTrackerModuleEnabled(settings) {
    return resolveJobTrackerVisibility(settings);
}

export function resolveJobTrackerVisibility(settings, { allowMissingDefault = true } = {}) {
    if (isFallbackSettings(settings)) return false;
    const value = settings?.modules?.enableJobTrackerModule;
    if (value !== undefined) {
        return resolveEnabledFlag(value, false);
    }
    if (allowMissingDefault !== true) return null;
    return false;
}

export function isAppliedJobsModuleEnabled(settings) {
    return resolveAppliedJobsVisibility(settings);
}

export function resolveAppliedJobsVisibility(settings, { allowMissingDefault = true } = {}) {
    if (isFallbackSettings(settings)) return false;
    const value = settings?.modules?.enableAppliedJobsModule;
    if (value !== undefined) {
        return resolveEnabledFlag(value, false);
    }
    if (allowMissingDefault !== true) return null;
    return false;
}

/**
 * Auto-save only the flag the administrator actually changed. Sending an
 * entire hydrated category from a stale tab can overwrite a newer sibling
 * flag even when the backend correctly performs an atomic merge.
 */
export function buildModuleSettingsPatch(nextConfig = {}, targetKey = null) {
    const source = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
    const patch = targetKey ? { [targetKey]: source[targetKey] } : { ...source };

    if (!targetKey || targetKey === 'enableLinkedinAuthModule') {
        patch.enableLinkedinLogin = source.enableLinkedinAuthModule;
    }
    if (!targetKey || targetKey === 'enableGithubAuthModule') {
        patch.enableGithubLogin = source.enableGithubAuthModule;
    }
    if (!targetKey || targetKey === 'enableBlogModule') {
        patch.blog = source.enableBlogModule;
    }
    return patch;
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
    const enabled = resolveEnabledFlag(enableAtsScoreModule, false);
    return {
        atsScoreChecker: enabled,
        optimizationMeter: enabled,
        sharedFlag: 'enableAtsScoreModule',
    };
}
