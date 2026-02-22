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
        from .faiss_store import FAISSVectorStore
        from .chroma_store import ChromaDBVectorStore
        from .qdrant_store import QdrantVectorStore
        from .postgres_store import PostgresVectorStore
        from .pinecone_store import PineconeVectorStore
        
        # Store mapping
        stores = {
            # FAISS
            "faiss": lambda **kw: FAISSVectorStore(dimension=dimension, **kw),
            "faiss_flat": lambda **kw: FAISSVectorStore(dimension=dimension, index_type="Flat", **kw),
            "faiss_ivf": lambda **kw: FAISSVectorStore(dimension=dimension, index_type="IVFFlat", **kw),
            "faiss_hnsw": lambda **kw: FAISSVectorStore(dimension=dimension, index_type="HNSW", **kw),
            
            # ChromaDB
            "chromadb": lambda **kw: ChromaDBVectorStore(**kw),
            "chroma": lambda **kw: ChromaDBVectorStore(**kw),
            
            # Qdrant
            "qdrant": lambda **kw: QdrantVectorStore(dimension=dimension, **kw),
            "qdrant_memory": lambda **kw: QdrantVectorStore(dimension=dimension, use_memory=True, **kw),
            
            # PostgreSQL (existing)
            "postgres": lambda **kw: PostgresVectorStore(connection_string=db_connection_string, **kw),
            "pgvector": lambda **kw: PostgresVectorStore(connection_string=db_connection_string, **kw),
            "pinecone": lambda **kw: PineconeVectorStore(dimension=dimension, **kw),
        }
        
        if strategy not in stores:
            available = list(stores.keys())
            raise ValueError(
                f"Unknown vector store strategy: '{strategy}'. "
                f"Available strategies: {', '.join(available)}"
            )
        
        store_factory = stores[strategy]
        
        # Create store with appropriate parameters
        try:
            if strategy.startswith("postgres") or strategy == "pgvector":
                if not db_connection_string:
                    raise ValueError("Database connection string required for PostgreSQL")
                return store_factory(**kwargs)
            else:
                return store_factory(**kwargs)
                
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
