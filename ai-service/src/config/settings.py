"""Runtime settings for pluggable RAG components."""
from dataclasses import dataclass
import os


@dataclass(frozen=True)
class RAGSettings:
    chunking_strategy: str = os.getenv("RAG_CHUNKING_STRATEGY", "semantic")
    retrieval_strategy: str = os.getenv("RAG_RETRIEVAL_STRATEGY", "hybrid")
    llm_provider: str = os.getenv("RAG_LLM_PROVIDER", "groq")
    vector_store: str = os.getenv("RAG_VECTOR_STORE", "postgres")
    embedding_provider: str = os.getenv("RAG_EMBEDDING_PROVIDER", "sentence_transformer")


settings = RAGSettings()
