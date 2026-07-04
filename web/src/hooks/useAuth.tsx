import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { apiClient } from '../api/client';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (organizationName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('jobScheduler.token'));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('jobScheduler.user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  const applyAuth = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem('jobScheduler.token', newToken);
    localStorage.setItem('jobScheduler.user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiClient.post('/api/auth/login', { email, password });
      applyAuth(res.data.token, res.data.user);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (organizationName: string, email: string, password: string) => {
      const res = await apiClient.post('/api/auth/register', { organizationName, email, password });
      applyAuth(res.data.token, res.data.user);
    },
    [applyAuth],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('jobScheduler.token');
    localStorage.removeItem('jobScheduler.user');
    setToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ token, user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
