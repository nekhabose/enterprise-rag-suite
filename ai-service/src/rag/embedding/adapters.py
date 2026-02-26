from __future__ import annotations
from typing import List

from .base import BaseEmbedder
from embeddings.embedding_factory import EmbeddingFactory


class FactoryEmbedder(BaseEmbedder):
    def __init__(self, provider: str, model: str | None = None):
        self.provider = provider
        self._impl = EmbeddingFactory.create(provider, model=model)

    def embed(self, texts: List[str]) -> List[List[float]]:
        return self._impl.embed(texts)
