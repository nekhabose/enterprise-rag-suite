"""
Vector Store Factory
Create vector store instances based on strategy name
"""
from typing import Dict, Any, Optional
from .base_store import BaseVectorStore

class VectorStoreFactory:
    """Factory for creating vector store instances"""
    
    _stores: Dict[str, type] = {}
    
    @classmethod
    def register(cls, name: str, store_class: type):
        """
        Register a new vector store
        
        Args:
            name: Store name
            store_class: Store class
        """
        cls._stores[name] = store_class
    
    @classmethod
    def create(
        cls,
        strategy: str,
        dimension: int = 384,
        db_connection_string: Optional[str] = None,
        **kwargs
    ) -> BaseVectorStore:
        """
        Create vector store instance
        
        Args:
            strategy: Vector store strategy name
            dimension: Vector dimension
            db_connection_string: Database connection (for PostgreSQL)
            **kwargs: Additional parameters
            
        Returns:
            BaseVectorStore instance
        """
        available = [
            "faiss", "faiss_flat", "faiss_ivf", "faiss_hnsw",
            "chromadb", "chroma",
            "qdrant", "qdrant_memory",
            "postgres", "pgvector",
            "pinecone",
        ]
        if strategy not in available:
            raise ValueError(
                f"Unknown vector store strategy: '{strategy}'. "
                f"Available strategies: {', '.join(available)}"
            )

        # Lazy import only the selected backend so optional dependencies
        # don't break unrelated strategies (e.g. chroma without faiss installed).
        try:
            if strategy in ("chroma", "chromadb"):
                from .chroma_store import ChromaDBVectorStore
                return ChromaDBVectorStore(**kwargs)

            if strategy in ("postgres", "pgvector"):
                if not db_connection_string:
                    raise ValueError("Database connection string required for PostgreSQL")
                from .postgres_store import PostgresVectorStore
                return PostgresVectorStore(connection_string=db_connection_string, **kwargs)

            if strategy in ("qdrant", "qdrant_memory"):
                from .qdrant_store import QdrantVectorStore
                if strategy == "qdrant_memory":
                    return QdrantVectorStore(dimension=dimension, use_memory=True, **kwargs)
                return QdrantVectorStore(dimension=dimension, **kwargs)

            if strategy == "pinecone":
                from .pinecone_store import PineconeVectorStore
                return PineconeVectorStore(dimension=dimension, **kwargs)

            # FAISS variants
            from .faiss_store import FAISSVectorStore
            if strategy == "faiss_flat":
                return FAISSVectorStore(dimension=dimension, index_type="Flat", **kwargs)
            if strategy == "faiss_ivf":
                return FAISSVectorStore(dimension=dimension, index_type="IVFFlat", **kwargs)
            if strategy == "faiss_hnsw":
                return FAISSVectorStore(dimension=dimension, index_type="HNSW", **kwargs)
            return FAISSVectorStore(dimension=dimension, **kwargs)
        except Exception as e:
            raise Exception(f"Failed to create vector store '{strategy}': {str(e)}")
    
    @classmethod
    def list_strategies(cls) -> Dict[str, str]:
        """
        List all available vector store strategies
        
        Returns:
            Dict mapping strategy names to descriptions
        """
        return {
            # FAISS
            "faiss": "FAISS (default IVFFlat) - Fast local similarity search",
            "faiss_flat": "FAISS Flat - Exact search (slower but accurate)",
            "faiss_ivf": "FAISS IVFFlat - Fast approximate search",
            "faiss_hnsw": "FAISS HNSW - Hierarchical graph search",
            
            # ChromaDB
            "chromadb": "ChromaDB - Open-source embedding database",
            "chroma": "ChromaDB - Open-source embedding database",
            
            # Qdrant
            "qdrant": "Qdrant - High-performance vector search engine",
            "qdrant_memory": "Qdrant (in-memory) - Fast for testing",
            
            # PostgreSQL
            "postgres": "PostgreSQL + pgvector - Existing database",
            "pgvector": "PostgreSQL + pgvector - Existing database",
            "pinecone": "Pinecone - Managed serverless vector database",
        }
    
    @classmethod
    def get_recommended(cls) -> Dict[str, str]:
        """
        Get recommended stores for different use cases
        
        Returns:
            Dict of use case to recommended store
        """
        return {
            "speed": "faiss_hnsw",
            "accuracy": "faiss_flat",
            "scale": "qdrant",
            "ease_of_use": "chromadb",
            "existing_db": "postgres",
            "managed_saas": "pinecone",
            "production": "qdrant",
            "development": "chromadb",
            "local": "faiss",
        }


# Initialize factory
def initialize_vector_store_factory():
    """Initialize factory with any custom stores"""
    pass

initialize_vector_store_factory()
