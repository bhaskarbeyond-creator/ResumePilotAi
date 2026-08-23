/**
 * Human-readable explanations for a failed social sign-in.
 *
 * The OAuth entry points are reached by browser navigation, so when they fail
 * the only channel back to the user is a redirect carrying a reason code. This
 * module turns that code into a sentence a person can act on. Every branch has
 * a message: an unrecognised code still produces an explanation rather than
 * silence, because the failure mode being fixed here is precisely a user
 * clicking a provider button and observing nothing at all.
 */

const PROVIDER_LABELS = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  google: 'Google',
  facebook: 'Facebook',
};

export const labelForProvider = provider => PROVIDER_LABELS[String(provider || '').toLowerCase()] || 'The selected provider';

const MESSAGES = {
  oauth_not_configured: provider =>
    `${labelForProvider(provider)} sign-in is not configured on this deployment. Please use another sign-in method or contact your administrator.`,
  oauth_unavailable: provider =>
    `${labelForProvider(provider)} sign-in is temporarily unavailable. Please try again shortly or use another sign-in method.`,
  github_denied: () => 'GitHub sign-in was cancelled before it completed.',
  linkedin_denied: () => 'LinkedIn sign-in was cancelled before it completed.',
  github_callback_failed: () => 'GitHub sign-in could not be completed. Please try again or use another sign-in method.',
  linkedin_callback_failed: () => 'LinkedIn sign-in could not be completed. Please try again or use another sign-in method.',
};

/**
 * Resolves `?error=…&provider=…` into a message, or null when the query string
 * carries no OAuth error at all.
 */
export const describeOAuthRedirectError = (search, provider) => {
  if (!search) return null;

  let code = '';
  let redirectProvider = provider || '';
  try {
    const params = new URLSearchParams(search);
    code = params.get('error') || '';
    redirectProvider = redirectProvider || params.get('provider') || '';
  } catch (error) {
    return null;
  }

  if (!code) return null;

  const builder = MESSAGES[code];
  if (builder) return builder(redirectProvider);

  // Unknown code: still explain, never fail silently.
  return `Sign-in could not be completed (${code}). Please try again or use another sign-in method.`;
};

/**
 * Removes the OAuth error parameters from the address bar so a refresh does not
 * resurrect a stale message, while leaving any unrelated query intact.
 */
export const stripOAuthRedirectError = (search = '') => {
  try {
    const params = new URLSearchParams(search);
    params.delete('error');
    params.delete('provider');
    const rest = params.toString();
    return rest ? `?${rest}` : '';
  } catch (error) {
    return '';
  }
};
