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
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 1000, padding: '24px',
  },
  dialog: {
    background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px', width: '100%', maxHeight: '90vh',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' },
  closeBtn: {
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
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
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: '8px',
      }}>
        {label}{required && <span style={{ color: '#f87171', marginLeft: '4px' }}>*</span>}
      </label>
      {children}
      {error && <p style={{ color: '#f87171', fontSize: '12px', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}

// ============================================================
// Input / Select / Textarea
// ============================================================
export const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px',
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
    primary: { background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: '#fff' },
    secondary: { background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' },
    danger: { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' },
    ghost: { background: 'none', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' },
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
interface BadgeProps { children: React.ReactNode; color?: string; bg?: string; }
export function Badge({ children, color = '#c4b5fd', bg = 'rgba(124,58,237,0.15)' }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '100px',
      fontSize: '12px', fontWeight: 600, color, background: bg, letterSpacing: '0.3px',
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
                letterSpacing: '0.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
                borderBottom: '1px solid rgba(255,255,255,0.08)', width: col.width,
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{
                padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)',
              }}>{emptyText}</td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)' }}>
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
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px', padding: '24px 20px',
    }}>
      {icon && <div style={{ fontSize: '24px', marginBottom: '12px' }}>{icon}</div>}
      <div style={{ fontSize: '30px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{label}</div>
      {delta && <div style={{ fontSize: '12px', color: '#34d399', marginTop: '8px' }}>{delta}</div>}
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '14px', padding: '28px', maxWidth: '380px', width: '100%', margin: '16px' }}>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '15px', margin: '0 0 20px' }}>{message}</p>
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
      border: `3px solid rgba(124,58,237,0.2)`,
      borderTopColor: '#7c3aed',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
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
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#fff' }}>{title}</h1>
        {subtitle && <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{subtitle}</p>}
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
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
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
    <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)',
      padding: '4px', borderRadius: '10px', width: 'fit-content', marginBottom: '24px' }}>
      {tabs.map((tab) => (
        <button key={tab.key} onClick={() => onChange(tab.key)} style={{
          padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
          background: active === tab.key ? 'rgba(124,58,237,0.8)' : 'none',
          color: active === tab.key ? '#fff' : 'rgba(255,255,255,0.5)',
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
        color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>🔍</span>
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
