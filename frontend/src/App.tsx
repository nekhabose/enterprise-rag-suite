import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  
  // Documents
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Chat
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConversation, setCurrentConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<'openai' | 'groq'>('groq');
  
  // Current view
  const [view, setView] = useState<'documents' | 'chat'>('documents');

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
  };

  // Fetch documents
  const fetchDocuments = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
  };

  // Upload document
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !token) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('provider', provider);  // ← Add provider
    try {
      const response = await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      alert(`Document uploaded! ${response.data.chunks_created} chunks created.`);
      setSelectedFile(null);
      fetchDocuments();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Fetch conversations
  const fetchConversations = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  };

  // Create new conversation
  const createConversation = async () => {
    if (!token) return;
    try {
      const response = await axios.post(`${API_URL}/conversations`, 
        { title: 'New Chat' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCurrentConversation(response.data);
      setMessages([]);
      fetchConversations();
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  // Fetch messages
  const fetchMessages = async (conversationId: number) => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !currentConversation || !token) return;

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/chat/send`, {
    conversation_id: currentConversation.id,
    question: question,
    provider: provider  // ← Add provider
}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Add messages to UI
      setMessages([
        ...messages,
        { role: 'user', content: question },
        { role: 'assistant', content: response.data.answer, sources: response.data.sources }
      ]);
      setQuestion('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (token) {
      fetchDocuments();
      fetchConversations();
    }
  }, [token]);

  // Not logged in - show auth form
  if (!token) {
    return (
      <div className="App">
        <div className="auth-container">
          <h1>📚 AI Study Assistant</h1>
          <h2>{isSignup ? 'Sign Up' : 'Login'}</h2>
          <form onSubmit={handleAuth}>
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
            <button type="submit">{isSignup ? 'Sign Up' : 'Login'}</button>
          </form>
          <p>
            {isSignup ? 'Already have an account?' : "Don't have an account?"}
            <button onClick={() => setIsSignup(!isSignup)}>
              {isSignup ? 'Login' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Logged in - show main app
  return (
    <div className="App">
      <nav className="navbar">
      <h1>📚 AI Study Assistant</h1>
     <div className="provider-selector">
        <label>AI Provider: </label>
        <select value={provider} onChange={(e) => setProvider(e.target.value as 'openai' | 'groq')}>
            <option value="groq">Groq (Free, Fast)</option>
            <option value="openai">OpenAI (Better Quality)</option>
        </select>
    </div>
    <div className="nav-buttons">
          <button 
            className={view === 'documents' ? 'active' : ''} 
            onClick={() => setView('documents')}
          >
            Documents
          </button>
          <button 
            className={view === 'chat' ? 'active' : ''} 
            onClick={() => setView('chat')}
          >
            Chat
          </button>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      {view === 'documents' ? (
        <div className="documents-page">
          <h2>Your Documents</h2>
          
          <form onSubmit={handleUpload} className="upload-form">
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            <button type="submit" disabled={!selectedFile || uploading}>
              {uploading ? 'Uploading...' : 'Upload PDF'}
            </button>
          </form>

          <div className="documents-list">
            {documents.length === 0 ? (
              <p>No documents yet. Upload a PDF to get started!</p>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="document-card">
                  <h3>{doc.filename}</h3>
                  <p>Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="chat-page">
          <div className="chat-sidebar">
            <button onClick={createConversation}>+ New Chat</button>
            <div className="conversations-list">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentConversation(conv);
                    fetchMessages(conv.id);
                  }}
                >
                  {conv.title}
                </div>
              ))}
            </div>
          </div>

          <div className="chat-main">
            {!currentConversation ? (
              <div className="empty-state">
                <h2>Select a conversation or create a new one</h2>
              </div>
            ) : (
              <>
                <div className="messages-container">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                      <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong>
                      <p>{msg.content}</p>
                      {msg.sources && (
                        <div className="sources">
                          <small>Sources: {msg.sources.map((s: any) => s.filename).join(', ')}</small>
                        </div>
                      )}
                    </div>
                  ))}
                  {loading && <div className="message assistant"><p>Thinking...</p></div>}
                </div>

                <form onSubmit={handleSendMessage} className="chat-input-form">
                  <input
                    type="text"
                    placeholder="Ask a question about your documents..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    disabled={loading}
                  />
                  <button type="submit" disabled={loading || !question.trim()}>
                    Send
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;