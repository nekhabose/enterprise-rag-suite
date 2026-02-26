import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Login() {
  const { login, portalFor } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      const portal = portalFor();
      if (portal === 'super-admin') navigate('/super-admin');
      else if (portal === 'university-admin') navigate('/university-admin');
      else navigate('/portal');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message || 'Invalid credentials';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="var(--brand-900)"/>
              <path d="M7 8h14M7 14h10M7 20h12" stroke="var(--brand-600)" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={styles.logoText}>EduLMS</span>
        </div>

        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.subtitle}>Sign in to your account</p>

        {error && <div style={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              style={styles.input}
              required
              autoFocus
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              required
            />
          </label>

          <button type="submit" disabled={submitting} style={{
            ...styles.button,
            opacity: submitting ? 0.7 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={styles.hints}>
          <p style={styles.hintsTitle}>Demo accounts</p>
          {[
            { label: 'Super Admin', email: 'superadmin@platform.local', pw: 'SAdm!2026#T7kL' },
            { label: 'University Admin', email: 'admin@state.edu', pw: 'TAdm!2026#P4qN' },
            { label: 'Faculty', email: 'faculty@state.edu', pw: 'Fac!2026#R8mV' },
            { label: 'Student', email: 'student@state.edu', pw: 'Stu!2026#W2xJ' },
          ].map(({ label, email: e, pw }) => (
            <button
              key={label}
              type="button"
              style={styles.hintButton}
              onClick={() => { setEmail(e); setPassword(pw); }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(160deg, var(--brand-50) 0%, var(--bg-canvas) 45%, var(--brand-100) 100%)',
    padding: '24px',
    fontFamily: "'DM Sans', sans-serif",
  },
  card: {
    background: 'var(--surface-card)',
    border: '1px solid var(--border-default)',
    borderRadius: '20px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
    backdropFilter: 'blur(20px)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '32px',
  },
  logoIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.5px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '0 0 8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--text-secondary)',
    margin: '0 0 28px',
  },
  errorBanner: {
    background: 'var(--status-danger-soft)',
    border: '1px solid color-mix(in srgb, var(--status-danger) 28%, transparent)',
    borderRadius: '8px',
    color: 'var(--status-danger)',
    padding: '12px 16px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
  },
  input: {
    background: 'var(--surface-subtle)',
    border: '1px solid var(--border-default)',
    borderRadius: '10px',
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.15s',
    fontFamily: "'DM Sans', sans-serif",
  },
  button: {
    background: 'linear-gradient(135deg, var(--brand-500), var(--brand-600))',
    border: 'none',
    borderRadius: '10px',
    color: 'var(--text-inverse)',
    fontSize: '15px',
    fontWeight: 600,
    padding: '14px',
    marginTop: '8px',
    transition: 'opacity 0.15s, transform 0.1s',
    fontFamily: "'DM Sans', sans-serif",
  },
  hints: {
    marginTop: '32px',
    padding: '20px',
    background: 'var(--surface-subtle)',
    borderRadius: '12px',
    border: '1px solid var(--border-default)',
  },
  hintsTitle: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    margin: '0 0 12px',
  },
  hintButton: {
    display: 'inline-block',
    margin: '4px',
    padding: '6px 14px',
    borderRadius: '100px',
    border: '1px solid color-mix(in srgb, var(--brand-600) 40%, transparent)',
    background: 'var(--brand-soft)',
    color: 'var(--brand-700)',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'background 0.15s',
  },
};
