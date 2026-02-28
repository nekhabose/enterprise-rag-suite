"""
ChromaDB Vector Store Implementation
Open-source embedding database
"""
from .base_store import BaseVectorStore, SearchResult
from typing import List, Dict, Any, Optional
import os

# Disable anonymized telemetry, but do not override implementation class names.
# Setting *_IMPL to invalid values like "none" breaks Chroma client init because
# it expects a "module:class" path and tries to unpack it.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "FALSE")

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
        
        # Initialize client with compatibility fallbacks across Chroma versions.
        self.client = self._build_client(persist_directory=persist_directory)
        
        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": distance_metric}
        )
        
        print(f"✅ ChromaDB collection '{collection_name}' initialized")

    @staticmethod
    def _build_client(persist_directory: Optional[str]):
        try:
            if persist_directory:
                chroma_settings = Settings(
                    anonymized_telemetry=False,
                    is_persistent=True,
                    persist_directory=persist_directory,
                )
            else:
                chroma_settings = Settings(anonymized_telemetry=False)
        except TypeError:
            chroma_settings = Settings(anonymized_telemetry=False)

        errors: List[str] = []

        # Preferred: explicit settings (telemetry disabled).
        try:
            if persist_directory:
                try:
                    return chromadb.PersistentClient(path=persist_directory, settings=chroma_settings)
                except TypeError:
                    # Older Chroma builds can be happier with the generic client + persistent settings.
                    return chromadb.Client(chroma_settings)
            return chromadb.Client(settings=chroma_settings)
        except Exception as exc:
            errors.append(f"settings_client={exc}")

        # Fallback: minimal constructor, no explicit settings.
        try:
            if persist_directory:
                try:
                    return chromadb.PersistentClient(path=persist_directory)
                except TypeError:
                    return chromadb.Client(Settings(is_persistent=True, persist_directory=persist_directory))
            return chromadb.Client()
        except Exception as exc:
            errors.append(f"minimal_client={exc}")

        # Fallback: in-memory ephemeral client.
        try:
            return chromadb.EphemeralClient()
        except Exception as exc:
            errors.append(f"ephemeral_client={exc}")
            raise RuntimeError("Failed to initialize Chroma client: " + " | ".join(errors))
    
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
