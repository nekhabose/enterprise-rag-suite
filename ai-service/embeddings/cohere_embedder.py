"""
Cohere Embeddings Implementation
Uses Cohere's embedding API
"""
from typing import List
from .base_embedder import BaseEmbedder

class CohereEmbedder(BaseEmbedder):
    """
    Cohere embeddings
    
    Models:
    - embed-english-v3.0: 1024D, best quality
    - embed-english-light-v3.0: 384D, faster
    - embed-multilingual-v3.0: 1024D, multilingual
    """
    
    def __init__(self, api_key: str, model: str = "embed-english-v3.0", **kwargs):
        """
        Initialize Cohere embedder
        
        Args:
            api_key: Cohere API key
            model: Model name
        """
        super().__init__(api_key=api_key, model=model, **kwargs)
        
        try:
            import cohere
            self.client = cohere.Client(api_key)
            self.model = model
            
            # Set dimensions based on model
            self.dimensions = {
                'embed-english-v3.0': 1024,
                'embed-english-light-v3.0': 384,
                'embed-multilingual-v3.0': 1024,
                'embed-english-v2.0': 4096,
            }.get(model, 1024)
            
            print(f"✅ Initialized Cohere embedder: {model}")
            
        except Exception as e:
            raise Exception(f"Failed to initialize Cohere: {str(e)}")
    
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
            response = self.client.embed(
                texts=[text],
                model=self.model,
                input_type="search_document"
            )
            
            return response.embeddings[0]
            
        except Exception as e:
            raise Exception(f"Cohere embedding failed: {str(e)}")
    
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
            # Cohere supports batch up to 96 texts
            if len(texts) <= 96:
                response = self.client.embed(
                    texts=texts,
                    model=self.model,
                    input_type="search_document"
                )
                return response.embeddings
            else:
                # Process in batches of 96
                all_embeddings = []
                for i in range(0, len(texts), 96):
                    batch = texts[i:i+96]
                    response = self.client.embed(
                        texts=batch,
                        model=self.model,
                        input_type="search_document"
                    )
                    all_embeddings.extend(response.embeddings)
                return all_embeddings
                
        except Exception as e:
            raise Exception(f"Cohere batch embedding failed: {str(e)}")
    
    def get_dimension(self) -> int:
        """Return embedding dimension"""
        return self.dimensions
    
    def get_name(self) -> str:
        """Return embedder name"""
        return f"cohere_{self.model.replace('-', '_')}"
    
    def get_description(self) -> str:
        """Return embedder description"""
        return f"Cohere {self.model} embeddings ({self.dimensions}D)"
