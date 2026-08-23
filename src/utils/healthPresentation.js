/**
 * Presentation vocabulary for the Platform Health console.
 *
 * The backend is the single source of truth for state. This module only maps a
 * backend state onto Enterprise design-system tone tokens and human labels —
 * it never invents, defaults, or upgrades a state.
 */

export const HEALTH_STATES = Object.freeze({
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  DISABLED: 'DISABLED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  UNKNOWN: 'UNKNOWN',
});

const DESCRIPTOR = Object.freeze({
  OPERATIONAL: {
    label: 'Operational',
    tone: 'ok',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    meaning: 'Supported, enabled and verified by a live check.',
  },
  DEGRADED: {
    label: 'Degraded',
    tone: 'warn',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-900 border-amber-200',
    meaning: 'Supported and enabled, but a live check found a fault or backlog.',
  },
  UNAVAILABLE: {
    label: 'Unavailable',
    tone: 'critical',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-800 border-red-200',
    meaning: 'Supported and expected to work, but the dependency did not respond.',
  },
  DISABLED: {
    label: 'Disabled',
    tone: 'muted',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    meaning: 'Intentionally switched off by configuration. This is not a fault.',
  },
  NOT_CONFIGURED: {
    label: 'Not configured',
    tone: 'info',
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-800 border-sky-200',
    meaning: 'Supported but no credentials are present, so calls fail closed.',
  },
  NOT_SUPPORTED: {
    label: 'Not supported',
    tone: 'muted',
    dot: 'bg-slate-300',
    badge: 'bg-slate-50 text-slate-600 border-slate-200',
    meaning: 'Not part of this deployment. There is nothing to monitor.',
  },
  UNKNOWN: {
    label: 'Unknown',
    tone: 'warn',
    dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-800 border-violet-200',
    meaning: 'The source could not be read. State is reported as unknown, never as healthy or zero.',
  },
});

const FALLBACK = Object.freeze({
  label: 'Unknown',
  tone: 'warn',
  dot: 'bg-violet-500',
  badge: 'bg-violet-50 text-violet-800 border-violet-200',
  meaning: 'The backend did not return a recognised state.',
});

export function describeState(state) {
  return DESCRIPTOR[state] || FALLBACK;
}

/** True when the state means "an operator should look at this". */
export function needsAttention(state) {
  return state === HEALTH_STATES.UNAVAILABLE
    || state === HEALTH_STATES.DEGRADED
    || state === HEALTH_STATES.UNKNOWN;
}

export const OVERALL_TONE = Object.freeze({
  OPERATIONAL: { label: 'All critical services operational', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  PARTIAL: { label: 'Some service states could not be read', dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-800 border-violet-200' },
  DEGRADED: { label: 'One or more services degraded', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-900 border-amber-200' },
  CRITICAL: { label: 'A critical platform service is unavailable', dot: 'bg-red-500', badge: 'bg-red-50 text-red-800 border-red-200' },
});

export function describeOverall(overall) {
  return OVERALL_TONE[overall] || { label: 'Operational status unavailable', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700 border-slate-300' };
}

export const INDICATOR_TONE = Object.freeze({
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
});

/**
 * The support/enable/health triple, rendered as one unambiguous line so an
 * operator never confuses "disabled" with "broken".
 */
export function describePosture(service) {
  if (!service) return 'Unknown';
  if (service.support === 'NOT_SUPPORTED') return 'Not supported by this deployment';
  if (service.state === HEALTH_STATES.DISABLED) return 'Supported · Disabled by configuration';
  if (service.state === HEALTH_STATES.NOT_CONFIGURED) return 'Supported · Enabled · Not configured';
  if (service.state === HEALTH_STATES.OPERATIONAL) return 'Supported · Enabled · Healthy';
  if (service.state === HEALTH_STATES.DEGRADED) return 'Supported · Enabled · Degraded';
  if (service.state === HEALTH_STATES.UNAVAILABLE) return 'Supported · Enabled · Unavailable';
  return 'Supported · State unknown';
}

export const CONFIGURATION_LABEL = Object.freeze({
  CONFIGURED: 'Configured',
  PARTIALLY_CONFIGURED: 'Partially configured',
  NOT_CONFIGURED: 'Not configured',
  DISABLED_BY_CONFIGURATION: 'Disabled by configuration',
  NOT_APPLICABLE: 'Not applicable',
  UNKNOWN: 'Unknown',
});

export const GROUP_LABEL = Object.freeze({
  core: 'Core platform',
  integrations: 'External integrations',
  workers: 'Workers & infrastructure',
});

/** Formats an ISO timestamp as a local wall-clock time, or an explicit gap. */
export function formatCheckedAt(iso) {
  if (!iso) return 'Data unavailable';
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString() : 'Data unavailable';
}

/**
 * Renders a metric without ever substituting 0 for a missing value.
 * A null/undefined metric is "Data unavailable" by design.
 */
export function formatMetric(value) {
  if (value === null || value === undefined || value === '') return 'Data unavailable';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  return String(value);
}

export function humanizeMetricKey(key) {
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, character => character.toUpperCase())
    .replace(/\bMb\b/g, 'MB')
    .replace(/\bMs\b/g, 'ms')
    .trim();
}

/**
 * Renders an uptime in seconds as a human duration.
 *
 * Returns "Data unavailable" when the value is missing rather than falling back
 * to zero: "0h 0m" reads as a real measurement meaning "just restarted", which
 * is a materially different and alarming claim from "we could not read it".
 */
export function formatUptime(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return 'Data unavailable';

  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return 'Data unavailable';

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(total)}s`;
}
