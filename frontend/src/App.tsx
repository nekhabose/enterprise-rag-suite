import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const DEFAULT_BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT || '3000';
const API_URL = process.env.REACT_APP_API_URL || `http://localhost:${DEFAULT_BACKEND_PORT}`;

// Interfaces
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

interface Message {
  role: string;
  content: string;
}

function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  
  // Main view state
  const [activeTab, setActiveTab] = useState<'documents' | 'videos' | 'chat' | 'quiz' | 'settings'>('documents');
  
  // Documents state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Videos state
  const [videos, setVideos] = useState<Video[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoUploading, setVideoUploading] = useState(false);
  
  // Assessments state
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Metadata state
  const [subject, setSubject] = useState('');
  const [year, setYear] = useState('');
  
  // PHASE 1: Chunking Strategy Selection
  const [chunkingStrategy, setChunkingStrategy] = useState('semantic');
  const chunkingStrategies = [
    { value: 'fixed_size', label: 'Fixed Size (500 chars)' },
    { value: 'semantic', label: 'Semantic (AI-powered)' },
    { value: 'paragraph', label: 'Paragraph-based' },
    { value: 'page_based', label: 'Page-based (PDF)' },
    { value: 'parent_child', label: 'Parent-Child (Hierarchical)' },
    { value: 'sentence', label: 'Sentence-based' },
    { value: 'recursive', label: 'Recursive (Smart split)' },
  ];
  
  // PHASE 5: Embedding Model Selection
  const [embeddingModel, setEmbeddingModel] = useState('minilm');
  const embeddingModels = [
    { value: 'minilm', label: 'MiniLM (Fast, Free, 384d)' },
    { value: 'bge', label: 'BGE (Best Quality, Free, 768d)' },
    { value: 'mpnet', label: 'MPNet (High Quality, Free, 768d)' },
    { value: 'openai', label: 'OpenAI Ada-002 (1536d)' },
    { value: 'cohere', label: 'Cohere v3 (1024d)' },
    { value: 'fastembed', label: 'FastEmbed (Ultra Fast, 384d)' },
  ];
  
  // PHASE 6: Vector Store Selection
  const [vectorStore, setVectorStore] = useState('faiss');
  const vectorStores = [
    { value: 'faiss', label: 'FAISS (Ultra Fast, Local)' },
    { value: 'chromadb', label: 'ChromaDB (Easy, Persistent)' },
    { value: 'qdrant', label: 'Qdrant (Production Grade)' },
    { value: 'postgres', label: 'PostgreSQL (Current DB)' },
  ];
  
  // PHASE 7: LLM Provider Selection
  const [llmProvider, setLlmProvider] = useState('groq');
  const llmProviders = [
    { value: 'groq', label: 'Groq Llama 3 (Fastest, Free)' },
    { value: 'openai', label: 'OpenAI GPT-4.1-mini (Default)' },
    { value: 'gpt-4.1', label: 'OpenAI GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'OpenAI GPT-4.1-mini' },
    { value: 'gpt-5', label: 'OpenAI GPT-5' },
    { value: 'gpt-5-mini', label: 'OpenAI GPT-5-mini' },
    { value: 'gpt-5-nano', label: 'OpenAI GPT-5-nano' },
    { value: 'claude', label: 'Claude 3 Sonnet' },
    { value: 'claude-opus', label: 'Claude 3 Opus (Highest Quality)' },
    { value: 'gemini', label: 'Google Gemini Pro' },
    { value: 'cohere', label: 'Cohere Command' },
  ];

  const resolveLlmSelection = (selection: string): { provider: string; model?: string } => {
    if (selection.startsWith('gpt-') || selection.startsWith('o1') || selection.startsWith('o3') || selection.startsWith('o4')) {
      return { provider: 'openai', model: selection };
    }
    if (selection === 'openai') {
      return { provider: 'openai', model: 'gpt-4.1-mini' };
    }
    return { provider: selection };
  };
  
  // PHASE 2: PDF Processing Mode
  const [pdfMode, setPdfMode] = useState('standard');
  const pdfModes = [
    { value: 'standard', label: 'Standard (Fast)' },
    { value: 'academic', label: 'Academic (Tables, Citations)' },
    { value: 'advanced', label: 'Advanced (Images, TOC)' },
  ];
  
  // PHASE 3: Quiz Settings
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizQuestionCount, setQuizQuestionCount] = useState(5);
  const [quizQuestionTypes, setQuizQuestionTypes] = useState(['multiple_choice']);
  
  useEffect(() => {
    if (token) {
      fetchDocuments();
      fetchVideos();
      fetchAssessments();
    }
  }, [token]);
  
  // Auth functions
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
      alert(error.response?.data?.error || 'Authentication failed');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setDocuments([]);
    setVideos([]);
    setMessages([]);
  };

  // Fetch functions
  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`${API_URL}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
  };

  const fetchVideos = async () => {
    try {
      const response = await axios.get(`${API_URL}/videos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVideos(response.data);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    }
  };

  const fetchAssessments = async () => {
    try {
      const response = await axios.get(`${API_URL}/assessments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAssessments(response.data);
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
    }
  };

  // Upload document
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
      alert('Document uploaded successfully!');
      setSelectedFile(null);
      setSubject('');
      setYear('');
      fetchDocuments();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Upload YouTube video
  const handleVideoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl || !token) return;

    setVideoUploading(true);
    const llmConfig = resolveLlmSelection(llmProvider);
    try {
      await axios.post(`${API_URL}/videos/upload`, {
        youtube_url: youtubeUrl,
        title: 'YouTube Video',
        subject: subject,
        year: year ? parseInt(year) : null,
        provider: llmConfig.provider,
        model: llmConfig.model,
        chunking_strategy: 'time_based',
        embedding_model: embeddingModel
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Video uploaded and transcribed successfully!');
      setYoutubeUrl('');
      setSubject('');
      setYear('');
      fetchVideos();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Video upload failed');
    } finally {
      setVideoUploading(false);
    }
  };

  // Generate quiz
  const handleGenerateQuiz = async () => {
    if (!token || documents.length === 0) return;

    setGeneratingQuiz(true);
    const llmConfig = resolveLlmSelection(llmProvider);
    try {
      const response = await axios.post(`${API_URL}/assessments/create`, {
        title: `Quiz - ${new Date().toLocaleDateString()}`,
        document_ids: documents.slice(0, 3).map(d => d.id),
        question_count: quizQuestionCount,
        difficulty: quizDifficulty,
        question_types: quizQuestionTypes,
        provider: llmConfig.provider,
        model: llmConfig.model
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Quiz created with ${response.data.question_count} questions!`);
      fetchAssessments();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Quiz generation failed');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // Chat
  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question || !token) return;

    const userMessage: Message = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    setQuestion('');
    setLoading(true);
    const llmConfig = resolveLlmSelection(llmProvider);

    try {
      const response = await axios.post(`${API_URL}/chat/answer`, {
        question: question,
        document_ids: documents.map(d => d.id),
        provider: llmConfig.provider,
        model: llmConfig.model
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const assistantMessage: Message = { 
        role: 'assistant', 
        content: response.data.answer 
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Chat failed');
    } finally {
      setLoading(false);
    }
  };

  // Login/Signup UI
  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>🎓 AI Learning Platform</h1>
          <p className="subtitle">Enterprise RAG System - All 7 Phases</p>
          
          <form onSubmit={handleAuth} className="auth-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="primary-button">
              {isSignup ? 'Sign Up' : 'Login'}
            </button>
          </form>
          
          <button 
            onClick={() => setIsSignup(!isSignup)}
            className="link-button"
          >
            {isSignup ? 'Already have an account? Login' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>🎓 AI Learning Platform</h1>
          <div className="header-actions">
            <span className="user-email">{email || 'User'}</span>
            <button onClick={handleLogout} className="logout-button">Logout</button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button 
          className={activeTab === 'documents' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('documents')}
        >
          📄 Documents
        </button>
        <button 
          className={activeTab === 'videos' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('videos')}
        >
          🎥 Videos
        </button>
        <button 
          className={activeTab === 'chat' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('chat')}
        >
          💬 Chat
        </button>
        <button 
          className={activeTab === 'quiz' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('quiz')}
        >
          📝 Quizzes
        </button>
        <button 
          className={activeTab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Configuration
        </button>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        
        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="content-section">
            <h2>📄 Document Management</h2>
            
            <div className="upload-section">
              <h3>Upload New Document</h3>
              <form onSubmit={handleDocumentUpload} className="upload-form">
                <div className="form-group">
                  <label>Select PDF File</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="file-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Subject (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., Mathematics"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Year (Optional)</label>
                    <input
                      type="number"
                      placeholder="e.g., 2024"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>📑 Chunking Strategy</label>
                    <select 
                      value={chunkingStrategy} 
                      onChange={(e) => setChunkingStrategy(e.target.value)}
                      className="select-input"
                    >
                      {chunkingStrategies.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>🔢 Embedding Model</label>
                    <select 
                      value={embeddingModel} 
                      onChange={(e) => setEmbeddingModel(e.target.value)}
                      className="select-input"
                    >
                      {embeddingModels.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>📊 PDF Processing Mode</label>
                    <select 
                      value={pdfMode} 
                      onChange={(e) => setPdfMode(e.target.value)}
                      className="select-input"
                    >
                      {pdfModes.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>🤖 LLM Provider</label>
                    <select 
                      value={llmProvider} 
                      onChange={(e) => setLlmProvider(e.target.value)}
                      className="select-input"
                    >
                      {llmProviders.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={!selectedFile || uploading}
                  className="primary-button"
                >
                  {uploading ? 'Uploading...' : 'Upload & Process Document'}
                </button>
              </form>
            </div>

            <div className="documents-list">
              <h3>Your Documents ({documents.length})</h3>
              {documents.length === 0 ? (
                <p className="empty-state">No documents yet. Upload one above!</p>
              ) : (
                <div className="items-grid">
                  {documents.map(doc => (
                    <div key={doc.id} className="item-card">
                      <div className="item-icon">📄</div>
                      <div className="item-details">
                        <h4>{doc.filename}</h4>
                        {doc.subject && <span className="badge">{doc.subject}</span>}
                        {doc.year && <span className="badge">{doc.year}</span>}
                        <p className="item-date">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Videos Tab */}
        {activeTab === 'videos' && (
          <div className="content-section">
            <h2>🎥 YouTube Videos</h2>
            
            <div className="upload-section">
              <h3>Add YouTube Video</h3>
              <form onSubmit={handleVideoUpload} className="upload-form">
                <div className="form-group">
                  <label>YouTube URL</label>
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Subject (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., Physics"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Year (Optional)</label>
                    <input
                      type="number"
                      placeholder="e.g., 2024"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={!youtubeUrl || videoUploading}
                  className="primary-button"
                >
                  {videoUploading ? 'Processing... (This may take a few minutes)' : 'Transcribe & Add Video'}
                </button>
              </form>
            </div>

            <div className="documents-list">
              <h3>Your Videos ({videos.length})</h3>
              {videos.length === 0 ? (
                <p className="empty-state">No videos yet. Add one above!</p>
              ) : (
                <div className="items-grid">
                  {videos.map(video => (
                    <div key={video.id} className="item-card">
                      <div className="item-icon">🎥</div>
                      <div className="item-details">
                        <h4>{video.title}</h4>
                        {video.subject && <span className="badge">{video.subject}</span>}
                        {video.duration && (
                          <span className="badge">{Math.floor(video.duration / 60)}min</span>
                        )}
                        <p className="item-date">
                          {new Date(video.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="content-section">
            <h2>💬 Chat with Your Content</h2>
            <div className="form-group" style={{ maxWidth: '420px', marginBottom: '1rem' }}>
              <label>Chat Model</label>
              <select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value)}
                className="select-input"
              >
                {llmProviders.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="chat-container">
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="empty-state">
                    <p>Start chatting with your documents and videos!</p>
                    <p className="help-text">
                      Using: {llmProviders.find(p => p.value === llmProvider)?.label}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                      <div className="message-content">{msg.content}</div>
                    </div>
                  ))
                )}
                {loading && <div className="message assistant loading">Thinking...</div>}
              </div>

              <form onSubmit={handleChat} className="chat-input-form">
                <input
                  type="text"
                  placeholder="Ask a question about your content..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={loading || documents.length === 0}
                  className="chat-input"
                />
                <button 
                  type="submit" 
                  disabled={!question || loading || documents.length === 0}
                  className="primary-button"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Quiz Tab */}
        {activeTab === 'quiz' && (
          <div className="content-section">
            <h2>📝 AI-Generated Quizzes</h2>
            
            <div className="upload-section">
              <h3>Generate New Quiz</h3>
              <div className="quiz-config">
                <div className="form-row">
                  <div className="form-group">
                    <label>Difficulty Level</label>
                    <select 
                      value={quizDifficulty}
                      onChange={(e) => setQuizDifficulty(e.target.value)}
                      className="select-input"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Number of Questions</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={quizQuestionCount}
                      onChange={(e) => setQuizQuestionCount(parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Question Types</label>
                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={quizQuestionTypes.includes('multiple_choice')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setQuizQuestionTypes([...quizQuestionTypes, 'multiple_choice']);
                          } else {
                            setQuizQuestionTypes(quizQuestionTypes.filter(t => t !== 'multiple_choice'));
                          }
                        }}
                      />
                      Multiple Choice
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={quizQuestionTypes.includes('true_false')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setQuizQuestionTypes([...quizQuestionTypes, 'true_false']);
                          } else {
                            setQuizQuestionTypes(quizQuestionTypes.filter(t => t !== 'true_false'));
                          }
                        }}
                      />
                      True/False
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={quizQuestionTypes.includes('short_answer')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setQuizQuestionTypes([...quizQuestionTypes, 'short_answer']);
                          } else {
                            setQuizQuestionTypes(quizQuestionTypes.filter(t => t !== 'short_answer'));
                          }
                        }}
                      />
                      Short Answer
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleGenerateQuiz}
                  disabled={generatingQuiz || documents.length === 0}
                  className="primary-button"
                >
                  {generatingQuiz ? 'Generating Quiz...' : 'Generate Quiz from Documents'}
                </button>
              </div>
            </div>

            <div className="documents-list">
              <h3>Your Quizzes ({assessments.length})</h3>
              {assessments.length === 0 ? (
                <p className="empty-state">No quizzes yet. Generate one above!</p>
              ) : (
                <div className="items-grid">
                  {assessments.map(quiz => (
                    <div key={quiz.id} className="item-card">
                      <div className="item-icon">📝</div>
                      <div className="item-details">
                        <h4>{quiz.title}</h4>
                        <span className="badge">{quiz.difficulty}</span>
                        <p className="item-date">
                          {new Date(quiz.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="content-section">
            <h2>⚙️ Platform Configuration</h2>
            
            <div className="settings-grid">
              <div className="settings-card">
                <h3>📑 Chunking Strategy</h3>
                <select 
                  value={chunkingStrategy} 
                  onChange={(e) => setChunkingStrategy(e.target.value)}
                  className="select-input"
                >
                  {chunkingStrategies.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <p className="help-text">How text is split for processing</p>
              </div>

              <div className="settings-card">
                <h3>🔢 Embedding Model</h3>
                <select 
                  value={embeddingModel} 
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  className="select-input"
                >
                  {embeddingModels.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="help-text">How text is converted to vectors</p>
              </div>

              <div className="settings-card">
                <h3>🗄️ Vector Store</h3>
                <select 
                  value={vectorStore} 
                  onChange={(e) => setVectorStore(e.target.value)}
                  className="select-input"
                >
                  {vectorStores.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <p className="help-text">Where vectors are stored</p>
              </div>

              <div className="settings-card">
                <h3>🤖 LLM Provider</h3>
                <select 
                  value={llmProvider} 
                  onChange={(e) => setLlmProvider(e.target.value)}
                  className="select-input"
                >
                  {llmProviders.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <p className="help-text">AI model for chat and quiz generation</p>
              </div>

              <div className="settings-card">
                <h3>📊 PDF Processing</h3>
                <select 
                  value={pdfMode} 
                  onChange={(e) => setPdfMode(e.target.value)}
                  className="select-input"
                >
                  {pdfModes.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="help-text">PDF extraction mode</p>
              </div>

              <div className="settings-card">
                <h3>📈 Current Configuration</h3>
                <div className="config-summary">
                  <p><strong>Chunking:</strong> {chunkingStrategies.find(s => s.value === chunkingStrategy)?.label}</p>
                  <p><strong>Embeddings:</strong> {embeddingModels.find(m => m.value === embeddingModel)?.label}</p>
                  <p><strong>Vector Store:</strong> {vectorStores.find(s => s.value === vectorStore)?.label}</p>
                  <p><strong>LLM:</strong> {llmProviders.find(p => p.value === llmProvider)?.label}</p>
                  <p><strong>PDF Mode:</strong> {pdfModes.find(m => m.value === pdfMode)?.label}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
