"""
Anthropic Claude LLM Implementation
Claude 3 family models
"""
from .base_llm import BaseLLM
from typing import List, Dict, Optional

class AnthropicLLM(BaseLLM):
    """
    Anthropic Claude LLM implementation
    Supports Claude 3 Opus, Sonnet, Haiku
    """
    
    def __init__(
        self,
        api_key: str,
        model: str = "claude-3-sonnet-20240229",
        **kwargs
    ):
        """
        Initialize Anthropic LLM
        
        Args:
            api_key: Anthropic API key
            model: Model name
        """
        super().__init__(model=model, **kwargs)
        
        from anthropic import Anthropic
        
        self.client = Anthropic(api_key=api_key)
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
            messages = [{"role": "user", "content": prompt}]
            
            create_params = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            
            if system_prompt:
                create_params["system"] = system_prompt
            
            response = self.client.messages.create(**create_params, **kwargs)
            
            return response.content[0].text
            
        except Exception as e:
            raise Exception(f"Anthropic generation failed: {str(e)}")
    
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
            
            # Extract system message if present
            system_prompt = None
            chat_messages = []
            
            for msg in messages:
                if msg['role'] == 'system':
                    system_prompt = msg['content']
                else:
                    chat_messages.append(msg)
            
            create_params = {
                "model": self.model,
                "messages": chat_messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            
            if system_prompt:
                create_params["system"] = system_prompt
            
            response = self.client.messages.create(**create_params, **kwargs)
            
            return response.content[0].text
            
        except Exception as e:
            raise Exception(f"Anthropic chat generation failed: {str(e)}")
    
    def get_name(self) -> str:
        """Get LLM name"""
        return f"anthropic_{self.model.replace('-', '_')}"
    
    def get_description(self) -> str:
        """Get LLM description"""
        return f"Anthropic Claude ({self.model})"
    
    def get_model(self) -> str:
        """Get model identifier"""
        return self.model
