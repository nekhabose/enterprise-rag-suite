import React, { useMemo, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const DEFAULT_BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT || '3000';
const API_URL = process.env.REACT_APP_API_URL || `http://localhost:${DEFAULT_BACKEND_PORT}`;

interface Document {
  id: number;
  filename: string;
  subject?: string;
  year?: number;
  uploaded_at: string;
}

interface Video {
  id: number;
  title: string;
  youtube_url: string;
  subject?: string;
  year?: number;
  duration?: number;
  uploaded_at: string;
}

interface Assessment {
  id: number;
  title: string;
  difficulty: string;
  created_at: string;
}

interface MessageSource {
  document_id?: number;
  filename?: string;
}

interface Message {
  role: string;
  content: string;
  sources?: MessageSource[];
}

type TabKey = 'overview' | 'knowledge' | 'ingestion' | 'playground' | 'settings';
type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspace, setWorkspace] = useState('Enterprise Workspace');
  const [globalSearch, setGlobalSearch] = useState('');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  const [videos, setVideos] = useState<Video[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoUploading, setVideoUploading] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [loadingAssessments, setLoadingAssessments] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  const [subject, setSubject] = useState('');
  const [year, setYear] = useState('');

  const [chunkingStrategy, setChunkingStrategy] = useState('semantic');
  const chunkingStrategies = [
    { value: 'fixed_size', label: 'Fixed Size (500 chars)' },
    { value: 'semantic', label: 'Semantic (AI-powered)' },
    { value: 'paragraph', label: 'Paragraph-based' },
    { value: 'page_based', label: 'Page-based (PDF)' },
    { value: 'parent_child', label: 'Parent-Child (Hierarchical)' },
    { value: 'sentence', label: 'Sentence-based' },
    { value: 'recursive', label: 'Recursive (Smart split)' }
  ];

  const [embeddingModel, setEmbeddingModel] = useState('minilm');
  const embeddingModels = [
    { value: 'minilm', label: 'MiniLM (Fast, Free, 384d)' },
    { value: 'bge', label: 'BGE (Best Quality, Free, 768d)' },
    { value: 'mpnet', label: 'MPNet (High Quality, Free, 768d)' },
    { value: 'openai', label: 'OpenAI text-embedding-3-small' },
    { value: 'cohere', label: 'Cohere Embed v3' },
    { value: 'fastembed', label: 'FastEmbed (Ultra Fast)' }
  ];

  const [vectorStore, setVectorStore] = useState('postgres');
  const vectorStores = [
    { value: 'postgres', label: 'PostgreSQL + pgvector' },
    { value: 'faiss', label: 'FAISS' },
    { value: 'chromadb', label: 'ChromaDB' },
    { value: 'qdrant', label: 'Qdrant' }
  ];

  const [llmProvider, setLlmProvider] = useState('openai');
  const [chatModel, setChatModel] = useState('openai');
  const llmProviders = [
    { value: 'openai', label: 'OpenAI GPT-4.1-mini (Default)' },
    { value: 'gpt-4.1', label: 'OpenAI GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'OpenAI GPT-4.1-mini' },
    { value: 'gpt-5', label: 'OpenAI GPT-5' },
    { value: 'gpt-5-mini', label: 'OpenAI GPT-5-mini' },
    { value: 'gpt-5-nano', label: 'OpenAI GPT-5-nano' },
    { value: 'groq', label: 'Groq Llama 3.3 70B' },
    { value: 'claude', label: 'Claude Sonnet' },
    { value: 'claude-opus', label: 'Claude Opus' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'cohere', label: 'Cohere Command' }
  ];

  const [pdfMode, setPdfMode] = useState('standard');
  const pdfModes = [
    { value: 'standard', label: 'Standard' },
    { value: 'academic', label: 'Academic' },
    { value: 'advanced', label: 'Advanced' }
  ];

  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizQuestionCount, setQuizQuestionCount] = useState(5);
  const [quizQuestionTypes] = useState(['multiple_choice']);
  const [rerankEnabled, setRerankEnabled] = useState(true);

  const resolveLlmSelection = (selection: string): { provider: string; model?: string } => {
    if (
      selection.startsWith('gpt-') ||
      selection.startsWith('o1') ||
      selection.startsWith('o3') ||
      selection.startsWith('o4')
    ) {
      return { provider: 'openai', model: selection };
    }
    if (selection === 'openai') {
      return { provider: 'openai', model: 'gpt-4.1-mini' };
    }
    return { provider: selection };
  };

  const formatDate = (input: string) => new Date(input).toLocaleDateString();

  const pushToast = (tone: ToastTone, title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, tone, title, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const endpoint = isSignup ? '/auth/signup' : '/auth/login';
      const response = await axios.post(`${API_URL}${endpoint}`, { email, password });
      const { token: newToken } = response.data;
      setToken(newToken);
      localStorage.setItem('token', newToken);
      setEmail('');
      setPassword('');
    } catch (error: any) {
      pushToast('error', 'Authentication Failed', error.response?.data?.error || 'Unable to authenticate.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setDocuments([]);
    setVideos([]);
    setMessages([]);
  };

  const fetchDocuments = useCallback(async () => {
    setLoadingDocuments(true);
    try {
      const response = await axios.get(`${API_URL}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      pushToast('error', 'Document Fetch Failed', 'Unable to fetch documents.');
    } finally {
      setLoadingDocuments(false);
    }
  }, [token]);

  const fetchVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      const response = await axios.get(`${API_URL}/videos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVideos(response.data);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
      pushToast('error', 'Video Fetch Failed', 'Unable to fetch videos.');
    } finally {
      setLoadingVideos(false);
    }
  }, [token]);

  const fetchAssessments = useCallback(async () => {
    setLoadingAssessments(true);
    try {
      const response = await axios.get(`${API_URL}/assessments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAssessments(response.data);
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      pushToast('error', 'Assessment Fetch Failed', 'Unable to fetch assessments.');
    } finally {
      setLoadingAssessments(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDocuments();
      fetchVideos();
      fetchAssessments();
    }
  }, [token, fetchDocuments, fetchVideos, fetchAssessments]);

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !token) return;

    setUploading(true);
    const llmConfig = resolveLlmSelection(llmProvider);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('provider', llmConfig.provider);
    if (llmConfig.model) formData.append('model', llmConfig.model);
    formData.append('embedding_model', embeddingModel);
    formData.append('chunking_strategy', chunkingStrategy);
    formData.append('pdf_mode', pdfMode);
    if (subject) formData.append('subject', subject);
    if (year) formData.append('year', year);

    try {
      await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setSelectedFile(null);
      setSubject('');
      setYear('');
      fetchDocuments();
      pushToast('success', 'Ingestion Started', 'Document uploaded and indexing pipeline started.');
    } catch (error: any) {
      pushToast('error', 'Upload Failed', error.response?.data?.error || 'Document upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleVideoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl || !token) return;

    setVideoUploading(true);
    const llmConfig = resolveLlmSelection(llmProvider);

    try {
      await axios.post(
        `${API_URL}/videos/upload`,
        {
          youtube_url: youtubeUrl,
          title: 'YouTube Video',
          subject,
          year: year ? parseInt(year, 10) : null,
          provider: llmConfig.provider,
          model: llmConfig.model,
          chunking_strategy: 'time_based',
          embedding_model: embeddingModel
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setYoutubeUrl('');
      setSubject('');
      setYear('');
      fetchVideos();
      pushToast('success', 'Connector Running', 'Video ingestion pipeline started.');
    } catch (error: any) {
      pushToast('error', 'Video Upload Failed', error.response?.data?.error || 'Video upload failed.');
    } finally {
      setVideoUploading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!token || documents.length === 0) return;

    setGeneratingQuiz(true);
    const llmConfig = resolveLlmSelection(llmProvider);

    try {
      await axios.post(
        `${API_URL}/assessments/create`,
        {
          title: `Quiz - ${new Date().toLocaleDateString()}`,
          document_ids: documents.slice(0, 3).map((d) => d.id),
          question_count: quizQuestionCount,
          difficulty: quizDifficulty,
          question_types: quizQuestionTypes,
          provider: llmConfig.provider,
          model: llmConfig.model
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchAssessments();
      pushToast('success', 'Quiz Generated', 'Assessment was generated successfully.');
    } catch (error: any) {
      pushToast('error', 'Quiz Generation Failed', error.response?.data?.error || 'Unable to generate quiz.');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question || !token) return;

    const userMessage: Message = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setLoading(true);

    const llmConfig = resolveLlmSelection(chatModel);

    try {
      const response = await axios.post(
        `${API_URL}/chat/answer`,
        {
          question,
          document_ids: documents.map((d) => d.id),
          provider: llmConfig.provider,
          model: llmConfig.model
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.answer,
        sources: response.data.sources || []
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      pushToast('error', 'Chat Failed', error.response?.data?.error || 'Unable to answer this query.');
    } finally {
      setLoading(false);
    }
  };

  const recentActivity = useMemo(() => {
    const docItems = documents.slice(0, 4).map((d) => ({
      id: `doc-${d.id}`,
      title: `Document indexed: ${d.filename}`,
      timestamp: d.uploaded_at,
      type: 'Document'
    }));
    const videoItems = videos.slice(0, 4).map((v) => ({
      id: `vid-${v.id}`,
      title: `Video ingested: ${v.title}`,
      timestamp: v.uploaded_at,
      type: 'Video'
    }));
    return [...docItems, ...videoItems]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6);
  }, [documents, videos]);

  const knowledgeRows = useMemo(() => {
    const documentRows = documents.map((d) => ({
      key: `d-${d.id}`,
      name: d.filename,
      owner: 'Platform Team',
      tags: [d.subject || 'General', d.year ? String(d.year) : 'Current'],
      updated: d.uploaded_at,
      status: 'Ready'
    }));
    const videoRows = videos.map((v) => ({
      key: `v-${v.id}`,
      name: v.title,
      owner: 'Learning Ops',
      tags: [v.subject || 'Video', v.year ? String(v.year) : 'Current'],
      updated: v.uploaded_at,
      status: 'Indexed'
    }));
    return [...documentRows, ...videoRows].sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
    );
  }, [documents, videos]);

  const kpis = useMemo(() => {
    const totalDocs = documents.length + videos.length;
    const chunks = totalDocs * 4;
    return [
      { label: 'Ingested Docs', value: totalDocs.toString(), delta: '+8.2%' },
      { label: 'Indexed Chunks', value: chunks.toString(), delta: '+12.5%' },
      { label: 'Retrieval Latency', value: '142 ms', delta: '-9.1%' },
      { label: 'Accuracy Signals', value: '93.8%', delta: '+1.3%' },
      { label: 'Cost Estimate', value: `$${(chunks * 0.006).toFixed(2)}`, delta: '+0.7%' }
    ];
  }, [documents.length, videos.length]);

  const latestSources = useMemo(() => {
    const assistant = [...messages].reverse().find((m) => m.role === 'assistant');
    return assistant?.sources || [];
  }, [messages]);
  const isDashboardLoading = loadingDocuments || loadingVideos || loadingAssessments;

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="auth-brand">Enterprise RAG Suite</div>
          <h1>Secure knowledge operations for enterprise teams</h1>
          <p>Used by platform, security, and compliance teams to ingest and retrieve trusted knowledge.</p>
          <form onSubmit={handleAuth} className="auth-form">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit" className="btn btn-primary">{isSignup ? 'Create Account' : 'Sign In'}</button>
          </form>
          <button className="btn btn-tertiary" onClick={() => setIsSignup(!isSignup)}>
            {isSignup ? 'Use existing account' : 'Create new account'}
          </button>
        </div>
        <div className="auth-visual" />
        <div className="toast-stack">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.tone}`}>
              <div>
                <strong>{toast.title}</strong>
                <p>{toast.message}</p>
              </div>
              <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}>x</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const navItems: { key: TabKey; label: string; icon: string }[] = [
    { key: 'overview', label: 'Dashboard Overview', icon: 'OV' },
    { key: 'knowledge', label: 'Knowledge Bases', icon: 'KB' },
    { key: 'ingestion', label: 'Ingestion', icon: 'IN' },
    { key: 'playground', label: 'Retrieval Playground', icon: 'RP' },
    { key: 'settings', label: 'Settings', icon: 'ST' }
  ];

  return (
    <div className="enterprise-layout">
      <aside className={sidebarCollapsed ? 'sidebar collapsed' : 'sidebar'}>
        <div className="sidebar-top">
          <div className="logo-mark">ER</div>
          {!sidebarCollapsed && <div className="logo-text">Enterprise RAG</div>}
          <button className="icon-btn" onClick={() => setSidebarCollapsed((v) => !v)}>||</button>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={activeTab === item.key ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveTab(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <div className="content-area">
        <header className="topbar">
          <div className="topbar-left">
            <select value={workspace} onChange={(e) => setWorkspace(e.target.value)} className="input-control workspace-select">
              <option>Enterprise Workspace</option>
              <option>Security Operations</option>
              <option>Compliance Program</option>
            </select>
            <input
              className="input-control search"
              placeholder="Search knowledge bases, documents, logs"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
          <div className="topbar-right">
            <button className="icon-btn">N</button>
            <button className="icon-btn">A</button>
            <button className="profile-chip" onClick={handleLogout}>Sign out</button>
          </div>
        </header>

        <main className="main-view">
          {activeTab === 'overview' && (
            <section className="screen">
              <div className="hero-card">
                <div>
                  <h2>Operational confidence for enterprise retrieval</h2>
                  <p>Monitor ingestion throughput, retrieval quality, and provider cost in one control plane.</p>
                </div>
                <div className="hero-graphic" />
              </div>

              <div className="kpi-grid">
                {isDashboardLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <article key={`kpi-skeleton-${index}`} className="kpi-card">
                        <span className="skeleton skeleton-line short" />
                        <span className="skeleton skeleton-line medium" />
                        <span className="skeleton skeleton-line short" />
                      </article>
                    ))
                  : kpis.map((kpi) => (
                      <article key={kpi.label} className="kpi-card">
                        <span className="kpi-label">{kpi.label}</span>
                        <strong className="kpi-value">{kpi.value}</strong>
                        <span className="kpi-delta">{kpi.delta}</span>
                      </article>
                    ))}
              </div>

              <div className="overview-grid">
                <section className="panel timeline">
                  <div className="panel-head">
                    <h3>Recent Activity Timeline</h3>
                    <button className="btn btn-tertiary">View all</button>
                  </div>
                  {isDashboardLoading ? (
                    <div className="skeleton-group">
                      <span className="skeleton skeleton-line long" />
                      <span className="skeleton skeleton-line medium" />
                      <span className="skeleton skeleton-line long" />
                    </div>
                  ) : recentActivity.length === 0 ? (
                    <div className="empty-block">No recent activity yet. Start with ingestion.</div>
                  ) : (
                    <ul className="timeline-list">
                      {recentActivity.map((item) => (
                        <li key={item.id}>
                          <span className="dot" />
                          <div>
                            <p>{item.title}</p>
                            <small>{item.type} - {formatDate(item.timestamp)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="panel health">
                  <h3>System Health</h3>
                  <div className="health-item"><span>Indexing Pipeline</span><em className="chip success">Healthy</em></div>
                  <div className="health-item"><span>Vector Store</span><em className="chip success">Healthy</em></div>
                  <div className="health-item"><span>Provider Gateway</span><em className="chip warn">Degraded</em></div>
                  <div className="health-item"><span>Audit Stream</span><em className="chip success">Healthy</em></div>
                </section>
              </div>
            </section>
          )}

          {activeTab === 'knowledge' && (
            <section className="screen">
              <div className="section-header">
                <h2>Knowledge Bases</h2>
                <button className="btn btn-primary">Create KB</button>
              </div>

              <div className="toolbar-row">
                <input className="input-control" placeholder="Filter by name, owner, tag" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} />
                <button className="btn btn-secondary">Status: All</button>
                <button className="btn btn-secondary">Owner: All</button>
                <button className="btn btn-secondary" onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}>
                  Density: {density}
                </button>
              </div>

              <div className="table-card">
                <table className={density === 'compact' ? 'data-table compact' : 'data-table'}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Owner</th>
                      <th>Tags</th>
                      <th>Last Updated</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isDashboardLoading
                      ? Array.from({ length: 4 }).map((_, index) => (
                          <tr key={`row-skeleton-${index}`}>
                            <td><span className="skeleton skeleton-line medium" /></td>
                            <td><span className="skeleton skeleton-line short" /></td>
                            <td><span className="skeleton skeleton-line long" /></td>
                            <td><span className="skeleton skeleton-line short" /></td>
                            <td><span className="skeleton skeleton-line short" /></td>
                            <td><span className="skeleton skeleton-line short" /></td>
                          </tr>
                        ))
                      : knowledgeRows.map((row) => (
                          <tr key={row.key}>
                            <td>{row.name}</td>
                            <td>{row.owner}</td>
                            <td>
                              <div className="tag-row">
                                {row.tags.map((tag) => <span key={`${row.key}-${tag}`} className="tag">{tag}</span>)}
                              </div>
                            </td>
                            <td>{formatDate(row.updated)}</td>
                            <td><span className="chip success">{row.status}</span></td>
                            <td><button className="btn btn-tertiary">...</button></td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>

              <div className="panel stepper-panel">
                <h3>Create KB Flow</h3>
                <ol className="stepper">
                  <li className="done">1. Basic Details</li>
                  <li className="active">2. Source Selection</li>
                  <li>3. Permissions</li>
                  <li>4. Review + Launch</li>
                </ol>
              </div>
            </section>
          )}

          {activeTab === 'ingestion' && (
            <section className="screen">
              <div className="section-header">
                <h2>Ingestion</h2>
              </div>

              <div className="ingestion-grid">
                <section className="panel">
                  <h3>Upload Panel</h3>
                  <form onSubmit={handleDocumentUpload} className="stack-form">
                    <div className="dropzone">
                      <input type="file" accept=".pdf" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                      <p>{selectedFile ? selectedFile.name : 'Drag-and-drop PDF or select a file'}</p>
                    </div>
                    <div className="two-col">
                      <div>
                        <label>Chunking Strategy</label>
                        <select className="input-control" value={chunkingStrategy} onChange={(e) => setChunkingStrategy(e.target.value)}>
                          {chunkingStrategies.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Embedding Model</label>
                        <select className="input-control" value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)}>
                          {embeddingModels.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="two-col">
                      <div>
                        <label>LLM Provider</label>
                        <select className="input-control" value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)}>
                          {llmProviders.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>PDF Mode</label>
                        <select className="input-control" value={pdfMode} onChange={(e) => setPdfMode(e.target.value)}>
                          {pdfModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={!selectedFile || uploading}>
                      {uploading ? 'Uploading...' : 'Start Ingestion'}
                    </button>
                  </form>
                </section>

                <section className="panel">
                  <h3>Source Connectors</h3>
                  <div className="connector-grid">
                    <button className="connector active">PDF</button>
                    <button className="connector">YouTube</button>
                    <button className="connector">Web</button>
                    <button className="connector">LMS</button>
                  </div>
                  <form onSubmit={handleVideoUpload} className="stack-form">
                    <label>YouTube URL</label>
                    <input className="input-control" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                    <button className="btn btn-secondary" type="submit" disabled={!youtubeUrl || videoUploading}>
                      {videoUploading ? 'Processing...' : 'Ingest from YouTube'}
                    </button>
                  </form>
                </section>
              </div>

              <section className="panel">
                <h3>Ingestion Progress</h3>
                <div className="progress-row">
                  <span>PDF upload pipeline</span>
                  <div className="progress-track"><div className="progress-fill" style={{ width: uploading ? '66%' : '100%' }} /></div>
                  <span>{uploading ? 'Running' : 'Completed'}</span>
                </div>
                <div className="progress-row">
                  <span>Connector pipeline</span>
                  <div className="progress-track"><div className="progress-fill" style={{ width: videoUploading ? '45%' : '100%' }} /></div>
                  <span>{videoUploading ? 'Running' : 'Completed'}</span>
                </div>
                <div className="error-box">Error handling: failed connector runs can be retried from activity logs.</div>
              </section>
            </section>
          )}

          {activeTab === 'playground' && (
            <section className="screen">
              <div className="section-header">
                <h2>Retrieval Playground</h2>
              </div>

              <div className="playground-grid">
                <section className="panel chat-panel">
                  <div className="panel-head">
                    <h3>Chat</h3>
                    <select className="input-control model-select" value={chatModel} onChange={(e) => setChatModel(e.target.value)}>
                      {llmProviders.map((provider) => (
                        <option key={provider.value} value={provider.value}>{provider.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="chat-window">
                    {messages.length === 0 && <div className="empty-block">Start a retrieval query to see grounded responses.</div>}
                    {messages.map((msg, idx) => (
                      <div key={`${msg.role}-${idx}`} className={msg.role === 'user' ? 'msg user' : 'msg assistant'}>
                        {msg.content}
                      </div>
                    ))}
                    {loading && (
                      <div className="msg assistant skeleton-message">
                        <span className="skeleton skeleton-line long" />
                        <span className="skeleton skeleton-line medium" />
                      </div>
                    )}
                  </div>
                  <form onSubmit={handleChat} className="chat-input-row">
                    <input
                      className="input-control"
                      placeholder="Ask about indexed knowledge"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      disabled={loading || documents.length === 0}
                    />
                    <button className="btn btn-primary" type="submit" disabled={loading || !question}>Send</button>
                  </form>
                </section>

                <section className="panel citations-panel">
                  <h3>Citations</h3>
                  {loading ? (
                    <div className="skeleton-group">
                      <span className="skeleton skeleton-line long" />
                      <span className="skeleton skeleton-line medium" />
                    </div>
                  ) : latestSources.length === 0 ? (
                    <div className="empty-block">Citations will appear after a successful response.</div>
                  ) : (
                    <ul className="citation-list">
                      {latestSources.map((source, index) => (
                        <li key={`source-${index}`}>
                          <strong>{source.filename || `Document ${source.document_id || '-'}`}</strong>
                          <span>Source {index + 1}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="drawer-block">
                    <h4>Retrieval Settings</h4>
                    <label>Chunking Strategy</label>
                    <select className="input-control" value={chunkingStrategy} onChange={(e) => setChunkingStrategy(e.target.value)}>
                      {chunkingStrategies.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <label>Vector Store</label>
                    <select className="input-control" value={vectorStore} onChange={(e) => setVectorStore(e.target.value)}>
                      {vectorStores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <label className="toggle-row">
                      <input type="checkbox" checked={rerankEnabled} onChange={(e) => setRerankEnabled(e.target.checked)} />
                      <span>Rerank enabled</span>
                    </label>
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeTab === 'settings' && (
            <section className="screen">
              <div className="section-header">
                <h2>Settings</h2>
                <button className="btn btn-secondary">Export Audit Logs</button>
              </div>

              <div className="settings-layout">
                <section className="panel">
                  <h3>Providers</h3>
                  <div className="provider-grid">
                    <article className="provider-card"><h4>OpenAI</h4><span className="chip success">Connected</span></article>
                    <article className="provider-card"><h4>Claude</h4><span className="chip neutral">Optional</span></article>
                    <article className="provider-card"><h4>Gemini</h4><span className="chip neutral">Optional</span></article>
                    <article className="provider-card"><h4>Groq</h4><span className="chip success">Connected</span></article>
                  </div>
                </section>

                <section className="panel">
                  <h3>RBAC + Tenant Separation</h3>
                  <table className="data-table compact">
                    <thead><tr><th>Role</th><th>Ingest</th><th>Retrieve</th><th>Admin</th></tr></thead>
                    <tbody>
                      <tr><td>Platform Admin</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
                      <tr><td>Security Analyst</td><td>Yes</td><td>Yes</td><td>No</td></tr>
                      <tr><td>Compliance Reviewer</td><td>No</td><td>Yes</td><td>No</td></tr>
                    </tbody>
                  </table>
                </section>

                <section className="panel">
                  <h3>Audit Logs</h3>
                  <table className="data-table compact">
                    <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Status</th></tr></thead>
                    <tbody>
                      <tr><td>{new Date().toLocaleString()}</td><td>system</td><td>Document indexed</td><td><span className="chip success">Success</span></td></tr>
                      <tr><td>{new Date(Date.now() - 3600000).toLocaleString()}</td><td>platform-admin</td><td>Provider rotated</td><td><span className="chip warn">Review</span></td></tr>
                    </tbody>
                  </table>
                </section>

                <section className="panel">
                  <h3>Assessment Control</h3>
                  <div className="stack-form">
                    <label>Difficulty</label>
                    <select className="input-control" value={quizDifficulty} onChange={(e) => setQuizDifficulty(e.target.value)}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                    <label>Question Count</label>
                    <input className="input-control" type="number" min="1" max="20" value={quizQuestionCount} onChange={(e) => setQuizQuestionCount(parseInt(e.target.value, 10))} />
                    <button className="btn btn-primary" disabled={generatingQuiz || documents.length === 0} onClick={handleGenerateQuiz}>
                      {generatingQuiz ? 'Generating...' : `Generate Assessment (${assessments.length})`}
                    </button>
                  </div>
                </section>
              </div>
            </section>
          )}
        </main>
      </div>
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
            <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}>x</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
