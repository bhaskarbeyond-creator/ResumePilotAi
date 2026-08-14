import fire from '../conf/fire';
import { clearAccountScopedBrowserState } from './browserState';

export { clearAccountScopedBrowserState } from './browserState';

/** Clear legacy/account-scoped browser state before ending the verified Firebase session. */
export async function signOutUser() {
    clearAccountScopedBrowserState();
    try { await fire.auth().signOut(); }
    catch (error) { console.warn('[signOutUser] Firebase sign-out notice:', error.message); }
}

export default signOutUser;
