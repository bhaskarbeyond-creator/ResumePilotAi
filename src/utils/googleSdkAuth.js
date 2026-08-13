import fire from '../conf/fire';
import { getSystemSettings, addUser } from '../firestore/dbOperations';

/**
 * Direct Google Identity Services (GIS) / OAuth Fallback Handler for Scenario 3
 * (Executes when Firebase Auth is not configured in Firebase Console, but Google OAuth is triggered)
 */
export async function directGoogleAuthFallback(closeModal, throwError) {
    try {
        const settings = await getSystemSettings();
        const googleConfig = settings?.google || settings?.socialAuth || {};
        const clientId = googleConfig.googleClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID;

        if (!clientId || !clientId.trim()) {
            throw new Error('Google Sign-in is not enabled in Firebase Console, and no Google Client ID was found in Admin Settings.');
        }

        console.log('[Google Fallback] Initializing Direct Google Identity Services with Client ID:', clientId);

        // Load Google Identity Services SDK
        if (!window.google || !window.google.accounts) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = "https://accounts.google.com/gsi/client";
                script.async = true;
                script.defer = true;
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK.'));
                document.body.appendChild(script);
            });
        }

        // Initialize GIS Client
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId.trim(),
            scope: 'email profile openid',
            callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    try {
                        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                        });
                        const userInfo = await res.json();
                        
                        if (userInfo && userInfo.sub) {
                            const email = userInfo.email || `${userInfo.sub}@google.user`;
                            const firstName = userInfo.given_name || (userInfo.name || '').split(' ')[0] || 'User';
                            const lastName = userInfo.family_name || (userInfo.name || '').split(' ').slice(1).join(' ') || '';
                            const customUid = `google:${userInfo.sub}`;

                            // Save to Firestore & send welcome notification ONLY for new users
                            const userRes = await addUser(customUid, firstName, lastName, email);

                            // Store local session
                            localStorage.setItem('google_user_session', JSON.stringify({
                                uid: customUid,
                                email,
                                displayName: userInfo.name || firstName
                            }));

                            if (userRes && userRes.isNewUser) {
                                fetch('/api/notify/user-signup', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userEmail: email, userName: userInfo.name || firstName })
                                }).catch(() => {});
                            }

                            if (closeModal) closeModal();
                            window.location.reload();
                        }
                    } catch (err) {
                        console.error('[Google Direct Auth Error]:', err);
                        if (throwError) throwError('Google login succeeded, but user profile retrieval failed.');
                    }
                }
            },
        });

        tokenClient.requestAccessToken();

    } catch (err) {
        console.error('[Google Fallback Error]:', err);
        if (throwError) throwError(err.message);
        else alert(err.message);
    }
}
