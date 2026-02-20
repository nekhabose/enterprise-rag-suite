"""
HuggingFace Embeddings Implementation
Direct access to HuggingFace transformer models
"""
from typing import List
import torch
from .base_embedder import BaseEmbedder

class HuggingFaceEmbedder(BaseEmbedder):
    """
    HuggingFace transformer embeddings
    
    Can use any model from HuggingFace Hub that supports feature extraction
    Examples:
    - bert-base-uncased: 768D
    - roberta-base: 768D
    - microsoft/codebert-base: 768D (code)
    - sentence-transformers/...: Various dimensions
    """
    
    def __init__(self, model_name: str = "bert-base-uncased", **kwargs):
        """
        Initialize HuggingFace embedder
        
        Args:
            model_name: HuggingFace model identifier
        """
        super().__init__(model_name=model_name, **kwargs)
        
        try:
            from transformers import AutoTokenizer, AutoModel
            
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModel.from_pretrained(model_name)
            self.model_name = model_name
            
            # Set device
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model = self.model.to(self.device)
            self.model.eval()  # Set to evaluation mode
            
            print(f"✅ Loaded HuggingFace model: {model_name} on {self.device}")
            
        except Exception as e:
            raise Exception(f"Failed to load HuggingFace model {model_name}: {str(e)}")
    
    def _mean_pooling(self, model_output, attention_mask):
        """Apply mean pooling to get sentence embedding"""
        token_embeddings = model_output[0]
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
    
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
            # Tokenize
            encoded = self.tokenizer(
                text,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors='pt'
            )
            
            # Move to device
            encoded = {k: v.to(self.device) for k, v in encoded.items()}
            
            # Get embeddings
            with torch.no_grad():
                model_output = self.model(**encoded)
            
            # Mean pooling
            embedding = self._mean_pooling(model_output, encoded['attention_mask'])
            
            # Normalize
            embedding = torch.nn.functional.normalize(embedding, p=2, dim=1)
            
            return embedding[0].cpu().numpy().tolist()
            
        except Exception as e:
            raise Exception(f"HuggingFace embedding failed: {str(e)}")
    
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
            # Tokenize batch
            encoded = self.tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors='pt'
            )
            
            # Move to device
            encoded = {k: v.to(self.device) for k, v in encoded.items()}
            
            # Get embeddings
            with torch.no_grad():
                model_output = self.model(**encoded)
            
            # Mean pooling
            embeddings = self._mean_pooling(model_output, encoded['attention_mask'])
            
            # Normalize
            embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
            
            return embeddings.cpu().numpy().tolist()
            
        except Exception as e:
            raise Exception(f"HuggingFace batch embedding failed: {str(e)}")
    
    def get_dimension(self) -> int:
        """Return embedding dimension"""
        return self.model.config.hidden_size
    
    def get_name(self) -> str:
        """Return embedder name"""
        return f"huggingface_{self.model_name.replace('-', '_').replace('/', '_')}"
    
    def get_description(self) -> str:
        """Return embedder description"""
        dim = self.get_dimension()
        return f"HuggingFace {self.model_name} ({dim}D)"
