from __future__ import annotations

from typing import Dict, List, Optional, Any, Tuple
import os
import re
import zlib
import uuid
from functools import lru_cache
from pathlib import Path
import math

import psycopg2
from psycopg2.extras import RealDictCursor

from src.rag.chunking.adapters import FactoryChunker
from src.rag.embedding.adapters import FactoryEmbedder


class PostgresKeywordRetriever:
    _whisper_model = None

    def __init__(self) -> None:
        self.db_url = os.getenv("DATABASE_URL", "")

    def _connect(self):
        if not self.db_url:
            raise RuntimeError("DATABASE_URL is not configured")
        return psycopg2.connect(self.db_url)

    def retrieve(
        self,
        tenant_id: int,
        query: str,
        top_k: int = 5,
        course_id: Optional[int] = None,
        **kwargs: Any,
    ) -> List[Dict]:
        retrieval_strategy_raw = str(kwargs.get("retrieval_strategy") or "hybrid").lower()
        retrieval_strategy = {
            "bm25": "keyword",
            "lexical": "keyword",
        }.get(retrieval_strategy_raw, retrieval_strategy_raw)
        vector_store_raw = str(kwargs.get("vector_store") or "postgres").lower()
        vector_store = {
            "pgvector": "postgres",
            "chromadb": "chroma",
        }.get(vector_store_raw, vector_store_raw)
        chunking_strategy = self._normalize_chunking_strategy(str(kwargs.get("chunking_strategy") or "semantic"))
        embedding_provider_raw = kwargs.get("embedding_provider")
        embedding_model_raw = kwargs.get("embedding_model")

        tokens = [t for t in re.findall(r"[a-zA-Z0-9_]+", query.lower()) if len(t) >= 3][:8]
        if not tokens:
            tokens = [query.lower()[:64]]
        top_k = max(1, min(12, int(top_k)))

        embedding_provider, embedding_model = self._resolve_embedding_choice(
            embedding_provider_raw=embedding_provider_raw,
            embedding_model_raw=embedding_model_raw,
        )
        sources = self._collect_source_texts(tenant_id=tenant_id, course_id=course_id, limit=20)
        chunks = self._build_chunks_from_sources(sources=sources, chunking_strategy=chunking_strategy, max_chunks=180)
        if not chunks:
            return []

        keyword_scores = self._keyword_scores(chunks=chunks, tokens=tokens)
        semantic_scores: Dict[str, float] = {}

        if retrieval_strategy in ("semantic", "hybrid"):
            if vector_store in ("postgres", "pgvector"):
                semantic_scores = self._semantic_scores_postgres(
                    tenant_id=tenant_id,
                    course_id=course_id,
                    query=query,
                    top_k=max(top_k * 2, 8),
                    embedding_provider=embedding_provider,
                    embedding_model=embedding_model,
                )
                if not semantic_scores:
                    semantic_scores = self._semantic_scores_in_memory(
                        query=query,
                        chunks=chunks,
                        embedding_provider=embedding_provider,
                        embedding_model=embedding_model,
                    )
            elif vector_store in ("chroma", "chromadb"):
                semantic_scores = self._semantic_scores_chroma(
                    query=query,
                    chunks=chunks,
                    embedding_provider=embedding_provider,
                    embedding_model=embedding_model,
                )
                if not semantic_scores:
                    semantic_scores = self._semantic_scores_in_memory(
                        query=query,
                        chunks=chunks,
                        embedding_provider=embedding_provider,
                        embedding_model=embedding_model,
                    )
            else:
                semantic_scores = self._semantic_scores_in_memory(
                    query=query,
                    chunks=chunks,
                    embedding_provider=embedding_provider,
                    embedding_model=embedding_model,
                )

        rows = self._rank_chunks(
            chunks=chunks,
            keyword_scores=keyword_scores,
            semantic_scores=semantic_scores,
            retrieval_strategy=retrieval_strategy,
            top_k=top_k,
        )
        merged = self._merge_rows([], rows, top_k=top_k)

        return [
            {
                "tenant_id": tenant_id,
                "source": str(r.get("source_name") or r.get("source_id") or "content"),
                "snippet": str(r.get("snippet") or ""),
                "score": float(r.get("score", max(0.5, 1.0 - (idx * 0.08)))),
            }
            for idx, r in enumerate(merged[:top_k])
        ]

    def _resolve_embedding_choice(
        self,
        embedding_provider_raw: Optional[str],
        embedding_model_raw: Optional[str],
    ) -> Tuple[str, Optional[str]]:
        provider = str(embedding_provider_raw or "").strip().lower()
        model = str(embedding_model_raw or "").strip() or None

        if not provider and model:
            lowered = model.lower()
            if lowered in ("minilm", "all-minilm-l6-v2"):
                provider = "sentence_transformer"
                model = "all-MiniLM-L6-v2"
            elif lowered.startswith("text-embedding") or lowered == "openai":
                provider = "openai"
            elif lowered.startswith("embed-") or lowered == "cohere":
                provider = "cohere"

        if not provider:
            provider = "sentence_transformer"
        if provider == "sentence_transformer" and model and model.lower() in ("minilm", "all-minilm-l6-v2"):
            model = "all-MiniLM-L6-v2"
        if provider == "sentence_transformer" and not model:
            model = "all-MiniLM-L6-v2"
        return provider, model

    def _collect_source_texts(self, tenant_id: int, course_id: Optional[int], limit: int) -> List[Dict[str, str]]:
        sources: List[Dict[str, str]] = []
        with self._connect() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                doc_sql = """
                  SELECT id, filename, file_path, uploaded_at
                  FROM documents
                  WHERE tenant_id = %s
                """
                doc_params: List[object] = [tenant_id]
                if course_id is not None:
                    doc_sql += " AND course_id = %s"
                    doc_params.append(course_id)
                doc_sql += " ORDER BY uploaded_at DESC LIMIT %s"
                doc_params.append(limit)
                cur.execute(doc_sql, doc_params)
                documents = list(cur.fetchall())

                for doc in documents:
                    filename = str(doc.get("filename") or f"document:{doc.get('id')}")
                    file_path = str(doc.get("file_path") or "")
                    text = self._extract_document_text(file_path, filename) if file_path else ""
                    if text:
                        sources.append({
                            "source_name": filename,
                            "source_id": f"document:{doc.get('id')}",
                            "text": text,
                        })

                vid_sql = """
                  SELECT id, title, source_type, youtube_url, transcript, file_path, created_at
                  FROM videos
                  WHERE tenant_id = %s
                """
                vid_params: List[object] = [tenant_id]
                if course_id is not None:
                    vid_sql += " AND course_id = %s"
                    vid_params.append(course_id)
                vid_sql += " ORDER BY created_at DESC LIMIT %s"
                vid_params.append(limit)
                cur.execute(vid_sql, vid_params)
                videos = list(cur.fetchall())

                for vid in videos:
                    transcript = self._ensure_video_transcript(conn, vid)
                    if transcript:
                        sources.append({
                            "source_name": str(vid.get("title") or vid.get("youtube_url") or f"video:{vid.get('id')}"),
                            "source_id": f"video:{vid.get('id')}",
                            "text": transcript,
                        })
        return sources

    def _build_chunks_from_sources(self, sources: List[Dict[str, str]], chunking_strategy: str, max_chunks: int) -> List[Dict[str, str]]:
        chunks: List[Dict[str, str]] = []
        try:
            chunker = FactoryChunker(chunking_strategy)
        except Exception:
            chunker = FactoryChunker("semantic")

        for src in sources:
            raw_text = str(src.get("text") or "")
            if not raw_text:
                continue
            try:
                pieces = chunker.chunk(raw_text)
            except Exception:
                pieces = [raw_text[:2000]]
            if not pieces:
                pieces = [raw_text[:2000]]
            for idx, piece in enumerate(pieces):
                snippet = self._best_snippet(piece, [], max_len=380)
                if not snippet:
                    continue
                chunks.append({
                    "source_name": str(src.get("source_name") or "content"),
                    "source_id": str(src.get("source_id") or "source"),
                    "chunk_id": f"{src.get('source_id')}:{idx}",
                    "snippet": snippet,
                    "text": piece,
                })
                if len(chunks) >= max_chunks:
                    return chunks
        return chunks

    def _keyword_scores(self, chunks: List[Dict[str, str]], tokens: List[str]) -> Dict[str, float]:
        return {
            str(c["chunk_id"]): self._score_text(str(c.get("text") or c.get("snippet") or ""), tokens)
            for c in chunks
        }

    def _semantic_scores_in_memory(
        self,
        query: str,
        chunks: List[Dict[str, str]],
        embedding_provider: str,
        embedding_model: Optional[str],
    ) -> Dict[str, float]:
        texts = [str(c.get("text") or c.get("snippet") or "") for c in chunks]
        vectors = self._embed_texts([query, *texts], provider=embedding_provider, model=embedding_model)
        if len(vectors) < 2:
            return {}
        q_vec = vectors[0]
        result: Dict[str, float] = {}
        for idx, chunk in enumerate(chunks):
            sim = self._cosine_similarity(q_vec, vectors[idx + 1])
            result[str(chunk["chunk_id"])] = max(0.0, min(1.0, sim))
        return result

    def _semantic_scores_chroma(
        self,
        query: str,
        chunks: List[Dict[str, str]],
        embedding_provider: str,
        embedding_model: Optional[str],
    ) -> Dict[str, float]:
        try:
            import chromadb
            from chromadb.config import Settings as ChromaSettings
        except Exception:
            return {}

        os.environ.setdefault("ANONYMIZED_TELEMETRY", "FALSE")
        os.environ.setdefault("CHROMA_TELEMETRY_IMPL", "none")
        os.environ.setdefault("CHROMA_PRODUCT_TELEMETRY_IMPL", "none")

        texts = [str(c.get("text") or c.get("snippet") or "") for c in chunks]
        vectors = self._embed_texts([query, *texts], provider=embedding_provider, model=embedding_model)
        if len(vectors) < 2:
            return {}
        q_vec = vectors[0]
        chunk_vecs = vectors[1:]
        chunk_ids = [str(c["chunk_id"]) for c in chunks]

        try:
            try:
                chroma_settings = ChromaSettings(
                    anonymized_telemetry=False,
                    chroma_product_telemetry_impl="none",
                )
            except TypeError:
                chroma_settings = ChromaSettings(anonymized_telemetry=False)
            client = chromadb.Client(settings=chroma_settings)
            collection_name = f"tenant_runtime_retrieval_{uuid.uuid4().hex}"
            collection = client.create_collection(name=collection_name, metadata={"hnsw:space": "cosine"})
            collection.add(
                ids=chunk_ids,
                embeddings=chunk_vecs,
                documents=texts,
                metadatas=[{"source": str(c.get("source_name") or "")} for c in chunks],
            )
            result = collection.query(query_embeddings=[q_vec], n_results=min(len(chunk_ids), 30))
            ids = (result.get("ids") or [[]])[0]
            distances = (result.get("distances") or [[]])[0]
            out: Dict[str, float] = {}
            for cid, dist in zip(ids, distances):
                # Chroma cosine distance: lower is better, convert to similarity-ish.
                sim = max(0.0, 1.0 - float(dist))
                out[str(cid)] = sim
            try:
                client.delete_collection(collection_name)
            except Exception:
                pass
            return out
        except Exception:
            return {}

    def _semantic_scores_postgres(
        self,
        tenant_id: int,
        course_id: Optional[int],
        query: str,
        top_k: int,
        embedding_provider: str,
        embedding_model: Optional[str],
    ) -> Dict[str, float]:
        query_vecs = self._embed_texts([query], provider=embedding_provider, model=embedding_model)
        if not query_vecs:
            return {}
        vec = query_vecs[0]
        vec_literal = "[" + ",".join(f"{float(v):.8f}" for v in vec) + "]"

        doc_course_filter = ""
        vid_course_filter = ""
        course_params: List[object] = []
        if course_id is not None:
            doc_course_filter = " AND d.course_id = %s"
            vid_course_filter = " AND v.course_id = %s"
            course_params.extend([course_id, course_id])

        try:
            with self._connect() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    sql = f"""
                        SELECT
                          CASE WHEN d.id IS NOT NULL THEN CONCAT('document:', d.id, ':', c.chunk_index) ELSE CONCAT('video:', v.id, ':', c.chunk_index) END AS chunk_id,
                          COALESCE(d.filename, v.title, v.youtube_url, 'Content') AS source_name,
                          LEFT(c.content, 360) AS snippet,
                          (1 - (c.embedding <=> %s::vector)) AS similarity
                        FROM chunks c
                        LEFT JOIN documents d ON d.id = c.document_id
                        LEFT JOIN videos v ON v.id = c.video_id
                        WHERE c.tenant_id = %s
                          AND c.embedding IS NOT NULL
                          AND (
                            (d.id IS NOT NULL {doc_course_filter}) OR
                            (v.id IS NOT NULL {vid_course_filter})
                          )
                        ORDER BY c.embedding <=> %s::vector
                        LIMIT %s
                        """
                    params: List[object] = [vec_literal, tenant_id, *course_params, vec_literal, top_k]
                    cur.execute(
                        sql,
                        params,
                    )
                    rows = list(cur.fetchall())
                    return {
                        str(r.get("chunk_id")): max(0.0, min(1.0, float(r.get("similarity") or 0.0)))
                        for r in rows
                    }
        except Exception:
            return {}

    def _embed_texts(self, texts: List[str], provider: str, model: Optional[str]) -> List[List[float]]:
        try:
            embedder = FactoryEmbedder(provider=provider, model=model)
            return embedder.embed(texts)
        except Exception:
            fallback = FactoryEmbedder(provider="sentence_transformer", model="all-MiniLM-L6-v2")
            return fallback.embed(texts)

    @staticmethod
    def _cosine_similarity(a: List[float], b: List[float]) -> float:
        if not a or not b or len(a) != len(b):
            return 0.0
        dot = sum(float(x) * float(y) for x, y in zip(a, b))
        na = math.sqrt(sum(float(x) * float(x) for x in a))
        nb = math.sqrt(sum(float(y) * float(y) for y in b))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)

    def _rank_chunks(
        self,
        chunks: List[Dict[str, str]],
        keyword_scores: Dict[str, float],
        semantic_scores: Dict[str, float],
        retrieval_strategy: str,
        top_k: int,
    ) -> List[Dict]:
        rows: List[Dict] = []
        for chunk in chunks:
            cid = str(chunk["chunk_id"])
            k = float(keyword_scores.get(cid, 0.0))
            s = float(semantic_scores.get(cid, 0.0))
            if retrieval_strategy == "keyword":
                score = k
            elif retrieval_strategy == "semantic":
                score = s
            else:
                score = (0.65 * s) + (0.35 * k)
            if score <= 0:
                continue
            rows.append({
                "source_name": chunk.get("source_name"),
                "source_id": chunk.get("source_id"),
                "snippet": chunk.get("snippet"),
                "score": max(0.52, min(0.98, score)),
            })
        rows.sort(key=lambda r: float(r.get("score", 0.0)), reverse=True)
        return rows[:max(top_k * 2, top_k)]

    @staticmethod
    def _normalize_chunking_strategy(value: str) -> str:
        v = (value or "").strip().lower()
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
        return mapping.get(v, "semantic")

    def _retrieve_from_course_files(
        self,
        tenant_id: int,
        course_id: Optional[int],
        tokens: List[str],
        top_k: int,
    ) -> List[Dict]:
        extra_rows: List[Dict] = []
        with self._connect() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                doc_sql = """
                  SELECT id, filename, file_path, uploaded_at
                  FROM documents
                  WHERE tenant_id = %s
                """
                doc_params: List[object] = [tenant_id]
                if course_id is not None:
                    doc_sql += " AND course_id = %s"
                    doc_params.append(course_id)
                doc_sql += " ORDER BY uploaded_at DESC LIMIT 12"
                cur.execute(doc_sql, doc_params)
                documents = list(cur.fetchall())

                for doc in documents:
                    file_path = str(doc.get("file_path") or "")
                    if not file_path:
                        continue
                    text = self._extract_document_text(file_path, str(doc.get("filename") or ""))
                    if not text:
                        continue
                    score = self._score_text(text, tokens)
                    snippet = self._best_snippet(text, tokens)
                    if not snippet:
                        continue
                    if score > 0:
                        score = max(0.62, score)
                    else:
                        # keep as low-confidence grounded context from same course
                        score = 0.52
                    extra_rows.append({
                        "source_name": str(doc.get("filename") or f"document:{doc.get('id')}"),
                        "snippet": snippet,
                        "source_id": f"document:{doc.get('id')}",
                        "score": score,
                    })

                vid_sql = """
                  SELECT id, title, source_type, youtube_url, transcript, file_path, created_at
                  FROM videos
                  WHERE tenant_id = %s
                """
                vid_params: List[object] = [tenant_id]
                if course_id is not None:
                    vid_sql += " AND course_id = %s"
                    vid_params.append(course_id)
                vid_sql += " ORDER BY created_at DESC LIMIT 12"
                cur.execute(vid_sql, vid_params)
                videos = list(cur.fetchall())

                for vid in videos:
                    transcript = self._ensure_video_transcript(conn, vid)
                    if transcript:
                        score = self._score_text(transcript, tokens)
                        snippet = self._best_snippet(transcript, tokens) or transcript[:300]
                        extra_rows.append({
                            "source_name": str(vid.get("title") or vid.get("youtube_url") or f"video:{vid.get('id')}"),
                            "snippet": snippet,
                            "source_id": f"video:{vid.get('id')}",
                            "score": max(0.58, score if score > 0 else 0.54),
                        })
        extra_rows.sort(key=lambda r: float(r.get("score", 0)), reverse=True)
        return extra_rows[:top_k]

    def _ensure_video_transcript(self, conn, video_row: Dict) -> str:
        transcript = str(video_row.get("transcript") or "").strip()
        if transcript:
            return transcript

        source_type = str(video_row.get("source_type") or "")
        file_path = str(video_row.get("file_path") or "")
        if source_type != "upload" or not file_path or not Path(file_path).exists():
            return ""

        text = self._transcribe_uploaded_video(file_path)
        if not text:
            return ""

        normalized = self._normalize_extracted_text(text)
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE videos SET transcript = %s WHERE id = %s", [normalized, video_row.get("id")])
        except Exception:
            pass
        return normalized

    @classmethod
    def _transcribe_uploaded_video(cls, file_path: str) -> str:
        try:
            import whisper
        except Exception:
            return ""

        try:
            if cls._whisper_model is None:
                cls._whisper_model = whisper.load_model("base")
            result = cls._whisper_model.transcribe(file_path, verbose=False)
            return str(result.get("text") or "").strip()
        except Exception:
            return ""

    @staticmethod
    def _score_text(text: str, tokens: List[str]) -> float:
        if not text:
            return 0.0
        lower = text.lower()
        hits = sum(1 for t in tokens if t and t in lower)
        if not tokens:
            return 0.0
        return min(0.95, hits / len(tokens))

    @staticmethod
    def _best_snippet(text: str, tokens: List[str], max_len: int = 320) -> str:
        normalized = re.sub(r"\s+", " ", text).strip()
        if not normalized:
            return ""
        lower = normalized.lower()
        positions = [lower.find(t) for t in tokens if t and lower.find(t) >= 0]
        if positions:
            start = max(0, min(positions) - 120)
            end = min(len(normalized), start + max_len)
            return normalized[start:end]
        return normalized[:max_len]

    @staticmethod
    @lru_cache(maxsize=256)
    def _extract_document_text(file_path: str, filename: str) -> str:
        ext = os.path.splitext(filename.lower())[1]
        try:
            if ext in {".txt", ".md", ".csv", ".json", ".py", ".ts", ".tsx", ".js"}:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    return f.read()
            if ext == ".pdf":
                return PostgresKeywordRetriever._extract_pdf_text(file_path)
            with open(file_path, "rb") as f:
                raw = f.read()
            return PostgresKeywordRetriever._extract_printable_text(raw)
        except Exception:
            return ""

    @staticmethod
    def _extract_pdf_text(file_path: str) -> str:
        try:
            with open(file_path, "rb") as f:
                raw = f.read()
        except Exception:
            return ""

        chunks: List[str] = []
        for stream in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, flags=re.S):
            payload = stream.group(1)
            for candidate in (payload, PostgresKeywordRetriever._maybe_decompress(payload)):
                if not candidate:
                    continue
                chunks.extend(PostgresKeywordRetriever._extract_pdf_text_ops(candidate))

        if not chunks:
            return PostgresKeywordRetriever._extract_printable_text(raw)

        text = " ".join(chunks)
        return PostgresKeywordRetriever._normalize_extracted_text(text)

    @staticmethod
    def _maybe_decompress(data: bytes) -> bytes:
        try:
            return zlib.decompress(data)
        except Exception:
            return b""

    @staticmethod
    def _extract_pdf_text_ops(data: bytes) -> List[str]:
        out: List[str] = []
        for m in re.finditer(rb"\((.*?)\)\s*Tj", data, flags=re.S):
            out.append(PostgresKeywordRetriever._decode_pdf_string(m.group(1)))
        for m in re.finditer(rb"\[(.*?)\]\s*TJ", data, flags=re.S):
            arr = m.group(1)
            for p in re.finditer(rb"\((.*?)\)", arr, flags=re.S):
                out.append(PostgresKeywordRetriever._decode_pdf_string(p.group(1)))
        return [t for t in out if t.strip()]

    @staticmethod
    def _decode_pdf_string(data: bytes) -> str:
        try:
            s = data.decode("latin-1", errors="ignore")
        except Exception:
            return ""
        s = s.replace("\\(", "(").replace("\\)", ")").replace("\\n", " ").replace("\\r", " ").replace("\\t", " ")
        return re.sub(r"\s+", " ", s).strip()

    @staticmethod
    def _extract_printable_text(raw: bytes) -> str:
        text = raw.decode("latin-1", errors="ignore")
        runs = re.findall(r"[A-Za-z0-9][A-Za-z0-9 ,.;:()/_+\-\n]{20,}", text)
        return PostgresKeywordRetriever._normalize_extracted_text(" ".join(runs))

    @staticmethod
    def _normalize_extracted_text(text: str) -> str:
        normalized = re.sub(r"\s+", " ", text).strip()
        # Collapse PDF artifacts like "P y t h o n" -> "Python"
        normalized = re.sub(
            r"\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b",
            lambda m: m.group(0).replace(" ", ""),
            normalized,
        )
        return re.sub(r"\s+", " ", normalized).strip()

    @staticmethod
    def _merge_rows(primary: List[Dict], secondary: List[Dict], top_k: int) -> List[Dict]:
        seen = set()
        merged: List[Dict] = []
        for row in [*primary, *secondary]:
            key = (str(row.get("source_id") or row.get("source_name") or ""), str(row.get("snippet") or ""))
            if key in seen:
                continue
            seen.add(key)
            merged.append(row)
            if len(merged) >= max(top_k, 8):
                break
        return merged

    @staticmethod
    def _fallback_params(
        tenant_id: int,
        course_id: Optional[int],
        doc_like: List[str],
        video_like: List[str],
        limit: int,
    ) -> List[object]:
        params: List[object] = [tenant_id]
        if course_id is not None:
            params.append(course_id)
        params.extend(doc_like)
        params.append(tenant_id)
        if course_id is not None:
            params.append(course_id)
        params.extend(video_like)
        params.append(limit)
        return params
