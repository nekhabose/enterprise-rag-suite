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

interface Conversation {
  id: number;
  title: string;
  created_at: string;
}

type TabKey = 'overview' | 'knowledge' | 'ingestion' | 'playground' | 'settings';
type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
}

interface ConnectorStatus {
  name: string;
  configured: boolean;
  missing_env: string[];
}

function App() {
  const loadSetting = (key: string, fallback: string) => localStorage.getItem(key) || fallback;
  const loadJsonArraySetting = (key: string, fallback: string[]): string[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspace, setWorkspace] = useState(loadSetting('workspace', 'Enterprise Workspace'));
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const [subject, setSubject] = useState('');
  const [year, setYear] = useState('');

  const [chunkingStrategy, setChunkingStrategy] = useState(loadSetting('chunkingStrategy', 'semantic'));
  const chunkingStrategies = [
    { value: 'fixed_size', label: 'Fixed Size (500 chars)' },
    { value: 'overlap', label: 'Overlap (Fixed + overlap)' },
    { value: 'semantic', label: 'Semantic (AI-powered)' },
    { value: 'paragraph', label: 'Paragraph-based' },
    { value: 'page_based', label: 'Page-based (PDF)' },
    { value: 'parent_child', label: 'Parent-Child (Hierarchical)' },
    { value: 'sentence', label: 'Sentence-based' },
    { value: 'recursive', label: 'Recursive (Smart split)' }
  ];

  const [embeddingModel, setEmbeddingModel] = useState(loadSetting('embeddingModel', 'minilm'));
  const embeddingModels = [
    { value: 'minilm', label: 'MiniLM (Fast, Free, 384d)' },
    { value: 'bge', label: 'BGE (Best Quality, Free, 768d)' },
    { value: 'mpnet', label: 'MPNet (High Quality, Free, 768d)' },
    { value: 'openai', label: 'OpenAI text-embedding-3-small' },
    { value: 'cohere', label: 'Cohere Embed v3' },
    { value: 'fastembed', label: 'FastEmbed (Ultra Fast)' }
  ];

  const [vectorStore, setVectorStore] = useState(loadSetting('vectorStore', 'postgres'));
  const vectorStores = [
    { value: 'postgres', label: 'PostgreSQL + pgvector' },
    { value: 'faiss', label: 'FAISS' },
    { value: 'chromadb', label: 'ChromaDB' },
    { value: 'qdrant', label: 'Qdrant' },
    { value: 'pinecone', label: 'Pinecone' }
  ];

  const [llmProvider, setLlmProvider] = useState(loadSetting('llmProvider', 'openai'));
  const [chatModel, setChatModel] = useState(loadSetting('chatModel', 'openai'));
  const llmProviders = [
    { value: 'openai', label: 'OpenAI GPT-4o-mini (Default)' },
    { value: 'gpt-4o', label: 'OpenAI GPT-4o' },
    { value: 'gpt-4o-mini', label: 'OpenAI GPT-4o-mini' },
    { value: 'gpt-4.1', label: 'OpenAI GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'OpenAI GPT-4.1-mini' },
    { value: 'gpt-5', label: 'OpenAI GPT-5' },
    { value: 'gpt-5-mini', label: 'OpenAI GPT-5-mini' },
    { value: 'gpt-5-nano', label: 'OpenAI GPT-5-nano' },
    { value: 'groq', label: 'Groq Llama 3.3 70B' },
    { value: 'claude', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (Alias)' },
    { value: 'claude-opus', label: 'Claude Opus' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'cohere', label: 'Cohere Command' }
  ];
  const [retrievalStrategy, setRetrievalStrategy] = useState<'semantic' | 'bm25' | 'hybrid'>(
    (loadSetting('retrievalStrategy', 'hybrid') as 'semantic' | 'bm25' | 'hybrid')
  );

  const [pdfMode, setPdfMode] = useState(loadSetting('pdfMode', 'standard'));
  const pdfModes = [
    { value: 'standard', label: 'Standard' },
    { value: 'academic', label: 'Academic' },
    { value: 'advanced', label: 'Advanced' }
  ];

  const [quizDifficulty, setQuizDifficulty] = useState(loadSetting('quizDifficulty', 'medium'));
  const [quizQuestionCount, setQuizQuestionCount] = useState(parseInt(loadSetting('quizQuestionCount', '5'), 10));
  const [quizQuestionTypes, setQuizQuestionTypes] = useState<string[]>(
    loadJsonArraySetting('quizQuestionTypes', ['multiple_choice'])
  );
  const [rerankEnabled, setRerankEnabled] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [selectedFilePreview, setSelectedFilePreview] = useState('');
  const [youtubeThumbnail, setYoutubeThumbnail] = useState('');
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(null);
  const [connectorType, setConnectorType] = useState<'google_drive' | 's3' | 'azure_blob' | 'salesforce' | 'lms'>('google_drive');
  const [connectorResource, setConnectorResource] = useState('');
  const [connectorMetadata, setConnectorMetadata] = useState('');
  const [connectorIngesting, setConnectorIngesting] = useState(false);
  const [connectorStatuses, setConnectorStatuses] = useState<ConnectorStatus[]>([]);
  const [loadingConnectorStatus, setLoadingConnectorStatus] = useState(false);

  const connectorOptions: { value: 'google_drive' | 's3' | 'azure_blob' | 'salesforce' | 'lms'; label: string; placeholder: string }[] = [
    { value: 'google_drive', label: 'Google Drive', placeholder: 'File ID or share URL' },
    { value: 's3', label: 'Amazon S3', placeholder: 's3://bucket/key or {"bucket":"...","key":"..."}' },
    { value: 'azure_blob', label: 'Azure Blob', placeholder: 'Blob URL or {"container":"...","blob":"..."}' },
    { value: 'salesforce', label: 'Salesforce', placeholder: 'REST path or {"soql":"SELECT Id, Name FROM Account LIMIT 5"}' },
    { value: 'lms', label: 'LMS', placeholder: 'API path e.g. /api/v1/courses/42/pages' }
  ];
  const connectorExamples: Record<string, { label: string; resource: string; metadata: string }[]> = {
    google_drive: [
      {
        label: 'Drive File ID',
        resource: '1AbCdEfGhIjKlMnOpQrStUvWxYz123456',
        metadata: '{"filename":"drive-export.txt"}'
      },
      {
        label: 'Drive Share URL',
        resource: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view?usp=sharing',
        metadata: '{"access_token":"YOUR_DRIVE_ACCESS_TOKEN"}'
      }
    ],
    s3: [
      {
        label: 'S3 URI',
        resource: 's3://my-bucket/knowledge/security-policy.txt',
        metadata: '{"filename":"security-policy.txt"}'
      },
      {
        label: 'Bucket/Key JSON',
        resource: '{"bucket":"my-bucket","key":"knowledge/compliance/report.pdf"}',
        metadata: '{}'
      }
    ],
    azure_blob: [
      {
        label: 'Blob URL',
        resource: 'https://myaccount.blob.core.windows.net/docs/enterprise-guide.txt',
        metadata: '{"filename":"enterprise-guide.txt"}'
      },
      {
        label: 'Container/Blob JSON',
        resource: '{"container":"docs","blob":"kb/security-controls.pdf"}',
        metadata: '{}'
      }
    ],
    salesforce: [
      {
        label: 'SOQL Query',
        resource: '{"soql":"SELECT Id, Name FROM Account LIMIT 10"}',
        metadata: '{"filename":"salesforce-accounts.json"}'
      },
      {
        label: 'REST Path',
        resource: '/services/data/v60.0/sobjects/Account/describe',
        metadata: '{}'
      }
    ],
    lms: [
      {
        label: 'Course Pages',
        resource: '/api/v1/courses/42/pages',
        metadata: '{"filename":"course-pages.json"}'
      },
      {
        label: 'Assignments',
        resource: '/api/v1/courses/42/assignments',
        metadata: '{}'
      }
    ]
  };

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
      return { provider: 'openai', model: 'gpt-4o-mini' };
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
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) {
      pushToast('error', 'Invalid Email', 'Enter a valid email address.');
      return;
    }
    if (isSignup) {
      const strong =
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password);
      if (!strong) {
        pushToast('error', 'Weak Password', 'Use 8+ chars with upper/lower/number/symbol.');
        return;
      }
    }
    setAuthLoading(true);
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
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setDocuments([]);
    setVideos([]);
    setMessages([]);
    setConversations([]);
    setCurrentConversationId(null);
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

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    setLoadingConversations(true);
    try {
      const response = await axios.get(`${API_URL}/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      pushToast('error', 'Conversation Fetch Failed', 'Unable to fetch conversation history.');
    } finally {
      setLoadingConversations(false);
    }
  }, [token]);

  const fetchConnectorStatus = useCallback(async () => {
    if (!token) return;
    setLoadingConnectorStatus(true);
    try {
      const response = await axios.get(`${API_URL}/connectors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConnectorStatuses(response.data.connectors || []);
    } catch (error) {
      console.error('Failed to fetch connector status:', error);
      pushToast('error', 'Connector Status Failed', 'Unable to fetch connector configuration status.');
    } finally {
      setLoadingConnectorStatus(false);
    }
  }, [token]);

  const loadSettingsFromBackend = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const settings = response.data?.settings || {};
      setSettingsUpdatedAt(response.data?.updated_at || null);
      if (settings.workspace) setWorkspace(settings.workspace);
      if (settings.chunkingStrategy) setChunkingStrategy(settings.chunkingStrategy);
      if (settings.embeddingModel) setEmbeddingModel(settings.embeddingModel);
      if (settings.vectorStore) setVectorStore(settings.vectorStore);
      if (settings.llmProvider) setLlmProvider(settings.llmProvider);
      if (settings.chatModel) setChatModel(settings.chatModel);
      if (settings.retrievalStrategy) setRetrievalStrategy(settings.retrievalStrategy);
      if (settings.pdfMode) setPdfMode(settings.pdfMode);
      if (settings.quizDifficulty) setQuizDifficulty(settings.quizDifficulty);
      if (settings.quizQuestionCount) setQuizQuestionCount(Number(settings.quizQuestionCount));
      if (Array.isArray(settings.quizQuestionTypes)) setQuizQuestionTypes(settings.quizQuestionTypes);
    } catch (error) {
      console.error('Failed to load backend settings:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDocuments();
      fetchVideos();
      fetchAssessments();
      fetchConnectorStatus();
      fetchConversations();
      loadSettingsFromBackend();
    }
  }, [token, fetchDocuments, fetchVideos, fetchAssessments, fetchConnectorStatus, fetchConversations, loadSettingsFromBackend]);

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !token) return;
    if (selectedFile.size > 20 * 1024 * 1024) {
      pushToast('error', 'File Too Large', 'Max file size is 20MB.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
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
        },
        onUploadProgress: (event) => {
          if (!event.total) return;
          setUploadProgress(Math.round((event.loaded * 100) / event.total));
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
      setUploadProgress(0);
    }
  };

  const handleVideoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl || !token) return;
    const ytValid =
      /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{6,}$/.test(youtubeUrl.trim());
    if (!ytValid) {
      pushToast('error', 'Invalid YouTube URL', 'Use a valid youtube.com or youtu.be URL.');
      return;
    }

    setVideoUploading(true);
    setVideoProgress(25);
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
      setVideoProgress(0);
    }
  };

  const handleConnectorIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !connectorResource.trim()) return;

    const llmConfig = resolveLlmSelection(llmProvider);
    let parsedMetadata: Record<string, unknown> = {};
    if (connectorMetadata.trim()) {
      try {
        parsedMetadata = JSON.parse(connectorMetadata);
      } catch {
        pushToast('error', 'Invalid Metadata JSON', 'Connector metadata must be valid JSON.');
        return;
      }
    }

    setConnectorIngesting(true);
    try {
      const response = await axios.post(
        `${API_URL}/connectors/ingest`,
        {
          connector: connectorType,
          resource: connectorResource.trim(),
          provider: llmConfig.provider,
          model: llmConfig.model,
          embedding_model: embeddingModel,
          chunking_strategy: chunkingStrategy,
          chunking_params: chunkingStrategy === 'overlap' ? { chunk_size: 500, overlap: 80 } : {},
          metadata: parsedMetadata
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setConnectorResource('');
      setConnectorMetadata('');
      fetchDocuments();
      pushToast(
        'success',
        'Connector Ingestion Complete',
        `${response.data?.filename || 'Source'} indexed with ${response.data?.chunks_created || 0} chunks.`
      );
    } catch (error: any) {
      pushToast(
        'error',
        'Connector Ingestion Failed',
        error.response?.data?.details || error.response?.data?.error || 'Connector ingestion failed.'
      );
    } finally {
      setConnectorIngesting(false);
    }
  };

  const applyConnectorExample = (resource: string, metadata: string) => {
    setConnectorResource(resource);
    setConnectorMetadata(metadata);
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

  const saveSettings = () => {
    const settings = {
      workspace,
      chunkingStrategy,
      embeddingModel,
      vectorStore,
      llmProvider,
      chatModel,
      retrievalStrategy,
      pdfMode,
      quizDifficulty,
      quizQuestionCount,
      quizQuestionTypes
    };
    localStorage.setItem('workspace', workspace);
    localStorage.setItem('chunkingStrategy', chunkingStrategy);
    localStorage.setItem('embeddingModel', embeddingModel);
    localStorage.setItem('vectorStore', vectorStore);
    localStorage.setItem('llmProvider', llmProvider);
    localStorage.setItem('chatModel', chatModel);
    localStorage.setItem('retrievalStrategy', retrievalStrategy);
    localStorage.setItem('pdfMode', pdfMode);
    localStorage.setItem('quizDifficulty', quizDifficulty);
    localStorage.setItem('quizQuestionCount', String(quizQuestionCount));
    localStorage.setItem('quizQuestionTypes', JSON.stringify(quizQuestionTypes));
    if (!token) {
      pushToast('success', 'Settings Saved', 'Your settings were saved locally.');
      return;
    }
    axios.post(
      `${API_URL}/settings`,
      { settings },
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((response) => {
        setSettingsUpdatedAt(response.data?.updated_at || new Date().toISOString());
        pushToast('success', 'Settings Saved', 'Your settings were saved to your account.');
      })
      .catch(() => pushToast('info', 'Saved Locally', 'Server sync failed; local settings were saved.'));
  };

  const previewDocument = async (id: number) => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/documents/${id}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error: any) {
      pushToast('error', 'Preview Failed', error.response?.data?.error || 'Unable to preview this document.');
    }
  };

  const downloadDocument = async (id: number, filename: string) => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/documents/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || `document-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch (error: any) {
      pushToast('error', 'Download Failed', error.response?.data?.error || 'Unable to download this document.');
    }
  };

  const deleteDocument = async (id: number) => {
    if (!token) return;
    if (!window.confirm('Delete this document?')) return;
    try {
      const response = await axios.delete(`${API_URL}/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 200) {
        pushToast('success', 'Document Deleted', 'Document removed successfully.');
        fetchDocuments();
      }
    } catch (error: any) {
      pushToast('error', 'Delete Failed', error.response?.data?.error || 'Unable to delete document.');
    }
  };

  const deleteVideo = async (id: number) => {
    if (!token) return;
    if (!window.confirm('Delete this video?')) return;
    try {
      const response = await axios.delete(`${API_URL}/videos/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 200) {
        pushToast('success', 'Video Deleted', 'Video removed successfully.');
        fetchVideos();
      }
    } catch (error: any) {
      pushToast('error', 'Delete Failed', error.response?.data?.error || 'Unable to delete video.');
    }
  };

  const loadConversationMessages = async (conversationId: number) => {
    if (!token) return;
    const response = await axios.get(`${API_URL}/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setMessages(response.data.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      sources: msg.sources || []
    })));
  };

  const handleNewConversation = async () => {
    if (!token) return;
    try {
      const created = await axios.post(
        `${API_URL}/conversations`,
        { title: `Conversation ${new Date().toLocaleString()}` },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCurrentConversationId(created.data.id);
      setMessages([]);
      fetchConversations();
    } catch {
      pushToast('error', 'Conversation Error', 'Unable to create conversation.');
    }
  };

  const sendChatMessage = async (text: string, regenerate = false) => {
    if (!token || !text) return;
    let conversationId = currentConversationId;
    if (!conversationId) {
      const created = await axios.post(
        `${API_URL}/conversations`,
        { title: `Conversation ${new Date().toLocaleString()}` },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      conversationId = created.data.id;
      setCurrentConversationId(conversationId);
      fetchConversations();
    }

    if (!regenerate) setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    const llmConfig = resolveLlmSelection(chatModel);
    const response = await axios.post(
      `${API_URL}/chat/send`,
      {
        conversation_id: conversationId,
        question: text,
        document_ids: documents.map((d) => d.id),
        provider: llmConfig.provider,
        model: llmConfig.model,
        retrieval_strategy: retrievalStrategy,
        enable_reranking: rerankEnabled,
        top_k: 5
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: response.data.answer, sources: response.data.sources || [] }
    ]);
    setLoading(false);
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question || !token) return;
    const toSend = question;
    setQuestion('');
    try {
      await sendChatMessage(toSend);
    } catch (error: any) {
      pushToast('error', 'Chat Failed', error.response?.data?.error || 'Unable to answer this query.');
      setLoading(false);
    }
  };

  const handleCopyLastAssistant = async () => {
    const assistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!assistant) return;
    await navigator.clipboard.writeText(assistant.content);
    pushToast('success', 'Copied', 'Last assistant response copied.');
  };

  const handleRegenerate = async () => {
    const user = [...messages].reverse().find((m) => m.role === 'user');
    if (!user) return;
    setMessages((prev) => (prev.length && prev[prev.length - 1].role === 'assistant' ? prev.slice(0, -1) : prev));
    try {
      await sendChatMessage(user.content, true);
    } catch (error: any) {
      pushToast('error', 'Regenerate Failed', error.response?.data?.error || 'Unable to regenerate response.');
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
    const all = [...docItems, ...videoItems];
    const filtered = globalSearch.trim()
      ? all.filter((item) => item.title.toLowerCase().includes(globalSearch.toLowerCase()))
      : all;
    return filtered
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6);
  }, [documents, videos, globalSearch]);

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
    const merged = [...documentRows, ...videoRows];
    const filtered = globalSearch.trim()
      ? merged.filter((row) => `${row.name} ${row.owner} ${row.tags.join(' ')}`.toLowerCase().includes(globalSearch.toLowerCase()))
      : merged;
    return filtered.sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
    );
  }, [documents, videos, globalSearch]);

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
            <button type="submit" className="btn btn-primary" disabled={authLoading}>
              {authLoading ? 'Authenticating...' : (isSignup ? 'Create Account' : 'Sign In')}
            </button>
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
                            <td>
                              <div className="tag-row">
                                {!row.key.startsWith('d-') && (
                                  <button className="btn btn-tertiary" onClick={() => pushToast('info', 'View', row.name)}>View</button>
                                )}
                                {row.key.startsWith('d-') && (
                                  <button
                                    className="btn btn-tertiary"
                                    onClick={() => previewDocument(parseInt(row.key.replace('d-', ''), 10))}
                                  >
                                    Preview
                                  </button>
                                )}
                                {row.key.startsWith('d-') && (
                                  <button
                                    className="btn btn-tertiary"
                                    onClick={() => downloadDocument(parseInt(row.key.replace('d-', ''), 10), row.name)}
                                  >
                                    Download
                                  </button>
                                )}
                                {row.key.startsWith('d-') ? (
                                  <button
                                    className="btn btn-tertiary"
                                    onClick={() => deleteDocument(parseInt(row.key.replace('d-', ''), 10))}
                                  >
                                    Delete
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-tertiary"
                                    onClick={() => deleteVideo(parseInt(row.key.replace('v-', ''), 10))}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
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
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setSelectedFile(file);
                          setSelectedFilePreview(file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : '');
                        }}
                      />
                      <p>{selectedFile ? selectedFile.name : 'Drag-and-drop PDF or select a file'}</p>
                      {selectedFilePreview && <small>{selectedFilePreview}</small>}
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
                    {uploading && (
                      <div className="progress-row">
                        <span>Upload progress</span>
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${uploadProgress}%` }} /></div>
                        <span>{uploadProgress}%</span>
                      </div>
                    )}
                  </form>
                </section>

                <section className="panel">
                  <h3>Source Connectors</h3>
                  <div className="connector-grid">
                    {connectorOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={connectorType === option.value ? 'connector active' : 'connector'}
                        onClick={() => setConnectorType(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="connector-status-list">
                    {loadingConnectorStatus ? (
                      <small>Loading connector status...</small>
                    ) : (
                      connectorStatuses.map((status) => (
                        <div key={status.name} className="connector-status-row">
                          <span>{status.name}</span>
                          <span className={status.configured ? 'chip success' : 'chip warn'}>
                            {status.configured ? 'Configured' : `Missing: ${status.missing_env.join(', ')}`}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={handleVideoUpload} className="stack-form">
                    <label>YouTube URL</label>
                    <input
                      className="input-control"
                      value={youtubeUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setYoutubeUrl(val);
                        const match = val.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
                        setYoutubeThumbnail(match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : '');
                      }}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                    {youtubeThumbnail && <img className="youtube-thumb" src={youtubeThumbnail} alt="YouTube preview" />}
                    <button className="btn btn-secondary" type="submit" disabled={!youtubeUrl || videoUploading}>
                      {videoUploading ? 'Processing...' : 'Ingest from YouTube'}
                    </button>
                    {videoUploading && (
                      <div className="progress-row">
                        <span>Video ingestion</span>
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${videoProgress || 45}%` }} /></div>
                        <span>{videoProgress || 45}%</span>
                      </div>
                    )}
                  </form>
                  <form onSubmit={handleConnectorIngest} className="stack-form connector-form">
                    <label>Connector Source</label>
                    <input
                      className="input-control"
                      value={connectorResource}
                      onChange={(e) => setConnectorResource(e.target.value)}
                      placeholder={connectorOptions.find((o) => o.value === connectorType)?.placeholder}
                    />
                    <label>Metadata JSON (Optional)</label>
                    <textarea
                      className="input-control connector-metadata"
                      value={connectorMetadata}
                      onChange={(e) => setConnectorMetadata(e.target.value)}
                      placeholder='{"access_token":"...","filename":"optional-name.txt"}'
                    />
                    <div className="example-chip-row">
                      {connectorExamples[connectorType].map((example) => (
                        <button
                          key={`${connectorType}-${example.label}`}
                          type="button"
                          className="example-chip"
                          onClick={() => applyConnectorExample(example.resource, example.metadata)}
                        >
                          {example.label}
                        </button>
                      ))}
                    </div>
                    <button className="btn btn-secondary" type="submit" disabled={!connectorResource.trim() || connectorIngesting}>
                      {connectorIngesting ? 'Ingesting...' : `Ingest from ${connectorOptions.find((o) => o.value === connectorType)?.label}`}
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
                  <div className="progress-track"><div className="progress-fill" style={{ width: (videoUploading || connectorIngesting) ? '45%' : '100%' }} /></div>
                  <span>{(videoUploading || connectorIngesting) ? 'Running' : 'Completed'}</span>
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
                    <div className="tag-row">
                      <button className="btn btn-secondary" onClick={handleNewConversation}>+ New Conversation</button>
                      <select className="input-control model-select" value={chatModel} onChange={(e) => setChatModel(e.target.value)}>
                        {llmProviders.map((provider) => (
                          <option key={provider.value} value={provider.value}>{provider.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="conversation-list">
                    {loadingConversations ? (
                      <small>Loading conversations...</small>
                    ) : conversations.map((conv) => (
                      <button
                        key={conv.id}
                        type="button"
                        className={currentConversationId === conv.id ? 'connector active' : 'connector'}
                        onClick={async () => {
                          setCurrentConversationId(conv.id);
                          try {
                            await loadConversationMessages(conv.id);
                          } catch {
                            pushToast('error', 'Load Failed', 'Unable to load conversation.');
                          }
                        }}
                      >
                        {conv.title}
                      </button>
                    ))}
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
                  <div className="tag-row">
                    <button className="btn btn-tertiary" onClick={handleCopyLastAssistant}>Copy Last Reply</button>
                    <button className="btn btn-tertiary" onClick={handleRegenerate}>Regenerate</button>
                  </div>
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
                    <label>Retrieval Strategy</label>
                    <select
                      className="input-control"
                      value={retrievalStrategy}
                      onChange={(e) => setRetrievalStrategy(e.target.value as 'semantic' | 'bm25' | 'hybrid')}
                    >
                      <option value="semantic">Semantic</option>
                      <option value="bm25">BM25</option>
                      <option value="hybrid">Hybrid</option>
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
                <div className="tag-row">
                  {settingsUpdatedAt && (
                    <span className="chip neutral">
                      Settings saved at {new Date(settingsUpdatedAt).toLocaleString()}
                    </span>
                  )}
                  <button className="btn btn-secondary">Export Audit Logs</button>
                </div>
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
                    <label>Question Types</label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={quizQuestionTypes.includes('multiple_choice')}
                        onChange={(e) => setQuizQuestionTypes((prev) => e.target.checked ? Array.from(new Set([...prev, 'multiple_choice'])) : prev.filter((t) => t !== 'multiple_choice'))}
                      />
                      <span>Multiple Choice</span>
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={quizQuestionTypes.includes('true_false')}
                        onChange={(e) => setQuizQuestionTypes((prev) => e.target.checked ? Array.from(new Set([...prev, 'true_false'])) : prev.filter((t) => t !== 'true_false'))}
                      />
                      <span>True / False</span>
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={quizQuestionTypes.includes('short_answer')}
                        onChange={(e) => setQuizQuestionTypes((prev) => e.target.checked ? Array.from(new Set([...prev, 'short_answer'])) : prev.filter((t) => t !== 'short_answer'))}
                      />
                      <span>Short Answer</span>
                    </label>
                    <button className="btn btn-primary" disabled={generatingQuiz || documents.length === 0} onClick={handleGenerateQuiz}>
                      {generatingQuiz ? 'Generating...' : `Generate Assessment (${assessments.length})`}
                    </button>
                    <button className="btn btn-secondary" onClick={saveSettings}>Save Settings</button>
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
