import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { setUnauthorizedHandler } from '../services/apiClient';
import { authService } from '../services/authService';
import { CurrentUser } from '../types';

interface AuthState {
  user: CurrentUser | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true });

  const logout = useCallback(async () => {
    await authService.logout();
    setState({ user: null, isLoading: false });
  }, []);

  // Register the 401 handler so apiClient can trigger logout
  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  // Restore session on app start
  useEffect(() => {
    let active = true;
    async function restoreSession() {
      const [authenticated, user] = await Promise.all([
        authService.isAuthenticated(),
        authService.getCurrentUser(),
      ]);
      if (active) {
        setState({ user: authenticated ? user : null, isLoading: false });
      }
    }
    restoreSession();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await authService.login(email, password);
    const user = await authService.getCurrentUser();
    setState({ user, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
