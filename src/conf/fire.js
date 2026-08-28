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
 *  - When no Firebase Authentication client configuration is present, the
 *    app still boots: `fire.auth()` returns a
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
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
        };
        fire = firebase.initializeApp(config);
    } catch (error) {
        initializationError = error;
        console.warn('[Firebase] Client initialization failed; running in no-Firebase mode:', error?.code || error?.message);
        fire = null;
    }
} else {
    console.info('[Firebase Auth] Client identity configuration is absent; authentication features are unavailable while the MariaDB application-data API remains independent.');
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

// ───────────────────────────────────────────────────────────────────────────
// Local identity mode (no-Firebase environments only):
//
// When the build has VITE_LOCAL_AUTH=true (or a VITE_PREVIEW_TOKEN is baked
// in) and no Firebase configuration exists, `fire.auth()` returns a local
// session-backed auth implementation:
//   - the real login/registration forms authenticate against the backend's
//     non-production preview-login endpoint (POST /api/auth/preview-login),
//     which is itself inert in NODE_ENV=production deployments;
//   - sessions persist in localStorage and restore on reload;
//   - uid is deterministic per email, so accounts isolate exactly like real
//     identities (multi-tenant browser E2E works).
// Production builds (Firebase configured, or no local flag) never reach this
// code path; without the flag the null-auth stub below still fails closed.
// ───────────────────────────────────────────────────────────────────────────
const LOCAL_SESSION_KEY = 'resumepilot_local_session_v1';

function decodeTokenPayload(token) {
    try {
        return JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (_e) { return {}; }
}

function createLocalAuth(bootstrapToken) {
    let session = null;
    try {
        const raw = localStorage.getItem(LOCAL_SESSION_KEY);
        if (raw) session = JSON.parse(raw);
    } catch (_e) { /* corrupted session storage must not break boot */ }
    if (!session && bootstrapToken) {
        const claims = decodeTokenPayload(bootstrapToken);
        session = {
            token: bootstrapToken,
            uid: claims.uid || 'preview-user',
            email: claims.email || null,
            displayName: claims.email ? claims.email.split('@')[0] : 'Preview User',
            role: claims.role || 'USER',
            exp: claims.exp || 0,
        };
        try { localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session)); } catch (_e) { /* storage unavailable */ }
    }

    const sessionValid = () => Boolean(session && (!session.exp || session.exp * 1000 > Date.now() + 60_000));
    let signedOut = false;
    const listeners = new Set();

    const makeUser = () => {
        if (!sessionValid()) return null;
        const snapshot = session;
        return {
            uid: snapshot.uid,
            email: snapshot.email,
            displayName: snapshot.displayName || (snapshot.email ? snapshot.email.split('@')[0] : 'User'),
            emailVerified: true,
            providerData: [],
            getIdToken: async () => {
                if (!sessionValid()) throw Object.assign(new Error('Local session expired'), { code: 'auth/user-token-expired' });
                return snapshot.token;
            },
            getIdTokenResult: async () => ({ token: snapshot.token, claims: decodeTokenPayload(snapshot.token) }),
        };
    };
    const currentUser = () => (!signedOut && sessionValid() ? makeUser() : null);
    const notify = () => {
        const user = currentUser();
        listeners.forEach(cb => { try { cb(user); } catch (_e) { /* listener errors must not break auth */ } });
    };

    async function authenticate(email, password, name) {
        const res = await fetch('/api/auth/preview-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.token) {
            const err = new Error(data.error?.message || 'Sign-in failed');
            err.code = data.error?.code || 'auth/operation-not-allowed';
            throw err;
        }
        const claims = decodeTokenPayload(data.token);
        session = {
            token: data.token,
            uid: data.uid,
            email: data.email,
            displayName: data.displayName || (data.email ? data.email.split('@')[0] : 'User'),
            role: data.role || 'USER',
            exp: claims.exp || 0,
        };
        signedOut = false;
        try { localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session)); } catch (_e) { /* storage unavailable */ }
        notify();
        return { user: makeUser() };
    }

    const subscribe = (cb) => {
        listeners.add(cb);
        setTimeout(() => { try { cb(currentUser()); } catch (_e) { /* noop */ } }, 0);
        return () => listeners.delete(cb);
    };

    return {
        get currentUser() { return currentUser(); },
        onAuthStateChanged: subscribe,
        onIdTokenChanged: subscribe,
        signInWithEmailAndPassword: (email, password) => authenticate(email, password),
        createUserWithEmailAndPassword: (email, password) => authenticate(email, password),
        signOut: () => {
            signedOut = true;
            session = null;
            try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch (_e) { /* noop */ }
            notify();
            return Promise.resolve();
        },
        setPersistence: () => Promise.resolve(),
        getRedirectResult: () => Promise.resolve(null),
        sendPasswordResetEmail: () => Promise.resolve(),
        sendEmailVerification: () => Promise.resolve(),
        updateProfile: () => Promise.resolve(),
        useDeviceLanguage: () => undefined,
        languageCode: null,
        signInWithPopup: () => notConfigured('signInWithPopup'),
        signInWithRedirect: () => notConfigured('signInWithRedirect'),
        verifyPasswordResetCode: () => notConfigured('verifyPasswordResetCode'),
        confirmPasswordReset: () => notConfigured('confirmPasswordReset'),
        applyActionCode: () => notConfigured('applyActionCode'),
        fetchSignInMethodsForEmail: () => Promise.resolve([]),
    };
}

const envFlags = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const previewToken = String(envFlags.VITE_PREVIEW_TOKEN || '');
const localAuthEnabled = envFlags.VITE_LOCAL_AUTH === 'true' || Boolean(previewToken);
const localAuth = localAuthEnabled ? createLocalAuth(previewToken) : null;

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
                if (!fire) return localAuth || createNullAuth();
                try { return fire.auth(); } catch (_error) { return localAuth || createNullAuth(); }
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
