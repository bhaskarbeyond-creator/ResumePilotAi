/**
 * OAuth provider configuration truth.
 *
 * The rule this module exists to enforce: an OAuth provider is only presented
 * to a user when we have positive evidence it is both configured and servable.
 * Absence of evidence is never upgraded into "enabled".
 *
 * Four distinct states are modelled, because collapsing them is how a sign-in
 * screen ends up rendering a button that 404s on click:
 *
 *   ENABLED         - explicitly configured on, and (where applicable) the
 *                     backend confirms it can serve the flow.
 *   DISABLED        - explicitly configured off by an operator. Always wins.
 *   NOT_CONFIGURED  - no configuration present for this provider.
 *   UNKNOWN         - settings could not be loaded at all, so we cannot say.
 *
 * Only ENABLED renders a button. DISABLED, NOT_CONFIGURED and UNKNOWN all
 * render nothing, but they are kept distinct so Platform Health and the admin
 * surfaces can explain *why* a provider is absent rather than showing a blank.
 */

export const OAUTH_STATE = Object.freeze({
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Provider definitions. `chain` lists the settings keys consulted in priority
 * order; the first key that is actually present decides the outcome. `served`
 * marks providers whose flow is executed by our own backend routes (as opposed
 * to the Firebase client SDK), and which therefore additionally require a
 * positive backend availability signal.
 */
const PROVIDERS = [
  {
    key: 'google',
    flag: 'enableGoogle',
    served: false,
    chain: [
      ['modules', 'enableGoogleAuthModule'],
      ['modules', 'enableGoogle'],
      ['google', 'enableGoogleLogin'],
      ['socialAuth', 'enableGoogleLogin'],
    ],
  },
  {
    key: 'facebook',
    flag: 'enableFacebook',
    served: false,
    chain: [
      ['modules', 'enableFacebookAuthModule'],
      ['modules', 'enableFacebook'],
      ['facebook', 'enableFacebookLogin'],
      ['socialAuth', 'enableFacebookLogin'],
    ],
  },
  {
    key: 'linkedin',
    flag: 'enableLinkedIn',
    served: true,
    chain: [
      ['modules', 'enableLinkedinAuthModule'],
      ['modules', 'enableLinkedinLogin'],
      ['socialAuth', 'enableLinkedinLogin'],
      ['modules', 'enableLinkedIn'],
    ],
  },
  {
    key: 'github',
    flag: 'enableGitHub',
    served: true,
    chain: [
      ['modules', 'enableGithubAuthModule'],
      ['modules', 'enableGithubLogin'],
      ['socialAuth', 'enableGithubLogin'],
      ['modules', 'enableGitHub'],
    ],
  },
];

const isPresent = value => value !== undefined && value !== null;

/**
 * Resolves the operator-configured state of every provider.
 *
 * Passing null/undefined settings (the pre-load case) yields UNKNOWN for every
 * provider — deliberately NOT enabled. This is what stops the sign-in screen
 * from flashing four buttons on first paint and then retracting them once the
 * real settings arrive.
 */
export const resolveOAuthStates = settings => {
  const loaded = isPresent(settings) && typeof settings === 'object';
  const states = {};

  for (const provider of PROVIDERS) {
    if (!loaded) {
      states[provider.flag] = OAUTH_STATE.UNKNOWN;
      continue;
    }

    let resolved = OAUTH_STATE.NOT_CONFIGURED;
    for (const [section, key] of provider.chain) {
      const bucket = settings[section];
      if (!isPresent(bucket) || typeof bucket !== 'object') continue;
      const value = bucket[key];
      if (!isPresent(value)) continue;
      resolved = value ? OAUTH_STATE.ENABLED : OAUTH_STATE.DISABLED;
      break;
    }
    states[provider.flag] = resolved;
  }

  return states;
};

/**
 * Boolean view of the configured state, for the sign-in/registration screens.
 * Only ENABLED yields true.
 */
export const resolveOAuthSettings = settings => {
  const states = resolveOAuthStates(settings);
  const flags = {};
  for (const provider of PROVIDERS) {
    flags[provider.flag] = states[provider.flag] === OAUTH_STATE.ENABLED;
  }
  return flags;
};

/**
 * Fetches the public, secret-free service-availability contract. GitHub and
 * LinkedIn sign-in are served by backend routes, so a button for a provider the
 * backend cannot serve produces a "route not found"/502 on click. This lets the
 * auth screens hide those buttons instead of shipping a dead control.
 *
 * Returns `{ status, auth }` where status is 'ready' or 'unavailable'. When the
 * check cannot be made we report 'unavailable' and callers keep their
 * configured flags — an unknown answer is never upgraded to "enabled".
 */
export const fetchOAuthAvailability = async () => {
  try {
    const response = await fetch('/api/service-availability', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Availability check failed with ${response.status}`);
    const data = await response.json();
    if (!data || data.success !== true) throw new Error('Availability check returned an unusable payload');
    return { status: 'ready', auth: data.auth || {} };
  } catch (error) {
    return { status: 'unavailable', auth: {} };
  }
};

/**
 * Intersects the operator's configured OAuth toggles with what the backend can
 * actually serve. Configured OFF always wins. Only the backend-served providers
 * (GitHub, LinkedIn) are gated here; Google and Facebook run through the
 * Firebase client SDK and are not part of the backend availability contract.
 */
export const applyOAuthAvailability = (resolved, availability, status) => {
  if (status !== 'ready') return { ...resolved };
  return {
    ...resolved,
    enableLinkedIn: resolved.enableLinkedIn && availability?.linkedin === true,
    enableGitHub: resolved.enableGitHub && availability?.github === true,
  };
};

/**
 * Full diagnostic view: the configured state intersected with backend
 * availability, retaining the reason a provider is not offered. Admin and
 * Platform Health surfaces use this to explain absence instead of showing a
 * silently missing button.
 */
export const describeOAuthAvailability = (settings, availability, status) => {
  const states = resolveOAuthStates(settings);
  const description = {};

  for (const provider of PROVIDERS) {
    const configured = states[provider.flag];
    let state = configured;
    let reason;

    switch (configured) {
      case OAUTH_STATE.DISABLED:
        reason = 'Turned off in system settings.';
        break;
      case OAUTH_STATE.NOT_CONFIGURED:
        reason = 'No configuration present for this provider.';
        break;
      case OAUTH_STATE.UNKNOWN:
        reason = 'System settings could not be loaded, so provider state is unknown.';
        break;
      default:
        reason = 'Configured and available.';
    }

    // A backend-served provider additionally needs the backend to confirm it.
    if (configured === OAUTH_STATE.ENABLED && provider.served) {
      if (status !== 'ready') {
        state = OAUTH_STATE.UNKNOWN;
        reason = 'Backend availability could not be checked, so the provider is withheld.';
      } else if (availability?.[provider.key] !== true) {
        state = OAUTH_STATE.NOT_CONFIGURED;
        reason = 'Configured, but the backend reports it cannot serve this flow.';
      }
    }

    description[provider.flag] = {
      provider: provider.key,
      state,
      configuredState: configured,
      backendServed: provider.served,
      usable: state === OAUTH_STATE.ENABLED,
      reason,
    };
  }

  return description;
};
