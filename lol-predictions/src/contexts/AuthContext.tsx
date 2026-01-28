import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '../types';
import * as authService from '../services/auth';

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async (): Promise<boolean> => {
    try {
      const result = await authService.refreshToken();
      if (result) {
        setAccessToken(result.accessToken);
        const user = await authService.getCurrentUser(result.accessToken);
        setUser(user);
        return true;
      }
    } catch (error) {
      console.error('Failed to refresh auth:', error);
    }
    setUser(null);
    setAccessToken(null);
    return false;
  }, []);

  // Try to restore session on mount
  useEffect(() => {
    const initAuth = async () => {
      await refreshAuth();
      setIsLoading(false);
    };
    initAuth();
  }, [refreshAuth]);

  // Set up token refresh interval
  useEffect(() => {
    if (!accessToken) return;

    // Refresh token every 10 minutes (before the 15min expiry)
    const interval = setInterval(() => {
      refreshAuth();
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [accessToken, refreshAuth]);

  const login = async (username: string, password: string) => {
    const result = await authService.login(username, password);
    setUser(result.user);
    setAccessToken(result.accessToken);
  };

  const register = async (username: string, password: string, email?: string) => {
    const result = await authService.register(username, password, email);
    setUser(result.user);
    setAccessToken(result.accessToken);
  };

  const logout = async () => {
    if (accessToken) {
      await authService.logout(accessToken);
    }
    setUser(null);
    setAccessToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
