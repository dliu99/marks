import { createContext, useContext } from 'react';

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'expired' | 'error';

export type AuthContextValue = {
  authStatus: AuthStatus;
  refreshAuth: () => Promise<AuthStatus>;
  setAuthStatus: (status: AuthStatus) => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within AuthContext.Provider');
  }

  return value;
}
