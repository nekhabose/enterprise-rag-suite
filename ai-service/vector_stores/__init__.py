"""
Vector Stores Module
Provides multiple vector store strategies via factory pattern
"""
from .base_store import BaseVectorStore, SearchResult
from .vector_store_factory import VectorStoreFactory

__all__ = [
    'BaseVectorStore',
    'SearchResult',
    'VectorStoreFactory',
]
