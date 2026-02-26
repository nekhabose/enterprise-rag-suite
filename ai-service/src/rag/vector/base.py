from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseVectorStore(ABC):
    name: str

    @abstractmethod
    def upsert(self, tenant_id: int, documents: List[Dict[str, Any]]) -> None:
        raise NotImplementedError

    @abstractmethod
    def search(self, tenant_id: int, query_vector: List[float], top_k: int = 5) -> List[Dict[str, Any]]:
        raise NotImplementedError
