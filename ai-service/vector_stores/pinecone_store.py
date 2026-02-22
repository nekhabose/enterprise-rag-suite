"""
Pinecone Vector Store
"""
from typing import List, Dict, Optional
from .base_store import BaseVectorStore, SearchResult


class PineconeVectorStore(BaseVectorStore):
    """Pinecone-backed vector store."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        index_name: str = "enterprise-rag",
        cloud: str = "aws",
        region: str = "us-east-1",
        dimension: int = 1536,
        namespace: str = "default",
        **kwargs
    ):
        super().__init__(
            api_key=api_key,
            index_name=index_name,
            cloud=cloud,
            region=region,
            dimension=dimension,
            namespace=namespace,
            **kwargs
        )
        self.dimension = dimension
        self.namespace = namespace
        self.index_name = index_name

        try:
            from pinecone import Pinecone, ServerlessSpec
        except Exception as e:
            raise RuntimeError(f"Pinecone package not available: {e}")

        if not api_key:
            raise ValueError("Pinecone API key is required")

        self._pc = Pinecone(api_key=api_key)

        existing = [idx.name for idx in self._pc.list_indexes().indexes]
        if index_name not in existing:
            self._pc.create_index(
                name=index_name,
                dimension=dimension,
                metric="cosine",
                spec=ServerlessSpec(cloud=cloud, region=region)
            )
        self._index = self._pc.Index(index_name)

    def add(
        self,
        ids: List[str],
        vectors: List[List[float]],
        metadata: List[Dict]
    ) -> bool:
        self.validate_vectors(vectors)
        payload = []
        for i, vec in enumerate(vectors):
            payload.append({
                "id": ids[i],
                "values": vec,
                "metadata": metadata[i] if i < len(metadata) else {}
            })
        self._index.upsert(vectors=payload, namespace=self.namespace)
        return True

    def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filter: Optional[Dict] = None
    ) -> List[SearchResult]:
        response = self._index.query(
            vector=query_vector,
            top_k=top_k,
            namespace=self.namespace,
            include_metadata=True,
            filter=filter
        )
        results: List[SearchResult] = []
        for match in response.matches:
            results.append(
                SearchResult(
                    id=match.id,
                    score=float(match.score),
                    metadata=match.metadata or {}
                )
            )
        return results

    def delete(self, ids: List[str]) -> bool:
        self._index.delete(ids=ids, namespace=self.namespace)
        return True

    def get_count(self) -> int:
        stats = self._index.describe_index_stats()
        ns = stats.get("namespaces", {}).get(self.namespace, {})
        return int(ns.get("vector_count", 0))

    def get_name(self) -> str:
        return "pinecone"

    def get_description(self) -> str:
        return "Pinecone serverless vector database"
