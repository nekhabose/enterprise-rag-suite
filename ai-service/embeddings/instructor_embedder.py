"""
Instructor Embeddings Implementation
Instruction-following embeddings for domain-specific tasks
"""
from typing import List
from .base_embedder import BaseEmbedder

class InstructorEmbedder(BaseEmbedder):
    """
    Instructor embeddings - instruction-based embeddings
    
    Models:
    - hkunlp/instructor-base: 768D
    - hkunlp/instructor-large: 768D
    - hkunlp/instructor-xl: 768D
    
    Allows custom instructions for domain-specific embeddings
    """
    
    def __init__(self, model_name: str = "hkunlp/instructor-base", instruction: str = None, **kwargs):
        """
        Initialize Instructor embedder
        
        Args:
            model_name: Instructor model name
            instruction: Custom instruction for embeddings (optional)
        """
        super().__init__(model_name=model_name, instruction=instruction, **kwargs)
        
        try:
            from InstructorEmbedding import INSTRUCTOR
            
            self.model = INSTRUCTOR(model_name)
            self.model_name = model_name
            self.instruction = instruction or "Represent the document for retrieval:"
            
            print(f"✅ Loaded Instructor model: {model_name}")
            
        except Exception as e:
            raise Exception(f"Failed to load Instructor model {model_name}: {str(e)}")
    
    def embed(self, text: str) -> List[float]:
        """
        Embed single text with instruction
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector
        """
        self.validate_text(text)
        
        try:
            # Format: [instruction, text]
            embedding = self.model.encode([[self.instruction, text]])
            return embedding[0].tolist()
            
        except Exception as e:
            raise Exception(f"Instructor embedding failed: {str(e)}")
    
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
            # Format: [[instruction, text], [instruction, text], ...]
            instruction_texts = [[self.instruction, text] for text in texts]
            embeddings = self.model.encode(instruction_texts)
            return [emb.tolist() for emb in embeddings]
            
        except Exception as e:
            raise Exception(f"Instructor batch embedding failed: {str(e)}")
    
    def get_dimension(self) -> int:
        """Return embedding dimension"""
        return 768  # All instructor models use 768D
    
    def get_name(self) -> str:
        """Return embedder name"""
        return f"instructor_{self.model_name.replace('/', '_').replace('-', '_')}"
    
    def get_description(self) -> str:
        """Return embedder description"""
        return f"Instructor {self.model_name} with instruction-following (768D)"
    
    def set_instruction(self, instruction: str):
        """
        Update the instruction for embeddings
        
        Args:
            instruction: New instruction
        """
        self.instruction = instruction
