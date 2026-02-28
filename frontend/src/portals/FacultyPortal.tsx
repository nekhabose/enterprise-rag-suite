import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button, Card, Field, Input, PageHeader, Select, Spinner, Textarea } from '../components/shared/UI';
import { facultyApi, userApi } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { uiStyles } from '../shared/ui/styleHelpers';

type NavItem = { path: string; label: string; icon: string };

const FACULTY_NAV: NavItem[] = [
  { path: '/faculty/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/faculty/courses', label: 'My Courses', icon: '📚' },
  { path: '/faculty/calendar', label: 'Calendar', icon: '🗓️' },
  { path: '/faculty/inbox', label: 'Inbox', icon: '✉️' },
  { path: '/faculty/history', label: 'History', icon: '🕘' },
  { path: '/faculty/help', label: 'Help', icon: '❓' },
];

const COURSE_NAV = [
  { key: 'home', label: 'Home' },
  { key: 'modules', label: 'Modules' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'files', label: 'Files' },
  { key: 'chunks', label: 'Chunks' },
  { key: 'gradebook', label: 'Gradebook' },
  { key: 'inbox', label: 'Course Inbox' },
  { key: 'settings', label: 'Settings' },
];

function Sidebar() {
  return (
    <aside style={{
      width: 220,
      background: 'linear-gradient(180deg, var(--brand-700), var(--brand-600))',
      borderRight: '1px solid color-mix(in srgb, var(--text-inverse) 14%, transparent)',
      color: 'var(--text-inverse)',
      minHeight: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ padding: '18px 14px', borderBottom: '1px solid color-mix(in srgb, var(--text-inverse) 14%, transparent)' }}>
        <div style={{ fontWeight: 700, fontSize: 30 }}>EduLMS</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>Faculty</div>
      </div>
      <nav style={{ padding: 8, display: 'grid', gap: 4 }}>
        {FACULTY_NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px',
              borderRadius: 10,
              color: 'var(--text-inverse)',
              textDecoration: 'none',
              background: isActive ? 'color-mix(in srgb, var(--text-inverse) 20%, transparent)' : 'transparent',
              fontWeight: isActive ? 700 : 500,
            })}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)',
      padding: '10px 16px',
      position: 'sticky',
      top: 0,
      zIndex: 4,
    }}>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Faculty Workspace</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
        <Button size="sm" variant="secondary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Today</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {`${String(user?.firstName ?? 'Faculty')} ▾`}
        </Button>
        {open && (
          <Card style={{ position: 'absolute', right: 0, top: 38, minWidth: 220, zIndex: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              {String(user?.email ?? '')} • FACULTY
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <Button size="sm" variant="secondary" onClick={() => { setOpen(false); navigate('/faculty/help'); }}>Settings</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  setOpen(false);
                  await logout();
                  navigate('/login');
                }}
              >
                Logout
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function FacultyDashboard() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    facultyApi.getDashboard().then((r) => setData(r.data)).catch(() => setData({})).finally(() => setLoading(false));
  }, []);
  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;
  const stats = (data?.stats ?? {}) as Record<string, number>;
  const upcoming = (data?.upcoming_due ?? []) as Record<string, unknown>[];
  const recent = (data?.recent_activity ?? []) as Record<string, unknown>[];
  return (
    <div>
      <PageHeader title="Faculty Dashboard" subtitle="To grade, upcoming due dates, and activity" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Card><h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{stats.my_courses ?? 0}</h3><p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>My Courses</p></Card>
        <Card><h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{stats.to_grade ?? 0}</h3><p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>To Grade</p></Card>
        <Card><h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{stats.open_threads ?? 0}</h3><p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>Open Messages</p></Card>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <Card>
          <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Upcoming Due Dates</h3>
          {upcoming.length === 0 ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No due dates configured.</p> : upcoming.map((u) => (
            <div key={String(u.id)} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0' }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(u.title)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{String(u.course_title)} • {u.due_at ? new Date(String(u.due_at)).toLocaleString() : 'No due date'}</div>
            </div>
          ))}
        </Card>
        <Card>
          <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Recent Activity</h3>
          {recent.length === 0 ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No activity yet.</p> : recent.map((r, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0' }}>
              <div style={{ color: 'var(--text-primary)' }}>{String(r.action)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(String(r.created_at)).toLocaleString()}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function FacultyCourses() {
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [openList, setOpenList] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    facultyApi.getCourses().then((r) => setCourses(r.data.courses ?? [])).catch(() => setCourses([])).finally(() => setLoading(false));
  }, []);
  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;
  return (
    <div>
      <PageHeader title="My Courses" subtitle="Instructor course list" actions={<Button size="sm" variant="secondary" onClick={() => setOpenList((v) => !v)}>{openList ? 'Hide' : 'Show'} List</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: openList ? '320px 1fr' : '1fr', gap: 12 }}>
        {openList && (
          <Card>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Published Courses</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {courses.map((course) => (
                <button
                  key={String(course.id)}
                  onClick={() => navigate(`/faculty/courses/${course.id}/home`)}
                  style={{ textAlign: 'left', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-subtle)', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 600 }}>{String(course.title)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{String(course.subject ?? 'General')}</div>
                </button>
              ))}
              {courses.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No courses assigned.</p>}
            </div>
          </Card>
        )}
        <Card><p style={{ margin: 0, color: 'var(--text-muted)' }}>Select a course to open authoring tools: Modules, Quizzes, Assignments, Files, Gradebook, and Course Inbox.</p></Card>
      </div>
    </div>
  );
}

function CourseFrame({ section, children }: { section: string; children: React.ReactNode }) {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!courseId) return;
    facultyApi.getCourseHome(Number(courseId)).then((r) => setCourse(r.data.course ?? null)).catch(() => setCourse(null));
  }, [courseId]);
  return (
    <div>
      <PageHeader
        title={String(course?.title ?? 'Course')}
        subtitle={`Course Workspace • ${section}`}
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/faculty/courses/${courseId}/files`)}>Upload Content</Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/faculty/courses/${courseId}/quizzes`)}>Create Quiz</Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/faculty/courses/${courseId}/assignments`)}>Create Assignment</Button>
          </div>
        )}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
        <Card>
          <div style={{ display: 'grid', gap: 6 }}>
            {COURSE_NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => navigate(`/faculty/courses/${courseId}/${item.key}`)}
                style={{
                  border: 'none',
                  borderLeft: section.toLowerCase() === item.label.toLowerCase() ? '3px solid var(--brand-600)' : '3px solid transparent',
                  background: section.toLowerCase() === item.label.toLowerCase() ? 'var(--brand-soft)' : 'transparent',
                  padding: '8px',
                  borderRadius: 6,
                  textAlign: 'left',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Card>
        <div>{children}</div>
      </div>
    </div>
  );
}

function FacultyCourseHome() {
  const { courseId } = useParams();
  const [summary, setSummary] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!courseId) return;
    facultyApi.getCourseHome(Number(courseId)).then((r) => setSummary(r.data.summary ?? {})).catch(() => setSummary({}));
  }, [courseId]);
  return (
    <CourseFrame section="Home">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Course Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Card><strong>{summary.students ?? 0}</strong><div style={{ color: 'var(--text-muted)' }}>Students</div></Card>
          <Card><strong>{summary.modules ?? 0}</strong><div style={{ color: 'var(--text-muted)' }}>Modules</div></Card>
          <Card><strong>{summary.quizzes ?? 0}</strong><div style={{ color: 'var(--text-muted)' }}>Quizzes</div></Card>
          <Card><strong>{summary.assignments ?? 0}</strong><div style={{ color: 'var(--text-muted)' }}>Assignments</div></Card>
        </div>
      </Card>
    </CourseFrame>
  );
}

function FacultyModules() {
  const { courseId } = useParams();
  const [modules, setModules] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newItem, setNewItem] = useState<{ moduleId: number | null; title: string; itemType: string }>({ moduleId: null, title: '', itemType: 'DOCUMENT' });
  const [dragModuleId, setDragModuleId] = useState<number | null>(null);
  const [dragItem, setDragItem] = useState<{ moduleId: number; itemId: number } | null>(null);
  const [moduleDropTargetId, setModuleDropTargetId] = useState<number | null>(null);
  const [itemDropTarget, setItemDropTarget] = useState<{ moduleId: number; itemId: number } | null>(null);

  const load = () => {
    if (!courseId) return;
    setLoading(true);
    facultyApi.getCourseModules(Number(courseId)).then((r) => setModules(r.data.modules ?? [])).catch(() => setModules([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [courseId]);

  const createModule = async () => {
    if (!courseId || !newTitle.trim()) return;
    await facultyApi.createCourseModule(Number(courseId), { title: newTitle.trim() });
    setNewTitle('');
    load();
  };

  const toggleModulePublish = async (moduleId: number) => {
    if (!courseId) return;
    await facultyApi.toggleModulePublish(Number(courseId), moduleId);
    load();
  };

  const addModuleItem = async () => {
    if (!courseId || !newItem.moduleId || !newItem.title.trim()) return;
    await facultyApi.createModuleItem(Number(courseId), newItem.moduleId, { title: newItem.title.trim(), item_type: newItem.itemType });
    setNewItem({ moduleId: null, title: '', itemType: 'DOCUMENT' });
    load();
  };

  const onModuleDrop = async (targetModuleId: number) => {
    if (!courseId || !dragModuleId || dragModuleId === targetModuleId) return;
    const order = modules.map((m) => Number(m.id));
    const from = order.indexOf(dragModuleId);
    const to = order.indexOf(targetModuleId);
    if (from === -1 || to === -1) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    await facultyApi.reorderCourseModules(Number(courseId), order);
    setDragModuleId(null);
    setModuleDropTargetId(null);
    load();
  };

  const onItemDrop = async (targetModuleId: number, targetItemId: number) => {
    if (!courseId || !dragItem) return;
    if (dragItem.moduleId !== targetModuleId) {
      await facultyApi.moveModuleItem(Number(courseId), dragItem.itemId, targetModuleId);
      setDragItem(null);
      setItemDropTarget(null);
      load();
      return;
    }
    const module = modules.find((m) => Number(m.id) === targetModuleId);
    if (!module) return;
    const items = ((module.items ?? []) as Record<string, unknown>[]).map((i) => Number(i.id));
    const from = items.indexOf(dragItem.itemId);
    const to = items.indexOf(targetItemId);
    if (from === -1 || to === -1 || from === to) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    await facultyApi.reorderModuleItems(Number(courseId), targetModuleId, items);
    setDragItem(null);
    setItemDropTarget(null);
    load();
  };

  return (
    <CourseFrame section="Modules">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Create Module</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Module title" />
          <Button onClick={createModule}>Create</Button>
        </div>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Add Module Item</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 8 }}>
          <Select value={newItem.moduleId ?? ''} onChange={(e) => setNewItem((p) => ({ ...p, moduleId: Number(e.target.value) || null }))}>
            <option value="">Select module</option>
            {modules.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.title)}</option>)}
          </Select>
          <Select value={newItem.itemType} onChange={(e) => setNewItem((p) => ({ ...p, itemType: e.target.value }))}>
            <option value="DOCUMENT">File</option>
            <option value="QUIZ">Quiz</option>
            <option value="ASSIGNMENT">Assignment</option>
            <option value="LINK">Link</option>
            <option value="VIDEO">Video</option>
          </Select>
          <Input value={newItem.title} onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))} placeholder="Item title" />
          <Button onClick={addModuleItem}>Add</Button>
        </div>
      </Card>
      <div style={{ marginTop: 12 }}>
        {loading ? <div style={uiStyles.loadingCenter}><Spinner /></div> : modules.length === 0 ? (
          <Card><p style={{ margin: 0, color: 'var(--text-muted)' }}>No modules yet.</p></Card>
        ) : modules.map((module) => (
          <div
            key={String(module.id)}
            draggable
            onDragStart={() => setDragModuleId(Number(module.id))}
            onDragEnd={() => {
              setDragModuleId(null);
              setModuleDropTargetId(null);
              setItemDropTarget(null);
            }}
            onDragOver={(e: React.DragEvent<HTMLDivElement>) => e.preventDefault()}
            onDragEnter={() => setModuleDropTargetId(Number(module.id))}
            onDragLeave={() => setModuleDropTargetId((current) => (current === Number(module.id) ? null : current))}
            onDrop={() => onModuleDrop(Number(module.id))}
          >
          <Card
            style={{
              marginBottom: 10,
              borderStyle: moduleDropTargetId === Number(module.id) && dragModuleId && dragModuleId !== Number(module.id) ? 'dashed' : 'solid',
              borderColor: moduleDropTargetId === Number(module.id) && dragModuleId && dragModuleId !== Number(module.id) ? 'var(--focus-ring)' : 'var(--border-subtle)',
              background: moduleDropTargetId === Number(module.id) && dragModuleId && dragModuleId !== Number(module.id) ? 'var(--brand-soft)' : 'var(--bg-surface)',
              transition: 'background-color 180ms ease, border-color 180ms ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  role="img"
                  aria-label="drag handle"
                  style={{ cursor: 'grab', opacity: 0.75, fontSize: 16 }}
                >
                  ⋮⋮
                </span>
                {String(module.title)}
              </h4>
              <Button size="sm" variant={module.is_published ? 'secondary' : 'primary'} onClick={() => toggleModulePublish(Number(module.id))}>
                {module.is_published ? 'Unpublish' : 'Publish'}
              </Button>
            </div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {((module.items ?? []) as Record<string, unknown>[]).map((item) => (
                <div
                  key={String(item.id)}
                  style={{
                    border: '1px solid',
                    borderColor: itemDropTarget?.moduleId === Number(module.id) && itemDropTarget?.itemId === Number(item.id)
                      ? 'var(--focus-ring)'
                      : 'var(--border-subtle)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    background: itemDropTarget?.moduleId === Number(module.id) && itemDropTarget?.itemId === Number(item.id)
                      ? 'var(--brand-soft)'
                      : 'var(--bg-surface)',
                    transition: 'background-color 180ms ease, border-color 180ms ease',
                  }}
                  draggable
                  onDragStart={() => setDragItem({ moduleId: Number(module.id), itemId: Number(item.id) })}
                  onDragEnd={() => {
                    setDragItem(null);
                    setItemDropTarget(null);
                  }}
                  onDragOver={(e: React.DragEvent<HTMLDivElement>) => e.preventDefault()}
                  onDragEnter={() => setItemDropTarget({ moduleId: Number(module.id), itemId: Number(item.id) })}
                  onDragLeave={() => setItemDropTarget((curr) => (
                    curr?.moduleId === Number(module.id) && curr?.itemId === Number(item.id) ? null : curr
                  ))}
                  onDrop={() => onItemDrop(Number(module.id), Number(item.id))}
                >
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span role="img" aria-label="drag handle" style={{ cursor: 'grab', opacity: 0.75 }}>⋮⋮</span>
                      {String(item.title)}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{String(item.item_type)} • {item.is_published ? 'Published' : 'Draft'}</div>
                  </div>
                </div>
              ))}
              {((module.items ?? []) as Record<string, unknown>[]).length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No items in this module.</p>}
            </div>
          </Card>
          </div>
        ))}
      </div>
    </CourseFrame>
  );
}

function FacultyFiles() {
  const { courseId } = useParams();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [modules, setModules] = useState<Record<string, unknown>[]>([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedAttach, setSelectedAttach] = useState<{ id: number; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recordingUploading, setRecordingUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [recordingTitle, setRecordingTitle] = useState('');
  const [previewItem, setPreviewItem] = useState<Record<string, unknown> | null>(null);
  const [chunkSource, setChunkSource] = useState<Record<string, unknown> | null>(null);
  const [chunks, setChunks] = useState<Record<string, unknown>[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  const load = () => {
    if (!courseId) return;
    Promise.all([
      facultyApi.getCourseFiles(Number(courseId)),
      facultyApi.getCourseModules(Number(courseId)),
    ]).then(([f, m]) => {
      setItems(f.data.items ?? []);
      setModules(m.data.modules ?? []);
    }).catch(() => {
      setItems([]);
      setModules([]);
    });
  };

  useEffect(() => { load(); }, [courseId]);

  const openChunks = async (item: Record<string, unknown>) => {
    if (!courseId) return;
    const contentType = String(item.content_type ?? 'DOCUMENT').toUpperCase();
    if (!['DOCUMENT', 'VIDEO'].includes(contentType)) return;
    setChunkSource(item);
    setChunks([]);
    setChunksLoading(true);
    try {
      const response = await facultyApi.getCourseFileChunks(
        Number(courseId),
        contentType as 'DOCUMENT' | 'VIDEO',
        Number(item.id),
        { limit: 40 },
      );
      setChunks(Array.isArray(response.data?.chunks) ? response.data.chunks : []);
    } catch {
      setChunks([]);
      toast.error('Failed to load chunks');
    } finally {
      setChunksLoading(false);
    }
  };

  const onUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('course_id', String(courseId));
      await userApi.uploadDocument(formData);
      toast.success('File uploaded');
      load();
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const addVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !videoUrl.trim()) return;
    try {
      await userApi.uploadYoutube({ youtube_url: videoUrl.trim(), title: videoTitle.trim() || 'Lecture Video', course_id: Number(courseId) });
      setVideoUrl('');
      setVideoTitle('');
      toast.success('Video linked');
      load();
    } catch {
      toast.error('Failed to link video');
    }
  };

  const uploadLectureRecording = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;
    setRecordingUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('course_id', String(courseId));
      formData.append('title', recordingTitle.trim() || file.name);
      await userApi.uploadLectureRecording(formData);
      toast.success('Lecture recording uploaded');
      setRecordingTitle('');
      load();
    } catch {
      toast.error('Lecture upload failed');
    } finally {
      setRecordingUploading(false);
      e.target.value = '';
    }
  };

  const attachToModule = async () => {
    if (!courseId || !selectedAttach || !selectedModule) return;
    await facultyApi.attachFileToModule(Number(courseId), {
      module_id: Number(selectedModule),
      content_type: selectedAttach.type,
      source_id: selectedAttach.id,
    });
    setSelectedAttach(null);
    setSelectedModule('');
    toast.success('Attached to module');
    load();
  };

  const deleteItem = async (item: Record<string, unknown>) => {
    const id = Number(item.id);
    if (!Number.isFinite(id) || id <= 0) return;
    try {
      if (String(item.content_type) === 'VIDEO') {
        await userApi.deleteVideo(id);
      } else {
        await userApi.deleteDocument(id);
      }
      if (chunkSource && Number(chunkSource.id) === id && String(chunkSource.content_type) === String(item.content_type)) {
        setChunkSource(null);
        setChunks([]);
      }
      if (previewItem && Number(previewItem.id) === id && String(previewItem.content_type) === String(item.content_type)) {
        setPreviewItem(null);
      }
      if (selectedAttach && selectedAttach.id === id && selectedAttach.type === String(item.content_type)) {
        setSelectedAttach(null);
      }
      toast.success('File deleted');
      load();
    } catch {
      toast.error('Failed to delete file');
    }
  };

  const toYouTubeEmbedUrl = (url: string): string | null => {
    try {
      const input = String(url || '').trim();
      if (!input) return null;
      const parsed = new URL(input);
      if (parsed.hostname.includes('youtu.be')) {
        const id = parsed.pathname.replace('/', '').trim();
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.hostname.includes('youtube.com')) {
        const id = parsed.searchParams.get('v');
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      return null;
    } catch {
      return null;
    }
  };

  const indexStatusPill = (value: unknown) => {
    const status = String(value ?? 'Processing');
    const normalized = status.toLowerCase();
    const palette = normalized === 'indexed'
      ? { bg: 'var(--status-success-soft)', color: 'var(--status-success)' }
      : normalized === 'failed'
        ? { bg: 'var(--status-danger-soft)', color: 'var(--status-danger)' }
        : { bg: 'var(--status-warning-soft)', color: 'var(--status-warning)' };
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 9px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: palette.bg,
          color: palette.color,
          border: '1px solid var(--border-subtle)',
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <CourseFrame section="Files">
      <Card style={{ marginBottom: 12 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Course scoped content for course <strong style={{ color: 'var(--text-primary)' }}>#{courseId}</strong>. Switching course changes this list.
        </div>
      </Card>
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Upload Course Files</h3>
        <Input type="file" onChange={onUploadFile} disabled={uploading} />
        <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>Supported: PDF, DOCX, PPTX, TXT, MD, CSV, XLSX.</p>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Upload Lecture Recording</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <Input value={recordingTitle} onChange={(e) => setRecordingTitle(e.target.value)} placeholder="Recording title (optional)" />
          <Input type="file" accept="video/*,audio/*" onChange={uploadLectureRecording} disabled={recordingUploading} />
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>Supported: MP4, MOV, WEBM, M4V, MP3 and other browser-playable lecture formats.</p>
        </div>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Lecture Recording Link</h3>
        <form onSubmit={addVideo} style={{ display: 'grid', gap: 8 }}>
          <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="YouTube URL" />
          <Input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Video title" />
          <Button type="submit">Save</Button>
        </form>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Files</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Created', 'Last Modified', 'Modified By', 'Size', 'Status', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={`${String(it.content_type)}-${String(it.id)}`}>
                  <td style={{ padding: '10px 8px', color: 'var(--text-primary)' }}>
                    <div style={{ fontWeight: 600 }}>{String(it.name)}</div>
                    {String(it.content_type) === 'VIDEO' && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {String(it.source_type ?? 'youtube') === 'upload' ? 'Lecture recording upload' : 'YouTube link'}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{new Date(String(it.created)).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{new Date(String(it.last_modified)).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{String(it.modified_by ?? 'System')}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{it.size ? `${Math.max(1, Math.round(Number(it.size) / 1024))} KB` : '-'}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                    {indexStatusPill(it.index_status ?? (it.status ? 'Indexed' : 'Processing'))}
                    {Number(it.chunk_count ?? 0) > 0 && (
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                        {Number(it.chunk_count)} chunks
                      </div>
                    )}
                    {Boolean(it.selected_store_name) && (
                      <div style={{ marginTop: 4, fontSize: 11, color: Boolean(it.selected_store_indexed === false) ? 'var(--danger-700)' : 'var(--text-muted)' }}>
                        Store: {String(it.selected_store_name)} • {it.selected_store_indexed === false ? 'Failed' : it.selected_store_indexed === true ? 'Success' : 'Unknown'}
                      </div>
                    )}
                    {it.selected_store_indexed === false && Boolean(it.selected_store_error) && (
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--danger-700)' }}>
                        {String(it.selected_store_error)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px', display: 'flex', gap: 6 }}>
                    {String(it.content_type) === 'DOCUMENT' && (
                      <>
                        <button
                          onClick={() => setPreviewItem(it)}
                          style={{ border: 'none', background: 'transparent', color: 'var(--brand-700)', cursor: 'pointer', padding: 0 }}
                        >
                          Preview
                        </button>
                        <a href={`/api/documents/${it.id}/download`} style={{ color: 'var(--brand-700)' }}>Download</a>
                      </>
                    )}
                    {String(it.content_type) === 'VIDEO' && String(it.source_type ?? 'youtube') !== 'upload' && Boolean(it.youtube_url) && (
                      <>
                        <button
                          onClick={() => setPreviewItem(it)}
                          style={{ border: 'none', background: 'transparent', color: 'var(--brand-700)', cursor: 'pointer', padding: 0 }}
                        >
                          Preview
                        </button>
                        <a href={String(it.youtube_url)} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-700)' }}>Open Link</a>
                      </>
                    )}
                    {String(it.content_type) === 'VIDEO' && String(it.source_type ?? 'youtube') === 'upload' && (
                      <>
                        <button
                          onClick={() => setPreviewItem(it)}
                          style={{ border: 'none', background: 'transparent', color: 'var(--brand-700)', cursor: 'pointer', padding: 0 }}
                        >
                          Preview
                        </button>
                        <a href={`/api/videos/${it.id}/download`} style={{ color: 'var(--brand-700)' }}>Download Recording</a>
                      </>
                    )}
                    <button
                      onClick={() => void openChunks(it)}
                      style={{ border: 'none', background: 'transparent', color: 'var(--brand-700)', cursor: 'pointer', padding: 0 }}
                    >
                      Chunks
                    </button>
                    <Button size="sm" variant="secondary" onClick={() => setSelectedAttach({ id: Number(it.id), type: String(it.content_type) })}>Attach</Button>
                    <Button size="sm" variant="danger" onClick={() => void deleteItem(it)}>Delete</Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={7} style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)' }}>No files yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {selectedAttach && (
        <Card style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Attach “{selectedAttach.type} #{selectedAttach.id}” to Module</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <Select value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)}>
              <option value="">Select module</option>
              {modules.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.title)}</option>)}
            </Select>
            <Button onClick={attachToModule}>Attach</Button>
          </div>
        </Card>
      )}
      {previewItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => setPreviewItem(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
          <Card
            style={{ width: 'min(1100px, 95vw)', height: 'min(85vh, 900px)', display: 'grid', gridTemplateRows: 'auto 1fr' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{String(previewItem.name ?? 'Preview')}</h4>
              <Button size="sm" variant="secondary" onClick={() => setPreviewItem(null)}>Close</Button>
            </div>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-canvas)' }}>
              {String(previewItem.content_type) === 'DOCUMENT' && (
                <iframe
                  title="Document preview"
                  src={`/api/documents/${previewItem.id}/preview`}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              )}
              {String(previewItem.content_type) === 'VIDEO' && String(previewItem.source_type ?? 'youtube') === 'upload' && (
                <video
                  controls
                  preload="metadata"
                  style={{ width: '100%', height: '100%', background: '#000' }}
                  src={`/api/videos/${previewItem.id}/stream`}
                />
              )}
              {String(previewItem.content_type) === 'VIDEO' && String(previewItem.source_type ?? 'youtube') !== 'upload' && (
                (() => {
                  const embed = toYouTubeEmbedUrl(String(previewItem.youtube_url ?? ''));
                  if (!embed) {
                    return (
                      <div style={{ padding: 16, color: 'var(--text-secondary)' }}>
                        This video link cannot be embedded. Use &quot;Open Link&quot; to view externally.
                      </div>
                    );
                  }
                  return (
                    <iframe
                      title="YouTube preview"
                      src={embed}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ width: '100%', height: '100%', border: 'none' }}
                    />
                  );
                })()
              )}
            </div>
          </Card>
          </div>
        </div>
      )}
      {chunkSource && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 70,
            padding: 16,
          }}
          onClick={() => setChunkSource(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Card style={{ width: 'min(960px, 95vw)', maxHeight: '85vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
                  Chunks: {String(chunkSource.name ?? 'Source')}
                </h4>
                <Button size="sm" variant="secondary" onClick={() => setChunkSource(null)}>Close</Button>
              </div>
              {chunksLoading ? (
                <div style={uiStyles.loadingCenter}><Spinner /></div>
              ) : chunks.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>No chunks indexed for this item yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {chunks.map((c, idx) => (
                    <div key={`chunk-${idx}`} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 10, background: 'var(--surface-subtle)' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        Chunk #{Number(c.chunk_index ?? idx)} • {Number(c.size_words ?? 0)} words • {Number(c.size_chars ?? 0)} chars
                      </div>
                      <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{String(c.preview ?? '')}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </CourseFrame>
  );
}

function FacultyChunks() {
  const { courseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [chunks, setChunks] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total: 0, avgWords: 0, avgChars: 0 });

  const load = async (nextSearch?: string) => {
    if (!courseId) return;
    setLoading(true);
    try {
      const response = await facultyApi.getCourseChunks(Number(courseId), {
        limit: 300,
        search: (nextSearch ?? search).trim() || undefined,
      });
      const list = Array.isArray(response.data?.chunks) ? response.data.chunks : [];
      setChunks(list);
      const total = Number(response.data?.total ?? list.length);
      const totalWords = list.reduce((sum: number, c: Record<string, unknown>) => sum + Number(c.size_words ?? 0), 0);
      const totalChars = list.reduce((sum: number, c: Record<string, unknown>) => sum + Number(c.size_chars ?? 0), 0);
      setStats({
        total,
        avgWords: list.length ? Math.round(totalWords / list.length) : 0,
        avgChars: list.length ? Math.round(totalChars / list.length) : 0,
      });
    } catch {
      setChunks([]);
      setStats({ total: 0, avgWords: 0, avgChars: 0 });
      toast.error('Failed to load course chunks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [courseId]);

  return (
    <CourseFrame section="Chunks">
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8 }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chunks by keyword..."
          />
          <Button variant="secondary" onClick={() => void load(search)}>Search</Button>
          <Button variant="secondary" onClick={() => { setSearch(''); void load(''); }}>Reset</Button>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, color: 'var(--text-secondary)', fontSize: 12 }}>
          <span>Total chunks: <strong style={{ color: 'var(--text-primary)' }}>{stats.total}</strong></span>
          <span>Avg words: <strong style={{ color: 'var(--text-primary)' }}>{stats.avgWords}</strong></span>
          <span>Avg chars: <strong style={{ color: 'var(--text-primary)' }}>{stats.avgChars}</strong></span>
        </div>
      </Card>

      {loading ? (
        <div style={uiStyles.loadingCenter}><Spinner /></div>
      ) : chunks.length === 0 ? (
        <Card><p style={{ margin: 0, color: 'var(--text-muted)' }}>No chunks found for this course yet.</p></Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {chunks.map((chunk) => (
            <Card key={String(chunk.id)}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {String(chunk.content_type)} • {String(chunk.source_name)} • Chunk #{Number(chunk.chunk_index ?? 0)} • {Number(chunk.size_words ?? 0)} words
              </div>
              <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                {String(chunk.preview ?? '')}
              </div>
            </Card>
          ))}
        </div>
      )}
    </CourseFrame>
  );
}

type QuizDraftQuestion = {
  question_text: string;
  question_type: string;
  correct_answer: string;
  correct_answers?: string[];
  options: string[];
  points: number;
};

type EditableQuizQuestion = {
  id: number;
  question_text: string;
  question_type: string;
  correct_answer: string;
  points: number;
  options: string[];
  citations: unknown[];
};

function FacultyQuizzes() {
  const { courseId } = useParams();
  const [quizzes, setQuizzes] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'needs_review'>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated');
  const [manual, setManual] = useState({ title: '', difficulty: 'medium', due_at: '', time_limit_minutes: '30', attempts_allowed: '1', quiz_length: '4' });
  const [questions, setQuestions] = useState<QuizDraftQuestion[]>([{ question_text: '', question_type: 'mcq', correct_answer: '', correct_answers: [], options: ['', '', '', ''], points: 1 }]);
  const [generating, setGenerating] = useState(false);
  const [docs, setDocs] = useState<Record<string, unknown>[]>([]);
  const [docIds, setDocIds] = useState<number[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);
  const [quizDetail, setQuizDetail] = useState<{ quiz: Record<string, unknown>; questions: Record<string, unknown>[] } | null>(null);
  const [editingQuestions, setEditingQuestions] = useState<Record<number, EditableQuizQuestion>>({});

  const filteredQuizzes = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = quizzes.filter((q) => {
      const titleMatch = !term || String(q.title ?? '').toLowerCase().includes(term);
      if (!titleMatch) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'published') return Boolean(q.is_published);
      if (statusFilter === 'needs_review') return Boolean(q.needs_review);
      return !Boolean(q.is_published);
    });
    base.sort((a, b) => {
      if (sortBy === 'title') return String(a.title ?? '').localeCompare(String(b.title ?? ''));
      if (sortBy === 'created') return new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime();
      return new Date(String(b.updated_at ?? b.created_at ?? 0)).getTime() - new Date(String(a.updated_at ?? a.created_at ?? 0)).getTime();
    });
    return base;
  }, [quizzes, search, statusFilter, sortBy]);

  const load = () => {
    if (!courseId) return;
    Promise.all([
      facultyApi.getCourseQuizzes(Number(courseId), search ? { search } : {}),
      userApi.getDocuments(Number(courseId)),
    ]).then(([q, d]) => {
      setQuizzes(q.data.quizzes ?? []);
      setDocs(d.data ?? []);
    }).catch(() => {
      setQuizzes([]);
      setDocs([]);
    });
  };

  useEffect(() => { load(); }, [courseId, search]);

  const addQuestion = () => {
    const targetLen = Math.max(1, Number(manual.quiz_length) || 1);
    if (questions.length >= targetLen) {
      toast.error(`Quiz length is ${targetLen}. Increase quiz length to add more questions.`);
      return;
    }
    setQuestions((prev) => [...prev, { question_text: '', question_type: 'mcq', correct_answer: '', correct_answers: [], options: ['', '', '', ''], points: 1 }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const createManual = async () => {
    if (!courseId || !manual.title.trim()) return;
    const quizLength = Math.max(1, Number(manual.quiz_length) || 1);
    const normalizedQuestions = questions.map((q) => {
      const cleanedOptions = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean);
      if (q.question_type === 'true_false') {
        const answer = q.correct_answer === 'false' ? 'false' : 'true';
        return { ...q, options: ['true', 'false'], correct_answer: answer };
      }
      if (q.question_type === 'multiple_select') {
        const correct = (q.correct_answers ?? []).filter(Boolean);
        return { ...q, options: cleanedOptions, correct_answer: JSON.stringify(correct) };
      }
      return { ...q, options: cleanedOptions, correct_answer: q.correct_answer };
    }).filter((q) => String(q.question_text ?? '').trim().length > 0);
    if (normalizedQuestions.length !== quizLength) {
      toast.error(`Manual quiz requires exactly ${quizLength} questions. Current: ${normalizedQuestions.length}.`);
      return;
    }
    await facultyApi.createManualQuiz(Number(courseId), {
      ...manual,
      attempts_allowed: Number(manual.attempts_allowed),
      time_limit_minutes: Number(manual.time_limit_minutes),
      quiz_length: quizLength,
      due_at: manual.due_at || null,
      questions: normalizedQuestions,
      is_published: false,
    });
    toast.success('Manual quiz draft created');
    setManual({ title: '', difficulty: 'medium', due_at: '', time_limit_minutes: '30', attempts_allowed: '1', quiz_length: String(quizLength) });
    setQuestions([{ question_text: '', question_type: 'mcq', correct_answer: '', correct_answers: [], options: ['', '', '', ''], points: 1 }]);
    load();
  };

  const generateQuiz = async () => {
    if (!courseId) return;
    setGenerating(true);
    try {
      await facultyApi.generateQuiz(Number(courseId), {
        title: manual.title || 'Generated Quiz',
        difficulty: manual.difficulty,
        question_count: Math.max(1, Number(manual.quiz_length) || 1),
        quiz_length: Math.max(1, Number(manual.quiz_length) || 1),
        question_types: ['multiple_choice', 'true_false', 'short_answer'],
        document_ids: docIds,
        due_at: manual.due_at || null,
        time_limit_minutes: Number(manual.time_limit_minutes),
        attempts_allowed: Number(manual.attempts_allowed),
      });
      toast.success('RAG quiz draft generated');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Quiz generation failed';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const publish = async (assessmentId: number, needsReview: boolean) => {
    if (!courseId) return;
    try {
      await facultyApi.publishQuiz(Number(courseId), assessmentId, { force_override: !needsReview });
      toast.success('Quiz published');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Publish failed';
      toast.error(msg);
    }
  };

  const loadQuizDetail = async (assessmentId: number) => {
    if (!courseId) return;
    setSelectedQuizId(assessmentId);
    const result = await facultyApi.getCourseQuizDetail(Number(courseId), assessmentId);
    setQuizDetail(result.data);
    const mapped: Record<number, EditableQuizQuestion> = {};
    for (const q of (result.data?.questions ?? [])) {
      const optionsPayload = (q.options ?? {}) as Record<string, unknown>;
      mapped[Number(q.id)] = {
        id: Number(q.id),
        question_text: String(q.question_text ?? ''),
        question_type: String(q.question_type ?? 'mcq'),
        correct_answer: String(q.correct_answer ?? ''),
        points: Number(q.points ?? 1),
        options: Array.isArray(optionsPayload.options) ? optionsPayload.options.map((v) => String(v)) : [],
        citations: Array.isArray(optionsPayload.citations) ? optionsPayload.citations : [],
      };
    }
    setEditingQuestions(mapped);
  };

  const regenerateQuestion = async (questionId: number) => {
    if (!courseId || !selectedQuizId) return;
    await facultyApi.regenerateQuizQuestion(Number(courseId), selectedQuizId, questionId, {
      difficulty: manual.difficulty,
    });
    toast.success('Question regenerated');
    loadQuizDetail(selectedQuizId);
    load();
  };

  const duplicateQuiz = async (assessmentId: number) => {
    if (!courseId) return;
    await facultyApi.duplicateQuiz(Number(courseId), assessmentId);
    toast.success('Quiz duplicated');
    load();
  };

  const deleteQuiz = async (assessmentId: number) => {
    if (!courseId) return;
    if (!window.confirm('Delete this quiz? This action cannot be undone.')) return;
    await facultyApi.deleteQuiz(Number(courseId), assessmentId);
    if (selectedQuizId === assessmentId) {
      setSelectedQuizId(null);
      setQuizDetail(null);
      setEditingQuestions({});
    }
    toast.success('Quiz deleted');
    load();
  };

  const updateEditingQuestion = (questionId: number, updater: (prev: EditableQuizQuestion) => EditableQuizQuestion) => {
    setEditingQuestions((prev) => {
      const current = prev[questionId];
      if (!current) return prev;
      return { ...prev, [questionId]: updater(current) };
    });
  };

  const saveQuestion = async (questionId: number) => {
    if (!courseId || !selectedQuizId) return;
    const payload = editingQuestions[questionId];
    if (!payload) return;
    await facultyApi.updateQuizQuestion(Number(courseId), selectedQuizId, questionId, {
      question_text: payload.question_text,
      question_type: payload.question_type,
      correct_answer: payload.correct_answer,
      points: payload.points,
      options: payload.options,
      citations: payload.citations,
    });
    toast.success('Question saved');
    await loadQuizDetail(selectedQuizId);
    load();
  };

  return (
    <CourseFrame section="Quizzes">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Create Course Quiz</h3>
        <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          All actions here are scoped to this selected course.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          <Input value={manual.title} onChange={(e) => setManual((p) => ({ ...p, title: e.target.value }))} placeholder="Quiz title" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Select value={manual.difficulty} onChange={(e) => setManual((p) => ({ ...p, difficulty: e.target.value }))}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
            <Input type="datetime-local" value={manual.due_at} onChange={(e) => setManual((p) => ({ ...p, due_at: e.target.value }))} />
            <Input value={manual.time_limit_minutes} onChange={(e) => setManual((p) => ({ ...p, time_limit_minutes: e.target.value }))} placeholder="Time limit (minutes)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Input
              type="number"
              min={1}
              max={20}
              value={manual.quiz_length}
              onChange={(e) => setManual((p) => ({ ...p, quiz_length: e.target.value }))}
              placeholder="Quiz length (questions)"
            />
            <Input
              value={manual.attempts_allowed}
              onChange={(e) => setManual((p) => ({ ...p, attempts_allowed: e.target.value }))}
              placeholder="Attempts allowed"
            />
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>
            Target length is exact. Manual and RAG modes both enforce this question count.
          </p>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>RAG Source Files</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {docs.map((d) => {
                const id = Number(d.id);
                const active = docIds.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => setDocIds((prev) => active ? prev.filter((v) => v !== id) : [...prev, id])}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 999,
                      padding: '5px 10px',
                      background: active ? 'var(--brand-soft)' : 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    {String(d.filename)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Manual Questions</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {questions.map((q, idx) => (
            <Card key={idx} style={{ background: 'var(--surface-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Question {idx + 1}</strong>
                <Button size="sm" variant="ghost" onClick={() => removeQuestion(idx)}>Remove</Button>
              </div>
              <Field label="Prompt">
                <Textarea value={q.question_text} onChange={(e) => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, question_text: e.target.value } : it))} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <Field label="Type">
                  <Select
                    value={q.question_type}
                    onChange={(e) => setQuestions((prev) => prev.map((it, i) => {
                      if (i !== idx) return it;
                      const nextType = e.target.value;
                      if (nextType === 'true_false') {
                        return { ...it, question_type: nextType, options: ['true', 'false'], correct_answer: 'true', correct_answers: [] };
                      }
                      return { ...it, question_type: nextType, options: it.options?.length ? it.options : ['', '', '', ''], correct_answers: [] };
                    }))}
                  >
                    <option value="mcq">MCQ</option>
                    <option value="multiple_select">Multiple Select</option>
                    <option value="true_false">True / False</option>
                    <option value="short_answer">Short Answer</option>
                    <option value="long_answer">Long Answer</option>
                  </Select>
                </Field>
                <Field label="Points">
                  <Input type="number" value={String(q.points)} onChange={(e) => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, points: Number(e.target.value) || 1 } : it))} />
                </Field>
                <Field label="Type Hint">
                  <Input value={q.question_type} readOnly />
                </Field>
              </div>

              {(q.question_type === 'mcq' || q.question_type === 'multiple_select') && (
                <Field label="Options Matrix">
                  <div style={{ display: 'grid', gap: 8 }}>
                    {q.options.map((option, optIdx) => {
                      const isMulti = q.question_type === 'multiple_select';
                      const multiSelected = (q.correct_answers ?? []).includes(option);
                      return (
                        <div key={optIdx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center' }}>
                          {isMulti ? (
                            <input
                              type="checkbox"
                              checked={multiSelected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setQuestions((prev) => prev.map((it, i) => {
                                  if (i !== idx) return it;
                                  const optionVal = it.options[optIdx] ?? '';
                                  const current = new Set(it.correct_answers ?? []);
                                  if (checked) current.add(optionVal);
                                  else current.delete(optionVal);
                                  return { ...it, correct_answers: Array.from(current) };
                                }));
                              }}
                            />
                          ) : (
                            <input
                              type="radio"
                              name={`q-${idx}-correct`}
                              checked={q.correct_answer === option}
                              onChange={() => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, correct_answer: it.options[optIdx] ?? '' } : it))}
                            />
                          )}
                          <Input
                            value={option}
                            onChange={(e) => setQuestions((prev) => prev.map((it, i) => {
                              if (i !== idx) return it;
                              const updated = [...it.options];
                              const oldValue = updated[optIdx];
                              updated[optIdx] = e.target.value;
                              const next = { ...it, options: updated };
                              if (!isMulti && it.correct_answer === oldValue) next.correct_answer = e.target.value;
                              if (isMulti) {
                                const set = new Set(it.correct_answers ?? []);
                                if (set.has(oldValue)) {
                                  set.delete(oldValue);
                                  set.add(e.target.value);
                                }
                                next.correct_answers = Array.from(set);
                              }
                              return next;
                            }))}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setQuestions((prev) => prev.map((it, i) => {
                              if (i !== idx || it.options.length <= 2) return it;
                              const updated = it.options.filter((_, oi) => oi !== optIdx);
                              const removed = it.options[optIdx];
                              const next = { ...it, options: updated };
                              if (it.question_type === 'mcq' && it.correct_answer === removed) next.correct_answer = '';
                              if (it.question_type === 'multiple_select') {
                                next.correct_answers = (it.correct_answers ?? []).filter((ans) => ans !== removed);
                              }
                              return next;
                            }))}
                          >
                            Remove
                          </Button>
                        </div>
                      );
                    })}
                    <div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, options: [...it.options, ''] } : it))}
                      >
                        Add Option
                      </Button>
                    </div>
                  </div>
                </Field>
              )}

              {q.question_type === 'true_false' && (
                <Field label="Correct Answer">
                  <Select value={q.correct_answer || 'true'} onChange={(e) => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, correct_answer: e.target.value } : it))}>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </Select>
                </Field>
              )}

              {(q.question_type === 'short_answer' || q.question_type === 'long_answer') && (
                <Field label="Expected Answer (optional)">
                  <Input value={q.correct_answer} onChange={(e) => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, correct_answer: e.target.value } : it))} />
                </Field>
              )}
            </Card>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={addQuestion}>Add Question</Button>
            <Button onClick={createManual}>Save Manual Draft</Button>
            <Button variant="secondary" loading={generating} onClick={generateQuiz}>Generate Quiz (RAG)</Button>
          </div>
        </div>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 220px', gap: 8, marginBottom: 8 }}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by quiz title..." />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'draft' | 'published' | 'needs_review')}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="needs_review">Needs review</option>
          </Select>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'updated' | 'created' | 'title')}>
            <option value="updated">Sort: Updated</option>
            <option value="created">Sort: Created</option>
            <option value="title">Sort: Title</option>
          </Select>
        </div>
        {filteredQuizzes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 10px' }}>
            <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>No quizzes yet for this course.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Button size="sm" variant="secondary" onClick={generateQuiz}>Generate Quiz from Course Uploads</Button>
              <Button size="sm" onClick={createManual}>Create Manual Quiz</Button>
            </div>
          </div>
        ) : filteredQuizzes.map((q) => (
          <div key={String(q.id)} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(q.title)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{String(q.source_type ?? 'MANUAL') === 'RAG' ? 'RAG Generated' : 'Manual'}</span>
                {' • '}
                <span>{q.is_published ? 'Published' : (q.needs_review ? 'Needs review' : 'Draft')}</span>
                {' • '}
                <span>{Number(q.question_count ?? 0)} questions</span>
                {' • '}
                <span>{Number(q.total_points ?? 0)} pts</span>
                {' • '}
                <span>Updated {new Date(String(q.updated_at ?? q.created_at)).toLocaleString()}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => loadQuizDetail(Number(q.id))}>Edit</Button>
              {!q.is_published && <Button size="sm" onClick={() => publish(Number(q.id), Boolean(q.needs_review))}>Publish</Button>}
              <Button size="sm" variant="secondary" onClick={() => duplicateQuiz(Number(q.id))}>Duplicate</Button>
              <Button size="sm" variant="ghost" onClick={() => deleteQuiz(Number(q.id))}>Delete</Button>
            </div>
          </div>
        ))}
      </Card>
      {selectedQuizId && quizDetail && (
        <Card style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Quiz Builder • {String(quizDetail.quiz?.title ?? '')}</h3>
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
            Edit each question, set answers, and regenerate specific questions from current course uploads.
          </p>
          {(quizDetail.questions ?? []).map((q) => (
            <div key={String(q.id)} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0' }}>
              <Input
                value={(editingQuestions[Number(q.id)]?.question_text ?? String(q.question_text ?? '')).replace(/\s*\(revised\)\s*$/gi, '')}
                onChange={(e) => updateEditingQuestion(Number(q.id), (prev) => ({ ...prev, question_text: e.target.value }))}
                placeholder="Question text"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 8, marginTop: 8 }}>
                <Select
                  value={editingQuestions[Number(q.id)]?.question_type ?? String(q.question_type ?? 'mcq')}
                  onChange={(e) => updateEditingQuestion(Number(q.id), (prev) => ({ ...prev, question_type: e.target.value }))}
                >
                  <option value="mcq">MCQ</option>
                  <option value="multiple_select">Multiple Select</option>
                  <option value="true_false">True / False</option>
                  <option value="short_answer">Short Answer</option>
                  <option value="long_answer">Long Answer</option>
                </Select>
                <Input
                  type="number"
                  value={String(editingQuestions[Number(q.id)]?.points ?? Number(q.points ?? 1))}
                  onChange={(e) => updateEditingQuestion(Number(q.id), (prev) => ({ ...prev, points: Number(e.target.value) || 1 }))}
                  placeholder="Points"
                />
                <Input
                  value={editingQuestions[Number(q.id)]?.correct_answer ?? String(q.correct_answer ?? '')}
                  onChange={(e) => updateEditingQuestion(Number(q.id), (prev) => ({ ...prev, correct_answer: e.target.value }))}
                  placeholder="Correct answer"
                />
              </div>
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {(editingQuestions[Number(q.id)]?.options ?? []).map((opt, optIdx) => (
                  <Input
                    key={`${q.id}-${optIdx}`}
                    value={opt}
                    onChange={(e) => updateEditingQuestion(Number(q.id), (prev) => {
                      const next = [...prev.options];
                      next[optIdx] = e.target.value;
                      return { ...prev, options: next };
                    })}
                    placeholder={`Option ${optIdx + 1}`}
                  />
                ))}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={() => saveQuestion(Number(q.id))}>Save Question</Button>
                <Button size="sm" variant="secondary" onClick={() => regenerateQuestion(Number(q.id))}>Regenerate This Question</Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </CourseFrame>
  );
}

function FacultyAssignments() {
  const { courseId } = useParams();
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [docs, setDocs] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [form, setForm] = useState({ title: '', description: '', due_at: '', rubric: '' });
  const [selectedAssignment, setSelectedAssignment] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, unknown>[]>([]);

  const load = () => {
    if (!courseId) return;
    Promise.all([
      facultyApi.getAssignments(Number(courseId)),
      userApi.getDocuments(Number(courseId)),
    ]).then(([a, d]) => {
      setAssignments(a.data.assignments ?? []);
      setDocs(d.data ?? []);
    }).catch(() => {
      setAssignments([]);
      setDocs([]);
    });
  };
  useEffect(() => { load(); }, [courseId]);

  useEffect(() => {
    if (!courseId || !selectedAssignment) return;
    facultyApi.getAssignmentSubmissions(Number(courseId), selectedAssignment).then((r) => setSubmissions(r.data.submissions ?? [])).catch(() => setSubmissions([]));
  }, [courseId, selectedAssignment]);

  const createAssignment = async () => {
    if (!courseId || !form.title.trim()) return;
    await facultyApi.createAssignment(Number(courseId), {
      title: form.title.trim(),
      description: form.description || null,
      due_at: form.due_at || null,
      rubric: form.rubric ? { text: form.rubric } : {},
      is_published: true,
    });
    setForm({ title: '', description: '', due_at: '', rubric: '' });
    toast.success('Assignment created');
    load();
  };

  const generateAssignmentFromUploads = () => {
    const top = docs.slice(0, 3).map((d) => String(d.filename ?? '')).filter(Boolean);
    if (!top.length) {
      toast.error('Upload course documents first to generate assignment prompt.');
      return;
    }
    setForm((prev) => ({
      ...prev,
      title: prev.title || `Assignment: ${top[0].replace(/\.[a-z0-9]+$/i, '')}`,
      description: prev.description || `Using uploaded course materials (${top.join(', ')}), write a short summary and answer key questions from the lecture content.`,
      rubric: prev.rubric || 'Clarity 40%, Accuracy 40%, Completeness 20%',
    }));
    toast.success('Assignment draft generated from course uploads');
  };

  const filteredAssignments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assignments
      .filter((a) => {
        const titleMatch = !term || String(a.title ?? '').toLowerCase().includes(term);
        if (!titleMatch) return false;
        if (statusFilter === 'all') return true;
        return statusFilter === 'published' ? Boolean(a.is_published) : !Boolean(a.is_published);
      })
      .sort((a, b) => new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime());
  }, [assignments, search, statusFilter]);

  const gradeSubmission = async (submissionId: number, score: string, feedback: string) => {
    if (!courseId) return;
    await facultyApi.gradeSubmission(Number(courseId), submissionId, { score: Number(score), feedback });
    toast.success('Submission graded');
    if (selectedAssignment) {
      const data = await facultyApi.getAssignmentSubmissions(Number(courseId), selectedAssignment);
      setSubmissions(data.data.submissions ?? []);
    }
  };

  return (
    <CourseFrame section="Assignments">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Create Assignment</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" />
          <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Input type="datetime-local" value={form.due_at} onChange={(e) => setForm((p) => ({ ...p, due_at: e.target.value }))} />
            <Input value={form.rubric} onChange={(e) => setForm((p) => ({ ...p, rubric: e.target.value }))} placeholder="Simple rubric notes" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={createAssignment}>Create</Button>
            <Button variant="secondary" onClick={generateAssignmentFromUploads}>Generate from Course Uploads</Button>
          </div>
        </div>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 8, marginBottom: 10 }}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignments..." />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'published' | 'draft')}>
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </Select>
        </div>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Course Assignments</h3>
        {filteredAssignments.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No assignments yet for this course.</p>}
        {filteredAssignments.map((a) => (
          <div key={String(a.id)} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(a.title)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {a.due_at ? new Date(String(a.due_at)).toLocaleString() : 'No due date'} • {a.is_published ? 'Published' : 'Draft'}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setSelectedAssignment(Number(a.id))}>View Submissions</Button>
          </div>
        ))}
      </Card>
      {selectedAssignment && (
        <Card style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Submissions</h3>
          {submissions.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No submissions yet.</p>}
          {submissions.map((s) => {
            const scoreKey = `score-${s.id}`;
            const fbKey = `feedback-${s.id}`;
            return (
              <AssignmentGradeRow key={String(s.id)} submission={s} scoreKey={scoreKey} feedbackKey={fbKey} onSave={gradeSubmission} />
            );
          })}
        </Card>
      )}
    </CourseFrame>
  );
}

function AssignmentGradeRow({
  submission, scoreKey, feedbackKey, onSave,
}: {
  submission: Record<string, unknown>;
  scoreKey: string;
  feedbackKey: string;
  onSave: (submissionId: number, score: string, feedback: string) => Promise<void>;
}) {
  const [score, setScore] = useState(submission.score !== null && submission.score !== undefined ? String(submission.score) : '');
  const [feedback, setFeedback] = useState(String(submission.feedback ?? ''));
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 0' }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{`${submission.first_name ?? ''} ${submission.last_name ?? ''}`.trim() || String(submission.email ?? 'Student')}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>{String(submission.status ?? 'submitted')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8 }}>
        <Input id={scoreKey} value={score} onChange={(e) => setScore(e.target.value)} placeholder="Score" />
        <Input id={feedbackKey} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback" />
        <Button size="sm" onClick={() => onSave(Number(submission.id), score, feedback)}>Save</Button>
      </div>
    </div>
  );
}

function FacultyGradebook() {
  const { courseId } = useParams();
  const [data, setData] = useState<{ columns: { quizzes: Record<string, unknown>[]; assignments: Record<string, unknown>[] }; rows: Record<string, unknown>[] } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    facultyApi.getGradebook(Number(courseId)).then((r) => setData(r.data)).catch(() => setData({ columns: { quizzes: [], assignments: [] }, rows: [] })).finally(() => setLoading(false));
  }, [courseId]);

  if (loading) return <CourseFrame section="Gradebook"><div style={uiStyles.loadingCenter}><Spinner /></div></CourseFrame>;
  const quizCols = data?.columns.quizzes ?? [];
  const assignmentCols = data?.columns.assignments ?? [];
  const rows = data?.rows ?? [];
  return (
    <CourseFrame section="Gradebook">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Gradebook</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>Student</th>
                {quizCols.map((q) => <th key={`q-${String(q.id)}`} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>{String(q.title)}</th>)}
                {assignmentCols.map((a) => <th key={`a-${String(a.id)}`} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-subtle)' }}>{String(a.title)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.student_id)}>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontWeight: 600 }}>{String(row.student_name)}</td>
                  {((row.quizzes ?? []) as Record<string, unknown>[]).map((q) => <td key={`rq-${String(q.id)}`} style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{q.score === null ? '—' : `${q.score}%`}</td>)}
                  {((row.assignments ?? []) as Record<string, unknown>[]).map((a) => <td key={`ra-${String(a.id)}`} style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{a.score === null ? String(a.status ?? 'missing') : `${a.score}`}</td>)}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={1 + quizCols.length + assignmentCols.length} style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)' }}>No student grade rows yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </CourseFrame>
  );
}

function FacultyCourseInbox() {
  const { courseId } = useParams();
  const [threads, setThreads] = useState<Record<string, unknown>[]>([]);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [selectedThread, setSelectedThread] = useState<number | null>(null);
  const [compose, setCompose] = useState({ title: '', body: '', target_user_id: '' });
  const [reply, setReply] = useState('');

  const loadThreads = () => {
    if (!courseId) return;
    facultyApi.getCourseThreads(Number(courseId)).then((r) => setThreads(r.data.threads ?? [])).catch(() => setThreads([]));
  };
  useEffect(() => { loadThreads(); }, [courseId]);

  const loadMessages = (threadId: number) => {
    if (!courseId) return;
    setSelectedThread(threadId);
    facultyApi.getThreadMessages(Number(courseId), threadId).then((r) => setMessages(r.data.messages ?? [])).catch(() => setMessages([]));
  };

  const createThread = async () => {
    if (!courseId || !compose.title.trim() || !compose.body.trim()) return;
    await facultyApi.createCourseThread(Number(courseId), {
      title: compose.title.trim(),
      body: compose.body.trim(),
      target_user_id: compose.target_user_id ? Number(compose.target_user_id) : null,
    });
    setCompose({ title: '', body: '', target_user_id: '' });
    loadThreads();
    toast.success('Thread created');
  };

  const sendReply = async () => {
    if (!courseId || !selectedThread || !reply.trim()) return;
    await facultyApi.sendThreadMessage(Number(courseId), selectedThread, reply.trim());
    setReply('');
    loadMessages(selectedThread);
  };

  return (
    <CourseFrame section="Course Inbox">
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 12 }}>
        <Card style={{ padding: 0 }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border-subtle)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Threads</strong>
          </div>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border-subtle)', display: 'grid', gap: 8 }}>
            <Input value={compose.title} onChange={(e) => setCompose((p) => ({ ...p, title: e.target.value }))} placeholder="Thread title" />
            <Input value={compose.target_user_id} onChange={(e) => setCompose((p) => ({ ...p, target_user_id: e.target.value }))} placeholder="Target student ID (optional)" />
            <Textarea value={compose.body} onChange={(e) => setCompose((p) => ({ ...p, body: e.target.value }))} placeholder="First message" />
            <Button size="sm" onClick={createThread}>Create Thread</Button>
          </div>
          {(threads ?? []).map((t) => (
            <button
              key={String(t.id)}
              onClick={() => loadMessages(Number(t.id))}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderBottom: '1px solid var(--border-subtle)',
                background: Number(t.id) === selectedThread ? 'var(--brand-soft)' : 'transparent',
                padding: 10,
                cursor: 'pointer',
              }}
            >
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(t.title)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{String(t.snippet ?? '')}</div>
            </button>
          ))}
        </Card>
        <Card>
          {!selectedThread ? (
            <div style={{ textAlign: 'center', padding: '60px 10px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 52 }}>✉️</div>
              <p>Select a thread to view messages.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {messages.map((m) => (
                <div key={String(m.id)} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10 }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{String(m.email ?? 'User')} • {new Date(String(m.created_at)).toLocaleString()}</div>
                  <div style={{ color: 'var(--text-primary)' }}>{String(m.body)}</div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply..." />
                <Button onClick={sendReply}>Send</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </CourseFrame>
  );
}

function FacultySettings() {
  const { courseId } = useParams();
  const [topic, setTopic] = useState('');
  const [announcement, setAnnouncement] = useState('');
  return (
    <CourseFrame section="Settings">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Course Level Settings</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <Field label="Course Topic">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic tag" />
          </Field>
          <Field label="Announcement Template">
            <Textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="Default course announcement text" />
          </Field>
          <Button variant="secondary" onClick={() => toast.success(`Settings saved locally for course ${courseId}`)}>Save</Button>
        </div>
      </Card>
    </CourseFrame>
  );
}

function FacultyCalendar() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    facultyApi.getCalendar().then((r) => setEvents(r.data.events ?? [])).catch(() => setEvents([]));
  }, []);
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, unknown>[]> = {};
    for (const ev of events) {
      const key = ev.event_at ? new Date(String(ev.event_at)).toDateString() : 'No Date';
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);
  return (
    <div>
      <PageHeader title="Calendar" subtitle="Due dates and course events" />
      <Card>
        {events.length === 0 ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No due dates scheduled.</p> : Object.entries(grouped).map(([day, dayEvents]) => (
          <div key={day} style={{ marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>{day}</h4>
            {dayEvents.map((ev, idx) => (
              <div key={idx} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '6px 0' }}>
                <div style={{ color: 'var(--text-primary)' }}>{String(ev.title)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{String(ev.course_title)} • {String(ev.event_type)}</div>
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}

function FacultyInbox() {
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [threads, setThreads] = useState<Record<string, unknown>[]>([]);
  const [courseId, setCourseId] = useState('');
  useEffect(() => {
    facultyApi.getInbox().then((r) => {
      setCourses(r.data.courses ?? []);
      setThreads(r.data.threads ?? []);
    }).catch(() => {
      setCourses([]);
      setThreads([]);
    });
  }, []);
  const reload = (nextCourse?: string) => {
    const selected = nextCourse ?? courseId;
    facultyApi.getInbox(selected ? { course_id: Number(selected) } : {}).then((r) => {
      setCourses(r.data.courses ?? []);
      setThreads(r.data.threads ?? []);
    }).catch(() => setThreads([]));
  };
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Course threaded messages" />
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 8 }}>
          <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); reload(e.target.value); }}>
            <option value="">All Courses</option>
            {courses.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.title)}</option>)}
          </Select>
          <Input placeholder="Search..." disabled />
        </div>
        <div style={{ marginTop: 12 }}>
          {threads.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No threads found.</p>}
          {threads.map((t) => (
            <div key={String(t.id)} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0' }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(t.title)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{String(t.course_title)} • {String(t.snippet ?? '')}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function FacultyHistory() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    facultyApi.getHistory().then((r) => setItems(r.data.items ?? [])).catch(() => setItems([]));
  }, []);
  return (
    <div>
      <PageHeader title="History" subtitle="Faculty audit activity" />
      <Card>
        {items.length === 0 ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No activity yet.</p> : items.map((i, idx) => (
          <div key={idx} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0' }}>
            <div style={{ color: 'var(--text-primary)' }}>{String(i.action)}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(String(i.created_at)).toLocaleString()}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function FacultyHelp() {
  return (
    <div>
      <PageHeader title="Help" subtitle="Faculty support resources" />
      <Card>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Use Modules to publish course structure, Quizzes for manual/RAG draft generation, Assignments for grading workflows, and Course Inbox for student threads.</p>
      </Card>
    </div>
  );
}

export default function FacultyPortal() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'FACULTY') return <Navigate to="/" replace />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <Sidebar />
      <main>
        <TopBar />
        <div style={{ padding: 16 }}>
          <Routes>
            <Route index element={<Navigate to="/faculty/dashboard" replace />} />
            <Route path="dashboard" element={<FacultyDashboard />} />
            <Route path="courses" element={<FacultyCourses />} />
            <Route path="courses/:courseId" element={<Navigate to="home" replace />} />
            <Route path="courses/:courseId/home" element={<FacultyCourseHome />} />
            <Route path="courses/:courseId/modules" element={<FacultyModules />} />
            <Route path="courses/:courseId/quizzes" element={<FacultyQuizzes />} />
            <Route path="courses/:courseId/assignments" element={<FacultyAssignments />} />
            <Route path="courses/:courseId/files" element={<FacultyFiles />} />
            <Route path="courses/:courseId/chunks" element={<FacultyChunks />} />
            <Route path="courses/:courseId/gradebook" element={<FacultyGradebook />} />
            <Route path="courses/:courseId/inbox" element={<FacultyCourseInbox />} />
            <Route path="courses/:courseId/settings" element={<FacultySettings />} />
            <Route path="calendar" element={<FacultyCalendar />} />
            <Route path="inbox" element={<FacultyInbox />} />
            <Route path="history" element={<FacultyHistory />} />
            <Route path="help" element={<FacultyHelp />} />
            <Route path="*" element={<Navigate to="/faculty/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
