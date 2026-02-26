from __future__ import annotations
from abc import ABC, abstractmethod
from typing import List


class BaseChunker(ABC):
    strategy: str

    @abstractmethod
    def chunk(self, text: str) -> List[str]:
        raise NotImplementedError
