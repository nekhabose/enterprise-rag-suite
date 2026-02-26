import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { RequireAuth } from './shared/auth/RouteGuards';
import Login from './components/auth/Login';
import SuperAdminPortal from './portals/SuperAdminPortal';
import UniversityAdminPortal from './portals/UniversityAdminPortal';
import UserPortal from './portals/UserPortal';
import { MotionReveal } from './shared/ui/motion';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--surface-bg)', fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          border: '3px solid var(--brand-soft)', borderTopColor: 'var(--teal-600)',
          margin: '0 auto 16px',
        }} />
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading...</div>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (['SUPER_ADMIN', 'INTERNAL_ADMIN', 'INTERNAL_STAFF'].includes(user.role)) return <Navigate to="/super-admin" replace />;
  if (user.role === 'TENANT_ADMIN') return <Navigate to="/university-admin" replace />;
  return <Navigate to="/portal" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--surface-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
            },
            success: { iconTheme: { primary: 'var(--teal-600)', secondary: 'var(--text-inverse)' } },
            error: { iconTheme: { primary: 'var(--status-danger)', secondary: 'var(--text-inverse)' } },
          }}
        />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<MotionReveal><Login /></MotionReveal>} />
          <Route path="/super-admin/*" element={<RequireAuth><MotionReveal><SuperAdminPortal /></MotionReveal></RequireAuth>} />
          <Route path="/university-admin/*" element={<RequireAuth><MotionReveal><UniversityAdminPortal /></MotionReveal></RequireAuth>} />
          <Route path="/portal/*" element={<RequireAuth><MotionReveal><UserPortal /></MotionReveal></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
