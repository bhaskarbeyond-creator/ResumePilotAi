import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * Source-level guarantees for the Admin Platform Health console.
 *
 * These assertions exist because the failure mode we are defending against is
 * not "the component is missing" — it is "the component quietly invents a
 * healthy status". A regression that hardcodes a state, defaults a provider to
 * enabled, or renders an unreadable metric as 0 would still render fine in a
 * browser, so it has to be caught in the source.
 */

const files = {
  engine: 'backend/services/platformHealth.js',
  routes: 'backend/routes/platform.js',
  index: 'backend/index.js',
  presentation: 'src/utils/healthPresentation.js',
  page: 'src/components/admin/health/PlatformHealth.jsx',
  panel: 'src/components/admin/health/ServiceDetailPanel.jsx',
  matrix: 'src/components/admin/health/ApiHealthMatrix.jsx',
  admin: 'src/components/admin/Admin.jsx',
  sidebar: 'src/components/admin/sidebar/sidebar.jsx',
  dashboard: 'src/components/admin/dashboard/dashboard.jsx',
  attention: 'src/components/admin/attention/PlatformAttention.jsx',
  availability: 'src/hooks/useServiceAvailability.js',
  plans: 'src/components/Billing/Plans/Plans.jsx',
  oauth: 'src/utils/oauthResolver.js',
  login: 'src/components/auth/login/Login.jsx',
  profileSidebar: 'src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx',
  api: 'src/services/platformApi.js',
};

const cache = new Map();
async function source(name) {
  if (!cache.has(name)) cache.set(name, await fs.readFile(files[name], 'utf8'));
  return cache.get(name);
}

test('the health engine models every distinguishable operational state', async () => {
  const engine = await source('engine');
  for (const state of ['OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'DISABLED', 'NOT_CONFIGURED', 'NOT_SUPPORTED', 'UNKNOWN']) {
    assert.match(engine, new RegExp(`${state}:`), `STATE.${state} must exist so the UI can distinguish it`);
  }
  for (const configuration of ['CONFIGURED', 'PARTIALLY_CONFIGURED', 'NOT_CONFIGURED', 'DISABLED_BY_CONFIGURATION', 'NOT_APPLICABLE']) {
    assert.match(engine, new RegExp(`${configuration}:`), `CONFIG.${configuration} must exist`);
  }
  // Support / enablement / health are three separate axes, not one boolean.
  assert.match(engine, /support:/);
  assert.match(engine, /enabled:/);
  assert.match(engine, /configuration:/);
});

test('service state is probed, never assumed from process liveness', async () => {
  const engine = await source('engine');
  // Real probes against real dependencies.
  assert.match(engine, /SELECT 1 AS alive, VERSION\(\) AS version/);
  assert.match(engine, /SELECT category, data FROM system_settings/);
  assert.match(engine, /listUsers\(1\)/);
  assert.match(engine, /loadMariaSettings/);
  assert.match(engine, /inspectNotificationOutbox/);
  assert.match(engine, /getOutboxStatus/);
  // Probe failures are categorised rather than swallowed into "healthy".
  assert.match(engine, /categorizeError/);
  for (const category of ['TIMEOUT', 'NETWORK_UNREACHABLE', 'AUTHENTICATION_REJECTED', 'CONFIGURATION_MISSING', 'DATA_UNAVAILABLE']) {
    assert.match(engine, new RegExp(category));
  }
});

test('the collector is cached and rate-limited so refresh cannot hammer production', async () => {
  const engine = await source('engine');
  assert.match(engine, /PLATFORM_HEALTH_CACHE_MS/);
  assert.match(engine, /PLATFORM_HEALTH_MIN_INTERVAL_MS/);
  assert.match(engine, /inFlight/, 'concurrent callers must share one in-flight collection');
});

test('operational-status routes are permission-gated and audited where they act', async () => {
  const routes = await source('routes');
  assert.match(routes, /router\.get\('\/operational-status'/);
  assert.match(routes, /router\.get\('\/operational-status\/api-matrix'/);
  assert.match(routes, /router\.post\('\/operational-status\/refresh'/);
  assert.match(routes, /router\.get\('\/health-indicator'/);

  // Mutating/operator-initiated actions are audited; passive GETs are not.
  assert.match(routes, /RUN_PLATFORM_HEALTH_CHECK/);
  assert.match(routes, /TEST_PLATFORM_INTEGRATION/);
  // The provider test is the most privileged action on the page.
  assert.match(routes, /requireSuperAdmin/);
  // Extra diagnostics are stripped for non-super-admins.
  assert.match(routes, /projectSnapshotForRole/);
});

test('elevated diagnostics are withheld from non-super-admins', async () => {
  const routes = await source('routes');
  const projection = routes.slice(routes.indexOf('function projectSnapshotForRole'), routes.indexOf('function projectSnapshotForRole') + 1200);
  for (const field of ['host', 'pid', 'loadAverage1m', 'rssMb', 'heapUsedMb']) {
    assert.ok(projection.includes(field), `${field} must be stripped for non-elevated roles`);
  }
});

test('the public availability contract exposes booleans only, never configuration values', async () => {
  const engine = await source('engine');
  const start = engine.indexOf('async function getServiceAvailability');
  const body = engine.slice(start, engine.indexOf('\n}', start));
  assert.match(body, /usable\('github-oauth'\)/);
  assert.match(body, /usable\('payments-paypal'\)/);
  assert.match(body, /enterpriseTenancy/);
  // Only the OPERATIONAL state counts as usable — disabled is not "fine".
  assert.match(body.length ? engine.slice(start - 400, start + 400) : '', /state === STATE\.OPERATIONAL/);
  for (const secret of ['secretKey', 'clientSecret', 'apiKey', 'privateKey', 'saltKey', 'password']) {
    assert.ok(!body.includes(secret), `availability payload must not carry ${secret}`);
  }

  const index = await source('index');
  assert.match(index, /\/api\/service-availability/);
  assert.match(index, /'\/service-availability'/, 'must be in publicApiPaths so signed-out login pages can read it');
  assert.match(index, /no-store/);
});

test('presentation vocabulary never falls back to a healthy claim', async () => {
  const { describeState, formatMetric, formatCheckedAt, needsAttention, describeOverall } =
    await import('../src/utils/healthPresentation.js');

  // An unrecognised, missing, or malformed state must never read as healthy.
  for (const input of [undefined, null, '', 'HEALTHY', 'OK', 'GREEN', 'whatever']) {
    const described = describeState(input);
    assert.equal(described.label, 'Unknown', `describeState(${JSON.stringify(input)}) must be Unknown`);
    assert.notEqual(described.tone, 'ok');
  }
  assert.equal(describeState('OPERATIONAL').label, 'Operational');
  assert.equal(describeState('DISABLED').label, 'Disabled');
  assert.notEqual(describeState('DISABLED').label, describeState('OPERATIONAL').label);

  // An unreadable overall verdict is reported as unavailable, not as green.
  assert.match(describeOverall(undefined).label, /unavailable/i);
  assert.equal(describeOverall('OPERATIONAL').label, 'All critical services operational');

  // Unknown demands attention; a deliberate disable does not.
  assert.equal(needsAttention('UNKNOWN'), true);
  assert.equal(needsAttention('DEGRADED'), true);
  assert.equal(needsAttention('UNAVAILABLE'), true);
  assert.equal(needsAttention('DISABLED'), false);
  assert.equal(needsAttention('NOT_CONFIGURED'), false);

  // A metric that could not be read is "Data unavailable" — never 0.
  for (const missing of [null, undefined, '']) {
    assert.equal(formatMetric(missing), 'Data unavailable');
  }
  // A genuine zero is a real observation and must survive intact.
  assert.equal(String(formatMetric(0)), '0');
  assert.equal(String(formatMetric(42)), '42');

  // A missing timestamp must not render as "just now" or an epoch date.
  assert.equal(formatCheckedAt(null), 'Data unavailable');
  assert.equal(formatCheckedAt(undefined), 'Data unavailable');
});

test('the Platform Health page renders backend values and no invented ones', async () => {
  const page = await source('page');
  assert.match(page, /getOperationalStatus/);
  assert.match(page, /refreshOperationalStatus/);
  // No hardcoded percentages, uptimes, or trend claims.
  assert.ok(!/100%|99\.9|uptime of|all systems go/i.test(page), 'page must not hardcode availability figures');
  assert.ok(!/Math\.random/.test(page));
  // Disabled/not-configured are explained as deliberate, not as failures.
  assert.match(page, /not faults/i);
  // Errors must state that nothing is inferred.
  assert.match(page, /No status is inferred/);
  // Auto-refresh is opt-in.
  assert.match(page, /useState\(false\)[\s\S]{0,200}|autoRefresh/);
  assert.match(page, /AUTO_REFRESH_MS = 60_000/);
});

test('the detail panel answers every required investigation question', async () => {
  const panel = await source('panel');
  for (const label of ['Why this state', 'Last checked', 'Dependency', 'Retryable', 'Configuration state', 'Error category', 'Affected features', 'Affected UI modules', 'Affected APIs', 'Remediation guidance', 'Provider test', 'Relevant audit events']) {
    assert.ok(panel.includes(label), `detail panel must surface "${label}"`);
  }
  // The dialog is a real modal for assistive technology.
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /Escape/);
  // An unreadable audit trail is declared, not rendered as "no events".
  assert.match(panel, /Audit trail unavailable/);
  // The safe test is described as non-destructive.
  assert.match(panel, /never sends a message, charges a card, or writes user data/);
});

test('the API matrix is filterable and is not shown on the initial dashboard', async () => {
  const [matrix, page] = await Promise.all([source('matrix'), source('page')]);
  assert.match(page, /View API Matrix/);
  assert.match(page, /view === 'matrix'/, 'the matrix must live behind its own view, not the landing view');

  for (const control of ['Search endpoint path or dependency', 'Filter by module', 'Filter by operational state', 'Filter by authentication', 'external dependency']) {
    assert.ok(matrix.includes(control), `matrix must offer the "${control}" control`);
  }
  // Counts come from the payload, never from a literal.
  assert.match(matrix, /totals\?\.total \?\? 'Data unavailable'/);
  assert.match(matrix, /totals\?\.degraded \?\? 'Data unavailable'/);
  assert.ok(!/223|207|\b16 degraded\b/.test(matrix), 'matrix must not hardcode audit numbers');
  // Dense table degrades to cards on small screens.
  assert.match(matrix, /hidden[^"]*md:block/);
  assert.match(matrix, /md:hidden/);
  // Pagination keeps the initial payload small.
  assert.match(matrix, /PAGE_SIZE/);
});

test('Platform Health is a first-class navigation item, not a hidden debug page', async () => {
  const [admin, sidebar] = await Promise.all([source('admin'), source('sidebar')]);
  assert.match(admin, /<Route path="health" element=\{[\s\S]*?<PlatformHealth \/>/);
  assert.match(sidebar, /label: 'Platform Health'/);
  assert.match(sidebar, /path: '\/adm\/health'/);
  // The nav dot is driven by the backend indicator.
  assert.match(sidebar, /getHealthIndicator/);
  assert.match(sidebar, /INDICATOR_TONE\[healthIndicator\.indicator\]/);
  // An unreachable indicator must not render green.
  assert.match(sidebar, /unavailable' \? 'bg-slate-400'/);
});

test('command center and attention integrate health with per-item deep links', async () => {
  const [dashboard, attention] = await Promise.all([source('dashboard'), source('attention')]);
  assert.match(dashboard, /operationalStatus/);
  assert.match(dashboard, /\/adm\/health\?service=/);
  assert.match(dashboard, /Data unavailable/);
  assert.match(dashboard, /health collector did not respond/);
  assert.match(attention, /Open Platform Health/);
  assert.match(attention, /operationalSource === 'unavailable'/);
});

test('payment options are gated on live backend availability, closing the 404 gap', async () => {
  const [plans, availability] = await Promise.all([source('plans'), source('availability')]);
  assert.match(plans, /useServiceAvailability/);
  assert.match(plans, /paymentAvailability/);
  // The Checkout component must receive the resolved values, not the raw config.
  assert.match(plans, /paypalEnabled=\{paymentAvailability\.paypalEnabled\}/);
  assert.match(plans, /stripeEnabled=\{paymentAvailability\.stripeEnabled\}/);

  // Configured-off always wins; unknown never upgrades to enabled.
  const resolve = availability.slice(availability.indexOf('export function resolveUsable'));
  assert.match(resolve, /if \(!configuredEnabled\) return false;/);
  assert.match(resolve, /if \(status !== 'ready'\) return Boolean\(configuredEnabled\);/);
  assert.match(resolve, /return liveUsable === true;/);
});

test('OAuth buttons are gated on the providers the backend can actually serve', async () => {
  const [oauth, login] = await Promise.all([source('oauth'), source('login')]);
  assert.match(oauth, /fetchOAuthAvailability/);
  assert.match(oauth, /applyOAuthAvailability/);
  const apply = oauth.slice(oauth.indexOf('export const applyOAuthAvailability'));
  assert.match(apply, /enableGitHub: resolved\.enableGitHub && availability\?\.github === true/);
  assert.match(apply, /enableLinkedIn: resolved\.enableLinkedIn && availability\?\.linkedin === true/);
  // An unknown answer leaves the configured value untouched.
  assert.match(apply, /if \(status !== 'ready'\) return \{ \.\.\.resolved \};/);
  assert.match(login, /applyOAuthAvailability/);
});

test('the enterprise workspace link requires backend confirmation, not just a build flag', async () => {
  const profileSidebar = await source('profileSidebar');
  assert.match(profileSidebar, /buildTimeEnterpriseFlag/);
  assert.match(profileSidebar, /platformAvailability\?\.enterpriseTenancy === true/);
});

test('no health surface renders a secret, an env var, or a fake metric', async () => {
  const surfaces = await Promise.all([source('page'), source('panel'), source('matrix'), source('presentation'), source('api')]);
  const forbidden = [
    /process\.env\.[A-Z_]+/,
    /STRIPE_SECRET|PAYPAL_CLIENT_SECRET|FIREBASE_PRIVATE_KEY|SMTP_PASS|TWILIO_AUTH_TOKEN/,
    /Math\.random/,
    /99\.9%|100% healthy|all good/i,
  ];
  for (const [index, text] of surfaces.entries()) {
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `surface #${index} must not match ${pattern}`);
    }
  }
});

test('the health console degrades honestly when data cannot be collected', async () => {
  const [page, matrix, panel] = await Promise.all([source('page'), source('matrix'), source('panel')]);
  // Every surface has an explicit error branch with a retry, plus a loading state.
  for (const [name, text] of [['page', page], ['matrix', matrix]]) {
    assert.match(text, /role="alert"/, `${name} needs an error state`);
    assert.match(text, /Retry/, `${name} needs a retry affordance`);
    assert.match(text, /animate-pulse/, `${name} needs a loading skeleton`);
  }
  assert.match(page, /No services match this filter/, 'page needs an empty state');
  assert.match(matrix, /No endpoints match these filters/, 'matrix needs an empty state');
  assert.match(panel, /aria-busy="true"/);
});

/**
 * Uptime must distinguish "zero" from "unknown".
 *
 * The admin dashboard rendered `Math.floor((center.uptimeSeconds || 0) / 3600)`,
 * so a missing reading displayed as "0h 0m". That is not a neutral fallback: it
 * is a concrete claim that the platform restarted moments ago, which would send
 * an operator hunting a crash that never happened.
 */
test('formatUptime reports missing data instead of inventing a zero', async () => {
  const { formatUptime } = await import('../src/utils/healthPresentation.js');

  for (const missing of [null, undefined, '', 'abc', NaN, -5]) {
    assert.equal(
      formatUptime(missing),
      'Data unavailable',
      `${String(missing)} must not render as a duration`,
    );
  }

  // A genuine zero is a real measurement and must survive.
  assert.equal(formatUptime(0), '0s');
  assert.equal(formatUptime(59), '59s');
  assert.equal(formatUptime(60), '1m');
  assert.equal(formatUptime(7320), '2h 2m');
  assert.equal(formatUptime(90000), '1d 1h');
});

test('the dashboard no longer coerces missing platform metrics to zero', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync('src/components/admin/dashboard/dashboard.jsx', 'utf8');

  // The specific coercion that produced the fake "0h 0m".
  assert.ok(
    !/uptimeSeconds\s*\|\|\s*0/.test(source),
    'dashboard still falls back to 0 for a missing uptime',
  );
  assert.ok(source.includes('formatUptime(center.uptimeSeconds)'));
});
