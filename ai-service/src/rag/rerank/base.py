from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Dict, List


class BaseReranker(ABC):
    @abstractmethod
    def rerank(self, items: List[Dict]) -> List[Dict]:
        raise NotImplementedError
