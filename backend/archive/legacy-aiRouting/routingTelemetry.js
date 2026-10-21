'use strict';

/**
 * Safe routing telemetry.
 *
 * Records ONLY safe, explainable routing facts:
 *   which provider/model was selected, why (reasons + rejection reasons),
 *   fallback/retry counts, selection and execution latency, outcome class.
 *
 * It NEVER records:
 *   - API keys or credentials (secret patterns are redacted defensively)
 *   - prompts, generated content, candidate PII, or resume data
 *
 * Entries are tenant-scoped: a query for tenant X returns X's entries (or the
 * platform scope); one tenant can never read another tenant's routing history.
 * Bounded in memory (ring buffer).
 */

const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,150}$/;

const SECRET_PATTERNS = [
    /\bsk-[A-Za-z0-9_-]{8,}\b/g,
    /\bsk-or-v1-[A-Za-z0-9_-]{8,}\b/g,
    /\bgsk_[A-Za-z0-9]{8,}\b/g,
    /\bAIza[0-9A-Za-z_-]{10,}\b/g,
    /\bnvapi-[A-Za-z0-9._-]{8,}\b/g,
    /\bbearer\s+[A-Za-z0-9._-]{8,}/gi,
    /api[_-]?key["'\s:=]+[A-Za-z0-9._-]{8,}/gi,
];

function redactSecrets(value) {
    let text = String(value ?? '');
    for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[REDACTED]');
    return text.slice(0, 500);
}

function safeString(value, max = 128) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!text) return null;
    return redactSecrets(text).slice(0, max);
}

function safeModelId(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    return MODEL_ID_PATTERN.test(text) ? text : text.slice(0, 150).replace(/[^\w.:/-]/g, '_');
}

function safeReasons(reasons) {
    if (!Array.isArray(reasons)) return [];
    return reasons
        .map(r => safeString(r, 64))
        .filter(Boolean)
        .slice(0, 16);
}

class RoutingTelemetry {
    constructor({ maxEntries = 500, now = Date.now() } = {}) {
        this.maxEntries = Math.max(10, maxEntries);
        this.now = now;
        this.entries = [];
    }

    record(entry = {}) {
        const ts = Number.isFinite(entry.ts) ? entry.ts : this.now();
        const record = {
            ts,
            tenantId: entry.tenantId ? String(entry.tenantId) : 'platform',
            operation: safeString(entry.operation, 64),
            selectedProvider: safeString(entry.selectedProvider, 64),
            selectedModel: safeModelId(entry.selectedModel),
            fallbackProvider: safeString(entry.fallbackProvider, 64),
            fallbackModel: safeModelId(entry.fallbackModel),
            outcome: entry.outcome === 'success' || entry.outcome === 'aborted' ? entry.outcome : 'failure',
            errorClass: safeString(entry.errorClass, 32),
            errorCode: safeString(entry.errorCode, 48),
            fallbackCount: Math.min(99, Math.max(0, Number(entry.fallbackCount) || 0)),
            attempts: Math.min(99, Math.max(0, Number(entry.attempts) || 0)),
            selectionLatencyMs: Math.min(99999, Math.max(0, Math.round(Number(entry.selectionLatencyMs) || 0))),
            executionLatencyMs: Math.min(99999, Math.max(0, Math.round(Number(entry.executionLatencyMs) || 0))),
            candidatesConsidered: Math.min(999, Math.max(0, Number(entry.candidatesConsidered) || 0)),
            candidatesRejected: Math.min(999, Math.max(0, Number(entry.candidatesRejected) || 0)),
            lastResort: entry.lastResort === true,
            decisionId: safeString(entry.decisionId, 64),
            selectionReasons: safeReasons(entry.selectionReasons),
            rejectionSummary: safeString(entry.rejectionSummary, 300),
        };
        this.entries.push(record);
        if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
        return record;
    }

    /**
     * Tenant-scoped query. `tenantId` null/undefined returns the PLATFORM
     * scope only — callers must never be able to enumerate other tenants'
     * entries by passing nothing.
     */
    query({ tenantId = null, limit = 100, sinceMs = 0 } = {}) {
        const scope = tenantId ? String(tenantId) : 'platform';
        const maxLimit = Math.min(Math.max(1, Number(limit) || 100), 1000);
        const since = Math.max(0, Number(sinceMs) || 0);
        return this.entries
            .filter(e => e.tenantId === scope && e.ts >= since)
            .slice(-maxLimit)
            .reverse()
            .map(e => ({ ...e }));
    }

    /** Aggregates for ONE tenant scope (observability, no secrets). */
    stats({ tenantId = null } = {}) {
        const scope = tenantId ? String(tenantId) : 'platform';
        const entries = this.entries.filter(e => e.tenantId === scope);
        const byOutcome = { success: 0, failure: 0, aborted: 0 };
        const byModel = new Map();
        for (const entry of entries) {
            byOutcome[entry.outcome] = (byOutcome[entry.outcome] || 0) + 1;
            if (entry.selectedModel) {
                const current = byModel.get(entry.selectedModel) || { success: 0, failure: 0, fallbacks: 0, totalExecutionMs: 0, samples: 0 };
                current[entry.outcome === 'success' ? 'success' : 'failure'] += 1;
                current.fallbacks += entry.fallbackCount;
                current.totalExecutionMs += entry.executionLatencyMs;
                current.samples += 1;
                byModel.set(entry.selectedModel, current);
            }
        }
        return {
            total: entries.length,
            byOutcome,
            byModel: Object.fromEntries([...byModel.entries()].map(([model, v]) => [model, {
                ...v,
                avgExecutionMs: v.samples ? Math.round(v.totalExecutionMs / v.samples) : 0,
            }])),
        };
    }

    clear() {
        this.entries = [];
    }
}

module.exports = { RoutingTelemetry, redactSecrets };
