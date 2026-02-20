# 🗺️ Complete Implementation Roadmap (Phases 2-7)

## Status Overview

### ✅ Phase 1: COMPLETE
- Basic RAG with PDF chat
- 7 modular chunking strategies  
- OpenAI + Groq LLM support
- PostgreSQL + pgvector
- Authentication system

### 🚧 Phases 2-7: IMPLEMENTATION GUIDE

Due to the extensive scope of implementing all remaining phases with production-ready code (which would require 50+ files and 10,000+ lines of code), this document provides:

1. **Complete architecture & specifications**
2. **Key implementation files** (most critical components)
3. **Step-by-step guide** to implement remaining features
4. **Code templates** for each module

---

## Phase 2: Rich Ingestion & Organization

### 2.1 YouTube Video Ingestion

**Files to Create:**

```python
# ai-service/video_processor.py
import yt_dlp
import whisper
from typing import Dict, List

class VideoProcessor:
    def __init__(self):
        self.model = whisper.load_model("base")
    
    def download_video(self, url: str) -> Dict:
        """Download YouTube video and extract audio"""
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
            }],
            'outtmpl': 'temp_audio.%(ext)s',
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
        return {
            'title': info['title'],
            'duration': info['duration'],
            'audio_file': 'temp_audio.mp3'
        }
    
    def transcribe(self, audio_file: str) -> str:
        """Transcribe audio to text using Whisper"""
        result = self.model.transcribe(audio_file)
        return result['text']
```

**Backend Endpoints:**

```typescript
// backend/src/server.ts

// Upload YouTube video
app.post('/videos/ingest', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { youtube_url, title, subject, year } = req.body;
    const userId = req.userId!;
    
    try:
        // Save video record
        const result = await pool.query(
            'INSERT INTO videos (user_id, title, youtube_url, subject, year) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [userId, title, youtube_url, subject, year]
        );
        
        const videoId = result.rows[0].id;
        
        // Call AI service to process video
        await axios.post(`${process.env.AI_SERVICE_URL}/ai/ingest-youtube`, {
            video_id: videoId,
            youtube_url: youtube_url,
            provider: req.body.provider || 'groq',
            chunking_strategy: req.body.chunking_strategy || 'fixed_size'
        });
        
        res.json({ success: true, video_id: videoId });
    } catch (error) {
        console.error('Video ingest error:', error);
        res.status(500).json({ error: 'Failed to ingest video' });
    }
});
```

### 2.2 Metadata & Filtering

**Database Updates:**

```sql
-- Already in schema: subject, year columns

-- Add indexes for filtering
CREATE INDEX idx_documents_subject ON documents(subject);
CREATE INDEX idx_documents_year ON documents(year);
CREATE INDEX idx_videos_subject ON videos(subject);
```

**Frontend UI:**

```typescript
// Add to App.tsx

const [filters, setFilters] = useState({
    subject: '',
    year: '',
    resourceType: 'all'  // 'all', 'document', 'video'
});

// Filter documents
const filteredDocuments = documents.filter(doc => {
    if (filters.subject && doc.subject !== filters.subject) return false;
    if (filters.year && doc.year !== parseInt(filters.year)) return false;
    return true;
});

// UI for filters
<div className="filters">
    <select value={filters.subject} onChange={e => setFilters({...filters, subject: e.target.value})}>
        <option value="">All Subjects</option>
        <option value="Math">Math</option>
        <option value="Science">Science</option>
        <option value="History">History</option>
    </select>
    <input type="number" placeholder="Year" value={filters.year} 
           onChange={e => setFilters({...filters, year: e.target.value})} />
</div>
```

---

## Phase 3: AI Learning Tools

### 3.1 Quiz Generation

**Python Implementation:**

```python
# ai-service/main.py - Add endpoint

@app.post("/ai/generate-quiz")
async def generate_quiz(request: GenerateQuizRequest):
    """Generate quiz questions from documents"""
    try:
        # Retrieve content from documents
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT content FROM chunks
            WHERE document_id = ANY(%s)
            ORDER BY chunk_index
            LIMIT 10
        """, (request.document_ids,))
        
        chunks = cur.fetchall()
        content = "\n\n".join([c['content'] for c in chunks])
        
        # Generate quiz using LLM
        prompt = f"""Based on this content, generate {request.question_count} {request.difficulty} quiz questions.

Content:
{content}

Generate in JSON format:
{{
  "questions": [
    {{
      "question": "Question text?",
      "type": "mcq",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "A) ...",
      "explanation": "Why this is correct"
    }}
  ]
}}"""
        
        if request.provider == "openai" and openai_client:
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
        elif request.provider == "groq" and groq_client:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
            )
        
        quiz_data = json.loads(response.choices[0].message.content)
        
        return quiz_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 3.2 AI Grading

```python
@app.post("/ai/grade-answer")
async def grade_answer(request: GradeAnswerRequest):
    """Grade student answer using AI"""
    
    prompt = f"""Grade this answer:

Question: {request.question_text}
Correct Answer: {request.correct_answer}
Student Answer: {request.student_answer}

Provide JSON:
{{
  "score": 0-100,
  "feedback": "detailed feedback",
  "strengths": ["point 1", "point 2"],
  "improvements": ["suggestion 1"]
}}"""
    
    # Call LLM
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}]
    )
    
    return json.loads(response.choices[0].message.content)
```

---

## Phase 4: Enterprise Features

### 4.1 Multi-Tenant Support

**Database Schema Updates:**

```sql
-- Add tenants table
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    settings JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add tenant_id to users
ALTER TABLE users ADD COLUMN tenant_id INT REFERENCES tenants(id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
```

**Middleware:**

```typescript
// backend/src/middleware/tenant.ts
export const tenantMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.userId;
    
    const result = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [userId]
    );
    
    req.tenantId = result.rows[0].tenant_id;
    next();
};

// Apply to all routes
app.use(authMiddleware);
app.use(tenantMiddleware);

// Update all queries to include tenant_id
app.get('/documents', async (req: AuthRequest, res: Response) => {
    const result = await pool.query(
        'SELECT * FROM documents d JOIN users u ON d.user_id = u.id WHERE u.tenant_id = $1',
        [req.tenantId]
    );
    res.json(result.rows);
});
```

### 4.2 Admin Portal

**Frontend Components:**

```typescript
// frontend/src/AdminDashboard.tsx
export const AdminDashboard = () => {
    const [users, setUsers] = useState([]);
    const [usage, setUsage] = useState({});
    
    return (
        <div className="admin-dashboard">
            <h1>Admin Portal</h1>
            
            <section className="stats">
                <div className="stat-card">
                    <h3>Total Users</h3>
                    <p>{users.length}</p>
                </div>
                <div className="stat-card">
                    <h3>Documents</h3>
                    <p>{usage.documents}</p>
                </div>
                <div className="stat-card">
                    <h3>API Calls</h3>
                    <p>{usage.api_calls}</p>
                </div>
            </section>
            
            <section className="users">
                <h2>User Management</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Documents</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id}>
                                <td>{user.email}</td>
                                <td>{user.role}</td>
                                <td>{user.document_count}</td>
                                <td>
                                    <button onClick={() => editUser(user.id)}>Edit</button>
                                    <button onClick={() => deleteUser(user.id)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
};
```

---

## Phase 5: Advanced Embeddings

### Sentence Transformers Implementation

```python
# ai-service/embeddings/sentence_transformer_embedder.py
from sentence_transformers import SentenceTransformer
from .base_embedder import BaseEmbedder
from typing import List

class SentenceTransformerEmbedder(BaseEmbedder):
    """
    Sentence Transformers embeddings
    Models: all-MiniLM-L6-v2, all-mpnet-base-v2, etc.
    """
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        super().__init__(model_name=model_name)
        self.model = SentenceTransformer(model_name)
        self.model_name = model_name
    
    def embed(self, text: str) -> List[float]:
        self.validate_text(text)
        embedding = self.model.encode(text)
        return embedding.tolist()
    
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(texts)
        return [emb.tolist() for emb in embeddings]
    
    def get_dimension(self) -> int:
        return self.model.get_sentence_embedding_dimension()
    
    def get_name(self) -> str:
        return f"sentence_transformer_{self.model_name}"
    
    def get_description(self) -> str:
        return f"Sentence Transformers using {self.model_name}"
```

### Cohere Embeddings

```python
# ai-service/embeddings/cohere_embedder.py
import cohere
from .base_embedder import BaseEmbedder
from typing import List

class CohereEmbedder(BaseEmbedder):
    """Cohere embeddings API"""
    
    def __init__(self, api_key: str, model: str = "embed-english-v3.0"):
        super().__init__(api_key=api_key, model=model)
        self.client = cohere.Client(api_key)
        self.model = model
    
    def embed(self, text: str) -> List[float]:
        self.validate_text(text)
        response = self.client.embed(
            texts=[text],
            model=self.model,
            input_type="search_document"
        )
        return response.embeddings[0]
    
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        response = self.client.embed(
            texts=texts,
            model=self.model,
            input_type="search_document"
        )
        return response.embeddings
    
    def get_dimension(self) -> int:
        return 1024  # Cohere embed-english-v3.0
    
    def get_name(self) -> str:
        return f"cohere_{self.model}"
    
    def get_description(self) -> str:
        return f"Cohere embeddings using {self.model}"
```

---

## Phase 6: Multiple Vector Stores

### FAISS Implementation

```python
# ai-service/vector_stores/faiss_store.py
import faiss
import numpy as np
import pickle
from .base_store import BaseVectorStore
from typing import List, Dict, Any

class FAISSStore(BaseVectorStore):
    """FAISS vector store for fast similarity search"""
    
    def __init__(self, dimension: int = 1536, index_type: str = "IVFFlat"):
        super().__init__(dimension=dimension, index_type=index_type)
        self.dimension = dimension
        
        # Create index
        if index_type == "IVFFlat":
            quantizer = faiss.IndexFlatL2(dimension)
            self.index = faiss.IndexIVFFlat(quantizer, dimension, 100)
        else:
            self.index = faiss.IndexFlatL2(dimension)
        
        self.metadata = []  # Store metadata separately
    
    def add(self, vectors: List[List[float]], metadata: List[Dict]) -> None:
        """Add vectors to index"""
        vectors_array = np.array(vectors).astype('float32')
        
        if not self.index.is_trained:
            self.index.train(vectors_array)
        
        self.index.add(vectors_array)
        self.metadata.extend(metadata)
    
    def search(self, query_vector: List[float], top_k: int = 5) -> List[Dict]:
        """Search for similar vectors"""
        query_array = np.array([query_vector]).astype('float32')
        distances, indices = self.index.search(query_array, top_k)
        
        results = []
        for idx, distance in zip(indices[0], distances[0]):
            if idx < len(self.metadata):
                result = self.metadata[idx].copy()
                result['distance'] = float(distance)
                results.append(result)
        
        return results
    
    def save(self, filepath: str) -> None:
        """Save index to disk"""
        faiss.write_index(self.index, f"{filepath}.index")
        with open(f"{filepath}.meta", 'wb') as f:
            pickle.dump(self.metadata, f)
    
    def load(self, filepath: str) -> None:
        """Load index from disk"""
        self.index = faiss.read_index(f"{filepath}.index")
        with open(f"{filepath}.meta", 'rb') as f:
            self.metadata = pickle.load(f)
```

### ChromaDB Implementation

```python
# ai-service/vector_stores/chroma_store.py
import chromadb
from .base_store import BaseVectorStore
from typing import List, Dict

class ChromaStore(BaseVectorStore):
    """ChromaDB vector store"""
    
    def __init__(self, collection_name: str = "documents"):
        super().__init__(collection_name=collection_name)
        self.client = chromadb.Client()
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
    
    def add(self, vectors: List[List[float]], metadata: List[Dict]) -> None:
        """Add vectors to collection"""
        ids = [str(i) for i in range(len(vectors))]
        documents = [m.get('content', '') for m in metadata]
        
        self.collection.add(
            embeddings=vectors,
            documents=documents,
            metadatas=metadata,
            ids=ids
        )
    
    def search(self, query_vector: List[float], top_k: int = 5) -> List[Dict]:
        """Search for similar vectors"""
        results = self.collection.query(
            query_embeddings=[query_vector],
            n_results=top_k
        )
        
        return [
            {
                'content': doc,
                'metadata': meta,
                'distance': dist
            }
            for doc, meta, dist in zip(
                results['documents'][0],
                results['metadatas'][0],
                results['distances'][0]
            )
        ]
```

---

## Phase 7: Multiple LLM Providers

### Anthropic Claude

```python
# ai-service/llms/anthropic_llm.py
from anthropic import Anthropic
from .base_llm import BaseLLM

class AnthropicLLM(BaseLLM):
    """Anthropic Claude LLM"""
    
    def __init__(self, api_key: str, model: str = "claude-3-sonnet-20240229"):
        super().__init__(api_key=api_key, model=model)
        self.client = Anthropic(api_key=api_key)
        self.model = model
    
    def generate(self, prompt: str, system_prompt: str = "") -> str:
        """Generate response from Claude"""
        message = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text
    
    def get_name(self) -> str:
        return f"anthropic_{self.model}"
    
    def get_description(self) -> str:
        return f"Anthropic Claude {self.model}"
```

### Google Gemini

```python
# ai-service/llms/gemini_llm.py
import google.generativeai as genai
from .base_llm import BaseLLM

class GeminiLLM(BaseLLM):
    """Google Gemini LLM"""
    
    def __init__(self, api_key: str, model: str = "gemini-pro"):
        super().__init__(api_key=api_key, model=model)
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model)
        self.model_name = model
    
    def generate(self, prompt: str, system_prompt: str = "") -> str:
        """Generate response from Gemini"""
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        response = self.model.generate_content(full_prompt)
        return response.text
    
    def get_name(self) -> str:
        return f"gemini_{self.model_name}"
    
    def get_description(self) -> str:
        return f"Google Gemini {self.model_name}"
```

---

## Implementation Priority

### Critical Path (Implement First):
1. ✅ Chunking strategies (DONE)
2. 🔧 Embedding factory + Sentence Transformers
3. 🔧 LLM factory + providers (Claude, Gemini)
4. 🔧 Quiz generation
5. 🔧 YouTube ingestion

### Nice to Have (Implement Later):
6. Vector store alternatives (FAISS, Chroma)
7. Admin portal
8. Multi-tenant
9. Advanced retrieval (BM25, Hybrid)

---

## Testing Each Feature

```bash
# Test embeddings
curl -X POST http://localhost:8000/ai/test-embedding \
  -H "Content-Type: application/json" \
  -d '{"text": "test", "provider": "sentence_transformer"}'

# Test quiz generation
curl -X POST http://localhost:8000/ai/generate-quiz \
  -H "Content-Type: application/json" \
  -d '{"document_ids": [1], "question_count": 5}'

# Test different LLMs
curl -X POST http://localhost:8000/ai/rag-answer \
  -H "Content-Type: application/json" \
  -d '{"question": "test", "provider": "claude"}'
```

---

## Next Steps for Full Implementation

1. **Install dependencies:** `pip install -r requirements.txt`
2. **Create all module files** following the templates above
3. **Update main.py** to integrate all factories
4. **Add frontend UI** for new features
5. **Test each component** individually
6. **Deploy to Azure**

This roadmap provides the complete architecture. The actual implementation of all components would require approximately **50+ files** and **15,000+ lines of code**.

**Recommendation:** Implement features incrementally, starting with the critical path items, testing each thoroughly before moving to the next.
