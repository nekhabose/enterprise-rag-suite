import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from '../components/shared/SidebarLayout';
import {
  Modal, Field, Input, Select, Button, Badge, Table, StatCard,
  Confirm, Spinner, PageHeader, Card, Tabs, SearchInput, Textarea,
} from '../components/shared/UI';
import { tenantAdminApi } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { path: '/university-admin', label: 'Dashboard', icon: '📊' },
  { path: '/university-admin/users', label: 'Users', icon: '👥', permission: 'TENANT_USER_READ' },
  { path: '/university-admin/courses', label: 'Courses', icon: '📚', permission: 'COURSE_READ' },
  { path: '/university-admin/content', label: 'Content', icon: '📂', permission: 'DOCUMENT_READ' },
  { path: '/university-admin/ai-settings', label: 'AI Settings', icon: '🤖', permission: 'AI_SETTINGS_UPDATE' },
  { path: '/university-admin/connectors', label: 'Connectors', icon: '🔌', permission: 'CONNECTOR_CONFIGURE' },
  { path: '/university-admin/analytics', label: 'Analytics', icon: '📈', permission: 'TENANT_ANALYTICS_READ' },
  { path: '/university-admin/audit-logs', label: 'Audit Logs', icon: '🔍', permission: 'AUDIT_LOG_READ' },
];

// ============================================================
// Dashboard
// ============================================================
function Dashboard() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    tenantAdminApi.getDashboard()
      .then((r) => setStats(r.data))
      .catch(() => setStats({ users: 0, courses: 0, documents: 0, activeChats: 0 }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>;
  const s = stats as Record<string, number>;

  return (
    <div>
      <PageHeader title={`Welcome back`} subtitle="University Admin Dashboard" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard label="Total Users" value={s.users ?? 0} icon="👥" />
        <StatCard label="Courses" value={s.courses ?? 0} icon="📚" />
        <StatCard label="Documents" value={s.documents ?? 0} icon="📄" />
        <StatCard label="Active Chats" value={s.activeChats ?? 0} icon="💬" />
      </div>
    </div>
  );
}

// ============================================================
// Users Management
// ============================================================
function UsersManagement() {
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'STUDENT' });
  const [saving, setSaving] = useState(false);
  const { hasPermission } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await tenantAdminApi.getUsers();
      setUsers(r.data.users ?? r.data ?? []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await tenantAdminApi.inviteUser(inviteForm);
      toast.success(`Invitation sent to ${inviteForm.email}`);
      setInviteOpen(false);
      setInviteForm({ email: '', role: 'STUDENT' });
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to invite');
    } finally { setSaving(false); }
  };

  const handleRoleUpdate = async (userId: number, role: string) => {
    try {
      await tenantAdminApi.updateUser(userId, { role });
      toast.success('Role updated');
      load();
    } catch { toast.error('Failed to update role'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await tenantAdminApi.deleteUser(deleteTarget.id as number);
      toast.success('User removed');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Failed to remove user'); }
  };

  const filtered = users.filter((u) =>
    String(u.email).toLowerCase().includes(search.toLowerCase()) ||
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${users.length} members`}
        actions={
          hasPermission('TENANT_USER_WRITE') && (
            <Button onClick={() => setInviteOpen(true)}>+ Invite User</Button>
          )
        }
      />
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search users..." />
      </div>

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
            data={filtered}
            renderCell={(row, key) => {
              if (key === 'name') return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || '—';
              if (key === 'role') {
                const roleColors: Record<string, { color: string; bg: string }> = {
                  TENANT_ADMIN: { color: '#fcd34d', bg: 'rgba(252,211,77,0.1)' },
                  FACULTY: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
                  STUDENT: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
                };
                const rc = roleColors[String(row.role)] ?? { color: '#c4b5fd', bg: 'rgba(124,58,237,0.15)' };
                return <Badge color={rc.color} bg={rc.bg}>{String(row.role).replace(/_/g, ' ')}</Badge>;
              }
              if (key === 'is_active') return (
                <Badge color={row.is_active ? '#34d399' : '#f87171'} bg={row.is_active ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)'}>
                  {row.is_active ? 'Active' : 'Inactive'}
                </Badge>
              );
              if (key === 'actions') return (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasPermission('TENANT_USER_WRITE') && (
                    <>
                      <Select
                        style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px' }}
                        value={String(row.role)}
                        onChange={(e) => handleRoleUpdate(row.id as number, e.target.value)}
                      >
                        <option value="STUDENT">Student</option>
                        <option value="FACULTY">Faculty</option>
                        <option value="TENANT_ADMIN">Admin</option>
                      </Select>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(row)}>Remove</Button>
                    </>
                  )}
                </div>
              );
              return String(row[key] ?? '');
            }}
            emptyText="No users found"
          />
        </div>
      )}

      {/* Invite Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite User">
        <form onSubmit={handleInvite}>
          <Field label="Email Address" required>
            <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required placeholder="user@university.edu" />
          </Field>
          <Field label="Role">
            <Select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
              <option value="STUDENT">Student</option>
              <option value="FACULTY">Faculty</option>
              <option value="TENANT_ADMIN">Admin</option>
            </Select>
          </Field>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '0 0 20px' }}>
            An invitation email will be sent to the user with instructions to set their password.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Send Invitation</Button>
          </div>
        </form>
      </Modal>

      <Confirm
        open={!!deleteTarget}
        message={`Remove ${deleteTarget?.email} from the university?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Courses
// ============================================================
function Courses() {
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCourse, setEditCourse] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ title: '', description: '', subject: '' });
  const [saving, setSaving] = useState(false);
  const { hasPermission } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await tenantAdminApi.getCourses(); setCourses(r.data.courses ?? r.data ?? []); }
    catch { setCourses([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editCourse) { await tenantAdminApi.updateCourse(editCourse.id as number, form); toast.success('Course updated'); }
      else { await tenantAdminApi.createCourse(form); toast.success('Course created'); }
      setModalOpen(false);
      load();
    } catch { toast.error('Failed to save course'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await tenantAdminApi.deleteCourse(deleteTarget.id as number); toast.success('Course deleted'); setDeleteTarget(null); load(); }
    catch { toast.error('Failed to delete'); }
  };

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle={`${courses.length} courses`}
        actions={
          hasPermission('COURSE_WRITE') && (
            <Button onClick={() => { setEditCourse(null); setForm({ title: '', description: '', subject: '' }); setModalOpen(true); }}>
              + New Course
            </Button>
          )
        }
      />

      {loading ? <div style={{ textAlign: 'center', padding: '60px' }}><Spinner /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {courses.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', gridColumn: '1/-1' }}>No courses yet. Create your first course!</p>
          )}
          {courses.map((course) => (
            <div key={course.id as number} style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px', padding: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#fff' }}>{String(course.title)}</h3>
                <Badge color={course.is_active ? '#34d399' : '#94a3b8'}>{course.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              {course.description && (
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '0 0 12px' }}>
                  {String(course.description).substring(0, 120)}{String(course.description).length > 120 ? '...' : ''}
                </p>
              )}
              {course.subject && <Badge>{String(course.subject)}</Badge>}
              {hasPermission('COURSE_WRITE') && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setEditCourse(course);
                    setForm({ title: String(course.title ?? ''), description: String(course.description ?? ''), subject: String(course.subject ?? '') });
                    setModalOpen(true);
                  }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(course)}>Delete</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editCourse ? 'Edit Course' : 'New Course'}>
        <form onSubmit={handleSave}>
          <Field label="Title" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
          <Field label="Subject"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" /></Field>
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Course description..." /></Field>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editCourse ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
      <Confirm open={!!deleteTarget} message={`Delete course "${deleteTarget?.title}"?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

// ============================================================
// Content / Ingestion
// ============================================================
function Content() {
  const [tab, setTab] = useState('documents');
  const [uploading, setUploading] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytSubject, setYtSubject] = useState('');
  const [submittingYt, setSubmittingYt] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await tenantAdminApi.ingestDocument(formData);
      toast.success(`"${file.name}" queued for processing`);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleYoutube = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingYt(true);
    try {
      await tenantAdminApi.ingestYoutube({ sourceUrl: ytUrl, subject: ytSubject });
      toast.success('YouTube video queued for processing');
      setYtUrl('');
      setYtSubject('');
    } catch { toast.error('Failed to queue video'); }
    finally { setSubmittingYt(false); }
  };

  return (
    <div>
      <PageHeader title="Content" subtitle="Upload documents and add video content" />
      <Tabs
        tabs={[{ key: 'documents', label: '📄 Documents' }, { key: 'youtube', label: '▶️ YouTube' }]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'documents' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: '#fff' }}>Upload Document</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '20px' }}>
            Supported formats: PDF, DOCX, TXT, MD, CSV, PPTX, XLSX. Max 50MB.
          </p>
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px', border: '2px dashed rgba(124,58,237,0.4)', borderRadius: '12px',
            cursor: 'pointer', transition: 'border-color 0.15s',
          }}>
            <span style={{ fontSize: '36px', marginBottom: '12px' }}>📤</span>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: 500 }}>
              {uploading ? 'Uploading...' : 'Click to upload or drag & drop'}
            </span>
            <input type="file" accept=".pdf,.docx,.txt,.md,.csv,.pptx,.xlsx" onChange={handleFileUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </Card>
      )}

      {tab === 'youtube' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: '#fff' }}>Add YouTube Video</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '20px' }}>
            Enter a YouTube URL to extract transcripts and make them searchable.
          </p>
          <form onSubmit={handleYoutube}>
            <Field label="YouTube URL" required>
              <Input type="url" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." required />
            </Field>
            <Field label="Subject">
              <Input value={ytSubject} onChange={(e) => setYtSubject(e.target.value)} placeholder="e.g. Calculus" />
            </Field>
            <Button type="submit" loading={submittingYt}>Add Video</Button>
          </form>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// AI Settings
// ============================================================
function AISettings() {
  const [settings, setSettings] = useState<Record<string, string>>({
    chunking_strategy: 'semantic',
    embedding_model: 'minilm',
    llm_provider: 'groq',
    retrieval_strategy: 'hybrid',
    vector_store: 'postgres',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    tenantAdminApi.getAISettings()
      .then((r) => setSettings(r.data.settings ?? r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await tenantAdminApi.updateAISettings(settings);
      toast.success('AI settings saved');
    } catch { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="AI Settings" subtitle="Configure AI behavior for your institution" />
      <Card style={{ maxWidth: '600px' }}>
        <form onSubmit={handleSave}>
          <Field label="Chunking Strategy">
            <Select value={settings.chunking_strategy} onChange={(e) => setSettings({ ...settings, chunking_strategy: e.target.value })}>
              <option value="semantic">Semantic</option>
              <option value="fixed">Fixed Size</option>
              <option value="paragraph">Paragraph</option>
            </Select>
          </Field>
          <Field label="Embedding Model">
            <Select value={settings.embedding_model} onChange={(e) => setSettings({ ...settings, embedding_model: e.target.value })}>
              <option value="minilm">all-MiniLM-L6 (Fast, Local)</option>
              <option value="openai">OpenAI text-embedding-3-small</option>
              <option value="cohere">Cohere embed-multilingual</option>
            </Select>
          </Field>
          <Field label="LLM Provider">
            <Select value={settings.llm_provider} onChange={(e) => setSettings({ ...settings, llm_provider: e.target.value })}>
              <option value="groq">Groq (Fast)</option>
              <option value="openai">OpenAI GPT-4</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="ollama">Ollama (Self-hosted)</option>
            </Select>
          </Field>
          <Field label="Retrieval Strategy">
            <Select value={settings.retrieval_strategy} onChange={(e) => setSettings({ ...settings, retrieval_strategy: e.target.value })}>
              <option value="hybrid">Hybrid (Semantic + Keyword)</option>
              <option value="semantic">Semantic Only</option>
              <option value="keyword">Keyword Only</option>
            </Select>
          </Field>
          <Field label="Vector Store">
            <Select value={settings.vector_store} onChange={(e) => setSettings({ ...settings, vector_store: e.target.value })}>
              <option value="postgres">PostgreSQL + pgvector</option>
              <option value="pinecone">Pinecone</option>
              <option value="chroma">ChromaDB</option>
            </Select>
          </Field>
          <div style={{ marginTop: '20px' }}>
            <Button type="submit" loading={saving}>Save Settings</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ============================================================
// Connectors
// ============================================================
function Connectors() {
  const [connectors, setConnectors] = useState<Record<string, unknown>>({
    google_drive: false,
    dropbox: false,
    onedrive: false,
    lms_moodle: false,
  });
  const [saving, setSaving] = useState<string | null>(null);

  const toggleConnector = async (key: string, value: boolean) => {
    setSaving(key);
    try {
      await tenantAdminApi.updateConnector({ connector: key, enabled: value });
      setConnectors((prev) => ({ ...prev, [key]: value }));
      toast.success(`${key.replace(/_/g, ' ')} ${value ? 'enabled' : 'disabled'}`);
    } catch { toast.error('Failed to update connector'); }
    finally { setSaving(null); }
  };

  const connectorList = [
    { key: 'google_drive', label: 'Google Drive', icon: '🗂️', desc: 'Sync documents from Google Drive' },
    { key: 'dropbox', label: 'Dropbox', icon: '📦', desc: 'Sync documents from Dropbox' },
    { key: 'onedrive', label: 'OneDrive', icon: '☁️', desc: 'Sync documents from Microsoft OneDrive' },
    { key: 'lms_moodle', label: 'Moodle LMS', icon: '🎓', desc: 'Import courses from Moodle' },
  ];

  return (
    <div>
      <PageHeader title="Connectors" subtitle="Configure data source integrations" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {connectorList.map((c) => (
          <Card key={c.key}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '28px' }}>{c.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{c.label}</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{c.desc}</div>
                </div>
              </div>
              <button
                onClick={() => toggleConnector(c.key, !connectors[c.key])}
                disabled={saving === c.key}
                style={{
                  width: '44px', height: '24px', borderRadius: '100px',
                  background: connectors[c.key] ? 'linear-gradient(135deg, #7c3aed, #5b21b6)' : 'rgba(255,255,255,0.12)',
                  border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                  position: 'relative',
                }}
              >
                <div style={{
                  position: 'absolute', top: '3px',
                  left: connectors[c.key] ? '23px' : '3px',
                  width: '18px', height: '18px',
                  borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
            <div style={{ marginTop: '12px' }}>
              <Badge color={connectors[c.key] ? '#34d399' : '#94a3b8'} bg={connectors[c.key] ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)'}>
                {connectors[c.key] ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
          </Card>
        ))}
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
    tenantAdminApi.getAnalytics().then((r) => setData(r.data)).catch(() => setData({}));
  }, []);
  const m = (data ?? {}) as Record<string, number>;

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Usage metrics for your institution" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard label="Active Students" value={m.activeStudents ?? 0} icon="🎓" />
        <StatCard label="Active Faculty" value={m.activeFaculty ?? 0} icon="👨‍🏫" />
        <StatCard label="AI Queries (Month)" value={m.aiQueries ?? 0} icon="💬" />
        <StatCard label="Assessments Taken" value={m.assessments ?? 0} icon="✏️" />
        <StatCard label="Documents Processed" value={m.documents ?? 0} icon="📄" />
        <StatCard label="Avg Response Time" value={`${m.avgResponseMs ?? 0}ms`} icon="⚡" />
      </div>
    </div>
  );
}

// ============================================================
// Audit Logs (tenant-scoped)
// ============================================================
function AuditLogs() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    tenantAdminApi.getAuditLogs()
      .then((r) => setLogs(r.data.logs ?? r.data ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Security events for your institution" />
      {loading ? <Spinner /> : (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', overflow: 'hidden' }}>
          <Table
            columns={[
              { key: 'created_at', label: 'Time' },
              { key: 'action', label: 'Action' },
              { key: 'user_email', label: 'User' },
              { key: 'resource_type', label: 'Resource' },
            ]}
            data={logs}
            renderCell={(row, key) => {
              if (key === 'created_at') return new Date(row.created_at as string).toLocaleString();
              if (key === 'action') return <Badge>{String(row.action ?? '')}</Badge>;
              return String(row[key] ?? '—');
            }}
            emptyText="No audit logs"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Router
// ============================================================
export default function UniversityAdminPortal() {
  const { user } = useAuth();
  if (!user || user.role !== 'TENANT_ADMIN') return <Navigate to="/login" replace />;

  return (
    <SidebarLayout navItems={NAV_ITEMS} title="EduLMS" subtitle="University Admin" accentColor="#0ea5e9">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<UsersManagement />} />
        <Route path="courses" element={<Courses />} />
        <Route path="content" element={<Content />} />
        <Route path="ai-settings" element={<AISettings />} />
        <Route path="connectors" element={<Connectors />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="*" element={<Navigate to="/university-admin" />} />
      </Routes>
    </SidebarLayout>
  );
}
