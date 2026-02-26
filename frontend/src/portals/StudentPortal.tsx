import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Input, PageHeader, Select, Spinner } from '../components/shared/UI';
import { studentApi, userApi } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { uiStyles } from '../shared/ui/styleHelpers';

type StudentNavItem = { path: string; label: string; icon: string };

const STUDENT_NAV: StudentNavItem[] = [
  { path: '/student/account', label: 'Account', icon: '👤' },
  { path: '/student/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/student/courses', label: 'Courses', icon: '📚' },
  { path: '/student/calendar', label: 'Calendar', icon: '🗓️' },
  { path: '/student/inbox', label: 'Inbox', icon: '✉️' },
  { path: '/student/history', label: 'History', icon: '🕘' },
  { path: '/student/help', label: 'Help', icon: '❓' },
];

function groupByDay(items: Record<string, unknown>[]) {
  const groups: Record<string, Record<string, unknown>[]> = {};
  for (const item of items) {
    const at = String(item.activity_at ?? item.created_at ?? item.event_at ?? new Date().toISOString());
    const key = new Date(at).toDateString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function StudentTopBar({ onQuickAdd, onOpenHistory, onOpenAccount }: { onQuickAdd: () => void; onOpenHistory: () => void; onOpenAccount: () => void }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid var(--border-subtle)',
      padding: '10px 16px',
      background: 'var(--bg-surface)',
      position: 'sticky',
      top: 0,
      zIndex: 5,
    }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>EduLMS Student Experience</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Button variant="secondary" size="sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Today</Button>
        <Button variant="ghost" size="sm" onClick={onQuickAdd}>＋</Button>
        <Button variant="ghost" size="sm" onClick={onOpenHistory}>🔔</Button>
        <Button variant="ghost" size="sm" onClick={onOpenAccount}>⋮</Button>
      </div>
    </div>
  );
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside style={{
      width: collapsed ? 74 : 180,
      background: 'linear-gradient(180deg, var(--brand-700), var(--brand-600))',
      borderRight: '1px solid color-mix(in srgb, var(--text-inverse) 14%, transparent)',
      color: 'var(--text-inverse)',
      transition: 'width 180ms ease-out',
      minHeight: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ padding: '16px 12px', borderBottom: '1px solid color-mix(in srgb, var(--text-inverse) 14%, transparent)' }}>
        <div style={{ fontWeight: 700, fontSize: '30px', letterSpacing: '0.5px' }}>{collapsed ? 'E' : 'EduLMS'}</div>
        {!collapsed && <div style={{ fontSize: '12px', opacity: 0.9 }}>Student</div>}
      </div>
      <nav style={{ padding: '8px 6px', display: 'grid', gap: '4px' }}>
        {STUDENT_NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 10px',
              borderRadius: '10px',
              color: 'var(--text-inverse)',
              textDecoration: 'none',
              background: isActive ? 'color-mix(in srgb, var(--text-inverse) 20%, transparent)' : 'transparent',
              fontWeight: isActive ? 700 : 500,
              outlineOffset: 2,
            })}
          >
            <span aria-hidden="true">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function DashboardPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentApi.getDashboard()
      .then((r) => setItems(r.data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;
  const grouped = groupByDay(items);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Timeline and to-do history" />
      {items.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '56px' }}>📺</div>
          <h3 style={{ margin: '10px 0', color: 'var(--text-primary)' }}>Beginning of your To-Do History</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No recent activity yet. New course events will appear here.</p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {Object.entries(grouped).map(([date, dayItems]) => (
            <Card key={date}>
              <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: '18px' }}>{date}</h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                {dayItems.map((item, idx) => (
                  <div key={`${date}-${idx}`} style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr auto',
                    gap: '12px',
                    alignItems: 'center',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '10px',
                  }}>
                    <span style={{ color: 'var(--brand-700)', fontWeight: 600, textTransform: 'capitalize' }}>{String(item.activity_type ?? 'activity')}</span>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(item.title ?? 'Untitled')}</div>
                      {Boolean(item.course_title) && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{String(item.course_title)}</div>}
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{new Date(String(item.activity_at ?? item.created_at ?? item.event_at ?? new Date().toISOString())).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CoursesPage() {
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    studentApi.getCourses()
      .then((c) => setCourses(c.data.courses ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;
  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle="Published courses"
        actions={<Button variant="secondary" size="sm" onClick={() => setPanelOpen((v) => !v)}>{panelOpen ? 'Hide' : 'Show'} Course List</Button>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: panelOpen ? '340px 1fr' : '1fr', gap: '16px' }}>
        {panelOpen && (
          <Card>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Published Courses</h3>
            {courses.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No enrolled courses.</p>}
            <div style={{ display: 'grid', gap: '8px' }}>
              {courses.map((course) => (
                <button
                  key={String(course.id)}
                  onClick={() => navigate(`/student/courses/${course.id}/home`)}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    background: 'var(--surface-subtle)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{String(course.title)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{String(course.subject ?? 'General')}</div>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div style={{ textAlign: 'center', padding: '56px 12px', color: 'var(--text-muted)' }}>
            Select a course from the left panel to open course navigation (Home, Modules, Quizzes, Files, Badges).
          </div>
        </Card>
      </div>
    </div>
  );
}

const COURSE_MENU = [
  { key: 'home', label: 'Home' },
  { key: 'modules', label: 'Modules' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'files', label: 'Files' },
  { key: 'badges', label: 'Badges' },
];

function CourseFrame({ section, children, rightRail }: { section: string; children: React.ReactNode; rightRail?: React.ReactNode }) {
  const { courseId } = useParams();
  const [course, setCourse] = useState<Record<string, unknown> | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!courseId) return;
    studentApi.getCourseHome(Number(courseId))
      .then((r) => setCourse(r.data.course ?? null))
      .catch(() => setCourse(null));
  }, [courseId]);

  return (
    <div>
      <PageHeader
        title={String(course?.title ?? 'Course')}
        subtitle={`${String(course?.title ?? 'Course')} > ${section}`}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 260px', gap: '16px', alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'grid', gap: '6px' }}>
            {COURSE_MENU.map((item) => (
              <button
                key={item.key}
                onClick={() => navigate(`/student/courses/${courseId}/${item.key}`)}
                style={{
                  textAlign: 'left',
                  border: 'none',
                  background: section.toLowerCase() === item.label.toLowerCase() ? 'var(--brand-soft)' : 'transparent',
                  padding: '8px',
                  borderLeft: section.toLowerCase() === item.label.toLowerCase() ? '3px solid var(--brand-600)' : '3px solid transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: '6px',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Card>
        <div>{children}</div>
        <div>{rightRail}</div>
      </div>
    </div>
  );
}

function CourseHomeSection() {
  const { courseId } = useParams();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!courseId) return;
    studentApi.getCourseHome(Number(courseId)).then((r) => setData(r.data)).catch(() => setData({}));
  }, [courseId]);
  const summary = (data?.summary ?? {}) as Record<string, number>;
  return (
    <CourseFrame section="Home">
      <Card>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Course Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: '10px' }}>
          <Card><strong>{summary.documents ?? 0}</strong><div style={{ color: 'var(--text-muted)' }}>Documents</div></Card>
          <Card><strong>{summary.videos ?? 0}</strong><div style={{ color: 'var(--text-muted)' }}>Videos</div></Card>
          <Card><strong>{summary.quizzes ?? 0}</strong><div style={{ color: 'var(--text-muted)' }}>Quizzes</div></Card>
        </div>
      </Card>
    </CourseFrame>
  );
}

function CourseModulesSection() {
  const { courseId } = useParams();
  const [modules, setModules] = useState<Record<string, unknown>[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!courseId) return;
    studentApi.getCourseModules(Number(courseId))
      .then((r) => {
        const list = r.data.modules ?? [];
        setModules(list);
        const initial: Record<string, boolean> = {};
        list.forEach((m: Record<string, unknown>) => { initial[String(m.id)] = false; });
        setCollapsed(initial);
      })
      .catch(() => setModules([]))
      .finally(() => setLoading(false));
  }, [courseId]);

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    modules.forEach((m) => { next[String(m.id)] = value; });
    setCollapsed(next);
  };

  const itemIcon = (rawType: string) => {
    const type = String(rawType || '').toLowerCase();
    if (type === 'quiz') return '📝';
    if (type === 'document') return '📄';
    if (type === 'video') return '🎬';
    if (type === 'assignment') return '✅';
    if (type === 'link') return '🔗';
    return '📌';
  };

  return (
    <CourseFrame
      section="Modules"
      rightRail={
        <Card>
          <h4 style={{ marginTop: 0, color: 'var(--text-primary)' }}>To Do</h4>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Nothing for now</p>
          <h4 style={{ color: 'var(--text-primary)' }}>Recent Feedback</h4>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Nothing for now</p>
        </Card>
      }
    >
      <div style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => toggleAll(true)}>Collapse All</Button>
        </div>
        {loading ? <div style={uiStyles.loadingCenter}><Spinner /></div> : modules.length === 0 ? (
          <Card><p style={{ color: 'var(--text-muted)', margin: 0 }}>No modules available.</p></Card>
        ) : modules.map((module) => {
          const moduleId = String(module.id);
          const items = (module.items ?? []) as Record<string, unknown>[];
          return (
            <Card key={moduleId} style={{ padding: 0 }}>
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))}
                style={{ width: '100%', textAlign: 'left', border: 'none', background: 'var(--surface-subtle)', padding: '12px', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer' }}
              >
                {collapsed[moduleId] ? '▸' : '▾'} {String(module.title)}
              </button>
              {!collapsed[moduleId] && (
                <div>
                  {items.map((item) => (
                    <label key={String(item.module_item_id ?? item.key)} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: '10px', alignItems: 'center', padding: '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                      <span>{itemIcon(String(item.item_type))}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{String(item.title)}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(item.completed)}
                        onChange={(e) => {
                          if (!courseId) return;
                          const key = String(item.key ?? `module_item:${item.module_item_id}`);
                          const moduleItemId = Number(item.module_item_id);
                          const checked = e.target.checked;
                          if (!Number.isFinite(moduleItemId) || moduleItemId <= 0) return;
                          studentApi.setCourseItemCompletion(Number(courseId), moduleItemId, checked, key).then(() => {
                            setModules((prev) => prev.map((m) => {
                              if (String(m.id) !== moduleId) return m;
                              const nextItems = ((m.items ?? []) as Record<string, unknown>[]).map((it) =>
                                Number(it.module_item_id) === moduleItemId
                                  ? { ...it, completed: checked, status: checked ? 'COMPLETED' : 'NOT_STARTED' }
                                  : it);
                              return { ...m, items: nextItems };
                            }));
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </CourseFrame>
  );
}

function CourseQuizzesSection() {
  const { courseId } = useParams();
  const [search, setSearch] = useState('');
  const [quizzes, setQuizzes] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    studentApi.getCourseQuizzes(Number(courseId), search ? { search } : {})
      .then((r) => setQuizzes(r.data.quizzes ?? []))
      .catch(() => setQuizzes([]))
      .finally(() => setLoading(false));
  }, [courseId, search]);
  return (
    <CourseFrame section="Quizzes">
      <Card>
        <FieldLike label="Search for Quiz">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for quiz" />
        </FieldLike>
      </Card>
      <Card style={{ marginTop: '12px', padding: 0 }}>
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 700, color: 'var(--text-primary)' }}>Assignment Quizzes</div>
        {loading ? <div style={uiStyles.loadingCenter}><Spinner /></div> : quizzes.length === 0 ? (
          <div style={{ padding: '16px', color: 'var(--text-muted)' }}>No quizzes found.</div>
        ) : quizzes.map((quiz) => (
          <div key={String(quiz.id)} style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(quiz.title)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{Number(quiz.points ?? 100)} pts</div>
            </div>
            <span style={{ color: 'var(--text-muted)', alignSelf: 'center', fontSize: '12px' }}>{String(quiz.status ?? 'not_started')}</span>
            <Button size="sm">Open</Button>
          </div>
        ))}
      </Card>
    </CourseFrame>
  );
}

function CourseFilesSection() {
  const { courseId } = useParams();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!courseId) return;
    setLoading(true);
    studentApi.getCourseFiles(Number(courseId), { search, sort_by: sortBy, sort_dir: sortDir, page, limit: 10 })
      .then((r) => {
        setItems(r.data.items ?? []);
        setPagination(r.data.pagination ?? { page: 1, limit: 10, total: 0 });
      })
      .catch(() => {
        setItems([]);
        setPagination({ page: 1, limit: 10, total: 0 });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [courseId, search, sortBy, sortDir, page]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 10)));

  return (
    <CourseFrame section="Files">
      <Card>
        <FieldLike label="Search files">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px' }}>
            <Input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search files..." />
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Name</option>
              <option value="created">Created</option>
              <option value="last_modified">Last Modified</option>
              <option value="modified_by">Modified By</option>
              <option value="size">Size</option>
              <option value="status">Status</option>
            </Select>
            <Button size="sm" variant="secondary" onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}>
              {sortDir === 'asc' ? 'Asc' : 'Desc'}
            </Button>
          </div>
        </FieldLike>
      </Card>
      <Card style={{ marginTop: '12px', padding: 0 }}>
        {loading ? <div style={uiStyles.loadingCenter}><Spinner /></div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'Created', 'Last Modified', 'Modified By', 'Size', 'Status', 'Actions'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={String(item.id)}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{String(item.name)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{new Date(String(item.created)).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{new Date(String(item.last_modified)).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{String(item.modified_by ?? 'System')}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{Number(item.size ?? 0) > 1024 * 1024 ? `${(Number(item.size) / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(Number(item.size ?? 0) / 1024))} KB`}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{item.status ? 'Indexed' : 'Pending'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <a href={`/api/documents/${item.id}/download`} style={{ color: 'var(--brand-700)' }}>Download</a>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '18px', color: 'var(--text-muted)', textAlign: 'center' }}>No files found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
        <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Page {page} / {totalPages}</span>
        <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </CourseFrame>
  );
}

function CourseBadgesSection() {
  return (
    <CourseFrame section="Badges">
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 10px' }}>
          <div style={{ fontSize: '52px' }}>🏅</div>
          <h3 style={{ margin: '10px 0', color: 'var(--text-primary)' }}>No badges yet</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Complete quizzes and assignments to unlock badges.</p>
        </div>
      </Card>
    </CourseFrame>
  );
}

function CalendarPage() {
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (selected?: string) => {
    setLoading(true);
    Promise.all([
      studentApi.getCourses(),
      studentApi.getCalendar(selected ? { course_id: Number(selected) } : {}),
    ])
      .then(([c, e]) => {
        setCourses(c.data.courses ?? []);
        setEvents(e.data.events ?? []);
      })
      .catch(() => {
        setCourses([]);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const byDay = useMemo(() => groupByDay(events), [events]);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Month and agenda views"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant={view === 'month' ? 'primary' : 'secondary'} onClick={() => setView('month')}>Month</Button>
            <Button size="sm" variant={view === 'agenda' ? 'primary' : 'secondary'} onClick={() => setView('agenda')}>Agenda</Button>
          </div>
        }
      />
      <Card style={{ marginBottom: '14px' }}>
        <FieldLike label="Course Calendar">
          <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); load(e.target.value); }}>
            <option value="">All Courses</option>
            {courses.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.title)}</option>)}
          </Select>
        </FieldLike>
      </Card>
      {loading ? <div style={uiStyles.loadingCenter}><Spinner /></div> : (
        view === 'month' ? (
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
              {Array.from({ length: 35 }).map((_, idx) => {
                const day = new Date();
                day.setDate(1 - day.getDay() + idx);
                const key = day.toDateString();
                const dayEvents = byDay[key] ?? [];
                return (
                  <div key={key} style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px', minHeight: '90px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{day.getDate()}</div>
                    {dayEvents.slice(0, 2).map((ev, i) => (
                      <div key={`${key}-${i}`} style={{ fontSize: '11px', color: 'var(--brand-700)', marginTop: '4px' }}>
                        {String(ev.title ?? ev.event_type ?? 'Event')}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <Card>
            {events.length === 0 ? <p style={{ color: 'var(--text-muted)', margin: 0 }}>No upcoming calendar items.</p> : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {events.map((ev, i) => (
                  <div key={i} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(ev.title ?? 'Event')}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{new Date(String(ev.event_at)).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      )}
    </div>
  );
}

function InboxPage() {
  const [courseFilter, setCourseFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('inbox');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Record<string, unknown>[]>([]);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (convId?: number | null) => {
    setLoading(true);
    Promise.all([studentApi.getCourses(), studentApi.getInbox(convId ? { conversation_id: convId } : {})])
      .then(([c, i]) => {
        setCourses(c.data.courses ?? []);
        setConversations(i.data.conversations ?? []);
        setMessages(i.data.messages ?? []);
        setSelectedId(i.data.selected_conversation_id ?? null);
      })
      .catch(() => {
        setCourses([]);
        setConversations([]);
        setMessages([]);
        setSelectedId(null);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filteredConversations = conversations.filter((c) =>
    String(c.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
    String(c.snippet ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Messages and conversations" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: '8px', marginBottom: '12px' }}>
        <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
          <option value="">All Courses</option>
          {courses.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.title)}</option>)}
        </Select>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="inbox">Inbox</option>
          <option value="sent">Sent</option>
          <option value="archived">Archived</option>
        </Select>
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <div style={uiStyles.loadingCenter}><Spinner /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '14px' }}>
          <Card style={{ padding: 0 }}>
            {filteredConversations.length === 0 ? (
              <div style={{ padding: '24px', color: 'var(--text-muted)' }}>No conversations found.</div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={String(conv.id)}
                  onClick={() => load(Number(conv.id))}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    padding: '12px',
                    background: Number(conv.id) === Number(selectedId) ? 'var(--brand-soft)' : 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{String(conv.title ?? 'Conversation')}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{String(conv.snippet ?? '').slice(0, 90)}</div>
                </button>
              ))
            )}
          </Card>
          <Card>
            {!selectedId ? (
              <div style={{ textAlign: 'center', padding: '70px 16px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '56px' }}>✉️</div>
                <h3 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>No Conversation Selected</h3>
                <p style={{ margin: 0 }}>Choose a message thread from the left pane.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {messages.map((m) => (
                  <div key={String(m.id)} style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: String(m.role) === 'user' ? 'var(--brand-soft)' : 'var(--surface-subtle)',
                  }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>{String(m.role).toUpperCase()}</div>
                    <div style={{ color: 'var(--text-primary)' }}>{String(m.content ?? '')}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function HistoryPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentApi.getHistory()
      .then((r) => setItems(r.data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="History"
        subtitle="Recent 30 day activity"
        actions={<Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'} Panel</Button>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: open ? '360px 1fr' : '1fr', gap: '16px' }}>
        {open && (
          <Card style={{ minHeight: '360px' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Recent History</h3>
            {loading ? <Spinner /> : items.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <div style={{ fontSize: '56px' }}>🐼</div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>Nothing in the last 30 days</h4>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>Your actions will show up here once you start interacting.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {items.map((item, idx) => (
                  <div key={idx} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(item.action ?? 'Activity')}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{new Date(String(item.created_at)).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
        <Card>
          <div style={{ color: 'var(--text-secondary)' }}>
            History panel is designed as a slide-out reference, similar to Canvas behavior.
          </div>
        </Card>
      </div>
    </div>
  );
}

function AccountPage({ onOpenPanel }: { onOpenPanel: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  useEffect(() => {
    studentApi.getAccount()
      .then((r) => setData(r.data))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, []);

  const profile = (data?.profile ?? {}) as Record<string, unknown>;
  return (
    <div>
      <PageHeader title="Account" subtitle="Profile and quick links" actions={<Button size="sm" variant="secondary" onClick={onOpenPanel}>Open Account Panel</Button>} />
      {loading ? <Spinner /> : (
        <Card>
          <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>
            {String(profile.first_name ?? '')} {String(profile.last_name ?? '')}
          </h3>
          <p style={{ color: 'var(--text-muted)' }}>{String(profile.email ?? '')}</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm">Notifications</Button>
            <Button variant="secondary" size="sm">Profile</Button>
            <Button variant="secondary" size="sm">Files</Button>
            <Button variant="secondary" size="sm">Settings</Button>
            <Button variant="danger" size="sm" onClick={() => logout()}>Logout</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function HelpPage() {
  return (
    <div>
      <PageHeader title="Help" subtitle="Support resources" />
      <Card>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Need assistance? Contact your institution admin or instructor for course-specific issues.
        </p>
      </Card>
    </div>
  );
}

function FieldLike({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  );
}

function SlidePanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '360px',
      maxWidth: '92vw',
      height: '100vh',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border-subtle)',
      transform: `translateX(${open ? '0' : '100%'})`,
      transition: 'transform 220ms ease-out',
      zIndex: 30,
      boxShadow: 'var(--shadow-md)',
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>
        <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
      </div>
      <div style={{ padding: '14px', overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

export default function StudentPortal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'STUDENT') return <Navigate to="/" replace />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${collapsed ? 74 : 180}px 1fr`, minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <Sidebar collapsed={collapsed} />
      <main>
        <StudentTopBar
          onQuickAdd={() => navigate('/student/courses')}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenAccount={() => setAccountOpen(true)}
        />
        <div style={{ padding: '18px' }}>
          <div style={{ marginBottom: '10px' }}>
            <Button size="sm" variant="ghost" onClick={() => setCollapsed((v) => !v)}>{collapsed ? 'Expand Menu' : 'Collapse Menu'}</Button>
          </div>
          <Routes>
            <Route index element={<Navigate to="/student/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="courses/:courseId" element={<Navigate to="home" replace />} />
            <Route path="courses/:courseId/home" element={<CourseHomeSection />} />
            <Route path="courses/:courseId/modules" element={<CourseModulesSection />} />
            <Route path="courses/:courseId/quizzes" element={<CourseQuizzesSection />} />
            <Route path="courses/:courseId/files" element={<CourseFilesSection />} />
            <Route path="courses/:courseId/badges" element={<CourseBadgesSection />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="account" element={<AccountPage onOpenPanel={() => setAccountOpen(true)} />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="*" element={<Navigate to="/student/dashboard" replace />} />
          </Routes>
        </div>
      </main>

      <SlidePanel open={accountOpen} title="Account" onClose={() => setAccountOpen(false)}>
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '999px', margin: '0 auto', background: 'var(--brand-soft)', display: 'grid', placeItems: 'center', fontSize: '26px' }}>
            {String(user.firstName?.[0] ?? 'S')}{String(user.lastName?.[0] ?? 'T')}
          </div>
          <h3 style={{ color: 'var(--text-primary)', margin: '10px 0 4px' }}>{user.firstName} {user.lastName}</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{user.email}</p>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {['Notifications', 'Profile', 'Files', 'Settings'].map((label) => (
            <Button key={label} variant="secondary">{label}</Button>
          ))}
          <Button variant="danger" onClick={() => logout()}>Logout</Button>
        </div>
      </SlidePanel>

      <SlidePanel open={historyOpen} title="Recent History" onClose={() => setHistoryOpen(false)}>
        <HistoryPage />
      </SlidePanel>

      {(accountOpen || historyOpen) && (
        <button
          aria-label="Close panel overlay"
          onClick={() => { setAccountOpen(false); setHistoryOpen(false); }}
          style={{ position: 'fixed', inset: 0, border: 'none', background: 'var(--overlay-soft)', zIndex: 20 }}
        />
      )}
    </div>
  );
}
