import fire from '../conf/fire';

const ACCOUNT_SCOPED_LOCAL_KEYS = [
    'user', 'firebase_user', 'user_session',
    'currentResumeId', 'currentResumeItem', 'resumeData',
    'currentCoverId', 'currentCoverItem', 'interviewProgress',
    'oauth_user_session', 'linkedin_user_session', 'github_user_session', 'google_user_session', 'fb_user_session',
];

export function clearAccountScopedBrowserState() {
    for (const key of ACCOUNT_SCOPED_LOCAL_KEYS) {
        try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
    }
    try { sessionStorage.clear(); } catch { /* optional browser storage */ }
}

/** Clear legacy/account-scoped browser state before ending the verified Firebase session. */
export async function signOutUser() {
    clearAccountScopedBrowserState();
    try { await fire.auth().signOut(); }
    catch (error) { console.warn('[signOutUser] Firebase sign-out notice:', error.message); }
}

export default signOutUser;
