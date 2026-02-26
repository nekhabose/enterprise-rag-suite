from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Dict, List


class BaseRetriever(ABC):
    mode: str

    @abstractmethod
    def retrieve(self, tenant_id: int, query: str, top_k: int = 5) -> List[Dict]:
        raise NotImplementedError
