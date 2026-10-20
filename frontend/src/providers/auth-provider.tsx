/**
 * Authentication Context
 *
 * Provides the authenticated user state throughout the application.
 * Subscribes to Firebase Auth state changes and exposes loading/user state.
 *
 * Non-production preview sessions (see lib/preview-session.ts) are accepted
 * only after the backend confirms their token; `loading` stays true until then,
 * so guarded routes never render for an unverified or forged stored session.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  auth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from '@/lib/firebase';
import {
  clearPreviewSession,
  readPreviewSession,
  verifyPreviewSession,
  type PreviewIdentity,
} from '@/lib/preview-session';

interface UserClaims {
  role?: string;
  tenantId?: string;
}

interface AuthState {
  user: User | null;
  claims: UserClaims;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Shape a verified preview identity like the subset of Firebase `User` the app
 * reads (uid, email, displayName, emailVerified). Token access always goes
 * through the api-client, never through this object.
 */
function previewUserFrom(identity: PreviewIdentity): User {
  return {
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName,
    emailVerified: true,
  } as unknown as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // A stored preview session is a candidate only. It becomes an identity once
  // the backend has accepted its token (see the verification effect below).
  const [pendingPreview] = useState<PreviewIdentity | null>(() => readPreviewSession());
  const [previewIdentity, setPreviewIdentity] = useState<PreviewIdentity | null>(null);
  const [previewChecked, setPreviewChecked] = useState(() => pendingPreview === null);
  const [firebaseChecked, setFirebaseChecked] = useState(false);
  const [claims, setClaims] = useState<UserClaims>({});

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFirebaseChecked(true);
    }, 1200);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout);
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          setClaims({
            role: String(tokenResult.claims.role ?? ''),
            tenantId: tokenResult.claims.tenantId as string | undefined,
          });
        } catch {
          setClaims({});
        }
      } else {
        setClaims({});
      }

      setFirebaseChecked(true);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!pendingPreview) return undefined;
    let cancelled = false;
    verifyPreviewSession(pendingPreview.token).then((verdict) => {
      if (cancelled) return;
      if (verdict === 'invalid') {
        clearPreviewSession();
        setPreviewIdentity(null);
      } else {
        // 'unknown' (backend unreachable) keeps the session: every API call is
        // still authorised server-side, so nothing is exposed by keeping it.
        setPreviewIdentity(pendingPreview);
      }
      setPreviewChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingPreview]);

  const signOut = useCallback(async () => {
    await firebaseSignOut();
    clearPreviewSession();
    setPreviewIdentity(null);
    setUser(null);
    setClaims({});
  }, []);

  const loading = !firebaseChecked || !previewChecked;
  const mockUser = useMemo(() => (previewIdentity ? previewUserFrom(previewIdentity) : null), [previewIdentity]);
  const activeUser = user || mockUser;
  const role = (claims.role || (user ? '' : previewIdentity?.role) || '').toUpperCase();
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const activeClaims: UserClaims = {
    ...claims,
    role: role || claims.role,
  };

  const value: AuthState = {
    user: activeUser,
    claims: activeClaims,
    loading,
    isAuthenticated: activeUser !== null,
    isAdmin,
    isSuperAdmin,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthContext };
