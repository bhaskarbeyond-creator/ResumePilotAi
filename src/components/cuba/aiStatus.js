/**
 * AI status vocabulary (§20).
 *
 * HARD RULE, enforced by `tests/cuba-design-system.test.mjs`:
 * there is deliberately NO "online" / "healthy" / latency-bearing state here.
 *
 * The platform exposes `/api/service-availability`, a public, secret-free,
 * boolean-only projection of the same collector that powers the Admin Platform
 * Health console. It reports whether a provider is OPERATIONAL — it does not
 * publish a latency figure to anonymous callers. Therefore this module can
 * honestly say:
 *
 *   'ready'      — the backend reported a usable provider configuration
 *   'degraded'   — configured, but not confirmed operational
 *   'unavailable'— not configured / disabled
 *   'unknown'    — the check itself could not be completed
 *   'checking'   — a check is in flight
 *
 * It can never claim a latency, a percentage, or provider health it did not
 * measure. `AiEngineStatus` renders "✦ AI Engine Ready" and nothing more.
 */

export const AI_STATUS = Object.freeze({
    CHECKING: 'checking',
    READY: 'ready',
    DEGRADED: 'degraded',
    UNAVAILABLE: 'unavailable',
    UNKNOWN: 'unknown',
});

const DESCRIPTOR = Object.freeze({
    [AI_STATUS.CHECKING]: {
        label: 'Checking AI engine',
        tone: 'muted',
        active: true,
        meaning: 'Asking the platform which AI capabilities it can currently serve.',
    },
    [AI_STATUS.READY]: {
        label: 'AI Engine Ready',
        tone: 'ok',
        active: false,
        meaning: 'The platform reports an AI provider configuration it can currently use.',
    },
    [AI_STATUS.DEGRADED]: {
        label: 'AI Engine Degraded',
        tone: 'warn',
        active: false,
        meaning: 'AI is configured but was not confirmed operational on the last check.',
    },
    [AI_STATUS.UNAVAILABLE]: {
        label: 'AI Engine Unavailable',
        tone: 'critical',
        active: false,
        meaning: 'No usable AI provider configuration is currently available.',
    },
    [AI_STATUS.UNKNOWN]: {
        label: 'AI Engine Status Unknown',
        tone: 'muted',
        active: false,
        meaning: 'The availability check could not be completed, so no claim is made.',
    },
});

/** Never upgrades an unknown or missing answer into a healthy one. */
export function describeAiStatus(status) {
    return DESCRIPTOR[status] || DESCRIPTOR[AI_STATUS.UNKNOWN];
}
