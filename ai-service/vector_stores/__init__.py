"""
Vector Stores Module
Provides multiple vector store strategies via factory pattern
"""
from .base_store import BaseVectorStore, SearchResult
from .vector_store_factory import VectorStoreFactory

# Import all stores
from .faiss_store import FAISSVectorStore
from .chroma_store import ChromaDBVectorStore
from .qdrant_store import QdrantVectorStore
from .postgres_store import PostgresVectorStore
from .pinecone_store import PineconeVectorStore

__all__ = [
    'BaseVectorStore',
    'SearchResult',
    'VectorStoreFactory',
    'FAISSVectorStore',
    'ChromaDBVectorStore',
    'QdrantVectorStore',
    'PostgresVectorStore',
    'PineconeVectorStore',
]
