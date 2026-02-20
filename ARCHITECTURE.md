# 🏗️ System Architecture

This document provides a deep dive into the AI Study Assistant's architecture, design patterns, and implementation details.

## Table of Contents
1. [High-Level Architecture](#high-level-architecture)
2. [Component Details](#component-details)
3. [RAG Pipeline](#rag-pipeline)
4. [Design Patterns](#design-patterns)
5. [Data Flow](#data-flow)
6. [Security](#security)

---

## High-Level Architecture

### Three-Tier Architecture

```
┌──────────────────────────────────────────┐
│         PRESENTATION TIER                 │
│         React + TypeScript                │
│  • SPA with React 18                     │
│  • Component-based UI                    │
│  • Axios for HTTP                        │
│  • Local state management                │
└──────────────┬───────────────────────────┘
               │ HTTP/REST
               ▼
┌──────────────────────────────────────────┐
│         APPLICATION TIER                  │
│         Node.js + TypeScript              │
│  • Express.js REST API                   │
│  • JWT authentication                    │
│  • Business logic layer                  │
│  • Service orchestration                 │
└──────────────┬───────────────────────────┘
               │ HTTP
               ▼
┌──────────────────────────────────────────┐
│         AI/ML TIER                        │
│         Python + FastAPI                  │
│  • RAG pipeline                          │
│  • Vector operations                     │
│  • LLM integration                       │
│  • Strategy pattern modules              │
└──────────────┬───────────────────────────┘
               │ SQL
               ▼
┌──────────────────────────────────────────┐
│         DATA TIER                         │
│         PostgreSQL + pgvector             │
│  • Relational data                       │
│  • Vector embeddings                     │
│  • Full-text search                      │
│  • ACID transactions                     │
└──────────────────────────────────────────┘
```

---

## Component Details

### 1. Frontend (React)

**Technology Stack:**
- React 18 with TypeScript
- Functional components with hooks
- Axios for API calls
- Custom CSS for styling

**Key Components:**
```typescript
App.tsx
├── AuthView              // Login/Signup
├── DocumentsView         // Upload & manage docs
│   ├── UploadForm       // File upload with config
│   └── DocumentList     // Grid of documents
└── ChatView             // Chat interface
    ├── ConversationList // Sidebar
    ├── MessageList      // Chat history
    └── MessageInput     // Input form
```

**State Management:**
- Local state with useState
- No Redux (keeping it simple)
- Token stored in localStorage

### 2. Backend (Node.js)

**Technology Stack:**
- Node.js 18 with TypeScript
- Express.js for REST API
- PostgreSQL client (pg)
- JWT for authentication
- Multer for file uploads

**Architecture Layers:**
```
Routes Layer (server.ts)
    ↓
Middleware Layer
    ├── Authentication (JWT verify)
    ├── CORS
    └── JSON parsing
    ↓
Business Logic
    ├── Auth service
    ├── Document service
    └── Chat service
    ↓
Data Access Layer
    └── PostgreSQL queries
```

**Key Endpoints:**
```
Authentication:
POST   /auth/signup
POST   /auth/login

Documents:
GET    /documents
POST   /documents/upload
DELETE /documents/:id

Conversations:
GET    /conversations
POST   /conversations
GET    /conversations/:id/messages

Chat:
POST   /chat/send
```

### 3. AI Service (Python)

**Technology Stack:**
- Python 3.10 with FastAPI
- Pydantic for validation
- PostgreSQL client (psycopg2)
- OpenAI SDK
- Groq SDK
- PyPDF2 for parsing

**Modular Architecture:**
```
main.py (FastAPI app)
    ↓
Factories
    ├── ChunkingFactory
    ├── EmbeddingFactory (future)
    ├── VectorStoreFactory (future)
    ├── RetrievalFactory (future)
    └── LLMFactory (future)
    ↓
Strategy Implementations
    ├── chunking/
    │   ├── fixed_size_chunker.py
    │   ├── page_based_chunker.py
    │   ├── paragraph_chunker.py
    │   ├── semantic_chunker.py
    │   ├── parent_child_chunker.py
    │   ├── sentence_chunker.py
    │   └── recursive_chunker.py
    │
    ├── embeddings/ (future)
    ├── vector_stores/ (future)
    ├── retrieval/ (future)
    └── llms/ (future)
```

---

## RAG Pipeline

### Document Indexing Flow

```
1. PDF Upload
   ↓
2. Text Extraction (PyPDF2)
   ↓
3. Chunking (Strategy Pattern)
   └── User selects: fixed_size, page_based, etc.
   ↓
4. Embedding Generation
   ├── OpenAI: text-embedding-ada-002
   └── Groq: Simple text-based
   ↓
5. Vector Storage (pgvector)
   └── INSERT INTO chunks (content, embedding, metadata)
   ↓
6. Indexing (IVFFlat)
   └── CREATE INDEX ... USING ivfflat
```

### Query Flow

```
1. User Question
   ↓
2. Question Embedding
   └── Same model as documents
   ↓
3. Vector Similarity Search
   └── SELECT ... ORDER BY embedding <=> query_vector LIMIT 5
   ↓
4. Context Building
   └── Combine top 5 chunks
   ↓
5. LLM Prompt Construction
   ├── System prompt
   ├── Retrieved context
   └── User question
   ↓
6. LLM Generation
   ├── OpenAI: GPT-3.5-turbo
   └── Groq: llama-3.3-70b-versatile
   ↓
7. Response with Citations
   └── Return answer + source documents
```

---

## Design Patterns

### 1. Factory Pattern (Chunking)

**Purpose:** Create different chunking strategies without changing client code

**Implementation:**
```python
class ChunkingFactory:
    _chunkers = {
        'fixed_size': FixedSizeChunker,
        'semantic': SemanticChunker,
        # ... more strategies
    }
    
    @classmethod
    def create(cls, strategy: str, **kwargs):
        chunker_class = cls._chunkers[strategy]
        return chunker_class(**kwargs)
```

**Benefits:**
- Easy to add new strategies
- Client code stays simple
- Strategies are interchangeable

### 2. Strategy Pattern (Chunking Strategies)

**Purpose:** Encapsulate different chunking algorithms

**Implementation:**
```python
class BaseChunker(ABC):
    @abstractmethod
    def chunk(self, text: str) -> List[Chunk]:
        pass

class FixedSizeChunker(BaseChunker):
    def chunk(self, text: str) -> List[Chunk]:
        # Implementation
        
class SemanticChunker(BaseChunker):
    def chunk(self, text: str) -> List[Chunk]:
        # Different implementation
```

**Benefits:**
- Each strategy is independent
- Easy to test individually
- Can switch at runtime

### 3. Repository Pattern (Data Access)

**Purpose:** Abstract database operations

**Implementation:**
```typescript
// Implicit in our code:
async function getDocuments(userId: number) {
    return pool.query('SELECT * FROM documents WHERE user_id = $1', [userId]);
}
```

### 4. Middleware Pattern (Express)

**Purpose:** Process requests in a pipeline

**Implementation:**
```typescript
app.use(cors());                    // 1. CORS
app.use(express.json());            // 2. Parse JSON
app.use(authMiddleware);            // 3. Verify JWT
```

---

## Data Flow

### Document Upload Flow

```
┌─────────┐  1. Upload   ┌─────────┐  2. Save    ┌──────────┐
│ Browser │ ──────────>  │ Backend │ ─────────>  │ Disk     │
└─────────┘              └─────────┘             └──────────┘
                              │ 3. Create record
                              ▼
                         ┌──────────┐
                         │ Database │
                         └──────────┘
                              │ 4. Call AI service
                              ▼
                         ┌──────────┐  5. Extract
                         │ Python   │ ─────────> PyPDF2
                         │ Service  │
                         └──────────┘
                              │ 6. Chunk
                              ▼
                         ChunkingFactory
                              │ 7. Embed
                              ▼
                         OpenAI/Groq API
                              │ 8. Store vectors
                              ▼
                         ┌──────────┐
                         │ pgvector │
                         └──────────┘
```

### Chat Query Flow

```
┌─────────┐  1. Question  ┌─────────┐  2. Save    ┌──────────┐
│ Browser │ ───────────>  │ Backend │ ─────────>  │ Database │
└─────────┘               └─────────┘             └──────────┘
                               │ 3. Call AI
                               ▼
                          ┌──────────┐  4. Embed question
                          │ Python   │ ────────────────────>
                          │ Service  │  OpenAI/Groq
                          └──────────┘
                               │ 5. Search vectors
                               ▼
                          ┌──────────┐  <=> cosine distance
                          │ pgvector │
                          └──────────┘
                               │ 6. Get top 5 chunks
                               ▼
                          Build context
                               │ 7. LLM call
                               ▼
                          OpenAI/Groq API
                               │ 8. Return answer
                               ▼
                          ┌──────────┐  9. Save & return
                          │ Database │
                          └──────────┘
```

---

## Security

### Authentication Flow

```
1. User signs up
   └── Password hashed with bcrypt (10 rounds)
   └── User record created
   
2. User logs in
   ├── Password verified with bcrypt
   └── JWT token issued (7 day expiry)
   
3. Subsequent requests
   ├── Token sent in Authorization header
   ├── Backend verifies JWT signature
   └── userId extracted from token
```

### JWT Token Structure

```json
{
  "userId": 123,
  "iat": 1234567890,
  "exp": 1234999999
}
```

### Security Measures

| Layer | Protection | Implementation |
|-------|-----------|----------------|
| **API** | Authentication | JWT tokens |
| **API** | Authorization | User-specific queries |
| **API** | Rate limiting | (TODO) |
| **Database** | SQL injection | Parameterized queries |
| **Database** | Access control | Row-level user_id checks |
| **Secrets** | Environment vars | .env files (not committed) |
| **CORS** | Origin check | Whitelist in middleware |

### Data Privacy

- Users can only access their own documents
- Queries always include `WHERE user_id = $1`
- No cross-user data leakage
- API keys stored in environment (not database)

---

## Database Schema

### Entity Relationship Diagram

```
users (1) ──────────── (*) documents
  │                           │
  │                           │
  │                      (*) chunks
  │                           │
  │                      (embedding vector)
  │
  └── (*) conversations
          │
          └── (*) messages
```

### Key Tables

**users**
```sql
- id (PK)
- email (unique)
- password_hash
- role
- created_at
```

**documents**
```sql
- id (PK)
- user_id (FK)
- filename
- file_path
- subject, year (metadata)
- uploaded_at
```

**chunks**
```sql
- id (PK)
- document_id (FK)
- video_id (FK)
- content (TEXT)
- embedding (VECTOR(1536))
- chunk_index
- metadata (JSONB)
```

**Vector Index:**
```sql
CREATE INDEX chunks_embedding_idx 
ON chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

---

## Performance Considerations

### Vector Search Optimization

1. **IVFFlat Index**
   - Clusters vectors into 100 lists
   - Approximate nearest neighbor search
   - Trade accuracy for speed

2. **Batch Insertions**
   - Use `execute_values()` for bulk insert
   - Reduces database round-trips

3. **Connection Pooling**
   - pg.Pool for Node.js
   - psycopg2 connection reuse

### Caching Strategies (Future)

```
┌─────────────┐
│ Redis Cache │ ← Frequent queries
└─────────────┘
       │
       ▼
┌─────────────┐
│  pgvector   │ ← All vectors
└─────────────┘
```

---

## Extensibility

### Adding a New Chunking Strategy

1. **Create new chunker:**
```python
# chunking/my_custom_chunker.py
from .base_chunker import BaseChunker, Chunk

class MyCustomChunker(BaseChunker):
    def chunk(self, text: str) -> List[Chunk]:
        # Your implementation
        pass
        
    def get_name(self) -> str:
        return "my_custom"
        
    def get_description(self) -> str:
        return "My custom chunking strategy"
```

2. **Register in factory:**
```python
# chunking/chunking_factory.py
ChunkingFactory.register('my_custom', MyCustomChunker)
```

3. **Done!** Now available via API

### Adding a New LLM Provider (Future)

Similar pattern:
```python
# llms/my_llm.py
from .base_llm import BaseLLM

class MyLLM(BaseLLM):
    def generate(self, prompt: str) -> str:
        # Implementation
        pass

# llms/llm_factory.py
LLMFactory.register('my_llm', MyLLM)
```

---

## Monitoring & Logging

### Current Logging

```python
# Python service
print(f"Indexing document {doc_id}")
print(f"Created {len(chunks)} chunks")
print(f"Answer generated successfully")

# Node service
console.log(`User ${userId} asking: ${question}`)
console.error('Login error:', error)
```

### Future: Structured Logging

```python
import structlog

logger = structlog.get_logger()
logger.info("document.indexed", 
    document_id=doc_id,
    chunks=len(chunks),
    strategy="fixed_size"
)
```

---

## Testing Strategy

### Unit Tests (Future)

```python
# test_chunking.py
def test_fixed_size_chunker():
    chunker = FixedSizeChunker(chunk_size=100)
    chunks = chunker.chunk("..." * 1000)
    assert len(chunks) > 0
    assert all(len(c.content.split()) <= 100 for c in chunks)
```

### Integration Tests (Future)

```typescript
// test_api.ts
describe('Document Upload', () => {
    it('should index document successfully', async () => {
        const response = await uploadDocument(testPDF);
        expect(response.status).toBe(200);
        expect(response.data.chunks_created).toBeGreaterThan(0);
    });
});
```

---

## Deployment Architecture (Future)

```
                    ┌─────────────┐
                    │   Nginx     │ ← SSL termination
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
        ┌───▼───┐      ┌───▼───┐    ┌────▼────┐
        │ React │      │ Node  │    │ Python  │
        │  App  │      │Backend│    │ Service │
        └───────┘      └───┬───┘    └────┬────┘
                           │              │
                       ┌───▼──────────────▼───┐
                       │   PostgreSQL          │
                       │   + pgvector          │
                       └──────────────────────┘
```

---

**This architecture is designed to be:**
- ✅ Scalable (can add more services)
- ✅ Maintainable (clear separation)
- ✅ Extensible (factory patterns)
- ✅ Testable (modular design)
- ✅ Production-ready (security, error handling)
