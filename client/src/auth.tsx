import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext } from 'react';
import { api, getToken, setToken } from './api';
import type { Me } from './types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/v1/me'),
    enabled: !!getToken(),
    retry: false,
  });

  const value: AuthState = {
    me: getToken() ? (data ?? null) : null,
    loading: !!getToken() && isLoading,
    signIn: async (token) => {
      setToken(token);
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.fetchQuery({ queryKey: ['me'], queryFn: () => api<Me>('/v1/me') });
    },
    signOut: () => {
      setToken(null);
      qc.clear();
      window.location.assign('/login');
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export const isStaff = (me: Me | null) =>
  !!me && (me.roles.includes('admin') || me.roles.includes('manager'));
