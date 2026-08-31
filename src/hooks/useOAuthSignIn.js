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
 *   - Record authProvider, photoURL, and login metadata through the MariaDB profile API
 *   - Gate welcome email behind isNewUser flag (no duplicate emails on re-login)
 *   - Read enable/disable flags from admin module settings
 */

import { useState, useEffect } from 'react';
import fire, { googleProvider, facebookProvider } from '../conf/fire';
import addUser, { updateUserOnLogin } from '../services/api/users';

/** Fetch authoritative module settings. Provider launch fails closed when the
 * MariaDB projection is unavailable; Firebase Authentication remains the
 * identity plane and resumes as soon as its explicit provider flag is loaded. */
async function getModuleSettings() {
    try {
        const { getSystemSettings } = await import('../services/api/platform');
        const settings = await getSystemSettings();
        if (settings?._settingsSource !== 'remote' || settings?._settingsStale === true) {
            return { google: false, facebook: false, linkedin: false, github: false };
        }
        const mods = settings?.modules || {};
        const sa = settings?.socialAuth || {};
        return {
            google: mods.enableGoogleAuthModule === true,
            facebook: mods.enableFacebookAuthModule === true,
            linkedin: mods.enableLinkedinAuthModule === true && sa.enableLinkedinLogin === true,
            github: mods.enableGithubAuthModule === true && sa.enableGithubLogin === true,
        };
    } catch {
        return { google: false, facebook: false, linkedin: false, github: false };
    }
}

/** Persist the OAuth profile through the MariaDB API; account-created mail is
 * enqueued by the same server transaction when the profile is first inserted. */
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

    if (!isNewUser) {
        // Always refresh profile metadata on subsequent logins.
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
