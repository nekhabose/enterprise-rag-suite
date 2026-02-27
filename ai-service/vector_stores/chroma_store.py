"""
ChromaDB Vector Store Implementation
Open-source embedding database
"""
from .base_store import BaseVectorStore, SearchResult
from typing import List, Dict, Any, Optional
import os

# Disable telemetry noise/errors from chroma in local/dev environments.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "FALSE")
os.environ.setdefault("CHROMA_TELEMETRY_IMPL", "none")
os.environ.setdefault("CHROMA_PRODUCT_TELEMETRY_IMPL", "none")

import chromadb
from chromadb.config import Settings

class ChromaDBVectorStore(BaseVectorStore):
    """
    ChromaDB vector store for embeddings
    """
    
    def __init__(
        self,
        collection_name: str = "documents",
        persist_directory: Optional[str] = None,
        distance_metric: str = "cosine",
        **kwargs
    ):
        """
        Initialize ChromaDB vector store
        
        Args:
            collection_name: Name of collection
            persist_directory: Directory to persist data
            distance_metric: Distance metric (cosine, l2, ip)
        """
        super().__init__(
            collection_name=collection_name,
            persist_directory=persist_directory,
            distance_metric=distance_metric,
            **kwargs
        )
        
        self.collection_name = collection_name
        self.persist_directory = persist_directory or "./chroma_db"
        
        # Initialize client
        try:
            chroma_settings = Settings(
                anonymized_telemetry=False,
                chroma_product_telemetry_impl="none",
            )
        except TypeError:
            chroma_settings = Settings(anonymized_telemetry=False)

        if persist_directory:
            self.client = chromadb.PersistentClient(
                path=persist_directory,
                settings=chroma_settings
            )
        else:
            self.client = chromadb.Client(
                settings=chroma_settings
            )
        
        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": distance_metric}
        )
        
        print(f"✅ ChromaDB collection '{collection_name}' initialized")
    
    def add(
        self,
        ids: List[str],
        vectors: List[List[float]],
        metadata: List[Dict[str, Any]]
    ) -> bool:
        """
        Add vectors to ChromaDB
        
        Args:
            ids: List of unique IDs
            vectors: List of embedding vectors
            metadata: List of metadata dicts
            
        Returns:
            True if successful
        """
        try:
            self.validate_vectors(vectors)
            
            # Extract documents from metadata
            documents = [m.get('content', '') for m in metadata]
            
            # Add to collection
            self.collection.add(
                ids=ids,
                embeddings=vectors,
                metadatas=metadata,
                documents=documents
            )
            
            print(f"✅ Added {len(vectors)} vectors to ChromaDB")
            return True
            
        except Exception as e:
            print(f"❌ ChromaDB add error: {str(e)}")
            return False
    
    def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filter: Optional[Dict] = None
    ) -> List[SearchResult]:
        """
        Search for similar vectors
        
        Args:
            query_vector: Query embedding vector
            top_k: Number of results to return
            filter: Optional metadata filter (where clause)
            
        Returns:
            List of search results
        """
        try:
            # Build query
            query_params = {
                "query_embeddings": [query_vector],
                "n_results": top_k
            }
            
            # Add filter if provided
            if filter:
                query_params["where"] = filter
            
            # Search
            results = self.collection.query(**query_params)
            
            # Convert to SearchResult objects
            search_results = []
            
            if results['ids'] and len(results['ids']) > 0:
                for i in range(len(results['ids'][0])):
                    search_results.append(SearchResult(
                        id=results['ids'][0][i],
                        score=results['distances'][0][i] if 'distances' in results else 0.0,
                        metadata=results['metadatas'][0][i] if 'metadatas' in results else {},
                        content=results['documents'][0][i] if 'documents' in results else ''
                    ))
            
            return search_results
            
        except Exception as e:
            print(f"❌ ChromaDB search error: {str(e)}")
            return []
    
    def delete(self, ids: List[str]) -> bool:
        """
        Delete vectors by IDs
        
        Args:
            ids: List of IDs to delete
            
        Returns:
            True if successful
        """
        try:
            self.collection.delete(ids=ids)
            print(f"✅ Deleted {len(ids)} vectors from ChromaDB")
            return True
            
        except Exception as e:
            print(f"❌ ChromaDB delete error: {str(e)}")
            return False
    
    def get_count(self) -> int:
        """Get total number of vectors"""
        return self.collection.count()
    
    def get_name(self) -> str:
        """Get store name"""
        return f"chromadb_{self.collection_name}"
    
    def get_description(self) -> str:
        """Get store description"""
        count = self.get_count()
        return f"ChromaDB collection '{self.collection_name}' ({count} vectors)"
