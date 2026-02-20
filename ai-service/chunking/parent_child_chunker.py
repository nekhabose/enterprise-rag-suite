from typing import List, Tuple
from .base_chunker import BaseChunker, Chunk

class ParentChildChunker(BaseChunker):
    """
    Creates hierarchical chunks: large parent chunks and smaller child chunks
    Useful for: Better context retention, hierarchical retrieval
    """
    
    def __init__(
        self,
        parent_size: int = 2000,
        child_size: int = 400,
        child_overlap: int = 50
    ):
        super().__init__(
            parent_size=parent_size,
            child_size=child_size,
            child_overlap=child_overlap
        )
        self.parent_size = parent_size
        self.child_size = child_size
        self.child_overlap = child_overlap
    
    def chunk(self, text: str, **metadata) -> List[Chunk]:
        self.validate_text(text)
        
        words = text.split()
        chunks = []
        
        # Create parent chunks
        parent_idx = 0
        for i in range(0, len(words), self.parent_size):
            parent_words = words[i:i + self.parent_size]
            parent_text = ' '.join(parent_words)
            
            # Create child chunks within this parent
            child_chunks = self._create_children(parent_words, parent_idx, metadata)
            
            # Add parent chunk
            chunks.append(Chunk(
                content=parent_text,
                index=len(chunks),
                metadata={
                    'type': 'parent',
                    'parent_id': parent_idx,
                    'child_count': len(child_chunks),
                    'word_count': len(parent_words),
                    **metadata
                }
            ))
            
            # Add child chunks
            chunks.extend(child_chunks)
            
            parent_idx += 1
        
        return chunks
    
    def _create_children(
        self,
        parent_words: List[str],
        parent_idx: int,
        metadata: dict
    ) -> List[Chunk]:
        """Create child chunks from parent words"""
        children = []
        
        for i in range(0, len(parent_words), self.child_size - self.child_overlap):
            child_words = parent_words[i:i + self.child_size]
            
            if len(child_words) < 50:  # Skip very small children
                continue
            
            child_text = ' '.join(child_words)
            
            children.append(Chunk(
                content=child_text,
                index=-1,  # Will be set by parent
                metadata={
                    'type': 'child',
                    'parent_id': parent_idx,
                    'child_position': len(children),
                    'word_count': len(child_words),
                    **metadata
                }
            ))
        
        return children
    
    def get_name(self) -> str:
        return "parent_child"
    
    def get_description(self) -> str:
        return f"Parent-child chunking: {self.parent_size}-word parents with {self.child_size}-word children"