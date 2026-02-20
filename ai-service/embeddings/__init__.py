"""
Embeddings Module
Provides multiple embedding providers with factory pattern
"""
from .base_embedder import BaseEmbedder
from .embedding_factory import EmbeddingFactory, embedding_factory
from .openai_embedder import OpenAIEmbedder
from .sentence_transformer_embedder import SentenceTransformerEmbedder
from .cohere_embedder import CohereEmbedder
from .huggingface_embedder import HuggingFaceEmbedder
from .instructor_embedder import InstructorEmbedder
from .voyage_embedder import VoyageEmbedder

__all__ = [
    'BaseEmbedder',
    'EmbeddingFactory',
    'embedding_factory',
    'OpenAIEmbedder',
    'SentenceTransformerEmbedder',
    'CohereEmbedder',
    'HuggingFaceEmbedder',
    'InstructorEmbedder',
    'VoyageEmbedder',
]
