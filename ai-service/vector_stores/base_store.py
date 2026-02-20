"""
Base Vector Store Interface
All vector store implementations must implement this interface
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class SearchResult:
    """Search result from vector store"""
    id: str
    score: float
    metadata: Dict[str, Any]
    content: Optional[str] = None

class BaseVectorStore(ABC):
    """Abstract base class for all vector store implementations"""
    
    def __init__(self, **kwargs):
        """
        Initialize vector store with configuration
        
        Args:
            **kwargs: Store-specific parameters
        """
        self.config = kwargs
    
    @abstractmethod
    def add(
        self,
        ids: List[str],
        vectors: List[List[float]],
        metadata: List[Dict[str, Any]]
    ) -> bool:
        """
        Add vectors to the store
        
        Args:
            ids: List of unique IDs
            vectors: List of embedding vectors
            metadata: List of metadata dicts
            
        Returns:
            True if successful
        """
        pass
    
    @abstractmethod
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
        pass
    
    @abstractmethod
    def delete(self, ids: List[str]) -> bool:
        """
        Delete vectors by IDs
        
        Args:
            ids: List of IDs to delete
            
        Returns:
            True if successful
        """
        pass
    
    @abstractmethod
    def get_count(self) -> int:
        """Get total number of vectors in store"""
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """Return the name of this vector store"""
        pass
    
    @abstractmethod
    def get_description(self) -> str:
        """Return a description of this vector store"""
        pass
    
    def get_config(self) -> Dict[str, Any]:
        """Return current configuration"""
        return self.config.copy()
    
    def validate_vectors(self, vectors: List[List[float]]) -> None:
        """Validate vector dimensions are consistent"""
        if not vectors:
            return
        
        expected_dim = len(vectors[0])
        for i, vec in enumerate(vectors):
            if len(vec) != expected_dim:
                raise ValueError(
                    f"Vector {i} has dimension {len(vec)}, expected {expected_dim}"
                )
