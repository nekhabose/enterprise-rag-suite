from typing import List
import re
from .base_chunker import BaseChunker, Chunk

class SemanticChunker(BaseChunker):
    """
    Chunks text based on semantic boundaries (topics/sections)
    Looks for headers, bullet points, and topic changes
    Best for: Technical documents, structured content
    """
    
    def __init__(self, max_chunk_size: int = 1000, look_for_headers: bool = True):
        super().__init__(max_chunk_size=max_chunk_size, look_for_headers=look_for_headers)
        self.max_chunk_size = max_chunk_size
        self.look_for_headers = look_for_headers
    
    def _is_header(self, line: str) -> bool:
        """Detect if a line is likely a header"""
        line = line.strip()
        if len(line) < 3:
            return False
        
        # Check for markdown-style headers
        if re.match(r'^#{1,6}\s+', line):
            return True
        
        # Check for numbered headers (1. 1.1, etc.)
        if re.match(r'^\d+\.(\d+\.)*\s+', line):
            return True
        
        # Check for ALL CAPS headers (short lines)
        if len(line) >= 4 and line.isupper() and len(line.split()) <= 10:
            return True
        
        # Check for underlined headers (next line is ===== or -----)
        return False
    
    def chunk(self, text: str, **metadata) -> List[Chunk]:
        self.validate_text(text)
        
        lines = text.split('\n')
        chunks = []
        current_section = []
        current_header = None
        current_size = 0
        
        for line_idx, line in enumerate(lines):
            line_stripped = line.strip()
            
            # Detect section boundaries
            is_boundary = False
            
            if self.look_for_headers and self._is_header(line_stripped):
                is_boundary = True
                new_header = line_stripped
            else:
                new_header = current_header
            
            # Also break on size limit
            if current_size + len(line) > self.max_chunk_size and current_section:
                is_boundary = True
            
            # Create chunk at boundary
            if is_boundary and current_section:
                chunk_text = '\n'.join(current_section)
                chunks.append(Chunk(
                    content=chunk_text,
                    index=len(chunks),
                    metadata={
                        'header': current_header,
                        'line_count': len(current_section),
                        'char_count': current_size,
                        'type': 'semantic_section',
                        **metadata
                    }
                ))
                current_section = []
                current_size = 0
            
            # Add line to current section
            current_section.append(line)
            current_size += len(line)
            current_header = new_header
        
        # Add final section
        if current_section:
            chunk_text = '\n'.join(current_section)
            chunks.append(Chunk(
                content=chunk_text,
                index=len(chunks),
                metadata={
                    'header': current_header,
                    'line_count': len(current_section),
                    'char_count': current_size,
                    'type': 'semantic_section',
                    **metadata
                }
            ))
        
        return chunks
    
    def get_name(self) -> str:
        return "semantic"
    
    def get_description(self) -> str:
        return "Semantic chunking: Splits by topic boundaries and headers"
