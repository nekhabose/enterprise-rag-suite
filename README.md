# 🎓 AI Study Assistant - Advanced RAG Platform

A production-grade educational platform featuring a modular Retrieval-Augmented Generation (RAG) system with multiple configurable strategies for chunking, embedding, vector storage, retrieval, and LLM providers.

## 🌟 Features

### Core Functionality
- 📄 **PDF Document Processing** - Upload and index educational materials
- 💬 **Intelligent Chat Interface** - Ask questions about your documents
- 🔐 **User Authentication** - Secure JWT-based auth system
- 🎯 **Multi-Provider Support** - OpenAI, Groq, and more

### Advanced RAG Features
- **7 Chunking Strategies**: Fixed-size, Page-based, Paragraph, Semantic, Parent-child, Sentence, Recursive
- **Multiple Embedding Models**: OpenAI, Sentence Transformers, HuggingFace (coming soon)
- **Vector Store Options**: PostgreSQL+pgvector, FAISS, ChromaDB, Pinecone (coming soon)
- **Retrieval Strategies**: Semantic, BM25, Hybrid (coming soon)
- **LLM Providers**: OpenAI GPT, Groq Llama, Anthropic Claude, Google Gemini (coming soon)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                FRONTEND (React + TypeScript)             │
│  • Auth UI                                               │
│  • Document Upload with Strategy Selection               │
│  • Chat Interface                                        │
│  • Provider Configuration Dropdowns                      │
└────────────────────┬────────────────────────────────────┘
                     │ REST API
                     ▼
┌─────────────────────────────────────────────────────────┐
│           BACKEND (Node.js + TypeScript)                 │
│  • JWT Authentication                                    │
│  • Document Management                                   │
│  • Chat Session Handling                                 │
│  • Configuration Pass-through                            │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP
                     ▼
┌─────────────────────────────────────────────────────────┐
│           AI SERVICE (Python + FastAPI)                  │
│                                                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │          MODULAR RAG PIPELINE                      │  │
│  │                                                     │  │
│  │  1. CHUNKING (Factory Pattern)                     │  │
│  │     ├─ Fixed Size      (500 words + overlap)      │  │
│  │     ├─ Page Based      (PDF page boundaries)      │  │
│  │     ├─ Paragraph       (Natural breaks)           │  │
│  │     ├─ Semantic        (Topic boundaries)         │  │
│  │     ├─ Parent-Child    (Hierarchical)             │  │
│  │     ├─ Sentence        (Sentence groups)          │  │
│  │     └─ Recursive       (Multi-level splits)       │  │
│  │                                                     │  │
│  │  2. EMBEDDING (Factory Pattern)                    │  │
│  │     ├─ OpenAI          (text-embedding-ada-002)   │  │
│  │     ├─ Simple Text     (Character-based)          │  │
│  │     └─ [More coming]   (Sentence Transformers)    │  │
│  │                                                     │  │
│  │  3. VECTOR STORE                                   │  │
│  │     ├─ PostgreSQL      (pgvector extension)       │  │
│  │     └─ [More coming]   (FAISS, ChromaDB, etc)     │  │
│  │                                                     │  │
│  │  4. RETRIEVAL                                      │  │
│  │     ├─ Semantic        (Cosine similarity)        │  │
│  │     └─ [More coming]   (BM25, Hybrid, MMR)        │  │
│  │                                                     │  │
│  │  5. LLM GENERATION                                 │  │
│  │     ├─ OpenAI          (GPT-3.5, GPT-4)           │  │
│  │     ├─ Groq            (Llama 3.3 70B)            │  │
│  │     └─ [More coming]   (Claude, Gemini, Cohere)   │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         DATABASE (PostgreSQL + pgvector)                 │
│  • User accounts                                         │
│  • Documents & chunks                                    │
│  • Vector embeddings (1536-dim)                          │
│  • Chat conversations & messages                         │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+ with pgvector extension
- API Keys: OpenAI (optional) or Groq (free)

### Installation

**1. Clone and Setup Database**
```bash
git clone <your-repo-url>
cd edu-platform

# Create database
createdb edu_platform
psql edu_platform -f database/schema.sql
```

**2. Python AI Service**
```bash
cd ai-service
python3.10 -m venv venv
source venv/bin/activate  # Mac/Linux
# venv\Scripts\activate  # Windows

pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your API keys
```

**3. Node.js Backend**
```bash
cd ../backend
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your settings
```

**4. React Frontend**
```bash
cd ../frontend
npm install

# Configure environment
cp .env.example .env
```

### Running the Application

**Terminal 1 - Python AI Service:**
```bash
cd ai-service
source venv/bin/activate
python main.py
# Running on http://localhost:${AI_SERVICE_PORT:-8000}
```

**Terminal 2 - Node.js Backend:**
```bash
cd backend
npm run dev
# Running on http://localhost:${PORT:-3000}
```

**Terminal 3 - React Frontend:**
```bash
cd frontend
npm start
# Running on http://localhost:${PORT:-3001}
```
Visit your configured frontend URL (default **http://localhost:3001**) in your browser.

## 📚 Usage Guide

### Basic Workflow
1. **Sign Up** - Create an account
2. **Select AI Provider** - Choose OpenAI or Groq from dropdown
3. **Upload Documents** - Upload PDF files
4. **Choose Chunking Strategy** - Select how to split your documents
5. **Start Chatting** - Ask questions about your materials

### Chunking Strategies Explained

| Strategy | Best For | Description |
|----------|----------|-------------|
| **Fixed Size** | General documents | 500 words with 50-word overlap |
| **Page Based** | Structured PDFs | Preserves page boundaries |
| **Paragraph** | Articles, books | Keeps paragraphs intact |
| **Semantic** | Technical docs | Splits by topic/headers |
| **Parent-Child** | Context retention | Hierarchical chunks |
| **Sentence** | Precise retrieval | Groups sentences |
| **Recursive** | Complex docs | Multi-level splitting |

### API Endpoints

#### Authentication
- `POST /auth/signup` - Create account
- `POST /auth/login` - Login

#### Documents
- `GET /documents` - List documents
- `POST /documents/upload` - Upload PDF (with strategy selection)
- `DELETE /documents/:id` - Delete document

#### Chat
- `GET /conversations` - List conversations
- `POST /conversations` - Create conversation
- `POST /chat/send` - Send message

#### Configuration
- `GET /ai/chunking-strategies` - List available strategies
- `GET /ai/providers` - List available AI providers

## 🛠️ Tech Stack

### Backend Services
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Backend API | Node.js + TypeScript + Express | REST API server |
| AI Service | Python + FastAPI | RAG pipeline |
| Database | PostgreSQL 14 | Data persistence |
| Vector Store | pgvector extension | Vector similarity search |

### AI/ML Stack
| Component | Options | Notes |
|-----------|---------|-------|
| **Chunking** | 7 strategies | Factory pattern |
| **Embeddings** | OpenAI, Simple Text | Extensible |
| **Vector DB** | pgvector | IVFFlat indexing |
| **Retrieval** | Semantic (cosine) | More coming |
| **LLM** | OpenAI GPT, Groq Llama | Multi-provider |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | React 18 + TypeScript |
| HTTP Client | Axios |
| Styling | Custom CSS |
| State | React Hooks |

## 📁 Project Structure

```
edu-platform/
├── ai-service/              # Python AI microservice
│   ├── chunking/           # Modular chunking strategies
│   │   ├── base_chunker.py
│   │   ├── fixed_size_chunker.py
│   │   ├── page_based_chunker.py
│   │   ├── paragraph_chunker.py
│   │   ├── semantic_chunker.py
│   │   ├── parent_child_chunker.py
│   │   ├── sentence_chunker.py
│   │   ├── recursive_chunker.py
│   │   └── chunking_factory.py
│   ├── main.py             # FastAPI application
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment template
│
├── backend/                # Node.js backend
│   ├── src/
│   │   └── server.ts       # Express application
│   ├── package.json        # Node dependencies
│   ├── tsconfig.json       # TypeScript config
│   └── .env.example        # Environment template
│
├── frontend/               # React frontend
│   ├── src/
│   │   ├── App.tsx         # Main application
│   │   └── App.css         # Styles
│   ├── package.json        # Dependencies
│   └── .env.example        # Environment template
│
├── database/               # Database schema
│   └── schema.sql          # PostgreSQL schema
│
└── README.md              # This file
```

## 🔧 Configuration

### Environment Variables
Create env files first:
```bash
cp ai-service/.env.example ai-service/.env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Where to add API keys:
- Add LLM keys in `ai-service/.env`
- Add backend secrets/DB in `backend/.env`
- Add frontend API URL and frontend dev port in `frontend/.env`

Templates:

**`ai-service/.env`**
```env
AI_SERVICE_HOST=0.0.0.0
AI_SERVICE_PORT=8000

FRONTEND_PORT=3001
FRONTEND_URL=http://localhost:3001
# CORS_ORIGINS=http://localhost:3001,http://127.0.0.1:3001

DATABASE_URL=postgresql://localhost:5432/edu_platform

OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
COHERE_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
TOGETHER_API_KEY=...
```

**`backend/.env`**
```env
PORT=3000
DATABASE_URL=postgresql://localhost:5432/edu_platform
JWT_SECRET=replace-with-a-strong-secret

# Use either AI_SERVICE_URL or AI_SERVICE_HOST + AI_SERVICE_PORT
AI_SERVICE_URL=http://localhost:8000
# AI_SERVICE_HOST=localhost
# AI_SERVICE_PORT=8000
```

**`frontend/.env`**
```env
PORT=3001
REACT_APP_API_URL=http://localhost:3000
# Optional fallback used when REACT_APP_API_URL is not set
REACT_APP_BACKEND_PORT=3000
```

Port configuration:
- Frontend dev server port: `frontend/.env` -> `PORT`
- Backend API port: `backend/.env` -> `PORT`
- AI service port: `ai-service/.env` -> `AI_SERVICE_PORT` (or `PORT`)

If you change ports:
1. Set `backend/.env` `PORT=<backend_port>`
2. Set `ai-service/.env` `AI_SERVICE_PORT=<ai_port>`
3. Set `frontend/.env` `PORT=<frontend_port>`
4. Point frontend to backend with `REACT_APP_API_URL=http://localhost:<backend_port>`
5. Point backend to AI with `AI_SERVICE_URL=http://localhost:<ai_port>` (or host+port vars)

## 🧪 Testing

**Test Chunking Module:**
```bash
cd ai-service
python test_chunking.py
```

**Test API Endpoints:**
```bash
# Test AI service
curl http://localhost:8000/

# Test backend
curl http://localhost:3000/

# List chunking strategies
curl http://localhost:8000/ai/chunking-strategies
```

## 🎯 Roadmap

### Phase 2: Rich Ingestion (Coming Soon)
- ✅ YouTube video ingestion
- ✅ Research paper handling
- ✅ Metadata tagging (subject/year)
- ✅ Advanced filtering

### Phase 3: AI Learning Tools (Coming Soon)
- ✅ Quiz generation
- ✅ AI-powered grading
- ✅ Study recommendations

### Phase 4: Enterprise Features (Coming Soon)
- ✅ LMS integration (LTI)
- ✅ Multi-tenant support
- ✅ Admin portal
- ✅ Analytics dashboard

### Phase 5: Advanced RAG (In Progress)
- ⏳ More embedding models
- ⏳ Multiple vector stores
- ⏳ Hybrid retrieval
- ⏳ More LLM providers

## 🤝 Contributing

This is a learning project. Feel free to:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

## 👨‍💻 Author

Built as an educational project to demonstrate:
- Modern full-stack architecture
- Advanced RAG techniques
- Modular design patterns
- Production-ready code

## 🙏 Acknowledgments

- OpenAI for GPT and embeddings API
- Groq for fast LLM inference
- PostgreSQL team for pgvector extension
- FastAPI and React communities

---

**Questions?** Open an issue or reach out!
