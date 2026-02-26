from __future__ import annotations
from abc import ABC, abstractmethod
from typing import List


class BaseEmbedder(ABC):
    provider: str

    @abstractmethod
    def embed(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError
