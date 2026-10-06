'use strict';

/**
 * Non-billable AI operational probe (DIR-048, Cluster 1c).
 *
 * WHY THIS EXISTS
 *   `platformHealth` deliberately reports `ai-providers` as UNKNOWN whenever a
 *   credential is configured, because health collection refuses to run billable
 *   inference. That refusal is correct. But it left the public availability
 *   projection carrying NO ai signal at all, so `useAiEngineStatus` could only
 *   ever answer "AI Engine Status Unknown" — even on a deployment with a
 *   perfectly usable provider. An honest UNKNOWN and an unmeasured UNKNOWN are
 *   different things; this module closes the gap by measuring something real
 *   that costs nothing.
 *
 * WHAT IT MEASURES
 *   Each configured provider's MODEL CATALOG endpoint — `GET {base}/models`
 *   (Gemini: `/v1beta/models`). That is model-scoped public metadata: it consumes
 *   ZERO tokens and ZERO currency, which is precisely why `DiscoveryService`
 *   already treats it as the safe, global, credential-verifying call. A 200 with
 *   a parseable, non-empty model list proves three things at once: the endpoint
 *   is reachable, the credential is accepted, and at least one model is servable.
 *
 * WHAT IT NEVER DOES
 *   - never calls a chat/completions or generateContent endpoint (billable)
 *   - never emits a credential, a model id, a latency figure or a percentage —
 *     the projection is booleans and integer counts only
 *   - never upgrades an inconclusive probe into "ready": a timeout, a transport
 *     failure or an unparseable body yields `inconclusive`, which the projection
 *     publishes as DEGRADED so the beacon says "configured, not confirmed"
 *   - never probes a private or reserved host: a BYOK base URL is operator-
 *     supplied data, so it passes the same SSRF guard the SMTP probe uses
 *
 * ABUSE RESISTANCE
 *   `/api/service-availability` is public and unauthenticated, so an outbound
 *   call hung off it must not be amplifiable. A shared TTL cache plus in-flight
 *   dedup caps this at ONE round per provider per PROBE_TTL_MS no matter how
 *   many callers arrive, and the timeout and provider count are both bounded.
 */

const { assertPublicNetworkTarget } = require('../security/network');
const { getAdapter } = require('./aiRouting/providerAdapters');
const { fetchWithDeadline } = require('./aiRouting/httpDeadline');

const PROBE_TTL_MS = Number(process.env.AI_PROBE_CACHE_MS || 120_000);
const PROBE_TIMEOUT_MS = Number(process.env.AI_PROBE_TIMEOUT_MS || 6_000);
/** Hard ceiling: a deployment configures at most a handful of providers, and the
 *  cap keeps a malformed settings row from fanning out unbounded egress. */
const MAX_PROBED_PROVIDERS = 6;

/** The three states the public beacon may honestly claim. */
const AI_AVAILABILITY = Object.freeze({
  READY: 'ready',
  DEGRADED: 'degraded',
  UNAVAILABLE: 'unavailable',
});

let cached = null;
let cachedAt = 0;
let inFlight = null;

function resetAiProbeCache() {
  cached = null;
  cachedAt = 0;
  inFlight = null;
}


/**
 * Resolves the providers this deployment has actually enabled, reusing the
 * runtime's own canonical resolver rather than re-deriving a second opinion
 * about which credential wins (env vs stored vs legacy).
 */
/**
 * Resolves which providers to probe.
 *   - with an injected list (tests): validated in place, nothing is read
 *   - with a settings hint (platform health): the caller's already-loaded
 *     `system_settings` rows feed the runtime's canonical builder, so this
 *     costs ZERO additional repository reads
 *   - otherwise: the runtime's own repository-backed resolver
 */
async function resolveConfiguredProviders(settings = null) {
  const { loadProviderConfiguration, buildProviderConfiguration } = require('./aiRuntime');
  const configuration = settings
    ? buildProviderConfiguration(process.env, settings)
    : await loadProviderConfiguration();
  const providers = configuration?.providers || {};
  const configured = [];
  for (const [id, config] of Object.entries(providers)) {
    if (config?.enabled !== true) continue;
    const key = typeof config?.key === 'string' ? config.key.trim() : '';
    if (!key) continue;
    configured.push({ id, providerConfig: { key, baseUrl: config.baseUrl || '' } });
    if (configured.length >= MAX_PROBED_PROVIDERS) break;
  }
  return configured;
}

/**
 * Probes ONE provider's model catalog. Returns a verdict, never a secret:
 *   reachable    — catalog fetched AND non-empty: this provider can serve
 *   inconclusive — the answer could not be determined (timeout, 5xx, bad body)
 *   rejected     — determined, and the answer is no (401/403, SSRF-blocked host)
 */
async function probeProvider({ id, providerConfig }, fetchImpl) {
  const adapter = getAdapter(id);
  const canProbe = adapter
    && typeof adapter.buildDiscoveryRequest === 'function'
    && typeof adapter.normalizeDiscoveryResponse === 'function';
  if (!canProbe) return { id, reachable: false, inconclusive: true, cause: 'unsupported-adapter' };

  let request;
  try {
    request = adapter.buildDiscoveryRequest({ providerConfig });
  } catch {
    return { id, reachable: false, inconclusive: true, cause: 'invalid-request' };
  }

  let parsed;
  try {
    parsed = new URL(String(request?.url || ''));
  } catch {
    return { id, reachable: false, inconclusive: true, cause: 'invalid-request' };
  }

  // A BYOK base URL is data, not a trusted constant: refuse internal targets.
  try {
    await assertPublicNetworkTarget(parsed.hostname);
  } catch {
    return { id, reachable: false, inconclusive: false, cause: 'host-blocked' };
  }

  try {
    const response = await fetchWithDeadline(
      fetchImpl,
      parsed.toString(),
      { method: 'GET', headers: request.headers || {} },
      PROBE_TIMEOUT_MS,
    );
    const status = Number(response?.status);
    // A rejected credential is a definitive "not usable", not an unknown.
    if (status === 401 || status === 403) return { id, reachable: false, inconclusive: false, cause: 'credential-rejected' };
    if (!response?.ok) return { id, reachable: false, inconclusive: true, cause: 'transport' };
    let body;
    try {
      body = await response.json();
    } catch {
      // HTTP 200 with an unreadable body: the answer could not be determined.
      return { id, reachable: false, inconclusive: true, cause: 'unparseable-catalog' };
    }
    let models;
    try {
      models = adapter.normalizeDiscoveryResponse(body);
    } catch {
      return { id, reachable: false, inconclusive: true, cause: 'unparseable-catalog' };
    }
    if (!Array.isArray(models) || models.length === 0) {
      // Well-formed but empty: the endpoint answered, and the answer is that it
      // can serve no model. That is a determination, not an unknown.
      return { id, reachable: false, inconclusive: false, cause: 'empty-catalog' };
    }
    return { id, reachable: true, inconclusive: false, cause: 'reachable' };
  } catch {
    // Timeout / DNS / TLS / abort: we learned nothing, so say so.
    return { id, reachable: false, inconclusive: true, cause: 'transport' };
  }
}

/**
 * Folds the per-provider verdicts into ONE availability claim:
 *   ready       — at least one configured provider positively answered
 *   degraded    — nothing was confirmed, and at least one answer was inconclusive
 *   unavailable — every configured provider was definitively rejected
 * An inconclusive result can never be upgraded into "ready".
 */
function foldVerdict(results) {
  const reachable = results.filter((item) => item.reachable).length;
  if (reachable > 0) return { state: AI_AVAILABILITY.READY, cause: 'reachable' };
  if (results.some((item) => item.inconclusive)) return { state: AI_AVAILABILITY.DEGRADED, cause: 'inconclusive' };
  const hostBlocked = results.some((item) => item.cause === 'host-blocked');
  return { state: AI_AVAILABILITY.UNAVAILABLE, cause: hostBlocked ? 'host-blocked' : 'credential-rejected' };
}

/**
 * Resolves the transport this probe may use. An explicitly injected fetchImpl
 * is always honored (unit tests inject stubs). An implicitly resolved transport
 * is refused in test runs — the same posture as DiscoveryService — so a test
 * that happens to inherit real credentials still makes no outbound connection;
 * `AI_OPERATIONAL_PROBE_ALLOW=1` opts a harness in deliberately.
 */
function resolveProbeFetch(fetchImpl) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  if (process.env.NODE_ENV === 'test' && process.env.AI_OPERATIONAL_PROBE_ALLOW !== '1') return null;
  return typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
}

/** Test seam: validates an injected provider list; malformed entries are skipped. */
function normalizeInjectedProviders(providers) {
  if (!Array.isArray(providers)) return null;
  const out = [];
  for (const entry of providers) {
    const id = String(entry?.id || '').trim();
    const key = typeof entry?.providerConfig?.key === 'string' ? entry.providerConfig.key.trim() : '';
    if (!id || !key) continue;
    out.push({ id, providerConfig: { key, baseUrl: String(entry.providerConfig.baseUrl || '') } });
    if (out.length >= MAX_PROBED_PROVIDERS) break;
  }
  return out;
}


/**
 * The one public read. Returns a verdict and never throws for provider-level
 * outcomes: `{ state, cause, configured, reachable, checkedAt }`.
 *
 * A configuration-read failure (e.g. the settings store is unreachable) DOES
 * propagate, so the caller publishes UNKNOWN rather than a fabricated verdict.
 */
async function getAiOperationalStatus({ fetchImpl = null, force = false, providers = null, settings = null } = {}) {
  const now = Date.now();
  if (!force && cached && (now - cachedAt) < PROBE_TTL_MS) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const injected = normalizeInjectedProviders(providers);
      const configured = injected || await resolveConfiguredProviders(settings);
      const fetcher = resolveProbeFetch(fetchImpl);
      let verdict;
      if (!configured.length) {
        verdict = { state: AI_AVAILABILITY.UNAVAILABLE, cause: 'unconfigured', configured: 0, reachable: 0 };
      } else if (!fetcher) {
        // Configured, but this runtime refuses (or lacks) a transport. That is
        // precisely "configured, not confirmed" — never "ready".
        verdict = { state: AI_AVAILABILITY.DEGRADED, cause: 'no-transport', configured: configured.length, reachable: 0 };
      } else {
        const results = await Promise.all(configured.map((entry) => probeProvider(entry, fetcher)
          .catch(() => ({ id: entry.id, reachable: false, inconclusive: true, cause: 'transport' }))));
        verdict = {
          ...foldVerdict(results),
          configured: configured.length,
          reachable: results.filter((item) => item.reachable).length,
        };
      }
      cached = Object.freeze({ ...verdict, checkedAt: new Date().toISOString() });
      cachedAt = Date.now();
      return cached;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

module.exports = {
  AI_AVAILABILITY,
  getAiOperationalStatus,
  probeProvider,
  resetAiProbeCache,
};

