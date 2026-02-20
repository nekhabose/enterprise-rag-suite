"""
Google Gemini LLM Implementation
Gemini Pro and other Google models
"""
from .base_llm import BaseLLM
from typing import List, Dict, Optional

class GeminiLLM(BaseLLM):
    """
    Google Gemini LLM implementation
    Supports Gemini Pro, Gemini Pro Vision
    """
    
    def __init__(
        self,
        api_key: str,
        model: str = "gemini-pro",
        **kwargs
    ):
        """
        Initialize Gemini LLM
        
        Args:
            api_key: Google API key
            model: Model name
        """
        super().__init__(model=model, **kwargs)
        
        import google.generativeai as genai
        
        genai.configure(api_key=api_key)
        self.genai = genai
        self.model_name = model
        self.model = genai.GenerativeModel(model)
    
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
            
            generation_config = {
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            }
            
            response = self.model.generate_content(
                full_prompt,
                generation_config=generation_config
            )
            
            return response.text
            
        except Exception as e:
            raise Exception(f"Gemini generation failed: {str(e)}")
    
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
            
            # Start chat
            chat = self.model.start_chat(history=[])
            
            generation_config = {
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            }
            
            # Process messages
            for msg in messages:
                if msg['role'] == 'user':
                    response = chat.send_message(
                        msg['content'],
                        generation_config=generation_config
                    )
                elif msg['role'] == 'assistant':
                    # Add to history
                    pass
            
            return response.text
            
        except Exception as e:
            raise Exception(f"Gemini chat generation failed: {str(e)}")
    
    def get_name(self) -> str:
        """Get LLM name"""
        return f"gemini_{self.model_name.replace('-', '_')}"
    
    def get_description(self) -> str:
        """Get LLM description"""
        return f"Google Gemini ({self.model_name})"
    
    def get_model(self) -> str:
        """Get model identifier"""
        return self.model_name
