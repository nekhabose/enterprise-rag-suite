import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from '../components/shared/SidebarLayout';
import {
  Modal, Field, Input, Select, Button, Badge, Table, StatCard,
  Confirm, Spinner, PageHeader, Card, Tabs, SearchInput, Textarea,
} from '../components/shared/UI';
import { autoGrid, uiStyles } from '../shared/ui/styleHelpers';
import { tenantAdminApi } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { path: '/university-admin', label: 'Dashboard', icon: '📊' },
  { path: '/university-admin/users', label: 'Users', icon: '👥', permission: 'TENANT_USER_READ' },
  { path: '/university-admin/courses', label: 'Courses', icon: '📚', permission: 'COURSE_READ' },
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
  useAuth();

  useEffect(() => {
    tenantAdminApi.getDashboard()
      .then((r) => setStats(r.data))
      .catch(() => setStats({ users: 0, courses: 0, documents: 0, activeChats: 0 }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;
  const root = (stats ?? {}) as Record<string, unknown>;
  const s = ((root.stats as Record<string, unknown>) ?? root) as Record<string, unknown>;
  const asNumber = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value) || 0;
    if (Array.isArray(value)) {
      // `/tenant-admin/dashboard` returns users grouped by role.
      return value.reduce((sum, row) => sum + (Number((row as { total?: unknown })?.total) || 0), 0);
    }
    if (value && typeof value === 'object' && 'total' in (value as Record<string, unknown>)) {
      return Number((value as { total?: unknown }).total) || 0;
    }
    return 0;
  };

  return (
    <div>
      <PageHeader title={`Welcome back`} subtitle="University Admin Dashboard" />
      <div style={autoGrid(200, true)}>
        <StatCard label="Total Users" value={asNumber(s.users)} icon="👥" />
        <StatCard label="Courses" value={asNumber(s.courses)} icon="📚" />
        <StatCard label="Documents" value={asNumber(s.documents)} icon="📄" />
        <StatCard label="Active Chats" value={asNumber(s.conversations ?? s.activeChats)} icon="💬" />
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
      <div style={uiStyles.searchRow}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search users..." />
      </div>

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
            data={filtered}
            renderCell={(row, key) => {
              if (key === 'name') return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || '—';
              if (key === 'role') {
                const roleColors: Record<string, { color: string; bg: string }> = {
                  TENANT_ADMIN: { color: 'var(--role-admin)', bg: 'var(--role-admin-soft)' },
                  FACULTY: { color: 'var(--role-faculty)', bg: 'var(--role-faculty-soft)' },
                  STUDENT: { color: 'var(--role-learner)', bg: 'var(--role-learner-soft)' },
                };
                const rc = roleColors[String(row.role)] ?? { color: 'var(--role-learner)', bg: 'var(--role-learner-soft)' };
                return <Badge color={rc.color} bg={rc.bg}>{String(row.role).replace(/_/g, ' ')}</Badge>;
              }
              if (key === 'is_active') return (
                <Badge color={row.is_active ? 'var(--status-success)' : 'var(--status-danger)'} bg={row.is_active ? 'var(--status-success-soft)' : 'var(--status-danger-soft)'}>
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
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
            An invitation email will be sent to the user with instructions to set their password.
          </p>
          <div style={uiStyles.actionRowEnd}>
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
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCourse, setEditCourse] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    subject: '',
    facultyIds: [] as number[],
    status: 'DRAFT',
    studentIds: [] as number[],
  });
  const [saving, setSaving] = useState(false);
  const { hasPermission } = useAuth();
  const facultyUsers = users.filter((u) => String(u.role) === 'FACULTY');
  const studentUsers = users.filter((u) => String(u.role) === 'STUDENT');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [courseRes, userRes] = await Promise.all([
        tenantAdminApi.getCourses(),
        tenantAdminApi.getUsers(),
      ]);
      setCourses(courseRes.data.courses ?? courseRes.data ?? []);
      setUsers(userRes.data.users ?? userRes.data ?? []);
    } catch {
      setCourses([]);
      setUsers([]);
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        subject: form.subject,
        faculty_id: form.facultyIds[0] ?? null,
        instructor_ids: form.facultyIds,
        status: form.status,
        is_active: form.status === 'ACTIVE',
      };
      if (editCourse) {
        await tenantAdminApi.updateCourse(editCourse.id as number, payload);
        await tenantAdminApi.updateCourseEnrollments(editCourse.id as number, form.studentIds);
        toast.success('Course updated');
      } else {
        const created = await tenantAdminApi.createCourse(payload);
        const courseId = Number(created.data?.course?.id);
        if (courseId) await tenantAdminApi.updateCourseEnrollments(courseId, form.studentIds);
        toast.success('Course created');
      }
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
            <Button onClick={() => { setEditCourse(null); setForm({ title: '', description: '', subject: '', facultyIds: [], status: 'DRAFT', studentIds: [] }); setModalOpen(true); }}>
              + New Course
            </Button>
          )
        }
      />

      {loading ? <div style={uiStyles.loadingCenterText}><Spinner /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {courses.length === 0 && (
            <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1' }}>No courses yet. Create your first course!</p>
          )}
          {courses.map((course) => (
            <div key={course.id as number} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: '14px', padding: '20px',
            }}>
              {(() => {
                const status = String((course.settings as Record<string, unknown>)?.status ?? (course.is_active ? 'ACTIVE' : 'DRAFT')).toUpperCase();
                const statusColor = status === 'ARCHIVED'
                  ? 'var(--status-neutral)'
                  : status === 'ACTIVE'
                    ? 'var(--status-success)'
                    : 'var(--status-warning)';
                const statusBg = status === 'ARCHIVED'
                  ? 'var(--status-neutral-soft)'
                  : status === 'ACTIVE'
                    ? 'var(--status-success-soft)'
                    : 'var(--status-warning-soft)';
                return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{String(course.title)}</h3>
                <Badge color={statusColor} bg={statusBg}>
                  {status}
                </Badge>
              </div>
                );
              })()}
              {Boolean(course.description) && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                  {String(course.description).substring(0, 120)}{String(course.description).length > 120 ? '...' : ''}
                </p>
              )}
              {Boolean(course.subject) && <Badge>{String(course.subject)}</Badge>}
              {Boolean(course.faculty_email) && (
                <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>Faculty: {String(course.faculty_email)}</p>
              )}
              {Array.isArray(course.instructor_emails) && (course.instructor_emails as unknown[]).length > 0 && (
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  Teachers: {(course.instructor_emails as unknown[]).map((email) => String(email)).join(', ')}
                </p>
              )}
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                Enrollments: {Number(course.enrollment_count ?? 0)}
              </p>
              {hasPermission('COURSE_WRITE') && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                  <Button size="sm" variant="secondary" onClick={async () => {
                    const enr = await tenantAdminApi.getCourseEnrollments(course.id as number).catch(() => ({ data: { student_ids: [] } }));
                    setEditCourse(course);
                    setForm({
                      title: String(course.title ?? ''),
                      description: String(course.description ?? ''),
                      subject: String(course.subject ?? ''),
                      facultyIds: Array.isArray(course.instructor_ids)
                        ? (course.instructor_ids as unknown[]).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
                        : (course.faculty_id ? [Number(course.faculty_id)] : []),
                      status: String((course.settings as Record<string, unknown>)?.status ?? (course.is_active ? 'ACTIVE' : 'DRAFT')).toUpperCase(),
                      studentIds: (enr.data?.student_ids ?? []) as number[],
                    });
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
          <Field label="Assign Teachers">
            <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px' }}>
              {facultyUsers.map((f) => {
                const id = Number(f.id);
                const checked = form.facultyIds.includes(id);
                return (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        facultyIds: e.target.checked ? [...prev.facultyIds, id] : prev.facultyIds.filter((v) => v !== id),
                      }))}
                    />
                    {String(f.email)}
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Field label="Enroll Students">
            <div style={{ maxHeight: '170px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px' }}>
              {studentUsers.map((s) => {
                const id = Number(s.id);
                const checked = form.studentIds.includes(id);
                return (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        studentIds: e.target.checked ? [...prev.studentIds, id] : prev.studentIds.filter((v) => v !== id),
                      }))}
                    />
                    {String(s.email)}
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Course description..." /></Field>
          <div style={uiStyles.actionRowEndWithTop}>
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
function Content({ embedded = false }: { embedded?: boolean }) {
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
      {!embedded && <PageHeader title="Content" subtitle="Upload documents and add video content" />}
      <Tabs
        tabs={[{ key: 'documents', label: '📄 Documents' }, { key: 'youtube', label: '▶️ YouTube' }]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'documents' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Upload Document</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
            Supported formats: PDF, DOCX, TXT, MD, CSV, PPTX, XLSX. Max 50MB.
          </p>
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px', border: '2px dashed color-mix(in srgb, var(--brand-600) 40%, transparent)', borderRadius: '12px',
            cursor: 'pointer', transition: 'border-color 0.15s',
          }}>
            <span style={{ fontSize: '36px', marginBottom: '12px' }}>📤</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
              {uploading ? 'Uploading...' : 'Click to upload or drag & drop'}
            </span>
            <input type="file" accept=".pdf,.docx,.txt,.md,.csv,.pptx,.xlsx" onChange={handleFileUpload} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </Card>
      )}

      {tab === 'youtube' && (
        <Card>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Add YouTube Video</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
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
  const [allowedOptions, setAllowedOptions] = useState<Record<string, string[]>>({
    allowed_chunking_strategies: ['semantic', 'fixed', 'fixed_size', 'overlap', 'paragraph', 'page_based', 'parent_child', 'sentence', 'recursive'],
    allowed_embedding_models: ['minilm', 'openai', 'cohere', 'bge-base', 'e5-large'],
    allowed_llm_providers: ['groq', 'openai', 'anthropic', 'ollama', 'gemini'],
    allowed_retrieval_strategies: ['hybrid', 'semantic', 'keyword', 'bm25'],
    allowed_vector_stores: ['postgres', 'pgvector', 'chroma', 'chromadb', 'pinecone', 'faiss', 'qdrant'],
  });
  const [policyRequired, setPolicyRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    tenantAdminApi.getAISettings()
      .then((r) => {
        const data = r.data ?? {};
        const currentSettings = (data.settings ?? data) as Record<string, string>;
        const policy = (data.allowed_options ?? {}) as Record<string, string[]>;
        setSettings((prev) => ({ ...prev, ...currentSettings }));
        setAllowedOptions((prev) => ({ ...prev, ...policy }));
        setPolicyRequired(Boolean(data.policy_required));
      })
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
      <PageHeader title="AI Configuration" subtitle="Select from Super Admin approved AI options" />
      <Card style={{ maxWidth: '600px' }}>
        {policyRequired && (
          <div style={{
            marginBottom: '16px',
            border: '1px solid var(--status-warning)',
            background: 'var(--status-warning-soft)',
            color: 'var(--text-primary)',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '13px',
          }}>
            AI configuration is not enabled yet for your institution. Contact Super Admin.
          </div>
        )}
        <form onSubmit={handleSave}>
          <Field label="Chunking Strategy">
            <Select value={settings.chunking_strategy} onChange={(e) => setSettings({ ...settings, chunking_strategy: e.target.value })}>
              {(allowedOptions.allowed_chunking_strategies ?? []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field label="Embedding Model">
            <Select value={settings.embedding_model} onChange={(e) => setSettings({ ...settings, embedding_model: e.target.value })}>
              {(allowedOptions.allowed_embedding_models ?? []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field label="LLM Provider">
            <Select value={settings.llm_provider} onChange={(e) => setSettings({ ...settings, llm_provider: e.target.value })}>
              {(allowedOptions.allowed_llm_providers ?? []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field label="Retrieval Strategy">
            <Select value={settings.retrieval_strategy} onChange={(e) => setSettings({ ...settings, retrieval_strategy: e.target.value })}>
              {(allowedOptions.allowed_retrieval_strategies ?? []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vector Store">
            <Select value={settings.vector_store} onChange={(e) => setSettings({ ...settings, vector_store: e.target.value })}>
              {(allowedOptions.allowed_vector_stores ?? []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </Field>
          <div style={{ marginTop: '20px' }}>
            <Button type="submit" loading={saving} disabled={policyRequired}>Save Settings</Button>
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
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{c.label}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{c.desc}</div>
                </div>
              </div>
              <button
                onClick={() => toggleConnector(c.key, !connectors[c.key])}
                disabled={saving === c.key}
                style={{
                  width: '44px', height: '24px', borderRadius: '100px',
                  background: connectors[c.key] ? 'linear-gradient(135deg, var(--brand-600), var(--brand-700))' : 'var(--border-strong)',
                  border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                  position: 'relative',
                }}
              >
                <div style={{
                  position: 'absolute', top: '3px',
                  left: connectors[c.key] ? '23px' : '3px',
                  width: '18px', height: '18px',
                  borderRadius: '50%', background: 'var(--text-primary)',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
            <div style={{ marginTop: '12px' }}>
              <Badge color={connectors[c.key] ? 'var(--status-success)' : 'var(--status-neutral)'} bg={connectors[c.key] ? 'var(--status-success-soft)' : 'var(--status-neutral-soft)'}>
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
        <div style={uiStyles.surfaceTableShell}>
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
    <SidebarLayout navItems={NAV_ITEMS} title="EduLMS" subtitle="University Admin" accentColor="var(--brand-600)">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<UsersManagement />} />
        <Route path="courses" element={<Courses />} />
        <Route path="content" element={<Navigate to="/university-admin/courses" replace />} />
        <Route path="connectors" element={<Connectors />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="*" element={<Navigate to="/university-admin" />} />
      </Routes>
    </SidebarLayout>
  );
}
