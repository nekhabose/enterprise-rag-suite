"""
Base LLM Interface
All LLM implementations must implement this interface
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class BaseLLM(ABC):
    """Abstract base class for all LLM implementations"""
    
    def __init__(self, **kwargs):
        """
        Initialize LLM with configuration
        
        Args:
            **kwargs: Model-specific parameters
        """
        self.config = kwargs
    
    @abstractmethod
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> str:
        """
        Generate text completion
        
        Args:
            prompt: Input prompt
            system_prompt: Optional system prompt
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters
            
        Returns:
            Generated text
        """
        pass
    
    @abstractmethod
    def generate_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> str:
        """
        Generate chat completion
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters
            
        Returns:
            Generated text
        """
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """Return the name of this LLM"""
        pass
    
    @abstractmethod
    def get_description(self) -> str:
        """Return a description of this LLM"""
        pass
    
    @abstractmethod
    def get_model(self) -> str:
        """Return the model identifier"""
        pass
    
    def get_config(self) -> Dict[str, Any]:
        """Return current configuration"""
        return self.config.copy()
    
    def validate_messages(self, messages: List[Dict[str, str]]) -> None:
        """Validate message format"""
        for msg in messages:
            if 'role' not in msg or 'content' not in msg:
                raise ValueError("Each message must have 'role' and 'content'")
            if msg['role'] not in ['system', 'user', 'assistant']:
                raise ValueError(f"Invalid role: {msg['role']}")
