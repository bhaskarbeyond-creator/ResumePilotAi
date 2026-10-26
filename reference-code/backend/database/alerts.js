'use strict';

/**
 * Actionable consistency alerts for the MariaDB application-data plane and
 * retained Firebase identity plane. Failures are recorded, never swallowed.
 * Consumers (logs, health, operators) subscribe via `onAlert`.
 */

const ALERT_TYPES = Object.freeze({
    ACCOUNT_IDENTITY_PENDING: 'ACCOUNT_IDENTITY_PENDING',
    IDENTITY_PROVISIONING_PARTIAL: 'IDENTITY_PROVISIONING_PARTIAL',
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
    if (type === ALERT_TYPES.IDENTITY_PROVISIONING_PARTIAL) return 'HIGH';
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
