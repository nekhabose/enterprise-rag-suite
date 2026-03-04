import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import SidebarLayout from '../components/shared/SidebarLayout';
import {
  Modal, Field, Input, Select, Button, Badge, Table, StatCard,
  Spinner, PageHeader, Card, Tabs, SearchInput, Textarea,
} from '../components/shared/UI';
import { autoGrid, uiStyles } from '../shared/ui/styleHelpers';
import { facultyApi } from '../shared/api/client';
import { userApi } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const NAV_ITEMS_STUDENT = [
  { path: '/portal/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/portal/my-courses', label: 'My Courses', icon: '📚' },
  { path: '/portal/content', label: 'Lessons', icon: '📂' },
  { path: '/portal/assignments', label: 'Assignments', icon: '📝' },
  { path: '/portal/quizzes', label: 'Quizzes', icon: '✏️' },
  { path: '/portal/progress', label: 'Progress', icon: '📈' },
];

const NAV_ITEMS_FACULTY = [
  { path: '/portal/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/portal/my-courses', label: 'My Courses', icon: '📚' },
  { path: '/portal/content', label: 'Content', icon: '📂', permission: 'DOCUMENT_WRITE' },
  { path: '/portal/assignments', label: 'Assignments', icon: '📝' },
  { path: '/portal/quizzes', label: 'Quizzes', icon: '✏️' },
  { path: '/portal/gradebook', label: 'Gradebook', icon: '📘', permission: 'STUDENT_PROGRESS_READ' },
];

function RoleDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [videos, setVideos] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      userApi.getCourses(),
      userApi.getDocuments(),
      userApi.getVideos(),
    ])
      .then(([c, d, v]) => {
        setCourses(c.data.courses ?? c.data ?? []);
        setDocuments(d.data ?? []);
        setVideos(v.data ?? []);
      })
      .catch(() => {
        setCourses([]);
        setDocuments([]);
        setVideos([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;

  return (
    <div>
      <PageHeader
        title={user?.role === 'FACULTY' ? 'Faculty Dashboard' : 'Student Dashboard'}
        subtitle={user?.role === 'FACULTY' ? 'Manage course delivery and assessments' : 'Track learning and submissions'}
      />
      <div style={autoGrid(220, true)}>
        <StatCard label="My Courses" value={courses.length} icon="📚" />
        <StatCard label="Documents" value={documents.length} icon="📄" />
        <StatCard label="Lecture Videos" value={videos.length} icon="🎬" />
      </div>
    </div>
  );
}

// ============================================================
// Courses
// ============================================================
function Courses() {
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    userApi.getCourses()
      .then((r) => setCourses(r.data.courses ?? r.data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = courses.filter((c) =>
    String(c.title).toLowerCase().includes(search.toLowerCase()) ||
    String(c.subject ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="My Courses" subtitle={`${courses.length} enrolled courses`} />
      <div style={uiStyles.sectionSpacing}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search courses..." />
      </div>
      {loading ? (
        <div style={uiStyles.loadingCenterText}><Spinner /></div>
      ) : (
        <div style={autoGrid(280)}>
          {filtered.length === 0 && (
            <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1', textAlign: 'center', padding: '40px 0' }}>
              No courses found. Contact your university admin to enroll in courses.
            </p>
          )}
          {filtered.map((course) => (
            <div
              key={course.id as number}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/portal/content?course_id=${Number(course.id)}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/portal/content?course_id=${Number(course.id)}`);
                }
              }}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '14px', padding: '22px', cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>📘</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{String(course.title)}</h3>
              {Boolean(course.subject) && <Badge style={{ marginBottom: '12px' }}>{String(course.subject)}</Badge>}
              {Boolean(course.description) && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '12px 0 0' }}>
                  {String(course.description).substring(0, 100)}...
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentModule() {
  const { user, hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const queryCourseId = Number(searchParams.get('course_id') ?? '');
  const initialCourseId = Number.isFinite(queryCourseId) && queryCourseId > 0 ? queryCourseId : null;
  const isFaculty = user?.role === 'FACULTY';
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(initialCourseId);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [videos, setVideos] = useState<Record<string, unknown>[]>([]);
  const [chunks, setChunks] = useState<Record<string, unknown>[]>([]);
  const [chunkSource, setChunkSource] = useState<Record<string, unknown> | null>(null);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submittingYt, setSubmittingYt] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const canUpload = isFaculty && hasPermission('DOCUMENT_WRITE');

  const load = useCallback(async (courseId?: number | null) => {
    setLoading(true);
    try {
      const [courseRes, docRes, videoRes] = await Promise.all([
        userApi.getCourses(),
        userApi.getDocuments(courseId ?? undefined),
        userApi.getVideos(),
      ]);
      const courseList = courseRes.data.courses ?? courseRes.data ?? [];
      setCourses(courseList);
      const nextCourseId = courseId ?? selectedCourseId ?? initialCourseId ?? (courseList[0]?.id as number | undefined) ?? null;
      setSelectedCourseId(nextCourseId);
      const docs = docRes.data ?? [];
      const vids = (videoRes.data ?? []).filter((v: Record<string, unknown>) =>
        nextCourseId ? Number(v.course_id) === Number(nextCourseId) : true,
      );
      setDocuments(docs);
      setVideos(vids);
    } catch {
      setCourses([]);
      setDocuments([]);
      setVideos([]);
      setChunks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId, initialCourseId, isFaculty]);

  useEffect(() => { load(); }, [load]);

  const onCourseChange = (value: string) => {
    const id = value ? Number(value) : null;
    setSelectedCourseId(id);
    load(id);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCourseId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('course_id', String(selectedCourseId));
      const res = await userApi.uploadDocument(formData);
      const createdId = Number(res?.data?.document_id ?? 0);
      setDocuments((prev) => {
        const optimistic = {
          id: createdId > 0 ? createdId : `optimistic-${Date.now()}`,
          filename: file.name,
          course_id: selectedCourseId,
          is_indexed: false,
        } as Record<string, unknown>;
        const exists = prev.some((d) => String(d.id) === String(optimistic.id));
        return exists ? prev : [optimistic, ...prev];
      });
      toast.success('Document uploaded');
      window.setTimeout(() => { void load(selectedCourseId); }, 700);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleYoutube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) return;
    setSubmittingYt(true);
    try {
      await userApi.uploadYoutube({
        youtube_url: ytUrl,
        title: ytTitle || 'Lecture recording',
        course_id: selectedCourseId,
      });
      toast.success('Video added');
      setYtUrl('');
      setYtTitle('');
      await load(selectedCourseId);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add video');
    } finally {
      setSubmittingYt(false);
    }
  };

  const deleteDocument = async (id: number) => {
    try {
      await userApi.deleteDocument(id);
      toast.success('Document deleted');
      await load(selectedCourseId);
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const deleteVideo = async (id: number) => {
    try {
      await userApi.deleteVideo(id);
      toast.success('Video deleted');
      await load(selectedCourseId);
    } catch {
      toast.error('Failed to delete video');
    }
  };

  const openChunks = async (item: Record<string, unknown>, contentType: 'DOCUMENT' | 'VIDEO') => {
    if (!selectedCourseId || !isFaculty) return;
    setChunkSource(item);
    setChunks([]);
    setChunksLoading(true);
    try {
      const response = await facultyApi.getCourseFileChunks(
        Number(selectedCourseId),
        contentType,
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

  if (loading) return <div style={uiStyles.loadingCenter}><Spinner /></div>;

  return (
    <div>
      <PageHeader
        title={isFaculty ? 'Content' : 'Lessons'}
        subtitle={isFaculty ? 'Upload and manage content in assigned courses' : 'View learning content by enrolled course'}
      />
      <Card style={{ marginBottom: '16px' }}>
        <Field label="Course">
          <Select value={selectedCourseId ?? ''} onChange={(e) => onCourseChange(e.target.value)}>
            <option value="" disabled>Select course</option>
            {courses.map((course) => (
              <option key={String(course.id)} value={String(course.id)}>{String(course.title)}</option>
            ))}
          </Select>
        </Field>
      </Card>

      {canUpload && (
        <div style={autoGrid(340)}>
          <Card>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Upload Document</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>PDF, DOCX, TXT, MD, CSV, PPTX, XLSX</p>
            <Input type="file" onChange={handleFileUpload} disabled={uploading || !selectedCourseId} />
          </Card>
          <Card>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Add Lecture Video</h3>
            <form onSubmit={handleYoutube}>
              <Field label="YouTube URL" required>
                <Input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} required />
              </Field>
              <Field label="Title">
                <Input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} />
              </Field>
              <Button type="submit" loading={submittingYt} disabled={!selectedCourseId}>Save Video</Button>
            </form>
          </Card>
        </div>
      )}

      <Card style={{ marginTop: '16px' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Documents</h3>
        {documents.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No documents for this course.</p>}
        {documents.map((doc) => (
          <div key={String(doc.id)} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(doc.filename ?? 'Untitled')}</div>
              {Number(doc.chunk_count ?? 0) > 0 && (
                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>
                  {Number(doc.chunk_count)} chunks
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {isFaculty && (
                <button
                  onClick={() => void openChunks(doc, 'DOCUMENT')}
                  style={{ border: 'none', background: 'transparent', color: 'var(--brand-700)', cursor: 'pointer', padding: 0 }}
                >
                  Chunks
                </button>
              )}
              {canUpload && hasPermission('DOCUMENT_DELETE') && (
                <Button size="sm" variant="danger" onClick={() => deleteDocument(Number(doc.id))}>Delete</Button>
              )}
            </div>
          </div>
        ))}
      </Card>

      <Card style={{ marginTop: '16px' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Lecture Videos</h3>
        {videos.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No videos for this course.</p>}
        {videos.map((video) => (
          <div key={String(video.id)} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(video.title ?? video.youtube_url ?? 'Video')}</div>
              {Number(video.chunk_count ?? 0) > 0 && (
                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>
                  {Number(video.chunk_count)} chunks
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {isFaculty && (
                <button
                  onClick={() => void openChunks(video, 'VIDEO')}
                  style={{ border: 'none', background: 'transparent', color: 'var(--brand-700)', cursor: 'pointer', padding: 0 }}
                >
                  Chunks
                </button>
              )}
              {canUpload && hasPermission('VIDEO_DELETE') && (
                <Button size="sm" variant="danger" onClick={() => deleteVideo(Number(video.id))}>Delete</Button>
              )}
            </div>
          </div>
        ))}
      </Card>

      {chunkSource && (
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
          onClick={() => setChunkSource(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Card style={{ width: 'min(960px, 95vw)', maxHeight: '85vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
                  Chunks: {String(chunkSource.filename ?? chunkSource.title ?? 'Source')}
                </h4>
                <Button size="sm" variant="secondary" onClick={() => setChunkSource(null)}>Close</Button>
              </div>
              {chunksLoading ? (
                <div style={uiStyles.loadingCenter}><Spinner /></div>
              ) : chunks.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>No chunks indexed for this item yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {chunks.map((chunk, idx) => (
                    <div key={String(chunk.id ?? idx)} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 12, background: 'var(--bg-elevated)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: 6 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>
                          Chunk #{String(chunk.chunk_index ?? idx)}
                        </strong>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {String(chunk.size_words ?? 0)} words • {String(chunk.size_chars ?? 0)} chars
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {String(chunk.preview ?? '').trim() || 'No preview available.'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// AI Chat
// ============================================================
interface Message { role: 'user' | 'assistant'; content: string; sources?: unknown[]; }

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);
    try {
      const res = await userApi.chat({
        message: text,
        conversationId,
        tenantId: user?.tenantId,
        top_k: 10,
      });
      setConversationId(res.data.conversation_id ?? conversationId);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: res.data.response,
        sources: res.data.sources,
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      }]);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      <PageHeader title="AI Tutor" subtitle="Ask questions about your course content" />

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 0 16px',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>AI Tutor Ready</div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Ask me anything about your course material. I'll search your documents and provide accurate, cited answers.
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
              {['Explain the key concepts from Chapter 1', 'What are the main topics in this course?', 'Summarize the latest lecture'].map((s) => (
                <button key={s} onClick={() => setInput(s)} style={{
                  padding: '8px 16px', borderRadius: '100px', border: '1px solid color-mix(in srgb, var(--brand-600) 30%, transparent)',
                  background: 'var(--brand-soft)', color: 'var(--brand-700)', fontSize: '13px', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%', padding: '12px 16px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.role === 'user' ? 'linear-gradient(135deg, var(--brand-600), var(--brand-700))' : 'var(--bg-elevated)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
              color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6,
            }}>
              {msg.content}
              {msg.sources && (msg.sources as unknown[]).length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Sources: {(msg.sources as Record<string, string>[]).map((s, si) => (
                    <span key={si} style={{ marginLeft: '4px', color: 'var(--brand-700)' }}>[{si + 1}] {s.filename ?? s.title}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '12px 16px', borderRadius: '14px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '14px',
            }}>
              <span >Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', gap: '12px', padding: '16px',
        background: 'var(--bg-elevated)', borderRadius: '14px',
        border: '1px solid var(--border-subtle)',
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your course material..."
          rows={1}
          style={{
            flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '14px',
            resize: 'none', outline: 'none', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
          }}
        />
        <Button onClick={handleSend} disabled={!input.trim() || sending} loading={sending}>
          Send ↑
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Assessments
// ============================================================
function FacultyAssessments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCourseId = Number(searchParams.get('course_id') ?? 0);
  const [courses, setCourses] = useState<Record<string, unknown>[]>([]);
  const [courseId, setCourseId] = useState<number>(Number.isFinite(initialCourseId) && initialCourseId > 0 ? initialCourseId : 0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [files, setFiles] = useState<Record<string, unknown>[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, unknown>[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);
  const [quizDetail, setQuizDetail] = useState<Record<string, unknown> | null>(null);
  const [manual, setManual] = useState({
    title: '',
    difficulty: 'medium',
    due_at: '',
    time_limit_minutes: '30',
    attempts_allowed: '1',
    quiz_length: '5',
  });
  const [docIds, setDocIds] = useState<number[]>([]);
  const [questions, setQuestions] = useState<Array<{
    question_text: string;
    question_type: string;
    correct_answer: string;
    options: string[];
    points: number;
  }>>([
    { question_text: '', question_type: 'mcq', correct_answer: '', options: ['', '', '', ''], points: 1 },
  ]);
  const [addQuestionDraft, setAddQuestionDraft] = useState({
    question_text: '',
    question_type: 'mcq',
    correct_answer: '',
    options: ['', '', '', ''],
    points: '1',
  });

  const loadQuizDetail = useCallback(async (nextCourseId: number, assessmentId: number) => {
    const result = await facultyApi.getCourseQuizDetail(nextCourseId, assessmentId);
    setSelectedQuizId(assessmentId);
    setQuizDetail(result.data);
  }, []);

  const load = useCallback(async (nextCourseId?: number) => {
    const activeCourseId = nextCourseId ?? courseId;
    if (!activeCourseId) {
      setFiles([]);
      setQuizzes([]);
      setQuizDetail(null);
      setSelectedQuizId(null);
      setDocIds([]);
      return;
    }
    const [filesRes, quizzesRes] = await Promise.all([
      facultyApi.getCourseFiles(activeCourseId),
      facultyApi.getCourseQuizzes(activeCourseId),
    ]);
    const nextFiles = filesRes.data?.items ?? [];
    const nextQuizzes = quizzesRes.data?.quizzes ?? [];
    setFiles(nextFiles);
    setQuizzes(nextQuizzes);
    const availableDocIds = nextFiles
      .filter((item: Record<string, unknown>) => String(item.content_type ?? '').toUpperCase() === 'DOCUMENT')
      .map((item: Record<string, unknown>) => Number(item.id))
      .filter((id: number) => Number.isFinite(id) && id > 0);
    setDocIds((prev) => {
      const kept = prev.filter((id) => availableDocIds.includes(id));
      return kept.length ? kept : availableDocIds;
    });
    if (selectedQuizId && nextQuizzes.some((quiz: Record<string, unknown>) => Number(quiz.id) === selectedQuizId)) {
      await loadQuizDetail(activeCourseId, selectedQuizId);
    } else {
      setSelectedQuizId(null);
      setQuizDetail(null);
    }
  }, [courseId, loadQuizDetail, selectedQuizId]);

  useEffect(() => {
    setLoading(true);
    facultyApi.getCourses()
      .then((res) => {
        const nextCourses = res.data?.courses ?? [];
        setCourses(nextCourses);
        const fallbackCourseId = nextCourses.length ? Number(nextCourses[0].id) : 0;
        const resolvedCourseId = courseId || fallbackCourseId;
        if (resolvedCourseId && resolvedCourseId !== courseId) {
          setCourseId(resolvedCourseId);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('course_id', String(resolvedCourseId));
            return next;
          });
        }
        if (resolvedCourseId) {
          return load(resolvedCourseId);
        }
      })
      .catch(() => {
        setCourses([]);
        setFiles([]);
        setQuizzes([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!courseId) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('course_id', String(courseId));
      return next;
    });
    load().catch(() => undefined);
  }, [courseId]);

  const addManualDraftQuestion = () => {
    setQuestions((prev) => [...prev, { question_text: '', question_type: 'mcq', correct_answer: '', options: ['', '', '', ''], points: 1 }]);
  };

  const removeManualDraftQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const normalizeQuestionPayload = (question: { question_text: string; question_type: string; correct_answer: string; options: string[]; points: number }) => {
    const type = String(question.question_type || 'mcq');
    const trimmedOptions = (question.options ?? []).map((option) => String(option).trim()).filter(Boolean);
    if (type === 'true_false') {
      return {
        ...question,
        question_type: 'true_false',
        options: ['true', 'false'],
        correct_answer: question.correct_answer === 'false' ? 'false' : 'true',
      };
    }
    if (type === 'short_answer') {
      return {
        ...question,
        question_type: 'short_answer',
        options: [],
      };
    }
    return {
      ...question,
      question_type: 'mcq',
      options: trimmedOptions.length ? trimmedOptions.slice(0, 4) : [],
    };
  };

  const createManualQuiz = async () => {
    if (!courseId || !manual.title.trim()) {
      toast.error('Select a course and enter a quiz title.');
      return;
    }
    const quizLength = Math.max(1, Number(manual.quiz_length) || 1);
    const normalizedQuestions = questions
      .map(normalizeQuestionPayload)
      .filter((question) => question.question_text.trim().length > 0);
    if (normalizedQuestions.length !== quizLength) {
      toast.error(`Manual quiz requires exactly ${quizLength} questions. Current: ${normalizedQuestions.length}.`);
      return;
    }
    setSaving(true);
    try {
      const res = await facultyApi.createManualQuiz(courseId, {
        ...manual,
        quiz_length: quizLength,
        attempts_allowed: Number(manual.attempts_allowed) || 1,
        time_limit_minutes: Number(manual.time_limit_minutes) || 30,
        questions: normalizedQuestions,
        is_published: false,
      });
      toast.success('Manual quiz draft created');
      const createdId = Number(res.data?.assessment?.id ?? 0);
      await load(courseId);
      if (createdId) await loadQuizDetail(courseId, createdId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to create manual quiz');
    } finally {
      setSaving(false);
    }
  };

  const generateQuiz = async () => {
    if (!courseId) {
      toast.error('Select a course first.');
      return;
    }
    setGenerating(true);
    try {
      const res = await facultyApi.generateQuiz(courseId, {
        title: manual.title.trim() || `Quiz ${new Date().toLocaleDateString()}`,
        difficulty: manual.difficulty,
        question_count: Math.max(1, Number(manual.quiz_length) || 1),
        quiz_length: Math.max(1, Number(manual.quiz_length) || 1),
        question_types: ['multiple_choice', 'true_false', 'short_answer'],
        document_ids: docIds,
        due_at: manual.due_at || null,
        time_limit_minutes: Number(manual.time_limit_minutes) || 30,
        attempts_allowed: Number(manual.attempts_allowed) || 1,
      });
      toast.success('Quiz draft generated');
      const createdId = Number(res.data?.assessment?.id ?? 0);
      await load(courseId);
      if (createdId) await loadQuizDetail(courseId, createdId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Quiz generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const addQuestionToExistingQuiz = async () => {
    if (!courseId || !selectedQuizId || !addQuestionDraft.question_text.trim()) {
      toast.error('Open a quiz draft and enter a question first.');
      return;
    }
    try {
      const payload = normalizeQuestionPayload({
        question_text: addQuestionDraft.question_text,
        question_type: addQuestionDraft.question_type,
        correct_answer: addQuestionDraft.correct_answer,
        options: addQuestionDraft.options,
        points: Math.max(1, Number(addQuestionDraft.points) || 1),
      });
      await facultyApi.addQuizQuestion(courseId, selectedQuizId, payload);
      toast.success('Question added to quiz');
      setAddQuestionDraft({ question_text: '', question_type: 'mcq', correct_answer: '', options: ['', '', '', ''], points: '1' });
      await loadQuizDetail(courseId, selectedQuizId);
      await load(courseId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to add question');
    }
  };

  const docs = files.filter((item) => String(item.content_type ?? '').toUpperCase() === 'DOCUMENT');
  const videos = files.filter((item) => String(item.content_type ?? '').toUpperCase() === 'VIDEO');
  const quizQuestions = (quizDetail?.questions ?? []) as Record<string, unknown>[];

  return (
    <div>
      <PageHeader title="Faculty Quiz Builder" subtitle="Generate quizzes from the selected course's uploaded documents, video links, and lecture recordings." />
      {loading ? <Spinner /> : (
        <>
          <Card>
            <div style={{ display: 'grid', gap: '10px' }}>
              <Field label="Course">
                <Select value={courseId ? String(courseId) : ''} onChange={(e) => setCourseId(Number(e.target.value) || 0)}>
                  {courses.map((course) => (
                    <option key={String(course.id)} value={String(course.id)}>
                      {String(course.title)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <Field label="Quiz Title">
                  <Input value={manual.title} onChange={(e) => setManual((prev) => ({ ...prev, title: e.target.value }))} placeholder="Quiz title" />
                </Field>
                <Field label="Difficulty">
                  <Select value={manual.difficulty} onChange={(e) => setManual((prev) => ({ ...prev, difficulty: e.target.value }))}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </Select>
                </Field>
                <Field label="Quiz Length">
                  <Input type="number" min={1} max={20} value={manual.quiz_length} onChange={(e) => setManual((prev) => ({ ...prev, quiz_length: e.target.value }))} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <Field label="Due At">
                  <Input type="datetime-local" value={manual.due_at} onChange={(e) => setManual((prev) => ({ ...prev, due_at: e.target.value }))} />
                </Field>
                <Field label="Time Limit (minutes)">
                  <Input value={manual.time_limit_minutes} onChange={(e) => setManual((prev) => ({ ...prev, time_limit_minutes: e.target.value }))} />
                </Field>
                <Field label="Attempts Allowed">
                  <Input value={manual.attempts_allowed} onChange={(e) => setManual((prev) => ({ ...prev, attempts_allowed: e.target.value }))} />
                </Field>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>Use These Uploaded Documents</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {docs.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No documents uploaded for this course yet.</span>
                  ) : docs.map((doc) => {
                    const id = Number(doc.id);
                    const active = docIds.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDocIds((prev) => active ? prev.filter((value) => value !== id) : [...prev, id])}
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '999px',
                          padding: '6px 12px',
                          background: active ? 'var(--brand-soft-strong)' : 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        {String(doc.name ?? doc.filename ?? `Document ${id}`)}
                      </button>
                    );
                  })}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
                  Lecture videos and YouTube links in this course are included automatically. Current video sources: {videos.length}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button onClick={createManualQuiz} loading={saving}>Save Manual Draft</Button>
                <Button variant="secondary" onClick={generateQuiz} loading={generating}>Generate Quiz (RAG)</Button>
              </div>
            </div>
          </Card>

          <Card style={{ marginTop: '16px' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Manual Questions For New Quiz</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              {questions.map((question, index) => (
                <div key={index} style={{ border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Question {index + 1}</strong>
                    <Button size="sm" variant="ghost" onClick={() => removeManualDraftQuestion(index)}>Remove</Button>
                  </div>
                  <Field label="Question">
                    <Textarea value={question.question_text} onChange={(e) => setQuestions((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, question_text: e.target.value } : item))} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <Field label="Type">
                      <Select value={question.question_type} onChange={(e) => setQuestions((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, question_type: e.target.value } : item))}>
                        <option value="mcq">MCQ</option>
                        <option value="true_false">True / False</option>
                        <option value="short_answer">Short Answer</option>
                      </Select>
                    </Field>
                    <Field label="Correct Answer">
                      <Input value={question.correct_answer} onChange={(e) => setQuestions((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, correct_answer: e.target.value } : item))} />
                    </Field>
                    <Field label="Points">
                      <Input type="number" min={1} value={String(question.points)} onChange={(e) => setQuestions((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, points: Math.max(1, Number(e.target.value) || 1) } : item))} />
                    </Field>
                  </div>
                  {question.question_type === 'mcq' && (
                    <Field label="Options">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {question.options.map((option, optionIndex) => (
                          <Input
                            key={optionIndex}
                            value={option}
                            onChange={(e) => setQuestions((prev) => prev.map((item, itemIndex) => {
                              if (itemIndex !== index) return item;
                              const nextOptions = [...item.options];
                              nextOptions[optionIndex] = e.target.value;
                              return { ...item, options: nextOptions };
                            }))}
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                        ))}
                      </div>
                    </Field>
                  )}
                </div>
              ))}
              <div>
                <Button size="sm" variant="secondary" onClick={addManualDraftQuestion}>Add Manual Question</Button>
              </div>
            </div>
          </Card>

          <Card style={{ marginTop: '16px' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Course Quiz Drafts</h3>
            {quizzes.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No quizzes created for this course yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {quizzes.map((quiz) => (
                  <div key={String(quiz.id)} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{String(quiz.title)}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {(String(quiz.source_type ?? 'MANUAL') === 'RAG' ? 'RAG Generated' : 'Manual')}
                        {' • '}
                        {quiz.is_published ? 'Published' : (quiz.needs_review ? 'Needs review' : 'Draft')}
                        {' • '}
                        {Number(quiz.question_count ?? 0)} questions
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => loadQuizDetail(courseId, Number(quiz.id))}>Edit Draft</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {selectedQuizId && quizDetail && (
            <Card style={{ marginTop: '16px' }}>
              <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Editing Quiz: {String((quizDetail.quiz as Record<string, unknown>)?.title ?? selectedQuizId)}</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {quizQuestions.map((question) => {
                  const optionsPayload = (question.options ?? {}) as Record<string, unknown>;
                  const editableOptions = Array.isArray(optionsPayload.options) ? optionsPayload.options.map((value) => String(value)) : [];
                  const citations = Array.isArray(optionsPayload.citations) ? optionsPayload.citations : [];
                  return (
                    <div key={Number(question.id)} style={{ border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{String(question.question_text)}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                        {String(question.question_type)} • {Number(question.points ?? 1)} point(s)
                      </div>
                      {editableOptions.length > 0 && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                          Options: {editableOptions.join(', ')}
                        </div>
                      )}
                      <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                        Correct answer: {String(question.correct_answer ?? '—')}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        Citations: {citations.length}
                      </div>
                    </div>
                  );
                })}

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <h4 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Add Manual Question To This Draft</h4>
                  <Field label="Question">
                    <Textarea value={addQuestionDraft.question_text} onChange={(e) => setAddQuestionDraft((prev) => ({ ...prev, question_text: e.target.value }))} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <Field label="Type">
                      <Select value={addQuestionDraft.question_type} onChange={(e) => setAddQuestionDraft((prev) => ({ ...prev, question_type: e.target.value }))}>
                        <option value="mcq">MCQ</option>
                        <option value="true_false">True / False</option>
                        <option value="short_answer">Short Answer</option>
                      </Select>
                    </Field>
                    <Field label="Correct Answer">
                      <Input value={addQuestionDraft.correct_answer} onChange={(e) => setAddQuestionDraft((prev) => ({ ...prev, correct_answer: e.target.value }))} />
                    </Field>
                    <Field label="Points">
                      <Input type="number" min={1} value={addQuestionDraft.points} onChange={(e) => setAddQuestionDraft((prev) => ({ ...prev, points: e.target.value }))} />
                    </Field>
                  </div>
                  {addQuestionDraft.question_type === 'mcq' && (
                    <Field label="Options">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {addQuestionDraft.options.map((option, index) => (
                          <Input
                            key={index}
                            value={option}
                            onChange={(e) => setAddQuestionDraft((prev) => {
                              const nextOptions = [...prev.options];
                              nextOptions[index] = e.target.value;
                              return { ...prev, options: nextOptions };
                            })}
                            placeholder={`Option ${index + 1}`}
                          />
                        ))}
                      </div>
                    </Field>
                  )}
                  <Button onClick={addQuestionToExistingQuiz}>Add Question</Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Assessments() {
  const { user } = useAuth();
  if (user?.role === 'FACULTY') {
    return <FacultyAssessments />;
  }

  const [assessments, setAssessments] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAssessment, setActiveAssessment] = useState<Record<string, unknown> | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    userApi.getAssessments()
      .then((r) => setAssessments(r.data.assessments ?? r.data ?? []))
      .catch(() => setAssessments([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!activeAssessment) return;
    setSubmitting(true);
    try {
      const res = await userApi.submitAssessment(activeAssessment.id as number, { answers });
      setResults(res.data);
      toast.success('Assessment submitted!');
    } catch { toast.error('Failed to submit'); }
    finally { setSubmitting(false); }
  };

  if (activeAssessment) {
    const questions = (activeAssessment.questions ?? []) as Record<string, unknown>[];
    return (
      <div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
          <Button variant="ghost" onClick={() => { setActiveAssessment(null); setAnswers({}); setResults(null); }}>← Back</Button>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>{String(activeAssessment.title)}</h1>
        </div>

        {results ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                {results.score as number ?? 0}%
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>Assessment Complete</div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {questions.map((q, qi) => (
              <Card key={qi}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
                  Q{qi + 1}. {String(q.question_text)}
                </div>
                {q.question_type === 'mcq' && (q.options as string[])?.map((opt, oi) => (
                  <label key={oi} style={{
                    display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 14px',
                    borderRadius: '8px', cursor: 'pointer', marginBottom: '8px',
                    background: answers[q.id as number] === opt ? 'var(--brand-soft-strong)' : 'var(--bg-surface)',
                    border: `1px solid ${answers[q.id as number] === opt ? 'color-mix(in srgb, var(--brand-600) 50%, transparent)' : 'var(--border-subtle)'}`,
                  }}>
                    <input
                      type="radio"
                      name={`q${q.id}`}
                      value={opt}
                      checked={answers[q.id as number] === opt}
                      onChange={() => setAnswers({ ...answers, [q.id as number]: opt })}
                      style={{ accentColor: 'var(--brand-600)' }}
                    />
                    <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{opt}</span>
                  </label>
                ))}
                {q.question_type === 'short_answer' && (
                  <Textarea
                    value={answers[q.id as number] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id as number]: e.target.value })}
                    placeholder="Your answer..."
                  />
                )}
              </Card>
            ))}
            <Button onClick={handleSubmit} loading={submitting} style={{ alignSelf: 'flex-start' }}>
              Submit Assessment
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Assessments" subtitle="Quizzes and assignments" />
      {loading ? <Spinner /> : (
        <div style={autoGrid(280)}>
          {assessments.length === 0 && (
            <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1' }}>No assessments available yet.</p>
          )}
          {assessments.map((a) => (
            <Card key={a.id as number} style={{ cursor: 'pointer' }}>
              <div style={{ fontSize: '24px', marginBottom: '12px' }}>✏️</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{String(a.title)}</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <Badge>{String(a.assessment_type ?? 'quiz').toUpperCase()}</Badge>
                <Badge>{String(a.difficulty ?? 'medium')}</Badge>
              </div>
              <Button size="sm" onClick={() => setActiveAssessment(a)}>Start Assessment</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Progress
// ============================================================
function Progress() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    userApi.getProgress().then((r) => setData(r.data)).catch(() => setData({}));
  }, []);
  const raw = (data ?? {}) as Record<string, unknown>;
  const toNum = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value) || 0;
    return 0;
  };
  const m = {
    coursesCompleted: toNum(raw.coursesCompleted ?? raw.courses_completed),
    assessmentsTaken: toNum(raw.assessmentsTaken ?? raw.assessments_taken),
    avgScore: toNum(raw.avgScore ?? raw.avg_score),
    chatMessages: toNum(raw.chatMessages ?? raw.chat_messages),
  };

  return (
    <div>
      <PageHeader title="My Progress" subtitle="Track your learning journey" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard label="Courses Completed" value={m.coursesCompleted ?? 0} icon="✅" />
        <StatCard label="Assessments Taken" value={m.assessmentsTaken ?? 0} icon="✏️" />
        <StatCard label="Average Score" value={`${m.avgScore ?? 0}%`} icon="🎯" />
        <StatCard label="AI Interactions" value={m.chatMessages ?? 0} icon="💬" />
      </div>
    </div>
  );
}

// ============================================================
// Student Progress (Faculty only)
// ============================================================
function StudentProgress() {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    userApi.getStudentProgress()
      .then((r) => setData(r.data.students ?? r.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Student Progress" subtitle="Engagement and performance across your courses" />
      {loading ? <Spinner /> : (
        <div style={uiStyles.surfaceTableShell}>
          <Table
            columns={[
              { key: 'student_name', label: 'Student' },
              { key: 'course_title', label: 'Course' },
              { key: 'chat_count', label: 'AI Interactions' },
              { key: 'assessment_avg', label: 'Avg Score' },
              { key: 'last_active', label: 'Last Active' },
            ]}
            data={data}
            renderCell={(row, key) => {
              if (key === 'last_active') return row.last_active ? new Date(row.last_active as string).toLocaleDateString() : '—';
              if (key === 'assessment_avg') return `${row.assessment_avg ?? 0}%`;
              return String(row[key] ?? '—');
            }}
            emptyText="No student data available"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Create Assessment (Faculty only)
// ============================================================
function CreateAssessment() {
  const [form, setForm] = useState({
    title: '', topic: '', difficulty: 'medium', numQuestions: '5', questionType: 'mcq',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await userApi.createAssessment({
        ...form,
        numQuestions: parseInt(form.numQuestions),
      });
      toast.success('Assessment created successfully');
      setForm({ title: '', topic: '', difficulty: 'medium', numQuestions: '5', questionType: 'mcq' });
    } catch { toast.error('Failed to create assessment'); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <PageHeader title="Create Assessment" subtitle="Generate AI-powered quizzes for your students" />
      <Card style={{ maxWidth: '560px' }}>
        <form onSubmit={handleSubmit}>
          <Field label="Assessment Title" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Chapter 3 Quiz" />
          </Field>
          <Field label="Topic / Source Material" required>
            <Textarea value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} required placeholder="Describe the topic or paste the content to base questions on..." />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Difficulty">
              <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </Field>
            <Field label="Number of Questions">
              <Input type="number" min="1" max="20" value={form.numQuestions} onChange={(e) => setForm({ ...form, numQuestions: e.target.value })} />
            </Field>
          </div>
          <Field label="Question Type">
            <Select value={form.questionType} onChange={(e) => setForm({ ...form, questionType: e.target.value })}>
              <option value="mcq">Multiple Choice</option>
              <option value="short_answer">Short Answer</option>
              <option value="true_false">True / False</option>
            </Select>
          </Field>
          <div style={{ marginTop: '20px' }}>
            <Button type="submit" loading={submitting}>Generate Assessment</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ============================================================
// Router
// ============================================================
export default function UserPortal() {
  const { user } = useAuth();
  if (!user || ['SUPER_ADMIN', 'INTERNAL_ADMIN', 'INTERNAL_STAFF', 'TENANT_ADMIN'].includes(user.role)) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'STUDENT') return <Navigate to="/student/dashboard" replace />;

  const navItems = NAV_ITEMS_FACULTY;
  const accentColor = user.role === 'FACULTY' ? 'var(--brand-600)' : 'var(--brand-500)';

  return (
    <SidebarLayout
      navItems={navItems}
      title="EduLMS"
      subtitle={user.role === 'FACULTY' ? 'Faculty Portal' : 'Student Portal'}
      accentColor={accentColor}
    >
      <Routes>
        <Route index element={<Navigate to="/portal/dashboard" replace />} />
        <Route path="dashboard" element={<RoleDashboard />} />
        <Route path="my-courses" element={<Courses />} />
        <Route path="courses" element={<Navigate to="/portal/my-courses" replace />} />
        <Route path="content" element={<ContentModule />} />
        <Route path="assignments" element={<Assessments />} />
        <Route path="quizzes" element={<Assessments />} />
        <Route path="chat" element={<Chat />} />
        <Route path="assessments" element={<Assessments />} />
        <Route path="progress" element={<Progress />} />
        {user.role === 'FACULTY' && (
          <>
            <Route path="gradebook" element={<StudentProgress />} />
            <Route path="student-progress" element={<Navigate to="/portal/gradebook" replace />} />
            <Route path="create-assessment" element={<CreateAssessment />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/portal/dashboard" />} />
      </Routes>
    </SidebarLayout>
  );
}
