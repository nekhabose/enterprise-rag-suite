"""
Qdrant Vector Store Implementation
High-performance vector search engine
"""
from .base_store import BaseVectorStore, SearchResult
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue
)

class QdrantVectorStore(BaseVectorStore):
    """
    Qdrant vector store for high-performance search
    """
    
    def __init__(
        self,
        collection_name: str = "documents",
        host: str = "localhost",
        port: int = 6333,
        dimension: int = 384,
        distance_metric: str = "cosine",
        use_memory: bool = True,
        **kwargs
    ):
        """
        Initialize Qdrant vector store
        
        Args:
            collection_name: Name of collection
            host: Qdrant host
            port: Qdrant port
            dimension: Vector dimension
            distance_metric: Distance metric (cosine, euclid, dot)
            use_memory: Use in-memory mode (for testing)
        """
        super().__init__(
            collection_name=collection_name,
            host=host,
            port=port,
            dimension=dimension,
            distance_metric=distance_metric,
            **kwargs
        )
        
        self.collection_name = collection_name
        self.dimension = dimension
        
        # Distance mapping
        distance_map = {
            "cosine": Distance.COSINE,
            "euclid": Distance.EUCLID,
            "dot": Distance.DOT
        }
        self.distance = distance_map.get(distance_metric, Distance.COSINE)
        
        # Initialize client
        if use_memory:
            self.client = QdrantClient(":memory:")
            print("✅ Qdrant in-memory client initialized")
        else:
            self.client = QdrantClient(host=host, port=port)
            print(f"✅ Qdrant client connected to {host}:{port}")
        
        # Create collection if not exists
        try:
            self.client.get_collection(collection_name)
            print(f"✅ Using existing collection '{collection_name}'")
        except:
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=dimension,
                    distance=self.distance
                )
            )
            print(f"✅ Created collection '{collection_name}'")
    
    def add(
        self,
        ids: List[str],
        vectors: List[List[float]],
        metadata: List[Dict[str, Any]]
    ) -> bool:
        """
        Add vectors to Qdrant
        
        Args:
            ids: List of unique IDs
            vectors: List of embedding vectors
            metadata: List of metadata dicts
            
        Returns:
            True if successful
        """
        try:
            self.validate_vectors(vectors)
            
            # Create points
            points = []
            for id, vector, meta in zip(ids, vectors, metadata):
                points.append(PointStruct(
                    id=id,
                    vector=vector,
                    payload=meta
                ))
            
            # Upload points
            self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )
            
            print(f"✅ Added {len(vectors)} vectors to Qdrant")
            return True
            
        except Exception as e:
            print(f"❌ Qdrant add error: {str(e)}")
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
            filter: Optional metadata filter
            
        Returns:
            List of search results
        """
        try:
            # Build filter if provided
            query_filter = None
            if filter:
                conditions = []
                for key, value in filter.items():
                    conditions.append(
                        FieldCondition(
                            key=key,
                            match=MatchValue(value=value)
                        )
                    )
                if conditions:
                    query_filter = Filter(must=conditions)
            
            # Search
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                limit=top_k,
                query_filter=query_filter
            )
            
            # Convert to SearchResult objects
            search_results = []
            for result in results:
                search_results.append(SearchResult(
                    id=str(result.id),
                    score=result.score,
                    metadata=result.payload or {},
                    content=result.payload.get('content', '') if result.payload else ''
                ))
            
            return search_results
            
        except Exception as e:
            print(f"❌ Qdrant search error: {str(e)}")
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
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=ids
            )
            
            print(f"✅ Deleted {len(ids)} vectors from Qdrant")
            return True
            
        except Exception as e:
            print(f"❌ Qdrant delete error: {str(e)}")
            return False
    
    def get_count(self) -> int:
        """Get total number of vectors"""
        try:
            collection_info = self.client.get_collection(self.collection_name)
            return collection_info.points_count
        except:
            return 0
    
    def get_name(self) -> str:
        """Get store name"""
        return f"qdrant_{self.collection_name}"
    
    def get_description(self) -> str:
        """Get store description"""
        count = self.get_count()
        return f"Qdrant collection '{self.collection_name}' ({count} vectors, {self.dimension}d)"
