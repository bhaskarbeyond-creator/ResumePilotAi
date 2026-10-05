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
async function resolveConfiguredProviders() {
  const { loadProviderConfiguration } = require('./aiRuntime');
  const configuration = await loadProviderConfiguration();
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
  if (!canProbe) return { id, reachable: false, inconclusive: true };

  let request;
  try {
    request = adapter.buildDiscoveryRequest({ providerConfig });
  } catch {
    return { id, reachable: false, inconclusive: true };
  }

  let parsed;
  try {
    parsed = new URL(String(request?.url || ''));
  } catch {
    return { id, reachable: false, inconclusive: true };
  }

  // A BYOK base URL is data, not a trusted constant: refuse internal targets.
  try {
    await assertPublicNetworkTarget(parsed.hostname);
  } catch {
    return { id, reachable: false, inconclusive: false };
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
    if (status === 401 || status === 403) return { id, reachable: false, inconclusive: false };
    if (!response?.ok) return { id, reachable: false, inconclusive: true };
    const body = await response.json().catch(() => null);
    const models = adapter.normalizeDiscoveryResponse(body);
    return { id, reachable: Array.isArray(models) && models.length > 0, inconclusive: false };
  } catch {
    // Timeout / DNS / TLS / abort: we learned nothing, so say so.
    return { id, reachable: false, inconclusive: true };
  }
}
