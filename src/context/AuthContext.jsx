import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

export const AuthProvider = AuthContext.Provider;
export default AuthContext;

// bs-component-foundation

export const AuthBridge = () => <div className="container-fluid d-none bs-auth" />;
