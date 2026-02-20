from abc import ABC, abstractmethod
from typing import List, Dict, Any
from dataclasses import dataclass, field

@dataclass
class Chunk:
    """Represents a text chunk with metadata"""
    content: str
    index: int
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert chunk to dictionary"""
        return {
            'content': self.content,
            'index': self.index,
            'metadata': self.metadata
        }

class BaseChunker(ABC):
    """Abstract base class for all chunking strategies"""
    
    def __init__(self, **kwargs):
        """
        Initialize chunker with configuration
        
        Args:
            **kwargs: Strategy-specific parameters
        """
        self.config = kwargs
    
    @abstractmethod
    def chunk(self, text: str, **metadata) -> List[Chunk]:
        """
        Split text into chunks
        
        Args:
            text: Input text to chunk
            **metadata: Additional metadata to attach to chunks
            
        Returns:
            List of Chunk objects
        """
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """Return the name of this chunking strategy"""
        pass
    
    @abstractmethod
    def get_description(self) -> str:
        """Return a description of this chunking strategy"""
        pass
    
    def validate_text(self, text: str) -> None:
        """Validate input text"""
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
    
    def get_config(self) -> Dict[str, Any]:
        """Return current configuration"""
        return self.config.copy()