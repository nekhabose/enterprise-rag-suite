from __future__ import annotations
from typing import Dict, Optional, Any, Tuple
import os
import time
import json
import hashlib

import psycopg2
from psycopg2.extras import RealDictCursor

from src.config.settings import settings
from src.rag.ingest.pipeline import IngestionPipeline
from src.rag.retrieval.adapters import HybridRetriever
from src.rag.rerank.noop import NoopReranker
from src.rag.llm.adapters import TenantAwareProvider


class RAGEngine:
    def __init__(self) -> None:
        self.ingestion = IngestionPipeline(
            chunking_strategy=settings.chunking_strategy,
            embedding_provider=settings.embedding_provider,
        )
        self.retriever = HybridRetriever()
        self.reranker = NoopReranker()
        self.llm = TenantAwareProvider()
        self.db_url = os.getenv("DATABASE_URL", "").strip()
        self._tenant_cache: Dict[int, Tuple[float, Dict[str, Any]]] = {}
        self._tenant_cache_ttl_seconds = 45.0
        self._response_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._response_cache_ttl_seconds = 90.0
        self._redis = None
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            try:
                import redis  # type: ignore
                self._redis = redis.from_url(redis_url, decode_responses=True)
            except Exception:
                self._redis = None

    def ingest(self, tenant_id: int, source: str, text: str) -> Dict:
        cfg = self._get_tenant_ai_settings(tenant_id)
        chunking = self._normalize_chunking_strategy(str(cfg.get("chunking_strategy") or settings.chunking_strategy))
        embedding_provider = self._resolve_embedding_provider(
            embedding_provider=cfg.get("embedding_provider"),
            embedding_model=cfg.get("embedding_model"),
        )
        try:
            ingestion = IngestionPipeline(
                chunking_strategy=chunking,
                embedding_provider=embedding_provider,
            )
        except Exception:
            ingestion = IngestionPipeline(
                chunking_strategy=chunking,
                embedding_provider="sentence_transformer",
            )
        return ingestion.ingest_text(tenant_id, source, text)

    def answer(self, tenant_id: int, question: str, course_id: Optional[int] = None, top_k: int = 10) -> Dict:
        cfg = self._get_tenant_ai_settings(tenant_id)
        retrieval_strategy = str(cfg.get("retrieval_strategy") or settings.retrieval_strategy)
        vector_store = str(cfg.get("vector_store") or settings.vector_store)
        chunking_strategy = self._normalize_chunking_strategy(str(cfg.get("chunking_strategy") or settings.chunking_strategy))
        embedding_provider = self._resolve_embedding_provider(
            embedding_provider=cfg.get("embedding_provider"),
            embedding_model=cfg.get("embedding_model"),
        )
        embedding_model = cfg.get("embedding_model")
        cache_key = self._make_answer_cache_key(
            tenant_id=tenant_id,
            course_id=course_id,
            question=question,
            retrieval_strategy=retrieval_strategy,
            vector_store=vector_store,
            chunking_strategy=chunking_strategy,
            embedding_provider=embedding_provider,
            embedding_model=embedding_model,
            llm_provider=str(cfg.get("llm_provider") or settings.llm_provider),
            llm_model=cfg.get("llm_model"),
        )
        cached = self._get_cached_answer(cache_key)
        if cached is not None:
            return cached

        requested_top_k = max(10, min(25, int(top_k or 10)))

        try:
            docs = self.retriever.retrieve(
                tenant_id,
                question,
                top_k=requested_top_k,
                course_id=course_id,
                retrieval_strategy=retrieval_strategy,
                vector_store=vector_store,
                chunking_strategy=chunking_strategy,
                embedding_provider=embedding_provider,
                embedding_model=embedding_model,
            )
        except Exception as exc:
            return {
                "response": (
                    f"Retrieval failed for configured strategy '{retrieval_strategy}' and vector store '{vector_store}'. "
                    f"Details: {exc}"
                ),
                "grounded": False,
                "provider_used": cfg.get("llm_provider"),
                "model_used": cfg.get("llm_model"),
                "retrieval_strategy_used": retrieval_strategy,
                "vector_store_used": vector_store,
                "chunking_strategy_used": chunking_strategy,
                "top_k_used": requested_top_k,
                "sources": [],
            }
        ranked = self.reranker.rerank(docs)
        min_ground_score = float(os.getenv("RAG_MIN_GROUND_SCORE", "0.18"))
        grounded = [d for d in ranked if float(d.get("score", 0) or 0) >= min_ground_score and d.get("snippet")]

        if not grounded:
            scope = "this course" if course_id is not None else "your available learning materials"
            return {
                "response": (
                    f"I could not find grounded content in {scope} for that question. "
                    "Please ask your faculty to upload/index relevant files or rephrase with specific topic keywords."
                ),
                "sources": [],
                "grounded": False,
            }

        ranked = grounded
        context = "\n".join([d.get("snippet", "") for d in ranked[:requested_top_k]])
        provider = str(cfg.get("llm_provider") or settings.llm_provider)
        model = cfg.get("llm_model")
        temperature = float(cfg.get("temperature") if cfg.get("temperature") is not None else 0.2)
        max_tokens = int(cfg.get("max_tokens") if cfg.get("max_tokens") is not None else 500)
        prompt = (
            f"Question: {question}\n"
            f"Context: {context}\n"
            "Instruction: Answer directly and accurately from the context. "
            "Avoid copying noisy OCR artifacts unless essential."
        )
        try:
            answer = self.llm.answer(
                prompt,
                provider=provider,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as exc:
            # Do not fail chat when tenant-selected provider is misconfigured.
            # Return a grounded fallback synthesized from retrieved context.
            fallback = self.llm.answer(
                prompt,
                provider="mock",
                model=None,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return {
                "response": fallback,
                "grounded": True,
                "provider_used": provider,
                "model_used": model,
                "llm_fallback": True,
                "warning": (
                    f"Provider '{provider}' failed; returned deterministic grounded fallback. "
                    f"Details: {exc}"
                ),
                "sources": [
                    {
                        "source": d.get("source", "unknown"),
                        "snippet": d.get("snippet", ""),
                        "score": d.get("score", 0),
                    }
                    for d in ranked[:requested_top_k]
                ],
            }

        result = {
            "response": answer,
            "grounded": True,
            "provider_used": provider,
            "model_used": model,
                "retrieval_strategy_used": retrieval_strategy,
                "vector_store_used": vector_store,
                "chunking_strategy_used": chunking_strategy,
                "top_k_used": requested_top_k,
            "sources": [
                {
                    "source": d.get("source", "unknown"),
                    "snippet": d.get("snippet", ""),
                    "score": d.get("score", 0),
                }
                for d in ranked[:requested_top_k]
            ],
        }
        self._set_cached_answer(cache_key, result)
        return result

    def _make_answer_cache_key(
        self,
        *,
        tenant_id: int,
        course_id: Optional[int],
        question: str,
        retrieval_strategy: str,
        vector_store: str,
        chunking_strategy: str,
        embedding_provider: str,
        embedding_model: Optional[str],
        llm_provider: str,
        llm_model: Optional[str],
    ) -> str:
        payload = {
            "tenant_id": tenant_id,
            "course_id": course_id,
            "q": question.strip().lower(),
            "retrieval_strategy": retrieval_strategy,
            "vector_store": vector_store,
            "chunking_strategy": chunking_strategy,
            "embedding_provider": embedding_provider,
            "embedding_model": embedding_model,
            "llm_provider": llm_provider,
            "llm_model": llm_model,
        }
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return f"rag:answer:{digest}"

    def _get_cached_answer(self, key: str) -> Optional[Dict[str, Any]]:
        now = time.time()
        hit = self._response_cache.get(key)
        if hit and (now - hit[0]) < self._response_cache_ttl_seconds:
            return hit[1]

        if self._redis is not None:
            try:
                raw = self._redis.get(key)
                if raw:
                    data = json.loads(raw)
                    self._response_cache[key] = (now, data)
                    return data
            except Exception:
                pass
        return None

    def _set_cached_answer(self, key: str, value: Dict[str, Any]) -> None:
        now = time.time()
        self._response_cache[key] = (now, value)
        if self._redis is not None:
            try:
                self._redis.setex(key, int(self._response_cache_ttl_seconds), json.dumps(value))
            except Exception:
                pass

    def _get_tenant_ai_settings(self, tenant_id: int) -> Dict[str, Any]:
        now = time.time()
        cached = self._tenant_cache.get(tenant_id)
        if cached and (now - cached[0]) < self._tenant_cache_ttl_seconds:
            return cached[1]

        default_cfg: Dict[str, Any] = {
            "llm_provider": settings.llm_provider,
            "llm_model": None,
            "temperature": 0.2,
            "max_tokens": 500,
            "chunking_strategy": settings.chunking_strategy,
            "retrieval_strategy": settings.retrieval_strategy,
            "vector_store": settings.vector_store,
            "embedding_provider": settings.embedding_provider,
            "embedding_model": "minilm",
        }
        if not self.db_url:
            return default_cfg

        try:
            with psycopg2.connect(self.db_url) as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        """
                        SELECT
                          llm_provider, llm_model, temperature, max_tokens,
                          chunking_strategy, retrieval_strategy, vector_store,
                          embedding_provider, embedding_model
                        FROM tenant_ai_settings
                        WHERE tenant_id = %s
                        LIMIT 1
                        """,
                        [tenant_id],
                    )
                    row = cur.fetchone() or {}
                    cfg = {
                        "llm_provider": row.get("llm_provider") or default_cfg["llm_provider"],
                        "llm_model": row.get("llm_model"),
                        "temperature": row.get("temperature") if row.get("temperature") is not None else default_cfg["temperature"],
                        "max_tokens": row.get("max_tokens") if row.get("max_tokens") is not None else default_cfg["max_tokens"],
                        "chunking_strategy": row.get("chunking_strategy") or default_cfg["chunking_strategy"],
                        "retrieval_strategy": row.get("retrieval_strategy") or default_cfg["retrieval_strategy"],
                        "vector_store": row.get("vector_store") or default_cfg["vector_store"],
                        "embedding_provider": row.get("embedding_provider") or default_cfg["embedding_provider"],
                        "embedding_model": row.get("embedding_model") or default_cfg["embedding_model"],
                    }
                    self._tenant_cache[tenant_id] = (now, cfg)
                    return cfg
        except Exception:
            return default_cfg

    @staticmethod
    def _resolve_embedding_provider(embedding_provider: Optional[str], embedding_model: Optional[str]) -> str:
        provider = str(embedding_provider or "").strip().lower()
        model = str(embedding_model or "").strip().lower()
        if provider:
            return provider
        if model in ("minilm", "all-minilm-l6-v2"):
            return "sentence_transformer"
        if model.startswith("text-embedding") or model == "openai":
            return "openai"
        if model.startswith("embed-") or model == "cohere":
            return "cohere"
        return settings.embedding_provider

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
        return mapping.get(v, settings.chunking_strategy)
