'use strict';

/**
 * Actionable dual-database alerts. Failures are recorded, never swallowed.
 * Consumers (logs, health, operators) subscribe via `onAlert`.
 */

const ALERT_TYPES = Object.freeze({
    PRIMARY_FAILURE: 'PRIMARY_FAILURE',
    AUTOMATIC_FAILOVER: 'AUTOMATIC_FAILOVER',
    PROLONGED_FALLBACK: 'PROLONGED_FALLBACK',
    QUEUE_BACKLOG: 'QUEUE_BACKLOG',
    DEAD_LETTER: 'DEAD_LETTER',
    CONFLICT: 'CONFLICT',
    RECONCILIATION_FAILURE: 'RECONCILIATION_FAILURE',
    REPEATED_DB_FAILURE: 'REPEATED_DB_FAILURE',
    STALE_DATA: 'STALE_DATA',
    SPLIT_BRAIN_PREVENTION: 'SPLIT_BRAIN_PREVENTION',
    BOTH_UNAVAILABLE: 'BOTH_UNAVAILABLE',
    OUTBOX_UNAVAILABLE: 'OUTBOX_UNAVAILABLE',
    PAYMENT_ACTIVATION_PARTIAL: 'PAYMENT_ACTIVATION_PARTIAL',
});

const listeners = new Set();
const recent = [];
const MAX_RECENT = 200;

function emitAlert(type, payload = {}) {
    const alert = {
        type,
        severity: payload.severity || defaultSeverity(type),
        at: new Date().toISOString(),
        ...payload,
    };
    recent.push(alert);
    if (recent.length > MAX_RECENT) recent.shift();
    for (const fn of listeners) {
        try { fn(alert); } catch { /* observers must not break alerting */ }
    }
    const line = `[DB-ALERT] ${alert.severity} ${alert.type} ${payload.message || payload.reason || ''}`.trim();
    if (alert.severity === 'CRITICAL') console.error(line);
    else console.warn(line);
    return alert;
}

function defaultSeverity(type) {
    if (type === ALERT_TYPES.BOTH_UNAVAILABLE || type === ALERT_TYPES.SPLIT_BRAIN_PREVENTION) return 'CRITICAL';
    if (type === ALERT_TYPES.AUTOMATIC_FAILOVER || type === ALERT_TYPES.CONFLICT || type === ALERT_TYPES.DEAD_LETTER) return 'HIGH';
    return 'MEDIUM';
}

function onAlert(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function recentAlerts(limit = 50) {
    return recent.slice(-limit);
}

function __resetForTests() {
    recent.length = 0;
    listeners.clear();
}

module.exports = {
    ALERT_TYPES,
    emitAlert,
    onAlert,
    recentAlerts,
    __resetForTests,
};
