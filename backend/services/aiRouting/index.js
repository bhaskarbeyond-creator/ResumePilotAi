'use strict';

/**
 * Dynamic AI model selection & provider orchestration — public API.
 *
 *   request
 *     -> tenant resolution            (routes: resolveEffectiveAiConfiguration)
 *     -> BYOK/provider resolution     (enterprise/tenantAi: applyTenantAiPolicy)
 *     -> requirement analysis         (requirementProfiles)
 *     -> capability discovery state   (discoveryService: cached catalog +
 *                                      tenant-credential-scoped model access)
 *     -> eligibility + selection      (modelSelector: explainable decision)
 *     -> execution                    (orchestrator via provider adapters,
 *                                      tenant's credential only)
 *     -> validation                   (aiRuntime.parseAiResponse — unchanged)
 *     -> telemetry                    (routingTelemetry + tenant audit events)
 */

const {
    CAP,
    LONG_CONTEXT_SAFE_TOKENS,
    MODEL_ID_PATTERN,
    evaluateCapability,
    evaluateContext,
    evaluateModalities,
    estimatePromptTokens,
    isValidModelId,
    normalizeModalities,
    normalizeModelCapabilities,
    normalizeModelRecord,
} = require('./capabilityModel');
const {
    ProviderRequestError,
    appIdentityHeaders,
    extractProviderErrorMessage,
    getAdapter,
    geminiAdapter,
    listAdapterIds,
    openAiCompatibleAdapter,
    registerProviderAdapter,
} = require('./providerAdapters');
const { fetchWithDeadline, parseRetryAfterMs } = require('./httpDeadline');
const { DiscoveryService, LruMap, DEFAULTS: DISCOVERY_DEFAULTS } = require('./discoveryService');
const { HealthStore, DEFAULTS: HEALTH_DEFAULTS } = require('./healthStore');
const { PROFILES, DEFAULT_PROFILE, deriveRequirementProfile } = require('./requirementProfiles');
const { WEIGHTS, computeProviderOrder, selectModels } = require('./modelSelector');
const { RoutingTelemetry, redactSecrets } = require('./routingTelemetry');
const { AiModelRouter, classifyProviderError, classifyThrownError, LATENCY_CRITICAL_OPERATIONS } = require('./orchestrator');

function createAiModelRouter(options = {}) {
    const discovery = options.discovery ?? new DiscoveryService(options);
    const health = options.health ?? new HealthStore(options);
    const telemetry = options.telemetry ?? new RoutingTelemetry({ maxEntries: options.telemetryMaxEntries });
    return new AiModelRouter({
        now: options.now,
        discovery,
        health,
        telemetry,
        autoDiscovery: options.autoDiscovery === true,
        discoveryTimeoutMs: options.discoveryTimeoutMs,
        maxStalenessMs: options.maxStalenessMs,
        log: options.log,
    });
}

module.exports = {
    // capability model
    CAP,
    LONG_CONTEXT_SAFE_TOKENS,
    MODEL_ID_PATTERN,
    evaluateCapability,
    evaluateContext,
    evaluateModalities,
    estimatePromptTokens,
    isValidModelId,
    normalizeModalities,
    normalizeModelCapabilities,
    normalizeModelRecord,
    // provider adapters
    ProviderRequestError,
    appIdentityHeaders,
    extractProviderErrorMessage,
    getAdapter,
    geminiAdapter,
    listAdapterIds,
    openAiCompatibleAdapter,
    registerProviderAdapter,
    // http
    fetchWithDeadline,
    parseRetryAfterMs,
    // services
    DiscoveryService,
    LruMap,
    DISCOVERY_DEFAULTS,
    HealthStore,
    HEALTH_DEFAULTS,
    RoutingTelemetry,
    redactSecrets,
    // selection
    PROFILES,
    DEFAULT_PROFILE,
    deriveRequirementProfile,
    WEIGHTS,
    computeProviderOrder,
    selectModels,
    // orchestration
    AiModelRouter,
    classifyProviderError,
    classifyThrownError,
    LATENCY_CRITICAL_OPERATIONS,
    createAiModelRouter,
};
