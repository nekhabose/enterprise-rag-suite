from __future__ import annotations
from typing import Dict, Optional, Any, Tuple
import os
import time

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

    def answer(self, tenant_id: int, question: str, course_id: Optional[int] = None) -> Dict:
        cfg = self._get_tenant_ai_settings(tenant_id)
        retrieval_strategy = str(cfg.get("retrieval_strategy") or settings.retrieval_strategy)
        vector_store = str(cfg.get("vector_store") or settings.vector_store)
        chunking_strategy = self._normalize_chunking_strategy(str(cfg.get("chunking_strategy") or settings.chunking_strategy))
        embedding_provider = self._resolve_embedding_provider(
            embedding_provider=cfg.get("embedding_provider"),
            embedding_model=cfg.get("embedding_model"),
        )
        embedding_model = cfg.get("embedding_model")

        try:
            docs = self.retriever.retrieve(
                tenant_id,
                question,
                top_k=5,
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
                "sources": [],
            }
        ranked = self.reranker.rerank(docs)
        grounded = [d for d in ranked if float(d.get("score", 0) or 0) >= 0.5 and d.get("snippet")]

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
        context = "\n".join([d.get("snippet", "") for d in ranked])
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
            return {
                "response": (
                    f"AI provider '{provider}' is configured but failed to respond. "
                    f"Check model/API key configuration. Details: {exc}"
                ),
                "grounded": False,
                "provider_used": provider,
                "model_used": model,
                "sources": [
                    {
                        "source": d.get("source", "unknown"),
                        "snippet": d.get("snippet", ""),
                        "score": d.get("score", 0),
                    }
                    for d in ranked
                ],
            }

        return {
            "response": answer,
            "grounded": True,
            "provider_used": provider,
            "model_used": model,
            "retrieval_strategy_used": retrieval_strategy,
            "vector_store_used": vector_store,
            "chunking_strategy_used": chunking_strategy,
            "sources": [
                {
                    "source": d.get("source", "unknown"),
                    "snippet": d.get("snippet", ""),
                    "score": d.get("score", 0),
                }
                for d in ranked
            ],
        }

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
