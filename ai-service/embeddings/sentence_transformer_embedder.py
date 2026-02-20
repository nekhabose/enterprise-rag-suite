"""
Sentence Transformers Embeddings Implementation
Uses sentence-transformers library with various models
"""
from typing import List
from .base_embedder import BaseEmbedder

class SentenceTransformerEmbedder(BaseEmbedder):
    """
    Sentence Transformers embeddings
    
    Popular models:
    - all-MiniLM-L6-v2: Fast, 384D
    - all-mpnet-base-v2: Balanced, 768D
    - multi-qa-mpnet-base-dot-v1: Q&A optimized, 768D
    - all-MiniLM-L12-v2: Better quality, 384D
    """
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", **kwargs):
        """
        Initialize Sentence Transformer embedder
        
        Args:
            model_name: HuggingFace model name
        """
        super().__init__(model_name=model_name, **kwargs)
        
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(model_name)
            self.model_name = model_name
            print(f"✅ Loaded Sentence Transformer: {model_name}")
        except Exception as e:
            raise Exception(f"Failed to load Sentence Transformer {model_name}: {str(e)}")
    
    def embed(self, text: str) -> List[float]:
        """
        Embed single text
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector
        """
        self.validate_text(text)
        
        try:
            # Encode single text
            embedding = self.model.encode(text, convert_to_numpy=True)
            return embedding.tolist()
            
        except Exception as e:
            raise Exception(f"Sentence Transformer embedding failed: {str(e)}")
    
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Embed multiple texts in batch
        
        Args:
            texts: List of texts
            
        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        
        try:
            # Batch encoding (more efficient)
            embeddings = self.model.encode(
                texts,
                batch_size=32,
                show_progress_bar=False,
                convert_to_numpy=True
            )
            return [emb.tolist() for emb in embeddings]
            
        except Exception as e:
            raise Exception(f"Sentence Transformer batch embedding failed: {str(e)}")
    
    def get_dimension(self) -> int:
        """Return embedding dimension"""
        return self.model.get_sentence_embedding_dimension()
    
    def get_name(self) -> str:
        """Return embedder name"""
        return f"sentence_transformer_{self.model_name.replace('-', '_').replace('/', '_')}"
    
    def get_description(self) -> str:
        """Return embedder description"""
        dim = self.get_dimension()
        return f"Sentence Transformers {self.model_name} ({dim}D)"
