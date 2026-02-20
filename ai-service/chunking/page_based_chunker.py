from typing import List
import re
from .base_chunker import BaseChunker, Chunk

class PageBasedChunker(BaseChunker):
    """
    Chunks text by page breaks (form feed characters)
    Best for: PDFs with clear page boundaries, preserving page structure
    """
    
    def __init__(self, combine_short_pages: bool = True, min_page_length: int = 100):
        super().__init__(combine_short_pages=combine_short_pages, min_page_length=min_page_length)
        self.combine_short_pages = combine_short_pages
        self.min_page_length = min_page_length
    
    def chunk(self, text: str, **metadata) -> List[Chunk]:
        self.validate_text(text)
        
        # Split by form feed (page break) or multiple newlines
        pages = re.split(r'\f|\n{3,}', text)
        
        chunks = []
        combined_text = ""
        combined_pages = []
        
        for page_num, page_text in enumerate(pages, start=1):
            page_text = page_text.strip()
            
            if not page_text:
                continue
            
            if self.combine_short_pages and len(page_text) < self.min_page_length:
                # Combine short pages
                combined_text += page_text + "\n\n"
                combined_pages.append(page_num)
            else:
                # Flush combined pages if any
                if combined_text:
                    chunks.append(Chunk(
                        content=combined_text.strip(),
                        index=len(chunks),
                        metadata={
                            'pages': combined_pages,
                            'type': 'combined_pages',
                            **metadata
                        }
                    ))
                    combined_text = ""
                    combined_pages = []
                
                # Add current page
                chunks.append(Chunk(
                    content=page_text,
                    index=len(chunks),
                    metadata={
                        'page': page_num,
                        'type': 'single_page',
                        'char_count': len(page_text),
                        **metadata
                    }
                ))
        
        # Flush remaining combined pages
        if combined_text:
            chunks.append(Chunk(
                content=combined_text.strip(),
                index=len(chunks),
                metadata={
                    'pages': combined_pages,
                    'type': 'combined_pages',
                    **metadata
                }
            ))
        
        return chunks
    
    def get_name(self) -> str:
        return "page_based"
    
    def get_description(self) -> str:
        return "Page-based chunking: Preserves page boundaries from PDF"