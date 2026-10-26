'use strict';

/**
 * The counters an operator needs when the question is "is the control plane behaving?".
 *
 * ## Why in-process and not a metrics library
 *
 * The deployment runs one Node process per container and already ships a durable rollup
 * table (`enterprise_observability_rollups`, read by `GET /api/platform/observability`).
 * What was missing was the *fast* signal: a scrape that answers in microseconds, needs no
 * database, and therefore still answers when the database is the thing that is broken. A
 * `prom-client` dependency would bring a registry we do not need for four counters; this
 * module is the registry.
 *
 * ## Cardinality is the design constraint
 *
 * Label values come from request data — an action name, a denial code, a route. Unbounded
 * labels turn a metrics endpoint into a memory leak with a latency problem attached: the
 * classic failure is a per-user or per-id label, which grows one series per request. Three
 * defences, in order:
 *
 *  1. **Closed vocabularies where they exist.** Outcomes are `SUCCESS`/`FAILURE`; roles are
 *     an enum; unknown roles collapse to `OTHER`.
 *  2. **Route identity is the matched rule id or a normalised path**, never the raw URL:
 *     `/api/admin/users/9f3c…` and `/api/admin/users/a71b…` are one series, `users/:id`.
 *  3. **A hard per-counter ceiling.** Past `MAX_SERIES_PER_COUNTER` distinct series, new keys
 *     are counted in an `__overflow__` series and `droppedSeries` is incremented, so the
 *     endpoint keeps answering and the *fact* of the overflow is itself visible. Silently
 *     dropping would hide the cardinality bug behind the metric that was supposed to expose it.
 *
 * ## What must never reach a label
 *
 * No email, uid, tenant name, token, or free-text reason. `sanitiseLabel` enforces the shape
 * (`[A-Za-z0-9._:/-]`, ≤ 64 chars) and `assertNoIdentityInLabels` in the test suite pins that
 * a request carrying an email does not produce a series containing it.
 *
 * @module services/operationalMetrics
 */

/** Ceiling per counter. Four counters × 500 series × ~80 bytes is a bounded few hundred KB. */
const MAX_SERIES_PER_COUNTER = 500;

/** The overflow bucket's key, visible in the snapshot so a cardinality bug is not silent. */
const OVERFLOW_KEY = '__overflow__';

/** Roles that may appear in a label. Anything else becomes `OTHER`. */
const KNOWN_ROLES = Object.freeze(['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPPORT', 'EMPLOYER', 'ENTERPRISE_ADMIN', 'ENTERPRISE_MEMBER', 'USER', 'ANONYMOUS']);

/**
 * Counter definitions. `labels` is the ordered label set; the order is part of the rendered
 * line, so it is declared here rather than inferred from the first increment.
 * @type {Readonly<Record<string, {help: string, type: 'counter', labels: readonly string[]}>>}
 */
const COUNTERS = Object.freeze({
  admin_action_total: {
    help: 'Administrative mutations observed by the audit middleware, by action and outcome.',
    type: 'counter',
    labels: ['action', 'outcome'],
  },
  admin_denied_total: {
    help: 'Refused administrative requests, by error code, role and matched route rule.',
    type: 'counter',
    labels: ['code', 'role', 'route'],
  },
  admin_audit_write_failures: {
    help: 'Audit rows that could not be persisted. Any non-zero value is an alert: an action happened with no trail.',
    type: 'counter',
    labels: ['surface'],
  },
  config_write_total: {
    help: 'Configuration writes by outcome. A 409 here is an operator conflict, not a fault.',
    type: 'counter',
    labels: ['outcome'],
  },
  admin_root_account_mismatches_total: {
    help: 'Root-account mismatches found by an attestation run, by kind (REC-026). Any non-zero rate means the identity provider and admin_user_roles disagree.',
    type: 'counter',
    labels: ['kind'],
  },
});

/** @type {Map<string, Map<string, number>>} counter name → series key → value */
const state = new Map(Object.keys(COUNTERS).map(name => [name, new Map()]));

/** @type {Map<string, number>} counter name → number of increments discarded by the ceiling */
const dropped = new Map(Object.keys(COUNTERS).map(name => [name, 0]));

/** When the current process started counting. A restart resets every counter — by design. */
const startedAt = new Date();

/**
 * Render a label value in a shape that cannot carry identity or break a metric line.
 * @param {unknown} value
 * @returns {string}
 */
function sanitiseLabel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'none';
  // `:` `/` `-` `.` are legitimate in action names, route rules and codes; `@`, space and
  // quotes are not, and an email would need `@`.
  const cleaned = raw.replace(/[^A-Za-z0-9._:/-]/g, '_').slice(0, 64);
  return cleaned || 'none';
}

/**
 * Normalise a role to the closed set, so a token with a typo cannot create a series.
 * @param {unknown} role
 * @returns {string}
 */
function normaliseRole(role) {
  const upper = String(role || '').trim().toUpperCase();
  if (!upper) return 'ANONYMOUS';
  return KNOWN_ROLES.includes(upper) ? upper : 'OTHER';
}

/**
 * Reduce a request path to a route shape: identifiers become `:id`.
 *
 * `/api/admin/users/9f3c2a11/ai-entitlement` → `/api/admin/users/:id/ai-entitlement`.
 * A path whose segment is not a known noun but looks like an identifier (hex, uuid, long
 * digit run) is collapsed; a word segment is kept, because it is a route, not an instance.
 * @param {unknown} pathname
 * @returns {string}
 */
function normaliseRoute(pathname) {
  const raw = String(pathname || '').split('?')[0];
  if (!raw) return 'unknown';
  const segments = raw.split('/').filter(Boolean).map(segment => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return ':id';
    if (/^\d{3,}$/.test(segment)) return ':id';
    if (/^[0-9a-f]{8,}$/i.test(segment)) return ':id';
    if (segment.includes('@')) return ':id';
    return segment;
  });
  return sanitiseLabel(`/${segments.join('/')}`);
}

/**
 * Increment a counter.
 *
 * Unknown counter names throw: a counter that does not exist in `COUNTERS` is a typo, and a
 * typo that silently creates a series is how a metrics surface stops being trustworthy.
 *
 * @param {string} name one of {@link COUNTERS}
 * @param {Record<string, unknown>} [labels] label values, by declared label name
 * @returns {void}
 */
function increment(name, labels = {}) {
  const definition = COUNTERS[name];
  if (!definition) throw new TypeError(`Unknown metric: ${name}`);
  const series = state.get(name);
  const key = definition.labels.map(label => sanitiseLabel(labels[label])).join('|');
  if (!series.has(key) && series.size >= MAX_SERIES_PER_COUNTER) {
    dropped.set(name, (dropped.get(name) || 0) + 1);
    series.set(OVERFLOW_KEY, (series.get(OVERFLOW_KEY) || 0) + 1);
    return;
  }
  series.set(key, (series.get(key) || 0) + 1);
}

/**
 * Record one administrative mutation from the audit middleware's view.
 * @param {{action?: unknown, outcome?: unknown}} event
 * @returns {void}
 */
function recordAdminAction(event = {}) {
  increment('admin_action_total', {
    action: event.action || 'UNKNOWN_ACTION',
    outcome: String(event.outcome || 'SUCCESS').toUpperCase() === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
  });
}

/**
 * Record a refusal with enough context to answer "who was refused what, where".
 * @param {{code?: unknown, role?: unknown, pathname?: unknown}} event
 * @returns {void}
 */
function recordDenial(event = {}) {
  increment('admin_denied_total', {
    code: event.code || 'UNKNOWN_DENIAL',
    role: normaliseRole(event.role),
    route: normaliseRoute(event.pathname),
  });
}

/**
 * Record an audit row that could not be written.
 * @param {string} surface which code path lost the row (`middleware`, `denial`, `route`)
 * @returns {void}
 */
function recordAuditWriteFailure(surface = 'middleware') {
  increment('admin_audit_write_failures', { surface });
}

/**
 * Record root-account mismatches observed by one attestation run (REC-026).
 *
 * A counter rather than a gauge because the registry has one primitive and a rate is what an
 * alert needs: "a mismatch appeared in the last hour" is the question, and `increase()` over a
 * counter of observations answers it. The current count is in the attestation payload itself,
 * which is where an operator reads it.
 *
 * @param {Record<string, number>} byKind mismatch kind → count, from the attestation summary
 * @returns {void}
 */
function recordRootMismatches(byKind = {}) {
  for (const [kind, count] of Object.entries(byKind)) {
    for (let index = 0; index < Number(count || 0); index += 1) {
      increment('admin_root_account_mismatches_total', { kind });
    }
  }
}

/**
 * Record a configuration write outcome.
 * @param {unknown} outcome one of `SUCCESS`, `CONFLICT`, `INVALID`, `READ_ONLY`, `FORBIDDEN`, `FAILED`
 * @returns {void}
 */
function recordConfigWrite(outcome) {
  increment('config_write_total', { outcome: String(outcome || 'UNKNOWN').toUpperCase() });
}

/**
 * The current values, as data. This is what the health snapshot embeds and what the JSON
 * representation of the metrics route returns.
 * @returns {{since: string, uptimeMs: number, limits: {maxSeriesPerCounter: number},
 *            counters: Array<{name: string, type: string, help: string, labels: string[],
 *            series: Array<{labels: Record<string, string>, value: number}>,
 *            droppedSeries: number}>}}
 */
function snapshot() {
  const now = Date.now();
  return {
    since: startedAt.toISOString(),
    uptimeMs: now - startedAt.getTime(),
    limits: { maxSeriesPerCounter: MAX_SERIES_PER_COUNTER },
    counters: Object.entries(COUNTERS).map(([name, definition]) => ({
      name,
      type: definition.type,
      help: definition.help,
      labels: [...definition.labels],
      series: [...state.get(name).entries()].map(([key, value]) => {
        const parts = key.split('|');
        const labels = {};
        definition.labels.forEach((label, index) => { labels[label] = parts[index]; });
        return { labels, value };
      }),
      droppedSeries: dropped.get(name) || 0,
    })),
  };
}

/**
 * Escape a label value for the Prometheus text exposition format.
 * @param {string} value
 * @returns {string}
 */
function escapeLabelValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Render the counters in the Prometheus text exposition format.
 *
 * A counter with no series still emits its `# HELP`/`# TYPE` lines and a zero sample, so a
 * dashboard panel does not read "no data" on a healthy system where nothing has been denied
 * yet — the two states are different and must not look the same.
 * @returns {string}
 */
function render() {
  const lines = [];
  for (const [name, definition] of Object.entries(COUNTERS)) {
    lines.push(`# HELP ${name} ${definition.help}`);
    lines.push(`# TYPE ${name} ${definition.type}`);
    const series = state.get(name);
    if (series.size === 0) {
      const zeroLabels = definition.labels.map(label => `${label}="none"`).join(',');
      lines.push(`${name}{${zeroLabels}} 0`);
      continue;
    }
    for (const [key, value] of series) {
      const parts = key.split('|');
      const rendered = definition.labels
        .map((label, index) => `${label}="${escapeLabelValue(parts[index])}"`)
        .join(',');
      lines.push(`${name}{${rendered}} ${value}`);
    }
  }
  // Process identity is deliberately absent: hostname, pid and instance would make every
  // container a separate series on a shared dashboard without adding an answer.
  return `${lines.join('\n')}\n`;
}

/**
 * Clear every counter. Test hook only — production code must never reset a counter, because
 * a counter that can go backwards is a counter whose rate cannot be computed.
 * @returns {void}
 */
function resetForTests() {
  for (const series of state.values()) series.clear();
  for (const name of dropped.keys()) dropped.set(name, 0);
}

module.exports = {
  COUNTERS,
  MAX_SERIES_PER_COUNTER,
  increment,
  recordAdminAction,
  recordDenial,
  recordAuditWriteFailure,
  recordConfigWrite,
  recordRootMismatches,
  snapshot,
  render,
  normaliseRole,
  normaliseRoute,
  sanitiseLabel,
  resetForTests,
};
