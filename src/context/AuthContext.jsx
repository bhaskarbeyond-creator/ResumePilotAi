import { createContext, useContext } from 'react';

// eslint-disable-next-line react-refresh/only-export-components -- F-25: context object/hook deliberately co-located with its Provider; splitting churns app-wide import paths for a dev-only benefit.
export const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components -- F-25: context object/hook deliberately co-located with its Provider; splitting churns app-wide import paths for a dev-only benefit.
export function useAuth() {
    return useContext(AuthContext);
}

export const AuthProvider = AuthContext.Provider;
export default AuthContext;

// bs-component-foundation

export const AuthBridge = () => <div className="container-fluid d-none bs-auth" />;
