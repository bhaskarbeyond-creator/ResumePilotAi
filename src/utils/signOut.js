import fire from '../conf/fire';

/**
 * Enterprise centralized sign-out utility.
 *
 * Clears ALL OAuth session tokens (LinkedIn, GitHub, Google SDK fallback, Facebook SDK fallback)
 * in addition to Firebase Auth sign-out, so that mock-user sessions in AuthContext are fully
 * destroyed and cannot re-hydrate on the next onAuthStateChanged tick.
 *
 * Usage:
 *   import signOutUser from '../utils/signOut';
 *   await signOutUser();
 *   window.location.href = '/';
 */
const OAUTH_SESSION_KEYS = [
    'oauth_user_session',     // LinkedIn / GitHub server-side callback
    'linkedin_user_session',  // provider-specific alias
    'github_user_session',    // provider-specific alias
    'google_user_session',    // Google GIS SDK fallback
    'fb_user_session',        // Facebook SDK fallback
];

export async function signOutUser() {
    // 1. Clear all OAuth session tokens first (prevents re-hydration race)
    OAUTH_SESSION_KEYS.forEach((key) => {
        try { localStorage.removeItem(key); } catch (_) {}
    });

    // 2. Clear app-specific cached data
    localStorage.removeItem('user');
    localStorage.removeItem('currentResumeId');
    localStorage.removeItem('currentResumeItem');

    // 3. Firebase sign-out (safe even if already signed out)
    try {
        await fire.auth().signOut();
    } catch (err) {
        // Non-fatal — user session is already cleared from localStorage
        console.warn('[signOutUser] Firebase signOut notice:', err.message);
    }
}

export default signOutUser;
