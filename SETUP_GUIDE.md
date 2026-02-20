# 📖 Complete Setup Guide

This guide will walk you through setting up the AI Study Assistant from scratch.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Installation Steps](#installation-steps)
3. [Configuration](#configuration)
4. [Testing](#testing)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Python** 3.10+ ([Download](https://www.python.org/downloads/))
- **PostgreSQL** 14+ ([Download](https://www.postgresql.org/download/))
- **Git** ([Download](https://git-scm.com/downloads))

### API Keys (Choose One or Both)
- **Groq API Key** (FREE) - [Get it here](https://console.groq.com/)
- **OpenAI API Key** (PAID) - [Get it here](https://platform.openai.com/api-keys)

---

## Installation Steps

### Step 1: Install PostgreSQL with pgvector

#### Mac
```bash
brew install postgresql@14
brew install pgvector
brew services start postgresql@14
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install postgresql-14 postgresql-14-pgvector
sudo systemctl start postgresql
```

#### Windows
1. Download PostgreSQL from official website
2. Install pgvector from: https://github.com/pgvector/pgvector/releases

### Step 2: Create Database

```bash
# Create database
createdb edu_platform

# Run schema
cd database
psql edu_platform -f schema.sql

# Verify
psql edu_platform -c "\dt"
# You should see: users, documents, videos, chunks, conversations, etc.
```

### Step 3: Setup Python AI Service

```bash
cd ai-service

# Create virtual environment
python3.10 -m venv venv

# Activate (Mac/Linux)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Edit .env and add your API keys
nano .env  # or use your favorite editor
```

**Required .env content:**
```env
DATABASE_URL=postgresql://localhost:5432/edu_platform
GROQ_API_KEY=gsk_YOUR_KEY_HERE
OPENAI_API_KEY=sk_YOUR_KEY_HERE  # Optional
```

### Step 4: Setup Node.js Backend

```bash
cd ../backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env
nano .env
```

**Required .env content:**
```env
DATABASE_URL=postgresql://localhost:5432/edu_platform
JWT_SECRET=your-super-secret-key-change-in-production
AI_SERVICE_URL=http://localhost:8000
PORT=3000
```

### Step 5: Setup React Frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env
nano .env
```

**Required .env content:**
```env
REACT_APP_API_URL=http://localhost:3000
```

---

## Configuration

### Chunking Strategy Selection

The system supports 7 chunking strategies. Choose based on your content:

| Your Content Type | Recommended Strategy |
|-------------------|---------------------|
| General textbooks | Fixed Size |
| Research papers | Page Based or Semantic |
| Articles/blogs | Paragraph |
| Technical docs | Semantic or Recursive |
| Mixed content | Parent-Child |

### Provider Selection

| Provider | Pros | Cons | Cost |
|----------|------|------|------|
| **Groq** | Very fast, Free | Limited models | FREE |
| **OpenAI** | Best quality | Slower, Costs money | ~$0.002/1K tokens |

---

## Testing

### Test 1: Check All Services

**Terminal 1 - AI Service:**
```bash
cd ai-service
source venv/bin/activate
python main.py
```
Expected output:
```
✅ Groq client initialized
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```
Expected output:
```
✅ Backend server running on http://localhost:3000
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm start
```
Expected output:
```
Compiled successfully!
Local: http://localhost:3001
```

### Test 2: API Health Checks

```bash
# Test AI service
curl http://localhost:8000/
# Should return: {"status": "AI Service Running", ...}

# Test backend
curl http://localhost:3000/
# Should return: {"status": "Backend running!", ...}

# List chunking strategies
curl http://localhost:8000/ai/chunking-strategies
# Should return list of 7 strategies
```

### Test 3: Full Workflow

1. Open browser to http://localhost:3001
2. Click "Sign Up"
3. Create account: `test@example.com` / `password123`
4. Select "Groq" as AI provider
5. Select "Fixed Size" as chunking strategy
6. Upload a PDF document
7. Wait for processing (~30 seconds)
8. Go to "Chat" tab
9. Click "+ New Chat"
10. Ask a question about your document
11. Verify you get an AI response with citations

---

## Troubleshooting

### Issue: "psql: command not found"
**Solution:** PostgreSQL not in PATH.
- Mac: Add to ~/.zshrc: `export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"`
- Windows: Add PostgreSQL bin folder to system PATH

### Issue: "pgvector extension not found"
**Solution:** pgvector not installed.
```bash
# Mac
brew install pgvector

# Then in psql:
CREATE EXTENSION IF NOT EXISTS vector;
```

### Issue: Python service fails to start
**Common causes:**
1. **Wrong Python version** - Need 3.10+
   ```bash
   python3 --version
   ```
2. **Missing dependencies**
   ```bash
   pip install -r requirements.txt
   ```
3. **Invalid API key**
   - Check .env file has correct keys
   - Keys should start with `gsk_` (Groq) or `sk-` (OpenAI)

### Issue: "Failed to index document"
**Common causes:**
1. **OpenAI key not configured**
   - If using OpenAI embeddings, need valid key
   - Switch to Groq to avoid this
2. **PDF extraction failed**
   - File might be corrupted
   - Try a different PDF
3. **Database connection failed**
   - Check PostgreSQL is running
   - Verify DATABASE_URL in .env

### Issue: Frontend won't connect to backend
**Solution:** Check CORS and URLs
1. Backend .env should have correct AI_SERVICE_URL
2. Frontend .env should have correct REACT_APP_API_URL
3. Restart all services after changing .env

### Issue: "Out of memory" when processing large PDFs
**Solution:** 
1. Use "Page Based" chunking instead of "Fixed Size"
2. Increase Node.js memory:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run dev
   ```

---

## Advanced Configuration

### Custom Chunking Parameters

When uploading documents, you can pass custom parameters:

```javascript
// Fixed Size with custom params
{
  chunking_strategy: "fixed_size",
  chunking_params: {
    chunk_size: 1000,  // words
    overlap: 100       // words
  }
}

// Semantic with custom params
{
  chunking_strategy: "semantic",
  chunking_params: {
    max_chunk_size: 1500,
    look_for_headers: true
  }
}
```

### Database Tuning

For better performance with large datasets:

```sql
-- Increase work_mem for vector operations
ALTER SYSTEM SET work_mem = '256MB';

-- Increase maintenance_work_mem for index creation
ALTER SYSTEM SET maintenance_work_mem = '1GB';

-- Reload configuration
SELECT pg_reload_conf();
```

---

## Next Steps

Once everything is working:

1. **Explore Features**
   - Try different chunking strategies
   - Compare OpenAI vs Groq responses
   - Upload various document types

2. **Customize**
   - Modify chunking parameters
   - Adjust UI styling
   - Add new document types

3. **Deploy**
   - See DEPLOYMENT.md for Azure instructions
   - Set up CI/CD pipeline
   - Configure production environment

---

## Getting Help

- **GitHub Issues**: For bugs and feature requests
- **Documentation**: Check README.md for API details
- **Logs**: Check terminal outputs for detailed errors

**Happy learning! 🚀**
