"""
Together AI LLM Implementation
Fast inference for open-source models
"""
from .base_llm import BaseLLM
from typing import List, Dict, Optional

class TogetherLLM(BaseLLM):
    """
    Together AI LLM implementation
    Supports many open-source models
    """
    
    def __init__(
        self,
        api_key: str,
        model: str = "mistralai/Mixtral-8x7B-Instruct-v0.1",
        **kwargs
    ):
        """
        Initialize Together AI LLM
        
        Args:
            api_key: Together AI API key
            model: Model name
        """
        super().__init__(model=model, **kwargs)
        
        from together import Together
        
        self.client = Together(api_key=api_key)
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
            raise Exception(f"Together AI generation failed: {str(e)}")
    
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
            raise Exception(f"Together AI chat generation failed: {str(e)}")
    
    def get_name(self) -> str:
        """Get LLM name"""
        model_short = self.model.split('/')[-1].replace('-', '_').replace('.', '_')
        return f"together_{model_short}"
    
    def get_description(self) -> str:
        """Get LLM description"""
        return f"Together AI ({self.model})"
    
    def get_model(self) -> str:
        """Get model identifier"""
        return self.model
