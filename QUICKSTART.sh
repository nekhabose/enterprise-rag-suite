#!/bin/bash

echo "🚀 EDU Platform - Quick Start Setup"
echo "===================================="
echo ""

# Check if in correct directory
if [ ! -f "database/schema.sql" ]; then
    echo "❌ Error: Please run this script from the edu-platform directory"
    echo "   cd edu-platform"
    echo "   bash QUICKSTART.sh"
    exit 1
fi

echo "📦 Step 1: Installing Python dependencies..."
cd ai-service
source venv/bin/activate 2>/dev/null || python -m venv venv && source venv/bin/activate
pip install -r requirements.txt --quiet
echo "✅ Python dependencies installed"
echo ""

echo "📊 Step 2: Setting up database..."
cd ..
psql edu_platform -f database/schema.sql 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Database updated with new tables"
else
    echo "⚠️  Database update skipped (might already exist)"
fi
echo ""

echo "🔧 Step 3: Checking environment variables..."
if [ ! -f "ai-service/.env" ]; then
    cp ai-service/.env.example ai-service/.env 2>/dev/null
    echo "⚠️  Created .env file - please add your API keys!"
else
    echo "✅ .env file exists"
fi
echo ""

echo "🎯 Step 4: Starting services..."
echo ""
echo "Run these commands in separate terminals:"
echo ""
echo "Terminal 1 (Python AI Service):"
echo "  cd ai-service && source venv/bin/activate && python main.py"
echo ""
echo "Terminal 2 (Node Backend):"
echo "  cd backend && npm run dev"
echo ""
echo "Terminal 3 (React Frontend):"
echo "  cd frontend && npm start"
echo ""
echo "✅ Setup complete!"
echo ""
echo "📖 Read COMPLETE_SETUP_GUIDE.md for detailed instructions"
echo "🎉 Your Phase 1 setup will continue to work!"
