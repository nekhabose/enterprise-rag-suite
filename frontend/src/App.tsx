import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login from './components/auth/Login';
import SuperAdminPortal from './portals/SuperAdminPortal';
import UniversityAdminPortal from './portals/UniversityAdminPortal';
import UserPortal from './portals/UserPortal';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f0f1a', fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed',
          animation: 'spin 0.7s linear infinite', margin: '0 auto 16px',
        }} />
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Loading...</div>
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
              background: '#1e1e2e',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#34d399', secondary: '#0f0f1a' } },
            error: { iconTheme: { primary: '#f87171', secondary: '#0f0f1a' } },
          }}
        />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/super-admin/*" element={<SuperAdminPortal />} />
          <Route path="/university-admin/*" element={<UniversityAdminPortal />} />
          <Route path="/portal/*" element={<UserPortal />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
