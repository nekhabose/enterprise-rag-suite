from typing import List
import re
from .base_chunker import BaseChunker, Chunk

class RecursiveChunker(BaseChunker):
    """
    Recursively splits text by separators (sections → paragraphs → sentences)
    Best for: Complex documents, maintaining structure
    """
    
    def __init__(self, chunk_size: int = 1000, separators: List[str] = None):
        if separators is None:
            separators = ["\n\n\n", "\n\n", "\n", ". ", " "]
        
        super().__init__(chunk_size=chunk_size, separators=separators)
        self.chunk_size = chunk_size
        self.separators = separators
    
    def _split_text(self, text: str, separator: str) -> List[str]:
        """Split text by separator"""
        if separator:
            return text.split(separator)
        return list(text)
    
    def _recursive_split(
        self,
        text: str,
        separators: List[str]
    ) -> List[str]:
        """Recursively split text using separators"""
        if not separators:
            return [text]
        
        separator = separators[0]
        remaining_separators = separators[1:]
        
        splits = self._split_text(text, separator)
        
        result = []
        current_chunk = ""
        
        for split in splits:
            # If adding this split exceeds chunk size, save current chunk
            if len(current_chunk) + len(split) > self.chunk_size and current_chunk:
                result.append(current_chunk)
                current_chunk = ""
            
            # If split itself is too large, recursively split it
            if len(split) > self.chunk_size:
                if current_chunk:
                    result.append(current_chunk)
                    current_chunk = ""
                
                # Recursive split
                result.extend(self._recursive_split(split, remaining_separators))
            else:
                # Add separator back if not empty
                if current_chunk:
                    current_chunk += separator
                current_chunk += split
        
        if current_chunk:
            result.append(current_chunk)
        
        return result
    
    def chunk(self, text: str, **metadata) -> List[Chunk]:
        self.validate_text(text)
        
        chunks_text = self._recursive_split(text, self.separators)
        
        chunks = []
        for idx, chunk_text in enumerate(chunks_text):
            if not chunk_text.strip():
                continue
            
            chunks.append(Chunk(
                content=chunk_text.strip(),
                index=len(chunks),
                metadata={
                    'char_count': len(chunk_text),
                    'type': 'recursive',
                    **metadata
                }
            ))
        
        return chunks
    
    def get_name(self) -> str:
        return "recursive"
    
    def get_description(self) -> str:
        return f"Recursive chunking: Splits by {len(self.separators)} levels of separators"