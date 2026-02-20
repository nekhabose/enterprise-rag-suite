from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import execute_values, RealDictCursor
import PyPDF2
import os
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

# Phase 2 imports
from video_processor import video_processor
from pdf_processor import pdf_processor

# Phase 3 imports
from quiz_generator import initialize_quiz_generator, quiz_generator

# Phase 4 imports
from analytics import initialize_analytics, analytics_engine
from tenant_manager import initialize_tenant_manager, tenant_manager

# Phase 5 imports
from embeddings import EmbeddingFactory

# Phase 6 imports
from vector_stores import VectorStoreFactory

# Phase 7 imports
from llms import LLMFactory

load_dotenv()

app = FastAPI()

# Allow requests from React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
COHERE_API_KEY = os.getenv("COHERE_API_KEY")  # Phase 5
# Phase 7: Additional LLM API keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# Initialize clients (only if keys are provided)
openai_client = None
groq_client = None

if OPENAI_API_KEY and OPENAI_API_KEY != "your-key-here":
    try:
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        print("✅ OpenAI client initialized")
    except Exception as e:
        print(f"⚠️  OpenAI client failed: {e}")

if GROQ_API_KEY and GROQ_API_KEY != "your-key-here":
    try:
        from groq import Groq
        groq_client = Groq(api_key=GROQ_API_KEY)
        print("✅ Groq client initialized")
    except Exception as e:
        print(f"⚠️  Groq client failed: {e}")

# Phase 3: Initialize quiz generator
initialize_quiz_generator(openai_client, groq_client)
print("✅ Quiz generator initialized")

# Phase 4: Initialize analytics and tenant manager
initialize_analytics(DATABASE_URL)
initialize_tenant_manager(DATABASE_URL)
print("✅ Analytics and tenant manager initialized")

# Phase 5: Initialize embedding factory with available clients
if openai_client:
    EmbeddingFactory.set_client('openai', openai_client)
if groq_client:
    EmbeddingFactory.set_client('groq', groq_client)
print("✅ Embedding factory initialized with available providers")

# Database helper
def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

# ============ REQUEST MODELS ============
class IndexDocumentRequest(BaseModel):
    document_id: int
    file_path: str
    provider: str = "groq"
    chunking_strategy: str = "fixed_size"
    chunking_params: dict = {}
    pdf_mode: str = "standard"  # Phase 2: standard, academic, advanced

class RAGAnswerRequest(BaseModel):
    user_id: int
    question: str
    document_ids: Optional[List[int]] = None
    provider: str = "groq"

# Phase 2: YouTube Video Ingestion
class IngestYouTubeRequest(BaseModel):
    video_id: int
    youtube_url: str
    provider: str = "groq"
    chunking_strategy: str = "fixed_size"
    chunking_params: dict = {}

# Phase 2: Get Video Info
class VideoInfoRequest(BaseModel):
    youtube_url: str

# Phase 3: Quiz Generation
class GenerateQuizRequest(BaseModel):
    document_ids: Optional[List[int]] = None
    video_ids: Optional[List[int]] = None
    question_count: int = 5
    difficulty: str = "medium"  # easy, medium, hard
    question_types: List[str] = ["multiple_choice", "true_false", "short_answer"]
    provider: str = "groq"

class GradeAnswerRequest(BaseModel):
    question_id: int
    student_answer: str
    provider: str = "groq"

class CreateAssessmentRequest(BaseModel):
    title: str
    document_ids: Optional[List[int]] = None
    video_ids: Optional[List[int]] = None
    question_count: int = 10
    difficulty: str = "medium"
    question_types: List[str] = ["multiple_choice"]
    provider: str = "groq"

class SubmitAssessmentRequest(BaseModel):
    assessment_id: int
    answers: List[Dict[str, Any]]  # [{"question_id": 1, "answer": "..."}]

# Phase 4: Admin & Multi-tenant
class CreateTenantRequest(BaseModel):
    name: str
    domain: str
    plan: str = "free"
    max_users: int = 10
    max_storage_gb: int = 5

class UpdateTenantRequest(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    is_active: Optional[bool] = None

class InviteUserRequest(BaseModel):
    tenant_id: int
    email: str
    role: str = "member"
    invited_by_user_id: int  # "openai" or "groq"

# ============ HELPER FUNCTIONS ============

def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file"""
    try:
        with open(file_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
        return text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting PDF: {str(e)}")

from chunking import ChunkingFactory, Chunk

def chunk_text_with_strategy(
    text: str,
    strategy: str = "fixed_size",
    **strategy_params
) -> List[Chunk]:
    """
    Chunk text using specified strategy
    
    Args:
        text: Input text
        strategy: Chunking strategy name
        **strategy_params: Strategy-specific parameters
    
    Returns:
        List of Chunk objects
    """
    chunker = ChunkingFactory.create(strategy, **strategy_params)
    return chunker.chunk(text)

def simple_text_embedding(text: str) -> List[float]:
    """
    Simple embedding using character frequencies (for Groq)
    Creates a 1536-dimensional vector
    """
    embedding = [0.0] * 1536
    
    # Use character frequencies and positions
    text_lower = text.lower()
    for i, char in enumerate(text_lower[:1536]):
        embedding[i] = ord(char) / 128.0
    
    # Add word-level features
    words = text_lower.split()[:100]
    for i, word in enumerate(words):
        if i < 100:
            embedding[1436 + i] = len(word) / 20.0
    
    # Normalize
    magnitude = sum(x*x for x in embedding) ** 0.5
    if magnitude > 0:
        embedding = [x / magnitude for x in embedding]
    
    return embedding

def get_embedding(
    text: str, 
    provider: str = "groq",
    model: str = None,
    **kwargs
) -> List[float]:
    """
    Get embedding using specified provider (Phase 5 enhanced)
    
    Args:
        text: Text to embed
        provider: Embedding provider (openai, sentence_transformer, cohere, etc.)
        model: Specific model name (optional)
        **kwargs: Additional parameters for embedder
        
    Returns:
        Embedding vector
    """
    try:
        # Phase 5: Use embedding factory for all providers
        if provider in ['sentence_transformer', 'cohere', 'huggingface', 'instructor', 'voyage']:
            embedder = EmbeddingFactory.create(provider, model=model, **kwargs)
            return embedder.embed(text)
        
        # Backward compatibility with Phase 1-4
        elif provider == "openai":
            if not openai_client:
                raise HTTPException(status_code=400, detail="OpenAI API key not configured")
            
            embedder = EmbeddingFactory.create('openai', model=model or 'text-embedding-3-small')
            return embedder.embed(text)
        
        elif provider == "groq":
            # Use simple text-based embedding for Groq
            return simple_text_embedding(text)
        
        else:
            # Try to use factory for unknown providers
            try:
                embedder = EmbeddingFactory.create(provider, model=model, **kwargs)
                return embedder.embed(text)
            except:
                raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting embedding: {str(e)}")

# ============ ENDPOINTS ============
@app.get("/ai/chunking-strategies")
async def list_chunking_strategies():
    """List all available chunking strategies"""
    strategies = ChunkingFactory.list_strategies()
    return {
        "strategies": strategies,
        "default": "fixed_size"
    }

@app.get("/")
def root():
    return {
        "status": "AI Service Running",
        "version": "1.0",
        "providers": {
            "openai": openai_client is not None,
            "groq": groq_client is not None
        }
    }

@app.post("/ai/index-document")
async def index_document(request: IndexDocumentRequest):
    """
    Index a document with specified provider
    """
    try:
        print(f"Indexing document {request.document_id} using {request.provider}")
        
        # Extract text
        text = extract_text_from_pdf(request.file_path)
        print(f"Extracted {len(text)} characters")
        
        # Chunk text
        chunk_objects = chunk_text_with_strategy(
            text,
            strategy=request.chunking_strategy,
            **request.chunking_params
        )
        print(f"Created {len(chunk_objects)} chunks")
        
        # Connect to database
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Store chunks with embeddings
        chunk_data = []
        for chunk_obj in chunk_objects:
            print(f"Processing chunk {chunk_obj.index + 1}/{len(chunk_objects)} with {request.provider}")
            embedding = get_embedding(chunk_obj.content, request.provider)

            chunk_data.append((
                request.document_id,
                None,
                chunk_obj.content,
                embedding,
                chunk_obj.index,
                chunk_obj.metadata  # Store metadata
            ))
        
        # Batch insert
        execute_values(cur, """
            INSERT INTO chunks (document_id, video_id, content, embedding, chunk_index, metadata)
            VALUES %s
        """, chunk_data)
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"Successfully indexed document {request.document_id}")
        
        return {
            "status": "success",
            "chunks_created": len(chunk_objects),
            "total_words": len(text.split()),
            "provider": request.provider
        }
    
    except Exception as e:
        print(f"Error indexing document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai/rag-answer")
async def rag_answer(request: RAGAnswerRequest):
    """
    Answer questions using specified provider
    """
    try:
        print(f"Answering question using {request.provider}: {request.question}")
        
        # Get question embedding
        question_embedding = get_embedding(request.question, request.provider)
        
        # Connect to database
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build query
        query = """
            SELECT c.content, c.document_id, d.filename
            FROM chunks c
            LEFT JOIN documents d ON c.document_id = d.id
            WHERE d.user_id = %s
        """
        params = [request.user_id]
        
        if request.document_ids:
            query += " AND c.document_id = ANY(%s)"
            params.append(request.document_ids)
        
        query += """
            ORDER BY c.embedding <=> %s::vector
            LIMIT 5
        """
        params.append(question_embedding)
        
        cur.execute(query, params)
        relevant_chunks = cur.fetchall()
        
        print(f"Found {len(relevant_chunks)} relevant chunks")
        
        if not relevant_chunks:
            return {
                "answer": "I don't have enough information to answer this question. Please upload relevant study materials first.",
                "sources": []
            }
        
        # Build context
        context_parts = []
        for i, chunk in enumerate(relevant_chunks):
            source = chunk['filename'] if chunk['filename'] else f"Document {chunk['document_id']}"
            context_parts.append(f"[Source {i+1}: {source}]\n{chunk['content']}")
        
        context = "\n\n---\n\n".join(context_parts)
        
        # Create prompt
        system_prompt = """You are an intelligent study assistant helping students understand their course materials.

Guidelines:
- Answer based ONLY on the provided context
- If the context doesn't contain the answer, say so clearly
- Cite sources using [Source N] references
- Explain concepts clearly and concisely
- Use examples when helpful"""

        user_prompt = f"""Context from study materials:

{context}

Student's Question: {request.question}

Please provide a clear, helpful answer based on the context above. Cite your sources."""
        
        # Call LLM based on provider
        print(f"Calling {request.provider} to generate answer...")
        
        if request.provider == "openai":
            if not openai_client:
                raise HTTPException(status_code=400, detail="OpenAI API key not configured")
            
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=500
            )
            answer = response.choices[0].message.content
        
        elif request.provider == "groq":
            if not groq_client:
                raise HTTPException(status_code=400, detail="Groq API key not configured")
            
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=500
            )
            answer = response.choices[0].message.content
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {request.provider}")
        
        # Prepare sources
        sources = [
            {
                "document_id": chunk['document_id'],
                "filename": chunk['filename']
            }
            for chunk in relevant_chunks
        ]
        
        cur.close()
        conn.close()
        
        print("Answer generated successfully")
        
        return {
            "answer": answer,
            "sources": sources,
            "chunks_used": len(relevant_chunks),
            "provider": request.provider
        }
    
    except Exception as e:
        print(f"Error generating answer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ PHASE 2: YOUTUBE VIDEO INGESTION ============

@app.post("/ai/video-info")
async def get_video_info(request: VideoInfoRequest):
    """
    Get YouTube video metadata without downloading
    Phase 2 feature
    """
    try:
        print(f"Getting info for: {request.youtube_url}")
        
        info = video_processor.get_video_info(request.youtube_url)
        
        return {
            "success": True,
            "info": info
        }
    except Exception as e:
        print(f"Error getting video info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/ingest-youtube")
async def ingest_youtube_video(request: IngestYouTubeRequest):
    """
    Complete YouTube video ingestion pipeline
    1. Download audio
    2. Transcribe with Whisper
    3. Chunk transcript
    4. Generate embeddings
    5. Store in database
    
    Phase 2 feature
    """
    try:
        print(f"\n{'='*60}")
        print(f"PHASE 2: YouTube Video Ingestion")
        print(f"Video ID: {request.video_id}")
        print(f"URL: {request.youtube_url}")
        print(f"Provider: {request.provider}")
        print(f"{'='*60}\n")
        
        # Step 1: Process video (download + transcribe)
        print("Step 1: Processing video...")
        video_data = video_processor.process_video(
            request.youtube_url,
            request.video_id
        )
        
        transcript = video_data['transcript']
        segments = video_data['segments']
        metadata = video_data['metadata']
        
        print(f"✅ Video processed: {metadata['title']}")
        print(f"   Duration: {metadata['duration']}s")
        print(f"   Transcript length: {len(transcript)} chars")
        print(f"   Segments: {len(segments)}")
        
        # Step 2: Update video metadata in database
        print("\nStep 2: Updating video metadata...")
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            UPDATE videos 
            SET 
                title = %s,
                duration = %s,
                transcript = %s,
                metadata = %s
            WHERE id = %s
        """, (
            metadata['title'],
            metadata['duration'],
            transcript,
            str(metadata),  # Store as text
            request.video_id
        ))
        conn.commit()
        
        print(f"✅ Video metadata updated in database")
        
        # Step 3: Chunk transcript
        print(f"\nStep 3: Chunking transcript with strategy: {request.chunking_strategy}")
        
        # Import chunking module
        from chunking import ChunkingFactory
        
        # Use time-based chunking for videos or regular chunking
        if request.chunking_strategy == "time_based":
            # Chunk by time segments
            chunks = video_processor.chunk_transcript_by_time(
                segments,
                chunk_duration=request.chunking_params.get('duration', 300)
            )
            chunk_objects = []
            for idx, chunk in enumerate(chunks):
                from chunking.base_chunker import Chunk
                chunk_objects.append(Chunk(
                    content=chunk['text'],
                    index=idx,
                    metadata={
                        'start_time': chunk['start'],
                        'end_time': chunk['end'],
                        'duration': chunk['end'] - chunk['start'],
                        'segment_count': chunk['segment_count']
                    }
                ))
        else:
            # Use regular chunking strategies
            chunker = ChunkingFactory.create(
                request.chunking_strategy,
                **request.chunking_params
            )
            chunk_objects = chunker.chunk(transcript)
        
        print(f"✅ Created {len(chunk_objects)} chunks")
        
        # Step 4: Generate embeddings and store
        print(f"\nStep 4: Generating embeddings with {request.provider}...")
        
        chunk_data = []
        for chunk_obj in chunk_objects:
            print(f"   Processing chunk {chunk_obj.index + 1}/{len(chunk_objects)}")
            
            # Get embedding
            embedding = get_embedding(chunk_obj.content, request.provider)
            
            chunk_data.append((
                None,  # document_id (NULL for videos)
                request.video_id,  # video_id
                chunk_obj.content,
                embedding,
                chunk_obj.index,
                chunk_obj.metadata  # Include time metadata
            ))
        
        # Batch insert chunks
        print("\nStep 5: Storing chunks in database...")
        execute_values(cur, """
            INSERT INTO chunks (document_id, video_id, content, embedding, chunk_index, metadata)
            VALUES %s
        """, chunk_data)
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"✅ YouTube video ingestion complete!")
        print(f"   Video ID: {request.video_id}")
        print(f"   Chunks created: {len(chunk_objects)}")
        print(f"   Strategy: {request.chunking_strategy}")
        
        return {
            "success": True,
            "video_id": request.video_id,
            "title": metadata['title'],
            "duration": metadata['duration'],
            "chunks_created": len(chunk_objects),
            "transcript_length": len(transcript),
            "chunking_strategy": request.chunking_strategy,
            "provider": request.provider
        }
        
    except Exception as e:
        print(f"\n❌ YouTube ingestion error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ PHASE 2: ENHANCED PDF PROCESSING ============

@app.post("/ai/index-document-enhanced")
async def index_document_enhanced(request: IndexDocumentRequest):
    """
    Enhanced document indexing with academic paper support
    Phase 2 feature
    
    Supports three modes:
    - standard: Basic text extraction
    - academic: Extract metadata, citations, tables
    - advanced: Full extraction with images and TOC
    """
    try:
        print(f"\n{'='*60}")
        print(f"PHASE 2: Enhanced PDF Processing")
        print(f"Document ID: {request.document_id}")
        print(f"Mode: {request.pdf_mode}")
        print(f"{'='*60}\n")
        
        # Step 1: Enhanced PDF extraction
        print(f"Step 1: Extracting PDF with mode: {request.pdf_mode}")
        pdf_data = pdf_processor.process_pdf(request.file_path, request.pdf_mode)
        
        text = pdf_data['text']
        print(f"✅ Extracted {len(text)} characters")
        print(f"   Word count: {pdf_data['word_count']}")
        print(f"   Pages: {pdf_data.get('page_count', 'N/A')}")
        
        # Step 2: Store enhanced metadata
        if request.pdf_mode in ['academic', 'advanced']:
            print("\nStep 2: Storing enhanced metadata...")
            conn = get_db_connection()
            cur = conn.cursor()
            
            metadata = pdf_data.get('metadata', {})
            
            # Update document with metadata
            cur.execute("""
                UPDATE documents 
                SET metadata = %s
                WHERE id = %s
            """, (
                str(metadata),
                request.document_id
            ))
            conn.commit()
            cur.close()
            conn.close()
            
            print(f"✅ Stored metadata:")
            if 'title' in metadata:
                print(f"   Title: {metadata.get('title', 'N/A')[:60]}...")
            if 'authors' in metadata:
                print(f"   Authors: {len(metadata.get('authors', []))}")
            if 'tables' in pdf_data:
                print(f"   Tables found: {len(pdf_data['tables'])}")
        
        # Step 3: Regular chunking and embedding (same as before)
        print(f"\nStep 3: Chunking with strategy: {request.chunking_strategy}")
        from chunking import ChunkingFactory
        
        chunker = ChunkingFactory.create(
            request.chunking_strategy,
            **request.chunking_params
        )
        chunk_objects = chunker.chunk(text)
        
        print(f"✅ Created {len(chunk_objects)} chunks")
        
        # Step 4: Generate embeddings
        print(f"\nStep 4: Generating embeddings with {request.provider}...")
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        chunk_data = []
        for chunk_obj in chunk_objects:
            embedding = get_embedding(chunk_obj.content, request.provider)
            
            chunk_data.append((
                request.document_id,
                None,  # video_id
                chunk_obj.content,
                embedding,
                chunk_obj.index,
                chunk_obj.metadata
            ))
        
        # Batch insert
        execute_values(cur, """
            INSERT INTO chunks (document_id, video_id, content, embedding, chunk_index, metadata)
            VALUES %s
        """, chunk_data)
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"✅ Enhanced PDF indexing complete!")
        
        return {
            "success": True,
            "document_id": request.document_id,
            "chunks_created": len(chunk_objects),
            "mode": request.pdf_mode,
            "word_count": pdf_data['word_count'],
            "has_metadata": 'metadata' in pdf_data,
            "has_tables": 'tables' in pdf_data
        }
        
    except Exception as e:
        print(f"\n❌ Enhanced PDF error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ PHASE 2: METADATA & FILTERING ============

@app.get("/ai/documents-with-metadata")
async def get_documents_with_metadata(user_id: int):
    """
    Get all documents with metadata for filtering
    Phase 2 feature
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT 
                id,
                filename,
                subject,
                year,
                uploaded_at,
                metadata
            FROM documents
            WHERE user_id = %s
            ORDER BY uploaded_at DESC
        """, (user_id,))
        
        documents = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return {
            "documents": documents,
            "total": len(documents)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/videos-with-metadata")
async def get_videos_with_metadata(user_id: int):
    """
    Get all videos with metadata for filtering
    Phase 2 feature
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT 
                id,
                title,
                youtube_url,
                duration,
                subject,
                year,
                uploaded_at,
                metadata
            FROM videos
            WHERE user_id = %s
            ORDER BY uploaded_at DESC
        """, (user_id,))
        
        videos = cur.fetchall()
        
        cur.close()
        conn.close()
        
        return {
            "videos": videos,
            "total": len(videos)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/search-by-metadata")
async def search_by_metadata(
    user_id: int,
    subject: Optional[str] = None,
    year: Optional[int] = None,
    resource_type: Optional[str] = None  # 'document' or 'video'
):
    """
    Search documents and videos by metadata
    Phase 2 feature
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        results = []
        
        # Search documents
        if resource_type in [None, 'document']:
            query = "SELECT id, filename as title, 'document' as type, subject, year FROM documents WHERE user_id = %s"
            params = [user_id]
            
            if subject:
                query += " AND subject = %s"
                params.append(subject)
            if year:
                query += " AND year = %s"
                params.append(year)
            
            cur.execute(query, params)
            results.extend(cur.fetchall())
        
        # Search videos
        if resource_type in [None, 'video']:
            query = "SELECT id, title, 'video' as type, subject, year FROM videos WHERE user_id = %s"
            params = [user_id]
            
            if subject:
                query += " AND subject = %s"
                params.append(subject)
            if year:
                query += " AND year = %s"
                params.append(year)
            
            cur.execute(query, params)
            results.extend(cur.fetchall())
        
        cur.close()
        conn.close()
        
        return {
            "results": results,
            "total": len(results),
            "filters": {
                "subject": subject,
                "year": year,
                "resource_type": resource_type
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ PHASE 3: QUIZ GENERATION ============

@app.post("/ai/generate-quiz")
async def generate_quiz(request: GenerateQuizRequest):
    """
    Generate quiz questions from documents/videos
    Phase 3 feature
    """
    try:
        print(f"\n{'='*60}")
        print(f"PHASE 3: Quiz Generation")
        print(f"Question count: {request.question_count}")
        print(f"Difficulty: {request.difficulty}")
        print(f"Types: {request.question_types}")
        print(f"{'='*60}\n")
        
        # Step 1: Retrieve content from documents/videos
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        content_chunks = []
        
        # Get document chunks
        if request.document_ids:
            cur.execute("""
                SELECT content FROM chunks
                WHERE document_id = ANY(%s)
                ORDER BY chunk_index
                LIMIT 20
            """, (request.document_ids,))
            content_chunks.extend([row['content'] for row in cur.fetchall()])
        
        # Get video chunks
        if request.video_ids:
            cur.execute("""
                SELECT content FROM chunks
                WHERE video_id = ANY(%s)
                ORDER BY chunk_index
                LIMIT 20
            """, (request.video_ids,))
            content_chunks.extend([row['content'] for row in cur.fetchall()])
        
        cur.close()
        conn.close()
        
        if not content_chunks:
            raise HTTPException(status_code=400, detail="No content found for quiz generation")
        
        # Combine content
        combined_content = "\n\n".join(content_chunks[:10])  # Use first 10 chunks
        print(f"✅ Retrieved {len(content_chunks)} chunks ({len(combined_content)} chars)")
        
        # Step 2: Generate different question types
        print(f"\nStep 2: Generating questions...")
        all_questions = []
        
        questions_per_type = request.question_count // len(request.question_types)
        remainder = request.question_count % len(request.question_types)
        
        for idx, qtype in enumerate(request.question_types):
            count = questions_per_type + (1 if idx < remainder else 0)
            
            print(f"   Generating {count} {qtype} questions...")
            
            if qtype == "multiple_choice":
                questions = quiz_generator.generate_mcq(
                    combined_content,
                    count,
                    request.difficulty,
                    request.provider
                )
            elif qtype == "true_false":
                questions = quiz_generator.generate_true_false(
                    combined_content,
                    count,
                    request.difficulty,
                    request.provider
                )
            elif qtype == "short_answer":
                questions = quiz_generator.generate_short_answer(
                    combined_content,
                    count,
                    request.difficulty,
                    request.provider
                )
            else:
                continue
            
            # Add type to each question
            for q in questions:
                q['type'] = qtype
            
            all_questions.extend(questions)
        
        print(f"\n✅ Generated {len(all_questions)} questions total")
        
        return {
            "success": True,
            "quiz": {
                "difficulty": request.difficulty,
                "total_questions": len(all_questions),
                "questions": all_questions
            },
            "provider": request.provider
        }
        
    except Exception as e:
        print(f"\n❌ Quiz generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/create-assessment")
async def create_assessment(request: CreateAssessmentRequest):
    """
    Create a full assessment and store in database
    Phase 3 feature
    """
    try:
        print(f"\n{'='*60}")
        print(f"PHASE 3: Creating Assessment")
        print(f"Title: {request.title}")
        print(f"{'='*60}\n")
        
        # Step 1: Generate quiz
        quiz_request = GenerateQuizRequest(
            document_ids=request.document_ids,
            video_ids=request.video_ids,
            question_count=request.question_count,
            difficulty=request.difficulty,
            question_types=request.question_types,
            provider=request.provider
        )
        
        quiz_response = await generate_quiz(quiz_request)
        questions = quiz_response['quiz']['questions']
        
        # Step 2: Store assessment in database
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get user_id from first document or video
        user_id = None
        if request.document_ids:
            cur.execute("SELECT user_id FROM documents WHERE id = %s", (request.document_ids[0],))
            row = cur.fetchone()
            if row:
                user_id = row[0]
        
        if not user_id and request.video_ids:
            cur.execute("SELECT user_id FROM videos WHERE id = %s", (request.video_ids[0],))
            row = cur.fetchone()
            if row:
                user_id = row[0]
        
        if not user_id:
            raise HTTPException(status_code=400, detail="Could not determine user")
        
        # Create assessment
        cur.execute("""
            INSERT INTO assessments (user_id, title, difficulty)
            VALUES (%s, %s, %s)
            RETURNING id
        """, (user_id, request.title, request.difficulty))
        
        assessment_id = cur.fetchone()[0]
        
        # Store questions
        question_ids = []
        for q in questions:
            cur.execute("""
                INSERT INTO questions (
                    assessment_id,
                    question_text,
                    question_type,
                    correct_answer,
                    options,
                    points
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                assessment_id,
                q.get('question') or q.get('statement'),
                q.get('type'),
                str(q.get('correct_answer')),
                json.dumps(q.get('options', [])),
                1
            ))
            question_ids.append(cur.fetchone()[0])
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"✅ Assessment created with ID: {assessment_id}")
        print(f"   Questions stored: {len(question_ids)}")
        
        return {
            "success": True,
            "assessment_id": assessment_id,
            "question_count": len(question_ids),
            "questions": questions
        }
        
    except Exception as e:
        print(f"\n❌ Assessment creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/grade-answer")
async def grade_answer(request: GradeAnswerRequest):
    """
    Grade a student's answer using AI
    Phase 3 feature
    """
    try:
        print(f"\nGrading answer for question {request.question_id}")
        
        # Get question from database
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT question_text, question_type, correct_answer, options
            FROM questions
            WHERE id = %s
        """, (request.question_id,))
        
        question = cur.fetchone()
        
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        
        # Grade the answer
        grading = quiz_generator.grade_answer(
            question['question_text'],
            question['correct_answer'],
            request.student_answer,
            question['question_type'],
            request.provider
        )
        
        print(f"✅ Graded: {grading['score']}/100")
        
        cur.close()
        conn.close()
        
        return {
            "success": True,
            "question_id": request.question_id,
            "score": grading['score'],
            "feedback": grading['feedback'],
            "strengths": grading.get('strengths', []),
            "improvements": grading.get('improvements', [])
        }
        
    except Exception as e:
        print(f"❌ Grading error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/submit-assessment")
async def submit_assessment(request: SubmitAssessmentRequest):
    """
    Submit and grade complete assessment
    Phase 3 feature
    """
    try:
        print(f"\n{'='*60}")
        print(f"PHASE 3: Grading Assessment {request.assessment_id}")
        print(f"Answers submitted: {len(request.answers)}")
        print(f"{'='*60}\n")
        
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all questions for this assessment
        cur.execute("""
            SELECT id, question_text, question_type, correct_answer, options, points
            FROM questions
            WHERE assessment_id = %s
        """, (request.assessment_id,))
        
        questions = cur.fetchall()
        question_map = {q['id']: q for q in questions}
        
        # Grade each answer
        total_score = 0
        max_score = 0
        graded_answers = []
        
        for answer_data in request.answers:
            question_id = answer_data['question_id']
            student_answer = answer_data['answer']
            
            if question_id not in question_map:
                continue
            
            question = question_map[question_id]
            max_score += question['points']
            
            print(f"   Grading question {question_id}...")
            
            # Grade the answer
            grading = quiz_generator.grade_answer(
                question['question_text'],
                question['correct_answer'],
                student_answer,
                question['question_type'],
                "groq"  # Use Groq for faster grading
            )
            
            # Calculate points earned
            points_earned = (grading['score'] / 100.0) * question['points']
            total_score += points_earned
            
            # Store response in database
            cur.execute("""
                INSERT INTO responses (
                    question_id,
                    user_id,
                    answer_text,
                    ai_score,
                    ai_feedback
                )
                VALUES (%s, (SELECT user_id FROM assessments WHERE id = %s), %s, %s, %s)
            """, (
                question_id,
                request.assessment_id,
                student_answer,
                grading['score'],
                grading['feedback']
            ))
            
            graded_answers.append({
                "question_id": question_id,
                "score": grading['score'],
                "points_earned": points_earned,
                "max_points": question['points'],
                "feedback": grading['feedback'],
                "strengths": grading.get('strengths', []),
                "improvements": grading.get('improvements', [])
            })
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Calculate final percentage
        percentage = (total_score / max_score * 100) if max_score > 0 else 0
        
        print(f"\n✅ Assessment graded!")
        print(f"   Score: {total_score:.2f}/{max_score} ({percentage:.1f}%)")
        
        return {
            "success": True,
            "assessment_id": request.assessment_id,
            "total_score": round(total_score, 2),
            "max_score": max_score,
            "percentage": round(percentage, 1),
            "grade": _calculate_letter_grade(percentage),
            "answers": graded_answers
        }
        
    except Exception as e:
        print(f"\n❌ Assessment submission error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def _calculate_letter_grade(percentage: float) -> str:
    """Convert percentage to letter grade"""
    if percentage >= 90:
        return "A"
    elif percentage >= 80:
        return "B"
    elif percentage >= 70:
        return "C"
    elif percentage >= 60:
        return "D"
    else:
        return "F"


# ============ PHASE 4: MULTI-TENANT & ADMIN ============

@app.post("/ai/tenants/create")
async def create_tenant(request: CreateTenantRequest):
    """
    Create new tenant/organization
    Phase 4 feature
    """
    try:
        print(f"\n{'='*60}")
        print(f"PHASE 4: Creating Tenant")
        print(f"Name: {request.name}")
        print(f"Domain: {request.domain}")
        print(f"{'='*60}\n")
        
        tenant = tenant_manager.create_tenant(
            name=request.name,
            domain=request.domain,
            plan=request.plan,
            max_users=request.max_users,
            max_storage_gb=request.max_storage_gb
        )
        
        print(f"✅ Tenant created: ID {tenant['id']}")
        
        return {
            "success": True,
            "tenant": tenant
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ Tenant creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/tenants/{tenant_id}")
async def get_tenant(tenant_id: int):
    """Get tenant details"""
    try:
        tenant = tenant_manager.get_tenant(tenant_id)
        
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        return tenant
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/tenants")
async def list_tenants(include_inactive: bool = False):
    """List all tenants"""
    try:
        tenants = tenant_manager.list_tenants(include_inactive)
        
        return {
            "tenants": tenants,
            "total": len(tenants)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/ai/tenants/{tenant_id}")
async def update_tenant(tenant_id: int, request: UpdateTenantRequest):
    """Update tenant settings"""
    try:
        updates = request.dict(exclude_unset=True)
        
        tenant = tenant_manager.update_tenant(tenant_id, **updates)
        
        return {
            "success": True,
            "tenant": tenant
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/ai/tenants/{tenant_id}")
async def delete_tenant(tenant_id: int):
    """Delete/deactivate tenant"""
    try:
        success = tenant_manager.delete_tenant(tenant_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        return {"success": True}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/tenants/{tenant_id}/users")
async def get_tenant_users(tenant_id: int):
    """Get all users for a tenant"""
    try:
        users = tenant_manager.get_tenant_users(tenant_id)
        
        return {
            "users": users,
            "total": len(users)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/tenants/invite")
async def invite_user(request: InviteUserRequest):
    """Create invitation for new user"""
    try:
        invitation = tenant_manager.invite_user(
            request.tenant_id,
            request.email,
            request.role,
            request.invited_by_user_id
        )
        
        return {
            "success": True,
            "invitation": invitation
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/tenants/{tenant_id}/usage-limits")
async def check_usage_limits(tenant_id: int):
    """Check tenant usage vs limits"""
    try:
        limits = tenant_manager.check_usage_limits(tenant_id)
        
        return limits
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ PHASE 4: ANALYTICS & REPORTING ============

@app.get("/ai/analytics/overview/{tenant_id}")
async def get_analytics_overview(tenant_id: int):
    """
    Get comprehensive analytics overview
    Phase 4 feature
    """
    try:
        print(f"\nGenerating analytics for tenant {tenant_id}")
        
        overview = analytics_engine.get_tenant_overview(tenant_id)
        
        return {
            "success": True,
            "tenant_id": tenant_id,
            "overview": overview
        }
        
    except Exception as e:
        print(f"❌ Analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/analytics/trends/{tenant_id}")
async def get_usage_trends(tenant_id: int, days: int = 30):
    """Get usage trends over time"""
    try:
        trends = analytics_engine.get_usage_trends(tenant_id, days)
        
        return {
            "success": True,
            "tenant_id": tenant_id,
            "days": days,
            "trends": trends
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/analytics/users/{tenant_id}")
async def get_user_activity(tenant_id: int, limit: int = 50):
    """Get most active users"""
    try:
        users = analytics_engine.get_user_activity(tenant_id, limit)
        
        return {
            "success": True,
            "users": users,
            "total": len(users)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/analytics/documents/{tenant_id}")
async def get_popular_documents(tenant_id: int, limit: int = 20):
    """Get most referenced documents"""
    try:
        documents = analytics_engine.get_popular_documents(tenant_id, limit)
        
        return {
            "success": True,
            "documents": documents,
            "total": len(documents)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/analytics/health/{tenant_id}")
async def get_system_health(tenant_id: int):
    """Get system health metrics"""
    try:
        health = analytics_engine.get_system_health(tenant_id)
        
        return {
            "success": True,
            "health": health
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/analytics/report/{tenant_id}")
async def generate_report(tenant_id: int, report_type: str = "monthly"):
    """
    Generate comprehensive analytics report
    Phase 4 feature
    """
    try:
        print(f"\nGenerating {report_type} report for tenant {tenant_id}")
        
        report = analytics_engine.generate_report(tenant_id, report_type)
        
        return {
            "success": True,
            "report": report
        }
        
    except Exception as e:
        print(f"❌ Report generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ PHASE 5: ADVANCED EMBEDDINGS ============

@app.get("/ai/embeddings/providers")
async def list_embedding_providers():
    """
    List all available embedding providers
    Phase 5 feature
    """
    try:
        providers = EmbeddingFactory.list_providers()
        
        return {
            "success": True,
            "providers": providers,
            "total": len(providers)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/embeddings/recommendations")
async def get_embedding_recommendations(use_case: str = "general"):
    """
    Get recommended embedding model for use case
    Phase 5 feature
    """
    try:
        recommendation = EmbeddingFactory.get_recommended_model(use_case)
        
        all_use_cases = ['general', 'fast', 'quality', 'multilingual', 'code', 'qa', 'domain_specific']
        
        return {
            "success": True,
            "use_case": use_case,
            "recommendation": recommendation,
            "available_use_cases": all_use_cases
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/embeddings/test")
async def test_embedding(
    text: str,
    provider: str,
    model: Optional[str] = None
):
    """
    Test an embedding provider
    Phase 5 feature
    """
    try:
        print(f"\nTesting embedding: {provider} - {model or 'default'}")
        
        # Get embedding
        start_time = __import__('time').time()
        embedding = get_embedding(text, provider=provider, model=model)
        elapsed = (__import__('time').time() - start_time) * 1000  # ms
        
        return {
            "success": True,
            "provider": provider,
            "model": model,
            "dimension": len(embedding),
            "sample": embedding[:5],  # First 5 values
            "elapsed_ms": round(elapsed, 2)
        }
        
    except Exception as e:
        print(f"❌ Embedding test error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/embeddings/compare")
async def compare_embeddings(
    text: str,
    providers: List[str]
):
    """
    Compare multiple embedding providers
    Phase 5 feature
    """
    try:
        print(f"\nComparing embeddings across {len(providers)} providers")
        
        results = []
        
        for provider in providers:
            try:
                start_time = __import__('time').time()
                embedding = get_embedding(text, provider=provider)
                elapsed = (__import__('time').time() - start_time) * 1000
                
                results.append({
                    "provider": provider,
                    "success": True,
                    "dimension": len(embedding),
                    "elapsed_ms": round(elapsed, 2),
                    "sample": embedding[:3]
                })
            except Exception as e:
                results.append({
                    "provider": provider,
                    "success": False,
                    "error": str(e)
                })
        
        return {
            "success": True,
            "text_length": len(text),
            "providers_tested": len(providers),
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ PHASE 6: MULTIPLE VECTOR STORES ============

@app.get("/ai/vector-stores")
async def list_vector_stores():
    """
    List all available vector stores
    Phase 6 feature
    """
    try:
        strategies = VectorStoreFactory.list_strategies()
        recommended = VectorStoreFactory.get_recommended()
        
        return {
            "success": True,
            "stores": strategies,
            "recommended": recommended,
            "total": len(strategies)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/test-vector-store")
async def test_vector_store(
    store_type: str = "faiss",
    dimension: int = 384,
    num_vectors: int = 100
):
    """
    Test vector store with sample data
    Phase 6 feature
    """
    try:
        print(f"\nTesting vector store: {store_type}")
        
        import time
        import random
        
        # Create store
        start_time = time.time()
        store = VectorStoreFactory.create(
            strategy=store_type,
            dimension=dimension,
            db_connection_string=DATABASE_URL
        )
        create_time = time.time() - start_time
        
        # Generate test data
        print(f"Generating {num_vectors} test vectors...")
        ids = [f"test_{i}" for i in range(num_vectors)]
        vectors = [[random.random() for _ in range(dimension)] for _ in range(num_vectors)]
        metadata = [{"content": f"Test content {i}", "index": i} for i in range(num_vectors)]
        
        # Add vectors
        start_time = time.time()
        success = store.add(ids, vectors, metadata)
        add_time = time.time() - start_time
        
        # Search
        query_vector = [random.random() for _ in range(dimension)]
        start_time = time.time()
        results = store.search(query_vector, top_k=5)
        search_time = time.time() - start_time
        
        # Get count
        count = store.get_count()
        
        print(f"✅ Vector store test complete")
        print(f"   Create: {create_time:.3f}s")
        print(f"   Add {num_vectors}: {add_time:.3f}s")
        print(f"   Search: {search_time:.3f}s")
        print(f"   Total vectors: {count}")
        
        return {
            "success": True,
            "store_type": store_type,
            "dimension": dimension,
            "vectors_added": num_vectors,
            "vectors_total": count,
            "performance": {
                "create_seconds": round(create_time, 3),
                "add_seconds": round(add_time, 3),
                "search_seconds": round(search_time, 3),
                "vectors_per_second": round(num_vectors / add_time, 2) if add_time > 0 else 0
            },
            "sample_results": len(results),
            "description": store.get_description()
        }
        
    except Exception as e:
        print(f"❌ Vector store test error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/compare-vector-stores")
async def compare_vector_stores(
    stores: List[str] = ["faiss", "chromadb", "qdrant_memory"],
    dimension: int = 384,
    num_vectors: int = 100
):
    """
    Compare multiple vector stores
    Phase 6 feature
    """
    try:
        print(f"\nComparing {len(stores)} vector stores")
        
        import time
        import random
        
        # Generate test data once
        ids = [f"test_{i}" for i in range(num_vectors)]
        vectors = [[random.random() for _ in range(dimension)] for _ in range(num_vectors)]
        metadata = [{"content": f"Test content {i}"} for i in range(num_vectors)]
        query_vector = [random.random() for _ in range(dimension)]
        
        results = []
        
        for store_type in stores:
            try:
                # Create store
                start = time.time()
                store = VectorStoreFactory.create(
                    strategy=store_type,
                    dimension=dimension,
                    db_connection_string=DATABASE_URL
                )
                create_time = time.time() - start
                
                # Add vectors
                start = time.time()
                store.add(ids, vectors, metadata)
                add_time = time.time() - start
                
                # Search
                start = time.time()
                search_results = store.search(query_vector, top_k=5)
                search_time = time.time() - start
                
                results.append({
                    "store": store_type,
                    "success": True,
                    "create_seconds": round(create_time, 3),
                    "add_seconds": round(add_time, 3),
                    "search_seconds": round(search_time, 3),
                    "vectors_per_second": round(num_vectors / add_time, 2) if add_time > 0 else 0,
                    "results_count": len(search_results),
                    "description": store.get_description()
                })
                
                print(f"✅ {store_type}: add {add_time:.3f}s, search {search_time:.3f}s")
                
            except Exception as e:
                results.append({
                    "store": store_type,
                    "success": False,
                    "error": str(e)
                })
                print(f"❌ {store_type}: {str(e)}")
        
        return {
            "success": True,
            "comparisons": results,
            "test_config": {
                "dimension": dimension,
                "num_vectors": num_vectors
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ PHASE 7: MULTIPLE LLM PROVIDERS ============

@app.get("/ai/llm-providers")
async def list_llm_providers():
    """
    List all available LLM providers
    Phase 7 feature
    """
    try:
        providers = LLMFactory.list_providers()
        recommended = LLMFactory.get_recommended()
        
        return {
            "success": True,
            "providers": providers,
            "recommended": recommended,
            "total": len(providers)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/test-llm")
async def test_llm(
    provider: str = "groq",
    prompt: str = "What is the capital of France?",
    temperature: float = 0.7
):
    """
    Test LLM provider with sample prompt
    Phase 7 feature
    """
    try:
        print(f"\nTesting LLM provider: {provider}")
        
        import time
        start_time = time.time()
        
        # Create LLM
        llm = LLMFactory.create(
            provider=provider,
            openai_client=openai_client,
            groq_client=groq_client,
            anthropic_api_key=ANTHROPIC_API_KEY,
            google_api_key=GOOGLE_API_KEY,
            cohere_api_key=COHERE_API_KEY,
            together_api_key=TOGETHER_API_KEY
        )
        
        # Generate response
        response = llm.generate(prompt, temperature=temperature)
        elapsed = time.time() - start_time
        
        print(f"✅ LLM response generated in {elapsed:.2f}s")
        print(f"   Provider: {llm.get_name()}")
        print(f"   Model: {llm.get_model()}")
        
        return {
            "success": True,
            "provider": provider,
            "model": llm.get_model(),
            "prompt": prompt,
            "response": response,
            "elapsed_seconds": round(elapsed, 3),
            "description": llm.get_description()
        }
        
    except Exception as e:
        print(f"❌ LLM test error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/compare-llms")
async def compare_llms(
    providers: List[str] = ["groq", "openai", "claude"],
    prompt: str = "Explain quantum computing in one sentence."
):
    """
    Compare multiple LLM providers
    Phase 7 feature
    """
    try:
        print(f"\nComparing {len(providers)} LLM providers")
        
        results = []
        
        for provider in providers:
            try:
                import time
                start_time = time.time()
                
                llm = LLMFactory.create(
                    provider=provider,
                    openai_client=openai_client,
                    groq_client=groq_client,
                    anthropic_api_key=ANTHROPIC_API_KEY,
                    google_api_key=GOOGLE_API_KEY,
                    cohere_api_key=COHERE_API_KEY,
                    together_api_key=TOGETHER_API_KEY
                )
                
                response = llm.generate(prompt, temperature=0.7)
                elapsed = time.time() - start_time
                
                results.append({
                    "provider": provider,
                    "success": True,
                    "model": llm.get_model(),
                    "response": response,
                    "elapsed_seconds": round(elapsed, 3),
                    "description": llm.get_description()
                })
                
                print(f"✅ {provider}: {elapsed:.2f}s")
                
            except Exception as e:
                results.append({
                    "provider": provider,
                    "success": False,
                    "error": str(e)
                })
                print(f"❌ {provider}: {str(e)}")
        
        return {
            "success": True,
            "prompt": prompt,
            "comparisons": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    import json
    uvicorn.run(app, host="0.0.0.0", port=8000)
