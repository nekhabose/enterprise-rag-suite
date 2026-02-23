import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from '../components/shared/SidebarLayout';
import {
  Modal, Field, Input, Select, Button, Badge, Table, StatCard,
  Confirm, Spinner, PageHeader, Card, Tabs, SearchInput,
} from '../components/shared/UI';
import { superAdminApi } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { path: '/super-admin', label: 'Dashboard', icon: '📊' },
  { path: '/super-admin/universities', label: 'Universities', icon: '🏛️', permission: 'TENANT_READ' },
  { path: '/super-admin/internal-users', label: 'Internal Team', icon: '👥', permission: 'INTERNAL_USER_READ' },
  { path: '/super-admin/analytics', label: 'Analytics', icon: '📈', permission: 'GLOBAL_ANALYTICS_READ' },
  { path: '/super-admin/audit-logs', label: 'Audit Logs', icon: '🔍', permission: 'AUDIT_LOG_READ' },
];

// ============================================================
// Dashboard
// ============================================================
function Dashboard() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superAdminApi.getDashboard()
      .then((r) => setStats(r.data))
      .catch(() => setStats({
        totalTenants: 0, activeTenants: 0, totalUsers: 0,
        activeUsers: 0, totalDocuments: 0, totalChats: 0,
      }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>;

  const s = stats as Record<string, number>;
  return (
    <div>
      <PageHeader title="Super Admin Dashboard" subtitle="Platform-wide overview" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard label="Total Universities" value={s.totalTenants ?? 0} icon="🏛️" />
        <StatCard label="Active Tenants" value={s.activeTenants ?? 0} icon="✅" />
        <StatCard label="Total Users" value={s.totalUsers ?? 0} icon="👥" />
        <StatCard label="Active Users" value={s.activeUsers ?? 0} icon="🔥" />
        <StatCard label="Documents" value={s.totalDocuments ?? 0} icon="📄" />
        <StatCard label="AI Chats" value={s.totalChats ?? 0} icon="💬" />
      </div>
      <Card>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', margin: 0 }}>
          Welcome to the Super Admin portal. Use the navigation to manage universities, internal team members, view analytics, and audit platform activity.
        </p>
      </Card>
    </div>
  );
}

// ============================================================
// Universities
// ============================================================
function Universities() {
  const [tenants, setTenants] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ name: '', domain: '', slug: '', plan: 'free', maxUsers: '50' });
  const [saving, setSaving] = useState(false);
  const { hasPermission } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await superAdminApi.getTenants();
      setTenants(r.data.tenants ?? r.data ?? []);
    } catch { setTenants([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTenant(null);
    setForm({ name: '', domain: '', slug: '', plan: 'free', maxUsers: '50' });
    setModalOpen(true);
  };
  const openEdit = (t: Record<string, unknown>) => {
    setEditTenant(t);
    setForm({
      name: String(t.name ?? ''), domain: String(t.domain ?? ''),
      slug: String(t.slug ?? ''), plan: String(t.plan ?? 'free'),
      maxUsers: String(t.maxUsers ?? t.max_users ?? 50),
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editTenant) {
        await superAdminApi.updateTenant(editTenant.id as number, form);
        toast.success('University updated');
      } else {
        await superAdminApi.createTenant(form);
        toast.success('University created');
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed';
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await superAdminApi.deleteTenant(deleteTarget.id as number);
      toast.success('University deactivated');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Failed to deactivate'); }
  };

  const filtered = tenants.filter((t) =>
    String(t.name).toLowerCase().includes(search.toLowerCase()) ||
    String(t.domain).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Universities"
        subtitle={`${tenants.length} total institutions`}
        actions={
          hasPermission('TENANT_CREATE') && (
            <Button onClick={openCreate}>+ Add University</Button>
          )
        }
      />

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search universities..." />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><Spinner /></div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', overflow: 'hidden' }}>
          <Table
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'domain', label: 'Domain' },
              { key: 'plan', label: 'Plan' },
              { key: 'is_active', label: 'Status' },
              { key: 'actions', label: '' },
            ]}
            data={filtered}
            renderCell={(row, key) => {
              if (key === 'plan') return <Badge>{String(row.plan ?? '').toUpperCase()}</Badge>;
              if (key === 'is_active') return (
                <Badge color={row.is_active ? '#34d399' : '#f87171'} bg={row.is_active ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)'}>
                  {row.is_active ? 'Active' : 'Inactive'}
                </Badge>
              );
              if (key === 'actions') return (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('TENANT_UPDATE') && (
                    <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
                  )}
                  {hasPermission('TENANT_DELETE') && (
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>Deactivate</Button>
                  )}
                </div>
              );
              return String(row[key] ?? '');
            }}
            emptyText="No universities found"
          />
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTenant ? 'Edit University' : 'Add University'}>
        <form onSubmit={handleSave}>
          <Field label="Institution Name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Domain" required>
            <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="university.edu" required />
          </Field>
          <Field label="Slug" required>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="university-name" required />
          </Field>
          <Field label="Plan">
            <Select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </Field>
          <Field label="Max Users">
            <Input type="number" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} min="1" />
          </Field>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editTenant ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Confirm
        open={!!deleteTarget}
        message={`Are you sure you want to deactivate "${deleteTarget?.name}"? This will prevent all users from logging in.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel="Deactivate"
      />
    </div>
  );
}

// ============================================================
// Internal Users
// ============================================================
function InternalUsers() {
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', role: 'INTERNAL_STAFF', password: '' });
  const [saving, setSaving] = useState(false);
  const { hasPermission } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await superAdminApi.getInternalUsers();
      setUsers(r.data.users ?? r.data ?? []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editUser) {
        await superAdminApi.updateInternalUser(editUser.id as number, form);
        toast.success('User updated');
      } else {
        await superAdminApi.createInternalUser(form);
        toast.success('User created');
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await superAdminApi.deleteInternalUser(deleteTarget.id as number);
      toast.success('User removed');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Failed'); }
  };

  return (
    <div>
      <PageHeader
        title="Internal Team"
        subtitle="Manage employees and contractors"
        actions={
          hasPermission('INTERNAL_USER_WRITE') && (
            <Button onClick={() => { setEditUser(null); setForm({ email: '', firstName: '', lastName: '', role: 'INTERNAL_STAFF', password: '' }); setModalOpen(true); }}>
              + Add Member
            </Button>
          )
        }
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><Spinner /></div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', overflow: 'hidden' }}>
          <Table
            columns={[
              { key: 'email', label: 'Email' },
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'is_active', label: 'Status' },
              { key: 'actions', label: '' },
            ]}
            data={users}
            renderCell={(row, key) => {
              if (key === 'name') return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || '—';
              if (key === 'role') return <Badge>{String(row.role).replace(/_/g, ' ')}</Badge>;
              if (key === 'is_active') return (
                <Badge color={row.is_active ? '#34d399' : '#f87171'} bg={row.is_active ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)'}>
                  {row.is_active ? 'Active' : 'Inactive'}
                </Badge>
              );
              if (key === 'actions') return (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('INTERNAL_USER_WRITE') && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => {
                        setEditUser(row);
                        setForm({ email: String(row.email ?? ''), firstName: String(row.first_name ?? ''), lastName: String(row.last_name ?? ''), role: String(row.role ?? 'INTERNAL_STAFF'), password: '' });
                        setModalOpen(true);
                      }}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>Remove</Button>
                    </>
                  )}
                </div>
              );
              return String(row[key] ?? '');
            }}
            emptyText="No internal users"
          />
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editUser ? 'Edit Team Member' : 'Add Team Member'}>
        <form onSubmit={handleSave}>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="First Name"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
            <Field label="Last Name"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
          </div>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="INTERNAL_ADMIN">Internal Admin</option>
              <option value="INTERNAL_STAFF">Internal Staff</option>
            </Select>
          </Field>
          {!editUser && (
            <Field label="Temporary Password" required>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </Field>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editUser ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Confirm
        open={!!deleteTarget}
        message={`Remove ${deleteTarget?.email} from the internal team?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Analytics
// ============================================================
function Analytics() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    superAdminApi.getAnalytics().then((r) => setData(r.data)).catch(() => setData({}));
  }, []);

  const metrics = data as Record<string, number> ?? {};
  return (
    <div>
      <PageHeader title="Global Analytics" subtitle="Platform-wide usage metrics" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard label="Monthly Active Users" value={metrics.mau ?? 0} icon="👤" />
        <StatCard label="Documents Processed" value={metrics.documents ?? 0} icon="📄" />
        <StatCard label="AI Chat Messages" value={metrics.chatMessages ?? 0} icon="💬" />
        <StatCard label="Assessments Taken" value={metrics.assessments ?? 0} icon="✏️" />
        <StatCard label="Ingestion Jobs" value={metrics.ingestionJobs ?? 0} icon="⚙️" />
        <StatCard label="Storage Used (GB)" value={metrics.storageGb ?? 0} icon="💾" />
      </div>
    </div>
  );
}

// ============================================================
// Audit Logs
// ============================================================
function AuditLogs() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setLoading(true);
    superAdminApi.getAuditLogs({ page, limit: 50 })
      .then((r) => setLogs(r.data.logs ?? r.data ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Security events and platform actions" />
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><Spinner /></div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', overflow: 'hidden' }}>
          <Table
            columns={[
              { key: 'created_at', label: 'Time' },
              { key: 'action', label: 'Action' },
              { key: 'user_email', label: 'User' },
              { key: 'resource_type', label: 'Resource' },
              { key: 'ip_address', label: 'IP' },
            ]}
            data={logs}
            renderCell={(row, key) => {
              if (key === 'created_at') return new Date(row.created_at as string).toLocaleString();
              if (key === 'action') return <Badge>{String(row.action ?? '')}</Badge>;
              return String(row[key] ?? '—');
            }}
            emptyText="No audit logs found"
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</Button>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', alignSelf: 'center' }}>Page {page}</span>
        <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)} disabled={logs.length < 50}>Next →</Button>
      </div>
    </div>
  );
}

// ============================================================
// Router
// ============================================================
export default function SuperAdminPortal() {
  const { user, hasPermission } = useAuth();
  if (!user || !['SUPER_ADMIN', 'INTERNAL_ADMIN', 'INTERNAL_STAFF'].includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SidebarLayout navItems={NAV_ITEMS} title="EduLMS" subtitle="Super Admin" accentColor="#7c3aed">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="universities" element={hasPermission('TENANT_READ') ? <Universities /> : <Navigate to="/super-admin" />} />
        <Route path="internal-users" element={hasPermission('INTERNAL_USER_READ') ? <InternalUsers /> : <Navigate to="/super-admin" />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="*" element={<Navigate to="/super-admin" />} />
      </Routes>
    </SidebarLayout>
  );
}
