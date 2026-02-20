"""
Voyage AI Embeddings Implementation
High-quality embeddings from Voyage AI
"""
from typing import List
from .base_embedder import BaseEmbedder

class VoyageEmbedder(BaseEmbedder):
    """
    Voyage AI embeddings
    
    Models:
    - voyage-2: 1024D, general purpose
    - voyage-code-2: 1536D, code-optimized
    - voyage-large-2: 1536D, best quality
    """
    
    def __init__(self, api_key: str, model: str = "voyage-2", **kwargs):
        """
        Initialize Voyage embedder
        
        Args:
            api_key: Voyage AI API key
            model: Model name
        """
        super().__init__(api_key=api_key, model=model, **kwargs)
        
        try:
            import voyageai
            
            self.client = voyageai.Client(api_key=api_key)
            self.model = model
            
            # Set dimensions based on model
            self.dimensions = {
                'voyage-2': 1024,
                'voyage-code-2': 1536,
                'voyage-large-2': 1536,
                'voyage-lite-02-instruct': 1024
            }.get(model, 1024)
            
            print(f"✅ Initialized Voyage AI embedder: {model}")
            
        except Exception as e:
            raise Exception(f"Failed to initialize Voyage AI: {str(e)}")
    
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
            result = self.client.embed(
                texts=[text],
                model=self.model,
                input_type="document"
            )
            
            return result.embeddings[0]
            
        except Exception as e:
            raise Exception(f"Voyage embedding failed: {str(e)}")
    
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
            # Voyage supports batch embeddings (up to 128 texts)
            if len(texts) <= 128:
                result = self.client.embed(
                    texts=texts,
                    model=self.model,
                    input_type="document"
                )
                return result.embeddings
            else:
                # Process in batches of 128
                all_embeddings = []
                for i in range(0, len(texts), 128):
                    batch = texts[i:i+128]
                    result = self.client.embed(
                        texts=batch,
                        model=self.model,
                        input_type="document"
                    )
                    all_embeddings.extend(result.embeddings)
                return all_embeddings
                
        except Exception as e:
            raise Exception(f"Voyage batch embedding failed: {str(e)}")
    
    def get_dimension(self) -> int:
        """Return embedding dimension"""
        return self.dimensions
    
    def get_name(self) -> str:
        """Return embedder name"""
        return f"voyage_{self.model.replace('-', '_')}"
    
    def get_description(self) -> str:
        """Return embedder description"""
        return f"Voyage AI {self.model} embeddings ({self.dimensions}D)"
