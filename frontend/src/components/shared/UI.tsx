import React, { useState } from 'react';

// ============================================================
// Modal
// ============================================================
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  if (!open) return null;
  return (
    <div style={modalStyles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...modalStyles.dialog, maxWidth: width }}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>{title}</h2>
          <button style={modalStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={modalStyles.body}>{children}</div>
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--overlay-soft)',
    backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 1000, padding: '24px',
  },
  dialog: {
    background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
    borderRadius: '16px', width: '100%', maxHeight: '90vh',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)',
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--text-secondary)',
    fontSize: '18px', cursor: 'pointer', padding: '4px 8px',
  },
  body: { padding: '24px', overflowY: 'auto', flex: 1 },
};

// ============================================================
// Form Field
// ============================================================
interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
}
export function Field({ label, required, children, error }: FieldProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{
        display: 'block', fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px',
        textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px',
      }}>
        {label}{required && <span style={{ color: 'var(--status-danger)', marginLeft: '4px' }}>*</span>}
      </label>
      {children}
      {error && <p style={{ color: 'var(--status-danger)', fontSize: '12px', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}

// ============================================================
// Input / Select / Textarea
// ============================================================
export const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
    background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '14px',
  outline: 'none', fontFamily: "'DM Sans', sans-serif",
};

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input style={inputStyle} {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select style={{ ...inputStyle, appearance: 'none' }} {...props} />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} {...props} />;
}

// ============================================================
// Button
// ============================================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, children, disabled, style, ...props }: ButtonProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    borderRadius: '8px', fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.7 : 1, border: 'none', transition: 'opacity 0.15s',
    fontFamily: "'DM Sans', sans-serif",
    padding: size === 'sm' ? '7px 14px' : '10px 18px',
    fontSize: size === 'sm' ? '13px' : '14px',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'linear-gradient(135deg, var(--teal-500), var(--teal-700))', color: 'var(--text-inverse)' },
    secondary: { background: 'var(--surface-subtle)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' },
    danger: { background: 'var(--status-danger-soft)', color: 'var(--status-danger)', border: '1px solid color-mix(in srgb, var(--status-danger) 25%, transparent)' },
    ghost: { background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' },
  };
  return (
    <button disabled={disabled || loading} style={{ ...base, ...variants[variant], ...style }} {...props}>
      {loading ? '...' : children}
    </button>
  );
}

// ============================================================
// Badge
// ============================================================
interface BadgeProps { children: React.ReactNode; color?: string; bg?: string; style?: React.CSSProperties; }
export function Badge({ children, color = 'var(--teal-700)', bg = 'var(--brand-soft)', style }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '100px',
      fontSize: '12px', fontWeight: 600, color, background: bg, letterSpacing: '0.3px', ...style,
    }}>{children}</span>
  );
}

// ============================================================
// Table
// ============================================================
interface TableProps {
  columns: { key: string; label: string; width?: string }[];
  data: Record<string, unknown>[];
  renderCell?: (row: Record<string, unknown>, key: string) => React.ReactNode;
  emptyText?: string;
}
export function Table({ columns, data, renderCell, emptyText = 'No data' }: TableProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{
                padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
                letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-default)', width: col.width,
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{
                padding: '40px', textAlign: 'center', color: 'var(--text-secondary)',
              }}>{emptyText}</td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-default)' }}>
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                    {renderCell ? renderCell(row, col.key) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// StatCard
// ============================================================
interface StatCardProps { label: string; value: string | number; icon?: string; delta?: string; }
export function StatCard({ label, value, icon, delta }: StatCardProps) {
  return (
    <div style={{
      background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
      borderRadius: '14px', padding: '24px 20px',
    }}>
      {icon && <div style={{ fontSize: '24px', marginBottom: '12px' }}>{icon}</div>}
      <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</div>
      {delta && <div style={{ fontSize: '12px', color: 'var(--status-success)', marginTop: '8px' }}>{delta}</div>}
    </div>
  );
}

// ============================================================
// Confirm Dialog
// ============================================================
interface ConfirmProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
}
export function Confirm({ open, message, onConfirm, onCancel, confirmLabel = 'Confirm', variant = 'danger' }: ConfirmProps) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-strong)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '14px', padding: '28px', maxWidth: '380px', width: '100%', margin: '16px' }}>
        <p style={{ color: 'var(--text-primary)', fontSize: '15px', margin: '0 0 20px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Spinner
// ============================================================
export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      border: '3px solid var(--brand-soft-strong)',
      borderTopColor: 'var(--teal-600)',
      borderRadius: '50%',
      
    }} />
  );
}

// ============================================================
// PageHeader
// ============================================================
export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h1>
        {subtitle && <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

// ============================================================
// Card
// ============================================================
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
      borderRadius: '14px', padding: '24px', ...style,
    }}>{children}</div>
  );
}

// ============================================================
// Tabs
// ============================================================
interface TabsProps {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-elevated)',
      padding: '4px', borderRadius: '10px', width: 'fit-content', marginBottom: '24px', border: '1px solid var(--border-subtle)' }}>
      {tabs.map((tab) => (
        <button key={tab.key} onClick={() => onChange(tab.key)} style={{
          padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
          background: active === tab.key ? 'var(--teal-600)' : 'transparent',
          color: active === tab.key ? 'var(--text-inverse)' : 'var(--text-secondary)',
          fontFamily: "'DM Sans', sans-serif",
        }}>{tab.label}</button>
      ))}
    </div>
  );
}

// ============================================================
// Search Input
// ============================================================
export function SearchInput({ value, onChange, placeholder = 'Search...' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-muted)', fontSize: '14px' }}>🔍</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingLeft: '36px' }}
      />
    </div>
  );
}

// ============================================================
// Inject CSS animation for Spinner
// ============================================================
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
