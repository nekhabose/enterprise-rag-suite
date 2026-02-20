"""
Cohere LLM Implementation
Cohere Command models
"""
from .base_llm import BaseLLM
from typing import List, Dict, Optional

class CohereLLM(BaseLLM):
    """
    Cohere LLM implementation
    Supports Command, Command-light, Command-R
    """
    
    def __init__(
        self,
        api_key: str,
        model: str = "command",
        **kwargs
    ):
        """
        Initialize Cohere LLM
        
        Args:
            api_key: Cohere API key
            model: Model name
        """
        super().__init__(model=model, **kwargs)
        
        import cohere
        
        self.client = cohere.Client(api_key)
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
            # Combine system prompt with user prompt
            full_prompt = prompt
            if system_prompt:
                full_prompt = f"{system_prompt}\n\n{prompt}"
            
            response = self.client.generate(
                model=self.model,
                prompt=full_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )
            
            return response.generations[0].text
            
        except Exception as e:
            raise Exception(f"Cohere generation failed: {str(e)}")
    
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
            
            # Convert messages to chat history
            chat_history = []
            message = ""
            
            for msg in messages:
                if msg['role'] == 'user':
                    message = msg['content']
                elif msg['role'] == 'assistant':
                    chat_history.append({
                        "role": "CHATBOT",
                        "message": msg['content']
                    })
            
            response = self.client.chat(
                model=self.model,
                message=message,
                chat_history=chat_history if chat_history else None,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )
            
            return response.text
            
        except Exception as e:
            raise Exception(f"Cohere chat generation failed: {str(e)}")
    
    def get_name(self) -> str:
        """Get LLM name"""
        return f"cohere_{self.model.replace('-', '_')}"
    
    def get_description(self) -> str:
        """Get LLM description"""
        return f"Cohere {self.model}"
    
    def get_model(self) -> str:
        """Get model identifier"""
        return self.model
