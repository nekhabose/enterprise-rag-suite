from abc import ABC, abstractmethod
from typing import List, Dict, Any

class BaseEmbedder(ABC):
    """Abstract base class for all embedding strategies"""
    
    def __init__(self, **kwargs):
        """
        Initialize embedder with configuration
        
        Args:
            **kwargs: Strategy-specific parameters
        """
        self.config = kwargs
    
    @abstractmethod
    def embed(self, text: str) -> List[float]:
        """
        Convert text to embedding vector
        
        Args:
            text: Input text to embed
            
        Returns:
            List of floats representing the embedding
        """
        pass
    
    @abstractmethod
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Convert multiple texts to embeddings
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embedding vectors
        """
        pass
    
    @abstractmethod
    def get_dimension(self) -> int:
        """Return the dimension of embeddings produced"""
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """Return the name of this embedding strategy"""
        pass
    
    @abstractmethod
    def get_description(self) -> str:
        """Return a description of this embedding strategy"""
        pass
    
    def validate_text(self, text: str) -> None:
        """Validate input text"""
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
    
    def get_config(self) -> Dict[str, Any]:
        """Return current configuration"""
        return self.config.copy()
