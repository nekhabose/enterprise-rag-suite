from typing import List
import re
from .base_chunker import BaseChunker, Chunk

class SentenceChunker(BaseChunker):
    """
    Chunks text by sentences, grouping multiple sentences together
    Best for: Precise chunking, Q&A systems, detailed retrieval
    """
    
    def __init__(self, sentences_per_chunk: int = 5, overlap_sentences: int = 1):
        super().__init__(
            sentences_per_chunk=sentences_per_chunk,
            overlap_sentences=overlap_sentences
        )
        self.sentences_per_chunk = sentences_per_chunk
        self.overlap_sentences = overlap_sentences
    
    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences using regex"""
        # Split on . ! ? followed by space and capital letter
        sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def chunk(self, text: str, **metadata) -> List[Chunk]:
        self.validate_text(text)
        
        sentences = self._split_sentences(text)
        chunks = []
        
        step = self.sentences_per_chunk - self.overlap_sentences
        
        for i in range(0, len(sentences), step):
            chunk_sentences = sentences[i:i + self.sentences_per_chunk]
            
            if not chunk_sentences:
                continue
            
            chunk_text = ' '.join(chunk_sentences)
            
            chunks.append(Chunk(
                content=chunk_text,
                index=len(chunks),
                metadata={
                    'sentence_count': len(chunk_sentences),
                    'sentence_range': f"{i}-{i + len(chunk_sentences) - 1}",
                    'char_count': len(chunk_text),
                    **metadata
                }
            ))
        
        return chunks
    
    def get_name(self) -> str:
        return "sentence"
    
    def get_description(self) -> str:
        return f"Sentence-based chunking: {self.sentences_per_chunk} sentences per chunk with {self.overlap_sentences} overlap"
    