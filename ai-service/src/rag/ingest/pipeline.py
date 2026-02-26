from __future__ import annotations
from typing import Dict

from src.rag.chunking.adapters import FactoryChunker
from src.rag.embedding.adapters import FactoryEmbedder
from src.rag.vector.adapters import InMemoryVectorStore


class IngestionPipeline:
    def __init__(self, chunking_strategy: str, embedding_provider: str) -> None:
        self.chunker = FactoryChunker(chunking_strategy)
        self.embedder = FactoryEmbedder(embedding_provider)
        self.store = InMemoryVectorStore()

    def ingest_text(self, tenant_id: int, source: str, text: str) -> Dict:
        chunks = self.chunker.chunk(text)
        vectors = self.embedder.embed(chunks) if chunks else []

        docs = [
            {
                "id": f"{source}-{idx}",
                "text": chunk,
                "vector": vectors[idx] if idx < len(vectors) else [],
                "source": source,
            }
            for idx, chunk in enumerate(chunks)
        ]

        self.store.upsert(tenant_id, docs)
        return {"chunks": len(chunks), "source": source}
