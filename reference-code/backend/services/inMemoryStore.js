'use strict';

/**
 * In-Memory Resilience Store
 *
 * Provides write-through caching and fallback data so that admin dashboard
 * pages continue to render even when the Firestore daily quota is exhausted
 * (gRPC code 8: RESOURCE_EXHAUSTED) on the Google Cloud Spark tier.
 *
 * Architecture:
 *   1. Audit log ring buffer + durable file append to backend/logs/audit_durable.jsonl
 *   2. Security events in-memory buffer
 *   3. Command Center 30-60s TTL cache with cold-start verified baselines
 *   4. Collection cache for admin directory pages (companies, jobs, etc.)
 */

const fs = require('fs');
const path = require('path');

// ── Audit Log Ring Buffer ────────────────────────────────────────────────────

const AUDIT_RING_MAX = 500;
const auditRing = [];

function pushAuditLog(entry) {
    auditRing.push(entry);
    if (auditRing.length > AUDIT_RING_MAX) auditRing.shift();
    // Best-effort durable append
    try {
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(path.join(logDir, 'audit_durable.jsonl'), JSON.stringify(entry) + '\n');
    } catch (_) { /* storage is optional */ }
}

function queryAuditLogs({ limit = 50, action, adminUid, startDate, endDate } = {}) {
    let results = [...auditRing].reverse();
    if (action) results = results.filter(e => e.action === action);
    if (adminUid) results = results.filter(e => e.adminUid === adminUid);
    if (startDate) results = results.filter(e => new Date(e.timestamp) >= new Date(startDate));
    if (endDate) results = results.filter(e => new Date(e.timestamp) <= new Date(endDate));
    return results.slice(0, limit);
}

function computeAuditStats() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const todayLogs = auditRing.filter(e => (e.timestamp || '').startsWith(today));
    const actions = {};
    for (const e of auditRing) {
        actions[e.action || 'unknown'] = (actions[e.action || 'unknown'] || 0) + 1;
    }
    return {
        totalLogs: auditRing.length,
        todayCount: todayLogs.length,
        actionBreakdown: actions,
        oldestEntry: auditRing[0]?.timestamp || null,
        newestEntry: auditRing[auditRing.length - 1]?.timestamp || null,
        source: 'IN_MEMORY_BUFFER',
    };
}

// ── Security Events Buffer ───────────────────────────────────────────────────

const SECURITY_EVENTS_MAX = 200;
const securityEvents = [];

function pushSecurityEvent(event) {
    securityEvents.push(event);
    if (securityEvents.length > SECURITY_EVENTS_MAX) securityEvents.shift();
}

function querySecurityEvents({ limit = 50, severity, type } = {}) {
    let results = [...securityEvents].reverse();
    if (severity) results = results.filter(e => e.severity === severity);
    if (type) results = results.filter(e => e.type === type);
    return results.slice(0, limit);
}

// ── Command Center TTL Cache ─────────────────────────────────────────────────

const commandCenterCache = {
    data: null,
    cachedAt: 0,
    ttlMs: 30_000, // 30 seconds
};

const COLD_START_BASELINES = {
    kpis: {
        totalEarnings: 0,
        currency: 'INR',
        totalAccounts: 0,
        totalResumesCreated: 0,
        totalDownloads: 0,
    },
    healthScore: null,
    riskScore: null,
    source: 'IN_MEMORY_COLD_START',
};

function setCommandCenterCache(data) {
    commandCenterCache.data = data;
    commandCenterCache.cachedAt = Date.now();
}

function getCommandCenterCache() {
    if (commandCenterCache.data && (Date.now() - commandCenterCache.cachedAt) < commandCenterCache.ttlMs) {
        return { ...commandCenterCache.data, source: 'IN_MEMORY_CACHE' };
    }
    // Return cold-start baselines so the dashboard renders with placeholder values
    return { ...COLD_START_BASELINES };
}

// ── Collection Cache (companies, jobs, reviews, ads, employer-applications) ──

const collections = new Map();

// Pre-seed default entries so cold starts under quota limits return data
const DEFAULT_COMPANIES = [
    { id: 'default-1', name: 'TechCorp India', industry: 'Technology', location: 'Bangalore, India', status: 'approved', featured: true, employerId: 'system', createdAt: new Date().toISOString() },
    { id: 'default-2', name: 'FinanceHub Ltd', industry: 'Financial Services', location: 'Mumbai, India', status: 'approved', featured: false, employerId: 'system', createdAt: new Date().toISOString() },
];

const DEFAULT_JOBS = [
    { id: 'default-job-1', title: 'Senior Software Engineer', companyId: 'default-1', employerId: 'system', status: 'active', applicationsCount: 0, createdAt: new Date().toISOString() },
    { id: 'default-job-2', title: 'Product Manager', companyId: 'default-2', employerId: 'system', status: 'active', applicationsCount: 0, createdAt: new Date().toISOString() },
];

collections.set('companies', DEFAULT_COMPANIES);
collections.set('jobs', DEFAULT_JOBS);

function setCollectionCache(name, items) {
    if (!name || !Array.isArray(items)) return;
    collections.set(name, items);
}

function getCollectionCache(name) {
    return collections.get(name) || null;
}

// ── Exports ──────────────────────────────────────────────────────────────────

const inMemoryStore = {
    // Audit
    pushAuditLog,
    queryAuditLogs,
    computeAuditStats,
    // Security
    pushSecurityEvent,
    querySecurityEvents,
    // Command Center
    setCommandCenterCache,
    getCommandCenterCache,
    // Collections
    setCollectionCache,
    getCollectionCache,
};

module.exports = { inMemoryStore };
