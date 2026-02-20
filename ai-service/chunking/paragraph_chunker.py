from typing import List
import re
from .base_chunker import BaseChunker, Chunk

class ParagraphChunker(BaseChunker):
    """
    Chunks text by paragraphs (double newlines)
    Best for: Well-structured documents, articles, books
    """
    
    def __init__(self, max_paragraphs_per_chunk: int = 5, min_paragraph_length: int = 50):
        super().__init__(
            max_paragraphs_per_chunk=max_paragraphs_per_chunk,
            min_paragraph_length=min_paragraph_length
        )
        self.max_paragraphs_per_chunk = max_paragraphs_per_chunk
        self.min_paragraph_length = min_paragraph_length
    
    def chunk(self, text: str, **metadata) -> List[Chunk]:
        self.validate_text(text)
        
        # Split by double newlines (paragraphs)
        paragraphs = re.split(r'\n\s*\n', text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        for para_idx, paragraph in enumerate(paragraphs):
            # Skip very short paragraphs
            if len(paragraph) < self.min_paragraph_length:
                continue
            
            current_chunk.append(paragraph)
            current_length += len(paragraph)
            
            # Create chunk when we reach max paragraphs
            if len(current_chunk) >= self.max_paragraphs_per_chunk:
                chunks.append(Chunk(
                    content="\n\n".join(current_chunk),
                    index=len(chunks),
                    metadata={
                        'paragraph_count': len(current_chunk),
                        'char_count': current_length,
                        'paragraph_range': f"{para_idx - len(current_chunk) + 1}-{para_idx}",
                        **metadata
                    }
                ))
                current_chunk = []
                current_length = 0
        
        # Add remaining paragraphs
        if current_chunk:
            chunks.append(Chunk(
                content="\n\n".join(current_chunk),
                index=len(chunks),
                metadata={
                    'paragraph_count': len(current_chunk),
                    'char_count': current_length,
                    **metadata
                }
            ))
        
        return chunks
    
    def get_name(self) -> str:
        return "paragraph"
    
    def get_description(self) -> str:
        return f"Paragraph-based chunking: Up to {self.max_paragraphs_per_chunk} paragraphs per chunk"