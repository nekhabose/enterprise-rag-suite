"""
OpenAI Embeddings Implementation
Uses OpenAI's text-embedding models
"""
from typing import List
from .base_embedder import BaseEmbedder

class OpenAIEmbedder(BaseEmbedder):
    """OpenAI text embeddings (text-embedding-3-small, text-embedding-3-large, ada-002)"""
    
    def __init__(self, client, model: str = "text-embedding-3-small", **kwargs):
        """
        Initialize OpenAI embedder
        
        Args:
            client: OpenAI client instance
            model: Model name (text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002)
        """
        super().__init__(model=model, **kwargs)
        self.client = client
        self.model = model
        
        # Set dimensions based on model
        self.dimensions = {
            'text-embedding-3-small': 1536,
            'text-embedding-3-large': 3072,
            'text-embedding-ada-002': 1536
        }.get(model, 1536)
    
    def embed(self, text: str) -> List[float]:
        """
        Embed single text
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector
        """
        self.validate_text(text)
        
        # Truncate if too long (OpenAI limit is ~8000 tokens)
        if len(text) > 30000:
            text = text[:30000]
        
        try:
            response = self.client.embeddings.create(
                input=text,
                model=self.model
            )
            
            return response.data[0].embedding
            
        except Exception as e:
            raise Exception(f"OpenAI embedding failed: {str(e)}")
    
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
        
        # Truncate long texts
        truncated_texts = [t[:30000] if len(t) > 30000 else t for t in texts]
        
        try:
            # OpenAI supports batch embeddings (up to 2048 texts)
            if len(truncated_texts) <= 2048:
                response = self.client.embeddings.create(
                    input=truncated_texts,
                    model=self.model
                )
                return [item.embedding for item in response.data]
            else:
                # Process in batches of 2048
                all_embeddings = []
                for i in range(0, len(truncated_texts), 2048):
                    batch = truncated_texts[i:i+2048]
                    response = self.client.embeddings.create(
                        input=batch,
                        model=self.model
                    )
                    all_embeddings.extend([item.embedding for item in response.data])
                return all_embeddings
                
        except Exception as e:
            raise Exception(f"OpenAI batch embedding failed: {str(e)}")
    
    def get_dimension(self) -> int:
        """Return embedding dimension"""
        return self.dimensions
    
    def get_name(self) -> str:
        """Return embedder name"""
        return f"openai_{self.model.replace('-', '_')}"
    
    def get_description(self) -> str:
        """Return embedder description"""
        return f"OpenAI {self.model} embeddings ({self.dimensions}D)"
