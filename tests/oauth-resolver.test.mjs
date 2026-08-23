/**
 * OAuth configuration-truth regression tests.
 *
 * These lock down the rule that an unconfigured or unknown provider is never
 * presented as enabled. The previous implementation defaulted every provider
 * to `true` when settings were absent, which made the sign-in screen render
 * four social buttons before settings loaded and then retract them — and, for
 * a genuinely unconfigured provider, ship a button that fails on click.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OAUTH_STATE,
  resolveOAuthStates,
  resolveOAuthSettings,
  applyOAuthAvailability,
  describeOAuthAvailability,
} from '../src/utils/oauthResolver.js';

const FLAGS = ['enableGoogle', 'enableFacebook', 'enableLinkedIn', 'enableGitHub'];

/* ------------------------------------------------------------------ *
 * The regression that motivated this module
 * ------------------------------------------------------------------ */

test('missing settings resolve to UNKNOWN, never to enabled', () => {
  for (const settings of [null, undefined]) {
    const states = resolveOAuthStates(settings);
    for (const flag of FLAGS) {
      assert.equal(states[flag], OAUTH_STATE.UNKNOWN, `${flag} must be UNKNOWN when settings are absent`);
    }
    const flags = resolveOAuthSettings(settings);
    for (const flag of FLAGS) {
      assert.equal(flags[flag], false, `${flag} must not render when settings are absent`);
    }
  }
});

test('an empty settings object resolves to NOT_CONFIGURED, never to enabled', () => {
  const states = resolveOAuthStates({});
  for (const flag of FLAGS) {
    assert.equal(states[flag], OAUTH_STATE.NOT_CONFIGURED, `${flag} must be NOT_CONFIGURED`);
  }
  const flags = resolveOAuthSettings({});
  for (const flag of FLAGS) {
    assert.equal(flags[flag], false, `${flag} must not render when unconfigured`);
  }
});

test('settings present but silent about a provider does not enable that provider', () => {
  const settings = { modules: { enableGoogleAuthModule: true } };
  const states = resolveOAuthStates(settings);
  assert.equal(states.enableGoogle, OAUTH_STATE.ENABLED);
  for (const flag of ['enableFacebook', 'enableLinkedIn', 'enableGitHub']) {
    assert.equal(states[flag], OAUTH_STATE.NOT_CONFIGURED, `${flag} must stay NOT_CONFIGURED`);
  }
});

/* ------------------------------------------------------------------ *
 * Explicit configuration is honoured in both directions
 * ------------------------------------------------------------------ */

test('explicit true enables and explicit false disables, for every provider', () => {
  const on = {
    modules: {
      enableGoogleAuthModule: true,
      enableFacebookAuthModule: true,
      enableLinkedinAuthModule: true,
      enableGithubAuthModule: true,
    },
  };
  const onStates = resolveOAuthStates(on);
  for (const flag of FLAGS) assert.equal(onStates[flag], OAUTH_STATE.ENABLED, `${flag} should be ENABLED`);

  const off = {
    modules: {
      enableGoogleAuthModule: false,
      enableFacebookAuthModule: false,
      enableLinkedinAuthModule: false,
      enableGithubAuthModule: false,
    },
  };
  const offStates = resolveOAuthStates(off);
  for (const flag of FLAGS) assert.equal(offStates[flag], OAUTH_STATE.DISABLED, `${flag} should be DISABLED`);
});

test('an explicit false at a higher-priority key beats a true further down the chain', () => {
  const settings = {
    modules: { enableGoogleAuthModule: false, enableGoogle: true },
    google: { enableGoogleLogin: true },
    socialAuth: { enableGoogleLogin: true },
  };
  assert.equal(resolveOAuthStates(settings).enableGoogle, OAUTH_STATE.DISABLED);
  assert.equal(resolveOAuthSettings(settings).enableGoogle, false);
});

test('resolution falls through to the next chain entry only when a key is absent', () => {
  // Only the deepest key is present, so it decides.
  const settings = { socialAuth: { enableGithubLogin: true } };
  assert.equal(resolveOAuthStates(settings).enableGitHub, OAUTH_STATE.ENABLED);
});

test('facebook resolves from its own login flag, not from an unrelated app id', () => {
  // Regression: the previous implementation tested `enableFacebookLogin` but
  // returned the truthiness of `facebookAppId`, so a provider explicitly
  // switched off could still resolve to enabled purely because an app id
  // happened to be stored alongside it.
  const settings = { socialAuth: { enableFacebookLogin: false, facebookAppId: 'some-app-id' } };
  assert.equal(resolveOAuthStates(settings).enableFacebook, OAUTH_STATE.DISABLED);
  assert.equal(resolveOAuthSettings(settings).enableFacebook, false);

  // And the converse: enabled with no app id present still resolves ENABLED
  // from the flag that actually governs it.
  const enabled = { socialAuth: { enableFacebookLogin: true } };
  assert.equal(resolveOAuthStates(enabled).enableFacebook, OAUTH_STATE.ENABLED);
});

test('truthy non-boolean configuration values are coerced, not passed through', () => {
  const settings = { modules: { enableGoogleAuthModule: 1, enableFacebookAuthModule: 0 } };
  const flags = resolveOAuthSettings(settings);
  assert.equal(flags.enableGoogle, true);
  assert.equal(flags.enableFacebook, false);
  for (const value of Object.values(flags)) assert.equal(typeof value, 'boolean');
});

/* ------------------------------------------------------------------ *
 * Backend availability intersection
 * ------------------------------------------------------------------ */

test('backend-served providers are withheld when the backend cannot serve them', () => {
  const configured = { enableGoogle: true, enableFacebook: true, enableLinkedIn: true, enableGitHub: true };
  const applied = applyOAuthAvailability(configured, { linkedin: false, github: false }, 'ready');
  assert.equal(applied.enableLinkedIn, false);
  assert.equal(applied.enableGitHub, false);
  // Firebase-SDK providers are not gated by the backend contract.
  assert.equal(applied.enableGoogle, true);
  assert.equal(applied.enableFacebook, true);
});

test('an unavailable availability check never upgrades a configured flag', () => {
  const configured = { enableGoogle: false, enableFacebook: false, enableLinkedIn: false, enableGitHub: false };
  const applied = applyOAuthAvailability(configured, {}, 'unavailable');
  for (const flag of FLAGS) assert.equal(applied[flag], false, `${flag} must stay off`);
});

test('configured OFF always beats a backend saying the provider is available', () => {
  const configured = { enableGoogle: true, enableFacebook: true, enableLinkedIn: false, enableGitHub: false };
  const applied = applyOAuthAvailability(configured, { linkedin: true, github: true }, 'ready');
  assert.equal(applied.enableLinkedIn, false);
  assert.equal(applied.enableGitHub, false);
});

/* ------------------------------------------------------------------ *
 * Diagnostic description
 * ------------------------------------------------------------------ */

test('every non-offered provider carries a reason explaining its absence', () => {
  const settings = {
    modules: { enableGoogleAuthModule: false, enableGithubAuthModule: true },
    socialAuth: { enableLinkedinLogin: true },
  };
  const described = describeOAuthAvailability(settings, { linkedin: true, github: false }, 'ready');

  assert.equal(described.enableGoogle.state, OAUTH_STATE.DISABLED);
  assert.match(described.enableGoogle.reason, /turned off/i);

  assert.equal(described.enableFacebook.state, OAUTH_STATE.NOT_CONFIGURED);
  assert.match(described.enableFacebook.reason, /no configuration/i);

  // Configured on and confirmed by the backend.
  assert.equal(described.enableLinkedIn.state, OAUTH_STATE.ENABLED);
  assert.equal(described.enableLinkedIn.usable, true);

  // Configured on, but the backend cannot serve it: surfaced as
  // NOT_CONFIGURED with an explanation, not as a working button.
  assert.equal(described.enableGitHub.state, OAUTH_STATE.NOT_CONFIGURED);
  assert.equal(described.enableGitHub.usable, false);
  assert.match(described.enableGitHub.reason, /cannot serve/i);

  for (const entry of Object.values(described)) {
    assert.ok(entry.reason && entry.reason.length > 0, 'every provider needs a reason');
  }
});

test('an unreachable backend renders a served provider UNKNOWN rather than enabled', () => {
  const settings = { modules: { enableGithubAuthModule: true } };
  const described = describeOAuthAvailability(settings, {}, 'unavailable');
  assert.equal(described.enableGitHub.state, OAUTH_STATE.UNKNOWN);
  assert.equal(described.enableGitHub.usable, false);
  assert.equal(described.enableGitHub.configuredState, OAUTH_STATE.ENABLED);
});

test('the diagnostic view never reports a provider usable unless its state is ENABLED', () => {
  const cases = [
    [null, {}, 'unavailable'],
    [{}, {}, 'ready'],
    [{ modules: { enableGithubAuthModule: true } }, { github: false }, 'ready'],
  ];
  for (const [settings, availability, status] of cases) {
    const described = describeOAuthAvailability(settings, availability, status);
    for (const entry of Object.values(described)) {
      if (entry.usable) assert.equal(entry.state, OAUTH_STATE.ENABLED);
    }
  }
});
