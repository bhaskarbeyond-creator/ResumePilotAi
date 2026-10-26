'use strict';

/**
 * F-28: single source of generation defaults.
 *
 * Before this module the two engines disagreed: aiRuntime's configuration
 * builder fell back to temperature 0.7 / maxTokens 2048 while freellmConfig's
 * mesh builder used 0.3 / 4096 (and aiRuntime's own engine handoff plus
 * freellmapi's router parameter defaults repeated 0.3 / 4096) — the same
 * tenant could get different sampling depending on which engine served the
 * call, and a caller that omitted the fields could even flip defaults
 * mid-request.
 *
 * Value choice: the product engine's long-standing 0.7 / 2048.
 *   - It is the app-wide default every content operation was tuned against
 *     (test baselines reference 2048 as the expected un-clamped default).
 *   - 2048 sits inside the product clamp window (256..4096) and 0.7 inside
 *     (0..1); the mesh passes both through unclamped.
 *   - Admin-configured deployments are unaffected: both builders prefer the
 *     stored public_config values; defaults only apply when a field is
 *     absent (fresh installs before the first settings save).
 *
 * Operation-specific profiles (e.g. resume parsing's deterministic
 * 0.15 / 4096) are deliberate overrides, NOT defaults, and stay where they
 * are.
 */
const DEFAULT_GENERATION_TEMPERATURE = 0.7;
const DEFAULT_GENERATION_MAX_TOKENS = 2048;

module.exports = Object.freeze({
    DEFAULT_GENERATION_TEMPERATURE,
    DEFAULT_GENERATION_MAX_TOKENS,
});
