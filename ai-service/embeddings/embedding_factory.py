"""
Embedding Factory
Centralized factory for creating different embedding providers
"""
from typing import Dict, Any, Optional
from .base_embedder import BaseEmbedder

class EmbeddingFactory:
    """Factory for creating embedding providers"""
    
    # Registry of available embedders
    _embedders = {}
    _initialized_clients = {}
    
    @classmethod
    def register(cls, name: str, embedder_class):
        """
        Register a new embedder
        
        Args:
            name: Embedder identifier
            embedder_class: Embedder class
        """
        cls._embedders[name] = embedder_class
    
    @classmethod
    def set_client(cls, name: str, client: Any):
        """
        Store initialized client (e.g., OpenAI, Cohere)
        
        Args:
            name: Client name
            client: Client instance
        """
        cls._initialized_clients[name] = client
    
    @classmethod
    def create(
        cls,
        provider: str,
        model: Optional[str] = None,
        **kwargs
    ) -> BaseEmbedder:
        """
        Create embedder instance
        
        Args:
            provider: Provider name (openai, sentence_transformer, cohere, etc.)
            model: Specific model name (optional)
            **kwargs: Additional parameters
            
        Returns:
            Embedder instance
            
        Examples:
            >>> embedder = EmbeddingFactory.create('openai', model='text-embedding-3-small')
            >>> embedder = EmbeddingFactory.create('sentence_transformer', model='all-MiniLM-L6-v2')
            >>> embedder = EmbeddingFactory.create('cohere', model='embed-english-v3.0', api_key='...')
        """
        provider_lower = provider.lower()
        
        # OpenAI
        if provider_lower in ['openai', 'openai_embeddings']:
            from .openai_embedder import OpenAIEmbedder
            
            client = cls._initialized_clients.get('openai')
            if not client:
                raise ValueError("OpenAI client not initialized. Call set_client('openai', client) first.")
            
            model = model or 'text-embedding-3-small'
            return OpenAIEmbedder(client, model=model, **kwargs)
        
        # Sentence Transformers
        elif provider_lower in ['sentence_transformer', 'sentence_transformers', 'sbert']:
            from .sentence_transformer_embedder import SentenceTransformerEmbedder
            
            model = model or 'all-MiniLM-L6-v2'
            return SentenceTransformerEmbedder(model_name=model, **kwargs)
        
        # Cohere
        elif provider_lower == 'cohere':
            from .cohere_embedder import CohereEmbedder
            
            api_key = kwargs.pop('api_key', None)
            if not api_key:
                # Try to get from initialized clients
                client = cls._initialized_clients.get('cohere')
                if client:
                    api_key = getattr(client, 'api_key', None)
            
            if not api_key:
                raise ValueError("Cohere API key required. Pass api_key parameter.")
            
            model = model or 'embed-english-v3.0'
            return CohereEmbedder(api_key=api_key, model=model, **kwargs)
        
        # HuggingFace
        elif provider_lower in ['huggingface', 'hf', 'transformers']:
            from .huggingface_embedder import HuggingFaceEmbedder
            
            model = model or 'bert-base-uncased'
            return HuggingFaceEmbedder(model_name=model, **kwargs)
        
        # Instructor
        elif provider_lower == 'instructor':
            from .instructor_embedder import InstructorEmbedder
            
            model = model or 'hkunlp/instructor-base'
            return InstructorEmbedder(model_name=model, **kwargs)
        
        # Voyage AI
        elif provider_lower == 'voyage':
            from .voyage_embedder import VoyageEmbedder
            
            api_key = kwargs.pop('api_key', None)
            if not api_key:
                client = cls._initialized_clients.get('voyage')
                if client:
                    api_key = getattr(client, 'api_key', None)
            
            if not api_key:
                raise ValueError("Voyage AI API key required. Pass api_key parameter.")
            
            model = model or 'voyage-2'
            return VoyageEmbedder(api_key=api_key, model=model, **kwargs)
        
        # Custom registered embedders
        elif provider_lower in cls._embedders:
            embedder_class = cls._embedders[provider_lower]
            return embedder_class(**kwargs)
        
        else:
            available = ['openai', 'sentence_transformer', 'cohere', 'huggingface', 'instructor', 'voyage']
            available.extend(cls._embedders.keys())
            raise ValueError(
                f"Unknown embedding provider: {provider}. "
                f"Available providers: {', '.join(available)}"
            )
    
    @classmethod
    def list_providers(cls) -> Dict[str, Dict[str, Any]]:
        """
        List all available embedding providers
        
        Returns:
            Dict mapping provider names to their info
        """
        providers = {
            'openai': {
                'name': 'OpenAI',
                'models': ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
                'dimensions': [1536, 3072, 1536],
                'requires_api_key': True,
                'description': 'OpenAI text embeddings - high quality, API-based'
            },
            'sentence_transformer': {
                'name': 'Sentence Transformers',
                'models': ['all-MiniLM-L6-v2', 'all-mpnet-base-v2', 'multi-qa-mpnet-base-dot-v1'],
                'dimensions': [384, 768, 768],
                'requires_api_key': False,
                'description': 'Local transformer models - fast, no API costs'
            },
            'cohere': {
                'name': 'Cohere',
                'models': ['embed-english-v3.0', 'embed-english-light-v3.0', 'embed-multilingual-v3.0'],
                'dimensions': [1024, 384, 1024],
                'requires_api_key': True,
                'description': 'Cohere embeddings - multilingual support'
            },
            'huggingface': {
                'name': 'HuggingFace Transformers',
                'models': ['bert-base-uncased', 'roberta-base', 'microsoft/codebert-base'],
                'dimensions': [768, 768, 768],
                'requires_api_key': False,
                'description': 'Any HuggingFace transformer model'
            },
            'instructor': {
                'name': 'Instructor',
                'models': ['hkunlp/instructor-base', 'hkunlp/instructor-large', 'hkunlp/instructor-xl'],
                'dimensions': [768, 768, 768],
                'requires_api_key': False,
                'description': 'Instruction-following embeddings for domain-specific tasks'
            },
            'voyage': {
                'name': 'Voyage AI',
                'models': ['voyage-2', 'voyage-code-2', 'voyage-large-2'],
                'dimensions': [1024, 1536, 1536],
                'requires_api_key': True,
                'description': 'Voyage AI embeddings - high quality, optimized for retrieval'
            }
        }
        
        # Add custom registered embedders
        for name in cls._embedders.keys():
            if name not in providers:
                providers[name] = {
                    'name': name,
                    'models': ['custom'],
                    'dimensions': ['varies'],
                    'requires_api_key': False,
                    'description': 'Custom registered embedder'
                }
        
        return providers
    
    @classmethod
    def get_recommended_model(cls, use_case: str) -> Dict[str, str]:
        """
        Get recommended model for specific use case
        
        Args:
            use_case: Use case identifier
            
        Returns:
            Dict with provider and model recommendation
        """
        recommendations = {
            'general': {
                'provider': 'sentence_transformer',
                'model': 'all-mpnet-base-v2',
                'reason': 'Good balance of quality and speed, no API costs'
            },
            'fast': {
                'provider': 'sentence_transformer',
                'model': 'all-MiniLM-L6-v2',
                'reason': 'Very fast, small model, good for large datasets'
            },
            'quality': {
                'provider': 'openai',
                'model': 'text-embedding-3-large',
                'reason': 'Highest quality, best for production'
            },
            'multilingual': {
                'provider': 'cohere',
                'model': 'embed-multilingual-v3.0',
                'reason': 'Supports 100+ languages'
            },
            'code': {
                'provider': 'voyage',
                'model': 'voyage-code-2',
                'reason': 'Optimized for code and technical content'
            },
            'qa': {
                'provider': 'sentence_transformer',
                'model': 'multi-qa-mpnet-base-dot-v1',
                'reason': 'Optimized for question-answering'
            },
            'domain_specific': {
                'provider': 'instructor',
                'model': 'hkunlp/instructor-large',
                'reason': 'Can use custom instructions for specific domains'
            }
        }
        
        return recommendations.get(
            use_case,
            recommendations['general']
        )


# Global factory instance
embedding_factory = EmbeddingFactory()
