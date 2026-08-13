/**
 * useOAuthSignIn — Centralized OAuth Sign-In Logic
 * 
 * Replaces duplicated signInWithGoogle / signInWithFacebook scattered across
 * Login.jsx and Register.jsx with a single, enterprise-grade implementation.
 *
 * Providers supported:
 *   - Google  (Firebase popup → GIS SDK fallback)
 *   - Facebook (Firebase popup → Direct SDK fallback)
 *   - LinkedIn (Server-side OAuth 2.0 redirect via /api/auth/linkedin)
 *   - GitHub   (Server-side OAuth 2.0 redirect via /api/auth/github)
 *
 * All providers:
 *   - Record authProvider, photoURL, lastLoginAt in Firestore via addUser()
 *   - Gate welcome email behind isNewUser flag (no duplicate emails on re-login)
 *   - Read enable/disable flags from admin module settings
 */

import { useState, useEffect } from 'react';
import fire, { googleProvider, facebookProvider } from '../conf/fire';
import addUser, { updateUserOnLogin } from '../firestore/auth';

/**
 * Fetch admin module settings to check which OAuth providers are enabled.
 * Returns default-enabled (true) for all providers if settings are unavailable.
 */
async function getModuleSettings() {
    try {
        const { getSystemSettings } = await import('../firestore/dbOperations');
        const settings = await getSystemSettings();
        const mods = settings?.modules || {};
        const sa = settings?.socialAuth || {};

        const isLinkedinEnabled = mods.enableLinkedinAuthModule !== false && mods.enableLinkedinLogin !== false && sa.enableLinkedinLogin !== false;
        const isGithubEnabled = mods.enableGithubAuthModule !== false && mods.enableGithubLogin !== false && sa.enableGithubLogin !== false;

        return {
            google: mods.enableGoogleAuthModule !== false,
            facebook: mods.enableFacebookAuthModule !== false,
            linkedin: isLinkedinEnabled,
            github: isGithubEnabled,
        };
    } catch {
        return { google: true, facebook: true, linkedin: true, github: true };
    }
}

/**
 * Dispatch post-OAuth actions: save user to Firestore, fire welcome email if new user.
 */
async function postAuthActions({ uid, displayName, email, photoURL, authProvider }) {
    const nameParts = (displayName || email?.split('@')[0] || 'User').trim().split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || '';

    let isNewUser = false;
    try {
        const result = await addUser(uid, firstName, lastName, email, { authProvider, photoURL });
        isNewUser = result?.isNewUser ?? false;
    } catch (err) {
        console.warn('[useOAuthSignIn] addUser notice:', err.message);
    }

    if (isNewUser) {
        fetch('/api/notify/user-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail: email, userName: displayName || firstName })
        }).catch(() => {});
    } else {
        // Always refresh profile metadata on subsequent logins
        updateUserOnLogin(uid, { photoURL, displayName, authProvider }).catch(() => {});
    }

    return { isNewUser };
}

export function useOAuthSignIn({ onSuccess, onError } = {}) {
    const [loading, setLoading] = useState(null); // null | 'google' | 'facebook' | 'linkedin' | 'github'
    const [providers, setProviders] = useState({ google: true, facebook: true, linkedin: false, github: false });

    useEffect(() => {
        getModuleSettings().then(setProviders).catch(() => {});
    }, []);

    const handleError = (provider, error) => {
        setLoading(null);
        console.error(`[useOAuthSignIn] ${provider} error:`, error);
        let msg = error?.message || `${provider} sign-in failed.`;

        if (error?.code === 'auth/popup-closed-by-user') {
            msg = 'Sign-in popup was closed. Please try again.';
        } else if (error?.code === 'auth/popup-blocked') {
            msg = 'Popup was blocked by your browser. Please allow popups for this site.';
        } else if (error?.code === 'auth/too-many-requests') {
            msg = 'Too many sign-in attempts. Please wait a moment and try again.';
        }

        if (onError) onError(msg);
    };

    // ─── Google ─────────────────────────────────────────────────────────────────
    const signInWithGoogle = async () => {
        if (loading) return;
        setLoading('google');
        try {
            const result = await fire.auth().signInWithPopup(googleProvider);
            const u = result.user;
            await postAuthActions({
                uid: u.uid,
                displayName: u.displayName,
                email: u.email,
                photoURL: u.photoURL,
                authProvider: 'google'
            });
            setLoading(null);
            if (onSuccess) onSuccess('google');
        } catch (error) {
            if (error.code === 'auth/popup-blocked') {
                fire.auth().signInWithRedirect(googleProvider);
                setLoading(null);
                return;
            }
            if (
                error.code === 'auth/operation-not-allowed' ||
                error.code === 'auth/unauthorized-domain' ||
                error.code === 'auth/configuration-not-found'
            ) {
                console.log('[Google Fallback] Firebase Auth not configured — using GIS SDK fallback.');
                try {
                    const { directGoogleAuthFallback } = await import('../utils/googleSdkAuth');
                    directGoogleAuthFallback(
                        () => { setLoading(null); if (onSuccess) onSuccess('google'); },
                        (msg) => { setLoading(null); if (onError) onError(msg); }
                    );
                    return;
                } catch (sdkErr) {
                    handleError('Google', sdkErr);
                    return;
                }
            }
            handleError('Google', error);
        }
    };

    // ─── Facebook ────────────────────────────────────────────────────────────────
    const signInWithFacebook = async () => {
        if (loading) return;
        setLoading('facebook');
        try {
            const result = await fire.auth().signInWithPopup(facebookProvider);
            const u = result.user;
            await postAuthActions({
                uid: u.uid,
                displayName: u.displayName,
                email: u.email,
                photoURL: u.photoURL,
                authProvider: 'facebook'
            });
            setLoading(null);
            if (onSuccess) onSuccess('facebook');
        } catch (error) {
            if (error.code === 'auth/popup-blocked') {
                fire.auth().signInWithRedirect(facebookProvider);
                setLoading(null);
                return;
            }
            if (
                error.code === 'auth/operation-not-allowed' ||
                error.code === 'auth/unauthorized-domain' ||
                error.code === 'auth/configuration-not-found'
            ) {
                console.log('[FB Fallback] Firebase Auth not configured — using Direct FB SDK fallback.');
                try {
                    const { directFacebookAuthFallback } = await import('../utils/facebookSdkAuth');
                    directFacebookAuthFallback(
                        () => { setLoading(null); if (onSuccess) onSuccess('facebook'); },
                        (msg) => { setLoading(null); if (onError) onError(msg); }
                    );
                    return;
                } catch (sdkErr) {
                    handleError('Facebook', sdkErr);
                    return;
                }
            }
            handleError('Facebook', error);
        }
    };

    // ─── LinkedIn (Server-Side OAuth 2.0) ────────────────────────────────────────
    const signInWithLinkedIn = () => {
        if (loading || !providers.linkedin) return;
        setLoading('linkedin');
        // Redirect to backend — full server-side OAuth flow
        // Backend will redirect back to /dashboard after successful auth
        window.location.href = '/api/auth/linkedin';
    };

    // ─── GitHub (Server-Side OAuth 2.0) ──────────────────────────────────────────
    const signInWithGitHub = () => {
        if (loading || !providers.github) return;
        setLoading('github');
        window.location.href = '/api/auth/github';
    };

    const anySocialEnabled = providers.google || providers.facebook || providers.linkedin || providers.github;

    return {
        loading,
        providers,
        anySocialEnabled,
        signInWithGoogle,
        signInWithFacebook,
        signInWithLinkedIn,
        signInWithGitHub,
    };
}
