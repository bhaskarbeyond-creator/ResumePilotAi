'use strict';

/**
 * Dynamic model selection.
 *
 * Pipeline (each stage is recorded for explainability):
 *
 *   1. candidate enumeration   — configured models + provider-discovered models
 *                                (tenant-credential-scoped access) + provider
 *                                default seeds, per enabled provider
 *   2. hard eligibility gates  — tenant policy (allowed/restricted models),
 *                                credential access, fresh-catalog membership,
 *                                capability violations, context capacity,
 *                                runtime cooldowns, provider reachability
 *   3. requirement-fit scoring — verified capability evidence, latency tier,
 *                                tenant runtime health, cost (only when the
 *                                provider publishes reliable pricing; cost
 *                                NEVER overrides a capability requirement)
 *   4. deterministic ordering  — score, then operator provider order, then
 *                                stable model id; same inputs -> same output
 *
 * There are NO hardcoded model rankings. Explicit operator/tenant configuration
 * (a configured model, a primary provider, a tenant primaryModel policy) is the
 * strongest signal; discovery + runtime evidence adjust around it; a configured
 * model that the provider stops serving is dynamically demoted by health data.
 *
 * Last-resort rule: if every candidate is in cooldown, the one with the
 * earliest cooldown expiry is released (recovery is bounded and the decision
 * is flagged in telemetry). Routing must stay recoverable.
 */

const {
    CAP,
    evaluateCapability,
    evaluateContext,
    evaluateModalities,
    safeNumber,
} = require('./capabilityModel');

// Scoring weights. Deliberate, documented, and small: configuration intent and
// verified requirement fit dominate; runtime evidence refines; cost nudges.
const WEIGHTS = Object.freeze({
    configuredModel: 40,
    discoveredModel: 10,
    primaryProvider: 10,
    secondProvider: 5,
    verifiedStructuredOutput: 15,
    verifiedStreaming: 15,
    verifiedLongContext: 15,
    verifiedReasoning: 10,
    verifiedModalities: 10,
    healthMax: 20,
    latencyMax: 10,
    costMax: 5,
    tenantPrimaryModel: 50,
});

function computeProviderOrder(configuration) {
    const providers = configuration?.providers || {};
    const enabled = Object.keys(providers).filter(provider => providers[provider]?.enabled === true);
    if (!enabled.length) return [];
    const primary = enabled.includes(configuration.primary) ? configuration.primary : enabled[0];
    return configuration.enableFallback === false ? [primary] : [primary, ...enabled.filter(p => p !== primary)];
}

function modelStats(health, tenantId, provider, model, now) {
    if (!health || typeof health.stats !== 'function') return null;
    try {
        return health.stats({ tenantId, provider, model }, now);
    } catch {
        return null;
    }
}

function selectModels({
    configuration,
    requirement,
    catalog = null,                    // Map<providerId, { models: Map, fetchedAt, authoritative }>
    tenantAccess = null,               // Map<providerId, { modelIds: Set|null, credentialOk }>
    health = null,                     // HealthStore instance
    seedModels = null,                 // Map<providerId, modelId> (configuration seeds)
    isProviderUnreachable = null,      // (providerId) => boolean
    primaryModelPolicy = null,         // tenant policy primary model id
    now = null,
    latencyNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
} = {}) {
    const startedAt = latencyNow();
    const nowMs = now || Date.now();
    const tenantId = configuration?.tenantId || null;
    const tenantPolicy = configuration?.tenantPolicy || {};

    const allowedModels = Array.isArray(tenantPolicy.allowedModels) && tenantPolicy.allowedModels.length
        ? new Set(tenantPolicy.allowedModels.map(v => String(v).trim()).filter(Boolean))
        : null;
    const restrictedModels = Array.isArray(tenantPolicy.restrictedModels)
        ? new Set(tenantPolicy.restrictedModels.map(v => String(v).trim()).filter(Boolean))
        : new Set();
    // Explicit parameter wins; fall back to the tenant policy on the
    // configuration so direct callers pass the policy in one place.
    if (!primaryModelPolicy && tenantPolicy.primaryModel) primaryModelPolicy = String(tenantPolicy.primaryModel);

    const providerOrder = computeProviderOrder(configuration);
    const candidates = [];
    const push = (candidate) => { candidates.push(candidate); };

    for (const provider of providerOrder) {
        const providerConfig = configuration?.providers?.[provider] || {};
        if (providerConfig.enabled !== true || !providerConfig.key) {
            // Disabled or credential-less providers contribute no candidates.
            push({ provider, model: null, eligible: false, origin: null, score: 0, reasons: [], rejectionReason: 'provider-disabled' });
            continue;
        }
        if (typeof isProviderUnreachable === 'function' && isProviderUnreachable(provider)) {
            push({ provider, model: null, eligible: false, origin: null, score: 0, reasons: [], rejectionReason: 'provider-unreachable' });
            continue;
        }

        const providerCatalog = catalog && typeof catalog.get === 'function' ? catalog.get(provider) : (catalog ? catalog[provider] : null);
        const catalogModels = providerCatalog?.models || null;
        const catalogAuthoritative = Boolean(providerCatalog?.authoritative);

        const providerAccess = tenantAccess && typeof tenantAccess.get === 'function' ? tenantAccess.get(provider) : (tenantAccess ? tenantAccess[provider] : null);
        const accessModelIds = providerAccess?.modelIds || null;
        const credentialRejected = providerAccess?.credentialOk === 'rejected';

        // Enumerate candidate models for this provider.
        const enumerated = new Map(); // modelId -> { origin, caps }
        const rawModel = String(providerConfig.model || '').trim();
        const isAuto = rawModel.toLowerCase() === 'auto' || rawModel.toLowerCase() === 'dynamic';
        const configuredModel = isAuto ? '' : rawModel;
        if (configuredModel) enumerated.set(configuredModel, { origin: 'configured', caps: null });

        if (catalogModels) {
            for (const [modelId, caps] of catalogModels) {
                const existing = enumerated.get(modelId);
                if (existing) { existing.caps = caps || existing.caps; continue; }
                if (credentialRejected) continue;               // credential failed: discovery-only models are unproven
                if (accessModelIds && !accessModelIds.has(modelId)) continue; // tenant's credential cannot access this model
                enumerated.set(modelId, { origin: 'discovered', caps });
            }
        }

        // The adapter's default model is a CONFIGURATION SEED ONLY: it fills in
        // the provider's model when the operator/tenant configured none and
        // discovery found nothing. It must never add a second candidate next to
        // an operator-configured or discovered model.
        const seed = seedModels && typeof seedModels.get === 'function' ? seedModels.get(provider) : (seedModels ? seedModels[provider] : null);
        if (enumerated.size === 0 && seed && !credentialRejected) {
            enumerated.set(seed, { origin: 'seed', caps: catalogModels?.get ? catalogModels.get(seed) || null : null });
        }

        for (const [model, meta] of enumerated) {
            const reasons = [];
            let rejectionReason = null;

            const gate = (ok, passNote, failNote, failReason) => {
                if (ok) { if (passNote) reasons.push(passNote); return true; }
                reasons.push(failNote);
                rejectionReason = failReason;
                return false;
            };

            // G1: tenant model allowlist (governance data, not routing intelligence).
            if (allowedModels && !allowedModels.has(model)) {
                push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: ['tenant-model-allowlist'], rejectionReason: 'tenant-model-allowlist' });
                continue;
            }
            // G2: tenant restricted models (denylist).
            if (restrictedModels.has(model)) {
                push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: ['tenant-model-restricted'], rejectionReason: 'tenant-model-restricted' });
                continue;
            }
            // G3: fresh catalog says this model no longer exists (dynamic retirement).
            // Only operator-configured models are exempt (operator's explicit
            // choice; runtime health will demote them if the provider rejects).
            if (catalogAuthoritative && catalogModels && !catalogModels.has(model) && meta.origin !== 'configured') {
                push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: ['not-in-fresh-catalog'], rejectionReason: 'not-in-fresh-catalog' });
                continue;
            }

            const caps = meta.caps;
            const capsObj = caps ? caps.capabilities : null;

            // G4: capability hard gates (explicit 'no' rejects; unknown = unverified).
            if (requirement.structuredOutput) {
                const result = evaluateCapability(true, capsObj?.structuredOutput);
                if (result.status === 'violated') {
                    push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: ['capability-structured-output:no'], rejectionReason: 'capability-structured-output' });
                    continue;
                }
                if (result.status === 'verified') reasons.push('capability-structured-output:verified');
                else if (result.status === 'unverified') reasons.push('capability-structured-output:unverified');
            }
            if (requirement.streaming) {
                const result = evaluateCapability(true, capsObj?.streaming);
                if (result.status === 'violated') {
                    push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: ['capability-streaming:no'], rejectionReason: 'capability-streaming' });
                    continue;
                }
                if (result.status === 'verified') reasons.push('capability-streaming:verified');
                else if (result.status === 'unverified') reasons.push('capability-streaming:unverified');
            }
            if (requirement.reasoningRequired) {
                const result = evaluateCapability(true, capsObj?.reasoning);
                if (result.status === 'violated') {
                    push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: ['capability-reasoning:no'], rejectionReason: 'capability-reasoning' });
                    continue;
                }
                if (result.status === 'verified') reasons.push('capability-reasoning:verified');
            }
            // G5: modalities.
            if (requirement.modalities && requirement.modalities.length) {
                const result = evaluateModalities(requirement.modalities, caps?.modalities);
                if (result.status === 'violated') {
                    push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: [`capability-modalities:missing-${result.missing.join(',')}`], rejectionReason: 'capability-modalities' });
                    continue;
                }
                if (result.status === 'verified') reasons.push('capability-modalities:verified');
                else if (result.status === 'unverified') reasons.push('capability-modalities:unverified');
            }
            // G6: context capacity.
            const context = evaluateContext(requirement.requiredTokens, caps?.maxInputTokens);
            if (context.status === 'violated') {
                push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: ['context-capacity:insufficient'], rejectionReason: 'context-capacity' });
                continue;
            }
            if (context.status === 'unverified-long-context') {
                push({ provider, model, eligible: false, origin: meta.origin, score: 0, reasons: ['context-capacity:unverified-long'], rejectionReason: 'context-capacity-unverified-long' });
                continue;
            }
            if (context.status === 'verified') reasons.push('context-capacity:verified');
            else if (context.status === 'unverified') reasons.push('context-capacity:unverified');

            // G7: runtime health (tenant-scoped cooldowns).
            const stats = modelStats(health, tenantId, provider, model, nowMs);
            if (stats) {
                const kind = stats.modelUnavailableUntil > nowMs ? 'model-unavailable'
                    : stats.rateLimitedUntil > nowMs ? 'rate-limited'
                        : stats.cooldownUntil > nowMs ? 'failure-backoff' : null;
                if (kind) {
                    push({
                        provider, model, eligible: false, origin: meta.origin, score: 0,
                        reasons: [`health:${kind}`],
                        rejectionReason: `health-${kind}`,
                        cooldownExpiry: kind === 'model-unavailable' ? stats.modelUnavailableUntil : kind === 'rate-limited' ? stats.rateLimitedUntil : stats.cooldownUntil,
                    });
                    continue;
                }
                if (stats.sampleSize >= 3) reasons.push(`health:success-rate-${Math.round((stats.successRate || 0) * 100)}pct`);
            }

            push({
                provider, model, eligible: true, origin: meta.origin, score: 0, reasons,
                caps, stats,
                contextStatus: context.status,
            });
        }
    }

    // Score eligible candidates.
    const eligible = candidates.filter(c => c.eligible);
    const orderIndex = new Map(providerOrder.map((provider, index) => [provider, index]));
    const providerModels = new Map();
    for (const c of eligible) {
        if (!providerModels.has(c.provider)) providerModels.set(c.provider, []);
        providerModels.get(c.provider).push(c);
    }

    for (const c of eligible) {
        let score = 0;
        if (c.origin === 'configured') { score += WEIGHTS.configuredModel; c.reasons.push('rank:configured-model'); }
        else if (c.origin === 'discovered') { score += WEIGHTS.discoveredModel; c.reasons.push('rank:discovered-model'); }
        else c.reasons.push('rank:provider-default-seed');

        if (c.provider === configuration.primary) { score += WEIGHTS.primaryProvider; c.reasons.push('rank:primary-provider'); }
        else if (orderIndex.get(c.provider) === 1) { score += WEIGHTS.secondProvider; c.reasons.push('rank:secondary-provider'); }

        if (requirement.structuredOutput && c.caps?.capabilities?.structuredOutput === CAP.YES) { score += WEIGHTS.verifiedStructuredOutput; c.reasons.push('rank:verified-structured-output'); }
        if (requirement.streaming && c.caps?.capabilities?.streaming === CAP.YES) { score += WEIGHTS.verifiedStreaming; c.reasons.push('rank:verified-streaming'); }
        if (requirement.longContextRequired && c.contextStatus === 'verified') { score += WEIGHTS.verifiedLongContext; c.reasons.push('rank:verified-long-context'); }
        if (requirement.qualityTier === 'premium' && c.caps?.capabilities?.reasoning === CAP.YES) { score += WEIGHTS.verifiedReasoning; c.reasons.push('rank:verified-reasoning'); }
        if (requirement.modalities?.length && c.caps?.modalities?.length) { score += WEIGHTS.verifiedModalities; c.reasons.push('rank:verified-modalities'); }

        // Tenant runtime evidence (only when the sample is meaningful).
        const stats = c.stats;
        if (stats && stats.sampleSize >= 3 && Number.isFinite(stats.successRate)) {
            score += Math.round(stats.successRate * WEIGHTS.healthMax);
            c.reasons.push(`rank:health-success-${Math.round(stats.successRate * 100)}pct`);
            const latencyScore = latencyScoreFor(requirement, stats);
            score += latencyScore;
            c.reasons.push(`rank:latency-p50-${stats.p50LatencyMs ?? 'n/a'}ms`);
        }

        // Cost nudge — only when the provider publishes pricing; never gates.
        const costScore = costScoreFor(requirement, c, providerModels);
        if (costScore !== 0) {
            score += costScore;
            c.reasons.push(costScore > 0 ? 'rank:cost-efficient' : 'rank:cost-premium');
        }

        const cleanPolicy = String(primaryModelPolicy || '').trim().toLowerCase();
        if (primaryModelPolicy && !['auto', 'dynamic'].includes(cleanPolicy) && c.model === String(primaryModelPolicy).trim()) {
            score += WEIGHTS.tenantPrimaryModel;
            c.reasons.push('rank:tenant-primary-model');
        }
        c.score = score;
    }

    // Deterministic order: score desc -> provider order asc -> model id asc.
    eligible.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const pa = orderIndex.get(a.provider) ?? Number.MAX_SAFE_INTEGER;
        const pb = orderIndex.get(b.provider) ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return a.model < b.model ? -1 : a.model > b.model ? 1 : 0;
    });

    // Last-resort recovery: all candidates in a TRANSIENT cooldown
    // (rate-limited / failure-backoff) -> release the earliest-expiring one so
    // routing stays recoverable. model-unavailable blocks are NOT released:
    // the provider explicitly rejected the model (404/retired) for this
    // tenant, and retrying immediately would only repeat the failure.
    let lastResort = false;
    let order = eligible.map(c => ({ provider: c.provider, model: c.model }));
    if (order.length === 0) {
        const cooldowned = candidates
            .filter(c => !c.eligible && c.cooldownExpiry
                && (c.rejectionReason === 'health-rate-limited' || c.rejectionReason === 'health-failure-backoff'))
            .sort((a, b) => a.cooldownExpiry - b.cooldownExpiry);
        if (cooldowned.length) {
            const chosen = cooldowned[0];
            order = [{ provider: chosen.provider, model: chosen.model }];
            lastResort = true;
            chosen.reasons.push('rank:last-resort-cooldown-release');
        }
    }

    const selectionLatencyMs = Math.max(0, latencyNow() - startedAt);
    const rationale = order.length
        ? `selected ${order[0].provider}/${order[0].model} (score ${eligible[0]?.score ?? 0}: ${[...(eligible[0]?.reasons || [])].slice(0, 8).join(', ')}${lastResort ? ', last-resort cooldown release' : ''}); ${eligible.length} eligible of ${candidates.length} candidates`
        : `no eligible candidate: ${candidates.filter(c => c.rejectionReason).map(c => `${c.provider}/${c.model || '-'}:${c.rejectionReason}`).join('; ') || 'no providers enabled'}`;

    return {
        decisionId: `sel-${nowMs.toString(36)}-${Math.floor(Math.random() * 46655).toString(36)}`,
        candidates: candidates.map(c => ({
            provider: c.provider,
            model: c.model,
            eligible: c.eligible,
            origin: c.origin,
            score: c.score || 0,
            reasons: c.reasons,
            rejectionReason: c.rejectionReason || null,
        })),
        order,
        selection: order[0] || null,
        eligibleCount: eligible.length,
        rejectedCount: candidates.length - eligible.length,
        lastResort,
        selectionLatencyMs,
        rationale,
    };
}

function latencyScoreFor(requirement, stats) {
    if (stats.p50LatencyMs === null || stats.p50LatencyMs === undefined) return requirement.latencySensitivity === 'high' ? 3 : 1;
    const p50 = stats.p50LatencyMs;
    if (requirement.latencySensitivity === 'high') {
        if (p50 <= 1500) return WEIGHTS.latencyMax;
        if (p50 <= 4000) return Math.round(WEIGHTS.latencyMax * 0.6);
        if (p50 <= 8000) return Math.round(WEIGHTS.latencyMax * 0.25);
        return 0;
    }
    if (p50 <= 8000) return 4;
    if (p50 <= 20000) return 2;
    return 0;
}

function costScoreFor(requirement, candidate, providerModels) {
    const pricing = candidate.caps?.pricing;
    if (!pricing) return 0;
    const total = (pricing.inputPerMtok || 0) + (pricing.outputPerMtok || 0);
    if (!total) return 0;
    const siblings = (providerModels.get(candidate.provider) || []).filter(c => c.caps?.pricing);
    if (siblings.length < 2) return 0;
    const totals = siblings.map(c => (c.caps.pricing.inputPerMtok || 0) + (c.caps.pricing.outputPerMtok || 0)).filter(Boolean);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    if (max === min) return 0;
    const position = (total - min) / (max - min); // 0 = cheapest, 1 = most expensive
    // Cost may nudge within a provider, never across capability gates.
    if (requirement.qualityTier === 'standard' || requirement.qualityTier === 'enhanced') {
        return position <= 0.25 ? WEIGHTS.costMax : 0;
    }
    if (requirement.qualityTier === 'premium') {
        return position >= 0.75 ? WEIGHTS.costMax : 0;
    }
    return 0;
}

module.exports = { WEIGHTS, computeProviderOrder, selectModels };
