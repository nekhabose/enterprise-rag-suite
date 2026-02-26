import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from '../components/shared/SidebarLayout';
import {
  Modal, Field, Input, Select, Button, Badge, Table, StatCard,
  Confirm, Spinner, PageHeader, Card, Tabs, SearchInput,
} from '../components/shared/UI';
import { autoGrid, uiStyles } from '../shared/ui/styleHelpers';
import { superAdminApi } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { path: '/super-admin', label: 'Dashboard', icon: '📊' },
  { path: '/super-admin/universities', label: 'Universities', icon: '🏛️', permission: 'TENANT_READ' },
  { path: '/super-admin/ai-governance', label: 'AI Governance', icon: '🤖', permission: 'TENANT_UPDATE' },
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

  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;

  const root = (stats ?? {}) as Record<string, unknown>;
  const nested = (root.stats ?? {}) as Record<string, unknown>;
  const toNum = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value) || 0;
    if (value && typeof value === 'object' && 'total' in (value as Record<string, unknown>)) {
      return Number((value as { total?: unknown }).total) || 0;
    }
    return 0;
  };
  const totalTenants = toNum(root.totalTenants ?? nested.tenants ?? (nested.tenants as Record<string, unknown>)?.total);
  const activeTenants = toNum(root.activeTenants ?? (nested.tenants as Record<string, unknown>)?.active);
  const totalUsers = toNum(root.totalUsers ?? nested.users ?? (nested.users as Record<string, unknown>)?.total);
  const tenantUsers = toNum((nested.users as Record<string, unknown>)?.tenant_users);
  const activeUsers = toNum(root.activeUsers ?? tenantUsers);
  const totalDocuments = toNum(root.totalDocuments ?? nested.documents ?? (nested.documents as Record<string, unknown>)?.total);
  const totalChats = toNum(root.totalChats ?? nested.conversations ?? (nested.conversations as Record<string, unknown>)?.total);

  return (
    <div>
      <PageHeader title="Super Admin Dashboard" subtitle="Platform-wide overview" />
      <div style={autoGrid(200, true)}>
        <StatCard label="Total Universities" value={totalTenants} icon="🏛️" />
        <StatCard label="Active Tenants" value={activeTenants} icon="✅" />
        <StatCard label="Total Users" value={totalUsers} icon="👥" />
        <StatCard label="Active Users" value={activeUsers} icon="🔥" />
        <StatCard label="Documents" value={totalDocuments} icon="📄" />
        <StatCard label="AI Chats" value={totalChats} icon="💬" />
      </div>
      <Card>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
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

      <div style={uiStyles.searchRow}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search universities..." />
      </div>

      {loading ? (
        <div style={uiStyles.loadingCenterText}><Spinner /></div>
      ) : (
        <div style={uiStyles.surfaceTableShell}>
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
                <Badge color={row.is_active ? 'var(--status-success)' : 'var(--status-danger)'} bg={row.is_active ? 'var(--status-success-soft)' : 'var(--status-danger-soft)'}>
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
          <div style={uiStyles.actionRowEndWithTop}>
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
        <div style={uiStyles.loadingCenterText}><Spinner /></div>
      ) : (
        <div style={uiStyles.surfaceTableShell}>
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
                <Badge color={row.is_active ? 'var(--status-success)' : 'var(--status-danger)'} bg={row.is_active ? 'var(--status-success-soft)' : 'var(--status-danger-soft)'}>
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
          <div style={uiStyles.actionRowEndWithTop}>
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
// AI Governance
// ============================================================
function AIGovernance() {
  type PolicyForm = {
    chunking_strategy: string;
    embedding_model: string;
    llm_provider: string;
    retrieval_strategy: string;
    vector_store: string;
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState<Record<string, unknown>[]>([]);
  const [catalog, setCatalog] = useState<Record<string, string[]>>({});
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [form, setForm] = useState<PolicyForm>({
    chunking_strategy: '',
    embedding_model: '',
    llm_provider: '',
    retrieval_strategy: '',
    vector_store: '',
  });

  const syncFormFromTenant = (tenant: Record<string, unknown> | null, options: Record<string, string[]>) => {
    const first = (arr: unknown) => (Array.isArray(arr) && arr.length ? String(arr[0]) : '');
    const fallback = {
      chunking_strategy: first(options.chunking),
      embedding_model: first(options.embedding),
      llm_provider: first(options.llm),
      retrieval_strategy: first(options.retrieval),
      vector_store: first(options.vector),
    };
    if (!tenant) {
      setForm(fallback);
      return;
    }
    setForm({
      chunking_strategy: first(tenant.allowed_chunking_strategies) || first(tenant.chunking_strategy ? [tenant.chunking_strategy] : []) || fallback.chunking_strategy,
      embedding_model: first(tenant.allowed_embedding_models) || first(tenant.embedding_model ? [tenant.embedding_model] : []) || fallback.embedding_model,
      llm_provider: first(tenant.allowed_llm_providers) || first(tenant.llm_provider ? [tenant.llm_provider] : []) || fallback.llm_provider,
      retrieval_strategy: first(tenant.allowed_retrieval_strategies) || first(tenant.retrieval_strategy ? [tenant.retrieval_strategy] : []) || fallback.retrieval_strategy,
      vector_store: first(tenant.allowed_vector_stores) || first(tenant.vector_store ? [tenant.vector_store] : []) || fallback.vector_store,
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await superAdminApi.getAIGovernance();
      const data = r.data ?? {};
      const list = (data.tenants ?? []) as Record<string, unknown>[];
      const options = (data.options_catalog ?? {}) as Record<string, string[]>;
      setTenants(list);
      setCatalog(options);
      const currentTenantId = selectedTenantId ?? (list[0]?.id as number | undefined) ?? null;
      setSelectedTenantId(currentTenantId);
      const tenant = list.find((t) => Number(t.id) === Number(currentTenantId)) ?? null;
      syncFormFromTenant(tenant, options);
    } catch {
      setTenants([]);
      setCatalog({});
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => { load(); }, [load]);

  const selectedTenant = tenants.find((t) => Number(t.id) === Number(selectedTenantId)) ?? null;

  const OptionGroup = ({
    title,
    value,
    onChange,
    values,
  }: {
    title: string;
    value: string;
    onChange: (next: string) => void;
    values: string[];
  }) => (
    <Field label={title}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {values.map((option) => (
          <option key={`${title}-${option}`} value={option}>{option}</option>
        ))}
      </Select>
    </Field>
  );

  const handleSelectTenant = (tenantId: number) => {
    setSelectedTenantId(tenantId);
    const tenant = tenants.find((t) => Number(t.id) === Number(tenantId)) ?? null;
    syncFormFromTenant(tenant, catalog);
  };

  const handleSave = async () => {
    if (!selectedTenantId) return;
    const invalid = !form.chunking_strategy || !form.embedding_model || !form.llm_provider || !form.retrieval_strategy || !form.vector_store;
    if (invalid) {
      toast.error('Select one value for each AI module');
      return;
    }
    setSaving(true);
    try {
      await superAdminApi.updateTenantAIGovernance(selectedTenantId, {
        allowed_chunking_strategies: [form.chunking_strategy],
        allowed_embedding_models: [form.embedding_model],
        allowed_llm_providers: [form.llm_provider],
        allowed_retrieval_strategies: [form.retrieval_strategy],
        allowed_vector_stores: [form.vector_store],
      });
      toast.success('AI governance policy saved');
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message
        ?? 'Failed to save governance policy';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;

  return (
    <div>
      <PageHeader title="AI Governance" subtitle="Super Admin controls approved AI options per institution" />

      <div style={{ ...autoGrid(340), alignItems: 'start' }}>
        <Card>
          <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--text-primary)' }}>Institutions</h3>
          <div style={{ display: 'grid', gap: '8px' }}>
            {tenants.map((tenant) => {
              const active = Number(tenant.id) === Number(selectedTenantId);
              return (
                <button
                  key={String(tenant.id)}
                  onClick={() => handleSelectTenant(Number(tenant.id))}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    background: active ? 'var(--brand-soft)' : 'var(--surface-subtle)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{String(tenant.name ?? '')}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{String(tenant.domain ?? '')}</div>
                </button>
              );
            })}
            {!tenants.length && <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>No tenants found</p>}
          </div>
        </Card>

        <Card>
          <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: 'var(--text-primary)' }}>
            {selectedTenant ? `${String(selectedTenant.name)} AI Policy` : 'AI Policy'}
          </h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Set exactly one approved configuration per AI module for this institution.
          </p>

          <OptionGroup
            title="Chunking Strategy"
            value={form.chunking_strategy}
            onChange={(next) => setForm((prev) => ({ ...prev, chunking_strategy: next }))}
            values={catalog.chunking ?? []}
          />
          <OptionGroup
            title="Embedding Model"
            value={form.embedding_model}
            onChange={(next) => setForm((prev) => ({ ...prev, embedding_model: next }))}
            values={catalog.embedding ?? []}
          />
          <OptionGroup
            title="LLM Provider"
            value={form.llm_provider}
            onChange={(next) => setForm((prev) => ({ ...prev, llm_provider: next }))}
            values={catalog.llm ?? []}
          />
          <OptionGroup
            title="Retrieval Strategy"
            value={form.retrieval_strategy}
            onChange={(next) => setForm((prev) => ({ ...prev, retrieval_strategy: next }))}
            values={catalog.retrieval ?? []}
          />
          <OptionGroup
            title="Vector Store"
            value={form.vector_store}
            onChange={(next) => setForm((prev) => ({ ...prev, vector_store: next }))}
            values={catalog.vector ?? []}
          />

          <div style={uiStyles.actionRowEnd}>
            <Button onClick={handleSave} loading={saving} disabled={!selectedTenantId}>Save Governance Policy</Button>
          </div>
        </Card>
      </div>
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
        <div style={uiStyles.loadingCenterText}><Spinner /></div>
      ) : (
        <div style={uiStyles.surfaceTableShell}>
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
        <span style={{ color: 'var(--text-muted)', fontSize: '14px', alignSelf: 'center' }}>Page {page}</span>
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
  const navItems = user.role === 'SUPER_ADMIN'
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.path !== '/super-admin/ai-governance');

  return (
    <SidebarLayout navItems={navItems} title="EduLMS" subtitle="Super Admin" accentColor="var(--brand-600)">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="universities" element={hasPermission('TENANT_READ') ? <Universities /> : <Navigate to="/super-admin" />} />
        <Route path="ai-governance" element={hasPermission('TENANT_UPDATE') && user.role === 'SUPER_ADMIN' ? <AIGovernance /> : <Navigate to="/super-admin" />} />
        <Route path="internal-users" element={hasPermission('INTERNAL_USER_READ') ? <InternalUsers /> : <Navigate to="/super-admin" />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="*" element={<Navigate to="/super-admin" />} />
      </Routes>
    </SidebarLayout>
  );
}
