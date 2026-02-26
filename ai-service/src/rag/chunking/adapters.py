from __future__ import annotations
from typing import List

from .base import BaseChunker
from chunking.chunking_factory import ChunkingFactory


class FactoryChunker(BaseChunker):
    def __init__(self, strategy: str):
        self.strategy = strategy
        self._impl = ChunkingFactory.create(strategy)

    def chunk(self, text: str) -> List[str]:
        return [c.content for c in self._impl.chunk(text)]
