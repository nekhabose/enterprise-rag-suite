import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, setAccessToken } from '../utils/api';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'INTERNAL_ADMIN'
  | 'INTERNAL_STAFF'
  | 'TENANT_ADMIN'
  | 'FACULTY'
  | 'STUDENT';

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: number | null;
  permissions: string[];
  isImpersonating?: boolean;
  impersonationSession?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  isGlobalRole: () => boolean;
  portalFor: () => 'super-admin' | 'university-admin' | 'user';
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const GLOBAL_ROLES: UserRole[] = ['SUPER_ADMIN', 'INTERNAL_ADMIN', 'INTERNAL_STAFF'];

  const isGlobalRole = useCallback(() =>
    !!user && GLOBAL_ROLES.includes(user.role), [user]);

  const hasPermission = useCallback((perm: string) => {
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(perm);
  }, [user]);

  const portalFor = useCallback((): 'super-admin' | 'university-admin' | 'user' => {
    if (!user) return 'user';
    if (['SUPER_ADMIN', 'INTERNAL_ADMIN', 'INTERNAL_STAFF'].includes(user.role)) return 'super-admin';
    if (user.role === 'TENANT_ADMIN') return 'university-admin';
    return 'user';
  }, [user]);

  // Try to restore session on mount
  useEffect(() => {
    const restore = async () => {
      try {
        const res = await authApi.refresh();
        setAccessToken(res.data.accessToken);
        const me = await authApi.me();
        setUser(me.data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch {}
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, isGlobalRole, portalFor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
