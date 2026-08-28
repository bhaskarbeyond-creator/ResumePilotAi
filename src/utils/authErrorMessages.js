const AUTH_ERROR_MESSAGES = {
  'auth/not-configured': 'Authentication is not configured for this environment. Please contact support.',
  'auth/invalid-credential': 'Invalid credentials. Please check your email and password or use Forgot password.',
  'auth/user-not-found': 'Invalid credentials. Please check your email and password or use Forgot password.',
  'auth/wrong-password': 'Invalid credentials. Please check your email and password or use Forgot password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Access to this account has been temporarily disabled due to many failed login attempts. You can restore access by resetting your password.',
  'auth/email-already-in-use': 'An account already exists for this email. Sign in or use Forgot password.',
  'auth/account-exists-with-different-credential': 'An account with this email already exists with another sign-in method. Please use the original method or reset your password.',
  'auth/operation-not-allowed': 'This sign-in method is not available right now. Please use another method or contact support.',
  'auth/unauthorized-domain': 'This sign-in domain is not authorized. Please contact support.',
  'auth/configuration-not-found': 'This sign-in provider is not fully configured. Please contact support.',
  'auth/popup-blocked': 'The sign-in popup was blocked. Please allow popups or try redirect sign-in.',
  'auth/popup-closed-by-user': '',
  'auth/network-request-failed': 'Network error while contacting the identity provider. Please check your connection and try again.',
};

export function getSafeAuthErrorMessage(error, fallback = 'Authentication failed. Please try again or contact support.') {
  const code = error?.code || error?.customData?._tokenResponse?.error?.message;
  if (code && AUTH_ERROR_MESSAGES[code] !== undefined) return AUTH_ERROR_MESSAGES[code];
  return fallback;
}

export default getSafeAuthErrorMessage;
