"""
LLM Factory
Create LLM instances based on provider name
"""
from typing import Dict, Any, Optional
from .base_llm import BaseLLM

class LLMFactory:
    """Factory for creating LLM instances"""
    
    _llms: Dict[str, type] = {}
    
    @classmethod
    def register(cls, name: str, llm_class: type):
        """
        Register a new LLM
        
        Args:
            name: LLM name
            llm_class: LLM class
        """
        cls._llms[name] = llm_class
    
    @classmethod
    def create(
        cls,
        provider: str,
        openai_client=None,
        groq_client=None,
        anthropic_api_key: Optional[str] = None,
        google_api_key: Optional[str] = None,
        cohere_api_key: Optional[str] = None,
        together_api_key: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> BaseLLM:
        """
        Create LLM instance
        
        Args:
            provider: LLM provider name
            openai_client: OpenAI client (if using OpenAI)
            groq_client: Groq client (if using Groq)
            anthropic_api_key: Anthropic API key (if using Claude)
            google_api_key: Google API key (if using Gemini)
            cohere_api_key: Cohere API key (if using Cohere)
            together_api_key: Together AI API key (if using Together)
            model: Specific model name (optional)
            **kwargs: Additional parameters
            
        Returns:
            BaseLLM instance
        """
        from .openai_llm import OpenAILLM
        from .groq_llm import GroqLLM
        from .anthropic_llm import AnthropicLLM
        from .gemini_llm import GeminiLLM
        from .together_llm import TogetherLLM
        from .cohere_llm import CohereLLM

        provider = provider.strip()
        if provider.startswith(("gpt-", "o1", "o3", "o4")):
            model = model or provider
            provider = "openai"
        elif provider == "openai" and model is None:
            model = "gpt-4o-mini"
        
        # LLM mapping with default models
        llms = {
            # OpenAI
            "openai": lambda **kw: OpenAILLM(
                client=openai_client,
                model=model or "gpt-4o-mini",
                **kw
            ),
            "gpt-3.5": lambda **kw: OpenAILLM(
                client=openai_client,
                model="gpt-3.5-turbo",
                **kw
            ),
            "gpt-4": lambda **kw: OpenAILLM(
                client=openai_client,
                model="gpt-4",
                **kw
            ),
            "gpt-4-turbo": lambda **kw: OpenAILLM(
                client=openai_client,
                model="gpt-4-turbo-preview",
                **kw
            ),
            "gpt-4o": lambda **kw: OpenAILLM(
                client=openai_client,
                model="gpt-4o",
                **kw
            ),
            "gpt-4o-mini": lambda **kw: OpenAILLM(
                client=openai_client,
                model="gpt-4o-mini",
                **kw
            ),
            
            # Groq
            "groq": lambda **kw: GroqLLM(
                client=groq_client,
                model=model or "llama-3.3-70b-versatile",
                **kw
            ),
            "llama-3": lambda **kw: GroqLLM(
                client=groq_client,
                model="llama-3.3-70b-versatile",
                **kw
            ),
            "mixtral": lambda **kw: GroqLLM(
                client=groq_client,
                model="mixtral-8x7b-32768",
                **kw
            ),
            
            # Anthropic
            "anthropic": lambda **kw: AnthropicLLM(
                api_key=anthropic_api_key,
                model=model or "claude-3-5-sonnet-latest",
                **kw
            ),
            "claude": lambda **kw: AnthropicLLM(
                api_key=anthropic_api_key,
                model=model or "claude-3-5-sonnet-latest",
                **kw
            ),
            "claude-opus": lambda **kw: AnthropicLLM(
                api_key=anthropic_api_key,
                model="claude-3-opus-20240229",
                **kw
            ),
            "claude-sonnet": lambda **kw: AnthropicLLM(
                api_key=anthropic_api_key,
                model="claude-3-5-sonnet-latest",
                **kw
            ),
            "claude-haiku": lambda **kw: AnthropicLLM(
                api_key=anthropic_api_key,
                model="claude-3-haiku-20240307",
                **kw
            ),
            "claude-3.5": lambda **kw: AnthropicLLM(
                api_key=anthropic_api_key,
                model="claude-3-5-sonnet-latest",
                **kw
            ),
            "claude-3.5-sonnet": lambda **kw: AnthropicLLM(
                api_key=anthropic_api_key,
                model="claude-3-5-sonnet-latest",
                **kw
            ),
            
            # Google
            "gemini": lambda **kw: GeminiLLM(
                api_key=google_api_key,
                model=model or "gemini-pro",
                **kw
            ),
            "gemini-pro": lambda **kw: GeminiLLM(
                api_key=google_api_key,
                model="gemini-pro",
                **kw
            ),
            
            # Together AI
            "together": lambda **kw: TogetherLLM(
                api_key=together_api_key,
                model=model or "mistralai/Mixtral-8x7B-Instruct-v0.1",
                **kw
            ),
            
            # Cohere
            "cohere": lambda **kw: CohereLLM(
                api_key=cohere_api_key,
                model=model or "command",
                **kw
            ),
            "command": lambda **kw: CohereLLM(
                api_key=cohere_api_key,
                model="command",
                **kw
            ),
        }
        
        if provider not in llms:
            available = list(llms.keys())
            raise ValueError(
                f"Unknown LLM provider: '{provider}'. "
                f"Available providers: {', '.join(available)}"
            )
        
        llm_factory = llms[provider]
        
        # Create LLM with appropriate parameters
        try:
            if provider.startswith("openai") or provider.startswith("gpt"):
                if not openai_client:
                    raise ValueError("OpenAI client required")
                return llm_factory(**kwargs)
            
            elif provider.startswith("groq") or provider in ["llama-3", "mixtral"]:
                if not groq_client:
                    raise ValueError("Groq client required")
                return llm_factory(**kwargs)
            
            elif provider.startswith("anthropic") or provider.startswith("claude"):
                if not anthropic_api_key:
                    raise ValueError("Anthropic API key required")
                return llm_factory(**kwargs)
            
            elif provider.startswith("gemini"):
                if not google_api_key:
                    raise ValueError("Google API key required")
                return llm_factory(**kwargs)
            
            elif provider.startswith("together"):
                if not together_api_key:
                    raise ValueError("Together AI API key required")
                return llm_factory(**kwargs)
            
            elif provider.startswith("cohere") or provider == "command":
                if not cohere_api_key:
                    raise ValueError("Cohere API key required")
                return llm_factory(**kwargs)
            
            else:
                return llm_factory(**kwargs)
                
        except Exception as e:
            raise Exception(f"Failed to create LLM '{provider}': {str(e)}")
    
    @classmethod
    def list_providers(cls) -> Dict[str, str]:
        """
        List all available LLM providers
        
        Returns:
            Dict mapping provider names to descriptions
        """
        return {
            # OpenAI
            "openai": "OpenAI GPT-4o-mini (default)",
            "gpt-4o": "OpenAI GPT-4o",
            "gpt-4o-mini": "OpenAI GPT-4o-mini",
            "gpt-4.1": "OpenAI GPT-4.1",
            "gpt-4.1-mini": "OpenAI GPT-4.1-mini",
            "gpt-4.1-nano": "OpenAI GPT-4.1-nano",
            "gpt-5": "OpenAI GPT-5",
            "gpt-5-mini": "OpenAI GPT-5-mini",
            "gpt-5-nano": "OpenAI GPT-5-nano",
            "gpt-3.5": "OpenAI GPT-3.5-turbo",
            "gpt-4": "OpenAI GPT-4 (legacy alias)",
            "gpt-4-turbo": "OpenAI GPT-4 Turbo",
            
            # Groq
            "groq": "Groq Llama 3.3 70B (fast, default)",
            "llama-3": "Groq Llama 3.3 70B",
            "mixtral": "Groq Mixtral 8x7B",
            
            # Anthropic
            "anthropic": "Anthropic Claude 3.5 Sonnet (default)",
            "claude": "Anthropic Claude 3.5 Sonnet",
            "claude-3.5": "Anthropic Claude 3.5 Sonnet",
            "claude-3.5-sonnet": "Anthropic Claude 3.5 Sonnet",
            "claude-opus": "Anthropic Claude 3 Opus (most capable)",
            "claude-sonnet": "Anthropic Claude 3.5 Sonnet (balanced)",
            "claude-haiku": "Anthropic Claude 3 Haiku (fastest)",
            
            # Google
            "gemini": "Google Gemini Pro",
            "gemini-pro": "Google Gemini Pro",
            
            # Together AI
            "together": "Together AI Mixtral 8x7B",
            
            # Cohere
            "cohere": "Cohere Command",
            "command": "Cohere Command",
        }
    
    @classmethod
    def get_recommended(cls) -> Dict[str, str]:
        """
        Get recommended providers for different use cases
        
        Returns:
            Dict of use case to recommended provider
        """
        return {
            "speed": "groq",
            "quality": "claude-opus",
            "balanced": "claude-sonnet",
            "cost_effective": "groq",
            "coding": "gpt-4",
            "creative": "claude-opus",
            "fast_inference": "groq",
            "multilingual": "gemini-pro",
        }


# Initialize factory
def initialize_llm_factory():
    """Initialize factory with any custom LLMs"""
    pass

initialize_llm_factory()
