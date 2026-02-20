from typing import Dict, Type
from .base_chunker import BaseChunker
from .fixed_size_chunker import FixedSizeChunker
from .page_based_chunker import PageBasedChunker
from .paragraph_chunker import ParagraphChunker
from .semantic_chunker import SemanticChunker
from .parent_child_chunker import ParentChildChunker
from .sentence_chunker import SentenceChunker
from .recursive_chunker import RecursiveChunker

class ChunkingFactory:
    """Factory for creating chunker instances"""
    
    _chunkers: Dict[str, Type[BaseChunker]] = {
        'fixed_size': FixedSizeChunker,
        'page_based': PageBasedChunker,
        'paragraph': ParagraphChunker,
        'semantic': SemanticChunker,
        'parent_child': ParentChildChunker,
        'sentence': SentenceChunker,
        'recursive': RecursiveChunker,
    }
    
    @classmethod
    def create(cls, strategy: str, **kwargs) -> BaseChunker:
        """
        Create a chunker instance
        
        Args:
            strategy: Name of chunking strategy
            **kwargs: Strategy-specific parameters
            
        Returns:
            BaseChunker instance
            
        Raises:
            ValueError: If strategy is unknown
        """
        if strategy not in cls._chunkers:
            available = ', '.join(cls._chunkers.keys())
            raise ValueError(
                f"Unknown chunking strategy: '{strategy}'. "
                f"Available strategies: {available}"
            )
        
        chunker_class = cls._chunkers[strategy]
        return chunker_class(**kwargs)
    
    @classmethod
    def list_strategies(cls) -> Dict[str, str]:
        """
        List all available chunking strategies
        
        Returns:
            Dict mapping strategy names to descriptions
        """
        strategies = {}
        for name, chunker_class in cls._chunkers.items():
            # Create instance with defaults to get description
            instance = chunker_class()
            strategies[name] = instance.get_description()
        
        return strategies
    
    @classmethod
    def register(cls, name: str, chunker_class: Type[BaseChunker]):
        """
        Register a new chunking strategy
        
        Args:
            name: Strategy name
            chunker_class: Chunker class
        """
        cls._chunkers[name] = chunker_class