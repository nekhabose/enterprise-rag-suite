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
      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="sm" variant="secondary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Today</Button>
        <Button size="sm" variant="ghost">＋</Button>
        <Button size="sm" variant="ghost">🔔</Button>
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
      <PageHeader title={String(course?.title ?? 'Course')} subtitle={`${String(course?.title ?? 'Course')} > ${section}`} />
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
          <Card key={String(module.id)} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{String(module.title)}</h4>
              <Button size="sm" variant={module.is_published ? 'secondary' : 'primary'} onClick={() => toggleModulePublish(Number(module.id))}>
                {module.is_published ? 'Unpublish' : 'Publish'}
              </Button>
            </div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {((module.items ?? []) as Record<string, unknown>[]).map((item) => (
                <div key={String(item.id)} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(item.title)}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{String(item.item_type)} • {item.is_published ? 'Published' : 'Draft'}</div>
                  </div>
                </div>
              ))}
              {((module.items ?? []) as Record<string, unknown>[]).length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No items in this module.</p>}
            </div>
          </Card>
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
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');

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

  return (
    <CourseFrame section="Files">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Upload Course Files</h3>
        <Input type="file" onChange={onUploadFile} disabled={uploading} />
        <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>Supported: PDF, DOCX, PPTX, TXT, MD, CSV, XLSX.</p>
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
                  <td style={{ padding: '10px 8px', color: 'var(--text-primary)' }}>{String(it.name)}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{new Date(String(it.created)).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{new Date(String(it.last_modified)).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{String(it.modified_by ?? 'System')}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{it.size ? `${Math.max(1, Math.round(Number(it.size) / 1024))} KB` : '-'}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{it.status ? 'Ready' : 'Pending'}</td>
                  <td style={{ padding: '10px 8px', display: 'flex', gap: 6 }}>
                    {String(it.content_type) === 'DOCUMENT' && <a href={`/api/documents/${it.id}/download`} style={{ color: 'var(--brand-700)' }}>Download</a>}
                    <Button size="sm" variant="secondary" onClick={() => setSelectedAttach({ id: Number(it.id), type: String(it.content_type) })}>Attach</Button>
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
    </CourseFrame>
  );
}

type QuizDraftQuestion = {
  question_text: string;
  question_type: string;
  correct_answer: string;
  options: string[];
  points: number;
};

function FacultyQuizzes() {
  const { courseId } = useParams();
  const [quizzes, setQuizzes] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState({ title: '', difficulty: 'medium', due_at: '', time_limit_minutes: '30', attempts_allowed: '1' });
  const [questions, setQuestions] = useState<QuizDraftQuestion[]>([{ question_text: '', question_type: 'mcq', correct_answer: '', options: ['', '', '', ''], points: 1 }]);
  const [generating, setGenerating] = useState(false);
  const [docs, setDocs] = useState<Record<string, unknown>[]>([]);
  const [docIds, setDocIds] = useState<number[]>([]);

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
    setQuestions((prev) => [...prev, { question_text: '', question_type: 'mcq', correct_answer: '', options: ['', '', '', ''], points: 1 }]);
  };

  const createManual = async () => {
    if (!courseId || !manual.title.trim()) return;
    await facultyApi.createManualQuiz(Number(courseId), {
      ...manual,
      attempts_allowed: Number(manual.attempts_allowed),
      time_limit_minutes: Number(manual.time_limit_minutes),
      due_at: manual.due_at || null,
      questions,
      is_published: false,
    });
    toast.success('Manual quiz draft created');
    setManual({ title: '', difficulty: 'medium', due_at: '', time_limit_minutes: '30', attempts_allowed: '1' });
    setQuestions([{ question_text: '', question_type: 'mcq', correct_answer: '', options: ['', '', '', ''], points: 1 }]);
    load();
  };

  const generateQuiz = async () => {
    if (!courseId) return;
    setGenerating(true);
    try {
      await facultyApi.generateQuiz(Number(courseId), {
        title: manual.title || 'Generated Quiz',
        difficulty: manual.difficulty,
        question_count: 5,
        question_types: ['multiple_choice', 'true_false', 'short_answer'],
        document_ids: docIds,
        due_at: manual.due_at || null,
        time_limit_minutes: Number(manual.time_limit_minutes),
        attempts_allowed: Number(manual.attempts_allowed),
      });
      toast.success('RAG quiz draft generated');
      load();
    } catch {
      toast.error('Quiz generation failed');
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

  return (
    <CourseFrame section="Quizzes">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Quiz Builder</h3>
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
              <Field label={`Question ${idx + 1}`}>
                <Textarea value={q.question_text} onChange={(e) => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, question_text: e.target.value } : it))} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Type">
                  <Select value={q.question_type} onChange={(e) => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, question_type: e.target.value } : it))}>
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
              </div>
              <Field label="Correct Answer">
                <Input value={q.correct_answer} onChange={(e) => setQuestions((prev) => prev.map((it, i) => i === idx ? { ...it, correct_answer: e.target.value } : it))} />
              </Field>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Quiz List</h3>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quiz..." />
        </div>
        {quizzes.length === 0 ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No quizzes created.</p> : quizzes.map((q) => (
          <div key={String(q.id)} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(q.title)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {String(q.source_type)} • {q.is_published ? 'Published' : 'Draft'} • {q.needs_review ? 'Needs review' : 'Citations OK'}
              </div>
            </div>
            {!q.is_published && <Button size="sm" onClick={() => publish(Number(q.id), Boolean(q.needs_review))}>Publish</Button>}
          </div>
        ))}
      </Card>
    </CourseFrame>
  );
}

function FacultyAssignments() {
  const { courseId } = useParams();
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ title: '', description: '', due_at: '', rubric: '' });
  const [selectedAssignment, setSelectedAssignment] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, unknown>[]>([]);

  const load = () => {
    if (!courseId) return;
    facultyApi.getAssignments(Number(courseId)).then((r) => setAssignments(r.data.assignments ?? [])).catch(() => setAssignments([]));
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
          <Button onClick={createAssignment}>Create</Button>
        </div>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Assignments</h3>
        {assignments.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>No assignments yet.</p>}
        {assignments.map((a) => (
          <div key={String(a.id)} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(a.title)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{a.due_at ? new Date(String(a.due_at)).toLocaleString() : 'No due date'}</div>
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
