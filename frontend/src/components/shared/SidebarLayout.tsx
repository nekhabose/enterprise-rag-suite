import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  permission?: string;
}

interface SidebarLayoutProps {
  navItems: NavItem[];
  title: string;
  subtitle?: string;
  accentColor?: string;
  children: React.ReactNode;
}

export default function SidebarLayout({
  navItems,
  title,
  subtitle,
  accentColor = '#7c3aed',
  children,
}: SidebarLayoutProps) {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Logout failed');
    } finally {
      setLoggingOut(false);
    }
  };

  const visibleItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        {/* Brand */}
        <div style={styles.brand}>
          <div style={{ ...styles.brandDot, background: accentColor }} />
          <div>
            <div style={styles.brandTitle}>{title}</div>
            {subtitle && <div style={styles.brandSubtitle}>{subtitle}</div>}
          </div>
        </div>

        {/* Impersonation Banner */}
        {user?.isImpersonating && (
          <div style={{ ...styles.impersonationBanner, borderColor: accentColor }}>
            <span>👤 Impersonating tenant</span>
          </div>
        )}

        {/* Nav */}
        <nav style={styles.nav}>
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? { ...styles.navItemActive, background: `${accentColor}22`, color: '#fff' } : {}),
              })}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Footer */}
        <div style={styles.userFooter}>
          <div style={styles.avatar}>{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.userName}>{user?.firstName} {user?.lastName}</div>
            <div style={styles.userRole}>{user?.role?.replace(/_/g, ' ')}</div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={styles.logoutBtn}
            title="Sign out"
          >
            ↪
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={styles.main}>
        <div style={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    background: '#0f0f1a',
    fontFamily: "'DM Sans', sans-serif",
    color: '#fff',
    overflow: 'hidden',
  },
  sidebar: {
    width: '240px',
    minWidth: '240px',
    background: 'rgba(255,255,255,0.03)',
    borderRight: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  brandDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  brandTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.2,
  },
  brandSubtitle: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.4)',
    marginTop: '2px',
  },
  impersonationBanner: {
    margin: '12px 16px 0',
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid',
    color: '#fcd34d',
    fontSize: '12px',
    fontWeight: 600,
  },
  nav: {
    flex: 1,
    padding: '12px 12px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 12px',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.55)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.15s',
  } as React.CSSProperties,
  navItemActive: {
    color: '#fff',
  },
  navIcon: {
    fontSize: '16px',
    width: '20px',
    textAlign: 'center',
  },
  userFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 16px',
    borderTop: '1px solid rgba(255,255,255,0.07)',
  },
  avatar: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 700,
    flexShrink: 0,
  },
  userName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  userRole: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  logoutBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.3)',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
    flexShrink: 0,
    transition: 'color 0.15s',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
  },
  content: {
    padding: '32px',
    maxWidth: '1200px',
  },
};
