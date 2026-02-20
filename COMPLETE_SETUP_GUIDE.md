# 🚀 Complete Platform Setup Guide - All Phases (1-7)

## Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+ with pgvector
- Git

## Step 1: Extract the Platform

```bash
# Extract the zip file
unzip edu-platform-phase-7-FINAL-COMPLETE.zip
cd edu-platform
```

## Step 2: Database Setup

Since Phase 1 worked, your database is already set up! But let's add the new tables:

```bash
# Connect to your database
psql edu_platform

# Run the updated schema (adds Phase 4 tables)
\i database/schema.sql

# Or if you prefer:
psql edu_platform -f database/schema.sql
```

**New tables added:**
- `tenants` (Phase 4)
- `usage_logs` (Phase 4)
- `api_keys` (Phase 4)
- `audit_logs` (Phase 4)
- `invitations` (Phase 4)

## Step 3: Update Python Environment

```bash
cd ai-service

# Activate your existing virtual environment
source venv/bin/activate

# Install NEW Phase 2-7 dependencies
pip install yt-dlp==2023.12.30
pip install moviepy==1.0.3
pip install pydub==0.25.1
pip install whisper==1.1.10
pip install openai-whisper==20231117
pip install pdfplumber==0.10.3
pip install pymupdf==1.23.8

# Phase 5: Embeddings
pip install sentence-transformers==2.3.1
pip install transformers==4.36.2
pip install torch==2.1.2
pip install fastembed==0.2.2

# Phase 6: Vector Stores
pip install chromadb==0.4.22
pip install qdrant-client==1.7.0

# Phase 7: LLMs
pip install anthropic==0.18.1
pip install google-generativeai==0.3.2
pip install together==1.0.1

# Or install everything at once:
pip install -r requirements.txt --upgrade
```

## Step 4: Update Environment Variables

Edit `ai-service/.env`:

```env
# Existing (from Phase 1)
OPENAI_API_KEY=your-openai-key-here
GROQ_API_KEY=your-groq-key-here
DATABASE_URL=postgresql://user:password@localhost/edu_platform

# Phase 5: Embeddings (optional)
COHERE_API_KEY=your-cohere-key-here

# Phase 7: LLMs (optional - use what you want)
ANTHROPIC_API_KEY=your-anthropic-key-here
GOOGLE_API_KEY=your-google-key-here
TOGETHER_API_KEY=your-together-key-here
```

**Which API keys do you need?**
- **Required:** None! The platform works with what you have from Phase 1
- **Recommended:** Keep your existing OpenAI and Groq keys
- **Optional:** Add Anthropic (Claude), Google (Gemini), Cohere for more options

## Step 5: Start the Services

### Terminal 1 - Python AI Service (Port 8000)
```bash
cd ai-service
source venv/bin/activate
python main.py
```

You should see:
```
✅ OpenAI client initialized
✅ Groq client initialized
✅ Quiz generator initialized
✅ Analytics and tenant manager initialized
Starting server on http://0.0.0.0:8000
```

### Terminal 2 - Node.js Backend (Port 3000)
```bash
cd backend
npm run dev
```

You should see:
```
✅ Backend server running on http://localhost:3000
✅ AI Service URL: http://localhost:8000
```

### Terminal 3 - React Frontend (Port 3001)
```bash
cd frontend
npm start
```

Browser should open at `http://localhost:3001`

## Step 6: Test Each Phase

### Phase 1 ✅ (Already Working)
- Login/signup
- Upload PDF
- Chat with document

### Phase 2: Test YouTube Ingestion
```bash
# Upload a YouTube video (example)
curl -X POST http://localhost:3000/videos/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "Test Video",
    "subject": "Music",
    "year": 2024,
    "provider": "groq",
    "chunking_strategy": "time_based"
  }'
```

### Phase 3: Test Quiz Generation
```bash
# Generate a quiz from a document
curl -X POST http://localhost:3000/quiz/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "document_ids": [1],
    "question_count": 5,
    "difficulty": "medium",
    "question_types": ["multiple_choice", "true_false"],
    "provider": "groq"
  }'
```

### Phase 4: Test Analytics
```bash
# Get analytics overview
curl http://localhost:3000/admin/analytics/overview/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Phase 5: Test Embeddings
```bash
# List available embedding models
curl http://localhost:3000/embeddings/models \
  -H "Authorization: Bearer YOUR_TOKEN"

# Compare embedding models
curl -X POST http://localhost:3000/embeddings/compare \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "text": "This is a test",
    "models": ["minilm", "bge"]
  }'
```

### Phase 6: Test Vector Stores
```bash
# List available vector stores
curl http://localhost:3000/vector-stores/list \
  -H "Authorization: Bearer YOUR_TOKEN"

# Compare vector stores
curl -X POST http://localhost:3000/vector-stores/compare \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "stores": ["faiss", "chromadb"],
    "dimension": 384,
    "num_vectors": 100
  }'
```

### Phase 7: Test LLM Providers
```bash
# List available LLM providers
curl http://localhost:3000/llms/providers \
  -H "Authorization: Bearer YOUR_TOKEN"

# Compare LLM providers
curl -X POST http://localhost:3000/llms/compare \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "providers": ["groq", "openai"],
    "prompt": "What is machine learning?"
  }'
```

## Common Issues & Solutions

### Issue 1: Import Errors in Python
```bash
# Solution: Reinstall requirements
cd ai-service
source venv/bin/activate
pip install -r requirements.txt --force-reinstall
```

### Issue 2: "Module not found" errors
```bash
# Make sure you're in the right directory
cd ai-service
python main.py  # Not from parent directory
```

### Issue 3: Database connection errors
```bash
# Check database is running
psql edu_platform -c "SELECT 1"

# Check DATABASE_URL in .env matches your setup
cat .env | grep DATABASE_URL
```

### Issue 4: Port already in use
```bash
# Find and kill process on port 8000
lsof -ti:8000 | xargs kill -9

# Or use different port
python main.py --port 8001
```

### Issue 5: Whisper model download (Phase 2)
First time you use YouTube ingestion, Whisper will download ~140MB model:
```
Downloading Whisper model...
This may take a few minutes on first run.
```
This is normal! Just wait.

### Issue 6: Missing API keys
If you see errors about missing API keys, that's OK! The platform works with just OpenAI and Groq. Other providers are optional.

## Minimal Setup (If you want to start simple)

You can run with JUST your existing Phase 1 setup:
- OpenAI API key OR Groq API key
- No other API keys needed!

The new features will work with what you have:
- **Phase 2:** Uses Whisper (local, no API key)
- **Phase 3:** Uses your existing LLM (Groq or OpenAI)
- **Phase 4:** No API keys needed
- **Phase 5:** MiniLM, BGE, FastEmbed are local (no API key)
- **Phase 6:** FAISS, ChromaDB, Qdrant-memory are local (no API key)
- **Phase 7:** You already have Groq and/or OpenAI

## Testing the Complete Platform

### 1. Upload a Document with Advanced Settings
```bash
# Upload with specific embedding and provider
curl -X POST http://localhost:3000/documents/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test.pdf" \
  -F "provider=groq" \
  -F "embedding_model=minilm" \
  -F "chunking_strategy=semantic"
```

### 2. Upload a YouTube Video
```bash
# This will transcribe the video automatically!
curl -X POST http://localhost:3000/videos/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "youtube_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "title": "Educational Video",
    "subject": "Science",
    "provider": "groq"
  }'
```

### 3. Generate and Take a Quiz
```bash
# Generate quiz
curl -X POST http://localhost:3000/assessments/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test Quiz",
    "document_ids": [1],
    "question_count": 5,
    "difficulty": "medium"
  }'

# Submit answers (will auto-grade!)
curl -X POST http://localhost:3000/assessments/1/submit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "answers": [
      {"question_id": 1, "answer": "A) First option"},
      {"question_id": 2, "answer": "My detailed answer"}
    ]
  }'
```

## Performance Tips

### Use Groq for Speed (FREE!)
- Groq is 5-10x faster than OpenAI
- Free tier is generous
- Perfect for development and production

### Use Local Embeddings
- MiniLM is fast and free
- BGE is highest quality, still free
- No API costs!

### Use FAISS for Vector Store
- Ultra-fast local search
- No server needed
- Perfect for most use cases

## Recommended Configuration

**For Speed + Free:**
- LLM: Groq
- Embeddings: MiniLM or FastEmbed
- Vector Store: FAISS
- Result: Ultra-fast, completely free!

**For Best Quality:**
- LLM: Claude Opus (if you have API key) or GPT-4
- Embeddings: BGE
- Vector Store: Qdrant
- Result: Highest quality results

**For Balanced:**
- LLM: Groq (speed) or GPT-3.5 (reliable)
- Embeddings: MiniLM
- Vector Store: ChromaDB
- Result: Good balance of everything

## Next Steps

1. **Start with Phase 1 working** (you already have this!)
2. **Add one phase at a time** (test each)
3. **Add API keys as needed** (optional)
4. **Deploy to production** when ready

## Support

Check the documentation files:
- PHASE_2_COMPLETE.md - YouTube & PDF
- PHASE_3_COMPLETE.md - Quizzes
- PHASE_4_COMPLETE.md - Multi-tenant
- PHASE_5_COMPLETE.md - Embeddings
- PHASE_6_COMPLETE.md - Vector Stores
- PHASE_7_COMPLETE.md - LLMs

## You're Ready! 🚀

Your Phase 1 is working, so you're 90% there! Just:
1. Install new dependencies
2. Restart the Python service
3. Everything else keeps working!

The platform is backward compatible - all your Phase 1 stuff still works exactly the same! 🎉
