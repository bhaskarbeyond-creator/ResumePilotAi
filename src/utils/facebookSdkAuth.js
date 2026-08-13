import fire from '../conf/fire';
import { getSystemSettings } from '../firestore/dbOperations';
import addUser from '../firestore/auth';

/**
 * Direct Facebook SDK / OAuth Fallback Handler for Scenario 3
 * (Executes when Firebase Auth is not configured in Firebase Console, but Admin has valid Facebook App ID in Settings)
 * 
 * FIX: Signup notification is now gated behind isNewUser check — prevents welcome emails on every return login.
 */
export async function directFacebookAuthFallback(closeModal, throwError) {
    try {
        const settings = await getSystemSettings();
        const fbConfig = settings?.facebook || settings?.socialAuth || {};
        const appId = fbConfig.facebookAppId;

        if (!appId || !appId.trim()) {
            throw new Error('Facebook Sign-in is not enabled in Firebase Console, and no Facebook App ID was found in Admin Settings.');
        }

        console.log('[Facebook Fallback] Initializing Direct Facebook SDK with Admin App ID:', appId);

        // Load Facebook SDK dynamically if not present
        if (!window.FB) {
            await new Promise((resolve, reject) => {
                window.fbAsyncInit = function () {
                    window.FB.init({
                        appId: appId.trim(),
                        cookie: true,
                        xfbml: true,
                        version: 'v18.0'
                    });
                    resolve();
                };

                const script = document.createElement('script');
                script.id = 'facebook-jssdk';
                script.src = "https://connect.facebook.net/en_US/sdk.js";
                script.async = true;
                script.defer = true;
                script.onerror = () => reject(new Error('Failed to load Facebook SDK. Please check your browser extensions or network.'));
                document.body.appendChild(script);
            });
        } else {
            window.FB.init({
                appId: appId.trim(),
                cookie: true,
                xfbml: true,
                version: 'v18.0'
            });
        }

        // Trigger Direct Facebook Login Popup
        window.FB.login((response) => {
            if (response.authResponse) {
                window.FB.api('/me', { fields: 'id, name, email, first_name, last_name, picture' }, async (userInfo) => {
                    if (userInfo && userInfo.id) {
                        const email = userInfo.email || `${userInfo.id}@facebook.user`;
                        const firstName = userInfo.first_name || (userInfo.name || '').split(' ')[0] || 'User';
                        const lastName = userInfo.last_name || (userInfo.name || '').split(' ').slice(1).join(' ') || '';
                        const photoURL = userInfo.picture?.data?.url || null;

                        const customUid = `facebook:${userInfo.id}`;

                        try {
                            // Save profile to Firestore and get isNewUser status
                            const result = await addUser(customUid, firstName, lastName, email, {
                                authProvider: 'facebook',
                                photoURL
                            });

                            // Gate welcome email dispatch on isNewUser — prevent duplicate emails for returning users
                            if (result && result.isNewUser) {
                                fetch('/api/notify/user-signup', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userEmail: email, userName: userInfo.name || firstName })
                                }).catch(() => {});
                                console.log('[FB Fallback] New user — welcome email dispatched.');
                            } else {
                                console.log('[FB Fallback] Returning user — skipping welcome email.');
                            }

                            if (closeModal) closeModal();
                            window.location.reload();
                        } catch (err) {
                            console.error('[FB Direct Auth Save Error]:', err);
                            if (throwError) throwError('Facebook login succeeded, but saving user profile failed.');
                        }
                    } else {
                        if (throwError) throwError('Could not fetch user profile details from Facebook.');
                    }
                });
            } else {
                console.warn('[FB Direct Auth] User cancelled login or authorization failed.');
            }
        }, { scope: 'public_profile,email' });

    } catch (err) {
        console.error('[Facebook Fallback Error]:', err);
        if (throwError) throwError(err.message);
        else alert(err.message);
    }
}
