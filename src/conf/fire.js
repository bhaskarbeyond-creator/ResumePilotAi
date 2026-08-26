/**
 * Firebase client — AUTH-ONLY bootstrap.
 *
 * ARCHITECTURE (zero-Firestore):
 *  - Only `firebase/compat/auth` is imported. The Firestore, Realtime
 *    Database and Functions compat modules are intentionally NOT loaded, so
 *    the browser bundle contains no Firestore SDK and no code path can issue
 *    a Firestore read/write/listener.
 *  - Firebase Auth remains the identity provider (login, ID tokens). It is
 *    an identity service, not a database; the application data plane is
 *    MySQL/MariaDB via the backend API.
 *  - When no VITE_FIREBASE_* configuration is present (Firestore-OFF / no
 *    Firebase environments) the app still boots: `fire.auth()` returns a
 *    null-auth stub whose API mirrors Firebase Auth and whose operations
 *    fail with controlled `auth/not-configured` errors instead of throwing
 *    synchronously or hanging.
 */

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

const hasFirebaseConfig = () => {
    const env = import.meta.env || {};
    return Boolean(env.VITE_FIREBASE_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
};

let fire = null;
let initializationError = null;

if (hasFirebaseConfig()) {
    try {
        const config = {
            apiKey: import.meta.env.VITE_FIREBASE_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
        };
        fire = firebase.initializeApp(config);
    } catch (error) {
        initializationError = error;
        console.warn('[Firebase] Client initialization failed; running in no-Firebase mode:', error?.code || error?.message);
        fire = null;
    }
} else {
    console.info('[Firebase] No VITE_FIREBASE_* configuration present; running in no-Firebase mode (MySQL data plane, API auth).');
}

// ───────────────────────────────────────────────────────────────────────────
// Null-auth stub: keeps the same surface as firebase.auth() so every
// component works without a Firebase config and fails with a controlled,
// explainable error instead of a runtime exception.
// ───────────────────────────────────────────────────────────────────────────
const notConfigured = (operation) => {
    const error = new Error(`Firebase Auth is not configured in this environment (${operation}).`);
    error.code = 'auth/not-configured';
    return Promise.reject(error);
};

function createNullAuth() {
    const noop = () => undefined;
    return {
        currentUser: null,
        onAuthStateChanged: () => noop,
        onIdTokenChanged: () => noop,
        signInWithEmailAndPassword: () => notConfigured('signInWithEmailAndPassword'),
        createUserWithEmailAndPassword: () => notConfigured('createUserWithEmailAndPassword'),
        sendPasswordResetEmail: () => notConfigured('sendPasswordResetEmail'),
        signInWithPopup: () => notConfigured('signInWithPopup'),
        signInWithRedirect: () => notConfigured('signInWithRedirect'),
        getRedirectResult: () => notConfigured('getRedirectResult'),
        signOut: () => Promise.resolve(),
        updateProfile: () => notConfigured('updateProfile'),
        sendEmailVerification: () => notConfigured('sendEmailVerification'),
        verifyPasswordResetCode: () => notConfigured('verifyPasswordResetCode'),
        confirmPasswordReset: () => notConfigured('confirmPasswordReset'),
        applyActionCode: () => notConfigured('applyActionCode'),
        fetchSignInMethodsForEmail: () => notConfigured('fetchSignInMethodsForEmail'),
        useDeviceLanguage: noop,
        languageCode: null,
    };
}

/**
 * OAuth providers for Google/Facebook popup & redirect sign-in. Null when
 * Firebase is not configured — callers must treat null providers as an
 * unconfigured identity provider (the null-auth stub rejects first).
 */
export const googleProvider = fire ? new firebase.auth.GoogleAuthProvider() : null;
export const facebookProvider = fire ? new firebase.auth.FacebookAuthProvider() : null;

const fireProxy = new Proxy({}, {
    get(_target, prop) {
        if (prop === 'auth') {
            return () => {
                if (!fire) return createNullAuth();
                try { return fire.auth(); } catch (_error) { return createNullAuth(); }
            };
        }
        if (prop === 'firestore') {
            // Deliberately unavailable: the frontend has no Firestore data plane.
            // All application data flows through the backend API (MySQL).
            return () => {
                throw Object.assign(
                    new Error('Firestore is not available in the browser. Use the backend API (MySQL authoritative).'),
                    { code: 'firestore/unavailable' }
                );
            };
        }
        if (prop === 'initializeApp' || prop === 'app') {
            return fire ? fire[prop] : undefined;
        }
        if (prop === 'initializationError') return initializationError;
        return fire ? fire[prop] : undefined;
    },
});

// Keep the module shape expected by legacy callers (default export + named).
export default fireProxy;
export { fireProxy as fire };
