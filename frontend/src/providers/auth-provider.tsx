/**
 * Authentication Context
 *
 * Provides the authenticated user state throughout the application.
 * Subscribes to Firebase Auth state changes and exposes loading/user state.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  auth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from '@/lib/firebase';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [mockUser, setMockUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('ime_dev_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [claims, setClaims] = useState<UserClaims>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(false);
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

      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut();
    try {
      localStorage.removeItem('ime_dev_user');
    } catch {
      // Ignore
    }
    setMockUser(null);
    setUser(null);
    setClaims({});
  }, []);

  const activeUser = user || mockUser;
  const role = (claims.role || (mockUser as unknown as { role?: string })?.role)?.toUpperCase() ?? '';
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
