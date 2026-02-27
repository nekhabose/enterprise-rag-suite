"""
Enterprise LMS AI Service
FastAPI application with JWT-based authentication, RBAC, and tenant isolation.
"""
import os
import uuid
import structlog
import tempfile
import shutil
import re
import json
import html as html_lib
import urllib.request
from urllib.parse import urlparse, parse_qs
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel, Field
from typing import Optional, List
from dotenv import load_dotenv
from src.rag.orchestration.factory import build_rag_engine
from src.rag.embedding.adapters import FactoryEmbedder
from src.rag.chunking.adapters import FactoryChunker
from src.rag.retrieval.postgres_retriever import PostgresKeywordRetriever
import psycopg2
from psycopg2.extras import RealDictCursor

# Chroma telemetry can throw noisy runtime errors in some env/package combinations.
# Force-disable before any Chroma client initialization.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "FALSE")
os.environ.setdefault("CHROMA_TELEMETRY_IMPL", "none")
os.environ.setdefault("CHROMA_PRODUCT_TELEMETRY_IMPL", "none")

load_dotenv()

from middleware.auth import (
    get_current_user,
    require_permission,
    AuthenticatedUser,
    tenant_scoped,
)

# ============================================================
# LOGGING
# ============================================================
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()
rag_engine = build_rag_engine()
retriever_utils = PostgresKeywordRetriever()

# ============================================================
# APP
# ============================================================
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="LMS AI Service",
    version="1.0.0",
    docs_url="/docs" if os.getenv("NODE_ENV") != "production" else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret", "X-Tenant-Id"],
)

# ============================================================
# REQUEST CORRELATION
# ============================================================
@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    return response


# ============================================================
# MODELS
# ============================================================
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: Optional[int] = None
    tenant_id: int
    course_id: Optional[int] = None
    top_k: Optional[int] = Field(default=10, ge=1, le=25)

class IngestRequest(BaseModel):
    tenant_id: int
    source_type: str = Field(..., pattern="^(pdf|youtube|web|docx|txt|csv)$")
    source_url: Optional[str] = None
    video_id: Optional[int] = None
    course_id: Optional[int] = None
    title: Optional[str] = None
    subject: Optional[str] = None
    year: Optional[int] = None

class IndexDocumentRequest(BaseModel):
    document_id: int
    file_path: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    embedding_model: Optional[str] = None
    chunking_strategy: Optional[str] = None

class IndexVideoUploadRequest(BaseModel):
    video_id: int
    file_path: Optional[str] = None
    chunking_strategy: Optional[str] = None
    embedding_model: Optional[str] = None

class IngestWebRequest(BaseModel):
    tenant_id: int
    course_id: Optional[int] = None
    url: str
    video_id: Optional[int] = None
    title: Optional[str] = None
    chunking_strategy: Optional[str] = None
    embedding_model: Optional[str] = None

class QuizRequest(BaseModel):
    tenant_id: int
    topic: str = Field(..., min_length=1, max_length=500)
    difficulty: str = Field("medium", pattern="^(easy|medium|hard)$")
    num_questions: int = Field(5, ge=1, le=20)
    question_type: str = Field("mcq", pattern="^(mcq|short_answer|true_false)$")

class EmbedRequest(BaseModel):
    texts: List[str] = Field(..., max_items=100)
    tenant_id: int


def _first_scalar(value):
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _normalize_chunking(value: Optional[str]) -> str:
    raw = str(_first_scalar(value) or "semantic").strip().lower()
    mapping = {
        "fixed": "fixed_size",
        "fixed_size": "fixed_size",
        "semantic": "semantic",
        "paragraph": "paragraph",
        "page": "page_based",
        "page_based": "page_based",
        "overlap": "overlap",
        "parent_child": "parent_child",
        "recursive": "recursive",
        "sentence": "sentence",
    }
    return mapping.get(raw, "semantic")


def _chunking_profile(strategy: str) -> dict:
    normalized = _normalize_chunking(strategy)
    profiles = {
        "fixed_size": {"unit": "words", "chunk_size": 500, "overlap": 50},
        "overlap": {"unit": "words", "chunk_size": 500, "overlap": 50},
        "semantic": {"unit": "chars", "max_chunk_size": 1000},
        "paragraph": {"unit": "paragraphs", "max_paragraphs_per_chunk": 5, "min_paragraph_length": 50},
        "page_based": {"unit": "pages", "mode": "preserve_page_boundaries"},
        "parent_child": {"unit": "words", "parent_size": 1200, "child_size": 300, "overlap": 50},
        "sentence": {"unit": "sentences", "sentences_per_chunk": 5, "overlap_sentences": 1},
        "recursive": {"unit": "chars", "chunk_size": 1000},
    }
    return {"strategy": normalized, "parameters": profiles.get(normalized, {})}


def _resolve_embedding_provider_model(cfg: dict, override_model: Optional[str] = None):
    raw_model = _first_scalar(override_model) or _first_scalar(cfg.get("embedding_model")) or "minilm"
    model = str(raw_model).strip()
    provider_raw = _first_scalar(cfg.get("embedding_provider"))
    provider = str(provider_raw).strip().lower() if provider_raw else ""
    if not provider:
        lowered = model.lower()
        if lowered in ("minilm", "all-minilm-l6-v2"):
            provider = "sentence_transformer"
            model = "all-MiniLM-L6-v2"
        elif lowered.startswith("text-embedding") or lowered == "openai":
            provider = "openai"
        elif lowered.startswith("embed-") or lowered == "cohere":
            provider = "cohere"
        else:
            provider = "sentence_transformer"
            model = "all-MiniLM-L6-v2"
    if provider == "sentence_transformer" and model.lower() == "minilm":
        model = "all-MiniLM-L6-v2"
    return provider, model


def _coerce_pgvector_dim(vec: List[float], dim: int = 1536) -> List[float]:
    if len(vec) == dim:
        return vec
    if len(vec) > dim:
        return vec[:dim]
    return vec + [0.0] * (dim - len(vec))


def _extract_video_id(url: str) -> Optional[str]:
    try:
        parsed = urlparse(url)
        if "youtu.be" in parsed.netloc:
            vid = parsed.path.strip("/").split("/")[0]
            return vid or None
        if "youtube.com" in parsed.netloc:
            qs = parse_qs(parsed.query)
            if qs.get("v"):
                return qs["v"][0]
            m = re.search(r"/shorts/([A-Za-z0-9_-]{6,})", parsed.path)
            if m:
                return m.group(1)
        return None
    except Exception:
        return None


def _youtube_transcript(url: str, video_id: int) -> str:
    ytid = _extract_video_id(url)
    if not ytid:
        return ""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript = YouTubeTranscriptApi.get_transcript(ytid, languages=["en"])
        joined = " ".join([str(x.get("text") or "").strip() for x in transcript])
        cleaned = re.sub(r"\s+", " ", joined).strip()
        if cleaned:
            return cleaned
    except Exception:
        pass

    temp_dir = tempfile.mkdtemp(prefix="yt_ingest_")
    audio_path = os.path.join(temp_dir, f"video_{video_id}.mp3")
    try:
        import yt_dlp
        import whisper
        ydl_opts = {
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "outtmpl": os.path.join(temp_dir, f"video_{video_id}.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        if not os.path.exists(audio_path):
            return ""
        model = whisper.load_model("base")
        result = model.transcribe(audio_path, verbose=False)
        return re.sub(r"\s+", " ", str(result.get("text") or "")).strip()
    except Exception:
        return ""
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _scrape_web_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "EduLMSBot/1.0 (+https://edulms.local)"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read().decode("utf-8", errors="ignore")
    no_script = re.sub(r"(?is)<script.*?>.*?</script>", " ", raw)
    no_style = re.sub(r"(?is)<style.*?>.*?</style>", " ", no_script)
    text = re.sub(r"(?is)<[^>]+>", " ", no_style)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _get_db_conn():
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg2.connect(db_url)


def _index_into_selected_store(
    vector_store: str,
    tenant_id: int,
    course_id: Optional[int],
    ids: List[str],
    vectors: List[List[float]],
    metadatas: List[dict],
) -> Optional[str]:
    store_name = str(_first_scalar(vector_store) or "postgres").strip().lower()
    if store_name in ("postgres", "pgvector"):
        return None
    try:
        from vector_stores.vector_store_factory import VectorStoreFactory
        dimension = len(vectors[0]) if vectors else 384
        kwargs = {}
        namespace_suffix = f"tenant_{tenant_id}_course_{course_id or 0}"
        if store_name in ("chroma", "chromadb"):
            kwargs["collection_name"] = namespace_suffix
            kwargs["persist_directory"] = os.path.join("data", "chroma")
        elif store_name.startswith("faiss"):
            os.makedirs(os.path.join("data", "faiss"), exist_ok=True)
            kwargs["storage_path"] = os.path.join("data", "faiss", namespace_suffix)
        elif store_name.startswith("qdrant"):
            kwargs["collection_name"] = namespace_suffix
            kwargs["use_memory"] = str(os.getenv("QDRANT_USE_MEMORY", "true")).strip().lower() in ("1", "true", "yes")
            kwargs["host"] = os.getenv("QDRANT_HOST", "localhost")
            kwargs["port"] = int(os.getenv("QDRANT_PORT", "6333"))
        elif store_name == "pinecone":
            kwargs["namespace"] = namespace_suffix
            kwargs["api_key"] = os.getenv("PINECONE_API_KEY")
            kwargs["index_name"] = os.getenv("PINECONE_INDEX", "enterprise-rag")
            kwargs["cloud"] = os.getenv("PINECONE_CLOUD", "aws")
            kwargs["region"] = os.getenv("PINECONE_REGION", "us-east-1")
        store = VectorStoreFactory.create(
            strategy=store_name,
            dimension=dimension,
            db_connection_string=os.getenv("DATABASE_URL", ""),
            **kwargs,
        )
        ok = store.add(ids=ids, vectors=vectors, metadata=metadatas)
        if hasattr(store, "save"):
            try:
                store.save()
            except Exception:
                pass
        if not ok:
            return f"Failed to add vectors to selected store '{store_name}'"
        return None
    except Exception as exc:
        return f"Selected vector store '{store_name}' indexing warning: {exc}"


def _chunk_embed_store(
    *,
    tenant_id: int,
    text: str,
    source_label: str,
    source_kind: str,
    source_id: int,
    course_id: Optional[int],
    cfg: dict,
    override_chunking: Optional[str] = None,
    override_embedding_model: Optional[str] = None,
) -> dict:
    content = re.sub(r"\s+", " ", text or "").strip()
    if not content:
        return {"chunks_created": 0, "warnings": ["No extractable content found"], "chunking_strategy": None, "vector_store": cfg.get("vector_store")}

    chunking_strategy = _normalize_chunking(override_chunking or cfg.get("chunking_strategy"))
    chunk_profile = _chunking_profile(chunking_strategy)
    chunker = FactoryChunker(chunking_strategy)
    chunks = [c.strip() for c in chunker.chunk(content) if c and str(c).strip()]
    if not chunks:
        return {"chunks_created": 0, "warnings": ["No chunks generated from content"], "chunking_strategy": chunking_strategy, "vector_store": cfg.get("vector_store")}

    provider, model = _resolve_embedding_provider_model(cfg, override_embedding_model)
    embedder = FactoryEmbedder(provider=provider, model=model)
    vectors = embedder.embed(chunks)

    vector_store = str(_first_scalar(cfg.get("vector_store")) or "postgres").strip().lower()
    ids = [f"{source_kind}:{source_id}:{idx}" for idx in range(len(chunks))]
    metadata_rows = [
      {
        "source": source_label,
        "source_kind": source_kind,
        "source_id": source_id,
        "tenant_id": tenant_id,
        "course_id": course_id,
        "chunk_index": idx,
        "content": chunk,
      }
      for idx, chunk in enumerate(chunks)
    ]

    warnings: List[str] = []
    try:
        with _get_db_conn() as conn:
            with conn.cursor() as cur:
                if source_kind == "document":
                    cur.execute("DELETE FROM chunks WHERE document_id = %s", [source_id])
                    insert_sql = """
                        INSERT INTO chunks (document_id, tenant_id, content, embedding, chunk_index, metadata)
                        VALUES (%s,%s,%s,%s::vector,%s,%s::jsonb)
                    """
                    for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
                        vec1536 = _coerce_pgvector_dim([float(x) for x in vec], dim=1536)
                        cur.execute(
                            insert_sql,
                            [
                                source_id,
                                tenant_id,
                                chunk,
                                vec1536,
                                idx,
                                json.dumps(
                                    {
                                        "source": source_label,
                                        "vector_store": vector_store,
                                        "chunking_strategy": chunking_strategy,
                                        "chunk_size_chars": len(chunk),
                                        "chunk_size_words": len(chunk.split()),
                                        "chunking_profile": chunk_profile.get("parameters", {}),
                                        "embedding_provider": provider,
                                        "embedding_model": model,
                                    }
                                ),
                            ],
                        )
                else:
                    cur.execute("DELETE FROM chunks WHERE video_id = %s", [source_id])
                    insert_sql = """
                        INSERT INTO chunks (video_id, tenant_id, content, embedding, chunk_index, metadata)
                        VALUES (%s,%s,%s,%s::vector,%s,%s::jsonb)
                    """
                    for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
                        vec1536 = _coerce_pgvector_dim([float(x) for x in vec], dim=1536)
                        cur.execute(
                            insert_sql,
                            [
                                source_id,
                                tenant_id,
                                chunk,
                                vec1536,
                                idx,
                                json.dumps(
                                    {
                                        "source": source_label,
                                        "vector_store": vector_store,
                                        "chunking_strategy": chunking_strategy,
                                        "chunk_size_chars": len(chunk),
                                        "chunk_size_words": len(chunk.split()),
                                        "chunking_profile": chunk_profile.get("parameters", {}),
                                        "embedding_provider": provider,
                                        "embedding_model": model,
                                    }
                                ),
                            ],
                        )
                conn.commit()
    except psycopg2.errors.ForeignKeyViolation:
        return {
            "chunks_created": 0,
            "chunking_strategy": chunking_strategy,
            "embedding_provider": provider,
            "embedding_model": model,
            "vector_store": vector_store,
            "warnings": [f"Source {source_kind}:{source_id} no longer exists while indexing"],
            "failed": True,
        }

    warn = _index_into_selected_store(vector_store, tenant_id, course_id, ids, vectors, metadata_rows)
    if warn:
        warnings.append(warn)

    return {
        "chunks_created": len(chunks),
        "chunking_strategy": chunking_strategy,
        "chunking_profile": chunk_profile,
        "chunk_size_avg_chars": int(sum(len(c) for c in chunks) / len(chunks)) if chunks else 0,
        "chunk_size_avg_words": int(sum(len(c.split()) for c in chunks) / len(chunks)) if chunks else 0,
        "embedding_provider": provider,
        "embedding_model": model,
        "vector_store": vector_store,
        "warnings": warnings,
    }


# ============================================================
# HEALTH
# ============================================================
@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-service"}


# ============================================================
# CHAT ENDPOINT
# ============================================================
@app.post("/api/chat")
@limiter.limit("30/minute")
async def chat(
    request: Request,
    body: ChatRequest,
    user: AuthenticatedUser = Depends(require_permission("CHAT_USE")),
):
    # Enforce tenant scope
    if not tenant_scoped(user, body.tenant_id):
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this tenant's data",
        )

    log.info(
        "chat_request",
        user_id=user.id,
        tenant_id=body.tenant_id,
        conversation_id=body.conversation_id,
        course_id=body.course_id,
    )

    rag_result = rag_engine.answer(
        body.tenant_id,
        body.message,
        body.course_id,
        top_k=body.top_k or 10,
    )

    return {
        "response": rag_result["response"],
        "conversation_id": body.conversation_id or 1,
        "sources": rag_result["sources"],
        "grounded": rag_result.get("grounded", True),
        "provider_used": rag_result.get("provider_used"),
        "model_used": rag_result.get("model_used"),
        "retrieval_strategy_used": rag_result.get("retrieval_strategy_used"),
        "vector_store_used": rag_result.get("vector_store_used"),
        "chunking_strategy_used": rag_result.get("chunking_strategy_used"),
        "top_k_used": rag_result.get("top_k_used"),
        "tokens_used": len(body.message.split()),
    }


@app.get("/ai/chunking-profile")
async def chunking_profile(
    strategy: Optional[str] = None,
    tenant_id: Optional[int] = None,
    user: AuthenticatedUser = Depends(require_permission("DOCUMENT_READ")),
):
    effective = strategy
    if not effective and tenant_id is not None:
        if not tenant_scoped(user, tenant_id):
            raise HTTPException(status_code=403, detail="Tenant access denied")
        cfg = rag_engine._get_tenant_ai_settings(tenant_id)
        effective = str(_first_scalar(cfg.get("chunking_strategy")) or "semantic")
    return _chunking_profile(effective or "semantic")


@app.get("/ai/chunks")
@limiter.limit("30/minute")
async def list_chunks(
    request: Request,
    tenant_id: int,
    source_kind: str,
    source_id: int,
    course_id: Optional[int] = None,
    limit: int = 20,
    user: AuthenticatedUser = Depends(require_permission("DOCUMENT_READ")),
):
    if source_kind not in ("document", "video"):
        raise HTTPException(status_code=422, detail="source_kind must be document or video")
    if not tenant_scoped(user, tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")
    safe_limit = max(1, min(100, int(limit)))
    with _get_db_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if source_kind == "document":
                cur.execute(
                    "SELECT id, course_id, filename AS source_name FROM documents WHERE id = %s AND tenant_id = %s",
                    [source_id, tenant_id],
                )
            else:
                cur.execute(
                    "SELECT id, course_id, COALESCE(title, youtube_url, 'Video') AS source_name FROM videos WHERE id = %s AND tenant_id = %s",
                    [source_id, tenant_id],
                )
            source_row = cur.fetchone()
            if not source_row:
                raise HTTPException(status_code=404, detail=f"{source_kind.title()} not found")
            if course_id is not None and int(source_row.get("course_id") or 0) != int(course_id):
                raise HTTPException(status_code=403, detail="Source does not belong to requested course")
            if source_kind == "document":
                cur.execute(
                    """
                    SELECT chunk_index, content, metadata
                    FROM chunks
                    WHERE tenant_id = %s AND document_id = %s
                    ORDER BY chunk_index ASC
                    LIMIT %s
                    """,
                    [tenant_id, source_id, safe_limit],
                )
            else:
                cur.execute(
                    """
                    SELECT chunk_index, content, metadata
                    FROM chunks
                    WHERE tenant_id = %s AND video_id = %s
                    ORDER BY chunk_index ASC
                    LIMIT %s
                    """,
                    [tenant_id, source_id, safe_limit],
                )
            rows = list(cur.fetchall())

    chunks = []
    for row in rows:
        content = str(row.get("content") or "")
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        chunks.append(
            {
                "chunk_index": int(row.get("chunk_index") or 0),
                "preview": content[:500],
                "size_chars": len(content),
                "size_words": len(content.split()),
                "metadata": metadata,
            }
        )

    return {
        "source_kind": source_kind,
        "source_id": source_id,
        "source_name": source_row.get("source_name"),
        "tenant_id": tenant_id,
        "course_id": source_row.get("course_id"),
        "chunk_count_returned": len(chunks),
        "chunks": chunks,
    }


# ============================================================
# DOCUMENT INGEST
# ============================================================
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "md", "csv", "pptx", "xlsx"}
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", 50)) * 1024 * 1024

@app.post("/api/ingest/upload")
@limiter.limit("10/minute")
async def ingest_upload(
    request: Request,
    tenant_id: int = Form(...),
    subject: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(require_permission("DOCUMENT_WRITE")),
):
    # Tenant scope check
    if not tenant_scoped(user, tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")

    # File type validation
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"File type '.{ext}' not allowed. Allowed: {ALLOWED_EXTENSIONS}",
        )

    # File size validation
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum {os.getenv('MAX_FILE_SIZE_MB', 50)}MB",
        )

    log.info(
        "document_ingest",
        user_id=user.id,
        tenant_id=tenant_id,
        filename=file.filename,
        size=len(content),
        ext=ext,
    )

    decoded_text = content.decode("utf-8", errors="ignore")
    ingest_result = rag_engine.ingest(tenant_id, file.filename or "upload", decoded_text)

    return {
        "status": "queued",
        "document_id": None,
        "filename": file.filename,
        "chunks": ingest_result["chunks"],
        "message": "Document processed and indexed",
    }


@app.post("/api/ingest/youtube")
@limiter.limit("5/minute")
async def ingest_youtube(
    request: Request,
    body: IngestRequest,
    user: AuthenticatedUser = Depends(require_permission("VIDEO_WRITE")),
):
    if not tenant_scoped(user, body.tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")
    if not body.video_id:
        raise HTTPException(status_code=422, detail="video_id required")

    if not body.source_url or "youtube.com" not in body.source_url and "youtu.be" not in body.source_url:
        raise HTTPException(status_code=422, detail="Valid YouTube URL required")

    log.info("youtube_ingest", user_id=user.id, tenant_id=body.tenant_id, url=body.source_url)

    cfg = rag_engine._get_tenant_ai_settings(body.tenant_id)
    transcript = _youtube_transcript(body.source_url, body.video_id or 0)
    if not transcript:
        raise HTTPException(status_code=422, detail="Unable to extract transcript from YouTube URL")
    ingest_result = _chunk_embed_store(
        tenant_id=body.tenant_id,
        text=transcript,
        source_label=body.title or body.source_url,
        source_kind="video",
        source_id=int(body.video_id),
        course_id=body.course_id,
        cfg=cfg,
        override_chunking=body.source_type if body.source_type in ("fixed", "fixed_size", "semantic", "paragraph", "page_based", "overlap", "parent_child", "sentence", "recursive") else None,
    )
    if body.video_id:
        with _get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE videos SET transcript = %s WHERE id = %s", [transcript, body.video_id])
                conn.commit()
    return {
        "status": "indexed",
        "video_id": body.video_id,
        "chunks": ingest_result["chunks_created"],
        "message": "YouTube video transcript indexed",
        "warnings": ingest_result.get("warnings", []),
    }


@app.post("/ai/index-document")
@limiter.limit("20/minute")
async def index_document(
    request: Request,
    body: IndexDocumentRequest,
    user: AuthenticatedUser = Depends(require_permission("DOCUMENT_WRITE")),
):
    with _get_db_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, tenant_id, course_id, filename, file_path FROM documents WHERE id = %s",
                [body.document_id],
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Document not found")
            tenant_id = int(row["tenant_id"])
            if not tenant_scoped(user, tenant_id):
                raise HTTPException(status_code=403, detail="Tenant access denied")
            file_path = body.file_path or row.get("file_path")
            if not file_path or not os.path.exists(file_path):
                raise HTTPException(status_code=422, detail="Document file path not found on disk")
            text = retriever_utils._extract_document_text(str(file_path), str(row.get("filename") or "document"))
            cfg = rag_engine._get_tenant_ai_settings(tenant_id)
            ingest = _chunk_embed_store(
                tenant_id=tenant_id,
                text=text,
                source_label=str(row.get("filename") or f"document:{body.document_id}"),
                source_kind="document",
                source_id=int(body.document_id),
                course_id=int(row["course_id"]) if row.get("course_id") is not None else None,
                cfg=cfg,
                override_chunking=body.chunking_strategy,
                override_embedding_model=body.embedding_model,
            )
            if ingest.get("failed"):
                raise HTTPException(status_code=409, detail=ingest.get("warnings", ["Indexing failed"])[0])
            cur.execute("UPDATE documents SET is_indexed = true WHERE id = %s", [body.document_id])
            conn.commit()
            return {
                "status": "indexed",
                "document_id": body.document_id,
                "chunks_created": ingest["chunks_created"],
                "vector_store": ingest["vector_store"],
                "chunking_strategy": ingest["chunking_strategy"],
                "chunking_profile": ingest.get("chunking_profile"),
                "chunk_size_avg_chars": ingest.get("chunk_size_avg_chars"),
                "chunk_size_avg_words": ingest.get("chunk_size_avg_words"),
                "warnings": ingest.get("warnings", []),
            }


@app.post("/ai/ingest-youtube")
@limiter.limit("10/minute")
async def ingest_youtube_legacy(
    request: Request,
    body: IngestRequest,
    user: AuthenticatedUser = Depends(require_permission("VIDEO_WRITE")),
):
    if not body.video_id:
        raise HTTPException(status_code=422, detail="video_id required")
    if not body.source_url:
        raise HTTPException(status_code=422, detail="youtube_url required")
    if not tenant_scoped(user, body.tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")
    transcript = _youtube_transcript(body.source_url, body.video_id)
    if not transcript:
        raise HTTPException(status_code=422, detail="Could not extract transcript from YouTube URL")
    with _get_db_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, course_id, tenant_id FROM videos WHERE id = %s", [body.video_id])
            video = cur.fetchone()
            if not video:
                raise HTTPException(status_code=404, detail="Video not found")
            cfg = rag_engine._get_tenant_ai_settings(int(video["tenant_id"]))
            ingest = _chunk_embed_store(
                tenant_id=int(video["tenant_id"]),
                text=transcript,
                source_label=body.title or body.source_url,
                source_kind="video",
                source_id=body.video_id,
                course_id=int(video["course_id"]) if video.get("course_id") is not None else body.course_id,
                cfg=cfg,
                override_chunking=body.source_type if body.source_type in ("fixed", "fixed_size", "semantic", "paragraph", "page_based", "overlap", "parent_child", "sentence", "recursive") else None,
            )
            cur.execute("UPDATE videos SET transcript = %s WHERE id = %s", [transcript, body.video_id])
            conn.commit()
    return {
        "status": "indexed",
        "video_id": body.video_id,
        "chunks_created": ingest["chunks_created"],
        "chunking_strategy": ingest.get("chunking_strategy"),
        "chunking_profile": ingest.get("chunking_profile"),
        "chunk_size_avg_chars": ingest.get("chunk_size_avg_chars"),
        "chunk_size_avg_words": ingest.get("chunk_size_avg_words"),
        "warnings": ingest.get("warnings", []),
    }


@app.post("/ai/index-video-upload")
@limiter.limit("10/minute")
async def index_video_upload(
    request: Request,
    body: IndexVideoUploadRequest,
    user: AuthenticatedUser = Depends(require_permission("VIDEO_WRITE")),
):
    with _get_db_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, tenant_id, course_id, title, file_path FROM videos WHERE id = %s",
                [body.video_id],
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Video not found")
            tenant_id = int(row["tenant_id"])
            if not tenant_scoped(user, tenant_id):
                raise HTTPException(status_code=403, detail="Tenant access denied")
            file_path = body.file_path or row.get("file_path")
            if not file_path or not os.path.exists(str(file_path)):
                raise HTTPException(status_code=422, detail="Uploaded lecture file not found on disk")
            transcript = PostgresKeywordRetriever._transcribe_uploaded_video(str(file_path))
            if not transcript:
                raise HTTPException(status_code=422, detail="Could not transcribe uploaded lecture recording")
            cfg = rag_engine._get_tenant_ai_settings(tenant_id)
            ingest = _chunk_embed_store(
                tenant_id=tenant_id,
                text=transcript,
                source_label=str(row.get("title") or f"video:{body.video_id}"),
                source_kind="video",
                source_id=int(body.video_id),
                course_id=int(row["course_id"]) if row.get("course_id") is not None else None,
                cfg=cfg,
                override_chunking=body.chunking_strategy,
                override_embedding_model=body.embedding_model,
            )
            cur.execute("UPDATE videos SET transcript = %s WHERE id = %s", [transcript, body.video_id])
            conn.commit()
            return {
                "status": "indexed",
                "video_id": body.video_id,
                "chunks_created": ingest["chunks_created"],
                "chunking_strategy": ingest.get("chunking_strategy"),
                "chunking_profile": ingest.get("chunking_profile"),
                "chunk_size_avg_chars": ingest.get("chunk_size_avg_chars"),
                "chunk_size_avg_words": ingest.get("chunk_size_avg_words"),
                "warnings": ingest.get("warnings", []),
            }


@app.post("/ai/ingest-web")
@limiter.limit("10/minute")
async def ingest_web(
    request: Request,
    body: IngestWebRequest,
    user: AuthenticatedUser = Depends(require_permission("VIDEO_WRITE")),
):
    if not body.video_id:
        raise HTTPException(status_code=422, detail="video_id is required for web link ingestion")
    if not tenant_scoped(user, body.tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")
    parsed = urlparse(body.url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=422, detail="Only http/https URLs are allowed")
    text = _scrape_web_text(body.url)
    if not text:
        raise HTTPException(status_code=422, detail="Could not extract readable text from URL")
    cfg = rag_engine._get_tenant_ai_settings(body.tenant_id)
    source_id = int(body.video_id)
    with _get_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE videos SET transcript = %s WHERE id = %s", [text, body.video_id])
            conn.commit()
    ingest = _chunk_embed_store(
        tenant_id=body.tenant_id,
        text=text,
        source_label=body.title or body.url,
        source_kind="video",
        source_id=source_id,
        course_id=body.course_id,
        cfg=cfg,
        override_chunking=body.chunking_strategy,
        override_embedding_model=body.embedding_model,
    )
    return {
        "status": "indexed",
        "url": body.url,
        "chunks_created": ingest["chunks_created"],
        "chunking_strategy": ingest.get("chunking_strategy"),
        "chunking_profile": ingest.get("chunking_profile"),
        "chunk_size_avg_chars": ingest.get("chunk_size_avg_chars"),
        "chunk_size_avg_words": ingest.get("chunk_size_avg_words"),
        "warnings": ingest.get("warnings", []),
    }


# ============================================================
# QUIZ GENERATION
# ============================================================
@app.post("/api/quiz/generate")
@limiter.limit("10/minute")
async def generate_quiz(
    request: Request,
    body: QuizRequest,
    user: AuthenticatedUser = Depends(require_permission("ASSESSMENT_WRITE")),
):
    if not tenant_scoped(user, body.tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")

    log.info(
        "quiz_generate",
        user_id=user.id,
        tenant_id=body.tenant_id,
        topic=body.topic,
        num_questions=body.num_questions,
    )

    # TODO: Integrate LLM quiz generation
    sample_questions = [
        {
            "id": i + 1,
            "question": f"Sample question {i + 1} about {body.topic}",
            "type": body.question_type,
            "options": ["A", "B", "C", "D"] if body.question_type == "mcq" else None,
            "correct_answer": "A" if body.question_type == "mcq" else "Sample answer",
        }
        for i in range(body.num_questions)
    ]

    return {
        "assessment_id": None,
        "topic": body.topic,
        "difficulty": body.difficulty,
        "questions": sample_questions,
    }


# ============================================================
# EMBEDDINGS (internal only)
# ============================================================
@app.post("/api/embeddings")
async def create_embeddings(
    request: Request,
    body: EmbedRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    # Only internal service calls or SUPER_ADMIN
    if user.role not in ("SUPER_ADMIN", "INTERNAL_ADMIN") and not request.headers.get("X-Internal-Secret"):
        raise HTTPException(status_code=403, detail="Internal endpoint only")

    if not tenant_scoped(user, body.tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")

    embedder = FactoryEmbedder(provider="sentence_transformer")
    embeddings = embedder.embed(body.texts)
    return {
        "embeddings": embeddings,
        "model": getattr(embedder._impl, "model_name", "unknown"),
        "dimensions": len(embeddings[0]) if embeddings else 0,
    }


# ============================================================
# AI SETTINGS (Tenant Admin only)
# ============================================================
class AISettingsUpdate(BaseModel):
    tenant_id: int
    chunking_strategy: Optional[str] = None
    embedding_model: Optional[str] = None
    llm_provider: Optional[str] = None
    retrieval_strategy: Optional[str] = None
    vector_store: Optional[str] = None

@app.put("/api/ai-settings")
async def update_ai_settings(
    request: Request,
    body: AISettingsUpdate,
    user: AuthenticatedUser = Depends(require_permission("AI_SETTINGS_UPDATE")),
):
    if not tenant_scoped(user, body.tenant_id):
        raise HTTPException(status_code=403, detail="Tenant access denied")

    log.info(
        "ai_settings_update",
        user_id=user.id,
        tenant_id=body.tenant_id,
        settings=body.model_dump(exclude_none=True),
    )

    # TODO: Persist to database
    return {"message": "AI settings updated", "settings": body.model_dump(exclude_none=True)}


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("AI_SERVICE_PORT", 8000)),
        reload=os.getenv("NODE_ENV") == "development",
    )
