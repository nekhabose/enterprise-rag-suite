from typing import List
from .base_chunker import BaseChunker, Chunk

class FixedSizeChunker(BaseChunker):
    """
    Chunks text into fixed-size pieces with optional overlap
    Best for: General documents, uniform content
    """
    
    def __init__(self, chunk_size: int = 500, overlap: int = 50, min_chunk_size: int = 50):
        super().__init__(chunk_size=chunk_size, overlap=overlap, min_chunk_size=min_chunk_size)
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.min_chunk_size = min_chunk_size
    
    def chunk(self, text: str, **metadata) -> List[Chunk]:
        self.validate_text(text)
        
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), self.chunk_size - self.overlap):
            chunk_words = words[i:i + self.chunk_size]
            
            # Skip chunks that are too small
            if len(chunk_words) < self.min_chunk_size:
                continue
            
            chunk_text = ' '.join(chunk_words)
            
            chunk_metadata = {
                'start_word': i,
                'end_word': i + len(chunk_words),
                'word_count': len(chunk_words),
                **metadata
            }
            
            chunks.append(Chunk(
                content=chunk_text,
                index=len(chunks),
                metadata=chunk_metadata
            ))
        
        return chunks
    
    def get_name(self) -> str:
        return "fixed_size"
    
    def get_description(self) -> str:
        return f"Fixed-size chunking: {self.chunk_size} words with {self.overlap} word overlap"