"""
Groq LLM Implementation
Fast inference with Llama, Mixtral, etc.
"""
from .base_llm import BaseLLM
from typing import List, Dict, Optional

class GroqLLM(BaseLLM):
    """
    Groq LLM implementation
    Supports Llama 3, Mixtral, and other models
    """
    
    def __init__(
        self,
        client,
        model: str = "llama-3.3-70b-versatile",
        **kwargs
    ):
        """
        Initialize Groq LLM
        
        Args:
            client: Groq client instance
            model: Model name
        """
        super().__init__(model=model, **kwargs)
        self.client = client
        self.model = model
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> str:
        """Generate text completion"""
        try:
            messages = []
            
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            
            messages.append({"role": "user", "content": prompt})
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            raise Exception(f"Groq generation failed: {str(e)}")
    
    def generate_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> str:
        """Generate chat completion"""
        try:
            self.validate_messages(messages)
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            raise Exception(f"Groq chat generation failed: {str(e)}")
    
    def get_name(self) -> str:
        """Get LLM name"""
        return f"groq_{self.model.replace('-', '_').replace('.', '_')}"
    
    def get_description(self) -> str:
        """Get LLM description"""
        return f"Groq {self.model}"
    
    def get_model(self) -> str:
        """Get model identifier"""
        return self.model
