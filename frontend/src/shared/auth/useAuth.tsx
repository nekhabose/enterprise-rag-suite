import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, setAccessToken } from '../api/client';
import { GLOBAL_ROLES, Role } from './rbac';

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
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

const normalizeUser = (input: any): AuthUser => ({
  id: Number(input?.id),
  email: String(input?.email ?? ''),
  firstName: String(input?.firstName ?? input?.first_name ?? ''),
  lastName: String(input?.lastName ?? input?.last_name ?? ''),
  role: String(input?.role ?? 'STUDENT') as Role,
  tenantId: input?.tenantId ?? input?.tenant_id ?? null,
  permissions: Array.isArray(input?.permissions) ? input.permissions : [],
  isImpersonating: Boolean(input?.isImpersonating),
  impersonationSession: input?.impersonationSession,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const isGlobalRole = useCallback(() => !!user && GLOBAL_ROLES.includes(user.role), [user]);

  const hasPermission = useCallback((perm: string) => {
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(perm);
  }, [user]);

  const portalFor = useCallback((): 'super-admin' | 'university-admin' | 'user' => {
    if (!user) return 'user';
    if (GLOBAL_ROLES.includes(user.role)) return 'super-admin';
    if (user.role === 'TENANT_ADMIN') return 'university-admin';
    return 'user';
  }, [user]);

  useEffect(() => {
    const restore = async () => {
      try {
        const refresh = await authApi.refresh();
        const accessToken = refresh.data.accessToken ?? refresh.data.token;
        if (!accessToken) throw new Error('Missing access token');
        setAccessToken(accessToken);
        const me = await authApi.me();
        setUser(normalizeUser(me.data.user));
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
    const accessToken = res.data.accessToken ?? res.data.token;
    setAccessToken(accessToken);
    setUser(normalizeUser(res.data.user));
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
