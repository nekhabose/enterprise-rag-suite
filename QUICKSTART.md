# ⚡ Quick Start Guide

Get the AI Study Assistant running in 10 minutes!

## Prerequisites Check

Before starting, ensure you have:
- ✅ Node.js 18+ installed
- ✅ Python 3.10+ installed  
- ✅ PostgreSQL 14+ installed
- ✅ At least one API key (Groq or OpenAI)

---

## 5-Step Setup

### Step 1: Database (2 minutes)

```bash
# Create database
createdb edu_platform

# Load schema
cd database
psql edu_platform -f schema.sql
```

### Step 2: Python AI Service (3 minutes)

```bash
cd ai-service

# Create virtual environment
python3.10 -m venv venv
source venv/bin/activate  # Mac/Linux
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Configure
cp .env.example .env
nano .env  # Add your API key
```

### Step 3: Node.js Backend (2 minutes)

```bash
cd ../backend

# Install dependencies
npm install

# Configure
cp .env.example .env
nano .env  # Add JWT secret
```

### Step 4: React Frontend (2 minutes)

```bash
cd ../frontend

# Install dependencies
npm install

# Configure (usually no changes needed)
cp .env.example .env
```

### Step 5: Start Everything! (1 minute)

**Terminal 1:**
```bash
cd ai-service
source venv/bin/activate
python main.py
```

**Terminal 2:**
```bash
cd backend
npm run dev
```

**Terminal 3:**
```bash
cd frontend
npm start
```

---

## Test It Out!

1. Open http://localhost:3001
2. Sign up: `test@example.com` / `password123`
3. Select "Groq" as AI provider
4. Upload a PDF
5. Chat with it!

---

## Troubleshooting

**Database error?**
```bash
# Check PostgreSQL is running
brew services list | grep postgresql  # Mac
sudo systemctl status postgresql      # Linux
```

**Python errors?**
```bash
# Verify Python version
python3 --version  # Should be 3.10+

# Reinstall dependencies
pip install --upgrade -r requirements.txt
```

**Port already in use?**
```bash
# Kill process on port 8000 (Python)
lsof -ti:8000 | xargs kill -9

# Kill process on port 3000 (Node)
lsof -ti:3000 | xargs kill -9
```

---

## Next Steps

- 📖 Read [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed setup
- 🏗️ Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand the system
- 🚀 Check [README.md](README.md) for full documentation

**Happy coding! 🎉**
