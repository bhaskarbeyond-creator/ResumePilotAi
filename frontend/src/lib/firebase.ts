/**
 * Firebase Auth — Client-side wrapper (Auth-only, zero Firestore)
 *
 * Firebase is used exclusively as an identity provider.
 * All application data flows through the MariaDB-backed REST API.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  type Auth,
  type User,
  type UserCredential,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

if (hasConfig) {
  try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  } catch (error) {
    console.warn('[Firebase] Initialization failed:', error);
  }
}

// Export a safe auth reference that always exists
// When Firebase is not configured, operations will throw controlled errors
class NullAuth {
  get currentUser(): null { return null; }
  onAuthStateChanged(cb: (user: User | null) => void): () => void {
    setTimeout(() => cb(null), 0);
    return () => {};
  }
}

export const auth = (authInstance ?? new NullAuth()) as Auth;

export const googleProvider = hasConfig ? new GoogleAuthProvider() : null;
export const facebookProvider = hasConfig ? new FacebookAuthProvider() : null;

// Re-export Firebase Auth functions for convenience
export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
  type UserCredential,
};

export async function signOut(): Promise<void> {
  if (authInstance) {
    await firebaseSignOut(authInstance);
  }
  // Clear any client-side session state
  try {
    localStorage.removeItem('user');
  } catch {
    // Storage unavailable
  }
}

export function isFirebaseConfigured(): boolean {
  return hasConfig && authInstance !== null;
}
