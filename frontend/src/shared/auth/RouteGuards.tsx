import React from 'react';
import { Navigate } from 'react-router-dom';
import { Role, hasRole as roleCheck, hasPermission as permissionCheck } from './rbac';
import { useAuth } from './useAuth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireRole({ children, roles }: { children: React.ReactNode; roles: Role[] }) {
  const { user } = useAuth();
  if (!user || !roleCheck(user.role, roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequirePermission({ children, permission }: { children: React.ReactNode; permission: string }) {
  const { user } = useAuth();
  if (!user || !permissionCheck(user.permissions, permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
