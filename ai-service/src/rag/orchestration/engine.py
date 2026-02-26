from __future__ import annotations
from typing import Dict

from src.config.settings import settings
from src.rag.ingest.pipeline import IngestionPipeline
from src.rag.retrieval.adapters import HybridRetriever
from src.rag.rerank.noop import NoopReranker
from src.rag.llm.adapters import MockProvider


class RAGEngine:
    def __init__(self) -> None:
        self.ingestion = IngestionPipeline(
            chunking_strategy=settings.chunking_strategy,
            embedding_provider=settings.embedding_provider,
        )
        self.retriever = HybridRetriever()
        self.reranker = NoopReranker()
        self.llm = MockProvider()

    def ingest(self, tenant_id: int, source: str, text: str) -> Dict:
        return self.ingestion.ingest_text(tenant_id, source, text)

    def answer(self, tenant_id: int, question: str) -> Dict:
        docs = self.retriever.retrieve(tenant_id, question, top_k=5)
        ranked = self.reranker.rerank(docs)
        context = "\n".join([d.get("snippet", "") for d in ranked])
        prompt = f"Question: {question}\nContext: {context}"
        answer = self.llm.answer(prompt)

        return {
            "response": answer,
            "sources": [
                {
                    "source": d.get("source", "unknown"),
                    "snippet": d.get("snippet", ""),
                    "score": d.get("score", 0),
                }
                for d in ranked
            ],
        }
